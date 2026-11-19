import { useEffect, useRef } from 'react';
import type { SimulatedWorld } from '../robot/SimulatedRobot';

interface LaneViewProps {
  /** Read every frame. */
  world: () => SimulatedWorld;
  bay: number;
}

const W = 300;
const H = 400;

/**
 * A top-down view of the simulated lane, following the robot up the range.
 * Only for the simulator: a real robot is in front of the child, and its
 * telemetry has no position.
 */
export function LaneView({ world, bay }: LaneViewProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext?.('2d');
    if (!element || !context) return undefined;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    element.width = W * dpr;
    element.height = H * dpr;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    let frame = 0;
    const draw = () => {
      paint(context, world(), bay);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [world, bay]);

  return (
    <canvas
      ref={canvas}
      className="lane-view"
      aria-label={`Top-down view of the lane in front of Bay ${bay}, showing Mulligan and the balls it can collect`}
    />
  );
}

function paint(g: CanvasRenderingContext2D, state: SimulatedWorld, bay: number) {
  const { lane, robot } = state;
  const scale = W / (lane.halfWidth * 2); // pixels per metre
  const visible = H / scale;
  const bottom = Math.max(-1.2, Math.min(lane.far + 1.5 - visible, robot.y - visible * 0.35));
  const px = (x: number) => W / 2 + x * scale;
  const py = (y: number) => H - (y - bottom) * scale;

  // Mown stripes every 2.5 m, like the demo.
  for (let y = Math.floor(bottom / 2.5) * 2.5; y < bottom + visible; y += 2.5) {
    g.fillStyle = Math.round(y / 2.5) % 2 ? '#2b7646' : '#2f7f4c';
    g.fillRect(0, py(y + 2.5), W, 2.5 * scale + 1);
  }
  g.font = '600 12px system-ui, sans-serif';
  g.textBaseline = 'bottom';
  g.textAlign = 'left';
  for (let metres = 5; metres < lane.far; metres += 5) {
    g.strokeStyle = 'rgba(255,255,255,.28)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(14, py(metres));
    g.lineTo(W - 14, py(metres));
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(`${metres} m`, 16, py(metres) - 2);
  }
  // Far limit.
  g.strokeStyle = '#dc4a2c';
  g.lineWidth = 2;
  g.setLineDash([8, 6]);
  g.beginPath();
  g.moveTo(0, py(lane.far));
  g.lineTo(W, py(lane.far));
  g.stroke();
  g.setLineDash([]);
  g.fillStyle = '#ffd8cf';
  g.fillText(`${lane.far} m limit`, 16, py(lane.far) - 2);
  // Bay mat.
  g.fillStyle = '#1b2a22';
  g.fillRect(px(-1.5), py(0), 3 * scale, 1.2 * scale);
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(`BAY ${bay}`, W / 2, py(-0.6));

  for (const ball of state.balls) {
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath();
    g.ellipse(px(ball.x) + 1.5, py(ball.y) + 2.5, 5, 3.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#f3cf2e';
    g.beginPath();
    g.arc(px(ball.x), py(ball.y), 4.6, 0, Math.PI * 2);
    g.fill();
  }

  g.save();
  g.translate(px(robot.x), py(robot.y));
  g.rotate(-robot.heading); // world heading is anticlockwise from +x; the canvas y axis points down
  g.fillStyle = '#141a16';
  g.fillRect(-12, -13, 9, 5);
  g.fillRect(-12, 8, 9, 5);
  g.fillRect(2, -13, 9, 5);
  g.fillRect(2, 8, 9, 5);
  g.fillStyle = '#dc4a2c';
  g.fillRect(-14, -10, 26, 20);
  g.strokeStyle = 'rgba(255,255,255,.9)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(12, -10);
  g.lineTo(20, -10);
  g.lineTo(20, 10);
  g.lineTo(12, 10);
  g.stroke();
  g.restore();
  if (state.onBoard > 0) {
    g.fillStyle = '#f3cf2e';
    g.fillRect(px(robot.x) - 11, py(robot.y) - 31, 22, 15);
    g.fillStyle = '#1b1a05';
    g.font = '700 12px system-ui, sans-serif';
    g.fillText(String(state.onBoard), px(robot.x), py(robot.y) - 23);
  }
}
