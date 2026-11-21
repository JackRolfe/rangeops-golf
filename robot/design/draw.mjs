// Draws the Mulligan general arrangement from params.mjs into robot/drawings/*.svg.
// One drawing unit is one millimetre (the gate detail is drawn four times larger).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { P } from './params.mjs';
import { calculate } from './calc.mjs';

const R = calculate(P);
const INK = '#14211a';
const MUTED = '#56655b';
const TURF = '#1d5a39';
const BALL = '#f3cf2e';
const FLAG = '#dc4a2c';
const PAPER = '#ffffff';
const n = (v) => Number(v.toFixed(1));

// Merges default attributes with an override string such as `fill="red" stroke-width="2"`.
function attrs(defaults, overrides = '') {
  const merged = { ...defaults };
  for (const [, key, value] of overrides.matchAll(/([\w-]+)="([^"]*)"/g)) merged[key] = value;
  return Object.entries(merged).map(([key, value]) => `${key}="${value}"`).join(' ');
}
const STROKE = { fill: 'none', stroke: INK, 'stroke-width': 1.6 };

function sheet(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" font-family="Helvetica, Arial, sans-serif" font-size="13" role="img" aria-label="${title}">
<defs>
  <marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1 10 5 0 9z" fill="${MUTED}"/></marker>
  <pattern id="grass" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v8" stroke="${TURF}" stroke-width="1.2" opacity=".5"/></pattern>
</defs>
<rect width="${width}" height="${height}" fill="${PAPER}"/>
<text x="24" y="34" font-size="18" font-weight="700" fill="${INK}">${title}</text>
${body.join('\n')}
</svg>
`;
}

// A drawing space: maps robot millimetres to sheet units.
function space(ox, oy, scale, flipV) {
  const X = (x) => n(ox + x * scale);
  const V = (v) => n(flipV ? oy - v * scale : oy + v * scale);
  const out = [];
  const api = {
    out, X, V, scale,
    line(x1, v1, x2, v2, over = '') { out.push(`<path d="M${X(x1)} ${V(v1)}L${X(x2)} ${V(v2)}" ${attrs(STROKE, over)}/>`); },
    poly(points, over = '') { out.push(`<path d="M${points.map(([x, v]) => `${X(x)} ${V(v)}`).join('L')}z" ${attrs({ ...STROKE, 'stroke-linejoin': 'round' }, over)}/>`); },
    box(x1, v1, x2, v2, over = '') { api.poly([[x1, v1], [x2, v1], [x2, v2], [x1, v2]], over); },
    circle(x, v, r, over = '') { out.push(`<circle cx="${X(x)}" cy="${V(v)}" r="${n(r * scale)}" ${attrs(STROKE, over)}/>`); },
    text(x, v, label, over = '') { out.push(`<text x="${X(x)}" y="${V(v)}" ${attrs({ fill: INK }, over)}>${label}</text>`); },
    // Label with a leader line from the label to the thing it names.
    note(x, v, lx, lv, label, anchor = 'start') {
      out.push(`<path d="M${X(lx)} ${V(lv)}L${X(x)} ${V(v)}" stroke="${MUTED}" stroke-width="1" fill="none"/><circle cx="${X(x)}" cy="${V(v)}" r="2.4" fill="${MUTED}"/>`);
      const dx = anchor === 'end' ? -6 : 6;
      out.push(`<text x="${n(X(lx) + dx)}" y="${n(V(lv) + 4)}" text-anchor="${anchor}" fill="${INK}">${label}</text>`);
    },
    // Horizontal dimension between x1 and x2, drawn at sheet height v, with extension lines from v1/v2.
    dimH(x1, x2, v, label, from1, from2 = from1) {
      out.push(`<path d="M${X(x1)} ${V(from1)}V${V(v)}M${X(x2)} ${V(from2)}V${V(v)}" stroke="${MUTED}" stroke-width=".8" fill="none"/>`);
      out.push(`<path d="M${X(x1)} ${V(v)}H${X(x2)}" stroke="${MUTED}" stroke-width="1" marker-start="url(#a)" marker-end="url(#a)" fill="none"/>`);
      out.push(`<text x="${n((X(x1) + X(x2)) / 2)}" y="${n(V(v) - 5)}" text-anchor="middle" fill="${MUTED}">${label}</text>`);
    },
    // Vertical dimension between v1 and v2, drawn at x, with extension lines from fromX.
    dimV(v1, v2, x, label, fromX1, fromX2 = fromX1) {
      out.push(`<path d="M${X(fromX1)} ${V(v1)}H${X(x)}M${X(fromX2)} ${V(v2)}H${X(x)}" stroke="${MUTED}" stroke-width=".8" fill="none"/>`);
      out.push(`<path d="M${X(x)} ${V(v1)}V${V(v2)}" stroke="${MUTED}" stroke-width="1" marker-start="url(#a)" marker-end="url(#a)" fill="none"/>`);
      const mid = n((V(v1) + V(v2)) / 2);
      out.push(`<text x="${n(X(x) - 6)}" y="${mid + 4}" text-anchor="end" fill="${MUTED}">${label}</text>`);
    },
  };
  return api;
}

const { wheel, chassis, shell, battery, pen, gate, flag, ball } = P;
const ballR = ball.dia / 2;
const axleX = wheel.wheelbase / 2;
const wheelR = wheel.dia / 2;
const gateX = pen.backX + pen.depth;
const SKID_X = gateX - 24;
const frontX = pen.sideEndX + pen.funnelLength;
const endRun = (shell.topZ - shell.baseZ) / Math.tan((shell.endSlopeDeg * Math.PI) / 180);
const sideRun = (shell.topZ - shell.baseZ) / Math.tan((shell.sideSlopeDeg * Math.PI) / 180);
const ridgeHalf = shell.halfLength - endRun;
const topHalfWidth = shell.halfWidth - sideRun;

// ---------- side view ----------
function side() {
  const d = space(300, 440, 1, true);
  const o = d.out;
  // ground
  o.push(`<rect x="${d.X(-270)}" y="${d.V(0)}" width="900" height="14" fill="url(#grass)"/>`);
  d.line(-270, 0, 630, 0, `stroke="${TURF}" stroke-width="2"`);
  // shell
  d.poly([[-shell.halfLength, shell.baseZ], [-ridgeHalf, shell.topZ], [ridgeHalf, shell.topZ], [shell.halfLength, shell.baseZ]], `fill="${FLAG}" fill-opacity=".16" stroke="${FLAG}" stroke-width="2.2"`);
  // chassis rails
  d.box(chassis.rearX, chassis.floorZ, chassis.frontX, chassis.wallTopZ, `fill="#e6ece2"`);
  // battery on its adapter (inside, dashed)
  const packZ = chassis.floorZ + chassis.plate + battery.adapterHeight;
  d.box(-battery.length / 2, packZ, battery.length / 2, packZ + battery.height, `stroke-dasharray="6 4" stroke="${MUTED}"`);
  // wheels and motors
  for (const x of [-axleX, axleX]) {
    d.circle(x, wheelR, wheelR, `fill="#1c2420" fill-opacity=".9"`);
    d.circle(x, wheelR, 22, `fill="#8a968d"`);
    d.circle(x, wheelR, 3, `fill="${INK}"`);
  }
  // balls: three in the pen, one about to be collected
  for (const x of [pen.backX + 28, pen.backX + 76, pen.backX + 122, frontX + 70]) d.circle(x, ballR, ballR, `fill="${BALL}"`);
  // pen: side rail, funnel wing, skid, hinge
  d.box(pen.sideStartX, pen.railBottomZ, pen.sideEndX, pen.railTopZ, `fill="${INK}" fill-opacity=".1"`);
  d.poly([[pen.sideEndX, pen.railBottomZ], [frontX, pen.railBottomZ], [frontX, pen.funnelTopZ - 12], [pen.sideEndX, pen.funnelTopZ]], `fill="${INK}" fill-opacity=".05" stroke-dasharray="5 3"`);
  d.box(SKID_X - 20, 0, SKID_X + 20, pen.railBottomZ, `fill="${MUTED}"`);
  // brackets standing on the pen wall carry the pen pivot and the gate rod
  for (const [x, z] of [[pen.hingeX, pen.hingeZ], [gateX, gate.hingeZ]]) d.box(x - 12, pen.railTopZ, x + 12, z + 12, `fill="#e6ece2"`);
  d.circle(pen.hingeX, pen.hingeZ, 4, `fill="${PAPER}"`);
  // gate: hinge rod, flap, stop rod
  d.line(gateX, gate.hingeZ, gateX, gate.hingeZ - gate.flapLength, `stroke="${TURF}" stroke-width="3"`);
  d.circle(gateX, gate.hingeZ, 3.5, `fill="${TURF}" stroke="${TURF}"`);
  d.circle(gateX + gate.stopOffset, gate.stopZ, 2.5, `fill="${INK}"`);
  // flag pole with a break
  d.line(flag.x, flag.baseZ, flag.x, 272);
  o.push(`<path d="M${d.X(flag.x - 8)} ${d.V(278)}l16 -8M${d.X(flag.x - 8)} ${d.V(288)}l16 -8" stroke="${INK}" stroke-width="1.4" fill="none"/>`);
  d.line(flag.x, 286, flag.x, 350);
  d.poly([[flag.x, 350], [flag.x + 46, 336], [flag.x, 322]], `fill="${BALL}"`);

  // notes
  d.note(-40, 195, -140, 340, 'Shell, corrugated plastic', 'end');
  d.note(flag.x + 30, 336, flag.x + 90, 345, `Flag pole in the pen wall, top at ${flag.topZ} mm`);
  d.note(0, 140, -140, 300, 'Battery (inside)', 'end');
  d.note(pen.hingeX, pen.hingeZ, 180, 360, 'Pen pivot bolt: the pen floats on its skids', 'end');
  d.note(gateX, 36, 470, 190, 'Gate of hanging flaps');
  d.note(frontX - 20, 30, 540, 140, 'Funnel wing');
  d.note(SKID_X, 6, 400, -62, 'Skid');
  d.note(-axleX - 40, 30, -200, -62, 'Wheel', 'end');

  // dimensions
  d.dimH(R.rearX, frontX, -100, `${n(R.lengthMm)} overall`, 0);
  d.dimH(-axleX, axleX, -40, `${wheel.wheelbase} wheelbase`, wheelR);
  d.dimH(pen.backX, gateX, -40, `${pen.depth} pen`, pen.railBottomZ);
  d.dimV(0, shell.topZ, -250, `${shell.topZ}`, -shell.halfLength, -ridgeHalf);
  d.dimV(0, wheel.dia, -228 + 10, `⌀${wheel.dia}`, -axleX - wheelR, -axleX);
  o.push(`<text x="${d.X(-shell.halfLength + 56)}" y="${d.V(shell.baseZ + 78)}" text-anchor="end" fill="${FLAG}" font-weight="700">${shell.endSlopeDeg}°</text>`);
  o.push(`<text x="${d.X(shell.halfLength - 56)}" y="${d.V(shell.baseZ + 78)}" fill="${FLAG}" font-weight="700">${shell.endSlopeDeg}°</text>`);
  o.push(`<text x="${d.X(-12)}" y="${d.V(26)}" text-anchor="middle" fill="${MUTED}">${chassis.floorZ} clear</text>`);
  o.push(`<text x="24" y="56" fill="${MUTED}">Side view. Front is to the right. Dimensions in millimetres.</text>`);
  return sheet(940, 570, 'Mulligan: side view', o);
}

// ---------- top view ----------
function top() {
  const d = space(300, 340, 1, false);
  const o = d.out;
  const halfTrack = wheel.track / 2;
  // wheels
  for (const x of [-axleX, axleX]) for (const y of [-halfTrack, halfTrack]) {
    d.box(x - wheelR, y - wheel.width / 2, x + wheelR, y + wheel.width / 2, `fill="#1c2420" fill-opacity=".9"`);
  }
  // chassis and shell
  d.box(chassis.rearX, -chassis.width / 2, chassis.frontX, chassis.width / 2, `fill="#e6ece2"`);
  d.box(-shell.halfLength, -shell.halfWidth, shell.halfLength, shell.halfWidth, `fill="${FLAG}" fill-opacity=".14" stroke="${FLAG}" stroke-width="2.2"`);
  d.box(-ridgeHalf, -topHalfWidth, ridgeHalf, topHalfWidth, `stroke="${FLAG}"`);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) d.line(sx * shell.halfLength, sy * shell.halfWidth, sx * ridgeHalf, sy * topHalfWidth, `stroke="${FLAG}"`);
  d.box(-battery.length / 2, -battery.width / 2, battery.length / 2, battery.width / 2, `stroke-dasharray="6 4" stroke="${MUTED}"`);
  d.circle(flag.x, flag.y, 5, `fill="${BALL}"`);
  // pen: back wall, rails, funnel wings, skids
  const half = pen.innerWidth / 2;
  for (const s of [-1, 1]) {
    d.box(pen.sideStartX, s * half, pen.sideEndX, s * (half + pen.rail), `fill="${INK}" fill-opacity=".1"`);
    d.line(pen.sideEndX, s * half, frontX, s * (pen.funnelMouth / 2), `stroke-width="3"`);
    d.circle(SKID_X, s * (half + pen.rail / 2), 20, `fill="${MUTED}" stroke="none"`);
    d.circle(pen.hingeX, s * (chassis.width / 2 + 5), 4, `fill="${PAPER}"`);
  }
  d.box(pen.backX - pen.backWall, -half, pen.backX, half, `fill="${INK}" fill-opacity=".1"`);
  // gate flaps
  for (let i = 0; i < R.flapCount; i++) {
    const y = -half + (pen.innerWidth - R.flapCount * gate.flapPitch) / 2 + i * gate.flapPitch + (gate.flapPitch - gate.flapWidth) / 2;
    d.box(gateX - 3, y, gateX + 3, y + gate.flapWidth, `fill="${TURF}" stroke="none"`);
  }
  // ten balls in the pen, one outside
  const spots = [[30, -110], [34, -50], [28, 20], [36, 90], [82, -122], [86, -70], [80, -12], [88, 52], [84, 118], [132, -30]];
  for (const [dx, y] of spots) d.circle(pen.backX + dx, y, ballR, `fill="${BALL}"`);
  d.circle(frontX + 70, 40, ballR, `fill="${BALL}"`);

  // notes
  d.note(-60, -110, -30, -250, 'Shell');
  d.note(20, 20, 60, 255, 'Battery');
  d.note(flag.x, flag.y, 300, 250, 'Flag pole');
  d.note(gateX, -40, 500, -250, `Gate: ${R.flapCount} flaps`);
  d.note(frontX - 20, -pen.funnelMouth / 2 + 14, 560, -200, 'Funnel wing');
  d.note(SKID_X, half + pen.rail / 2, 520, 270, 'Skid');
  d.note(pen.backX + 60, 150, 380, 290, `Pen, ${P.target.balls} balls shown`);

  // dimensions
  d.dimH(R.rearX, frontX, 300, `${n(R.lengthMm)} overall`, halfTrack, pen.funnelMouth / 2);
  d.dimV(-halfTrack - wheel.width / 2, halfTrack + wheel.width / 2, -250 + 6, `${wheel.track + wheel.width}`, -axleX - wheelR);
  d.dimV(-half, half, 560, '', gateX + 6);
  o.push(`<text x="${d.X(566)}" y="${d.V(4)}" fill="${MUTED}">${pen.innerWidth} gate</text>`);
  d.dimV(-pen.funnelMouth / 2, pen.funnelMouth / 2, 640, '', frontX);
  o.push(`<text x="${d.X(646)}" y="${d.V(4)}" fill="${MUTED}">${pen.funnelMouth} mouth</text>`);
  o.push(`<text x="24" y="56" fill="${MUTED}">Top view. Front is to the right. Dimensions in millimetres.</text>`);
  return sheet(1040, 680, 'Mulligan: top view', o);
}

// ---------- gate detail ----------
function gateDetail() {
  const k = 4;
  const d = space(470, 410, k, true);
  const o = d.out;
  o.push(`<rect x="${d.X(-90)}" y="${d.V(0)}" width="${n(200 * k)}" height="14" fill="url(#grass)"/>`);
  d.line(-90, 0, 110, 0, `stroke="${TURF}" stroke-width="2"`);
  // pen side rail behind the gate
  d.box(0, pen.railBottomZ, 100, pen.railTopZ, `fill="${INK}" fill-opacity=".06" stroke="${MUTED}" stroke-dasharray="6 4"`);
  // a ball part-way through; the flap at rest (dashed), the stop rod, and the flap resting on the ball
  const phi = (41 * Math.PI) / 180;
  const drop = gate.hingeZ - ballR;
  const bx = (-ballR + drop * Math.sin(phi)) / Math.cos(phi);
  d.circle(bx, ballR, ballR, `fill="${BALL}"`);
  d.line(0, gate.hingeZ, 0, gate.hingeZ - gate.flapLength, `stroke="${TURF}" stroke-width="4" stroke-dasharray="8 6" opacity=".75"`);
  d.circle(-gate.stopOffset, gate.stopZ, 1.5, `fill="${INK}"`);
  d.line(0, gate.hingeZ, gate.flapLength * Math.sin(phi), gate.hingeZ - gate.flapLength * Math.cos(phi), `stroke="${TURF}" stroke-width="6" stroke-linecap="round"`);
  d.circle(0, gate.hingeZ, 1.5, `fill="${INK}"`);
  // a ball about to meet the gate
  d.circle(-ballR - 34, ballR, ballR, `fill="${BALL}" fill-opacity=".45" stroke-dasharray="5 3"`);
  o.push(`<path d="M${d.X(-78)} ${d.V(ballR)}H${d.X(-62)}" stroke="${MUTED}" stroke-width="1.4" marker-end="url(#a)" fill="none"/>`);

  d.note(0, gate.hingeZ, 40, 82, 'Hinge rod, M4 threaded rod');
  d.note(-gate.stopOffset, gate.stopZ, -40, 78, 'Stop rod: flaps cannot swing out', 'end');
  d.note(24, 34, 62, 66, 'Flap riding over a ball');
  d.note(0, 14, -42, 52, 'Flap at rest', 'end');
  d.note(60, 50, 70, 34, 'Pen wall');
  d.dimV(0, gate.hingeZ, 108, `${gate.hingeZ}`, 0);
  d.dimV(0, gate.hingeZ - gate.flapLength, -22 + 10, `${R.flapTipClearance}`, 0);
  d.dimV(0, pen.railBottomZ, 96, `${pen.railBottomZ}`, 60);
  d.dimH(bx - ballR, bx + ballR, -10, `ball ⌀${ball.dia}`, 0);
  o.push(`<text x="24" y="56" fill="${MUTED}">Section through the gate, four times size. Outside is to the left; the robot drives left. Dimensions in millimetres.</text>`);
  return sheet(940, 490, 'Mulligan: gate detail', o);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'drawings');
mkdirSync(dir, { recursive: true });
for (const [name, svg] of [['side.svg', side()], ['top.svg', top()], ['gate.svg', gateDetail()]]) {
  writeFileSync(join(dir, name), svg);
  console.log(`Wrote robot/drawings/${name}`);
}
