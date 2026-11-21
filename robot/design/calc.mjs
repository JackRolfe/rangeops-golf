// Sizing checks for the Mulligan design. Reads params.mjs, writes calcs.md.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { P } from './params.mjs';

const g = 9.81;
const deg = (rad) => (rad * 180) / Math.PI;
const rad = (d) => (d * Math.PI) / 180;
const f = (n, digits = 1) => n.toFixed(digits);

export function calculate(p = P) {
  const r = {};

  // Mass
  r.emptyKg = Object.values(p.massKg).reduce((a, b) => a + b, 0);
  r.ballsKg = p.target.balls * p.ball.massKg;
  r.ladenKg = r.emptyKg + r.ballsKg;

  // Speed
  const wheelR = p.wheel.dia / 2000;
  const circumference = Math.PI * p.wheel.dia / 1000;
  r.capMs = p.target.speedKmh / 3.6;
  r.capRpm = (r.capMs / circumference) * 60;
  r.ceilingKmh = (p.motor.noLoadRpm / 60) * circumference * 3.6;

  // Drive force and torque
  const weight = r.ladenKg * g;
  r.rollN = p.drive.crrGrass * weight;
  r.slopeN = weight * Math.sin(Math.atan(p.drive.slopePercent / 100));
  r.accelN = r.ladenKg * p.drive.accel;
  r.cruiseN = r.rollN;
  r.worstN = r.rollN + r.slopeN + r.accelN;
  const perWheel = (force) => (force * wheelR) / p.motor.count;
  r.cruiseNm = perWheel(r.cruiseN);
  r.worstNm = perWheel(r.worstN);
  r.stallMargin = p.motor.stallNm / r.worstNm;

  // Motor operating point, straight-line model between no-load and stall
  const amps = (torque) => p.motor.noLoadA + (p.motor.stallA - p.motor.noLoadA) * (torque / p.motor.stallNm);
  const rpm = (torque) => p.motor.noLoadRpm * (1 - torque / p.motor.stallNm);
  r.cruiseRpmAvailable = rpm(r.cruiseNm);
  r.worstRpmAvailable = rpm(r.worstNm);
  r.worstKmhAvailable = (r.worstRpmAvailable / 60) * circumference * 3.6;
  r.cruiseA = amps(r.cruiseNm) * p.motor.count;
  r.worstA = amps(r.worstNm) * p.motor.count;
  r.stallA = p.motor.stallA * p.motor.count;
  r.cruiseMechW = r.cruiseN * r.capMs;
  const limitedA = p.power.motorSupplyLimitA / p.motor.count;
  const limitedNm = ((limitedA - p.motor.noLoadA) / (p.motor.stallA - p.motor.noLoadA)) * p.motor.stallNm;
  r.maxPushN = (limitedNm * p.motor.count) / wheelR;
  r.motorPeakW = (p.motor.stallNm * ((p.motor.noLoadRpm * 2 * Math.PI) / 60)) / 4;

  // Power and runtime. Current is set by torque; voltage at the motor falls with the speed cap.
  const speedFraction = r.capRpm / r.cruiseRpmAvailable;
  r.movingW = (p.motor.volts * speedFraction * r.cruiseA) / p.power.buckEfficiency;
  r.averageW = r.movingW * p.power.movingFraction + p.power.electronicsW;
  r.runtimeH = (p.power.packWh * p.power.usableFraction) / r.averageW;
  r.whForTarget = (r.averageW * p.target.runtimeH) / p.power.usableFraction;

  // Stopping
  r.brakeM = r.capMs ** 2 / (2 * p.drive.decel);
  r.linkLossM = r.capMs * p.drive.linkTimeoutS + r.brakeM;

  // Odometry
  r.countsPerMm = (p.motor.encoderCpr * p.motor.ratio) / (Math.PI * p.wheel.dia);
  r.headingToleranceDeg = deg(Math.atan(p.target.laneHalfWidthM / p.target.reachM));

  // Stability
  r.tipSideDeg = deg(Math.atan(p.wheel.track / 2 / p.drive.cgHeight));
  r.tipEndDeg = deg(Math.atan(p.wheel.wheelbase / 2 / p.drive.cgHeight));

  // Gate: the push a ball must resist while the flaps ride up over it.
  const flapKg = (p.gate.flapWidth * p.gate.flapLength * p.gate.flapThickness * p.gate.flapDensity) / 1e6;
  const flapsLifted = Math.ceil(p.ball.dia / p.gate.flapPitch);
  const ballR = p.ball.dia / 2;
  const drop = p.gate.hingeZ - ballR; // hinge above the ball's centre
  let maxPush = 0;
  let maxAt = 0;
  for (let a = 1; a < 89; a += 0.5) {
    const phi = rad(a);
    // Flap resting tangent on the ball: s is the distance from hinge to the contact point.
    const ballX = (-ballR + drop * Math.sin(phi)) / Math.cos(phi);
    const s = ballX * Math.sin(phi) + drop * Math.cos(phi);
    if (s > p.gate.flapLength || s <= 0) continue;
    const torque = flapsLifted * flapKg * g * (p.gate.flapLength / 2000) * Math.sin(phi);
    const normal = torque / (s / 1000);
    const push = normal * Math.cos(phi);
    if (push > maxPush) { maxPush = push; maxAt = a; }
  }
  r.flapGrams = flapKg * 1000;
  r.flapsLifted = flapsLifted;
  r.flapCount = Math.floor(p.pen.innerWidth / p.gate.flapPitch);
  r.gatePushN = maxPush;
  r.gatePushAtDeg = maxAt;
  r.ballHoldSmoothN = p.ballRolling.smooth * p.ball.massKg * g;
  r.ballHoldGrassN = p.ballRolling.rangeGrass * p.ball.massKg * g;
  r.flapTipClearance = p.gate.hingeZ - p.gate.flapLength;

  // Pen capacity: balls that fit on the pen floor, loosely (square packing).
  r.penLooseCapacity = Math.floor(p.pen.innerWidth / p.ball.dia) * Math.floor(p.pen.depth / p.ball.dia);

  // Ball strike
  r.strikeJ = 0.5 * p.ball.massKg * p.strike.ballSpeed ** 2;
  r.strikeMomentum = p.ball.massKg * p.strike.ballSpeed;
  r.strikeShoveMs = r.strikeMomentum / r.ladenKg;
  r.faces = [p.shell.endSlopeDeg, p.shell.sideSlopeDeg].map((slope) => ({
    slope,
    leavesAtDeg: 2 * slope,
    energyIntoShell: Math.sin(rad(slope)) ** 2,
  }));

  // Envelope
  const rear = Math.min(-p.shell.halfLength, p.chassis.rearX, -p.wheel.wheelbase / 2 - p.wheel.dia / 2);
  r.frontX = p.pen.sideEndX + p.pen.funnelLength;
  r.rearX = rear;
  r.lengthMm = r.frontX - rear;
  r.widthMm = Math.max(p.wheel.track + p.wheel.width, p.pen.funnelMouth);
  r.heightMm = p.shell.topZ;

  // Corrugated plastic panels to cut, measured on their outside faces. The shell is a hip roof:
  // two trapezoid sides, two trapezoid ends and a small flat top.
  const rise = p.shell.topZ - p.shell.baseZ;
  const endRun = rise / Math.tan(rad(p.shell.endSlopeDeg));
  const sideRun = rise / Math.tan(rad(p.shell.sideSlopeDeg));
  r.ridgeHalf = p.shell.halfLength - endRun;
  r.topHalfWidth = p.shell.halfWidth - sideRun;
  const wingSpread = p.pen.funnelMouth / 2 - p.pen.innerWidth / 2;
  const wingLength = Math.hypot(p.pen.funnelLength, wingSpread);
  const wingTall = p.pen.funnelTopZ - p.pen.railBottomZ;
  const trapezoid = (bottom, top, height) => ({ area: ((bottom + top) / 2) * height, size: `trapezoid: ${f(bottom, 0)} along the bottom, ${f(top, 0)} along the top, ${f(height, 0)} high` });
  const rectangle = (a, b) => ({ area: a * b, size: `rectangle: ${f(a, 0)} by ${f(b, 0)}` });
  r.panels = [
    { name: 'Shell side', count: 2, ...trapezoid(2 * p.shell.halfLength, 2 * r.ridgeHalf, rise / Math.sin(rad(p.shell.sideSlopeDeg))) },
    { name: 'Shell end', count: 2, ...trapezoid(2 * p.shell.halfWidth, 2 * r.topHalfWidth, rise / Math.sin(rad(p.shell.endSlopeDeg))) },
    { name: 'Shell top', count: 1, ...rectangle(2 * r.ridgeHalf, 2 * r.topHalfWidth) },
    { name: 'Chassis end skirt', count: 2, ...rectangle(p.chassis.width - 2 * p.chassis.rail, p.chassis.wallTopZ - p.chassis.floorZ - p.chassis.plate) },
    { name: 'Pen back wall', count: 1, ...rectangle(p.pen.innerWidth, p.pen.railTopZ - p.pen.railBottomZ) },
    { name: 'Funnel wing', count: 2, area: wingLength * (wingTall - 6), size: `${f(wingLength, 0)} long, ${f(wingTall, 0)} high at one end and ${f(wingTall - 12, 0)} at the other` },
  ];
  r.panelAreaM2 = r.panels.reduce((sum, panel) => sum + panel.count * panel.area, 0) / 1e6;
  return r;
}

function report(p, r) {
  const rows = (pairs) => pairs.map(([a, b]) => `| ${a} | ${b} |`).join('\n');
  return `# Mulligan sizing checks

Generated by \`robot/design/calc.mjs\` from \`robot/design/params.mjs\`. Do not edit by hand; change the parameters and run \`npm run robot:design\`.

Anything marked *assumed* is a guess to be replaced by a measurement from the R0 rover.

## Envelope and mass

| | |
| --- | --- |
${rows([
    ['Length, shell tail to funnel mouth', `${f(r.lengthMm, 0)} mm`],
    ['Width', `${f(r.widthMm, 0)} mm`],
    ['Height to the top of the shell', `${f(r.heightMm, 0)} mm`],
    ['Ground clearance under the chassis', `${p.chassis.floorZ} mm`],
    ...Object.entries(p.massKg).map(([name, kg]) => [name, `${f(kg, 2)} kg`]),
    ['**Empty**', `**${f(r.emptyKg)} kg**`],
    [`With ${p.target.balls} balls`, `${f(r.ladenKg)} kg`],
  ])}

## Speed

| | |
| --- | --- |
${rows([
    ['Speed cap', `${p.target.speedKmh} km/h, ${f(r.capMs, 2)} m/s`],
    ['Wheel speed at the cap', `${f(r.capRpm, 0)} rpm`],
    ['Fastest the motors can turn the wheels, unloaded at 12 V', `${f(r.ceilingKmh)} km/h`],
    ['Encoder resolution', `${f(r.countsPerMm)} counts per mm of travel`],
  ])}

## Drive

| | |
| --- | --- |
${rows([
    ['Rolling resistance on grass, *assumed* ' + p.drive.crrGrass + ' of weight', `${f(r.rollN)} N`],
    [`Climbing a ${p.drive.slopePercent}% slope`, `${f(r.slopeN)} N`],
    [`Accelerating at ${p.drive.accel} m/s²`, `${f(r.accelN)} N`],
    ['Torque per wheel, cruising on the flat', `${f(r.cruiseNm, 2)} N·m`],
    ['Torque per wheel, all three at once', `${f(r.worstNm, 2)} N·m`],
    ['Motor stall torque', `${f(p.motor.stallNm, 2)} N·m, ${f(r.stallMargin)} times the worst case`],
    ['Speed available in the worst case', `${f(r.worstKmhAvailable)} km/h`],
    ['Current, cruising / worst case / all four stalled', `${f(r.cruiseA)} A / ${f(r.worstA)} A / ${f(r.stallA, 0)} A`],
    ['Most power one motor can deliver', `${f(r.motorPeakW)} W`],
    [`Hardest the robot can push, at the supply's ${p.power.motorSupplyLimitA} A limit`, `${f(r.maxPushN, 0)} N, the weight of ${f(r.maxPushN / g)} kg`],
  ])}

## Power and runtime

| | |
| --- | --- |
${rows([
    ['Mechanical power, cruising', `${f(r.cruiseMechW)} W`],
    ['Electrical power, cruising', `${f(r.movingW)} W`],
    [`Average over a hire, moving ${p.power.movingFraction * 100}% of the time (*assumed*)`, `${f(r.averageW)} W`],
    [`Runtime on a ${p.power.packWh} Wh pack, using ${p.power.usableFraction * 100}% of it`, `${f(r.runtimeH)} hours`],
    [`Pack needed for ${p.target.runtimeH} hours`, `${f(r.whForTarget, 0)} Wh`],
  ])}

## Stopping and stability

| | |
| --- | --- |
${rows([
    ['Stopping distance from the cap, stick released', `${f(r.brakeM, 2)} m`],
    [`Stopping distance when the link drops (${p.drive.linkTimeoutS * 1000} ms timeout)`, `${f(r.linkLossM, 2)} m`],
    ['Tips sideways beyond', `${f(r.tipSideDeg, 0)}°`],
    ['Tips end over end beyond', `${f(r.tipEndDeg, 0)}°`],
    [`Heading error that puts it ${p.target.laneHalfWidthM} m off line at ${p.target.reachM} m`, `${f(r.headingToleranceDeg)}°`],
  ])}

## Gate

| | |
| --- | --- |
${rows([
    ['Flaps across the gate', `${r.flapCount}, each ${f(r.flapGrams)} g`],
    ['Flap tip above the ground', `${f(r.flapTipClearance, 0)} mm`],
    ['Flaps one ball lifts', `${r.flapsLifted}`],
    ['Most the flaps push a ball forward', `${f(r.gatePushN * 1000, 1)} mN, at ${f(r.gatePushAtDeg, 0)}° of swing`],
    ['What holds a ball still on a smooth, fast surface', `${f(r.ballHoldSmoothN * 1000, 1)} mN`],
    ['What holds a ball still on range grass (*assumed*)', `${f(r.ballHoldGrassN * 1000, 1)} mN`],
    ['Balls that fit loosely on the pen floor', `${r.penLooseCapacity}`],
  ])}

A ball goes through the gate only if the surface holds it harder than the flaps push it. Otherwise the gate shoves it along in front.

## Ball strike

| | |
| --- | --- |
${rows([
    [`Energy of a ball at ${p.strike.ballSpeed} m/s`, `${f(r.strikeJ, 0)} J`],
    ['Speed it could give the robot if it stopped dead against it', `${f(r.strikeShoveMs, 2)} m/s`],
    ...r.faces.map((face) => [
      `A level ball meeting a ${face.slope}° face`,
      `leaves ${face.leavesAtDeg}° above its line of flight; at most ${f(face.energyIntoShell * 100, 0)}% of its energy goes into the shell`,
    ]),
  ])}

A face at 45° sends a level ball straight up. Shallower than that and the ball carries on the way it was going; steeper and it starts to come back.

## Panels to cut

From 4 mm corrugated plastic sign board, with a craft knife and a steel rule. Sizes are in millimetres. Each trapezoid is symmetrical: centre the top edge over the bottom one and join the ends. Its height is measured square to the bottom edge.

| Panel | Number | Size |
| --- | --- | --- |
${r.panels.map((panel) => `| ${panel.name} | ${panel.count} | ${panel.size} |`).join('\n')}

All of them together use ${f(r.panelAreaM2, 2)} m², so one 600 × 900 mm sheet is enough with room for mistakes. Cut the shell panels with the flutes running up the slope, from the bottom edge to the top, so any water that gets inside drains out.
`;
}

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = calculate(P);
  writeFileSync(join(here, 'calcs.md'), report(P, r));
  console.log('Wrote robot/design/calcs.md');
}
