import { BatteryLow, BatteryMedium, BatteryFull, Bot } from 'lucide-react';
import { useConsole, useLoad } from '../api/context';
import { Status } from '../components/Status';
import { LOW_BATTERY } from '../domain/fleet';
import { bayStates, type BayNow, type BayState } from '../domain/live';
import { formatMoney } from '../domain/money';
import { takings } from '../domain/takings';
import { hourLabel, timeLabel, toIsoDate, toLocalDateTime } from '../domain/time';
import type { Robot, RobotState } from '../domain/types';
import { Stat } from './TodayScreen';

const REFRESH_MS = 5_000;

const BAY_STATE_LABEL: Record<BayState, string> = {
  'in-use': 'In use',
  waiting: 'Not checked in',
  'booked-later': 'Free',
  free: 'Free',
  'out-of-service': 'Out of service',
};

const ROBOT_STATE: Record<RobotState, { label: string; tone: 'good' | 'warn' | 'bad' | 'quiet' }> = {
  docked: { label: 'Docked', tone: 'quiet' },
  charging: { label: 'Charging', tone: 'quiet' },
  idle: { label: 'Idle at bay', tone: 'good' },
  driving: { label: 'Driving', tone: 'good' },
  'at-limit': { label: 'At lane limit', tone: 'warn' },
  'link-lost': { label: 'Link lost', tone: 'bad' },
  stopped: { label: 'Stopped by switch', tone: 'bad' },
  fault: { label: 'Fault', tone: 'bad' },
  'low-battery': { label: 'Low battery', tone: 'bad' },
  locked: { label: 'Locked', tone: 'warn' },
};

export function LiveScreen() {
  const { clock } = useConsole();
  const { state } = useLoad(
    async (api) => {
      const now = clock();
      const today = toIsoDate(now);
      const [setup, bookings, robots, payments] = await Promise.all([api.getSetup(), api.listBookings(today), api.listRobots(), api.listPayments(today)]);
      return { at: toLocalDateTime(now), setup, bookings, robots, payments };
    },
    [],
    REFRESH_MS,
  );

  return (
    <section className="screen">
      <Status state={state}>
        {({ at, setup, bookings, robots, payments }) => {
          const bays = bayStates(setup.bays, bookings, at);
          const money = takings(payments);
          const inUse = bays.filter((b) => b.state === 'in-use').length;
          const inService = bays.filter((b) => b.state !== 'out-of-service').length;
          const out = robots.filter((r) => r.hire).length;
          const bayName = new Map(setup.bays.map((b) => [b.id, b.name]));
          return (
            <>
              <header className="screen__head">
                <div>
                  <h1>Live</h1>
                  <p>{setup.range.name} at {timeLabel(at)}. Updates every few seconds.</p>
                </div>
              </header>

              <div className="stats">
                <Stat label="Bays in use" value={`${inUse} of ${inService}`} />
                <Stat label="Robots out" value={`${out} of ${robots.length}`} />
                <Stat label="Taken today" value={formatMoney(money.total)} tone="good" />
              </div>

              <div className="live">
                <section className="panel" aria-labelledby="bays-heading">
                  <div className="panel__head">
                    <h2 id="bays-heading">Bays</h2>
                    <p className="legend">
                      <span className="dot dot--in-use" /> In use <span className="dot dot--waiting" /> Not checked in <span className="dot dot--free" /> Free
                    </p>
                  </div>
                  <ul className="bay-grid" aria-label="Bays now">
                    {bays.map((b) => (
                      <BayTile key={b.bay.id} now={b} robot={robots.find((r) => r.hire?.bayId === b.bay.id)} />
                    ))}
                  </ul>
                </section>

                <div className="stack">
                  <section className="panel" aria-labelledby="robots-heading">
                    <div className="panel__head">
                      <h2 id="robots-heading">Robots</h2>
                    </div>
                    <ul className="robot-list" aria-label="Robots">
                      {robots.map((robot) => (
                        <RobotRow key={robot.id} robot={robot} bayName={robot.hire ? bayName.get(robot.hire.bayId) ?? robot.hire.bayId : null} />
                      ))}
                    </ul>
                  </section>

                  <section className="panel" aria-labelledby="takings-heading">
                    <div className="panel__head">
                      <h2 id="takings-heading">Today's takings</h2>
                      <p>Counted when paid.</p>
                    </div>
                    <table className="table" aria-label="Today's takings">
                      <tbody>
                        <tr><td>Bay bookings</td><td className="num">{formatMoney(money.byKind.bay)}</td></tr>
                        <tr><td>Robot hires</td><td className="num">{formatMoney(money.byKind.robot)}</td></tr>
                        <tr><td>Buckets</td><td className="num">{formatMoney(money.byKind.bucket)}</td></tr>
                        <tr><td>Passes and credits</td><td className="num">{formatMoney(money.byKind.pass)}</td></tr>
                        {money.refunds > 0 && (
                          <tr className="note"><td>Refunds, already taken off</td><td className="num">−{formatMoney(money.refunds)}</td></tr>
                        )}
                        <tr className="total"><th scope="row">Total</th><td className="num" data-testid="takings-total">{formatMoney(money.total)}</td></tr>
                      </tbody>
                    </table>
                  </section>
                </div>
              </div>
            </>
          );
        }}
      </Status>
    </section>
  );
}

function BayTile({ now, robot }: { now: BayNow; robot?: Robot }) {
  const { bay, state, current, next } = now;
  return (
    <li className={`bay-tile bay-tile--${state}`} aria-label={`${bay.name}: ${BAY_STATE_LABEL[state]}`}>
      <div className="bay-tile__top">
        <span className="bay-tile__number">{bay.number}</span>
        {robot && <Bot size={16} aria-label={`${robot.name} hired`} />}
      </div>
      <span className="bay-tile__state">{BAY_STATE_LABEL[state]}</span>
      {current && (
        <span className="bay-tile__detail">
          {current.player}, to {hourLabel(current.start + current.hours)}
        </span>
      )}
      {!current && next && <span className="bay-tile__detail">Next {hourLabel(next.start)}</span>}
    </li>
  );
}

function RobotRow({ robot, bayName }: { robot: Robot; bayName: string | null }) {
  const known = robot.battery !== null;
  const battery = Math.round(robot.battery ?? 0);
  const low = known && battery < LOW_BATTERY;
  const Icon = low ? BatteryLow : battery < 80 ? BatteryMedium : BatteryFull;
  const state = ROBOT_STATE[robot.state];
  return (
    <li className="robot-row">
      <div className="robot-row__name">
        <Bot size={20} aria-hidden="true" />
        <div>
          <strong>{robot.name}</strong>
          <span>{robot.hire ? `${bayName} until ${timeLabel(robot.hire.until)}` : 'On the dock'}</span>
        </div>
      </div>
      <span className={`pill pill--${state.tone === 'quiet' ? 'plain' : state.tone}`}>{state.label}</span>
      <div className={`battery${low ? ' battery--low' : ''}`} aria-label={known ? `Battery ${battery}%` : 'Battery not reported yet'}>
        <Icon size={18} aria-hidden="true" />
        <span className="battery__bar"><span style={{ width: `${battery}%` }} /></span>
        <span className="battery__pct">{known ? `${battery}%` : '–'}</span>
      </div>
    </li>
  );
}
