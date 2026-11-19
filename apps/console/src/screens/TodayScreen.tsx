import { Bot, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useConsole, useLoad } from '../api/context';
import { BookingStatusPill, OrderStatusPill, SOURCE_LABEL, bucketLabel } from '../components/labels';
import { Errors, Status } from '../components/Status';
import { formatMoney } from '../domain/money';
import { addDays, hourLabel, parseLocal, timeLabel, toIsoDate } from '../domain/time';
import type { Booking } from '../domain/types';

const dayFormat = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

export function TodayScreen() {
  const { clock } = useConsole();
  const today = toIsoDate(clock());
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<string[]>([]);
  const { state, reload } = useLoad(
    async (api) => {
      const [setup, bookings, orders] = await Promise.all([api.getSetup(), api.listBookings(date), api.listOrders(date)]);
      return { setup, bookings, orders };
    },
    [date],
    15_000,
  );
  const { api } = useConsole();

  const change = async (booking: Booking, status: 'checked-in' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm(`Cancel ${booking.player}'s booking and refund ${formatMoney(booking.amount)}?`)) return;
    const result = await api.setBookingStatus(booking.id, status);
    setErrors(result.ok ? [] : result.errors);
    await reload();
  };

  return (
    <section className="screen">
      <header className="screen__head">
        <div>
          <h1>{date === today ? 'Today' : dayFormat.format(parseLocal(date))}</h1>
          <p>{date === today ? `${dayFormat.format(parseLocal(date))}. ` : ''}Bookings and bucket orders.</p>
        </div>
        <div className="screen__actions">
          <button className="button button--quiet button--small" type="button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <input className="input" type="date" aria-label="Day" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button className="button button--quiet button--small" type="button" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          {date !== today && (
            <button className="button button--quiet button--small" type="button" onClick={() => setDate(today)}>
              Today
            </button>
          )}
        </div>
      </header>

      <Errors errors={errors} />

      <Status state={state}>
        {({ setup, bookings, orders }) => {
          const bayName = new Map(setup.bays.map((b) => [b.id, b.name]));
          const live = bookings.filter((b) => b.status !== 'cancelled');
          const bayHours = live.reduce((sum, b) => sum + b.hours, 0);
          const robotHires = live.filter((b) => b.robotHire).length;
          const waiting = orders.filter((o) => o.status === 'paid').length;
          return (
            <>
              <div className="stats">
                <Stat label="Bookings" value={String(live.length)} />
                <Stat label="Bay-hours" value={String(bayHours)} />
                <Stat label="Robot hires" value={String(robotHires)} />
                <Stat label="Buckets sold" value={String(orders.filter((o) => o.status !== 'refunded').length)} />
                <Stat label="Buckets waiting" value={String(waiting)} />
              </div>

              <section className="panel" aria-labelledby="bookings-heading">
                <div className="panel__head">
                  <h2 id="bookings-heading">Bookings</h2>
                  <p>Check players in as they arrive. Cancelling refunds them.</p>
                </div>
                {bookings.length === 0 ? (
                  <p className="empty">No bookings on this day.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table" aria-label="Bookings">
                      <thead>
                        <tr><th>Time</th><th>Bay</th><th>Player</th><th>Hours</th><th>Robot</th><th>Source</th><th>Status</th><th className="num">Paid</th><th /></tr>
                      </thead>
                      <tbody>
                        {bookings.map((booking) => (
                          <tr key={booking.id} className={booking.status === 'cancelled' ? 'muted' : undefined}>
                            <td>{hourLabel(booking.start)}–{hourLabel(booking.start + booking.hours)}</td>
                            <td>{bayName.get(booking.bayId) ?? booking.bayId}</td>
                            <td>{booking.player}</td>
                            <td className="num">{booking.hours}</td>
                            <td>{booking.robotHire ? <span className="pill pill--robot"><Bot size={13} aria-hidden="true" /> Robot</span> : ''}</td>
                            <td>{SOURCE_LABEL[booking.source]}</td>
                            <td><BookingStatusPill status={booking.status} /></td>
                            <td className="num">{formatMoney(booking.amount)}</td>
                            <td className="actions">
                              {booking.status === 'booked' && (
                                <>
                                  <button className="button button--small" type="button" onClick={() => change(booking, 'checked-in')}>Check in</button>
                                  <button className="button button--danger button--small" type="button" onClick={() => change(booking, 'cancelled')}>Cancel</button>
                                </>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel" aria-labelledby="orders-heading">
                <div className="panel__head">
                  <h2 id="orders-heading">Bucket orders</h2>
                  <p>Paid for in the app or at the counter. Hand them over on the Handover screen.</p>
                </div>
                {orders.length === 0 ? (
                  <p className="empty">No bucket orders on this day.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table" aria-label="Bucket orders">
                      <thead>
                        <tr><th>Paid</th><th>Code</th><th>Bucket</th><th>Source</th><th>Status</th><th>Handed over</th><th className="num">Amount</th></tr>
                      </thead>
                      <tbody>
                        {orders.map((order) => (
                          <tr key={order.id}>
                            <td>{timeLabel(order.paidAt)}</td>
                            <td className="code">{order.code}</td>
                            <td>{bucketLabel(order.bucket)}</td>
                            <td>{order.passId ? 'Pass' : SOURCE_LABEL[order.source]}</td>
                            <td><OrderStatusPill status={order.status} /></td>
                            <td>{order.handedOverAt ? timeLabel(order.handedOverAt) : ''}</td>
                            <td className="num">{formatMoney(order.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          );
        }}
      </Status>
    </section>
  );
}

export function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' }) {
  return (
    <div className={`stat${tone ? ` stat--${tone}` : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}
