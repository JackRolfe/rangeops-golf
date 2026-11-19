"""Mulligan concept assembly. Rebuild with cad run robot/design/mulligan.py."""

import json
import math
import subprocess
from pathlib import Path
from types import SimpleNamespace

import build123d as bd
from ball_holder import (
    BIN_LENGTH,
    BIN_WALL_HEIGHT,
    SHEET,
    ball_height,
    guide_channel,
    side_profile,
)
from cad import model
from cad.build123d import animation


def design_parameters():
    # Reading the module here also registers it as a CAD rebuild dependency.
    source = Path(__file__).with_name("params.mjs").read_text()
    result = subprocess.run(
        ["node", "--input-type=module", "-"],
        input=source + "\nconsole.log(JSON.stringify(P));",
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout, object_hook=lambda obj: SimpleNamespace(**obj))


def placed(shape, xyz, name, color):
    part = bd.Pos(*xyz) * shape
    part.label = name
    part.color = color
    return part


def tray(c, w, t):
    height = c.wallTopZ - c.floorZ
    outer = bd.Pos(0, 0, -height / 2) * rounded_pad(c.length, c.width, 37, height)
    inner = bd.Pos(0, 0, c.plate - height / 2) * rounded_pad(
        c.length - 2 * c.plate, c.width - 2 * c.plate, 34, height
    )
    tray_body = outer - inner
    for x in (-w.wheelbase / 2, w.wheelbase / 2):
        shaft_z = w.dia / 2 - c.floorZ - height / 2
        tray_body -= bd.Pos(x, 0, shaft_z) * bd.Rot(90, 0, 0) * bd.Cylinder(4, c.width)
    deck_z = c.floorZ + height / 2
    nose = t.binRearX + BIN_LENGTH
    seat_tool = bd.Pos(t.binRearX + 75, 0, c.floorZ + c.plate - deck_z + 50) * bd.Box(
        150, 306, 100
    )
    tray_body -= seat_tool
    shelf = bd.Pos((nose + t.binRearX - 16) / 2, 0, c.floorZ - deck_z) * rounded_pad(
        nose - t.binRearX + 16, 315, 14, c.plate
    )
    tray_body += shelf
    return placed(tray_body, (0, 0, c.floorZ + height / 2), "Chassis tray", "#a0aaa4")


def rounded_pad(length, width, radius, thickness):
    return bd.extrude(bd.RectangleRounded(length, width, radius), amount=thickness)


def cover(s, style, flag_x, bin_rear):
    # Each section shares eight edge correspondences, giving the moulded skin
    # continuous shoulders from the bumper up to the service deck.
    def profile(z, length, width, corner, inset=0):
        return bd.Pos(0, 0, z) * bd.RectangleRounded(
            length - 2 * inset, width - 2 * inset, corner - inset
        )

    outside = bd.loft([profile(*station) for station in style.sections])
    inside = bd.loft(
        [
            profile(z - 4.5, length, width, radius, 4.5)
            for z, length, width, radius in style.sections
        ]
    )
    mast_hole = bd.Pos(flag_x, 0, s.topZ / 2) * bd.Cylinder(3.5, s.topZ)
    # Close the electronics bay behind the open-top bin and leave its vertical lift path free.
    nose_cut = bd.Pos(bin_rear - 2 + 100, 0, 130) * bd.Box(200, 500, 300)
    bulkhead = outside & (bd.Pos(bin_rear - 3.5, 0, 150) * bd.Box(3, 500, 300))
    shell = (outside - inside + bulkhead) - mast_hole - nose_cut

    # Separate the removable hatch along a closed oblong reveal.
    def hatch_tool(clearance):
        face = bd.RectangleRounded(
            style.hatchLength + 2 * clearance,
            style.hatchWidth + 2 * clearance,
            38 + clearance,
        )
        return bd.Pos(-8, 0, 0) * bd.extrude(face, amount=s.topZ + 10)

    trim = [
        placed(shell - hatch_tool(0.8), (0, 0, 0), "Moulded fairing", "#c7442a"),
        placed(shell & hatch_tool(-0.8), (0, 0, 0), "Service hatch", "#ded9bc"),
    ]

    low_z, length, width, radius = style.sections[0]
    skirt = bd.loft(
        [
            profile(low_z - 10, length - 10, width - 10, radius),
            profile(low_z, length, width, radius),
            profile(low_z + 5, length - 1, width - 1, radius),
        ],
        ruled=True,
    )
    skirt -= bd.Pos(0, 0, low_z - 11) * rounded_pad(
        length - 12, width - 12, radius - 6, 20
    )
    trim.append(placed(skirt - nose_cut, (0, 0, 0), "Perimeter rub rail", "#263631"))

    # Locate the inset lens and service fittings against the actual CAD surface.
    def surface_mount(shape, x, y, label, color, lift=0):
        hits = outside.find_intersection_points(
            bd.Axis((x, y, s.topZ + 80), (0, 0, -1))
        )
        location, normal = hits[0]
        if normal.Z < 0:
            normal = -normal
        along_width = bd.Vector(0, 1, 0)
        across = along_width.cross(normal).normalized()
        plane = bd.Plane(origin=location + normal * lift, x_dir=across, z_dir=normal)
        trim.append(placed(plane.location * shape, (0, 0, 0), label, color))

    surface_mount(
        rounded_pad(13, 100, 5.8, 2.4), 153, 0, "Front light bezel", "#172825"
    )
    for y in (-32, 32):
        surface_mount(
            rounded_pad(4, 22, 1.8, 1.4), 153, y, "Status light", "#f7ecc0", 2.4
        )
    for x in (-92, 77):
        for y in (-55, 55):
            fastener = bd.Cylinder(3.4, 1.2) - bd.extrude(
                bd.RegularPolygon(1.35, 6), amount=1
            )
            surface_mount(fastener, x, y, "Hatch captive screw", "#48514a", 0.6)
    for radius, depth, lift, name, color in [
        (14, 2.4, 1.2, "Stop switch collar", "#f0be30"),
        (9, 5, 4.9, "Switch stem", "#323936"),
        (12, 5, 9.9, "Stop button", "#bb341c"),
    ]:
        surface_mount(bd.Cylinder(radius, depth), -109, -63, name, color, lift)
    return bd.Compound(label="Shell", children=trim)


def wheels(w):
    radius = w.dia / 2
    # Concept wheel with a moulded tread, recessed rim and a six-hole hub.
    hub_radius = radius * 0.53
    body = bd.Cylinder(radius - 3, w.width)
    body = bd.fillet(body.edges().filter_by(bd.GeomType.CIRCLE), radius=4)
    tread_points = []
    teeth = 24
    for i in range(teeth):
        for phase, r in [
            (0, radius - 3.5),
            (0.12, radius),
            (0.63, radius),
            (0.78, radius - 3.5),
        ]:
            angle = 2 * math.pi * (i + phase) / teeth
            tread_points.append((r * math.cos(angle), r * math.sin(angle)))
    belt = bd.Polygon(*tread_points, align=None)
    half_width = w.width * 0.17
    tread = bd.loft(
        [
            bd.Pos(0, 0, -half_width) * belt,
            bd.Pos(0, 0, half_width) * bd.Rot(0, 0, 5) * belt,
        ],
        ruled=True,
    )
    tyre = body + bd.Pos(0, 0, -w.width * 0.21) * tread
    tyre += bd.Pos(0, 0, w.width * 0.21) * bd.Rot(180, 0, 180 / teeth) * tread
    tyre -= bd.Cylinder(hub_radius, w.width)
    rim = bd.Cylinder(hub_radius, w.width - 2) - bd.Cylinder(hub_radius - 3, w.width)
    hub = bd.Cylinder(hub_radius - 2, w.width * 0.44)
    for i in range(6):
        angle = 2 * math.pi * i / 6
        hub -= bd.Pos(
            hub_radius * 0.62 * math.cos(angle), hub_radius * 0.62 * math.sin(angle), 0
        ) * bd.Cylinder(6.5, w.width)
    hub += bd.Cylinder(10, w.width - 3)
    hub = (hub + rim) - bd.Cylinder(3, w.width)
    parts = []
    for end, x in [("Front", w.wheelbase / 2), ("Rear", -w.wheelbase / 2)]:
        for side, y in [("left", w.track / 2), ("right", -w.track / 2)]:
            xyz = (x, y, radius)
            parts.append(
                bd.Compound(
                    label=f"{end} {side} wheel",
                    children=[
                        placed(bd.Rot(90, 0, 0) * tyre, xyz, "Tyre", "#303938"),
                        placed(bd.Rot(90, 0, 0) * hub, xyz, "Hub", "#56615b"),
                        placed(
                            bd.Rot(90, 0, 0) * bd.Cylinder(8.8, 3),
                            (x, y + (1 if y > 0 else -1) * (w.width / 2 - 1.5), radius),
                            "Axle cap",
                            "#e7b64c",
                        ),
                    ],
                )
            )
    return parts


def gearmotor(w, c, x, sign, label):
    z = w.dia / 2
    edge = c.width / 2
    metal = "#9aa4a5"

    def cylinder(diameter, length, y, name, color):
        shape = bd.Rot(90, 0, 0) * bd.Cylinder(diameter / 2, length)
        return placed(shape, (x, sign * y, z), name, color)

    frame = placed(
        bd.Box(42, 4, z - c.floorZ - c.plate + 15),
        (x, sign * (edge - 7), (z + 15 + c.floorZ + c.plate) / 2),
        "Mount",
        "#647074",
    )
    bore = bd.Pos(x, sign * (edge - 7), z) * bd.Rot(90, 0, 0) * bd.Cylinder(4, 5)
    frame = frame - bore
    frame.label, frame.color = "Mount", "#647074"
    return bd.Compound(
        label=label,
        children=[
            cylinder(34, 38, edge - 50, "Motor can", metal),
            cylinder(37, 22, edge - 20, "Reduction gear", "#d1b679"),
            cylinder(29, 6, edge - 72, "Encoder cap", "#384342"),
            cylinder(
                6,
                w.track / 2 - edge + 12,
                (edge - 9 + w.track / 2 + 3) / 2,
                "Output shaft",
                metal,
            ),
            frame,
        ],
    )


def drivetrain(w, c):
    # Packaging proxies for the specified gearmotors and their mounts.
    return [
        gearmotor(w, c, x, sign, f"{end} {side} drive")
        for end, x in [("Front", w.wheelbase / 2), ("Rear", -w.wheelbase / 2)]
        for side, sign in [("left", 1), ("right", -1)]
    ]


def bin_geometry(p):
    t, c = p.transfer, p.chassis
    front = t.binRearX + BIN_LENGTH
    middle = (t.binRearX + front) / 2
    floor = c.floorZ + c.plate + SHEET
    width = p.pen.innerWidth
    outer = bd.Pos(middle, 0, floor - SHEET) * rounded_pad(
        BIN_LENGTH, width, 7, BIN_WALL_HEIGHT + SHEET
    )
    inner = bd.Pos(middle, 0, floor) * rounded_pad(
        BIN_LENGTH - 2 * SHEET, width - 2 * SHEET, 5, BIN_WALL_HEIGHT + 2
    )
    bin_shell = outer - inner
    # The ramp meets a dropped front rim. The two side walls and rear retain their full depth.
    bin_shell -= bd.Pos(front + 1, 0, t.lipZ + 50) * bd.Box(
        2 * (t.overtravel + 3), width + 2, 100
    )
    for sign in (-1, 1):
        slot = bd.Plane.XZ * bd.SlotOverall(44, 7)
        bin_shell -= bd.Pos(
            middle, sign * (width / 2 - SHEET / 2), floor + BIN_WALL_HEIGHT - 9
        ) * bd.extrude(slot, amount=4, both=True)
    return placed(bin_shell, (0, 0, 0), "Lift-out bin", "#e4ddc4")


def collector(p):
    t, pen, gate = p.transfer, p.pen, p.gate
    crest = t.binRearX + BIN_LENGTH
    mouth = crest + t.crestRun
    half = pen.innerWidth / 2
    end = t.crestRun + t.overtravel
    path = [(0, 0), (t.flatRun, 0), (t.crestRun, t.lipZ), (end, t.lipZ)]
    # Local +X runs towards storage. Mount the entire mechanism facing forwards on the chassis.
    mount = bd.Pos(mouth, 0, 0) * bd.Rot(0, 0, 180)
    ramp = side_profile(
        [
            (t.flatRun, 0),
            (t.flatRun + 5, 0),
            (t.crestRun, t.lipZ - SHEET),
            (t.crestRun, t.lipZ),
        ],
        pen.innerWidth,
    )
    parts = [placed(mount * ramp, (0, 0, 0), "Transfer ramp", "#788a7e")]
    top = gate.hingeZ + 25
    plate = side_profile(
        [
            (-5, 9),
            (t.flatRun, 9),
            (t.crestRun, t.lipZ - 12),
            (end + 7, t.lipZ - 12),
            (end + 7, t.lipZ + top),
            (t.crestRun, t.lipZ + top),
            (t.flatRun, top + 1),
            (-5, top),
        ],
        7,
    )
    plate -= guide_channel(path, gate.hingeZ)
    plate -= guide_channel(path, gate.hingeZ + 14)
    for side, sign in [("Left", 1), ("Right", -1)]:
        y = sign * (half + 6)
        parts.append(
            placed(mount * plate, (0, y, 0), side + " carriage rail", "#42554d")
        )
        # A body-coloured cheek ties the front of the wheel arch, the bin dock and the guide together.
        flank = side_profile(
            [
                (129, 72),
                (153, 53),
                (crest + 54, 45),
                (crest + 68, 57),
                (crest + 63, 71),
                (crest + 17, 114),
                (crest - 9, 143),
                (crest - 18, 145),
                (crest - 37, 122),
                (170, 109),
                (139, 96),
            ],
            5,
        )
        parts.append(
            placed(flank, (0, sign * (half + 12), 0), side + " nose fairing", "#c7442a")
        )
        mount_tab = bd.Box(19, 14, 12)
        for x, z in [(158, 80), (crest - 8, 83), (crest + 40, 75)]:
            parts.append(
                placed(mount_tab, (x, sign * (half + 8), z), side + " mount", "#46514c")
            )
        skid = side_profile([(-8, 6), (2, 0), (42, 0), (51, 8), (51, 10), (-8, 10)], 12)
        parts.append(placed(mount * skid, (0, y, 0), side + " skid", "#27332e"))
        delta_y = sign * (pen.funnelMouth / 2) - y
        reach = math.hypot(pen.funnelLength, delta_y)
        yaw = math.degrees(math.atan2(delta_y, pen.funnelLength))
        wing = side_profile(
            [
                (0, 0),
                (reach - 3, 3),
                (reach, 8),
                (reach - 2, 21),
                (reach - 12, 24),
                (12, pen.funnelTopZ - pen.railBottomZ),
                (0, pen.funnelTopZ - pen.railBottomZ),
            ],
            3,
        )
        slit = bd.Pos(reach * 0.55, 0, 16) * (
            bd.Plane.XZ * bd.SlotOverall(reach * 0.65, 7, rotation=-7)
        )
        wing -= bd.extrude(slit, amount=3, both=True)
        parts.append(
            placed(
                bd.Rot(0, 0, yaw) * wing,
                (mouth, y, pen.railBottomZ),
                side + " guide wing",
                "#adbaa9",
            )
        )
        shoe = bd.extrude(
            bd.Plane.XZ * bd.SlotOverall(22, 7, rotation=84), amount=2.8, both=True
        )
        parts.append(
            placed(
                bd.Rot(0, 0, yaw) * bd.Pos(reach - 3, 0, 12) * shoe,
                (mouth, y, pen.railBottomZ),
                side + " wing tip",
                "#dc552c",
            )
        )

    def rod(radius, length):
        return bd.Rot(90, 0, 0) * bd.Cylinder(radius, length)

    carriage = [
        placed(
            rod(1.5, pen.innerWidth + 3),
            (mouth, 0, gate.hingeZ),
            "Flap spindle",
            "#9ca7a3",
        ),
        placed(
            rod(1.5, pen.innerWidth + 3),
            (mouth + 2.25, 0, gate.stopZ),
            "Outward stop",
            "#86938d",
        ),
    ]
    for sign in (-1, 1):
        cheek = bd.extrude(
            bd.Plane.XZ * bd.RectangleRounded(13, 43, 4), amount=1.05, both=True
        )
        carriage.append(
            placed(
                cheek,
                (mouth, sign * (half + 1.25), gate.hingeZ),
                "Carriage end",
                "#59645a",
            )
        )
        for z in (gate.hingeZ, gate.hingeZ + 14):
            carriage.append(
                placed(
                    rod(3, 7.5),
                    (mouth, sign * (half + 5.5), z),
                    "Track follower",
                    "#c3cabe",
                )
            )
    count = int(pen.innerWidth // gate.flapPitch)
    blade = bd.Pos(0, 0, -gate.flapLength / 2) * bd.Box(
        gate.flapThickness, gate.flapWidth, gate.flapLength
    )
    flap = (blade + rod(2.6, gate.flapWidth)) - rod(1.65, gate.flapWidth)
    for i in range(count):
        y = (i - (count - 1) / 2) * gate.flapPitch
        carriage.append(
            placed(flap, (mouth, y, gate.hingeZ), f"Gate flap {i + 1}", "#489467")
        )
    parts.append(bd.Compound(label="Sliding gate", children=carriage))
    return bd.Compound(label="Pickup", children=parts)


def controls(c):
    # Component envelopes on an illustrative bench carrier. No board layout is implied.
    z = c.floorZ + c.plate
    parts = []
    carrier = rounded_pad(64, 101, 5, 3)
    parts.append(placed(carrier, (0, 0, 0), "Carrier", "#3a4541"))
    board = rounded_pad(46, 75, 3, 1.8)
    for x in (-19, 19):
        for y in (-33, 33):
            board -= bd.Pos(x, y, 0) * bd.Cylinder(1.7, 6)
            parts.append(
                placed(bd.Cylinder(3, 6), (x, y, 6), "Board standoff", "#b99858")
            )
    parts.append(placed(board, (0, 0, 9), "Controller PCB", "#235a42"))
    parts.append(placed(bd.Box(19, 23, 2.8), (-4, 12, 12.2), "Radio shield", "#b2b9b3"))
    parts.append(
        placed(rounded_pad(12, 8, 1.8, 4), (0, 32, 10.8), "Service port", "#b9bbb3")
    )
    for x in (-16, 15):
        for y in range(-27, 27, 5):
            parts.append(placed(bd.Box(2.4, 3, 4), (x, y, 12.7), "Header", "#242b29"))
    for x in (-9, 9):
        parts.append(
            placed(bd.Box(12, 12, 3), (x, -18, 12.3), "Driver package", "#242b29")
        )
    return bd.Pos(109, 0, z) * bd.Compound(label="Control carrier", children=parts)


def operating_motion(assembly, p, balls, transfer):
    t, gate = p.transfer, p.gate
    gate_x = t.binRearX + BIN_LENGTH + t.crestRun
    radius = p.ball.dia / 2
    incoming, y0 = balls[0]
    duration = 3.0
    travel = incoming - gate_x + 75
    name = "Collect and stow" if transfer else "Passive pickup"
    motion = animation(assembly, name, duration=9.5 if transfer else duration)
    sweep_start, sweep_end, reset_start, reset_end = 3.6, 6.25, 7.15, 9.0
    end = t.crestRun + t.overtravel
    track = [(0, 0), (t.flatRun, 0), (t.crestRun, t.lipZ), (end, t.lipZ)]
    floor = p.chassis.floorZ + p.chassis.plate + SHEET
    if transfer:
        sweep = [
            (sweep_start + x / end * (sweep_end - sweep_start), (-x, 0, z))
            for x, z in track
        ]
        reset = [
            (reset_end - x / end * (reset_end - reset_start), (-x, 0, z))
            for x, z in reversed(track)
        ]
        motion.channel(
            "Pickup/Sliding gate",
            path="translation",
            keys=sweep + reset,
            interpolation="LINEAR",
        )
    for i, (home_x, _) in enumerate(balls):
        delta = -travel if i == 0 else 0
        keys = [(0, (0, 0, 0)), (duration, (delta, 0, 0))]
        if transfer:
            parked = gate_x - home_x - delta
            for step in range(161):
                run = max(parked, end * step / 160 + radius + gate.flapThickness / 2)
                z = ball_height(run, radius, floor, t.flatRun, t.crestRun, t.lipZ)
                keys.append(
                    (
                        sweep_start + (sweep_end - sweep_start) * step / 160,
                        (gate_x - run - home_x, 0, z - radius),
                    )
                )
            x, _, z = keys[-1][1]
            keys.extend([(6.7, (x - 17, 0, z)), (9.5, (x - 17, 0, z))])
        if transfer or i == 0:
            motion.channel(
                f"Golf balls/Golf ball {i + 1}",
                path="translation",
                keys=keys,
                interpolation="LINEAR",
            )
    for end_name in ["Front", "Rear"]:
        for side in ["left", "right"]:
            motion.rotation(
                f"{end_name} {side} wheel",
                axis=(0, 1, 0),
                by=math.degrees(travel / (p.wheel.dia / 2)),
                start=0,
                end=duration,
                interpolation="LINEAR",
            )

    count = math.floor(p.pen.innerWidth / gate.flapPitch)
    height = gate.hingeZ - radius
    for i in range(count):
        y = (i - (count - 1) / 2) * gate.flapPitch
        edge = max(0, abs(y - y0) - gate.flapWidth / 2)
        if edge >= radius:
            continue
        # Cross-section of the sphere at the nearest edge of this flap.
        section = math.sqrt(radius**2 - edge**2) + gate.flapThickness / 2
        keys = []
        angle = 0
        speed = 0
        dt = duration / 240
        for frame in range(241):
            t = frame * dt
            x = incoming - gate_x - travel * t / duration
            distance = math.hypot(height, x)
            tangent_length = math.sqrt(max(0, distance**2 - section**2))
            bearing = math.atan2(-x, height)
            contact = 0
            if tangent_length <= gate.flapLength:
                contact = bearing + math.asin(section / distance)
            elif distance <= gate.flapLength + section:
                # Once the tangent moves beyond the blade, its tip rides the ball.
                cosine = (distance**2 + gate.flapLength**2 - section**2) / (
                    2 * distance * gate.flapLength
                )
                contact = bearing + math.acos(max(-1, min(1, cosine)))
            # Gravity return for a uniform blade about its end, arrested by the stop.
            speed -= 1.5 * 9810 / gate.flapLength * math.sin(angle) * dt
            new_angle = max(0, contact, angle + speed * dt)
            speed = (new_angle - angle) / dt
            angle = new_angle
            keys.append((t, (0, math.sin(angle / 2), 0, math.cos(angle / 2))))
        motion.channel(
            f"Pickup/Sliding gate/Gate flap {i + 1}",
            path="rotation",
            keys=keys,
            interpolation="LINEAR",
            about=(gate_x, y, gate.hingeZ),
        )


@model
def mulligan():
    p = design_parameters()
    b, c, f = p.battery, p.chassis, p.flag
    case = bd.Box(b.length, b.width, b.height)
    case = bd.fillet(case.edges(), radius=5)
    for grip in range(5):
        groove_x = (grip - 2) * 12
        for side in [-1, 1]:
            case -= bd.Pos(groove_x, side * b.width / 2, -5) * bd.Box(
                4, 3, b.height * 0.55
            )
    pack = placed(
        case, (0, 0, c.floorZ + c.plate + b.height / 2), "Battery envelope", "#404b46"
    )
    mast_height = f.topZ - c.wallTopZ
    pennant = bd.Plane.XZ * bd.Polygon((0, 0), (65, -20), (0, -40), align=None)
    flag = bd.Compound(
        label="Range flag",
        children=[
            placed(
                bd.Cylinder(2, mast_height),
                (f.x, 0, c.wallTopZ + mast_height / 2),
                "Whip",
                "#60695f",
            ),
            placed(
                bd.extrude(pennant, amount=0.8), (f.x, 0, f.topZ), "Pennant", "#f6c740"
            ),
        ],
    )
    balls = []
    radius = p.ball.dia / 2
    mouth = p.transfer.binRearX + BIN_LENGTH + p.transfer.crestRun
    spots = [(mouth + p.pen.funnelLength, -64), (mouth - 67, 0), (mouth - 48, 64)]
    for i, (x, y) in enumerate(spots):
        balls.append(
            placed(
                bd.Sphere(radius),
                (x, y, radius),
                f"Golf ball {i + 1}",
                "#f3cf2e" if i == 0 else "#f2ecd7",
            )
        )
    assembly = bd.Compound(
        label="Mulligan",
        children=[
            tray(c, p.wheel, p.transfer),
            bin_geometry(p),
            controls(c),
            pack,
            cover(p.shell, p.bodywork, f.x, p.transfer.binRearX),
            flag,
            *wheels(p.wheel),
            *drivetrain(p.wheel, c),
            collector(p),
            bd.Compound(label="Golf balls", children=balls),
        ],
    )
    clip = animation(assembly, "Assembly breakdown", duration=6)
    for name, offset, delay in [
        ("Shell", (0, 0, 215), 0),
        ("Range flag", (0, 0, 105), 0),
        ("Battery envelope", (0, 0, 76), 0.45),
        ("Control carrier", (32, 0, 47), 0.55),
        ("* left wheel", (0, 88, 0), 0.75),
        ("* right wheel", (0, -88, 0), 0.75),
        ("Pickup", (92, 0, 0), 1.05),
        ("Lift-out bin", (0, 0, 115), 0.5),
        ("Golf balls", (92, 0, 0), 1.05),
    ]:
        clip.channel(
            name,
            path="translation",
            keys=[
                (delay, (0, 0, 0)),
                (delay + 1.2, offset),
                (4.5 - delay * 0.42, offset),
                (6 - delay * 0.42, (0, 0, 0)),
            ],
        )
    operating_motion(assembly, p, spots, transfer=False)
    operating_motion(assembly, p, spots, transfer=True)
    return assembly


if __name__ == "__main__":
    mulligan()
