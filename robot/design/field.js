import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage"),
  form = $("settings");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe3e9db);
const camera = new THREE.PerspectiveCamera(36, 1, 2, 15000);
camera.up.set(0, 0, 1);
let renderer,
  orbit,
  rover,
  carriage,
  flaps,
  wheels,
  balls,
  bin,
  binVertices,
  turf,
  trial;
let index = 0,
  started = 0,
  playing = false,
  previousX = 0,
  cameraMode = "assembly";
const light = new THREE.HemisphereLight(0xfffcf0, 0xa0ae92, 2.0);
light.position.set(0, 0, 1);
scene.add(light);
const sun = new THREE.DirectionalLight(0xfff2d4, 2.7);
sun.position.set(650, -550, 1150);
scene.add(sun);

function setCamera(mode) {
  cameraMode = mode;
  const x = trial?.frames[index].pos[0] || 0;
  const views = {
    assembly: [
      [160, 0, 95],
      [750, -990, 610],
    ],
    catcher: [
      [365, 0, 75],
      [360, -460, 390],
    ],
    top: [
      [280, 0, 40],
      [0, -1, 950],
    ],
    side: [
      [210, 0, 95],
      [0, -1050, 45],
    ],
  };
  const [target, offset] = views[mode];
  orbit.target.set(target[0] + x, target[1], target[2]);
  camera.position.copy(orbit.target).add(new THREE.Vector3(...offset));
  orbit.update();
  document
    .querySelectorAll("[data-camera]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", String(b.dataset.camera === mode)),
    );
}

function installModel(gltf) {
  const byName = new Map();
  gltf.scene.traverse((obj) => {
    const i = gltf.parser.associations.get(obj)?.nodes;
    if (i !== undefined) byName.set(gltf.parser.json.nodes[i].name, obj);
    if (obj.isMesh) obj.castShadow = true;
  });
  function part(name) {
    if (!byName.has(name)) throw Error("Missing CAD part: " + name);
    return byName.get(name);
  }
  // Render in the original CAD axes and millimetres, before the GLB root's export conversion.
  rover = part("Mulligan");
  rover.scale.setScalar(1);
  rover.quaternion.identity();
  scene.add(rover);
  bin = part("Lift-out bin").geometry;
  binVertices = bin.getAttribute("position").clone();
  carriage = part("Pickup/Sliding gate");
  flaps = carriage.children.filter((n) =>
    n.userData.name?.includes("Gate flap"),
  );
  if (!flaps.length) throw Error("Missing CAD flap hinges");
  wheels = ["Front left", "Front right", "Rear left", "Rear right"].map(
    (name) => {
      const group = part(name + " wheel"),
        axle = part(name + " wheel/Hub").position.clone();
      for (const child of group.children) child.position.sub(axle);
      group.position.copy(axle);
      return group;
    },
  );
  balls = [1, 2].map((i) => part("Golf balls/Golf ball " + i));
  for (const ball of balls) scene.add(ball);
  part("Golf balls/Golf ball 3").visible = false;
}

function makeGround(run) {
  if (turf) {
    scene.remove(turf);
    turf.geometry.dispose();
    turf.material.dispose();
  }
  const depth = run.options.depth,
    [cx, cy] = run.pit,
    r = run.radius;
  // Place a 5 mm grid over the depression, then extend the flat outer ring to the horizon.
  const coords = [
    -4000,
    ...Array.from({ length: 25 }, (_, i) => (i - 12) * 5),
    4000,
  ];
  const points = [],
    colors = [],
    indices = [];
  const base = new THREE.Color(0xa7bb97),
    dark = new THREE.Color(0x647d56);
  for (const [j, y] of coords.entries())
    for (const [i, x] of coords.entries()) {
      const relief =
        (1 + Math.cos(Math.PI * Math.min(1, Math.hypot(x, y) / r))) / 2;
      points.push(cx + x, cy + y, -depth * relief);
      colors.push(
        ...base
          .clone()
          .lerp(dark, (depth * relief) / 40)
          .toArray(),
      );
      const a = j * coords.length + i,
        b = a + coords.length;
      if (i + 1 < coords.length && j + 1 < coords.length)
        indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  turf = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  turf.receiveShadow = true;
  scene.add(turf);
}

function pose() {
  const f = trial.frames[index];
  const dx = f.pos[0] - previousX;
  previousX = f.pos[0];
  camera.position.x += dx;
  orbit.target.x += dx;
  rover.position.fromArray(f.pos);
  const [w, x, y, z] = f.quat;
  rover.quaternion.set(x, y, z, w);
  carriage.position.set(-f.gate[0], 0, f.gate[1]);
  flaps.forEach((flap, i) => {
    flap.rotation.y = f.flaps[i];
    flap.scale.z = (trial.hinge - trial.options.tip) / trial.flapLength;
  });
  wheels.forEach((wheel, i) => (wheel.rotation.y = f.wheels[i]));
  balls.forEach((ball, i) => ball.position.fromArray(f.balls[i]));
  const cycle = Number(f.t >= trial.period);
  const phase = f.t - cycle * trial.period;
  const steps = [
    "Settling",
    "Approach",
    "Parked",
    "Sweep",
    "Hold",
    "Gate return",
    "Settled",
  ];
  const at = trial.times.findIndex((t) => phase < t);
  $("phase").textContent =
    "Pickup " + (cycle + 1) + " / 2 · " + steps[at < 0 ? 6 : at];
  $("scrub").value = index;
  $("clock").textContent =
    f.t.toFixed(1) + " / " + trial.frames.at(-1).t.toFixed(1) + " s";
}

const units = {
  lane: "mm",
  depth: "mm",
  force: "N",
  sweep: "mm/s",
  tip: "mm",
  wall: "mm",
};
function labels() {
  for (const [name, unit] of Object.entries(units))
    $(name + "Out").value = form.elements[name].value + " " + unit;
}
form.addEventListener("input", labels);
labels();
function playback(on) {
  playing = on;
  $("play").textContent = on
    ? "Pause"
    : index === trial.frames.length - 1
      ? "Replay"
      : "Play";
  if (on) started = performance.now() - trial.frames[index].t * 1000;
}
function report(r) {
  const opt = r.options;
  const first = r.firstStored
    ? "Stored"
    : r.entered[0]
      ? "Transfer missed"
      : "Pickup missed";
  const second = r.stored[1]
    ? "Stored"
    : r.entered[1]
      ? "Transfer missed"
      : "Pickup missed";
  const row = $("history").insertRow(0);
  const location = { ball: "ball", wheel: "wheel track", skid: "skid track" }[
    opt.location
  ];
  for (const text of [
    opt.depth ? opt.depth + " mm · " + location : "Level",
    opt.lane + " mm",
    opt.force + " N · " + opt.sweep + " mm/s · " + opt.tip + " mm tip",
    opt.wall + " mm",
    first,
    r.firstStored ? (r.retained ? "Yes" : "No") : "—",
    second,
    r.peakTilt.join("° / ") + "°",
  ]) {
    row.insertCell().textContent = text;
  }
  if ($("history").rows.length > 6) $("history").deleteRow(-1);
  const total = r.stored.filter(Boolean).length;
  $("summary").textContent =
    total + " of 2 in the bin after both gate returns.";
}

async function run() {
  $("run").disabled = true;
  $("summary").textContent = "Solving two pickups…";
  try {
    const response = await fetch(
      "/course?" + new URLSearchParams(new FormData(form)),
    );
    if (!response.ok) throw Error(await response.text());
    trial = await response.json();
    if (trial.frames[0].flaps.length !== flaps.length)
      throw Error("CAD flap count differs from physics model");
    // Preserve the mounting floor and lowered entry lip when changing the upper bin walls.
    const positions = bin.getAttribute("position");
    const factor =
      (trial.floor + trial.options.wall - trial.lip) /
      (trial.floor + trial.originalWall - trial.lip);
    for (let i = 0; i < positions.count; i++) {
      const z = binVertices.getZ(i);
      positions.setZ(
        i,
        z <= trial.lip ? z : trial.lip + (z - trial.lip) * factor,
      );
    }
    positions.needsUpdate = true;
    bin.computeVertexNormals();
    bin.computeBoundingSphere();
    makeGround(trial);
    index = 0;
    $("scrub").max = trial.frames.length - 1;
    $("play").disabled = false;
    pose();
    report(trial);
    playback(true);
  } catch (error) {
    $("summary").textContent = "Trial unavailable. " + error.message;
  } finally {
    $("run").disabled = false;
  }
}
form.onsubmit = (e) => {
  e.preventDefault();
  run();
};
$("play").onclick = () => {
  if (index === trial.frames.length - 1) index = 0;
  playback(!playing);
  pose();
};
$("scrub").oninput = (e) => {
  if (trial) {
    index = Number(e.target.value);
    playback(false);
    pose();
  }
};
document.querySelectorAll("[data-camera]").forEach(
  (b) =>
    (b.onclick = () => {
      if (orbit) setCamera(b.dataset.camera);
    }),
);

async function start() {
  $("run").disabled = true;
  renderer = new THREE.WebGLRenderer({
    canvas: stage.querySelector("canvas"),
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -1200,
    right: 1200,
    top: 900,
    bottom: -900,
    near: 5,
    far: 3500,
  });
  sun.shadow.normalBias = 0.3;
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.minDistance = 120;
  orbit.maxDistance = 3000;
  orbit.maxPolarAngle = Math.PI * 0.49;
  setCamera(cameraMode);
  new ResizeObserver(() => {
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
  }).observe(stage);
  installModel(await new GLTFLoader().loadAsync("/mulligan.glb"));
  renderer.setAnimationLoop((ts) => {
    if (playing && trial) {
      while (
        index < trial.frames.length - 1 &&
        trial.frames[index + 1].t <= (ts - started) / 1000
      )
        index++;
      pose();
      if (index === trial.frames.length - 1) playback(false);
    }
    renderer.render(scene, camera);
  });
  await run();
}
start().catch((error) => {
  $("summary").textContent =
    "3D view unavailable. " +
    error.message +
    " · The single-ball bench is available above.";
});
