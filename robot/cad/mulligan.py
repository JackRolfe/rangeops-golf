"""Mulligan, the RangeOps ball-fetching robot, as a build123d assembly for text-to-cad.

Every dimension comes from ../design/params.mjs, the one place the robot's numbers
live, so this model follows the drawings and sizing checks when a value changes there.
Parts that params.mjs does not size (electronics boxes, brackets, the flag's cloth) are
drawn from the parts list in ../DESIGN.md and are placeholders.

Build and view:     cad run robot/cad/mulligan.py
Coordinates match params.mjs: millimetres, x forward from the middle of the chassis,
y to the left, z up from the ground.
"""

import json
import math
import subprocess
from pathlib import Path

import build123d as bd
from cad import model

HERE = Path(__file__).resolve().parent
PARAMS = HERE.parent / "design" / "params.mjs"


def load_params():
    """Reads P from params.mjs through Node, so the numbers are never copied."""
    script = f"import({json.dumps(PARAMS.as_uri())}).then(m => console.log(JSON.stringify(m.P)))"
    out = subprocess.run(["node", "--input-type=module", "-e", script], check=True, capture_output=True, text=True)
    return json.loads(out.stdout)


P = load_params()

# Brand colours (packages/brand/tokens.css) and plain material colours.
TURF = "#1d5a39"
BALL = "#f3cf2e"
FLAG = "#dc4a2c"
ALUMINIUM = "#c4cacd"
RUBBER = "#1c2420"
HUB = "#8a968d"
STEEL = "#9aa3a8"
HDPE = "#eef0ea"
PP = "#2f7d55"
PCB = "#20563a"
DARK = "#2b2f33"

# Derived dimensions, the same way draw.mjs derives them.
wheel, chassis, shell, battery, pen, gate, flag, ball = (
    P[k] for k in ("wheel", "chassis", "shell", "battery", "pen", "gate", "flag", "ball")
)
AXLE_X = wheel["wheelbase"] / 2
WHEEL_R = wheel["dia"] / 2
HALF_TRACK = wheel["track"] / 2
GATE_X = pen["backX"] + pen["depth"]
FRONT_X = GATE_X + pen["funnelLength"]
PEN_HALF = pen["innerWidth"] / 2
FLAP_COUNT = math.floor(pen["innerWidth"] / gate["flapPitch"])
END_RUN = (shell["topZ"] - shell["baseZ"]) / math.tan(math.radians(shell["endSlopeDeg"]))
SIDE_RUN = (shell["topZ"] - shell["baseZ"]) / math.tan(math.radians(shell["sideSlopeDeg"]))
RIDGE_HALF = shell["halfLength"] - END_RUN
TOP_HALF_WIDTH = shell["halfWidth"] - SIDE_RUN
PLATE_TOP = chassis["floorZ"] + chassis["plate"]

# Sizes params.mjs does not hold, from DESIGN.md's parts list.
WALL = 3.0  # chassis wall, 3 mm aluminium like the plate
SHELL_T = 4.5  # polycarbonate
MOTOR_D = 37.0  # Pololu 37D gearmotor
MOTOR_LEN = 90.0  # gearbox, motor and encoder
SHAFT_D = 6.0
ROD_D = 3.0
HINGE_BOLT_D = 5.0
HINGE_Y = PEN_HALF * 0.8  # where draw.mjs puts the pen arms
MAST_D = 8.0
WING_T = 3.0
SKID = (50.0, 15.0, 12.0)
KNUCKLE_R = 4.5
# The gate rods run through the front ends of the pen rails, the stop rod just outside the flaps.
GATE_ROD_INSET = 8.0
GATE_ROD_X = GATE_X - GATE_ROD_INSET
STOP_ROD_X = GATE_ROD_X + 1.5 / 2 + ROD_D / 2 + 3.0


def colour(shape, hex_colour, label):
    shape.color = bd.Color(hex_colour)
    shape.label = label
    return shape


def along_y(solid):
    """Turns a solid built along Z to run along Y."""
    return bd.Rot(90, 0, 0) * solid


def along_x(solid):
    return bd.Rot(0, 90, 0) * solid


def box_between(x0, x1, y0, y1, z0, z1):
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))


# ---------------------------------------------------------------- chassis and drive


def chassis_tray():
    length, width = chassis["length"], chassis["width"]
    plate = box_between(-length / 2, length / 2, -width / 2, width / 2, chassis["floorZ"], PLATE_TOP)
    outer = box_between(-length / 2, length / 2, -width / 2, width / 2, PLATE_TOP, chassis["wallTopZ"])
    inner = box_between(-length / 2 + WALL, length / 2 - WALL, -width / 2 + WALL, width / 2 - WALL, PLATE_TOP, chassis["wallTopZ"])
    tray = plate + (outer - inner)
    # Shaft holes where each motor passes through a side wall.
    for x in (-AXLE_X, AXLE_X):
        tray -= bd.Pos(x, 0, WHEEL_R) * along_y(bd.Cylinder(SHAFT_D / 2 + 1, width + 2))
    # Hinge tabs at the front for the pen, with a bolt hole each.
    for s in (-1, 1):
        tab = box_between(length / 2 - 2, pen["hingeX"] + 6, s * (HINGE_Y - 6), s * HINGE_Y, chassis["floorZ"], pen["hingeZ"] + 8)
        tab -= bd.Pos(pen["hingeX"], 0, pen["hingeZ"]) * along_y(bd.Cylinder(HINGE_BOLT_D / 2 + 0.1, width))
        tray += tab
    return colour(tray, ALUMINIUM, "chassis")


def gearmotor(side, x):
    """A 37 mm gearmotor lying on the plate, shaft out through the side wall."""
    y_wall = side * chassis["width"] / 2
    body = bd.Pos(x, y_wall - side * (WALL + MOTOR_LEN / 2), WHEEL_R) * along_y(bd.Cylinder(MOTOR_D / 2, MOTOR_LEN))
    shaft_len = HALF_TRACK - chassis["width"] / 2 + WALL + 4
    shaft = bd.Pos(x, y_wall - side * WALL + side * shaft_len / 2, WHEEL_R) * along_y(bd.Cylinder(SHAFT_D / 2, shaft_len))
    name = f"motor_{'front' if x > 0 else 'rear'}_{'left' if side > 0 else 'right'}"
    return colour(body + shaft, DARK, name)


def wheel_assembly(side, x):
    """150 mm rubber tyre with tread on a grey clamping hub."""
    w, r = wheel["width"], WHEEL_R
    rim_r = r - 22
    tyre = bd.Cylinder(r, w) - bd.Cylinder(rim_r, w)
    for i in range(24):
        tyre -= bd.Rot(0, 0, i * 15) * bd.Pos(r, 0, 0) * bd.Box(6, 8, w + 2)
    hub = bd.Cylinder(rim_r, w - 6) - bd.Cylinder(SHAFT_D / 2, w)
    for i in range(5):
        hub -= bd.Rot(0, 0, i * 72) * bd.Pos(rim_r * 0.55, 0, 0) * bd.Cylinder(rim_r * 0.22, w)
    place = bd.Pos(x, side * HALF_TRACK, r) * bd.Rot(90, 0, 0)
    name = f"{'front' if x > 0 else 'rear'}_{'left' if side > 0 else 'right'}"
    return [colour(place * tyre, RUBBER, f"tyre_{name}"), colour(place * hub, HUB, f"hub_{name}")]


def drive():
    parts = []
    for side in (1, -1):
        for x in (AXLE_X, -AXLE_X):
            parts.append(gearmotor(side, x))
            parts.extend(wheel_assembly(side, x))
    return bd.Compound(children=parts, label="drive")


# ---------------------------------------------------------------- electronics


def electronics():
    b = battery
    z = PLATE_TOP
    adapter_h = 14
    adapter = box_between(-b["length"] / 2 + 10, b["length"] / 2 - 10, -b["width"] / 2 - 4, b["width"] / 2 + 4, z, z + adapter_h)
    pack = box_between(-b["length"] / 2, b["length"] / 2, -b["width"] / 2, b["width"] / 2, z + adapter_h, z + adapter_h + b["height"])
    pack = pack.fillet(6, pack.edges().filter_by(bd.Axis.Z))
    parts = [
        colour(pack, "#c8102e", "battery_18v"),
        colour(adapter, DARK, "battery_adapter"),
        # Cytron MDD10A, about 84 x 62 mm, left of the pack.
        colour(box_between(-42, 42, 70, 132, z + 6, z + 22), PCB, "motor_driver"),
        # 12 V 10 A motor regulator and the relay, left side towards the back.
        colour(box_between(-106, -50, 74, 124, z, z + 28), "#5b6168", "regulator_12v"),
        # ESP32-S3 DevKitC-1 and sensors, right of the pack.
        colour(box_between(-32, 32, -84, -58, z + 6, z + 14), "#1f3f8f", "controller_esp32s3"),
        colour(box_between(-20, 8, -126, -100, z + 4, z + 8), "#6a2c91", "imu_bno085"),
        colour(box_between(14, 36, -126, -104, z + 4, z + 8), "#6a2c91", "battery_monitor"),
        colour(box_between(-106, -66, -124, -74, z, z + 20), "#5b6168", "regulator_5v"),
    ]
    return bd.Compound(children=parts, label="electronics")


# ---------------------------------------------------------------- pen and gate


def pen_frame():
    """Three-sided bottomless pen: back wall and two side rails of 10 mm HDPE strip."""
    z0, z1, t = pen["railBottomZ"], pen["railTopZ"], pen["rail"]
    back = box_between(pen["backX"] - t, pen["backX"], -PEN_HALF - t, PEN_HALF + t, z0, z1)
    rails = [box_between(pen["backX"] - t, GATE_X, s * PEN_HALF, s * (PEN_HALF + t), z0, z1) for s in (-1, 1)]
    # The gate's hinge rod sits above the rails, so each rail ends in a short post.
    posts = [box_between(GATE_X - 2 * GATE_ROD_INSET + 2, GATE_X, s * PEN_HALF, s * (PEN_HALF + t), z1, gate["hingeZ"] + 8) for s in (-1, 1)]
    frame = back + rails[0] + rails[1] + posts[0] + posts[1]
    for s in (-1, 1):
        # A slot in the back wall for the chassis hinge tab, and a knuckle beside it.
        frame -= box_between(pen["backX"] - t - 1, pen["backX"] + 1, s * (HINGE_Y - 11), s * (HINGE_Y + 0.5), 45, z1 + 1)
        knuckle = box_between(pen["hingeX"], pen["backX"], s * (HINGE_Y + 0.5), s * (HINGE_Y + 8.5), pen["hingeZ"] - KNUCKLE_R, z1)
        knuckle += bd.Pos(pen["hingeX"], s * (HINGE_Y + 4.5), pen["hingeZ"]) * along_y(bd.Cylinder(KNUCKLE_R, 8))
        frame += knuckle
        frame -= bd.Pos(pen["hingeX"], s * (HINGE_Y + 4.5), pen["hingeZ"]) * along_y(bd.Cylinder(HINGE_BOLT_D / 2 + 0.1, 10))
    # Holes through the posts and rails for the hinge rod and the stop rod.
    frame -= bd.Pos(GATE_ROD_X, 0, gate["hingeZ"]) * along_y(bd.Cylinder(ROD_D / 2 + 0.1, 400))
    frame -= bd.Pos(STOP_ROD_X, 0, gate["stopZ"]) * along_y(bd.Cylinder(ROD_D / 2 + 0.1, 400))
    return colour(frame, HDPE, "pen_frame")


def funnel_wings():
    """3 mm polycarbonate wings from the gate out to the mouth, as wide as the wheels."""
    wings = []
    for s in (-1, 1):
        # Inset by half a thickness at each end so the wing is bonded to the rail's front face
        # and its outer corner lands on the funnel mouth.
        x0, x1 = GATE_X + WING_T / 2, FRONT_X - WING_T / 2
        y0, y1 = s * (PEN_HALF + pen["rail"] / 2), s * pen["funnelMouth"] / 2
        length = math.hypot(x1 - x0, y1 - y0)
        angle = math.degrees(math.atan2(y1 - y0, x1 - x0))
        outline = bd.Polyline(
            (0, pen["railBottomZ"]),
            (length, pen["railBottomZ"]),
            (length, pen["funnelTopZ"] - 12),
            (0, pen["funnelTopZ"]),
            close=True,
        )
        face = bd.make_face(bd.Plane.XZ * outline)
        wing = bd.extrude(face, amount=WING_T / 2, both=True)
        wing = bd.Pos(x0, y0, 0) * bd.Rot(0, 0, angle) * wing
        wings.append(colour(wing, "#a9d4e8", f"funnel_wing_{'left' if s > 0 else 'right'}"))
    return wings


def skids():
    length, width, height = SKID
    out = []
    for s in (-1, 1):
        y0 = s * (PEN_HALF + pen["rail"] + 1)
        y1 = s * (PEN_HALF + pen["rail"] + 1 + width)
        block = box_between(GATE_X - length, GATE_X, y0, y1, 0, height)
        # Chamfer the leading and trailing bottom edges so it slides over turf both ways.
        block = block.chamfer(8, None, block.edges().filter_by(bd.Axis.Y).group_by(bd.Axis.Z)[0])
        # A tab up to the side rail.
        tab = box_between(GATE_X - length + 8, GATE_X - 8, s * (PEN_HALF + pen["rail"]), y1, height, pen["railTopZ"] - 10)
        out.append(colour(block + tab, "#f4f4ee", f"skid_{'left' if s > 0 else 'right'}"))
    return out


def gate_assembly():
    """Hinge rod, the hanging flaps on looped tops with spacers between, and the stop rod outside them."""
    rod_len = pen["innerWidth"] + 2 * pen["rail"] + 10
    hinge_rod = bd.Pos(GATE_ROD_X, 0, gate["hingeZ"]) * along_y(bd.Cylinder(ROD_D / 2, rod_len))
    stop_rod = bd.Pos(STOP_ROD_X, 0, gate["stopZ"]) * along_y(bd.Cylinder(ROD_D / 2, rod_len))
    parts = [colour(hinge_rod, STEEL, "gate_hinge_rod"), colour(stop_rod, STEEL, "gate_stop_rod")]

    w, pitch, t = gate["flapWidth"], gate["flapPitch"], gate["flapThickness"]
    first = -PEN_HALF + (pen["innerWidth"] - FLAP_COUNT * pitch) / 2 + (pitch - w) / 2  # left edge of flap 1
    bore = ROD_D / 2 + 0.15
    loop_r = bore + t
    tip_z = gate["hingeZ"] - gate["flapLength"]
    flaps = []
    for i in range(FLAP_COUNT):
        y = first + i * pitch + w / 2
        strip = box_between(GATE_ROD_X - t / 2, GATE_ROD_X + t / 2, y - w / 2, y + w / 2, tip_z, gate["hingeZ"])
        loop = bd.Pos(GATE_ROD_X, y, gate["hingeZ"]) * along_y(bd.Cylinder(loop_r, w))
        flap = strip + loop - bd.Pos(GATE_ROD_X, y, gate["hingeZ"]) * along_y(bd.Cylinder(bore, w + 1))
        flaps.append(colour(flap, PP, f"flap_{i + 1:02d}"))
    parts.append(bd.Compound(children=flaps, label="flaps"))

    # Spacers fill the gaps: between flaps, and from the end flaps out to the rails.
    gaps = [(-PEN_HALF, first)]
    gaps += [(first + i * pitch - (pitch - w), first + i * pitch) for i in range(1, FLAP_COUNT)]
    gaps.append((first + (FLAP_COUNT - 1) * pitch + w, PEN_HALF))
    spacers = []
    for i, (y0, y1) in enumerate(gaps):
        if y1 - y0 < 0.5:
            continue
        tube = along_y(bd.Cylinder(loop_r - 0.3, y1 - y0 - 0.2) - bd.Cylinder(bore, y1 - y0))
        spacers.append(colour(bd.Pos(GATE_ROD_X, (y0 + y1) / 2, gate["hingeZ"]) * tube, "#d9dcd6", f"spacer_{i + 1:02d}"))
    parts.append(bd.Compound(children=spacers, label="spacers"))
    return bd.Compound(children=parts, label="gate")


def hinge_bolts():
    """M5 bolts through each chassis tab and the pen knuckle beside it."""
    bolts = []
    for s in (-1, 1):
        y0, y1 = s * (HINGE_Y - 6), s * (HINGE_Y + 8.5)  # head on the tab, threaded into the knuckle
        shank = bd.Pos(pen["hingeX"], (y0 + y1) / 2, pen["hingeZ"]) * along_y(bd.Cylinder(HINGE_BOLT_D / 2, abs(y1 - y0)))
        head = bd.Pos(pen["hingeX"], y0 - s * 1.75, pen["hingeZ"]) * along_y(bd.Cylinder(4.5, 3.5))
        bolts.append(colour(shank + head, STEEL, f"hinge_bolt_{'left' if s > 0 else 'right'}"))
    return bolts


def pen_assembly():
    children = [pen_frame(), *funnel_wings(), *skids(), gate_assembly()]
    return bd.Compound(children=children, label="pen")


# ---------------------------------------------------------------- shell, flag, stop switch


def hip_roof(z0, z1, half_len, half_wid, ridge_half, top_half_wid):
    base = bd.Plane.XY.offset(z0) * bd.Rectangle(2 * half_len, 2 * half_wid)
    top = bd.Plane.XY.offset(z1) * bd.Rectangle(2 * ridge_half, 2 * top_half_wid)
    return bd.loft([base, top])


def shell_body():
    outer = hip_roof(shell["baseZ"], shell["topZ"], shell["halfLength"], shell["halfWidth"], RIDGE_HALF, TOP_HALF_WIDTH)
    hollow = bd.offset(outer, amount=-SHELL_T, openings=outer.faces().sort_by(bd.Axis.Z)[0])
    # A hole for the flag mast.
    hollow -= bd.Pos(flag["x"], 0, shell["baseZ"]) * bd.Cylinder(MAST_D / 2 + 2, 400, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    return colour(hollow, FLAG, "shell")


def shell_height_at_x(x):
    return shell["baseZ"] + (shell["halfLength"] - abs(x)) * math.tan(math.radians(shell["endSlopeDeg"]))


def stop_switch():
    """A latching mushroom button, set into the rear face where anyone behind it can hit it."""
    x = -shell["halfLength"] + END_RUN * 0.2
    z = shell_height_at_x(x)
    tilt = -shell["endSlopeDeg"]
    collar = bd.Cylinder(16, 14, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    cap = bd.Pos(0, 0, 14) * bd.Cylinder(22, 10, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    cap = cap.fillet(4, cap.edges().group_by(bd.Axis.Z)[-1])
    place = bd.Pos(x, 0, z) * bd.Rot(0, tilt, 0)
    return [colour(place * collar, "#f3cf2e", "stop_switch_collar"), colour(place * cap, "#d6201c", "stop_switch")]


def flag_assembly():
    mast_len = flag["topZ"] - PLATE_TOP
    mast = bd.Pos(flag["x"], 0, PLATE_TOP) * bd.Cylinder(MAST_D / 2, mast_len, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    base = bd.Pos(flag["x"], 0, PLATE_TOP) * (
        bd.Cylinder(14, 20, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN)) - bd.Cylinder(MAST_D / 2, 50)
    )
    pennant_len, pennant_h = 220.0, 140.0
    outline = bd.Polyline((0, 0), (pennant_len, -pennant_h / 2), (0, -pennant_h), close=True)
    pennant = bd.extrude(bd.make_face(bd.Plane.XZ * outline), amount=0.75, both=True)
    pennant = bd.Pos(flag["x"] + MAST_D / 2, 0, flag["topZ"] - 10) * pennant
    return bd.Compound(
        children=[
            colour(mast, "#f2f2ee", "flag_mast"),
            colour(base, DARK, "flag_mount"),
            colour(pennant, BALL, "flag"),
        ],
        label="flag",
    )


# ---------------------------------------------------------------- models


@model
def mulligan():
    """The pilot build: chassis, drive, electronics, pen and gate, shell and flag."""
    return bd.Compound(
        children=[
            chassis_tray(),
            drive(),
            electronics(),
            pen_assembly(),
            *hinge_bolts(),
            shell_body(),
            *stop_switch(),
            flag_assembly(),
        ],
        label="mulligan",
    )


@model
def mulligan_rover():
    """R0 and R1: the rover with its pickup, before the shell and flag go on."""
    return bd.Compound(
        children=[chassis_tray(), drive(), electronics(), pen_assembly(), *hinge_bolts()],
        label="mulligan_rover",
    )


@model
def mulligan_with_balls():
    """The pilot build carrying ten balls, laid out as in the top drawing, and one about to be collected."""
    r = ball["dia"] / 2
    spots = [(30, -110), (34, -50), (28, 20), (36, 90), (82, -122), (86, -70), (80, -12), (88, 52), (84, 118), (132, -30)]
    balls = [colour(bd.Pos(pen["backX"] + dx, y, r) * bd.Sphere(r), "#fbfbf6", f"ball_{i + 1:02d}") for i, (dx, y) in enumerate(spots)]
    balls.append(colour(bd.Pos(FRONT_X + 70, 40, r) * bd.Sphere(r), "#fbfbf6", "ball_next"))
    return bd.Compound(children=[mulligan().shape, bd.Compound(children=balls, label="balls")], label="mulligan_with_balls")


if __name__ == "__main__":
    mulligan()
    mulligan_rover()
    mulligan_with_balls()
