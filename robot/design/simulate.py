# /// script
# requires-python = ">=3.11"
# dependencies = ["mujoco==3.17.0"]
# ///
"""Contact simulation of the straight-line Mulligan pickup and transfer cycle."""

import argparse
import json
import math
import re
import subprocess
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import mujoco
import numpy as np
from ball_holder import BIN_LENGTH, BIN_WALL_HEIGHT, SHEET
from course import CAD, course_settings, course_xml, run_course

HERE = Path(__file__).resolve().parent
PIT_RADIUS = 55.0  # Half-width of the cosine depression, mm.
BALL_LANE = -64.0
DT = 0.001
CONTROLS = {
    "depth": (0, 35, 0),  # mm below surrounding grade
    "tip": (2, 24, None),  # calculated from the CAD parameters
    "sweep": (35, 220, 87),  # mm/s mean horizontal speed
}


def parameters():
    js = 'import { P } from "./params.mjs"; console.log(JSON.stringify(P))'
    result = subprocess.run(
        ["node", "--input-type=module", "-e", js],
        cwd=HERE,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout, object_hook=lambda d: SimpleNamespace(**d))


def values(items):
    return " ".join(f"{v:.9g}" for v in items)


def node(parent, tag, **attributes):
    return ET.SubElement(parent, tag, {k: str(v) for k, v in attributes.items()})


def mm(items):
    return values([v / 1000 for v in items])


def box(body, name, center, dimensions, **attrs):
    return node(
        body,
        "geom",
        name=name,
        type="box",
        pos=mm(center),
        size=mm([n / 2 for n in dimensions]),
        **attrs,
    )


def scene(p, depth, tip, dt):
    t, g = p.transfer, p.gate
    half = p.pen.innerWidth / 2
    crest = t.binRearX + BIN_LENGTH
    mouth = crest + t.crestRun
    radius = p.ball.dia / 2
    ball_x = mouth + p.pen.funnelLength
    ball_y = BALL_LANE
    floor = p.chassis.floorZ + p.chassis.plate + SHEET
    root = ET.Element("mujoco", model="Mulligan catcher")
    node(root, "compiler", angle="radian", autolimits="true")
    node(
        root,
        "option",
        timestep=dt,
        integrator="implicitfast",
        gravity="0 0 -9.81",
        iterations=80,
    )
    default = node(root, "default")
    # Robot geoms can contact the ball (bit 2). Turf is only paired with the ball:
    # the wheel tracks bridge this central divot and set chassis ride height.
    node(
        default,
        "geom",
        contype=1,
        conaffinity=2,
        friction=".45 .0003 .0001",
        solref=".004 1",
        solimp=".95 .99 .0002",
    )
    asset = node(root, "asset")
    world = node(root, "worldbody")
    ground = {
        "priority": 1,
        "condim": 6,
        "rgba": ".15 .32 .18 1",
        "friction": values([0.55, 0.0005, p.ballRolling.rangeGrass * radius / 1000]),
    }
    if depth:
        x, y = np.meshgrid(np.linspace(0, 1100, 221), np.linspace(-240, 240, 97))
        r = np.minimum(1, np.hypot(x - ball_x, y - ball_y) / PIT_RADIUS)
        heights = (1 - np.cos(np.pi * r)) / 2
        # MJCF's elevation rows are specified top to bottom (+y to -y).
        node(
            asset,
            "hfield",
            name="divot",
            nrow=97,
            ncol=221,
            size=values([0.55, 0.24, depth / 1000, 0.02]),
            elevation=values(heights[::-1].ravel()),
        )
        node(
            world,
            "geom",
            name="turf",
            type="hfield",
            hfield="divot",
            pos=mm([550, 0, -depth]),
            **ground,
        )
    else:
        node(world, "geom", name="turf", type="plane", size="2 1 .02", **ground)
    rover = node(world, "body", name="rover")
    node(rover, "joint", name="drive", type="slide", axis="1 0 0")
    # Assumed total loaded structure mass. Actuators track reference positions.
    mass = sum(vars(p.massKg).values()) - 0.25
    node(
        rover,
        "inertial",
        pos="0 0 .085",
        mass=mass,
        diaginertia=values([mass * 0.014, mass * 0.025, mass * 0.035]),
    )
    box(
        rover,
        "chassis",
        [0, 0, p.chassis.floorZ],
        [p.chassis.length, p.chassis.width, 3],
        contype=0,
        conaffinity=0,
        rgba=".6 .2 .1 1",
    )
    toe = mouth - t.flatRun
    vertices = [
        (x, y, z)
        for y in (-half, half)
        for x, z in [(toe, 0), (toe - 5, 0), (crest, t.lipZ - SHEET), (crest, t.lipZ)]
    ]
    node(
        asset,
        "mesh",
        name="incline",
        vertex=mm([v for point in vertices for v in point]),
    )
    node(rover, "geom", name="ramp", type="mesh", mesh="incline", rgba=".35 .5 .40 1")
    mid = (crest + t.binRearX) / 2
    box(rover, "bin_floor", [mid, 0, floor - SHEET / 2], [BIN_LENGTH, 2 * half, SHEET])
    box(
        rover,
        "retaining_lip",
        [crest - SHEET / 2, 0, (floor + t.lipZ) / 2],
        [SHEET, 2 * half, t.lipZ - floor],
    )
    box(
        rover,
        "bin_back",
        [t.binRearX + SHEET / 2, 0, floor + BIN_WALL_HEIGHT / 2],
        [SHEET, 2 * half, BIN_WALL_HEIGHT],
    )
    for side in (-1, 1):
        box(
            rover,
            f"bin_side_{side}",
            [mid, side * (half - SHEET / 2), floor + BIN_WALL_HEIGHT / 2],
            [BIN_LENGTH, SHEET, BIN_WALL_HEIGHT],
        )
        box(
            rover,
            f"rail_{side}",
            [(mouth + crest) / 2, side * (half + 3), 55],
            [t.crestRun, 6, 98],
        )
    carrier = node(rover, "body", name="gate", pos=mm([mouth, 0, g.hingeZ]))
    node(carrier, "joint", name="retract", type="slide", axis="-1 0 0")
    node(carrier, "joint", name="rise", type="slide", axis="0 0 1")
    node(carrier, "inertial", pos="0 0 0", mass=".25", diaginertia=".002 .00002 .002")
    node(
        carrier,
        "geom",
        name="stop",
        type="capsule",
        fromto=mm([2.25, -half, g.stopZ - g.hingeZ, 2.25, half, g.stopZ - g.hingeZ]),
        size=".0015",
    )
    count = math.floor(2 * half / g.flapPitch)
    length = g.hingeZ - tip
    for i in range(count):
        y = (i - (count - 1) / 2) * g.flapPitch
        leaf = node(carrier, "body", name=f"flap{i}", pos=mm([0, y, 0]))
        node(
            leaf,
            "joint",
            name=f"hinge{i}",
            type="hinge",
            axis="0 1 0",
            range="0 1.57",
            damping=".000015",
            solreflimit=".003 1",
        )
        box(
            leaf,
            f"blade{i}",
            [0, 0, -length / 2],
            [g.flapThickness, g.flapWidth, length],
            density=g.flapDensity * 1000,
            rgba=".15 .55 .33 1",
        )
    ball = node(
        world, "body", name="ball", pos=mm([ball_x, ball_y, radius - depth + 0.4])
    )
    node(ball, "freejoint", name="ball_pose")
    node(
        ball,
        "geom",
        name="golf_ball",
        type="sphere",
        size=radius / 1000,
        mass=p.ball.massKg,
        contype=2,
        conaffinity=1,
        rgba=".95 .71 .12 1",
    )
    contacts = node(root, "contact")
    for i in range(count):
        node(
            contacts, "pair", geom1="stop", geom2=f"blade{i}", condim=1, solref=".004 1"
        )
    act = node(root, "actuator")
    for name, kp, kv in [
        ("drive", 30000, 900),
        ("retract", 15000, 120),
        ("rise", 15000, 120),
    ]:
        node(
            act,
            "position",
            name=name,
            joint=name,
            kp=kp,
            kv=kv,
            **({"forcerange": "-1.5 1.5"} if name == "retract" else {}),
        )
    return ET.tostring(root, encoding="unicode")


def smooth(u):
    u = min(1, max(0, u))
    return u * u * (3 - 2 * u)


def run(p, depth, tip, sweep, dt=DT):
    t = p.transfer
    model = mujoco.MjModel.from_xml_string(scene(p, depth, tip, dt))
    d = mujoco.MjData(model)
    mujoco.mj_forward(model, d)
    radius = p.ball.dia / 2
    floor = p.chassis.floorZ + p.chassis.plate + SHEET
    crest = t.binRearX + BIN_LENGTH
    mouth = crest + t.crestRun
    stroke = t.crestRun + t.overtravel
    sweep_start = 3.8
    sweep_end = sweep_start + stroke / sweep
    reset = sweep_end + 0.5
    finish = reset + 2.0
    end = finish + 0.75
    frames = []
    count = int(p.pen.innerWidth // p.gate.flapPitch)
    address = model.jnt_qposadr[model.joint("hinge0").id]
    max_lag = 0.0
    max_angle = 0.0
    in_gate = False
    stored_for = 0.0
    max_overlap = 0.0
    min_angle = 0.0
    floor_id = model.geom("bin_floor").id
    ball_id = model.geom("golf_ball").id
    ball_position = d.joint("ball_pose").qpos[:3]
    last_floor_contact = -1
    sample_at = 0
    for _ in range(math.ceil(end / dt)):
        now = d.time
        drive = (p.pen.funnelLength + 75) * smooth((now - 0.4) / 3.0)
        retract = stroke * (
            smooth((now - sweep_start) / (sweep_end - sweep_start))
            - smooth((now - reset) / 2)
        )
        rise = t.lipZ * min(
            1, max(0, (d.qpos[1] * 1000 - t.flatRun) / (t.crestRun - t.flatRun))
        )
        d.ctrl[:] = np.array([drive, retract, rise]) * 0.001
        mujoco.mj_step(model, d)
        rover, slide, lift = d.qpos[:3] * 1000
        if sweep_start < now < sweep_end + 0.4:
            max_lag = max(max_lag, retract - slide)
        x, y, z = ball_position * 1000
        bx = x - rover
        angles = d.qpos[address : address + count]
        if now < sweep_start:
            max_angle = max(max_angle, float(angles.max()))
        if (
            now < sweep_start
            and bx + radius < mouth
            and abs(y) + radius <= p.pen.innerWidth / 2
        ):
            in_gate = True
        min_angle = min(min_angle, float(angles.min()))
        pairs = d.contact.geom
        ball_contacts = (pairs[:, 0] == ball_id) | (pairs[:, 1] == ball_id)
        if ball_contacts.any():
            max_overlap = max(
                max_overlap, -float(d.contact.dist[ball_contacts].min()) * 1000
            )
        on_floor = np.any(
            ball_contacts & ((pairs[:, 0] == floor_id) | (pairs[:, 1] == floor_id))
        )
        if on_floor:
            last_floor_contact = now
        inside = (
            t.binRearX < bx < crest
            and abs(y) < p.pen.innerWidth / 2
            and abs(z - floor - radius) < 1.0
        )
        stored_for = stored_for + dt if inside else 0
        if now + 1e-8 >= sample_at:
            lane = int(
                np.clip(round(y / p.gate.flapPitch + (count - 1) / 2), 0, count - 1)
            )
            frames.append(
                [
                    round(float(v), 4)
                    for v in (now, rover, slide, lift, x, y, z, angles[lane])
                ]
            )
            sample_at += 1 / 30
    if not np.isfinite(d.qpos).all() or any(w.number for w in d.warning):
        raise RuntimeError("Physics solver reported an unstable run")
    stored = stored_for >= 0.5 and end - last_floor_contact < 0.1
    result = "Stored" if stored else "Transfer missed" if in_gate else "Pickup missed"
    return {
        "result": result,
        "lag": round(max_lag, 2),
        "overlap": round(max_overlap, 2),
        "minAngle": round(math.degrees(min_angle), 2),
        "entered": in_gate,
        "stored": stored,
        "peakAngle": round(math.degrees(max_angle), 1),
        "final": [round(float(v), 1) for v in (bx, y, z)],
        "frames": frames,
        "times": [0.4, 3.4, sweep_start, sweep_end, reset, finish, end],
        "geo": {
            "mouth": mouth,
            "crest": crest,
            "toe": mouth - t.flatRun,
            "lip": t.lipZ,
            "floor": floor,
            "rear": t.binRearX,
            "wall": BIN_WALL_HEIGHT,
            "hinge": p.gate.hingeZ,
            "tip": tip,
            "radius": radius,
            "pitY": BALL_LANE,
            "pitX": mouth + p.pen.funnelLength,
            "pitRadius": PIT_RADIUS,
            "depth": depth,
            "wheelbase": p.wheel.wheelbase,
            "wheelRadius": p.wheel.dia / 2,
            "shell": [[s[0], s[1]] for s in p.bodywork.sections],
        },
    }


def settings(p, supplied):
    output = {}
    for name, (lo, hi, default) in CONTROLS.items():
        value = float(
            supplied.get(
                name, p.gate.hingeZ - p.gate.flapLength if default is None else default
            )
        )
        if not lo <= value <= hi:
            raise ValueError(f"{name} must be between {lo} and {hi}")
        output[name] = value
    return output


def serve(port):
    three = (HERE / "node_modules/three").resolve()
    if not (three / "build/three.module.js").is_file():
        raise SystemExit(
            "Install the local 3D viewer with npm ci --prefix robot/design"
        )
    assets = {
        "/": (HERE / "field.html", "text/html"),
        "/section": (HERE / "catcher.html", "text/html"),
        "/field.js": (HERE / "field.js", "text/javascript"),
        "/mulligan.glb": (CAD, "model/gltf-binary"),
    }

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            url = urlsplit(self.path)
            if url.path in assets:
                path, mime = assets[url.path]
                self.reply(200, mime, path.read_bytes())
                return
            if url.path.startswith("/three/"):
                path = (three / url.path.removeprefix("/three/")).resolve()
                if (
                    path.is_relative_to(three)
                    and path.suffix == ".js"
                    and path.is_file()
                ):
                    self.reply(200, "text/javascript", path.read_bytes())
                else:
                    self.send_error(404)
                return
            if url.path not in ("/run", "/course"):
                self.send_error(404)
                return
            try:
                p = parameters()
                query = {k: v[-1] for k, v in parse_qs(url.query).items()}
                if url.path == "/course":
                    options = course_settings(query)
                    result = run_course(p, options, scene)
                else:
                    options = settings(p, query)
                    result = dict(options=options, **run(p, **options))
                self.reply(
                    200,
                    "application/json",
                    json.dumps(result, allow_nan=False).encode(),
                )
            except (ValueError, RuntimeError, subprocess.CalledProcessError) as exc:
                self.reply(400, "text/plain; charset=utf-8", str(exc).encode())

        def reply(self, status, mime, data):
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(
            f"Mulligan catcher simulator at http://127.0.0.1:{server.server_port}/",
            flush=True,
        )
        server.serve_forever()


def export_replay(path, p, options):
    """Package representative solved trajectories for a browser without a server."""
    trials = []
    for depth in (0, 10, 20):
        settings = dict(options, depth=depth)
        trials.append(dict(options=settings, **run(p, **settings)))
    html = (HERE / "catcher.html").read_text()
    picker = (
        '<h2>Recorded trials</h2><label class="control">Ground profile '
        '<select name="scenario"><option value="0">Level ground</option>'
        '<option value="1">10 mm divot</option><option value="2">20 mm divot</option>'
        '</select></label><button id="run">Load replay</button>'
    )
    html = re.sub(
        r"(<form[^>]+>).*?</form>",
        r"\g<1>" + picker + "</form>",
        html,
        count=1,
        flags=re.DOTALL,
    )
    payload = json.dumps(trials, separators=(",", ":"))
    path.write_text(
        html.replace(
            "<script>",
            f'<script id="recording" type="application/json">{payload}</script>\n<script>',
            1,
        )
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--serve", action="store_true", help="Open a local interactive replay server"
    )
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument(
        "--depth", type=float, default=0, help="Divot depth in mm (0 to 35)"
    )
    parser.add_argument("--tip", type=float, help="Flap-tip clearance in mm (2 to 24)")
    parser.add_argument(
        "--sweep",
        type=float,
        default=87,
        help="Mean horizontal sweep speed in mm/s (35 to 220)",
    )
    parser.add_argument(
        "--xml", type=Path, help="Save the starting MuJoCo scene for inspection"
    )
    parser.add_argument(
        "--replay",
        type=Path,
        help="Write a standalone HTML replay for 0, 10 and 20 mm divots",
    )
    parser.add_argument(
        "--course", action="store_true", help="Run the two-ball CAD trial"
    )
    parser.add_argument(
        "--lane", type=float, help="Second ball offset from centre in mm"
    )
    parser.add_argument(
        "--location",
        choices=["ball", "wheel", "skid"],
        help="Divot position on the course",
    )
    parser.add_argument("--force", type=float, help="Horizontal gate force limit in N")
    parser.add_argument(
        "--wall", type=float, help="Height of bin side and rear walls in mm"
    )
    args = parser.parse_args()
    if args.serve:
        serve(args.port)
        return
    p = parameters()
    try:
        supplied = {k: v for k, v in vars(args).items() if v is not None}
        if args.course:
            if args.replay:
                parser.error("--replay exports single-ball bench trials")
            options = course_settings(supplied)
            if args.xml:
                args.xml.write_text(course_xml(p, options, scene, DT))
            result = run_course(p, options, scene)
            print(
                json.dumps(
                    {
                        k: result[k]
                        for k in (
                            "options",
                            "entered",
                            "firstStored",
                            "retained",
                            "stored",
                            "peakTilt",
                            "peakLag",
                        )
                    },
                    indent=2,
                )
            )
            return
        if any(k in supplied for k in ("lane", "location", "wall", "force")):
            parser.error("--lane, --location, --wall and --force apply to --course")
        options = settings(p, supplied)
    except ValueError as exc:
        parser.error(str(exc))
    if args.replay:
        export_replay(args.replay, p, options)
    if args.xml:
        args.xml.write_text(scene(p, options["depth"], options["tip"], DT))
    result = run(p, **options)
    print(
        f"{result['result']} | Gate entry: {result['entered']} | Peak gate lag: {result['lag']} mm | "
        f"Peak opening: {result['peakAngle']} deg | Final ball centre: {result['final']} mm (chassis frame)"
    )


if __name__ == "__main__":
    main()
