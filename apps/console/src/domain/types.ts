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

export interface MonthlyPassProduct {
  price: Cents;
  bucketsPerMonth: number;
  bayHoursPerMonth: number;
  months: number;
}

export interface CreditPackProduct {
  price: Cents;
  credits: number;
}

export interface PriceList {
  bands: Record<PriceBand, BandPrices>;
  peakWindows: PeakWindow[];
  robotHirePerHour: Cents;
  buckets: Record<BucketSize, Cents>;
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
  status: OrderStatus;
  source: Source;
  amount: Cents;
  paidAt: LocalDateTime;
  handedOverAt: LocalDateTime | null;
  /** Set when the bucket came off a pass instead of a code. */
  passId: string | null;
}

export type PassKind = 'monthly' | 'credits';

export interface PassRedemption {
  at: LocalDateTime;
  what: 'bucket' | 'bay-hour';
}

export interface Pass {
  id: string;
  player: string;
  kind: PassKind;
  soldAt: LocalDateTime;
  /** Last day the pass can be used; `null` never expires (credit packs). */
  validUntil: IsoDate | null;
  /** Monthly passes: the allowance each calendar month. */
  bucketsPerMonth: number;
  bayHoursPerMonth: number;
  /** Credit packs: prepaid buckets bought. */
  creditsBought: number;
  redemptions: PassRedemption[];
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
  battery: number;
  /** `null` when the robot doesn't count balls. */
  ballsOnBoard: number | null;
  hire: RobotHire | null;
  lastSeen: LocalDateTime;
}

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };
