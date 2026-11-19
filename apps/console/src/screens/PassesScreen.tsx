import { Package, Plus, Search } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useConsole, useLoad } from '../api/context';
import { Errors, Status } from '../components/Status';
import { formatMoney } from '../domain/money';
import { passBalance } from '../domain/passes';
import { toIsoDate } from '../domain/time';
import type { PassKind } from '../domain/types';

const dateFormat = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const showDate = (iso: string) => dateFormat.format(new Date(`${iso.slice(0, 10)}T12:00`));

export function PassesScreen() {
  const { api, clock } = useConsole();
  const today = toIsoDate(clock());
  const { state, reload } = useLoad(async (a) => ({ passes: await a.listPasses(), setup: await a.getSetup() }), []);
  const [player, setPlayer] = useState('');
  const [kind, setKind] = useState<PassKind>('credits');
  const [filter, setFilter] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const sell = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api.sellPass(player, kind);
    if (result.ok) {
      setErrors([]);
      setNotice(`Sold a ${kind === 'monthly' ? 'monthly pass' : 'credit pack'} to ${result.value.player}.`);
      setPlayer('');
    } else {
      setNotice(null);
      setErrors(result.errors);
    }
    await reload();
  };

  const redeem = async (passId: string) => {
    const result = await api.redeemPassBucket(passId);
    if (result.ok) {
      setErrors([]);
      setNotice(`Hand ${result.value.pass.player} a medium bucket.`);
    } else {
      setNotice(null);
      setErrors(result.errors);
    }
    await reload();
  };

  return (
    <section className="screen">
      <header className="screen__head">
        <div>
          <h1>Passes</h1>
          <p>Monthly passes and ball credits, held on players' accounts.</p>
        </div>
      </header>

      <Errors errors={errors} />
      {notice && <p className="notice" role="status">{notice}</p>}

      <Status state={state}>
        {({ passes, setup }) => {
          const { monthlyPass, creditPack } = setup.prices;
          const shown = passes.filter((p) => p.player.toLowerCase().includes(filter.trim().toLowerCase()));
          return (
            <>
              <form className="panel" onSubmit={sell} aria-labelledby="sell-heading">
                <div className="panel__head">
                  <h2 id="sell-heading">Sell at the counter</h2>
                  <p>Recorded as paid, so it shows in today's takings.</p>
                </div>
                <div className="row">
                  <label className="field grow">
                    <span>Player</span>
                    <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Name on the account" />
                  </label>
                  <fieldset className="choice">
                    <legend>What</legend>
                    <label className="check">
                      <input type="radio" name="kind" checked={kind === 'credits'} onChange={() => setKind('credits')} />
                      Credit pack: {creditPack.credits} buckets, {formatMoney(creditPack.price)}
                    </label>
                    <label className="check">
                      <input type="radio" name="kind" checked={kind === 'monthly'} onChange={() => setKind('monthly')} />
                      Monthly pass: {monthlyPass.bucketsPerMonth} buckets and {monthlyPass.bayHoursPerMonth} bay-hours a month for {monthlyPass.months} month{monthlyPass.months === 1 ? '' : 's'}, {formatMoney(monthlyPass.price)}
                    </label>
                  </fieldset>
                  <button className="button" type="submit" disabled={!player.trim()}>
                    <Plus size={16} aria-hidden="true" /> Sell
                  </button>
                </div>
              </form>

              <section className="panel" aria-labelledby="passes-heading">
                <div className="panel__head">
                  <h2 id="passes-heading">All passes</h2>
                  <label className="search">
                    <Search size={16} aria-hidden="true" />
                    <input className="input" aria-label="Find a player" placeholder="Find a player" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  </label>
                </div>
                {shown.length === 0 ? (
                  <p className="empty">No passes{filter ? ` for “${filter}”` : ''}.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="table" aria-label="Passes">
                      <thead>
                        <tr><th>Player</th><th>Kind</th><th>Sold</th><th>Valid until</th><th className="num">Buckets left</th><th className="num">Bay-hours left</th><th>Status</th><th /></tr>
                      </thead>
                      <tbody>
                        {shown.map((pass) => {
                          const balance = passBalance(pass, today);
                          return (
                            <tr key={pass.id}>
                              <td>{pass.player}</td>
                              <td>{pass.kind === 'monthly' ? 'Monthly pass' : 'Credit pack'}</td>
                              <td>{showDate(pass.soldAt)}</td>
                              <td>{pass.validUntil ? showDate(pass.validUntil) : 'No expiry'}</td>
                              <td className="num">{balance.bucketsLeft}{pass.kind === 'monthly' ? ' this month' : ''}</td>
                              <td className="num">{pass.kind === 'monthly' ? balance.bayHoursLeft : '–'}</td>
                              <td>
                                {!balance.active ? (
                                  <span className="pill pill--bad">Ended</span>
                                ) : balance.bucketsLeft === 0 ? (
                                  <span className="pill pill--warn">Used up</span>
                                ) : (
                                  <span className="pill pill--good">Active</span>
                                )}
                              </td>
                              <td className="actions">
                                <button
                                  className="button button--small"
                                  type="button"
                                  disabled={!balance.active || balance.bucketsLeft === 0}
                                  onClick={() => redeem(pass.id)}
                                  aria-label={`Redeem a bucket for ${pass.player}`}
                                >
                                  <Package size={14} aria-hidden="true" /> Redeem bucket
                                </button>
                              </td>
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
