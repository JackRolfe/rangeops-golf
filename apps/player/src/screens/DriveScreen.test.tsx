// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { benchVerifier, issueBenchKey } from '../robot/hireKey';
import { SimulatedRobot, type SimulatedRobotOptions } from '../robot/SimulatedRobot';
import { DriveScreen } from './DriveScreen';

const NOW = 1_800_000_000;

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => null });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', { configurable: true, value: vi.fn() });
});

afterEach(cleanup);

function setup(options: SimulatedRobotOptions = {}, key = { start: NOW - 60, end: NOW + 3600 }) {
  const robot = new SimulatedRobot({ autoRun: false, balls: [], nowUnix: () => NOW, ...options });
  render(
    <DriveScreen
      onTab={vi.fn()}
      createTarget={() => ({ link: robot, world: () => robot.world() })}
      issueKey={() => issueBenchKey({ serial: 'SIM1', bay: 7, ...key })}
    />,
  );
  const stick = () => screen.getByRole('application', { name: /Joystick/ });
  const pressStick = (dx: number, dy: number) => {
    const pad = stick();
    pad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(pad, { clientX: 50 + dx, clientY: 50 + dy, pointerId: 1 });
  };
  const run = (ms: number) => act(() => robot.advance(ms));
  return { robot, stick, pressStick, run };
}

async function connect() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Connect to Mulligan/ }));
  });
}

describe('DriveScreen', () => {
  it('connects to the simulator and shows its telemetry', async () => {
    setup();
    await connect();
    expect(screen.getByText('Mulligan-SIM1 · simulator')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Hold the stick to drive out');
    expect(screen.getByText('82%')).toBeInTheDocument();
  });

  it('explains a refused hire key', async () => {
    setup({}, { start: NOW - 3600, end: NOW - 1 });
    await connect();
    expect(screen.getByRole('alert')).toHaveTextContent('This hire has ended');
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
  });

  it('drives while the stick is held and stops when it is let go', async () => {
    const { robot, stick, pressStick, run } = setup();
    await connect();
    pressStick(0, -50); // straight up the screen: forward
    run(250);
    expect(robot.world().robot.y).toBeGreaterThan(0.5);
    expect(screen.getByRole('status')).toHaveTextContent('Driving at walking pace. Let go and it stops.');

    fireEvent.pointerUp(stick(), { pointerId: 1 });
    run(1000);
    const stopped = robot.world().robot.y;
    run(1000);
    expect(robot.world().robot.y).toBe(stopped);
    expect(screen.getByRole('status')).toHaveTextContent('Hold the stick to drive out');
  });

  it('says so when the lane limit holds the robot', async () => {
    const { pressStick, run } = setup({ start: { x: 0, y: 30 } });
    await connect();
    pressStick(0, -50);
    run(250);
    expect(screen.getByRole('status')).toHaveTextContent('Far limit. Mulligan goes no further from the bay.');
  });

  it('clears a fault from the Clear fault button once its cause has gone', async () => {
    const { robot, run } = setup();
    await connect();
    robot.firmware.setFaults(2); // tipped over
    run(200);
    expect(screen.getByRole('status')).toHaveTextContent('Mulligan has tipped over');
    robot.firmware.setFaults(0); // set upright
    fireEvent.click(screen.getByRole('button', { name: 'Clear fault' }));
    run(200);
    expect(screen.queryByRole('button', { name: 'Clear fault' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Hold the stick to drive out');
  });

  it('lets go and disconnects when the tab is left', async () => {
    const { robot, pressStick } = setup();
    await connect();
    pressStick(0, -50);
    cleanup();
    await act(async () => {});
    expect(robot.connected).toBe(false);
    expect(robot.firmware.locked).toBe(true);
  });
});

describe('DriveScreen with a hire key', () => {
  const realNow = () => Math.floor(Date.now() / 1000);

  function renderHire(window: { start: number; end: number }) {
    let robot: SimulatedRobot | undefined;
    const keyPromise = issueBenchKey({ serial: 'A1B2', bay: 3, ...window });
    return keyPromise.then((key) => {
      render(
        <DriveScreen
          onTab={vi.fn()}
          hire={{ key, verifier: async () => benchVerifier }}
          createTarget={(hired) => {
            robot = new SimulatedRobot({ autoRun: false, balls: [], ...hired });
            return { link: robot, world: () => robot!.world() };
          }}
        />,
      );
      return () => robot!;
    });
  }

  it('drives the hired robot, which takes the key’s serial and bay', async () => {
    const robot = await renderHire({ start: realNow() - 60, end: realNow() + 3600 });
    expect(screen.getByText(/Mulligan-A1B2 is hired for Bay 3/)).toBeInTheDocument();
    expect(screen.getByText('Bay 3')).toBeInTheDocument();
    await connect();
    expect(screen.getByText('Mulligan-A1B2 · simulator')).toBeInTheDocument();
    expect(robot().firmware.serial).toBe('A1B2');
  });

  it('is refused before the hire starts, with the reason', async () => {
    await renderHire({ start: realNow() + 3600, end: realNow() + 7200 });
    await connect();
    expect(screen.getByRole('alert')).toHaveTextContent('This hire hasn’t started yet.');
  });

  it('says when a hire link was broken', () => {
    render(<DriveScreen onTab={vi.fn()} badHireLink />);
    expect(screen.getByRole('alert')).toHaveTextContent('That hire link is broken.');
  });
});
