"""Mulligan, the RangeOps ball-fetching robot, as a build123d assembly for text-to-cad.

Every dimension comes from ../design/params.mjs, the one place the robot's numbers live,
so this model follows the drawings and sizing checks when a value changes there.

The robot is built from parts a beginner can buy and bolt together (see ../BUILD.md):
goBILDA aluminium U-channel and grid plate, goBILDA motors, hubs and wheels, corrugated
plastic panels, and off-the-shelf electronics boards. Bought parts are modelled at their
listed sizes where goBILDA publishes them and approximately otherwise; the channel's hole
pattern is drawn as goBILDA's 24 mm-pitch pattern but should be checked against the real part.

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
MOTOR = "#e8b923"  # goBILDA Yellow Jacket
DARK = "#2b2f33"
COROPLAST = "#e4573d"
PANEL = "#f2f2ec"
PP = "#2f7d55"
PCB = "#20563a"

wheel, chassis, shell, battery, pen, gate, flag, ball = (
    P[k] for k in ("wheel", "chassis", "shell", "battery", "pen", "gate", "flag", "ball")
)

# Derived dimensions, the same way draw.mjs and calc.mjs derive them.
AXLE_X = wheel["wheelbase"] / 2
WHEEL_R = wheel["dia"] / 2
WHEEL_Y = wheel["track"] / 2
RAIL_OUT = chassis["width"] / 2  # outside face of each rail
RAIL = chassis["rail"]  # U-channel is RAIL x RAIL
RAIL_Z = (chassis["floorZ"] + chassis["wallTopZ"]) / 2  # the axle runs through the rail's middle
DECK_Z = chassis["floorZ"] + chassis["plate"]  # top of the bottom flange
GATE_X = pen["backX"] + pen["depth"]
FRONT_X = pen["sideEndX"] + pen["funnelLength"]
PEN_HALF = pen["innerWidth"] / 2
PEN_Z = (pen["railBottomZ"] + pen["railTopZ"]) / 2
FLAP_COUNT = math.floor(pen["innerWidth"] / gate["flapPitch"])
RISE = shell["topZ"] - shell["baseZ"]
END_RUN = RISE / math.tan(math.radians(shell["endSlopeDeg"]))
SIDE_RUN = RISE / math.tan(math.radians(shell["sideSlopeDeg"]))
RIDGE_HALF = shell["halfLength"] - END_RUN
TOP_HALF_WIDTH = shell["halfWidth"] - SIDE_RUN

# Bought-part sizes params.mjs does not hold. goBILDA figures are from goBILDA's listings;
# the rest are typical for the part and marked as such in BUILD.md.
WALL = 2.5  # U-channel wall, approximate
PITCH = 24.0  # goBILDA hole pitch along a channel
GRID_PLATE = (424.0, 232.0)  # goBILDA 1116 grid plate, 29 x 53 holes
GEARBOX_D, GEARBOX_LEN, CAN_LEN, ENCODER_LEN = 36.0, 50.0, 55.0, 15.0  # 5203 motor, approximate lengths
SHAFT_D, SHAFT_LEN = 8.0, 24.0
HUB_D, HUB_LEN = 32.0, 14.0  # 1310 Hyper Hub, approximate
M4 = 3.8  # threaded rod and bolts, modelled just under 4 mm so they sit in 4 mm holes
SPACER_OD = 8.0  # nylon M4 spacers
CORO_T = 4.0  # corrugated plastic
SKID_D, SKID_H = 40.0, 12.0  # nylon furniture glide with an M4 stud
FLAG_POLE_D = 8.0
ESTOP_HOLE = 22.0


def colour(shape, hex_colour, label):
    shape.color = bd.Color(hex_colour)
    shape.label = label
    return shape


def along_y(solid):
    """Turns a solid built along Z to run along Y."""
    return bd.Rot(90, 0, 0) * solid


def box_between(x0, x1, y0, y1, z0, z1):
    return bd.Pos((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2) * bd.Box(abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))


def cylinder_y(x, y0, y1, z, d):
    return bd.Pos(x, (y0 + y1) / 2, z) * along_y(bd.Cylinder(d / 2, abs(y1 - y0)))


def cylinder_z(x, y, z0, z1, d):
    return bd.Pos(x, y, (z0 + z1) / 2) * bd.Cylinder(d / 2, abs(z1 - z0))


# ---------------------------------------------------------------- goBILDA parts


def u_channel(length):
    """goBILDA 1120 U-channel, built along +X from 0 to length.

    The web (the closed side) lies in y 0..WALL and spans z -RAIL/2..RAIL/2; the two flanges
    run from the web out to y = RAIL. Holes: a 14 mm hole every 24 mm along the middle of each
    face, starting 24 mm from the end (a 48 mm channel has one, in its middle), with four 4 mm
    holes on a 16 mm square around each.
    """
    h = RAIL / 2
    body = box_between(0, length, 0, RAIL, -h, h) - box_between(-1, length + 1, WALL, RAIL + 1, -h + WALL, h - WALL)
    cutters = []
    count = int(round(length / PITCH)) - 1
    for k in range(1, count + 1):
        x = k * PITCH
        cutters.append(cylinder_y(x, -1, WALL + 1, 0, 14))
        cutters.append(cylinder_z(x, h, -h - 1, h + 1, 14))
        for dx in (-8, 8):
            for dz in (-8, 8):
                cutters.append(cylinder_y(x + dx, -1, WALL + 1, dz, 4))
                cutters.append(cylinder_z(x + dx, h + dz, -h - 1, h + 1, 4))
    return body - bd.Compound(children=cutters)


def rails():
    """The two side rails, webs outward, open sides facing each other."""
    length = chassis["frontX"] - chassis["rearX"]
    channel = u_channel(length)
    left = bd.Pos(chassis["rearX"], RAIL_OUT, RAIL_Z) * bd.Rot(180, 0, 0) * channel
    right = bd.Pos(chassis["rearX"], -RAIL_OUT, RAIL_Z) * channel
    return [colour(left, ALUMINIUM, "rail_left"), colour(right, ALUMINIUM, "rail_right")]


def floor_plate():
    """goBILDA 1116 grid plate on the rails' bottom flanges. Its 4 mm hole grid is not drawn."""
    length, width = GRID_PLATE
    plate = box_between(-length / 2, length / 2, -width / 2, width / 2, DECK_Z, DECK_Z + chassis["plate"])
    return colour(plate, ALUMINIUM, "floor_plate")


def gearmotor(side, x):
    """A 5203 gearmotor with its face bolted inside the rail, shaft out through the rail's middle hole."""
    face_y = side * (RAIL_OUT - WALL)
    inward = -side
    gearbox = cylinder_y(x, face_y, face_y + inward * GEARBOX_LEN, RAIL_Z, GEARBOX_D)
    can_start = face_y + inward * GEARBOX_LEN
    can = cylinder_y(x, can_start, can_start + inward * CAN_LEN, RAIL_Z, GEARBOX_D - 1)
    enc_start = can_start + inward * CAN_LEN
    encoder = cylinder_y(x, enc_start, enc_start + inward * ENCODER_LEN, RAIL_Z, GEARBOX_D)
    shaft = cylinder_y(x, face_y, face_y + side * SHAFT_LEN, RAIL_Z, SHAFT_D)
    name = f"{'front' if x > 0 else 'rear'}_{'left' if side > 0 else 'right'}"
    return [
        colour(gearbox + shaft, MOTOR, f"motor_{name}"),
        colour(can, DARK, f"motor_can_{name}"),
        colour(encoder, DARK, f"encoder_{name}"),
    ]


def wheel_assembly(side, x):
    """goBILDA Wasteland wheel, 144 x 52 mm, on a 1310 Hyper Hub."""
    w, r = wheel["width"], WHEEL_R
    core_r = r - 18
    tyre = bd.Cylinder(r, w) - bd.Cylinder(core_r, w + 1)
    for i in range(20):
        tyre -= bd.Rot(0, 0, i * 18) * bd.Pos(r, 0, 0) * bd.Box(7, 10, w + 2)
    core = bd.Cylinder(core_r, w - 12) - bd.Cylinder(7, w)
    for i in range(6):
        core -= bd.Rot(0, 0, i * 60) * bd.Pos(core_r * 0.6, 0, 0) * bd.Cylinder(core_r * 0.22, w)
    place = bd.Pos(x, side * WHEEL_Y, WHEEL_R) * bd.Rot(90, 0, 0)
    inner_face = WHEEL_Y - w / 2
    hub = cylinder_y(x, side * (inner_face - HUB_LEN), side * inner_face, WHEEL_R, HUB_D)
    hub -= cylinder_y(x, side * (inner_face - HUB_LEN - 1), side * (inner_face + 1), WHEEL_R, SHAFT_D)
    name = f"{'front' if x > 0 else 'rear'}_{'left' if side > 0 else 'right'}"
    return [
        colour(place * tyre, RUBBER, f"tyre_{name}"),
        colour(place * core, HUB, f"wheel_{name}"),
        colour(hub, ALUMINIUM, f"hub_{name}"),
    ]


def drive():
    parts = []
    for side in (1, -1):
        for x in (AXLE_X, -AXLE_X):
            parts += gearmotor(side, x)
            parts += wheel_assembly(side, x)
    return bd.Compound(children=parts, label="drive")


# ---------------------------------------------------------------- electronics


def electronics():
    z = DECK_Z + chassis["plate"]
    b = battery
    adapter_z = z + b["adapterHeight"]
    adapter = box_between(-42, 42, -35, 35, z, adapter_z)
    pack = box_between(-b["length"] / 2, b["length"] / 2, -b["width"] / 2, b["width"] / 2, adapter_z, adapter_z + b["height"])
    pack = pack.fillet(6, pack.edges().filter_by(bd.Axis.Z))
    parts = [
        colour(adapter, DARK, "battery_adapter"),
        colour(pack, "#c8102e", "battery_18v"),
        # Cytron MDD10A motor driver, about 84 x 62 mm.
        colour(box_between(-42, 42, 50, 112, z, z + 20), PCB, "motor_driver"),
        # USB power supply for the controller, and the motion sensor and battery monitor.
        colour(box_between(-100, -60, 55, 80, z, z + 15), DARK, "usb_supply_5v"),
        colour(box_between(55, 80, 55, 73, z, z + 5), "#6a2c91", "imu_bno085"),
        colour(box_between(55, 80, 85, 105, z, z + 8), "#6a2c91", "battery_monitor"),
        # 12 V 20 A buck converter with its heatsink, and the motor relay.
        colour(box_between(-100, -10, -112, -52, z, z + 35), "#5b6168", "regulator_12v"),
        colour(box_between(10, 60, -112, -72, z, z + 20), "#1f3f8f", "relay"),
        # ESP32-S3-DevKitC-1.
        colour(box_between(10, 80, -66, -44, z, z + 12), "#1f3f8f", "controller_esp32s3"),
    ]
    return bd.Compound(children=parts, label="electronics")


# ---------------------------------------------------------------- panels: shell and skirts


def hip_roof():
    base = bd.Plane.XY.offset(shell["baseZ"]) * bd.Rectangle(2 * shell["halfLength"], 2 * shell["halfWidth"])
    top = bd.Plane.XY.offset(shell["topZ"]) * bd.Rectangle(2 * RIDGE_HALF, 2 * TOP_HALF_WIDTH)
    return bd.loft([base, top])


def estop_place():
    """Where the stop button goes: on the rear face, on the centre line."""
    x = -shell["halfLength"] + END_RUN * 0.2
    z = shell["baseZ"] + (shell["halfLength"] + x) * math.tan(math.radians(shell["endSlopeDeg"]))
    return bd.Pos(x, 0, z) * bd.Rot(0, -shell["endSlopeDeg"], 0)


def shell_body():
    """Corrugated plastic hip roof. It rests on the rails and hinges up from its front edge."""
    outer = hip_roof()
    hollow = bd.offset(outer, amount=-shell["thickness"], openings=outer.faces().sort_by(bd.Axis.Z)[0])
    hollow -= estop_place() * bd.Cylinder(ESTOP_HOLE / 2, 40)
    return colour(hollow, COROPLAST, "shell")


def stop_switch():
    """A 22 mm latching emergency stop through the shell's rear face; its contact block hangs inside."""
    place = estop_place()
    collar = bd.Cylinder(16, 8, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    head = bd.Pos(0, 0, 8) * bd.Cylinder(20, 12, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    head = head.fillet(4, head.edges().group_by(bd.Axis.Z)[-1])
    block = bd.Pos(0, 0, -shell["thickness"]) * bd.Box(30, 30, 40, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MAX))
    return [
        colour(place * collar, BALL, "stop_switch_collar"),
        colour(place * head, "#d6201c", "stop_switch"),
        colour(place * block, DARK, "stop_switch_contacts"),
    ]


def end_skirts():
    """Corrugated plastic panels closing the chassis ends below the shell, cable-tied to the rails."""
    inner = RAIL_OUT - RAIL
    top = chassis["wallTopZ"]
    x_end = GRID_PLATE[0] / 2
    front = box_between(x_end - CORO_T, x_end, -inner, inner, DECK_Z + chassis["plate"], top)
    rear = box_between(-x_end, -x_end + CORO_T, -inner, inner, DECK_Z + chassis["plate"], top)
    return [colour(front, PANEL, "skirt_front"), colour(rear, PANEL, "skirt_rear")]


# ---------------------------------------------------------------- pen and gate


def angle_bracket(x, side, hole_z):
    """goBILDA angle mount standing on a pen wall, upright in line with the wall's inner face."""
    y_in = side * PEN_HALF
    foot = box_between(x - 12, x + 12, y_in, side * (PEN_HALF + 24), pen["railTopZ"], pen["railTopZ"] + WALL)
    upright = box_between(x - 12, x + 12, y_in, side * (PEN_HALF + WALL), pen["railTopZ"], hole_z + 12)
    bracket = foot + upright
    bracket -= cylinder_y(x, side * (PEN_HALF - 1), side * (PEN_HALF + WALL + 1), hole_z, 4)
    return bracket


def pen_walls():
    length = pen["sideEndX"] - pen["sideStartX"]
    channel = u_channel(length)
    left = bd.Pos(pen["sideStartX"], PEN_HALF, PEN_Z) * channel
    right = bd.Pos(pen["sideStartX"], -PEN_HALF, PEN_Z) * bd.Rot(180, 0, 0) * channel
    return [colour(left, ALUMINIUM, "pen_wall_left"), colour(right, ALUMINIUM, "pen_wall_right")]


def pen_brackets():
    parts = []
    for side in (1, -1):
        name = "left" if side > 0 else "right"
        parts.append(colour(angle_bracket(pen["hingeX"], side, pen["hingeZ"]), ALUMINIUM, f"pivot_bracket_{name}"))
        parts.append(colour(angle_bracket(GATE_X, side, gate["hingeZ"]), ALUMINIUM, f"gate_bracket_{name}"))
    return parts


def pivots():
    """An M4 bolt through each rail, a 10 mm nylon spacer, and the pivot bracket, with a locknut."""
    parts = []
    for side in (1, -1):
        name = "left" if side > 0 else "right"
        rail_in = RAIL_OUT - WALL
        nut_y0, nut_y1 = side * (PEN_HALF + WALL), side * (PEN_HALF + WALL + 4)
        bolt = cylinder_y(pen["hingeX"], side * rail_in, nut_y1, pen["hingeZ"], M4)
        bolt += cylinder_y(pen["hingeX"], side * (rail_in - 3.5), side * rail_in, pen["hingeZ"], 7)
        nut = cylinder_y(pen["hingeX"], nut_y0, nut_y1, pen["hingeZ"], 7)
        nut -= cylinder_y(pen["hingeX"], side * (PEN_HALF + WALL - 1), side * (PEN_HALF + WALL + 5), pen["hingeZ"], 4)
        spacer = cylinder_y(pen["hingeX"], side * RAIL_OUT, side * PEN_HALF, pen["hingeZ"], SPACER_OD)
        spacer -= cylinder_y(pen["hingeX"], side * (RAIL_OUT - 1), side * (PEN_HALF + 1), pen["hingeZ"], 4)
        parts += [
            colour(bolt, STEEL, f"pivot_bolt_{name}"),
            colour(nut, STEEL, f"pivot_nut_{name}"),
            colour(spacer, PANEL, f"pivot_spacer_{name}"),
        ]
    return parts


def back_wall():
    wall = box_between(pen["backX"] - pen["backWall"], pen["backX"], -PEN_HALF, PEN_HALF, pen["railBottomZ"], pen["railTopZ"])
    return colour(wall, PANEL, "pen_back_wall")


def funnel_wings():
    """Corrugated plastic wings from the pen's front corners out to the mouth."""
    wings = []
    for s in (-1, 1):
        x0, x1 = pen["sideEndX"] + CORO_T / 2, FRONT_X - CORO_T / 2
        y0, y1 = s * (PEN_HALF + CORO_T / 2), s * pen["funnelMouth"] / 2
        length = math.hypot(x1 - x0, y1 - y0)
        angle = math.degrees(math.atan2(y1 - y0, x1 - x0))
        outline = bd.Polyline(
            (0, pen["railBottomZ"]),
            (length, pen["railBottomZ"]),
            (length, pen["funnelTopZ"] - 12),
            (0, pen["funnelTopZ"]),
            close=True,
        )
        wing = bd.extrude(bd.make_face(bd.Plane.XZ * outline), amount=CORO_T / 2, both=True)
        wings.append(colour(bd.Pos(x0, y0, 0) * bd.Rot(0, 0, angle) * wing, PANEL, f"funnel_wing_{'left' if s > 0 else 'right'}"))
    return wings


def skid_x():
    """The middle hole of the pen wall one hole behind the gate."""
    first = pen["sideStartX"] + PITCH
    return first + PITCH * round((GATE_X - PITCH - first) / PITCH)


def skids():
    """Nylon furniture glides, bolted through the bottom flange of each pen wall."""
    out = []
    x = skid_x()
    for s in (-1, 1):
        y = s * (PEN_HALF + RAIL / 2)
        glide = cylinder_z(x, y, 0, SKID_H, SKID_D)
        glide = glide.fillet(3, glide.edges().group_by(bd.Axis.Z)[0])
        stud = cylinder_z(x, y, SKID_H, pen["railBottomZ"] + WALL + 4, M4)
        out.append(colour(glide + stud, "#f4f4ee", f"skid_{'left' if s > 0 else 'right'}"))
    return out


def gate_assembly():
    """M4 threaded rod with fifteen hanging flaps and nylon spacers; a second rod outside them is the stop."""
    rod_half = PEN_HALF + WALL + 6
    hinge_rod = cylinder_y(GATE_X, -rod_half, rod_half, gate["hingeZ"], M4)
    stop_x = GATE_X + gate["stopOffset"]
    stop_rod = cylinder_y(stop_x, -rod_half, rod_half, gate["stopZ"], M4)
    parts = [colour(hinge_rod, STEEL, "gate_rod"), colour(stop_rod, STEEL, "stop_rod")]

    w, pitch, t = gate["flapWidth"], gate["flapPitch"], gate["flapThickness"]
    first = -PEN_HALF + (pen["innerWidth"] - FLAP_COUNT * pitch) / 2 + (pitch - w) / 2  # left edge of flap 1
    bore = M4 / 2 + 0.35
    loop_r = bore + t
    tip_z = gate["hingeZ"] - gate["flapLength"]
    flaps = []
    for i in range(FLAP_COUNT):
        y = first + i * pitch + w / 2
        strip = box_between(GATE_X - t / 2, GATE_X + t / 2, y - w / 2, y + w / 2, tip_z, gate["hingeZ"])
        loop = cylinder_y(GATE_X, y - w / 2, y + w / 2, gate["hingeZ"], 2 * loop_r)
        tie = box_between(GATE_X - t / 2 - 1.2, GATE_X + t / 2 + 1.2, y - 1.5, y + 1.5, gate["hingeZ"] - loop_r - 4, gate["hingeZ"] - loop_r - 1)
        flap = strip + loop + tie - cylinder_y(GATE_X, y - w, y + w, gate["hingeZ"], 2 * bore)
        flaps.append(colour(flap, PP, f"flap_{i + 1:02d}"))
    parts.append(bd.Compound(children=flaps, label="flaps"))

    gaps = [(-PEN_HALF, first)]
    gaps += [(first + i * pitch - (pitch - w), first + i * pitch) for i in range(1, FLAP_COUNT)]
    gaps.append((first + (FLAP_COUNT - 1) * pitch + w, PEN_HALF))
    spacers = []
    for i, (y0, y1) in enumerate(gaps):
        if y1 - y0 < 0.5:
            continue
        tube = cylinder_y(GATE_X, y0 + 0.1, y1 - 0.1, gate["hingeZ"], SPACER_OD) - cylinder_y(GATE_X, y0, y1, gate["hingeZ"], 2 * bore)
        spacers.append(colour(tube, PANEL, f"spacer_{i + 1:02d}"))
    parts.append(bd.Compound(children=spacers, label="spacers"))

    nuts = []
    for s in (-1, 1):
        for x, z, name in ((GATE_X, gate["hingeZ"], "gate"), (stop_x, gate["stopZ"], "stop")):
            nut = cylinder_y(x, s * (PEN_HALF + WALL), s * (PEN_HALF + WALL + 3.2), z, 7)
            nut -= cylinder_y(x, s * (PEN_HALF + WALL - 1), s * (PEN_HALF + WALL + 4.2), z, M4 + 0.2)
            nuts.append(colour(nut, STEEL, f"{name}_nut_{'left' if s > 0 else 'right'}"))
    parts.append(bd.Compound(children=nuts, label="rod_nuts"))
    return bd.Compound(children=parts, label="gate")


def flag_assembly():
    """A child's bike flag: the pole drops through the left pen wall's flange holes."""
    pole = cylinder_z(flag["x"], flag["y"], flag["baseZ"], flag["topZ"], FLAG_POLE_D)
    pennant_len, pennant_h = 220.0, 140.0
    outline = bd.Polyline((0, 0), (-pennant_len, -pennant_h / 2), (0, -pennant_h), close=True)
    pennant = bd.extrude(bd.make_face(bd.Plane.XZ * outline), amount=0.75, both=True)
    pennant = bd.Pos(flag["x"] - FLAG_POLE_D / 2, flag["y"], flag["topZ"] - 10) * pennant
    return bd.Compound(
        children=[colour(pole, "#f2f2ee", "flag_pole"), colour(pennant, BALL, "flag")],
        label="flag",
    )


def pen_parts():
    return [*pen_walls(), *pen_brackets(), back_wall(), *funnel_wings(), *skids(), gate_assembly()]


# ---------------------------------------------------------------- models


@model
def mulligan():
    """The pilot build: chassis, drive, electronics, pen and gate, shell, stop switch and flag."""
    return bd.Compound(
        children=[
            bd.Compound(children=[*rails(), floor_plate(), *end_skirts()], label="chassis"),
            drive(),
            electronics(),
            bd.Compound(children=[*pen_parts(), *pivots()], label="pen"),
            shell_body(),
            *stop_switch(),
            flag_assembly(),
        ],
        label="mulligan",
    )


@model
def mulligan_rover():
    """R0 and R1: the rover with its pickup, before the shell, skirts and flag go on."""
    return bd.Compound(
        children=[
            bd.Compound(children=[*rails(), floor_plate()], label="chassis"),
            drive(),
            electronics(),
            bd.Compound(children=[*pen_parts(), *pivots()], label="pen"),
        ],
        label="mulligan_rover",
    )


@model
def mulligan_pen():
    """The pen and gate on their own: the first thing to build, and push by hand over balls."""
    return bd.Compound(children=pen_parts(), label="mulligan_pen")


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
    mulligan_pen()
    mulligan_with_balls()
