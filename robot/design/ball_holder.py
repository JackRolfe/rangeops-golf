"""Shared transfer geometry. Distances along a track run from the gate towards storage."""

import itertools
import math

BIN_LENGTH = 103
BIN_WALL_HEIGHT = 60
SHEET = 2


def side_profile(points, width):
    import build123d as bd

    sketch = bd.Plane.XZ * bd.Polygon(*points, align=None)
    return bd.extrude(sketch, amount=width / 2, both=True)


def guide_channel(track, z):
    import build123d as bd

    sections = []
    for (x0, h0), (x1, h1) in itertools.pairwise(track):
        dx, dh = x1 - x0, h1 - h0
        slot = bd.SlotOverall(
            math.hypot(dx, dh) + 6.8, 6.8, rotation=math.degrees(math.atan2(dh, dx))
        )
        sections.append(bd.Pos((x0 + x1) / 2, (h0 + h1) / 2 + z) * slot)
    return bd.extrude(
        bd.Plane.XZ * (sections[0] + sections[1] + sections[2]), amount=5, both=True
    )


def ball_height(x, radius, floor, toe, crest, lip):
    """Centre of a ball supported by turf, ramp, lip or bin floor."""
    slope = lip / (crest - toe)
    crest_tangent = crest - radius * slope / math.sqrt(1 + slope * slope)
    if x < crest_tangent:
        return max(radius, slope * (x - toe) + radius * math.sqrt(1 + slope * slope))
    offset = max(0, crest - x, x - crest - SHEET)
    return (
        max(floor + radius, lip + math.sqrt(max(0, radius * radius - offset * offset)))
        if offset <= radius
        else floor + radius
    )
