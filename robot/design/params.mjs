// Mulligan design parameters: the one place the robot's numbers live.
// calc.mjs checks them, draw.mjs draws them and ../cad/mulligan.py models them, so change
// a value here and run `npm run robot:design` to see what it does to the sizing and drawings.
//
// Lengths are millimetres unless named otherwise. x runs forward from the middle
// of the chassis, y to the left, z up from the ground.
//
// The robot is designed to be built by a beginner from parts that can be bought: goBILDA
// aluminium channel and plate (pre-drilled, bolted together with a hex key), corrugated
// plastic sign board cut with a craft knife, and electronics that connect without soldering.
// Many numbers below are set by those parts, not chosen freely; the comments say which.

export const P = {
  target: { speedKmh: 4, reachM: 30, laneHalfWidthM: 1.5, balls: 10, runtimeH: 3 },

  ball: { dia: 42.7, massKg: 0.0459 },

  // goBILDA Wasteland Wheel, 144 x 52 mm. The axles sit on holes 24 mm apart along the
  // channel, so the wheelbase is a multiple of 24 that puts both axles on holes. The track is set by the hub on the motor shaft.
  wheel: { dia: 144, width: 52, wheelbase: 240, track: 370 },

  // Two goBILDA 1120 U-channels, 48 x 48 mm and 456 mm long, are the side rails. They run
  // from rearX to frontX and stand with the axle through their middle, so the rails span
  // floorZ to wallTopZ. A grid plate across their bottom flanges is the floor. width is
  // across the outside of the rails.
  chassis: { rearX: -216, frontX: 240, width: 280, rail: 48, floorZ: 48, plate: 2.5, wallTopZ: 96 },

  // A hip-roof shell of 4 mm corrugated plastic: shallow faces fore and aft, steeper on the
  // sides. It rests on the rails and hinges up at the front to reach the battery.
  shell: { baseZ: 96, topZ: 220, halfLength: 214, halfWidth: 145, endSlopeDeg: 35, sideSlopeDeg: 55, thickness: 4 },

  // An 18 V tool pack on its adapter. The adapter adds about 25 mm underneath.
  battery: { length: 130, width: 80, height: 90, adapterHeight: 25 },

  // The pen is a bottomless frame that pivots on the front of the rails and rides on its own
  // skids. Its side walls are goBILDA U-channels, sideStartX to sideEndX, with the flat face
  // inward and the flanges outward, so a wall takes `rail` mm of width. The back wall is
  // corrugated plastic, backWall mm thick, just in front of the rail ends.
  pen: {
    hingeX: 224, hingeZ: 80,
    sideStartX: 200, sideEndX: 440,
    backX: 246, backWall: 4, depth: 170, innerWidth: 300,
    railBottomZ: 12, railTopZ: 60, rail: 48,
    funnelLength: 70, funnelMouth: 420, funnelTopZ: 50,
  },

  // The gate: a row of light flaps hanging from a rod, free to swing in, stopped from swinging out.
  // The rod runs through brackets standing on the pen walls; the stop rod through the walls.
  gate: { hingeZ: 68, flapLength: 60, flapWidth: 15, flapPitch: 20, flapThickness: 1.5, flapDensity: 0.9, stopZ: 44, stopOffset: 8 },

  // A child's bike flag, its pole dropped through holes in the left pen wall.
  flag: { x: 248, y: 174, baseZ: 12, topZ: 900 },

  // goBILDA 5203 Yellow Jacket planetary gearmotor, 26.9:1, 223 rpm, with encoder.
  // Figures from goBILDA's spec sheet for 5203-2402-0027. The encoder gives 28 counts per motor turn.
  motor: { count: 4, volts: 12, noLoadRpm: 223, stallNm: 38.0 * 0.0980665, noLoadA: 0.25, stallA: 9.2, encoderCpr: 28, ratio: 26.9 },

  // Assumptions to replace with measurements from the R0 rover.
  drive: { crrGrass: 0.15, slopePercent: 10, accel: 1.0, decel: 2.5, linkTimeoutS: 0.3, cgHeight: 95 },

  power: { movingFraction: 0.5, electronicsW: 1.5, buckEfficiency: 0.92, packWh: 72, usableFraction: 0.85, motorSupplyLimitA: 10 },

  // A full shot from the next bay, as a worst case.
  strike: { ballSpeed: 70 },

  // Rolling resistance of a golf ball, as a fraction of its weight.
  // 0.056 is a putting green running 10 on a stimpmeter; range grass is several times that.
  ballRolling: { smooth: 0.056, rangeGrass: 0.15 },

  // goBILDA weights where goBILDA lists them (motor 437 g, wheel 348 g, 408 mm channel 268 g);
  // the rest are estimates.
  massKg: {
    'Motors with encoders (4)': 1.75,
    'Wheels and hubs (4)': 1.48,
    'Rails, floor plate and screws': 1.25,
    'Battery and adapter': 0.85,
    'Electronics and wiring': 0.5,
    'Shell and end skirts, corrugated plastic': 0.35,
    'Pen, gate and skids': 0.65,
    'Flag and stop switch': 0.25,
  },
};
