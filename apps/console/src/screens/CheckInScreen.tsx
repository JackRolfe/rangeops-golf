import { Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLoad } from '../api/context';
import { QrCode } from '../components/QrCode';
import { Status } from '../components/Status';
import { checkInUrl } from '../domain/checkIn';
import type { Bay, Range } from '../domain/types';

export function CheckInScreen() {
  const { state } = useLoad((api) => api.getSetup(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [printing, setPrinting] = useState<'all' | 'one' | null>(null);

  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    // Let the print sheet render before the dialog opens.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  return (
    <section className="screen">
      <Status state={state}>
        {({ range, bays }) => {
          const inService = bays.filter((b) => b.inService);
          const bay = inService.find((b) => b.id === selected) ?? inService[0];
          return (
            <>
              <header className="screen__head no-print">
                <div>
                  <h1>Check-in QR</h1>
                  <p>One code per bay. Players scan it to start their booking and, with a robot hired, unlock it.</p>
                </div>
                <div className="screen__actions">
                  <button className="button" type="button" onClick={() => setPrinting('all')}>
                    <Printer size={16} aria-hidden="true" /> Print all {inService.length} bays
                  </button>
                </div>
              </header>

              <div className="checkin no-print">
                <nav className="bay-picker" aria-label="Bays">
                  {inService.map((b) => (
                    <button key={b.id} type="button" className="bay-chip" aria-pressed={b.id === bay?.id} onClick={() => setSelected(b.id)}>
                      {b.number}
                    </button>
                  ))}
                </nav>
                {bay && (
                  <section className="panel checkin__one" aria-label={`${bay.name} check-in code`}>
                    <BayCard range={range} bay={bay} />
                    <p className="url">{checkInUrl(range, bay)}</p>
                    <div>
                      <button className="button button--quiet" type="button" onClick={() => setPrinting('one')}>
                        <Printer size={16} aria-hidden="true" /> Print {bay.name}
                      </button>
                    </div>
                  </section>
                )}
              </div>

              {printing && (
                <div className="print-sheet" aria-hidden="true">
                  {(printing === 'all' ? inService : bay ? [bay] : []).map((b) => (
                    <BayCard key={b.id} range={range} bay={b} />
                  ))}
                </div>
              )}
            </>
          );
        }}
      </Status>
    </section>
  );
}

function BayCard({ range, bay }: { range: Range; bay: Bay }) {
  return (
    <div className="bay-card">
      <div className="bay-card__head">
        <span className="brand"><i aria-hidden="true" />RangeOps</span>
        <span className="bay-card__number">{bay.number}</span>
      </div>
      <QrCode text={checkInUrl(range, bay)} label={`QR code to check in at ${bay.name}`} />
      <p className="bay-card__foot">Scan to check in at <strong>{bay.name}</strong></p>
      <p className="bay-card__range">{range.name}</p>
    </div>
  );
}
