import { useCallback, useEffect, useRef, useState } from 'react';
import { Bluetooth, Unplug } from 'lucide-react';
import { driveMessage, refusalMessage } from '../domain/drive';
import { DriveController } from '../robot/DriveController';
import { issueBenchKey } from '../robot/hireKey';
import { HireKeyRefused, type RobotLink } from '../robot/RobotLink';
import type { RobotInfo, Telemetry } from '../robot/protocol';
import { SIM_DEFAULTS, SimulatedRobot, type SimulatedWorld } from '../robot/SimulatedRobot';
import { AppShell } from '../components/AppShell';
import { Joystick } from '../components/Joystick';
import { LaneView } from '../components/LaneView';
import { PageHeader } from '../components/PageHeader';
import { TabBar, type TabId } from '../components/TabBar';

/** A robot to drive, and its world when it is the simulator. */
export interface DriveTarget {
  link: RobotLink;
  world?: () => SimulatedWorld;
}

export const SIM_BAY = 7;

/** The simulator, unlocked by a bench key the app issues itself. Real keys come from bookings in stage 4. */
export function createSimulatedTarget(): DriveTarget {
  const robot = new SimulatedRobot();
  return { link: robot, world: () => robot.world() };
}

export function issueSimulatorKey(): Promise<Uint8Array> {
  const now = Math.floor(Date.now() / 1000);
  return issueBenchKey({ serial: SIM_DEFAULTS.serial, bay: SIM_BAY, start: now - 300, end: now + 3300 });
}

type Status = 'disconnected' | 'connecting' | 'connected' | 'refused' | 'failed';

interface DriveScreenProps {
  onTab: (tab: TabId) => void;
  createTarget?: () => DriveTarget;
  issueKey?: () => Promise<Uint8Array>;
}

export function DriveScreen({ onTab, createTarget = createSimulatedTarget, issueKey = issueSimulatorKey }: DriveScreenProps) {
  const [status, setStatus] = useState<Status>('disconnected');
  const [problem, setProblem] = useState<string | null>(null);
  const [info, setInfo] = useState<RobotInfo | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const target = useRef<DriveTarget | null>(null);
  const controller = useRef<DriveController | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  const teardown = useCallback(() => {
    controller.current?.dispose();
    controller.current = null;
    unsubscribe.current?.();
    unsubscribe.current = null;
    void target.current?.link.disconnect();
    target.current = null;
  }, []);

  // Leaving the Drive tab lets go of the stick and disconnects.
  useEffect(() => teardown, [teardown]);

  async function connect() {
    teardown();
    setStatus('connecting');
    setProblem(null);
    setTelemetry(null);
    const next = createTarget();
    target.current = next;
    unsubscribe.current = next.link.onTelemetry(setTelemetry);
    try {
      const key = await issueKey();
      const robotInfo = await next.link.connect(key);
      if (target.current !== next) return;
      controller.current = new DriveController(next.link);
      setInfo(robotInfo);
      setStatus('connected');
    } catch (error) {
      if (target.current !== next) return;
      teardown();
      if (error instanceof HireKeyRefused) {
        setStatus('refused');
        setProblem(refusalMessage(error.reason));
      } else {
        setStatus('failed');
        setProblem(error instanceof Error ? error.message : 'Could not reach Mulligan.');
      }
    }
  }

  function disconnect() {
    teardown();
    setStatus('disconnected');
    setTelemetry(null);
    setInfo(null);
  }

  const world = target.current?.world;
  const worldNow = world?.();
  const capacity = worldNow?.capacity ?? SIM_DEFAULTS.capacity;

  return (
    <AppShell className="drive-screen">
      <PageHeader title="Drive" action={<span className="chip">Bay {SIM_BAY}</span>} />
      <div className="screen-scroll drive-body">
        {status === 'connected' ? (
          <>
            {world ? <LaneView world={world} bay={SIM_BAY} /> : null}
            <div className="drive-hud">
              <span>On board<b>{telemetry?.ballsOnBoard ?? '—'} / {capacity}</b></span>
              {worldNow ? <span>Brought back<b>{worldNow.broughtBack}</b></span> : null}
              <span>Battery<b>{telemetry ? `${Math.round(telemetry.batteryPercent)}%` : '—'}</b></span>
              <span>Out<b data-testid="distance">{telemetry?.distanceDm != null ? `${(telemetry.distanceDm / 10).toFixed(1)} m` : '—'}</b></span>
            </div>
            <p className="drive-message" role="status" aria-live="polite">{driveMessage(telemetry, capacity)}</p>
            <div className="drive-controls">
              <Joystick
                onMove={(x, y) => controller.current?.hold(x, y)}
                onRelease={() => controller.current?.release()}
              />
            </div>
            <div className="drive-footer">
              <small>{info?.name}{world ? ' · simulator' : ''}</small>
              <button className="text-button" type="button" onClick={disconnect}>
                <Unplug aria-hidden="true" /> Disconnect
              </button>
            </div>
          </>
        ) : (
          <section className="drive-connect">
            <h2>Drive Mulligan</h2>
            <p>
              Hold the stick to drive out, roll over the balls to scoop them up, and bring them back to the bay.
              Let go and it stops.
            </p>
            <p className="drive-connect__note">
              Mulligan isn’t built yet, so this drives a simulated robot on a pretend lane.
            </p>
            {problem ? <p className="drive-problem" role="alert">{problem}</p> : null}
            <button
              className="button button--primary button--full"
              type="button"
              disabled={status === 'connecting'}
              onClick={() => void connect()}
            >
              <Bluetooth aria-hidden="true" /> {status === 'connecting' ? 'Connecting…' : 'Connect to Mulligan'}
            </button>
          </section>
        )}
      </div>
      <TabBar active="drive" onSelect={onTab} />
    </AppShell>
  );
}
