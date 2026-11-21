// The demo range the fake starts with: 20 bays, three robots, and a believable week of bookings,
// bucket orders and passes around "now". Seeded by date, so a day looks the same on every reload.
import { generateCode } from '../domain/buckets';
import { quoteBooking } from '../domain/pricing';
import { addDays, addMinutes, dateTimeAt, hourOf, toIsoDate, toLocalDateTime, weekdayOf } from '../domain/time';
import { BUCKET_BALLS } from '../domain/types';
import type {
  Bay,
  Booking,
  BucketSize,
  LocalDateTime,
  OpeningHours,
  Order,
  Pass,
  Payment,
  PriceList,
  RangeSetup,
  Robot,
  Source,
} from '../domain/types';
import type { FakeState } from './FakeConsoleApi';
import { pick, seededRandom } from './rng';

export const DEMO_BAY_COUNT = 20;

/** Codes that are always there, for demos and the smoke test. */
export const DEMO_CODES = { paid: 'PUTT42', handedOver: 'WEDG38', refunded: 'DRAW77' } as const;

const PLAYERS = [
  'The Nguyen family', 'Priya Shah', 'Tom & Mia Walker', 'The Kowalski kids', 'Hannah Lee', 'Ari Cohen',
  'The Fitzgeralds', 'Sam Okafor', 'Grace Tan', 'Lachlan Murray', 'The Rossi family', 'Jess Patel',
  'Oliver Brown', 'Mei Chen', 'The Andersons', 'Ruby Singh', 'Ethan Clarke', 'Zara Ahmed', 'Noah Kelly',
  'The Papadopoulos family', 'Isla Wright', 'Jack Thompson', 'Chloe Martin', 'Leo Garcia',
];

export function demoOpeningHours(): OpeningHours {
  const weekday = { open: 7, close: 22 };
  const weekend = { open: 6, close: 22 };
  return [weekend, weekday, weekday, weekday, weekday, weekday, weekend].map((h) => ({ ...h }));
}

export function demoPrices(): PriceList {
  return {
    bands: {
      standard: { offPeak: 2400, peak: 3200, floor: 1800 },
      premium: { offPeak: 3400, peak: 4400, floor: 2600 },
    },
    peakWindows: [
      { days: [1, 2, 3, 4, 5], start: 16, end: 21 },
      { days: [0, 6], start: 8, end: 12 },
    ],
    robotHirePerHour: 1500,
    buckets: { small: 800, medium: 1400, large: 1900 },
    bucketBalls: { ...BUCKET_BALLS },
    monthlyPass: { price: 4900, days: 30, discountPercent: 10 },
    creditPack: { price: 8000, balls: 500 },
  };
}

export function demoSetup(): RangeSetup {
  const bays: Bay[] = Array.from({ length: DEMO_BAY_COUNT }, (_, i) => ({
    id: `bay-${i + 1}`,
    number: i + 1,
    name: `Bay ${i + 1}`,
    band: i < 4 ? 'premium' : 'standard',
    inService: i + 1 !== 17,
  }));
  return {
    range: {
      id: 'demo-range',
      name: 'Harbourside Range',
      timezone: 'Australia/Sydney',
      currency: 'AUD',
      // Placeholder until the RangeOps domain is chosen (decision 7 in docs/PLAN.md).
      publicAppUrl: 'https://rangeops.example/app/',
    },
    bays,
    openingHours: demoOpeningHours(),
    prices: demoPrices(),
  };
}

export function seedDemoRange(nowDate: Date): FakeState {
  const now = toLocalDateTime(nowDate);
  const today = toIsoDate(nowDate);
  const random = seededRandom(`rangeops-demo-${today}`);
  const setup = demoSetup();
  let nextId = 0;
  const id = (prefix: string) => `${prefix}-${++nextId}`;
  const notAfterNow = (at: LocalDateTime): LocalDateTime => (at > now ? addMinutes(now, -1 - Math.floor(random() * 50)) : at);

  const bookings: Booking[] = [];
  const payments: Payment[] = [];
  const orders: Order[] = [];
  const passes: Pass[] = [];

  // Bookings, from yesterday to six days ahead.
  for (let offset = -1; offset <= 6; offset += 1) {
    const date = addDays(today, offset);
    const open = setup.openingHours[weekdayOf(date)];
    if (!open) continue;
    const robotsByHour = new Map<number, number>();
    for (const bay of setup.bays.filter((b) => b.inService)) {
      let hour = open.open;
      while (hour < open.close) {
        const peak = setup.prices.peakWindows.some((w) => w.days.includes(weekdayOf(date)) && hour >= w.start && hour < w.end);
        // Further ahead is less booked.
        const chance = (peak ? 0.6 : 0.3) * (offset > 1 ? 0.6 : 1);
        if (random() > chance) {
          hour += 1;
          continue;
        }
        const hours = Math.min(random() < 0.65 ? 1 : 2, open.close - hour);
        const robotFree = Array.from({ length: hours }, (_, i) => robotsByHour.get(hour + i) ?? 0).every((n) => n < 3);
        const robotHire = robotFree && random() < 0.18;
        if (robotHire) for (let i = 0; i < hours; i += 1) robotsByHour.set(hour + i, (robotsByHour.get(hour + i) ?? 0) + 1);
        const quote = quoteBooking({ prices: setup.prices, openingHours: setup.openingHours, bay, date, start: hour, hours, robotHire });
        if (!quote.ok) break;
        const start = dateTimeAt(date, hour);
        const end = dateTimeAt(date, hour + hours);
        const roll = random();
        const source: Source = offset > 0 ? (roll < 0.85 ? 'app' : 'partner') : roll < 0.7 ? 'app' : roll < 0.9 ? 'counter' : 'partner';
        // Counter bookings are paid on arrival. App and partner bookings are paid one to three days
        // ahead; for bookings further out than that, sometime in the past week.
        const paidHour = 8 + Math.floor(random() * 13);
        const paidMinute = Math.floor(random() * 60);
        const aheadPaid = dateTimeAt(addDays(date, -1 - Math.floor(random() * 3)), paidHour, paidMinute);
        const paidAt =
          source === 'counter'
            ? notAfterNow(addMinutes(start, -5))
            : notAfterNow(aheadPaid > now ? dateTimeAt(addDays(today, -Math.floor(random() * 7)), paidHour, paidMinute) : aheadPaid);
        let status: Booking['status'] = 'booked';
        if (random() < 0.05) status = 'cancelled';
        else if (end <= now) status = random() < 0.93 ? 'checked-in' : 'booked';
        else if (start <= now) status = random() < 0.85 ? 'checked-in' : 'booked';
        const booking: Booking = {
          id: id('bk'),
          date,
          bayId: bay.id,
          start: hour,
          hours,
          player: pick(random, PLAYERS),
          source,
          status,
          robotHire,
          amount: quote.value.total,
          paidAt,
        };
        bookings.push(booking);
        payments.push({ id: id('pay'), at: paidAt, kind: 'bay', amount: quote.value.bayTotal, ref: booking.id });
        if (robotHire) payments.push({ id: id('pay'), at: paidAt, kind: 'robot', amount: quote.value.robotTotal, ref: booking.id });
        if (status === 'cancelled') {
          const refundAt = notAfterNow(addMinutes(paidAt, 30 + Math.floor(random() * 600)));
          payments.push({ id: id('pay'), at: refundAt, kind: 'bay', amount: -quote.value.bayTotal, ref: booking.id });
          if (robotHire) payments.push({ id: id('pay'), at: refundAt, kind: 'robot', amount: -quote.value.robotTotal, ref: booking.id });
        }
        hour += hours + (random() < 0.5 ? 0 : 1);
      }
    }
  }

  // Bucket orders: today's, counting back from now, and yesterday's.
  const usedCodes = new Set<string>(Object.values(DEMO_CODES));
  const newCode = () => {
    const code = generateCode(random, usedCodes);
    usedCodes.add(code);
    return code;
  };
  const addOrder = (paidAt: LocalDateTime, bucket: BucketSize, status: Order['status'], code = newCode()) => {
    const source: Source = random() < 0.75 ? 'app' : 'counter';
    const amount = setup.prices.buckets[bucket];
    const handedOverAt = status === 'handed-over' ? notAfterNow(addMinutes(paidAt, 2 + Math.floor(random() * 20))) : null;
    const order: Order = { id: id('ord'), code, bucket, balls: BUCKET_BALLS[bucket], status, source, amount, paidAt, handedOverAt, passId: null };
    orders.push(order);
    payments.push({ id: id('pay'), at: paidAt, kind: 'bucket', amount, ref: order.id });
    if (status === 'refunded') payments.push({ id: id('pay'), at: notAfterNow(addMinutes(paidAt, 10)), kind: 'bucket', amount: -amount, ref: order.id });
  };
  const sizes: BucketSize[] = ['small', 'medium', 'medium', 'large'];
  for (let i = 0; i < 22; i += 1) {
    const paidAt = addMinutes(now, -(8 + i * 17 + Math.floor(random() * 10)));
    if (paidAt.slice(0, 10) !== today) break;
    addOrder(paidAt, pick(random, sizes), i < 4 ? 'paid' : random() < 0.95 ? 'handed-over' : 'refunded');
  }
  addOrder(addMinutes(now, -3), 'medium', 'paid', DEMO_CODES.paid);
  addOrder(addMinutes(now, -95), 'large', 'handed-over', DEMO_CODES.handedOver);
  addOrder(addMinutes(now, -140), 'small', 'refunded', DEMO_CODES.refunded);
  for (let i = 0; i < 30; i += 1) {
    addOrder(dateTimeAt(addDays(today, -1), 7 + Math.floor(random() * 14), Math.floor(random() * 60)), pick(random, sizes), 'handed-over');
  }

  // Passes (ADR 0021): monthly discount passes, one ended, and ball credit, some sold today.
  const { monthlyPass, creditPack } = setup.prices;
  const passSeed: { player: string; email: string; kind: Pass['kind']; daysAgo: number; ballsLeft?: number }[] = [
    { player: 'The Nguyen family', email: 'nguyen.family@example.com', kind: 'monthly', daysAgo: 12 },
    { player: 'Sam Okafor', email: 'sam@example.com', kind: 'monthly', daysAgo: 45 },
    { player: 'Hannah Lee', email: 'hannah@example.com', kind: 'monthly', daysAgo: 3 },
    { player: 'Grace Tan', email: 'grace@example.com', kind: 'credits', daysAgo: 40, ballsLeft: 260 },
    { player: 'The Rossi family', email: 'rossi@example.com', kind: 'credits', daysAgo: 3, ballsLeft: 0 },
    { player: 'Ruby Singh', email: 'ruby@example.com', kind: 'credits', daysAgo: 0, ballsLeft: creditPack.balls },
  ];
  for (const seed of passSeed) {
    const soldAt = seed.daysAgo === 0 ? addMinutes(now, -42) : dateTimeAt(addDays(today, -seed.daysAgo), 10, 15);
    const monthly = seed.kind === 'monthly';
    const pass: Pass = {
      id: id('pass'),
      accountId: `acct-${seed.email}`,
      player: seed.player,
      email: seed.email,
      kind: seed.kind,
      soldAt: monthly ? soldAt : null,
      validUntil: monthly ? addDays(soldAt.slice(0, 10), monthlyPass.days) : null,
      discountPercent: monthly ? monthlyPass.discountPercent : 0,
      ballsLeft: monthly ? 0 : seed.ballsLeft!,
    };
    passes.push(pass);
    payments.push({ id: id('pay'), at: soldAt, kind: 'pass', amount: monthly ? monthlyPass.price : creditPack.price, ref: pass.id });
  }

  // The fleet: robots out with the bookings that hired them now, the rest charging on the dock.
  const robots: Robot[] = ['7C2A', 'B19E', '4D05'].map((serial) => ({
    id: `robot-${serial.toLowerCase()}`,
    name: `Mulligan-${serial}`,
    state: 'docked',
    battery: 100,
    ballsOnBoard: 0,
    hire: null,
    lastSeen: now,
  }));
  const nowHour = hourOf(now);
  const current = bookings.filter((b) => b.date === today && b.start <= nowHour && b.start + b.hours > nowHour && b.status !== 'cancelled');
  // Make sure the demo shows robots out whenever the range is open.
  const withRobot = current.filter((b) => b.robotHire);
  for (const booking of current.filter((b) => !b.robotHire).slice(0, Math.max(0, 2 - withRobot.length))) {
    const quote = quoteBooking({ prices: setup.prices, openingHours: setup.openingHours, bay: setup.bays.find((b) => b.id === booking.bayId)!, date: today, start: booking.start, hours: booking.hours, robotHire: true });
    if (!quote.ok) continue;
    booking.robotHire = true;
    booking.amount = quote.value.total;
    payments.push({ id: id('pay'), at: booking.paidAt, kind: 'robot', amount: quote.value.robotTotal, ref: booking.id });
    withRobot.push(booking);
  }
  withRobot
    .filter((b) => b.status !== 'cancelled')
    .slice(0, robots.length)
    .forEach((booking, i) => {
      booking.status = 'checked-in';
      robots[i].hire = { bookingId: booking.id, bayId: booking.bayId, until: dateTimeAt(today, booking.start + booking.hours) };
      robots[i].state = i === 0 ? 'driving' : 'idle';
      robots[i].battery = 82 - i * 21;
      robots[i].ballsOnBoard = 3 + i * 2;
    });
  for (const robot of robots.filter((r) => !r.hire)) {
    robot.state = 'charging';
    robot.battery = 64;
  }

  return { setup, bookings, orders, passes, payments, robots, nextId };
}
