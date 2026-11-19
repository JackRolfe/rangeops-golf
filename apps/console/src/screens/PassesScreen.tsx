import { Package, Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useConsole, useLoad } from '../api/context';
import { bucketLabel } from '../components/labels';
import { Errors, Status } from '../components/Status';
import { formatMoney } from '../domain/money';
import { passBalance } from '../domain/passes';
import { toIsoDate } from '../domain/time';
import { BUCKET_SIZES, type BucketSize, type PassKind } from '../domain/types';

const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const showDate = (iso: string) => dateFormat.format(new Date(`${iso.slice(0, 10)}T12:00`));

export function PassesScreen() {
  const { api, clock } = useConsole();
  const { sellPasses, redeemPasses } = api.capabilities;
  const today = toIsoDate(clock());
  const { state, reload } = useLoad(async (a) => ({ passes: await a.listPasses(), setup: await a.getSetup() }), []);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [kind, setKind] = useState<PassKind>('credits');
  const [bucket, setBucket] = useState<BucketSize>('medium');
  const [filter, setFilter] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (work: () => Promise<{ ok: true; message: string } | { ok: false; errors: string[] }>) => {
    setBusy(true);
    try {
      const result = await work();
      setErrors(result.ok ? [] : result.errors);
      setNotice(result.ok ? result.message : null);
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)]);
      setNotice(null);
    } finally {
      setBusy(false);
      await reload();
    }
  };

  const sell = (event: FormEvent) => {
    event.preventDefault();
    void act(async () => {
      const result = await api.sellPass({ email, name: name.trim() || undefined, kind });
      if (!result.ok) return result;
      setName('');
      setEmail('');
      const pass = result.value;
      return {
        ok: true,
        message:
          pass.kind === 'monthly'
            ? `Sold a monthly pass to ${pass.player}, valid until ${showDate(pass.validUntil!)}.`
            : `Sold ball credit to ${pass.player}: ${pass.ballsLeft} balls now.`,
      };
    });
  };

  const redeem = (passId: string) =>
    act(async () => {
      const result = await api.redeemBallCredit(passId, bucket);
      if (!result.ok) return result;
      const { pass, order } = result.value;
      return { ok: true, message: `Hand ${pass.player} a ${order.bucket} bucket (${order.balls} balls). ${pass.ballsLeft} balls of credit left.` };
    });

  return (
    <section className="screen">
      <header className="screen__head">
        <div>
          <h1>Passes</h1>
          <p>Monthly passes and ball credit, held on players' accounts.</p>
        </div>
      </header>

      <Errors errors={errors} />
      {notice && <p className="notice" role="status">{notice}</p>}

      <Status state={state}>
        {({ passes, setup }) => {
          const { monthlyPass, creditPack, bucketBalls } = setup.prices;
          const needle = filter.trim().toLowerCase();
          const shown = passes.filter((p) => `${p.player} ${p.email}`.toLowerCase().includes(needle));
          return (
            <>
              {sellPasses ? (
                <form className="panel" onSubmit={sell} aria-labelledby="sell-heading">
                  <div className="panel__head">
                    <h2 id="sell-heading">Sell at the counter</h2>
                    <p>Recorded as paid, so it shows in today's takings. The player finds it in the app under this email.</p>
                  </div>
                  <div className="row">
                    <label className="field grow">
                      <span>Player's email</span>
                      <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
                    </label>
                    <label className="field grow">
                      <span>Name (optional)</span>
                      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="As they'd like it shown" />
                    </label>
                  </div>
                  <div className="row">
                    <fieldset className="choice">
                      <legend>What</legend>
                      <label className="check">
                        <input type="radio" name="kind" checked={kind === 'credits'} onChange={() => setKind('credits')} />
                        Ball credit: {creditPack.balls} balls, {formatMoney(creditPack.price)}
                      </label>
                      <label className="check">
                        <input type="radio" name="kind" checked={kind === 'monthly'} onChange={() => setKind('monthly')} />
                        Monthly pass: {monthlyPass.discountPercent}% off bay-hours and buckets for {monthlyPass.days} days, {formatMoney(monthlyPass.price)}
                      </label>
                    </fieldset>
                    <button className="button" type="submit" disabled={busy || !email.trim()}>
                      <Plus size={16} aria-hidden="true" /> Sell
                    </button>
                  </div>
                </form>
              ) : (
                <p className="notice">Passes and ball credit are bought in the RangeOps app here; this data source can't sell them at the counter.</p>
              )}

              <section className="panel" aria-labelledby="passes-heading">
                <div className="panel__head">
                  <h2 id="passes-heading">All passes and credit</h2>
                  <div className="row">
                    {redeemPasses && (
                      <label className="field">
                        <span>Hand out from credit</span>
                        <select className="select" value={bucket} onChange={(e) => setBucket(e.target.value as BucketSize)}>
                          {BUCKET_SIZES.map((size) => (
                            <option key={size} value={size}>
                              {bucketLabel(size, bucketBalls[size])}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="search">
                      <Search size={16} aria-hidden="true" />
                      <input className="input" aria-label="Find a player" placeholder="Find a player" value={filter} onChange={(e) => setFilter(e.target.value)} />
                    </label>
                  </div>
                </div>
                {shown.length === 0 ? (
                  <p className="empty">No passes{filter ? ` for “${filter}”` : ''}.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table" aria-label="Passes">
                      <thead>
                        <tr><th>Player</th><th>Kind</th><th>Sold</th><th>Valid until</th><th>What's left</th><th>Status</th>{redeemPasses && <th />}</tr>
                      </thead>
                      <tbody>
                        {shown.map((pass) => {
                          const balance = passBalance(pass, today);
                          const canRedeem = pass.kind === 'credits' && pass.ballsLeft >= bucketBalls[bucket];
                          return (
                            <tr key={pass.id}>
                              <td title={pass.email}>{pass.player}</td>
                              <td>{pass.kind === 'monthly' ? 'Monthly pass' : 'Ball credit'}</td>
                              <td>{pass.soldAt ? showDate(pass.soldAt) : '–'}</td>
                              <td>{pass.validUntil ? showDate(pass.validUntil) : 'No expiry'}</td>
                              <td>{balance.summary}</td>
                              <td>
                                {!balance.active ? (
                                  <span className="pill pill--bad">Ended</span>
                                ) : balance.usedUp ? (
                                  <span className="pill pill--warn">Used up</span>
                                ) : (
                                  <span className="pill pill--good">Active</span>
                                )}
                              </td>
                              {redeemPasses && (
                                <td className="actions">
                                  {pass.kind === 'credits' && (
                                    <button
                                      className="button button--small"
                                      type="button"
                                      disabled={busy || !canRedeem}
                                      onClick={() => redeem(pass.id)}
                                      aria-label={`Hand ${pass.player} a ${bucket} bucket from their credit`}
                                    >
                                      <Package size={14} aria-hidden="true" /> Hand out {bucket}
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
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
