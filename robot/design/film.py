# /// script
# dependencies = ["pillow", "imageio-ffmpeg"]
# ///
"""Render Mulligan's CAD clips. Run cad run robot/design/film.py [--draft]."""

import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
import imageio_ffmpeg
from cad.blender import load
from mathutils import Matrix, Vector
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "drawings"
FPS = 24
WIDTH, HEIGHT = 1280, 720
DRAFT = "--draft" in sys.argv


def material(name, color, roughness, metal=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    return mat


def light(name, location, power, size, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy, data.shape, data.size, data.color = power, "DISK", size, color
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (
        (Vector((0.1, 0, 0.1)) - obj.location).to_track_quat("-Z", "Y").to_euler()
    )


def shell_lettering(shell, title, size, center, right, uphill, mat):
    curve = bpy.data.curves.new(title, "FONT")
    curve.body, curve.size, curve.align_x, curve.align_y = (
        title,
        size,
        "CENTER",
        "CENTER",
    )
    curve.space_character = 1.15
    obj = bpy.data.objects.new(title, curve)
    scene.collection.objects.link(obj)
    right, uphill = Vector(right), Vector(uphill)
    normal = right.cross(uphill)
    world = Matrix((right, uphill, normal)).transposed().to_4x4()
    world.translation = Vector(center) + 0.00018 * normal
    obj.parent = shell
    obj.matrix_world = world
    obj.data.materials.append(mat)


def font(size, bold=False):
    candidates = [
        Path("/System/Library/Fonts/Supplemental")
        / ("Arial Bold.ttf" if bold else "Arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu")
        / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"),
        Path("C:/Windows/Fonts") / ("arialbd.ttf" if bold else "arial.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def caption(frame, title, detail, chapter):
    art = Image.new("RGB", (WIDTH, HEIGHT), (246, 246, 237))
    art.paste(frame.convert("RGB"), (0, 0))
    draw = ImageDraw.Draw(art)
    draw.rectangle((0, 608, WIDTH, HEIGHT), fill=(246, 246, 237))
    draw.line((0, 608, WIDTH, 608), fill=(92, 106, 91))
    draw.text((42, 626), title, font=title_font, fill=(22, 48, 36))
    draw.text((44, 677), detail, font=detail_font, fill=(47, 69, 56))
    draw.text(
        (WIDTH - 44, 648),
        "RANGEOPS   /   " + chapter,
        anchor="ra",
        font=label_font,
        fill=(48, 70, 54),
    )
    return art


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
model = load(OUT / "mulligan.glb", fps=FPS)
scene.render.resolution_x, scene.render.resolution_y = WIDTH, 608
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.engine = "CYCLES"
scene.cycles.samples = 10
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.render.use_persistent_data = True
scene.render.image_settings.compression = 8
prefs = bpy.context.preferences.addons["cycles"].preferences
for backend in ("METAL", "OPTIX", "CUDA", "HIP"):
    try:
        prefs.compute_device_type = backend
        prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == backend]
        if devices:
            for device in prefs.devices:
                device.use = device in devices
            scene.cycles.device = "GPU"
            break
    except (TypeError, RuntimeError):
        continue

if DRAFT:
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4

scene.world = bpy.data.worlds.new("Softbox studio")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.64, 0.74, 0.72, 1)
bg.inputs[1].default_value = 0.34
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.view_settings.exposure = -1.15
light("Long warm softbox", (0.5, -0.9, 1.55), 88, 1.0, (1, 0.9, 0.75))
light("Cool rim", (-0.7, 0.9, 1.0), 105, 0.72, (0.77, 0.91, 1))
light("Fill", (1.2, 0.75, 0.65), 20, 0.85, (0.96, 1, 0.87))
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.0003))
floor = bpy.context.object
floor.data.materials.append(material("Sage studio sweep", (0.10, 0.16, 0.123), 0.76))
camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Product lens"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.lens, camera.data.clip_start = 58, 0.005


def print_on_skin(path, title, size, x, y, color, height=0.00025):
    obj = model.objects[path]
    to_local = obj.matrix_world.inverted()
    origin = to_local @ Vector((x, y, 1))
    down = to_local.to_3x3() @ Vector((0, 0, -1))
    hit, location, normal, _ = obj.ray_cast(origin, down.normalized())
    if not hit:
        raise ValueError(f"Lettering missed {path}")
    point = obj.matrix_world @ location
    normal = (to_local.to_3x3().transposed() @ normal).normalized()
    right = Vector((0, 1, 0))
    uphill = normal.cross(right).normalized()
    right = uphill.cross(normal).normalized()
    shell_lettering(obj, title, size, point + normal * height, right, uphill, color)


ivory_ink = material("Warm white ink", (0.93, 0.87, 0.71), 0.43)
dark_ink = material("Green ink", (0.02, 0.054, 0.038), 0.48)
print_on_skin("Shell/Moulded fairing", "MULLIGAN", 0.018, 0.126, 0, ivory_ink, 0.0007)
print_on_skin("Shell/Service hatch", "RANGEOPS", 0.021, 0.003, 0, dark_ink)
print_on_skin("Shell/Service hatch", "G   O   L   F", 0.008, 0.019, 0, dark_ink)

# Dimples catch the raking light in the gate close-up.
ball_mat = material("Ionomer cover", (0.89, 0.90, 0.76), 0.34)
nodes = ball_mat.node_tree.nodes
links = ball_mat.node_tree.links
coords = nodes.new("ShaderNodeTexCoord")
vor = nodes.new("ShaderNodeTexVoronoi")
vor.inputs["Scale"].default_value = 10.5
vor.inputs["Randomness"].default_value = 0.74
links.new(coords.outputs["Generated"], vor.inputs["Vector"])
ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.1, 0.1, 0.1, 1)
ramp.color_ramp.elements[1].position = 0.49
ramp.color_ramp.interpolation = "EASE"
links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
bump = nodes.new("ShaderNodeBump")
bump.inputs["Distance"].default_value = 0.00053
links.new(ramp.outputs["Color"], bump.inputs["Height"])
links.new(bump.outputs["Normal"], nodes["Principled BSDF"].inputs["Normal"])
for path, obj in model.objects.items():
    if path.startswith("Golf balls/") and obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(ball_mat)
    if path.endswith(
        (
            "Hub",
            "Output shaft",
            "Motor can",
            "Mount",
            "Reduction gear",
            "spindle",
            "Outward stop",
        )
    ):
        for mat in obj.data.materials:
            shader = (
                mat.node_tree.nodes.get("Principled BSDF")
                if mat and mat.use_nodes
                else None
            )
            if shader:
                shader.inputs["Metallic"].default_value = 0.72
                shader.inputs["Roughness"].default_value = 0.29

# One yellow range ball gives the viewer a continuous reference through the full cycle.
range_ball = ball_mat.copy()
range_ball.name = "Practice yellow"
range_ball.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
    0.95,
    0.69,
    0.07,
    1,
)
incoming_ball = model.objects["Golf balls/Golf ball 1"]
incoming_ball.data = incoming_ball.data.copy()
incoming_ball.data.materials.clear()
incoming_ball.data.materials.append(range_ball)

shots = [
    (
        "Mulligan",
        "The lift-out bin sits in the nose, between the gate and the drive chassis.",
        "OVERVIEW",
        None,
        40,
    ),
    (
        "Under the shell",
        "The bin lifts out of its chassis pocket for unloading at the bay.",
        "ASSEMBLY",
        "Assembly breakdown",
        127,
    ),
    (
        "Through the gate",
        "Follow the yellow ball through the flaps as Mulligan drives over it.",
        "PICKUP",
        "Collect and stow",
        246,
    ),
]
title_font, detail_font, label_font = font(43, True), font(20), font(15, True)


def frame_camera(shot, frac):
    if shot == 1:
        target = Vector((0.188, 0, 0.150))
        direction = Vector((0.91 - 0.20 * frac, -1, 0.73))
        distance = 2.95
    elif shot == 2:
        # Keep the wheels, shell, gate and bin in a single travelling shot.
        target = Vector((0.238 - 0.027 * frac, 0, 0.042 + 0.019 * frac))
        direction = Vector((0.86 - 0.34 * frac, -1, 0.90 + 0.18 * frac))
        distance = 2.10 + 0.07 * frac
    else:
        target = Vector((0.220, 0, 0.055))
        direction = Vector((0.95 - 0.20 * frac, -1, 0.67 + 0.09 * frac))
        distance = 2.08
    camera.location = target + direction.normalized() * distance
    camera.rotation_euler = (
        (target - camera.location).to_track_quat("-Z", "Y").to_euler()
    )


with tempfile.TemporaryDirectory() as tmp:
    scratch = Path(tmp)
    encoder = None
    if not DRAFT:
        encoder = subprocess.Popen(
            [
                imageio_ffmpeg.get_ffmpeg_exe(),
                "-loglevel",
                "error",
                "-y",
                "-f",
                "rawvideo",
                "-pixel_format",
                "rgb24",
                "-video_size",
                f"{WIDTH}x{HEIGHT}",
                "-framerate",
                str(FPS),
                "-i",
                "-",
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-pix_fmt",
                "yuv420p",
                "-movflags",
                "+faststart",
                str(scratch / "film.mp4"),
            ],
            stdin=subprocess.PIPE,
        )
    origin = model.root.location.copy()
    for shot, (title, detail, chapter, clip, frames) in enumerate(shots):
        model.root.location = origin.copy()
        model.play(clip)
        # While driving, keep the incoming ball fixed on the ground. Once parked,
        # use that one chassis position through transfer, gate reset and the final hold.
        if shot == 2:
            scene.frame_set(0)
            incoming_x = incoming_ball.matrix_world.translation.x
            scene.frame_set(3 * FPS)
            drive_distance = incoming_x - incoming_ball.matrix_world.translation.x
        if DRAFT:
            selected = (
                [0, frames // 2, frames - 1]
                if shot != 2
                else [0, 44, 82, 127, 162, 222, 245]
            )
        else:
            selected = range(frames)
        for i in selected:
            frac = i / (frames - 1)
            model.root.location = origin.copy()
            if shot == 1:
                clip_frame = 6 * FPS * frac
            elif shot == 2:
                clip_frame = min(9.5 * FPS, max(0, i - 5))
            else:
                clip_frame = 0
            scene.frame_set(int(clip_frame), subframe=clip_frame % 1)
            frame_camera(shot, frac)
            if shot == 2:
                forward = drive_distance * min(1, clip_frame / (3 * FPS))
                model.root.location.x += forward
                camera.location.x += forward
                if clip_frame >= 3.5 * FPS:
                    title = "Into the onboard bin"
                    detail = "The gate slides back, guides the balls over the lip and returns to the mouth."
                    chapter = "STORAGE"
            scene.render.filepath = str(scratch / "frame.png")
            bpy.ops.render.render(write_still=True)
            with Image.open(scene.render.filepath) as frame:
                result = caption(frame, title, detail, chapter)
            if DRAFT:
                result.thumbnail((640, 360))
                result.save(
                    Path(tempfile.gettempdir()) / f"mulligan-review-{shot}-{i}.jpg"
                )
            else:
                encoder.stdin.write(result.tobytes())
                if shot == 0 and i == frames // 2:
                    result.save(scratch / "mulligan-preview.jpg", quality=94)
    if encoder:
        encoder.stdin.close()
        if encoder.wait():
            raise RuntimeError("Film encoding failed")
        (scratch / "film.mp4").replace(OUT / "mulligan.mp4")
        (scratch / "mulligan-preview.jpg").replace(OUT / "mulligan-preview.jpg")
