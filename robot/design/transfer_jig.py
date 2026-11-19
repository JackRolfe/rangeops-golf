"""Hand-operated catcher study. Local +X points from the mouth towards the bin."""

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
from mulligan import design_parameters, placed

# Trial dimensions in mm. The bin floor sits above the existing chassis plate.
TOE, CREST, LIP = 44, 210, 70
END = CREST + 8
FOLLOWER_SPACING = 24
TRACK = [(0, 0), (TOE, 0), (CREST, LIP), (END, LIP)]


def elevation(x):
    return LIP * max(0, min(1, (x - TOE) / (CREST - TOE)))


def crossbar(width, gate):
    def rod(r, length):
        return bd.Rot(90, 0, 0) * bd.Cylinder(r, length)

    height = gate.hingeZ
    moving = [
        placed(rod(1.5, width + 10), (0, 0, height), "Flap spindle", "#899493"),
        placed(rod(1.5, width + 10), (-2.25, 0, gate.stopZ), "Flap stop", "#899493"),
        placed(rod(7, width + 10), (0, 0, height + 46), "Hand grip", "#de5938"),
    ]
    flap = bd.Pos(0, 0, -gate.flapLength / 2) * bd.Box(
        gate.flapThickness, gate.flapWidth, gate.flapLength
    )
    sleeve = rod(2.6, gate.flapWidth)
    flap = (flap + sleeve) - rod(1.65, gate.flapWidth)
    count = int(width // gate.flapPitch)
    for i in range(count):
        y = (i - (count - 1) / 2) * gate.flapPitch
        moving.append(placed(flap, (0, y, height), f"Flap {i + 1}", "#388360"))
    for side in [-1, 1]:
        y = side * (width / 2 + 3)
        plate = bd.Plane.XZ * bd.RectangleRounded(14, 72, 5)
        moving.append(
            placed(
                bd.extrude(plate, amount=2, both=True),
                (0, y, height + 14),
                "Carriage cheek",
                "#52655b",
            )
        )
        for level in [height, height + FOLLOWER_SPACING]:
            moving.append(
                placed(
                    rod(3, 11),
                    (0, side * (width / 2 + 8), level),
                    "Guide pin",
                    "#afb9ad",
                )
            )
    return bd.Compound(label="Hand carriage", children=moving)


@model
def transfer_jig():
    p = design_parameters()
    w, g = p.pen.innerWidth, p.gate
    floor = p.chassis.floorZ + p.chassis.plate
    fixed = []
    runner = side_profile(
        [(TOE, 0), (TOE + 6, 0), (CREST, LIP - SHEET), (CREST, LIP)], w
    )
    fixed.append(placed(runner, (0, 0, 0), "Feathered ramp", "#b5bbaa"))
    # The two copied slot paths keep the flap spindle vertical in side elevation.
    top = g.hingeZ + FOLLOWER_SPACING + 10
    cheek = side_profile(
        [
            (-9, 0),
            (TOE, 0),
            (CREST, LIP - 18),
            (END + 9, LIP - 18),
            (END + 9, LIP + top),
            (CREST, LIP + top),
            (TOE, top),
            (-9, top),
        ],
        5,
    )
    cheek = (
        cheek
        - guide_channel(TRACK, g.hingeZ)
        - guide_channel(TRACK, g.hingeZ + FOLLOWER_SPACING)
    )
    for side in [-1, 1]:
        fixed.append(
            placed(cheek, (0, side * (w / 2 + 8), 0), "Slotted guide", "#778e8580")
        )
    depth = BIN_LENGTH
    for support_x in (CREST + 12, CREST + depth - 12):
        fixed.append(
            placed(
                bd.Box(12, w + 22, floor - SHEET),
                (support_x, 0, (floor - SHEET) / 2),
                "Bench cradle",
                "#53675b",
            )
        )
    fixed.append(
        placed(
            bd.Box(12, w, elevation(CREST - 12) - SHEET),
            (CREST - 6, 0, (elevation(CREST - 12) - SHEET) / 2),
            "Ramp support",
            "#53675b",
        )
    )
    bin_parts = [
        placed(
            bd.Box(depth, w, SHEET),
            (CREST + depth / 2, 0, floor - SHEET / 2),
            "Bin floor",
            "#d3c9a8",
        )
    ]
    for side in [-1, 1]:
        bin_parts.append(
            placed(
                bd.Box(depth, SHEET, BIN_WALL_HEIGHT),
                (CREST + depth / 2, side * (w / 2 - 1), floor + BIN_WALL_HEIGHT / 2),
                "Bin side",
                "#c2b89e",
            )
        )
    bin_parts.append(
        placed(
            bd.Box(SHEET, w, BIN_WALL_HEIGHT),
            (CREST + depth - 1, 0, floor + BIN_WALL_HEIGHT / 2),
            "End wall",
            "#c2b89e",
        )
    )
    bin_parts.append(
        placed(
            bd.Box(SHEET, w, LIP - floor),
            (CREST + 1, 0, (LIP + floor) / 2),
            "Retaining lip",
            "#dc7048",
        )
    )
    fixed.append(bd.Compound(label="Lift-out bin", children=bin_parts))
    radius = p.ball.dia / 2
    start_x = (26, 42, 52)
    ball_y = (-67, 0, 67)
    balls = [
        placed(
            bd.Sphere(radius),
            (x, y, ball_height(x, radius, floor, TOE, CREST, LIP)),
            f"Ball {i + 1}",
            "#f7df83",
        )
        for i, (x, y) in enumerate(zip(start_x, ball_y))
    ]
    assembly = bd.Compound(
        label="Transfer bench jig", children=[*fixed, crossbar(w, g), *balls]
    )
    motion = animation(assembly, "Hand transfer", duration=5)
    pace = 2.5 / END
    sweep = [(x * pace, (x, 0, z)) for x, z in TRACK]
    reset = [(5 - x * pace * 0.6, (x, 0, z)) for x, z in reversed(TRACK)]
    motion.channel(
        "Hand carriage", path="translation", keys=sweep + reset, interpolation="LINEAR"
    )
    for i, initial in enumerate(start_x):
        keys = []
        for step in range(161):
            x = max(initial, END * step / 160 + radius + g.flapThickness / 2)
            height = ball_height(x, radius, floor, TOE, CREST, LIP)
            keys.append(
                (
                    2.5 * step / 160,
                    (
                        x - initial,
                        0,
                        height - ball_height(initial, radius, floor, TOE, CREST, LIP),
                    ),
                )
            )
        last = keys[-1][1]
        keys.extend(
            [(2.9, (last[0] + 16, 0, last[2])), (5, (last[0] + 16, 0, last[2]))]
        )
        motion.channel(
            f"Ball {i + 1}", path="translation", keys=keys, interpolation="LINEAR"
        )
    return assembly


if __name__ == "__main__":
    transfer_jig()
