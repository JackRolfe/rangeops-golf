// Mulligan design parameters: the one place the robot's numbers live.
// calc.mjs checks them and draw.mjs draws them, so change a value here and
// run `npm run robot:design` to see what it does to the sizing and drawings.
//
// Lengths are millimetres unless named otherwise. x runs forward from the middle
// of the chassis, y to the left, z up from the ground.

export const P = {
  target: { speedKmh: 4, reachM: 30, laneHalfWidthM: 1.5, balls: 10, runtimeH: 3 },

  ball: { dia: 42.7, massKg: 0.0459 },

  wheel: { dia: 150, width: 45, wheelbase: 260, track: 380 },

  chassis: { length: 400, width: 325, floorZ: 50, plate: 3, wallTopZ: 80 },

  // A hip-roof shell: shallow faces fore and aft, steeper on the sides.
  shell: { baseZ: 80, topZ: 220, halfLength: 207, halfWidth: 162, endSlopeDeg: 35, sideSlopeDeg: 55 },

  // Styled CAD concept. Sections are [z, length, width, plan corner radius].
  // The sheet-built prototype above retains its original slope calculations.
  bodywork: {
    sections: [[80, 414, 324, 44], [96, 406, 321, 46], [127, 368, 307, 54],
      [165, 292, 276, 65], [194, 211, 224, 66], [212, 142, 175, 58], [218, 98, 137, 44]],
    hatchLength: 226, hatchWidth: 153,
  },

  battery: { length: 130, width: 80, height: 90 },

  // The pen is a bottomless frame hinged to the chassis front. It rides on its own skids.
  pen: {
    hingeX: 205, hingeZ: 60,
    backX: 215, depth: 180, innerWidth: 300,
    railBottomZ: 12, railTopZ: 60, rail: 10,
    funnelLength: 80, funnelMouth: 420, funnelTopZ: 50,
  },

  // Onboard layout, measured rearward from the gate. The bin seats in the chassis nose.
  transfer: { binRearX: 165, flatRun: 82, crestRun: 222, lipZ: 70, overtravel: 8 },

  // The gate: a row of light flaps hanging from a rod, free to swing in, stopped from swinging out.
  gate: { hingeZ: 62, flapLength: 54, flapWidth: 15, flapPitch: 20, flapThickness: 1.5, flapDensity: 0.9, stopZ: 45 },

  flag: { x: -120, topZ: 900 },

  // 37 mm 12 V gearmotor with encoder, 50:1. Figures from the Pololu 37D listing (item 4753).
  motor: { count: 4, volts: 12, noLoadRpm: 200, stallNm: 21 * 0.0980665, noLoadA: 0.2, stallA: 5.5, encoderCpr: 64, ratio: 50 },

  // Assumptions to replace with measurements from the R0 rover.
  drive: { crrGrass: 0.15, slopePercent: 10, accel: 1.0, decel: 2.5, linkTimeoutS: 0.3, cgHeight: 85 },

  power: { movingFraction: 0.5, electronicsW: 1.5, buckEfficiency: 0.92, packWh: 90, usableFraction: 0.85, motorSupplyLimitA: 10 },

  // A full shot from the next bay, as a worst case.
  strike: { ballSpeed: 70 },

  // Rolling resistance of a golf ball, as a fraction of its weight.
  // 0.056 is a putting green running 10 on a stimpmeter; range grass is several times that.
  ballRolling: { smooth: 0.056, rangeGrass: 0.15 },

  massKg: {
    'Motors with encoders (4)': 0.84,
    'Wheels and hubs (4)': 1.0,
    'Chassis plate, walls and brackets': 1.5,
    'Battery and adapter': 0.75,
    'Electronics and wiring': 0.5,
    'Shell, 4.5 mm polycarbonate, and frame': 2.1,
    'Pen, gate and skids': 0.5,
    'Flag, switches, fasteners': 0.4,
  },
};
