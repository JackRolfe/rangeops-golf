import { CheckCircle2, CircleAlert, CircleX, Package } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useConsole, useLoad } from '../api/context';
import { bucketLabel, SOURCE_LABEL } from '../components/labels';
import { Status } from '../components/Status';
import type { HandoverResult } from '../domain/buckets';
import { formatMoney } from '../domain/money';
import { timeLabel, toIsoDate } from '../domain/time';
import { BUCKET_BALLS } from '../domain/types';

export function HandoverScreen() {
  const { api, clock } = useConsole();
  const today = toIsoDate(clock());
  const [code, setCode] = useState('');
  const [result, setResult] = useState<HandoverResult | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const { state, reload } = useLoad((a) => a.listOrders(today), [today], 15_000);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setResult(await api.handOverBucket(code));
    setBusy(false);
    setCode('');
    input.current?.focus();
    await reload();
  };

  return (
    <section className="screen">
      <header className="screen__head">
        <div>
          <h1>Handover</h1>
          <p>Type or scan the code on the player's phone. Case, spaces and dashes don't matter.</p>
        </div>
      </header>

      <div className="grid-2">
        <div className="stack">
          <form className="panel" onSubmit={submit} aria-label="Hand over a bucket">
            <label className="field">
              <span>Bucket code</span>
              <input
                ref={input}
                className="input input--big"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="ABC-234"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <div>
              <button className="button" type="submit" disabled={!code.trim() || busy}>
                <Package size={16} aria-hidden="true" /> Check code
              </button>
            </div>
          </form>
          {result && <HandoverCard result={result} />}
        </div>

        <section className="panel" aria-labelledby="recent-heading">
          <div className="panel__head">
            <h2 id="recent-heading">Handed over today</h2>
          </div>
          <Status state={state}>
            {(orders) => {
              const handed = orders
                .filter((o) => o.handedOverAt)
                .sort((a, b) => (b.handedOverAt ?? '').localeCompare(a.handedOverAt ?? ''))
                .slice(0, 10);
              const waiting = orders.filter((o) => o.status === 'paid').length;
              return (
                <>
                  <p className="empty">{waiting} paid bucket{waiting === 1 ? '' : 's'} still to collect.</p>
                  {handed.length === 0 ? (
                    <p className="empty">Nothing handed over yet today.</p>
                  ) : (
                    <table className="table" aria-label="Recent handovers">
                      <thead>
                        <tr><th>At</th><th>Code</th><th>Bucket</th><th>From</th></tr>
                      </thead>
                      <tbody>
                        {handed.map((o) => (
                          <tr key={o.id}>
                            <td>{timeLabel(o.handedOverAt!)}</td>
                            <td className="code">{o.code}</td>
                            <td>{bucketLabel(o.bucket)}</td>
                            <td>{o.passId ? 'Pass' : SOURCE_LABEL[o.source]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </>
              );
            }}
          </Status>
        </section>
      </div>
    </section>
  );
}

function HandoverCard({ result }: { result: HandoverResult }) {
  switch (result.outcome) {
    case 'handed-over':
      return (
        <div className="result result--good" role="status">
          <CheckCircle2 size={36} aria-hidden="true" />
          <div>
            <h2>Hand over a {result.order.bucket} bucket</h2>
            <p className="result__big">{BUCKET_BALLS[result.order.bucket]} balls</p>
            <p>Code {result.order.code}, paid {formatMoney(result.order.amount)} at {timeLabel(result.order.paidAt)}.</p>
          </div>
        </div>
      );
    case 'already-handed-over':
      return (
        <div className="result result--warn" role="alert">
          <CircleAlert size={36} aria-hidden="true" />
          <div>
            <h2>Already handed over</h2>
            <p>Code {result.order.code} was handed over at {timeLabel(result.order.handedOverAt!)}{result.order.handedOverAt!.slice(0, 10) !== result.order.paidAt.slice(0, 10) ? ` on ${result.order.handedOverAt!.slice(0, 10)}` : ''}. Don't give another bucket.</p>
          </div>
        </div>
      );
    case 'refunded':
      return (
        <div className="result result--bad" role="alert">
          <CircleX size={36} aria-hidden="true" />
          <div>
            <h2>Refunded</h2>
            <p>Code {result.order.code} was refunded. Don't give a bucket.</p>
          </div>
        </div>
      );
    case 'not-found':
      return (
        <div className="result result--bad" role="alert">
          <CircleX size={36} aria-hidden="true" />
          <div>
            <h2>No such code</h2>
            <p>Nothing was paid for with {result.code}. Check it with the player.</p>
          </div>
        </div>
      );
    case 'malformed':
      return (
        <div className="result result--bad" role="alert">
          <CircleX size={36} aria-hidden="true" />
          <div>
            <h2>That isn't a bucket code</h2>
            <p>Codes are six letters and numbers, like ABC-234.</p>
          </div>
        </div>
      );
  }
}
