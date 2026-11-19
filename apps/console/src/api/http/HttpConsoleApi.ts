// ConsoleApi against the RangeOps API (apps/api). Every mapping between the API's shapes and the
// console's lives here, so the screens don't change when the source does (ADR 0020, ticket 11).
//
// Where the two models differ, the API wins: it is what the app sells against. See the comments on
// ticket 11 for each difference and what the console does about it.
import type { HandoverResult } from '../../domain/buckets';
import { isEmail, NEED_EMAIL, type CounterSale } from '../../domain/passes';
import { validateSetup } from '../../domain/setup';
import type {
  Bay,
  Booking,
  BucketSize,
  IsoDate,
  LocalDateTime,
  OpeningHours,
  Order,
  Pass,
  Payment,
  PeakWindow,
  RangeSetup,
  Result,
  Robot,
  RobotState,
  Weekday,
} from '../../domain/types';
import { BUCKET_SIZES } from '../../domain/types';
import type { ConsoleApi, ConsoleCapabilities } from '../ConsoleApi';
import type {
  ApiBooking,
  ApiBucketCode,
  ApiCounterSale,
  ApiCreditRedemption,
  ApiFleetRobot,
  ApiPassHolder,
  ApiRange,
  ApiStaffBay,
  ApiStaffOrder,
  ApiStaffPasses,
} from './apiTypes';

export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface HttpConsoleApiOptions {
  /** Where the API is, e.g. http://localhost:8787 */
  baseUrl: string;
  /** A session token from POST /auth/verify, for an account that is staff at the range. */
  token: string;
  /** The range's id or slug. */
  rangeId: string;
  fetch?: typeof fetch;
  /** Called when the API says the session is no longer valid. */
  onUnauthorized?: () => void;
}

const ROBOT_ADD_ON = /robot/i;

export class HttpConsoleApi implements ConsoleApi {
  readonly capabilities: ConsoleCapabilities = {
    // Counter sales and ball credit redemption (ADR 0021).
    sellPasses: true,
    redeemPasses: true,
    // Robot, bucket and pass prices have no endpoint to change them yet.
    editProducts: false,
    // The API makes each bay's check-in link itself, from its APP_URL.
    editPublicAppUrl: false,
  };

  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  /** The range as last read, for its time zone and to work out what a save changes. */
  private range: ApiRange | null = null;
  private bays: ApiStaffBay[] = [];

  constructor(private readonly options: HttpConsoleApiOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
  }

  // ---- Plumbing ----

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.options.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : undefined;
    if (!response.ok) {
      if (response.status === 401) this.options.onUnauthorized?.();
      const error = json?.error ?? { code: 'http_error', message: `The API answered ${response.status}.` };
      throw new ApiFailure(response.status, error.code, error.message);
    }
    return json as T;
  }

  private rangePath(rest = '') {
    return `/ranges/${encodeURIComponent(this.range?.id ?? this.options.rangeId)}${rest}`;
  }

  private async loadRange(): Promise<ApiRange> {
    const [range, bays] = await Promise.all([
      this.call<ApiRange>('GET', this.rangePath()),
      this.call<{ bays: ApiStaffBay[] }>('GET', this.rangePath('/bays')),
    ]);
    this.range = range;
    this.bays = bays.bays;
    return range;
  }

  private async knownRange(): Promise<ApiRange> {
    return this.range ?? this.loadRange();
  }

  private local(instant: string): LocalDateTime {
    return toZoned(instant, this.range!.timeZone);
  }

  // ---- Setup ----

  async getSetup(): Promise<RangeSetup> {
    const range = await this.loadRange();
    return setupFromApi(range, this.bays);
  }

  async saveSetup(next: RangeSetup): Promise<Result<RangeSetup>> {
    const errors = validateSetup(next);
    if (errors.length) return { ok: false, errors };
    const range = await this.loadRange();
    const before = setupFromApi(range, this.bays);
    const refusals = unsupportedChanges(before, next);
    if (refusals.length) return { ok: false, errors: refusals };

    try {
      const floor = next.prices.bands.standard.floor;
      const rangePatch = {
        name: next.range.name,
        offPeakCentsPerHour: next.prices.bands.standard.offPeak,
        peakCentsPerHour: next.prices.bands.standard.peak,
        floorCentsPerHour: floor,
      };
      // The API checks every price against the floor it holds at the time, so a lower floor goes
      // first and a higher one goes after the bays' own prices have moved up.
      const floorFirst = floor < range.prices.floorCentsPerHour;
      if (floorFirst) await this.call('PATCH', this.rangePath(), rangePatch);
      await this.saveBays(next);
      if (!floorFirst) await this.call('PATCH', this.rangePath(), rangePatch);

      if (JSON.stringify(next.openingHours) !== JSON.stringify(before.openingHours)) {
        await this.call('PUT', this.rangePath('/hours'), { openingHours: hoursToApi(next.openingHours) });
      }
      if (JSON.stringify(next.prices.peakWindows) !== JSON.stringify(before.prices.peakWindows)) {
        await this.call('PUT', this.rangePath('/peak-windows'), { peakWindows: peaksToApi(next.prices.peakWindows) });
      }
    } catch (error) {
      return refusal(error);
    }
    return { ok: true, value: await this.getSetup() };
  }

  /** Bays: a premium bay carries the premium band's prices as its own; a standard bay uses the range's. */
  private async saveBays(next: RangeSetup) {
    const premium = next.prices.bands.premium;
    for (const bay of next.bays) {
      const own = bay.band === 'premium' ? { offPeakCentsPerHour: premium.offPeak, peakCentsPerHour: premium.peak } : { offPeakCentsPerHour: null, peakCentsPerHour: null };
      const current = this.bays.find((b) => b.id === bay.id);
      if (!current) {
        await this.call('POST', this.rangePath('/bays'), { number: bay.number, name: bay.name, ...own });
        continue;
      }
      const patch: Record<string, unknown> = {};
      if (current.name !== bay.name) patch.name = bay.name;
      if (current.active !== bay.inService) patch.active = bay.inService;
      if (current.offPeakCentsPerHour !== own.offPeakCentsPerHour) patch.offPeakCentsPerHour = own.offPeakCentsPerHour;
      if (current.peakCentsPerHour !== own.peakCentsPerHour) patch.peakCentsPerHour = own.peakCentsPerHour;
      if (Object.keys(patch).length) await this.call('PATCH', `/bays/${bay.id}`, patch);
    }
  }

  // ---- Bookings ----

  async listBookings(date: IsoDate): Promise<Booking[]> {
    await this.knownRange();
    const { bookings } = await this.call<{ bookings: ApiBooking[] }>('GET', this.rangePath(`/bookings?date=${date}`));
    return bookings.map((b) => this.booking(b)).sort((a, b) => a.start - b.start);
  }

  async setBookingStatus(bookingId: string, status: 'checked-in' | 'cancelled'): Promise<Result<Booking>> {
    await this.knownRange();
    try {
      const path = status === 'checked-in' ? `/bookings/${bookingId}/check-in` : `/bookings/${bookingId}/cancel`;
      return { ok: true, value: this.booking(await this.call<ApiBooking>('POST', path)) };
    } catch (error) {
      return refusal(error);
    }
  }

  private booking(b: ApiBooking): Booking {
    const start = this.local(b.startsAt);
    return {
      id: b.id,
      date: start.slice(0, 10),
      bayId: b.bay.id,
      start: Number(start.slice(11, 13)),
      hours: b.hours,
      player: b.customerName ?? b.customerEmail ?? (b.source === 'external' ? b.externalRef ?? 'Other system' : 'App player'),
      // The API knows bookings made in the app and ones handed in from elsewhere (counter, phone,
      // another platform); the console calls the second kind "partner".
      source: b.source === 'rangeops' ? 'app' : 'partner',
      status: b.status === 'cancelled' ? 'cancelled' : b.checkedInAt ? 'checked-in' : 'booked',
      robotHire: b.addOns.some((a) => a.kind === 'robot'),
      amount: b.totalCents,
      paidAt: this.local(b.order?.paidAt ?? b.createdAt),
    };
  }

  // ---- Buckets ----

  async listOrders(date: IsoDate): Promise<Order[]> {
    const range = await this.knownRange();
    const { orders } = await this.call<{ orders: ApiStaffOrder[] }>('GET', this.rangePath(`/orders?date=${date}`));
    return orders
      .filter((o) => o.kind === 'bucket' && o.bucketCode)
      .map((o) => this.order(range, o.bucketCode!, o))
      .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }

  async handOverBucket(input: string): Promise<HandoverResult> {
    const range = await this.knownRange();
    const code = input.trim();
    if (!code) return { outcome: 'malformed', code };
    const path = this.rangePath(`/bucket-codes/${encodeURIComponent(code)}`);
    try {
      const redeemed = await this.call<ApiBucketCode>('POST', `${path}/redeem`);
      return { outcome: 'handed-over', order: await this.orderForCode(range, redeemed) };
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      if (error.code === 'already_redeemed') {
        const existing = await this.call<ApiBucketCode>('GET', path);
        return { outcome: 'already-handed-over', order: await this.orderForCode(range, existing) };
      }
      if (error.status === 404) return { outcome: 'not-found', code: code.toUpperCase() };
      if (error.status === 400) return { outcome: 'malformed', code: code.toUpperCase() };
      throw error;
    }
  }

  /** The order behind a code, from that day's orders, for what was paid. */
  private async orderForCode(range: ApiRange, code: ApiBucketCode): Promise<Order> {
    const date = this.local(code.createdAt).slice(0, 10);
    const { orders } = await this.call<{ orders: ApiStaffOrder[] }>('GET', this.rangePath(`/orders?date=${date}`));
    return this.order(range, code, orders.find((o) => o.id === code.orderId));
  }

  private order(range: ApiRange, code: ApiBucketCode, order?: ApiOrder): Order {
    return {
      id: order?.id ?? code.orderId,
      code: code.code,
      bucket: bucketSize(range, code.bucket.productId, code.bucket.balls),
      balls: code.bucket.balls,
      status: order?.status === 'refunded' ? 'refunded' : code.redeemedAt ? 'handed-over' : 'paid',
      source: 'app',
      amount: order?.totalCents ?? 0,
      paidAt: this.local(order?.paidAt ?? code.createdAt),
      handedOverAt: code.redeemedAt ? this.local(code.redeemedAt) : null,
      passId: order?.paymentProvider === 'ball_credit' ? 'ball-credit' : null,
    };
  }

  // ---- Passes ----

  async listPasses(): Promise<Pass[]> {
    await this.knownRange();
    const { passes, ballCredit } = await this.call<ApiStaffPasses>('GET', this.rangePath('/passes'));
    return [...passes.map((p) => this.monthlyPass(p)), ...ballCredit.map((c) => creditPass(c.account, c.balls))];
  }

  private monthlyPass(p: ApiStaffPasses['passes'][number]): Pass {
    return {
      id: p.id,
      accountId: p.account.id,
      player: p.account.name ?? p.account.email,
      email: p.account.email,
      kind: 'monthly',
      soldAt: this.local(p.createdAt),
      // validTo is the instant it stops working, so the last whole day is the minute before.
      validUntil: this.local(new Date(Date.parse(p.validTo) - 60_000).toISOString()).slice(0, 10),
      discountPercent: p.discountPercent,
      ballsLeft: 0,
    };
  }

  async sellPass(sale: CounterSale): Promise<Result<Pass>> {
    if (!isEmail(sale.email)) return { ok: false, errors: [NEED_EMAIL] };
    const range = await this.knownRange();
    const kind = sale.kind === 'monthly' ? 'monthly_pass' : 'ball_credit';
    const product = range.passProducts.find((p) => p.kind === kind && p.active);
    if (!product) return { ok: false, errors: [`This range has no ${sale.kind === 'monthly' ? 'monthly pass' : 'ball credit'} on sale.`] };
    try {
      const sold = await this.call<ApiCounterSale>('POST', this.rangePath('/counter/passes'), {
        email: sale.email.trim(),
        ...(sale.name?.trim() ? { name: sale.name.trim() } : {}),
        passProductId: product.id,
      });
      return { ok: true, value: sold.pass ? this.monthlyPass(sold.pass) : creditPass(sold.account, sold.ballCredit ?? 0) };
    } catch (error) {
      return refusal(error);
    }
  }

  async redeemBallCredit(passId: string, bucket: BucketSize): Promise<Result<{ pass: Pass; order: Order }>> {
    if (!passId.startsWith('credit-')) return { ok: false, errors: ['A monthly pass is a discount; it has no balls to hand out.'] };
    const range = await this.knownRange();
    const products = [...range.bucketProducts].filter((p) => p.active).sort((a, b) => a.balls - b.balls);
    const product = products[Math.min(BUCKET_SIZES.indexOf(bucket), products.length - 1)];
    if (!product) return { ok: false, errors: ['This range sells no buckets.'] };
    try {
      const done = await this.call<ApiCreditRedemption>('POST', this.rangePath('/counter/ball-credit/redeem'), {
        accountId: passId.slice('credit-'.length),
        bucketProductId: product.id,
      });
      const holder = (await this.listPasses()).find((p) => p.id === passId);
      const pass: Pass = holder
        ? { ...holder, ballsLeft: done.ballCredit }
        : { ...creditPass({ id: passId.slice('credit-'.length), email: '', name: null }, done.ballCredit), player: 'This player' };
      return { ok: true, value: { pass, order: this.order(range, done.bucketCode, { ...done.order, bucketCode: done.bucketCode }) } };
    } catch (error) {
      return refusal(error);
    }
  }

  // ---- Fleet ----

  async listRobots(): Promise<Robot[]> {
    const range = await this.knownRange();
    const fleet = await this.call<{ at: string; robots: ApiFleetRobot[] }>('GET', this.rangePath('/fleet'));
    const bayByNumber = new Map(range.bays.map((b) => [b.number, b.id]));
    return fleet.robots.map((r) => ({
      id: r.id,
      name: r.name,
      state: robotState(r),
      battery: r.status.batteryPct,
      ballsOnBoard: r.status.ballsOnBoard,
      hire: r.currentHire
        ? { bookingId: r.currentHire.bookingId, bayId: bayByNumber.get(r.currentHire.bayNumber) ?? `bay-${r.currentHire.bayNumber}`, until: this.local(r.currentHire.endsAt) }
        : null,
      lastSeen: this.local(r.status.lastSeenAt ?? fleet.at),
    }));
  }

  // ---- Takings ----

  /**
   * Payments come from the day's orders: a booking's robot line counts as robot hire and the rest as
   * the bay; a refund is a negative payment on the day it was refunded. The API lists orders by the
   * day they were made, so a refund today of an order from another day isn't counted yet.
   */
  async listPayments(date: IsoDate): Promise<Payment[]> {
    await this.knownRange();
    const { orders } = await this.call<{ orders: ApiStaffOrder[] }>('GET', this.rangePath(`/orders?date=${date}`));
    const payments: Payment[] = [];
    for (const order of orders) {
      if (!order.paidAt || (order.status !== 'paid' && order.status !== 'refunded')) continue;
      const parts = orderParts(order);
      const paidAt = this.local(order.paidAt);
      if (paidAt.slice(0, 10) === date) {
        for (const [kind, amount] of parts) if (amount) payments.push({ id: `${order.id}-${kind}`, at: paidAt, kind, amount, ref: order.id });
      }
      if (order.status === 'refunded' && order.refundedAt) {
        const refundedAt = this.local(order.refundedAt);
        if (refundedAt.slice(0, 10) === date) {
          for (const [kind, amount] of parts) if (amount) payments.push({ id: `${order.id}-${kind}-refund`, at: refundedAt, kind, amount: -amount, ref: order.id });
        }
      }
    }
    return payments.sort((a, b) => a.at.localeCompare(b.at));
  }
}

type ApiOrder = ApiStaffOrder;

/** Ball credit is one balance per account at the range, so its id is the account's. */
function creditPass(account: ApiPassHolder, balls: number): Pass {
  return {
    id: `credit-${account.id}`,
    accountId: account.id,
    player: account.name ?? account.email,
    email: account.email,
    kind: 'credits',
    soldAt: null,
    validUntil: null,
    discountPercent: 0,
    ballsLeft: balls,
  };
}

// ---- Mapping helpers, exported for tests ----

export function setupFromApi(range: ApiRange, bays: ApiStaffBay[]): RangeSetup {
  const floor = range.prices.floorCentsPerHour;
  const standard = { offPeak: range.prices.offPeakCentsPerHour, peak: range.prices.peakCentsPerHour, floor };
  const own = (b: ApiBay | ApiStaffBay) => b.offPeakCentsPerHour !== null || b.peakCentsPerHour !== null;
  const firstOwn = bays.find(own);
  const premium = firstOwn
    ? { offPeak: firstOwn.offPeakCentsPerHour ?? standard.offPeak, peak: firstOwn.peakCentsPerHour ?? standard.peak, floor }
    : { ...standard };

  const products = [...range.bucketProducts].filter((p) => p.active).sort((a, b) => a.balls - b.balls);
  const bySize = (i: number) => products[Math.min(i, products.length - 1)];
  const monthly = range.passProducts.find((p) => p.kind === 'monthly_pass' && p.active);
  const credit = range.passProducts.find((p) => p.kind === 'ball_credit' && p.active);
  const appUrl = bays[0]?.checkInUrl.replace(/check-in\/[^/]*$/, '') ?? '';

  return {
    range: { id: range.id, name: range.name, timezone: range.timeZone, currency: 'AUD', publicAppUrl: appUrl },
    bays: bays.map(
      (b): Bay => ({ id: b.id, number: b.number, name: b.name, band: own(b) ? 'premium' : 'standard', inService: b.active, checkInUrl: b.checkInUrl }),
    ),
    openingHours: hoursFromApi(range.openingHours),
    prices: {
      bands: { standard, premium },
      peakWindows: peaksFromApi(range.peakWindows),
      robotHirePerHour: range.addOns.find((a) => a.kind === 'robot')?.priceCents ?? 0,
      buckets: Object.fromEntries(BUCKET_SIZES.map((size, i) => [size, bySize(i)?.priceCents ?? 0])) as Record<BucketSize, number>,
      bucketBalls: Object.fromEntries(BUCKET_SIZES.map((size, i) => [size, bySize(i)?.balls ?? 0])) as Record<BucketSize, number>,
      monthlyPass: { price: monthly?.priceCents ?? 0, days: monthly?.days ?? 30, discountPercent: monthly?.discountPercent ?? 0 },
      creditPack: { price: credit?.priceCents ?? 0, balls: credit?.balls ?? 0 },
    },
  };
}

type ApiBay = ApiRange['bays'][number];

/** What the console's model can say that the API can't store yet. */
export function unsupportedChanges(before: RangeSetup, next: RangeSetup): string[] {
  const errors: string[] = [];
  const { standard, premium } = next.prices.bands;
  if (standard.floor !== premium.floor) errors.push('This range has one floor price for every bay. Set the same floor for both bands.');
  const products = (s: RangeSetup) =>
    JSON.stringify([s.prices.robotHirePerHour, s.prices.buckets, s.prices.monthlyPass, s.prices.creditPack]);
  if (products(before) !== products(next)) errors.push('Robot, bucket and pass prices are set in the backend and can’t be changed here yet.');
  if (before.range.publicAppUrl !== next.range.publicAppUrl) errors.push('The check-in link comes from the API’s APP_URL setting.');
  const removed = before.bays.filter((b) => !next.bays.some((n) => n.id === b.id));
  if (removed.length) errors.push('Bays can be taken out of service but not removed.');
  for (const bay of next.bays) {
    const old = before.bays.find((b) => b.id === bay.id);
    if (old && old.number !== bay.number) errors.push(`Bay numbers can't be changed (bay ${old.number}).`);
  }
  return errors;
}

export function hoursFromApi(hours: ApiRange['openingHours']): OpeningHours {
  const week: OpeningHours = [null, null, null, null, null, null, null];
  for (const h of hours) week[h.weekday] = { open: Math.ceil(minutes(h.opens) / 60), close: Math.floor(minutes(h.closes) / 60) };
  return week;
}

export function hoursToApi(hours: OpeningHours) {
  return hours.flatMap((h, weekday) => (h ? [{ weekday, opens: hhmm(h.open), closes: hhmm(h.close) }] : []));
}

/** The API keeps one window per weekday; the console groups days that share the same hours. */
export function peaksFromApi(windows: ApiRange['peakWindows']): PeakWindow[] {
  const groups = new Map<string, PeakWindow>();
  for (const w of windows) {
    const start = Math.floor(minutes(w.from) / 60);
    const end = Math.ceil(minutes(w.to) / 60);
    const key = `${start}-${end}`;
    const group = groups.get(key) ?? { days: [], start, end };
    group.days.push(w.weekday as Weekday);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({ ...g, days: [...g.days].sort() }));
}

export function peaksToApi(windows: PeakWindow[]) {
  return windows.flatMap((w) => w.days.map((weekday) => ({ weekday, from: hhmm(w.start), to: hhmm(w.end) })));
}

function bucketSize(range: ApiRange, productId: string, balls: number): BucketSize {
  const products = [...range.bucketProducts].sort((a, b) => a.balls - b.balls);
  let index = products.findIndex((p) => p.id === productId);
  if (index < 0) index = balls < 75 ? 0 : balls < 125 ? 1 : 2;
  return BUCKET_SIZES[Math.min(index, BUCKET_SIZES.length - 1)]!;
}

const STATES: Record<NonNullable<ApiFleetRobot['status']['state']>, RobotState> = {
  idle: 'idle',
  driving: 'driving',
  at_limit: 'at-limit',
  link_lost: 'link-lost',
  stopped_by_switch: 'stopped',
  fault: 'fault',
  low_battery: 'low-battery',
  locked: 'locked',
};

function robotState(r: ApiFleetRobot): RobotState {
  if (!r.inService) return 'stopped';
  if (r.status.state) {
    const state = STATES[r.status.state];
    // A robot reporting idle with no hire is back on the dock.
    return state === 'idle' && !r.currentHire ? 'docked' : state;
  }
  return r.currentHire ? 'idle' : 'docked';
}

/** An order's money by the console's payment kinds. */
export function orderParts(order: ApiOrder): [Payment['kind'], number][] {
  if (order.kind === 'bucket') return [['bucket', order.totalCents]];
  if (order.kind === 'pass' || order.kind === 'ball_credit') return [['pass', order.totalCents]];
  const robot = order.lines.filter((l) => ROBOT_ADD_ON.test(l.description)).reduce((sum, l) => sum + l.quantity * l.unitCents, 0);
  return [
    ['bay', order.totalCents - robot],
    ['robot', robot],
  ];
}

/** An instant as local date-time in a time zone. */
export function toZoned(instant: string, timeZone: string): LocalDateTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function minutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h! * 60 + m!;
}

function hhmm(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function refusal<T>(error: unknown): Result<T> {
  if (error instanceof ApiFailure) return { ok: false, errors: [error.message] };
  throw error;
}
