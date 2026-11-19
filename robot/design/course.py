"""Straight-line driving trials, with contact-supported wheels and two independent pickups."""

import json
import math
import struct
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

import mujoco
import numpy as np
from ball_holder import BIN_LENGTH, BIN_WALL_HEIGHT, SHEET

CAD = Path(__file__).resolve().parents[1] / "drawings" / "mulligan.glb"
SECOND_SPACING = 300  # mm of additional travel before the second sweep
WHEELS = ("front_left", "front_right", "rear_left", "rear_right")


def node_transform(node):
    if "matrix" in node:
        return np.asarray(node["matrix"]).reshape(4, 4).T
    mat = np.eye(4)
    x, y, z, w = node.get("rotation", (0, 0, 0, 1))
    rotation = np.empty(9)
    mujoco.mju_quat2Mat(rotation, np.array([w, x, y, z], dtype=float))
    mat[:3, :3] = rotation.reshape(3, 3) * node.get("scale", (1, 1, 1))
    mat[:3, 3] = node.get("translation", (0, 0, 0))
    return mat


@lru_cache(maxsize=1)
def pickup_meshes(filename, modified):
    """Read CAD vertices in chassis coordinates, before the exporter's mm-to-glTF root."""
    raw = filename.read_bytes()
    length = struct.unpack_from("<I", raw, 12)[0]
    gltf = json.loads(raw[20 : 20 + length])
    binary = memoryview(raw)[28 + length :]
    meshes = {}
    # The root alone converts display axes and metres. Preserve all part and subassembly transforms.
    (root,) = gltf["scenes"][gltf["scene"]]["nodes"]
    pending = [(idx, np.eye(4)) for idx in gltf["nodes"][root]["children"]]
    while pending:
        idx, parent = pending.pop()
        node = gltf["nodes"][idx]
        mat = parent @ node_transform(node)
        pending.extend((child, mat) for child in node.get("children", ()))
        name = node["name"]
        if name in ("Pickup/Transfer ramp", "Shell/Moulded fairing") or name.endswith(
            (" skid", " guide wing", " carriage rail")
        ):
            (prim,) = gltf["meshes"][node["mesh"]]["primitives"]
            acc = gltf["accessors"][prim["attributes"]["POSITION"]]
            view = gltf["bufferViews"][acc["bufferView"]]
            if acc["componentType"] != 5126 or acc["type"] != "VEC3":
                raise ValueError(f"Unsupported CAD mesh layout for {name}")
            points = np.ndarray(
                (acc["count"], 3),
                dtype="<f4",
                buffer=binary,
                offset=view.get("byteOffset", 0) + acc.get("byteOffset", 0),
                strides=(view.get("byteStride", 12), 4),
            )
            points = points @ mat[:3, :3].T + mat[:3, 3]
            meshes[name.split("/")[-1]] = np.unique(points.round(4), axis=0)
    if len(meshes) != 8:
        raise ValueError(
            "Re-export Mulligan with the fairing, ramp, two skids, rails and guide wings"
        )
    return meshes


def numbers(items):
    return " ".join(f"{v:.8g}" for v in items)


def course_settings(query):
    location = query.get("location", "ball")
    if location not in ("ball", "wheel", "skid"):
        raise ValueError("Unknown divot location")
    values = {}
    for key, low, high, default in (
        ("depth", 0, 35, 0),
        ("lane", -185, 185, 80),
        ("force", 0.5, 10, 1.5),
        ("sweep", 35, 220, 87),
        ("tip", 2, 24, 8),
        ("wall", 25, 85, BIN_WALL_HEIGHT),
    ):
        value = float(query.get(key, default))
        if not low <= value <= high:
            raise ValueError(f"{key} must be between {low} and {high}")
        values[key] = value
    return dict(location=location, **values)


def pit_center(p, mouth, location):
    if location == "wheel":
        return p.wheel.wheelbase / 2 + (
            p.pen.funnelLength + 75
        ) * 0.7, p.wheel.track / 2
    if location == "skid":
        return mouth + 40, p.pen.innerWidth / 2 + 6
    return mouth + p.pen.funnelLength, -64


def make_course(root, p, opt, mouth):
    """Extend the single-ball bench scene before MuJoCo compiles it."""
    world, asset = root.find("worldbody"), root.find("asset")
    rover = world.find("body[@name='rover']")
    turf = world.find("geom[@name='turf']")
    # Collision bits: 1 catcher, 2 balls, 4 turf, 8 ground-contact hardware.
    turf.attrib.update(contype="4", conaffinity="10")
    px, py = pit_center(p, mouth, opt["location"])
    if opt["depth"]:
        # Reserve the fine collision mesh for the divot. Flush slabs support the rest of the field.
        edge = 75
        grid = np.arange(-edge, edge + 1, 5)
        xs, ys = np.meshgrid(grid, grid)
        r = np.minimum(1, np.hypot(xs, ys) / 55)
        for i, (x0, x1, y0, y1) in enumerate(
            (
                (-3000, -edge, -3000, 3000),
                (edge, 3000, -3000, 3000),
                (-edge, edge, -3000, -edge),
                (-edge, edge, edge, 3000),
            )
        ):
            attrs = dict(turf.attrib)
            attrs.update(
                type="box",
                name=f"grass{i}",
                pos=numbers(
                    [(px + (x0 + x1) / 2) / 1000, (py + (y0 + y1) / 2) / 1000, -0.025]
                ),
                size=numbers([(x1 - x0) / 2000, (y1 - y0) / 2000, 0.025]),
            )
            ET.SubElement(world, "geom", attrs)
        heights = (1 - np.cos(r * np.pi)) / 2
        ET.SubElement(
            asset,
            "hfield",
            name="course",
            nrow=str(len(ys)),
            ncol=str(xs.shape[1]),
            size=numbers([edge / 1000, edge / 1000, opt["depth"] / 1000, 0.02]),
            elevation=numbers(heights[::-1].ravel()),
        )
        turf.attrib.update(
            type="hfield",
            hfield="course",
            pos=numbers([px / 1000, py / 1000, -opt["depth"] / 1000]),
        )
        turf.attrib.pop("size", None)
    for name, kind, axis in (
        ("heave", "slide", "0 0 1"),
        ("roll", "hinge", "1 0 0"),
        ("pitch", "hinge", "0 1 0"),
    ):
        ET.SubElement(rover, "joint", name=name, type=kind, axis=axis)
    inertia = rover.find("inertial")
    wheel_total = vars(p.massKg)["Wheels and hubs (4)"]
    chassis_mass = float(inertia.get("mass")) - wheel_total
    inertia.set("mass", str(chassis_mass))
    inertia.set("diaginertia", numbers(chassis_mass * np.array([0.014, 0.025, 0.035])))
    # Wheel spin is passive. A straight-line position servo tows the chassis.
    for i, name in enumerate(WHEELS):
        center = np.array(
            [
                (1 if i < 2 else -1) * p.wheel.wheelbase / 2,
                (1 if i % 2 == 0 else -1) * p.wheel.track / 2,
                p.wheel.dia / 2,
            ]
        )
        body = ET.SubElement(rover, "body", name=name, pos=numbers(center / 1000))
        ET.SubElement(body, "joint", name=name, type="hinge", axis="0 1 0")
        ET.SubElement(
            body,
            "geom",
            name=name,
            type="cylinder",
            quat=".70710678 .70710678 0 0",
            size=numbers([p.wheel.dia / 2000, p.wheel.width / 2000]),
            mass=str(wheel_total / 4),
            contype="8",
            conaffinity="6",
        )
    for name in ("ramp", "rail_-1", "rail_1"):
        rover.remove(rover.find(f"geom[@name='{name}']"))
    asset.remove(asset.find("mesh[@name='incline']"))
    for name, verts in pickup_meshes(CAD, CAD.stat().st_mtime_ns).items():
        key = name.lower().replace(" ", "_")
        ET.SubElement(asset, "mesh", name=key, vertex=numbers(verts.ravel() / 1000))
        ET.SubElement(
            rover, "geom", name=key, mesh=key, type="mesh", contype="9", conaffinity="6"
        )
    rover.find("geom[@name='chassis']").attrib.update(contype="1", conaffinity="2")
    floor = p.chassis.floorZ + p.chassis.plate + SHEET
    crest = p.transfer.binRearX + BIN_LENGTH
    cut = p.transfer.overtravel + 2
    for name in ("bin_back", "bin_side_-1", "bin_side_1"):
        wall = rover.find(f"geom[@name='{name}']")
        pos = np.fromstring(wall.get("pos"), sep=" ") * 1000
        size = np.fromstring(wall.get("size"), sep=" ") * 1000
        if name.startswith("bin_side"):
            front = dict(wall.attrib)
            front.update(
                name=name + "_nose",
                pos=numbers(
                    [
                        (crest - cut / 2) / 1000,
                        pos[1] / 1000,
                        (p.transfer.lipZ + floor) / 2000,
                    ]
                ),
                size=numbers(
                    [cut / 2000, size[1] / 1000, (p.transfer.lipZ - floor) / 2000]
                ),
            )
            ET.SubElement(rover, "geom", front)
            pos[0] -= cut / 2
            size[0] -= cut / 2
        pos[2] = floor + opt["wall"] / 2
        size[2] = opt["wall"] / 2
        wall.attrib.update(pos=numbers(pos / 1000), size=numbers(size / 1000))
    for blade in rover.findall(".//geom[@type='box']"):
        if blade.get("name", "").startswith("blade"):
            blade.attrib.update(contype="9", conaffinity="6")
    ball = world.find("body[@name='ball']")
    r = p.ball.dia / 2
    for index, (x, y) in enumerate(
        (
            (mouth + p.pen.funnelLength, -64),
            (mouth + p.pen.funnelLength + SECOND_SPACING, opt["lane"]),
        )
    ):
        if index:
            ball = ET.fromstring(ET.tostring(ball))
            world.append(ball)
            ball.set("name", "ball2")
            ball.find("freejoint").set("name", "ball_pose2")
            ball.find("geom").set("name", "golf_ball2")
        depression = (
            opt["depth"]
            * (1 + math.cos(math.pi * min(1, math.hypot(x - px, y - py) / 55)))
            / 2
        )
        ball.set("pos", numbers(np.array([x, y, r - depression + 0.4]) / 1000))
        ball.find("geom").set("conaffinity", "15")
    root.find("actuator/position[@name='retract']").set(
        "forcerange", numbers([-opt["force"], opt["force"]])
    )


def course_xml(p, opt, scene, dt):
    t = p.transfer
    crest = t.binRearX + BIN_LENGTH
    mouth = crest + t.crestRun
    root = ET.fromstring(scene(p, 0, opt["tip"], dt))
    make_course(root, p, opt, mouth)
    return ET.tostring(root, encoding="unicode")


def rounded(a):
    return np.round(a, 5).tolist()


def run_course(p, opt, scene, dt=0.001):
    t = p.transfer
    crest = t.binRearX + BIN_LENGTH
    mouth = crest + t.crestRun
    model = mujoco.MjModel.from_xml_string(course_xml(p, opt, scene, dt))
    data = mujoco.MjData(model)
    stroke = t.crestRun + t.overtravel
    full = 3.8 + stroke / opt["sweep"]
    reset = full + 0.5
    period = reset + 2.75
    travel = p.pen.funnelLength + 75
    times = [0.4, 3.4, 3.8, full, reset, reset + 2, period]
    floor = p.chassis.floorZ + p.chassis.plate + SHEET
    radius = p.ball.dia / 2
    half = p.pen.innerWidth / 2
    count = int(p.pen.innerWidth // p.gate.flapPitch)

    def joint(name):
        return model.jnt_qposadr[model.joint(name).id]

    slide, lift = joint("retract"), joint("rise")
    orientation = [joint("roll"), joint("pitch")]
    flaps = [joint(f"hinge{i}") for i in range(count)]
    wheels = [joint(w) for w in WHEELS]
    rover = data.body("rover")
    balls = [data.body(n) for n in ("ball", "ball2")]
    ball_ids = [model.geom(n).id for n in ("golf_ball", "golf_ball2")]
    floor_id = model.geom("bin_floor").id
    entered = [False, False]
    dwell = np.zeros(2)
    last_contact = np.full(2, -1.0)
    first_stored = False
    retained = True
    lag = [0.0, 0.0]
    peak_tilt = np.zeros(2)
    frames = []
    sample = 0.0

    def ease(u):
        u = max(0.0, min(1.0, u))
        return u * u * (3 - 2 * u)

    for step in range(math.ceil(period * 2 / dt)):
        now = step * dt
        cycle = int(now >= period)
        phase = now - period * cycle
        drive = travel * cycle + (SECOND_SPACING if cycle else travel) * ease(
            (phase - 0.4) / 3
        )
        command = stroke * (
            ease((phase - 3.8) / (full - 3.8)) - ease((phase - reset) / 2)
        )
        extension = data.qpos[slide] * 1000
        rise = t.lipZ * np.clip(
            (extension - t.flatRun) / (t.crestRun - t.flatRun), 0, 1
        )
        data.ctrl[:] = np.array([drive, command, rise]) / 1000
        mujoco.mj_step(model, data)
        # xpos, xmat and contacts all refer to the start of this integration step.
        local = (
            (np.array([b.xpos for b in balls]) - rover.xpos)
            @ rover.xmat.reshape(3, 3)
            * 1000
        )
        inside = (
            (local[:, 0] > t.binRearX)
            & (local[:, 0] < crest)
            & (abs(local[:, 1]) < half)
        )
        resting = inside & (abs(local[:, 2] - floor - radius) < 1.5)
        dwell = np.where(resting, dwell + dt, 0)
        pairs = data.contact.geom
        supports = pairs[(pairs == floor_id).any(axis=1)]
        for i, gid in enumerate(ball_ids):
            if gid in supports:
                last_contact[i] = now
        stored = (dwell >= 0.5) & (now - last_contact < 0.1)
        if not cycle:
            first_stored = bool(stored[0])
        elif first_stored and not (
            inside[0] and floor - radius < local[0, 2] < floor + opt["wall"] + radius
        ):
            retained = False
        if (
            phase < 3.8
            and local[cycle, 0] + radius < mouth
            and abs(local[cycle, 1]) + radius <= half
        ):
            entered[cycle] = True
        if 3.8 <= phase < reset:
            lag[cycle] = max(lag[cycle], command - extension)
        peak_tilt = np.maximum(peak_tilt, abs(np.degrees(data.qpos[orientation])))
        if now + 1e-8 >= sample:
            frames.append(
                {
                    "t": round(now, 4),
                    "pos": rounded(rover.xpos * 1000),
                    "quat": rounded(rover.xquat),
                    "gate": rounded(data.qpos[[slide, lift]] * 1000),
                    "flaps": rounded(data.qpos[flaps]),
                    "wheels": rounded(data.qpos[wheels]),
                    "balls": [rounded(b.xpos * 1000) for b in balls],
                }
            )
            sample += 1 / 30
    if any(w.number for w in data.warning) or not np.isfinite(data.qpos).all():
        raise RuntimeError("Unstable physics run")
    return {
        "frames": frames,
        "period": period,
        "times": times,
        "entered": entered,
        "firstStored": first_stored,
        "retained": first_stored and retained and bool(stored[0]),
        "stored": stored.tolist(),
        "peakLag": np.round(lag, 1).tolist(),
        "peakTilt": np.round(peak_tilt, 2).tolist(),
        "pit": pit_center(p, mouth, opt["location"]),
        "radius": 55,
        "floor": floor,
        "lip": t.lipZ,
        "originalWall": BIN_WALL_HEIGHT,
        "flapLength": p.gate.flapLength,
        "hinge": p.gate.hingeZ,
        "options": opt,
    }
