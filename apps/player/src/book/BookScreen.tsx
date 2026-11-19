import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Joystick, RefreshCw } from 'lucide-react';
import { apiErrorMessage, useAccount } from '../account/AccountContext';
import { SignInCard } from '../account/SignInCard';
import { ApiError } from '../api/PlayerApi';
import { TEST_CARD, type AddOnKind, type Availability, type Booking, type Range } from '../api/types';
import { useRange } from '../api/useRange';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { TabId } from '../components/TabBar';
import { formatMoney } from '../domain/money';
import { base64urlToBytes } from '../robot/protocol';
import { TabScreen } from '../screens/TabScreen';
import { ADD_ON_LABELS, MAX_BOOKING_HOURS, addOnPrice, bookingDays, estimateCents, startTimes } from './bookingRules';
import { formatBookingTime } from './format';

interface BookScreenProps {
  onTab: (tab: TabId) => void;
  /** Opens Drive with a booking's hire key. */
  onDrive: (hireKey: Uint8Array) => void;
  /** The fake provider's test card; tests pass the declining one. */
  paymentMethod?: string;
  now?: () => Date;
}

export function BookScreen({ onTab, onDrive, paymentMethod = TEST_CARD, now = () => new Date() }: BookScreenProps) {
  const { api, session } = useAccount();
  const { ranges, range, error: rangeError, loading, chooseRange, reload } = useRange();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [confirmed, setConfirmed] = useState<Booking | null>(null);

  const loadBookings = useCallback(async () => {
    if (!session) {
      setBookings([]);
      return;
    }
    try {
      setBookings(await api.listMyBookings());
    } catch {
      setBookings([]);
    }
  }, [api, session]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  return (
    <TabScreen tab="book" title="Book" onTab={onTab}>
      {api.mode === 'demo' ? <p className="demo-note">Demo mode: nothing is booked or charged.</p> : null}
      {ranges.length > 1 && range ? (
        <label className="field range-picker">
          <span>Range</span>
          <select value={range.id} onChange={(event) => chooseRange(event.target.value)}>
            {ranges.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      ) : null}
      {rangeError ? (
        <div className="notice" role="alert">
          {rangeError}{' '}
          <button className="text-button" type="button" onClick={() => void reload()}><RefreshCw aria-hidden="true" /> Try again</button>
        </div>
      ) : null}
      {loading && !range ? <p className="supporting-copy">Loading the range…</p> : null}

      {confirmed ? (
        <BookingConfirmed
          booking={confirmed}
          onDrive={onDrive}
          onAnother={() => setConfirmed(null)}
        />
      ) : range ? (
        <BookingForm
          key={range.id}
          range={range}
          paymentMethod={paymentMethod}
          now={now}
          onBooked={(booking) => {
            setConfirmed(booking);
            void loadBookings();
          }}
        />
      ) : null}

      {session ? (
        <YourBookings bookings={bookings} now={now} onDrive={onDrive} onChanged={() => void loadBookings()} />
      ) : null}
    </TabScreen>
  );
}

function BookingForm({
  range,
  paymentMethod,
  now,
  onBooked,
}: {
  range: Range;
  paymentMethod: string;
  now: () => Date;
  onBooked: (booking: Booking) => void;
}) {
  const { api, session } = useAccount();
  const days = useMemo(() => bookingDays(range.timeZone, now()), [range.timeZone, now]);
  const [date, setDate] = useState(days[0].date);
  const [hours, setHours] = useState(1);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [bayId, setBayId] = useState<string | null>(null);
  const [addOns, setAddOns] = useState<AddOnKind[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const loadAvailability = useCallback(async () => {
    setAvailability(null);
    try {
      setAvailability(await api.getAvailability(range.slug, date));
    } catch (error) {
      setProblem(apiErrorMessage(error));
    }
  }, [api, date, range.slug]);

  useEffect(() => {
    void loadAvailability();
  }, [loadAvailability]);

  const times = useMemo(() => (availability ? startTimes(availability, hours, now()) : []), [availability, hours, now]);
  const time = times.find((item) => item.startsAt === startsAt) ?? null;
  const bay = time?.bays.find((item) => item.bayId === bayId) ?? null;
  const robotFree = (time?.robotsFree ?? 0) > 0;
  const chosenAddOns = addOns.filter((kind) => kind !== 'robot' || robotFree);
  const estimate = bay ? estimateCents(bay.priceCents, chosenAddOns, range, hours) : null;

  // A time or bay that is no longer offered is let go.
  useEffect(() => {
    if (startsAt && !time) setStartsAt(null);
    if (bayId && !bay) setBayId(null);
  }, [bay, bayId, startsAt, time]);

  async function pay() {
    if (!bay || !time) return;
    setBusy(true);
    setProblem(null);
    try {
      const booking = await api.createBooking({
        bayId: bay.bayId,
        startsAt: time.startsAt,
        hours,
        addOns: chosenAddOns.map((kind) => ({ kind })),
        paymentMethod,
      });
      onBooked(booking);
    } catch (error) {
      setProblem(apiErrorMessage(error));
      // Someone else may have taken it; show what's free now.
      if (error instanceof ApiError && error.status === 409) void loadAvailability();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="book-form" aria-labelledby="book-title">
      <h2 id="book-title" className="section-heading">Book a bay at {range.name}</h2>

      <fieldset className="chip-group">
        <legend>Day</legend>
        <div className="chip-row chip-row--scroll">
          {days.map((day) => (
            <button key={day.date} type="button" className="choice-chip" aria-pressed={day.date === date} onClick={() => setDate(day.date)}>
              {day.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="chip-group">
        <legend>How long</legend>
        <div className="chip-row">
          {Array.from({ length: Math.min(3, MAX_BOOKING_HOURS) }, (_, index) => index + 1).map((value) => (
            <button key={value} type="button" className="choice-chip" aria-pressed={value === hours} onClick={() => setHours(value)}>
              {value} {value === 1 ? 'hour' : 'hours'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="chip-group">
        <legend>Time</legend>
        {!availability ? (
          <p className="supporting-copy">Finding free bays…</p>
        ) : times.length ? (
          <div className="chip-row chip-row--wrap">
            {times.map((item) => (
              <button
                key={item.startsAt}
                type="button"
                className="choice-chip"
                aria-pressed={item.startsAt === startsAt}
                onClick={() => {
                  setStartsAt(item.startsAt);
                  setBayId(item.bays[0].bayId);
                }}
              >
                {item.localTime}
                {item.peak ? <small> peak</small> : null}
              </button>
            ))}
          </div>
        ) : (
          <p className="supporting-copy">No bays are free for {hours} {hours === 1 ? 'hour' : 'hours'} that day. Try another day.</p>
        )}
      </fieldset>

      {time ? (
        <fieldset className="chip-group">
          <legend>Bay</legend>
          <div className="chip-row chip-row--wrap">
            {time.bays.map((item) => (
              <button key={item.bayId} type="button" className="choice-chip" aria-pressed={item.bayId === bayId} onClick={() => setBayId(item.bayId)}>
                {item.name}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {bay ? (
        <fieldset className="add-ons">
          <legend>Add</legend>
          {range.addOns.map((addOn) => {
            const disabled = addOn.kind === 'robot' && !robotFree;
            return (
              <label key={addOn.kind} className={`add-on ${disabled ? 'is-disabled' : ''}`}>
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={chosenAddOns.includes(addOn.kind)}
                  onChange={(event) =>
                    setAddOns((current) => (event.target.checked ? [...current, addOn.kind] : current.filter((kind) => kind !== addOn.kind)))
                  }
                />
                <span>
                  <strong>{ADD_ON_LABELS[addOn.kind].name}</strong>
                  <small>{disabled ? 'No robot is free then' : ADD_ON_LABELS[addOn.kind].detail}</small>
                </span>
                <b>{formatMoney(addOnPrice(addOn, hours), range.currency)}</b>
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {bay && estimate !== null ? (
        <div className="pay-box">
          <p>
            <span>{bay.name}, {time!.localTime} for {hours} {hours === 1 ? 'hour' : 'hours'}</span>
            <strong>{formatMoney(estimate, range.currency)}</strong>
          </p>
          <small>A pass discount comes off when you pay. Test card: no money moves.</small>
          {session ? (
            <button className="button button--primary button--full" type="button" disabled={busy} onClick={() => void pay()}>
              {busy ? 'Paying…' : `Pay ${formatMoney(estimate, range.currency)}`}
            </button>
          ) : (
            <SignInCard reason="Sign in to pay for this booking. You’ll come straight back here." />
          )}
        </div>
      ) : null}
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
    </section>
  );
}

function hireKeyOf(booking: Booking): Uint8Array | null {
  return booking.hire && booking.hire.status !== 'cancelled' ? base64urlToBytes(booking.hire.key.base64url) : null;
}

function BookingConfirmed({ booking, onDrive, onAnother }: { booking: Booking; onDrive: (key: Uint8Array) => void; onAnother: () => void }) {
  const key = hireKeyOf(booking);
  return (
    <section className="booking-confirmed" role="status" aria-labelledby="confirmed-title">
      <CalendarCheck aria-hidden="true" />
      <h2 id="confirmed-title">You’re booked</h2>
      <p>
        {booking.bay.name}, {formatBookingTime(booking.startsAt, booking.endsAt, booking.range.timeZone)}.
        Paid {formatMoney(booking.totalCents, booking.currency)}.
      </p>
      {booking.hire ? <p>{booking.hire.robot.name} is hired for your booking. Scan the bay’s QR code when you arrive.</p> : null}
      {key ? (
        <button className="button button--primary button--full" type="button" onClick={() => onDrive(key)}>
          <Joystick aria-hidden="true" /> Drive {booking.hire!.robot.name}
        </button>
      ) : null}
      <button className="text-button" type="button" onClick={onAnother}>Book another</button>
    </section>
  );
}

function YourBookings({
  bookings,
  now,
  onDrive,
  onChanged,
}: {
  bookings: Booking[];
  now: () => Date;
  onDrive: (key: Uint8Array) => void;
  onChanged: () => void;
}) {
  const { api } = useAccount();
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const at = now().getTime();
  const upcoming = bookings
    .filter((booking) => booking.status === 'confirmed' && Date.parse(booking.endsAt) > at)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter((booking) => !upcoming.includes(booking));

  return (
    <section className="your-bookings" aria-labelledby="your-bookings-title">
      <h2 id="your-bookings-title" className="section-heading">Your bookings</h2>
      {upcoming.length === 0 ? <p className="supporting-copy">Nothing booked yet.</p> : null}
      <ul className="booking-list">
        {upcoming.map((booking) => {
          const key = hireKeyOf(booking);
          const started = Date.parse(booking.startsAt) <= at;
          return (
            <li key={booking.id} className="booking-row">
              <div>
                <strong>{formatBookingTime(booking.startsAt, booking.endsAt, booking.range.timeZone)}</strong>
                <span>
                  {booking.bay.name} · {booking.range.name}
                  {booking.addOns.length ? ` · ${booking.addOns.map((addOn) => ADD_ON_LABELS[addOn.kind].name).join(', ')}` : ''}
                </span>
                <span>{formatMoney(booking.totalCents, booking.currency)}{booking.checkedInAt ? ' · checked in' : ''}</span>
              </div>
              <div className="booking-row__actions">
                {key ? (
                  <button className="button button--secondary" type="button" onClick={() => onDrive(key)}>
                    <Joystick aria-hidden="true" /> Drive
                  </button>
                ) : null}
                {!started ? (
                  <button className="text-button" type="button" onClick={() => setCancelling(booking)}>Cancel</button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {past.length ? (
        <details className="past-bookings">
          <summary>Past and cancelled ({past.length})</summary>
          <ul className="booking-list">
            {past.map((booking) => (
              <li key={booking.id} className="booking-row booking-row--past">
                <div>
                  <strong>{formatBookingTime(booking.startsAt, booking.endsAt, booking.range.timeZone)}</strong>
                  <span>
                    {booking.bay.name} ·{' '}
                    {booking.status === 'cancelled'
                      ? booking.order?.status === 'failed'
                        ? 'payment declined'
                        : 'cancelled and refunded'
                      : 'played'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {problem ? <p className="notice" role="alert">{problem}</p> : null}
      <ConfirmDialog
        open={cancelling !== null}
        title="Cancel this booking?"
        confirmLabel="Cancel booking"
        destructive
        onCancel={() => setCancelling(null)}
        onConfirm={() => {
          const booking = cancelling!;
          setCancelling(null);
          setProblem(null);
          api
            .cancelBooking(booking.id)
            .then(onChanged)
            .catch((error: unknown) => setProblem(apiErrorMessage(error)));
        }}
      >
        {cancelling ? `${cancelling.bay.name}, ${formatBookingTime(cancelling.startsAt, cancelling.endsAt, cancelling.range.timeZone)}. You’ll get a full refund.` : null}
      </ConfirmDialog>
    </section>
  );
}
