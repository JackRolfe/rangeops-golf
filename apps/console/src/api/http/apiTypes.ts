// The parts of the RangeOps API (apps/api/openapi.json) the console reads. Hand-written from that file;
// apiTypes.test.ts fails if a path the adapter calls is no longer in it.

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface ApiRangeSummary {
  id: string;
  slug: string;
  name: string;
  timeZone: string;
  currency: string;
}

export interface ApiBay {
  id: string;
  rangeId: string;
  number: number;
  name: string;
  active: boolean;
  offPeakCentsPerHour: number | null;
  peakCentsPerHour: number | null;
}

export interface ApiStaffBay extends ApiBay {
  checkInCode: string;
  checkInUrl: string;
}

export interface ApiRange extends ApiRangeSummary {
  prices: { offPeakCentsPerHour: number; peakCentsPerHour: number; floorCentsPerHour: number };
  openingHours: { weekday: number; opens: string; closes: string }[];
  peakWindows: { weekday: number; from: string; to: string }[];
  bays: ApiBay[];
  addOns: { kind: 'robot' | 'club_hire' | 'lesson'; priceCents: number; unit: 'per_hour' | 'per_booking' }[];
  bucketProducts: { id: string; name: string; balls: number; priceCents: number; active: boolean }[];
  passProducts: {
    id: string;
    kind: 'monthly_pass' | 'ball_credit';
    name: string;
    priceCents: number;
    days: number | null;
    discountPercent: number | null;
    balls: number | null;
    active: boolean;
  }[];
}

export interface ApiOrder {
  id: string;
  accountId: string | null;
  rangeId: string;
  kind: 'booking' | 'bucket' | 'pass' | 'ball_credit';
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  totalCents: number;
  lines: { description: string; quantity: number; unitCents: number }[];
  paymentProvider: string | null;
  createdAt: string;
  paidAt: string | null;
  refundedAt: string | null;
}

export interface ApiBucketCode {
  id: string;
  code: string;
  rangeId: string;
  bucket: { productId: string; name: string; balls: number };
  orderId: string;
  accountId: string | null;
  createdAt: string;
  redeemedAt: string | null;
}

export interface ApiStaffOrder extends ApiOrder {
  bucketCode: ApiBucketCode | null;
}

export interface ApiBooking {
  id: string;
  bay: { id: string; number: number; name: string };
  accountId: string | null;
  source: 'rangeops' | 'external';
  externalRef: string | null;
  customerName: string | null;
  customerEmail?: string | null;
  startsAt: string;
  endsAt: string;
  hours: number;
  status: 'pending_payment' | 'confirmed' | 'cancelled';
  checkedInAt: string | null;
  addOns: { kind: 'robot' | 'club_hire' | 'lesson'; quantity: number; priceCents: number }[];
  totalCents: number;
  order: ApiOrder | null;
  createdAt: string;
}

export interface ApiFleetHire {
  hireId: string;
  bookingId: string;
  bayNumber: number;
  startsAt: string;
  endsAt: string;
}

export interface ApiFleetRobot {
  id: string;
  name: string;
  inService: boolean;
  status: {
    state: 'idle' | 'driving' | 'at_limit' | 'link_lost' | 'stopped_by_switch' | 'fault' | 'low_battery' | 'locked' | null;
    batteryPct: number | null;
    ballsOnBoard: number | null;
    lastSeenAt: string | null;
  };
  currentHire: ApiFleetHire | null;
}

export interface ApiPassHolder {
  id: string;
  email: string;
  name: string | null;
}

export interface ApiStaffPasses {
  passes: { id: string; account: ApiPassHolder; name: string; discountPercent: number; validFrom: string; validTo: string; createdAt: string }[];
  ballCredit: { account: ApiPassHolder; balls: number }[];
}

export interface ApiCounterSale {
  order: ApiOrder;
  account: ApiPassHolder;
  pass: ApiStaffPasses['passes'][number] | null;
  ballCredit: number | null;
}

export interface ApiCreditRedemption {
  order: ApiOrder;
  bucketCode: ApiBucketCode;
  ballCredit: number;
}

export interface ApiSession {
  sessionToken: string;
  expiresAt: string;
}

export interface ApiMe {
  account: { id: string; email: string; name: string | null };
  staffAt: ApiRangeSummary[];
}

/** Every call the console makes, as "METHOD path" in the OpenAPI file's own spelling. */
export const PATHS_USED = [
  'GET /ranges/{rangeId}',
  'PATCH /ranges/{rangeId}',
  'PUT /ranges/{rangeId}/hours',
  'PUT /ranges/{rangeId}/peak-windows',
  'GET /ranges/{rangeId}/bays',
  'POST /ranges/{rangeId}/bays',
  'PATCH /bays/{bayId}',
  'GET /ranges/{rangeId}/bookings',
  'POST /bookings/{bookingId}/check-in',
  'POST /bookings/{bookingId}/cancel',
  'GET /ranges/{rangeId}/orders',
  'GET /ranges/{rangeId}/bucket-codes/{code}',
  'POST /ranges/{rangeId}/bucket-codes/{code}/redeem',
  'GET /ranges/{rangeId}/passes',
  'POST /ranges/{rangeId}/counter/passes',
  'POST /ranges/{rangeId}/counter/ball-credit/redeem',
  'GET /ranges/{rangeId}/fleet',
  'POST /auth/email-link',
  'POST /auth/verify',
  'GET /me',
  'POST /auth/sign-out',
] as const;
