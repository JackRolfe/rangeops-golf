import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useConsole, useLoad } from '../api/context';
import { MoneyInput, NumberInput } from '../components/MoneyInput';
import { Errors, Status } from '../components/Status';
import { formatMoney } from '../domain/money';
import { quoteBooking } from '../domain/pricing';
import { nextBay, validateSetup } from '../domain/setup';
import { hourLabel, toIsoDate, WEEKDAY_NAMES } from '../domain/time';
import type { PriceBand, RangeSetup, Weekday } from '../domain/types';
import { BUCKET_SIZES, PRICE_BANDS } from '../domain/types';

export function SetupScreen() {
  const { state, reload } = useLoad((api) => api.getSetup(), []);
  return (
    <section className="screen">
      <Status state={state}>
        {(setup) => <SetupEditor key={JSON.stringify(setup)} initial={setup} onSaved={reload} />}
      </Status>
    </section>
  );
}

const BAND_LABEL: Record<PriceBand, string> = { standard: 'Standard', premium: 'Premium' };
const DAY_SHORT = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function SetupEditor({ initial, onSaved }: { initial: RangeSetup; onSaved: () => void }) {
  const { api } = useConsole();
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);
  const liveErrors = useMemo(() => validateSetup(draft), [draft]);

  const edit = (change: (setup: RangeSetup) => void) =>
    setDraft((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });

  const save = async () => {
    setSaving(true);
    const result = await api.saveSetup(draft);
    setSaving(false);
    if (result.ok) {
      setErrors([]);
      onSaved();
    } else setErrors(result.errors);
  };

  return (
    <>
      <header className="screen__head">
        <div>
          <h1>Setup</h1>
          <p>Bays, opening hours and prices for {initial.range.name}.</p>
        </div>
        <div className="screen__actions">
          {dirty && <span className="pill pill--warn">Unsaved changes</span>}
          <button className="button button--quiet" type="button" disabled={!dirty} onClick={() => { setDraft(initial); setErrors([]); }}>
            <RotateCcw size={16} aria-hidden="true" /> Undo changes
          </button>
          <button className="button" type="button" disabled={!dirty || saving} onClick={save}>
            <Save size={16} aria-hidden="true" /> Save
          </button>
        </div>
      </header>

      <Errors errors={errors.length ? errors : dirty ? liveErrors : []} />

      <div className="grid-2">
        <div className="stack">
          <section className="panel" aria-labelledby="prices-heading">
            <div className="panel__head">
              <h2 id="prices-heading">Bay prices</h2>
              <p>Per bay-hour. Nothing may go under the floor.</p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Band</th><th>Off-peak</th><th>Peak</th><th>Floor</th></tr>
                </thead>
                <tbody>
                  {PRICE_BANDS.map((band) => (
                    <tr key={band}>
                      <th scope="row">{BAND_LABEL[band]}</th>
                      {(['offPeak', 'peak', 'floor'] as const).map((key) => (
                        <td key={key}>
                          <MoneyInput
                            label={`${BAND_LABEL[band]} ${key === 'offPeak' ? 'off-peak' : key}`}
                            value={draft.prices.bands[band][key]}
                            onChange={(cents) => edit((s) => { s.prices.bands[band][key] = cents; })}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3>Peak windows</h3>
            {draft.prices.peakWindows.length === 0 && <p className="empty">No peak windows: every hour is off-peak.</p>}
            {draft.prices.peakWindows.map((window, index) => (
              <div className="row peak-window" key={index}>
                <fieldset className="days">
                  <legend>Days</legend>
                  {DAY_SHORT.map((label, day) => (
                    <label key={label} className="day-toggle">
                      <input
                        type="checkbox"
                        checked={window.days.includes(day as Weekday)}
                        onChange={(event) =>
                          edit((s) => {
                            const days = s.prices.peakWindows[index].days.filter((d) => d !== day);
                            if (event.target.checked) days.push(day as Weekday);
                            s.prices.peakWindows[index].days = days.sort();
                          })
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <NumberInput label="From" value={window.start} max={24} onChange={(n) => edit((s) => { s.prices.peakWindows[index].start = n; })} />
                <NumberInput label="To" value={window.end} max={24} onChange={(n) => edit((s) => { s.prices.peakWindows[index].end = n; })} />
                <button className="button button--danger button--small" type="button" aria-label="Remove peak window" onClick={() => edit((s) => { s.prices.peakWindows.splice(index, 1); })}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div>
              <button className="button button--quiet button--small" type="button" onClick={() => edit((s) => { s.prices.peakWindows.push({ days: [1, 2, 3, 4, 5], start: 16, end: 20 }); })}>
                <Plus size={15} aria-hidden="true" /> Add peak window
              </button>
            </div>
          </section>

          <section className="panel" aria-labelledby="extras-heading">
            <div className="panel__head">
              <h2 id="extras-heading">Robot, buckets and passes</h2>
              {!api.capabilities.editProducts && <p>Set in the backend for now; shown here read-only.</p>}
            </div>
            <fieldset className="plain" disabled={!api.capabilities.editProducts}>
            <div className="row">
              <MoneyInput label="Robot hire per hour" value={draft.prices.robotHirePerHour} onChange={(c) => edit((s) => { s.prices.robotHirePerHour = c; })} />
              {BUCKET_SIZES.map((size) => (
                <MoneyInput
                  key={size}
                  label={`${size[0].toUpperCase()}${size.slice(1)} bucket (${draft.prices.bucketBalls[size]})`}
                  value={draft.prices.buckets[size]}
                  onChange={(c) => edit((s) => { s.prices.buckets[size] = c; })}
                />
              ))}
            </div>
            <div className="row">
              <MoneyInput label="Monthly pass" value={draft.prices.monthlyPass.price} onChange={(c) => edit((s) => { s.prices.monthlyPass.price = c; })} />
              <NumberInput label="Days" min={1} value={draft.prices.monthlyPass.days} onChange={(n) => edit((s) => { s.prices.monthlyPass.days = n; })} />
              <NumberInput label="Discount %" max={100} value={draft.prices.monthlyPass.discountPercent} onChange={(n) => edit((s) => { s.prices.monthlyPass.discountPercent = n; })} />
            </div>
            <div className="row">
              <MoneyInput label="Ball credit" value={draft.prices.creditPack.price} onChange={(c) => edit((s) => { s.prices.creditPack.price = c; })} />
              <NumberInput label="Balls of credit" min={1} value={draft.prices.creditPack.balls} onChange={(n) => edit((s) => { s.prices.creditPack.balls = n; })} />
            </div>
            </fieldset>
          </section>

          <PricePreview setup={draft} />
        </div>

        <div className="stack">
          <section className="panel" aria-labelledby="hours-heading">
            <div className="panel__head">
              <h2 id="hours-heading">Opening hours</h2>
              <p>Whole hours. Bookings must fit inside them.</p>
            </div>
            <table className="table">
              <tbody>
                {WEEKDAY_NAMES.map((name, day) => {
                  const hours = draft.openingHours[day];
                  return (
                    <tr key={name}>
                      <th scope="row">{name}</th>
                      <td>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={hours !== null}
                            onChange={(event) => edit((s) => { s.openingHours[day] = event.target.checked ? { open: 7, close: 22 } : null; })}
                          />
                          Open
                        </label>
                      </td>
                      <td>
                        {hours ? (
                          <div className="row">
                            <NumberInput label="Opens" value={hours.open} max={24} onChange={(n) => edit((s) => { s.openingHours[day]!.open = n; })} />
                            <NumberInput label="Closes" value={hours.close} max={24} onChange={(n) => edit((s) => { s.openingHours[day]!.close = n; })} />
                          </div>
                        ) : (
                          <span className="pill">Closed</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="panel" aria-labelledby="range-heading">
            <div className="panel__head">
              <h2 id="range-heading">Range</h2>
            </div>
            <div className="row">
              <label className="field grow">
                <span>Name</span>
                <input className="input" value={draft.range.name} onChange={(e) => edit((s) => { s.range.name = e.target.value; })} />
              </label>
              <label className="field grow">
                <span>Public app URL (for check-in codes)</span>
                <input
                  className="input"
                  value={draft.range.publicAppUrl}
                  readOnly={!api.capabilities.editPublicAppUrl}
                  onChange={(e) => edit((s) => { s.range.publicAppUrl = e.target.value; })}
                />
              </label>
            </div>
          </section>

          <section className="panel" aria-labelledby="bays-heading">
            <div className="panel__head">
              <h2 id="bays-heading">Bays</h2>
              <p>{draft.bays.filter((b) => b.inService).length} of {draft.bays.length} in service</p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>No.</th><th>Name</th><th>Band</th><th>In service</th></tr>
                </thead>
                <tbody>
                  {draft.bays.map((bay, index) => (
                    <tr key={bay.id}>
                      <td className="num">{bay.number}</td>
                      <td>
                        <input className="input" aria-label={`Bay ${bay.number} name`} value={bay.name} onChange={(e) => edit((s) => { s.bays[index].name = e.target.value; })} />
                      </td>
                      <td>
                        <select className="select" aria-label={`Bay ${bay.number} band`} value={bay.band} onChange={(e) => edit((s) => { s.bays[index].band = e.target.value as PriceBand; })}>
                          {PRICE_BANDS.map((band) => <option key={band} value={band}>{BAND_LABEL[band]}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`Bay ${bay.number} in service`} checked={bay.inService} onChange={(e) => edit((s) => { s.bays[index].inService = e.target.checked; })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <button className="button button--quiet button--small" type="button" onClick={() => edit((s) => { s.bays.push(nextBay(s.bays)); })}>
                <Plus size={15} aria-hidden="true" /> Add a bay
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function PricePreview({ setup }: { setup: RangeSetup }) {
  const { clock } = useConsole();
  const bays = setup.bays.filter((b) => b.inService);
  const [bayId, setBayId] = useState(bays[0]?.id ?? '');
  const [date, setDate] = useState(() => toIsoDate(clock()));
  const [start, setStart] = useState(15);
  const [hours, setHours] = useState(3);
  const [robotHire, setRobotHire] = useState(false);
  const bay = setup.bays.find((b) => b.id === bayId) ?? bays[0];
  const quote = bay ? quoteBooking({ prices: setup.prices, openingHours: setup.openingHours, bay, date, start, hours, robotHire }) : null;

  return (
    <section className="panel" aria-labelledby="preview-heading">
      <div className="panel__head">
        <h2 id="preview-heading">Price preview</h2>
        <p>What a booking costs with the prices above, saved or not.</p>
      </div>
      <div className="row">
        <label className="field">
          <span>Bay</span>
          <select className="select" value={bay?.id ?? ''} onChange={(e) => setBayId(e.target.value)}>
            {bays.map((b) => <option key={b.id} value={b.id}>{b.name} ({BAND_LABEL[b.band].toLowerCase()})</option>)}
          </select>
        </label>
        <label className="field">
          <span>Day</span>
          <input className="input" type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <NumberInput label="Start hour" value={start} max={23} onChange={setStart} />
        <NumberInput label="Hours" min={1} value={hours} max={12} onChange={setHours} />
        <label className="check">
          <input type="checkbox" checked={robotHire} onChange={(e) => setRobotHire(e.target.checked)} /> Robot
        </label>
      </div>
      {quote && !quote.ok && <Errors errors={quote.errors} />}
      {quote?.ok && (
        <table className="table" aria-label="Price preview">
          <tbody>
            {quote.value.lines.map((line) => (
              <tr key={line.hour}>
                <td>{hourLabel(line.hour)}</td>
                <td>{line.peak ? <span className="pill pill--warn">Peak</span> : <span className="pill">Off-peak</span>}</td>
                <td className="num">{formatMoney(line.price)}</td>
              </tr>
            ))}
            {robotHire && (
              <tr>
                <td>Robot hire</td>
                <td>{hours} h</td>
                <td className="num">{formatMoney(quote.value.robotTotal)}</td>
              </tr>
            )}
            <tr className="total">
              <th scope="row" colSpan={2}>Total</th>
              <td className="num" data-testid="preview-total">{formatMoney(quote.value.total)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
