// The console's domain types. Words follow the glossary in .scratch/range-console/spec.md.
// Money is integer cents. Dates are local `YYYY-MM-DD`; date-times are local `YYYY-MM-DDTHH:mm`,
// both in the range's own time (the console assumes it runs in the range's timezone).

export type Cents = number;
export type IsoDate = string;
export type LocalDateTime = string;
/** 0 is Sunday, as in Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Range {
  id: string;
  name: string;
  timezone: string;
  currency: 'AUD';
  /** Where the player app lives; check-in QR codes link into it. */
  publicAppUrl: string;
}

export type PriceBand = 'standard' | 'premium';
export const PRICE_BANDS: readonly PriceBand[] = ['standard', 'premium'];

export interface Bay {
  id: string;
  number: number;
  name: string;
  band: PriceBand;
  inService: boolean;
  /** What the bay's QR code encodes, when the data source issues its own (the API's has a secret code). */
  checkInUrl?: string;
}

/** Whole hours, 0 to 24. The range is open from `open` up to but not including `close`. */
export interface DayHours {
  open: number;
  close: number;
}

/** Indexed by weekday, Sunday first. `null` is closed all day. */
export type OpeningHours = (DayHours | null)[];

export interface PeakWindow {
  days: Weekday[];
  start: number;
  end: number;
}

export interface BandPrices {
  offPeak: Cents;
  peak: Cents;
  floor: Cents;
}

export type BucketSize = 'small' | 'medium' | 'large';
export const BUCKET_SIZES: readonly BucketSize[] = ['small', 'medium', 'large'];
export const BUCKET_BALLS: Record<BucketSize, number> = { small: 40, medium: 80, large: 120 };

/** A monthly pass: a percent off bay-hours and buckets, for a number of days (ADR 0021). */
export interface MonthlyPassProduct {
  price: Cents;
  days: number;
  discountPercent: number;
}

/** Ball credit: a prepaid balance of balls at the range that never expires (ADR 0021). */
export interface CreditPackProduct {
  price: Cents;
  balls: number;
}

export interface PriceList {
  bands: Record<PriceBand, BandPrices>;
  peakWindows: PeakWindow[];
  robotHirePerHour: Cents;
  buckets: Record<BucketSize, Cents>;
  /** Balls in each bucket size. */
  bucketBalls: Record<BucketSize, number>;
  monthlyPass: MonthlyPassProduct;
  creditPack: CreditPackProduct;
}

export interface RangeSetup {
  range: Range;
  bays: Bay[];
  openingHours: OpeningHours;
  prices: PriceList;
}

export type Source = 'app' | 'counter' | 'partner';

export type BookingStatus = 'booked' | 'checked-in' | 'cancelled';

export interface Booking {
  id: string;
  date: IsoDate;
  bayId: string;
  start: number;
  hours: number;
  player: string;
  source: Source;
  status: BookingStatus;
  robotHire: boolean;
  amount: Cents;
  paidAt: LocalDateTime;
}

export type OrderStatus = 'paid' | 'handed-over' | 'refunded';

export interface Order {
  id: string;
  code: string;
  bucket: BucketSize;
  /** Balls in the bucket. */
  balls: number;
  status: OrderStatus;
  source: Source;
  amount: Cents;
  paidAt: LocalDateTime;
  handedOverAt: LocalDateTime | null;
  /** Set when the bucket came off a pass instead of a code. */
  passId: string | null;
}

export type PassKind = 'monthly' | 'credits';

/**
 * Held on a player's account (ADR 0021). A monthly pass gives a percent off until its last day;
 * ball credit is a balance of balls, one entry per account, that staff can hand buckets out of.
 */
export interface Pass {
  id: string;
  /** The account holding it. */
  accountId: string;
  /** The player's name, or their email if the account has no name. */
  player: string;
  email: string;
  kind: PassKind;
  /** When it was sold; `null` for ball credit, which builds up from several sales. */
  soldAt: LocalDateTime | null;
  /** Monthly passes: last day it can be used. `null` for ball credit, which never expires. */
  validUntil: IsoDate | null;
  /** Monthly passes: percent off bay-hours and buckets. 0 for ball credit. */
  discountPercent: number;
  /** Ball credit: balls left. 0 for monthly passes. */
  ballsLeft: number;
}

export type PaymentKind = 'bay' | 'robot' | 'bucket' | 'pass';

/** Money in or out. A refund is a negative amount of the kind it refunds. */
export interface Payment {
  id: string;
  at: LocalDateTime;
  kind: PaymentKind;
  amount: Cents;
  ref: string;
}

/** Telemetry states from the control link, plus `docked` and `charging` from the fleet record. */
export type RobotState =
  | 'docked'
  | 'charging'
  | 'idle'
  | 'driving'
  | 'at-limit'
  | 'link-lost'
  | 'stopped'
  | 'fault'
  | 'low-battery'
  | 'locked';

export interface RobotHire {
  bookingId: string;
  bayId: string;
  until: LocalDateTime;
}

export interface Robot {
  id: string;
  name: string;
  state: RobotState;
  /** Percent; `null` until the robot has reported. */
  battery: number | null;
  /** `null` when the robot doesn't count balls. */
  ballsOnBoard: number | null;
  hire: RobotHire | null;
  lastSeen: LocalDateTime;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
