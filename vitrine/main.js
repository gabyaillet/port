import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =========================================================
   Atelier Folio — un petit monde (forêt, village, lac, moulin)
   traversé en 2CV, à la tombée du jour
   ========================================================= */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const LITE = isTouch || innerWidth < 760; // téléphones : mode léger
const $ = id => document.getElementById(id);

/* ---------- Rendu ---------- */
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LITE ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color('#d8ae88'), 60, 230);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 900);

/* Ciel de fin de journée */
const SUN_DIR = new THREE.Vector3(-0.55, 0.22, 0.8).normalize();
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { sunDir: { value: SUN_DIR } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform vec3 sunDir; varying vec3 vDir;
    void main(){
      float h = vDir.y;
      vec3 top = vec3(.16,.22,.34), mid = vec3(.62,.55,.58), hor = vec3(.95,.72,.52);
      vec3 c = mix(hor, mid, smoothstep(0., .18, h)); c = mix(c, top, smoothstep(.15, .7, h));
      c = mix(c, vec3(.81,.66,.54), smoothstep(0., -.2, h));
      float s = max(dot(vDir, sunDir), 0.);
      c += vec3(1.,.72,.42) * (pow(s, 300.) * 2.5 + pow(s, 24.) * .35 + pow(s, 4.) * .12);
      gl_FragColor = vec4(c, 1.); }`
}));
scene.add(skyMesh);

/* Lumières */
scene.add(new THREE.HemisphereLight('#b9c6dc', '#4d3b2e', 1.0));
const sun = new THREE.DirectionalLight('#ffb978', 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 260 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight('#7f9bd1', 0.6); rim.position.set(60, 40, -60); scene.add(rim);

/* ---------- Outils ---------- */
let seed = 7331; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = LITE ? 2 : renderer.capabilities.getMaxAnisotropy(); return t;
}
const speckle = (g, s, n, a, light = false) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${Math.random() * a})`; const r = Math.random() * 2 + 0.5; g.fillRect(Math.random() * s, Math.random() * s, r, r); } };
const std = o => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
const flat = o => std({ flatShading: true, ...o });
const shadowy = (m, cast = true, receive = true) => { m.castShadow = cast && !LITE; m.receiveShadow = receive && !LITE; return m; };
const O3 = new THREE.Object3D();
const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { O3.position.set(x, y, z); O3.rotation.set(rx, ry, rz); O3.scale.set(sx, sy, sz); O3.updateMatrix(); return O3.matrix.clone(); };
class Pool {
  constructor(geo, material, { cast = true, receive = true } = {}) { Object.assign(this, { geo, mat: material, items: [], cast, receive }); }
  add(m, c) { this.items.push([m, c]); }
  build() {
    if (!this.items.length) return;
    const m = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    this.items.forEach(([mx, c], i) => { m.setMatrixAt(i, mx); if (c) m.setColorAt(i, c); });
    if (m.instanceColor) this.items.forEach(([, c], i) => { if (!c) m.setColorAt(i, new THREE.Color('#fff')); });
    shadowy(m, this.cast, this.receive); scene.add(m);
  }
}

const TEX = {
  plaster: canvasTex(256, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); speckle(g, s, 3000, 0.08); speckle(g, s, 800, 0.4, true); }, 2, 2),
  slate: canvasTex(256, (g, s) => { g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, s, s); const rows = 12, h = s / rows, w = s / 6;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 7; c++) { const x = c * w + (r % 2) * w / 2, y = r * h; const v = 200 + Math.random() * 55; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x + 1.5, y + 1.5, w - 3, h - 2); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 1.5, y + h - 3, w - 3, 2); } }),
  asphalt: canvasTex(512, (g, s) => { g.fillStyle = '#8f8f8f'; g.fillRect(0, 0, s, s); speckle(g, s, 12000, 0.2); speckle(g, s, 5000, 0.22, true); }),
  wood: canvasTex(128, (g, s) => { g.fillStyle = '#b08960'; g.fillRect(0, 0, s, s); for (let i = 0; i < 50; i++) { g.strokeStyle = 'rgba(60,35,15,.2)'; g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.bezierCurveTo(s * .3, y + 3, s * .6, y - 3, s, y + 1); g.stroke(); } for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(40,20,5,.45)'; g.fillRect(0, i * s / 4, s, 2); } })
};
const M = {
  terrain: flat({ vertexColors: true, roughness: 0.95 }),
  road: std({ color: '#857c74', map: TEX.asphalt, roughness: 0.9 }),
  roadLine: std({ color: '#e9dfcc', roughness: 0.6 }),
  walls: std({ map: TEX.plaster, vertexColors: true }),
  slate: std({ color: '#ffffff', map: TEX.slate, vertexColors: true, roughness: 0.6 }),
  trim: std({ color: '#2e2a27', roughness: 0.6 }),
  window: new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ffae52', emissiveIntensity: 1.3 }),
  windowDark: std({ color: '#2a3036', roughness: 0.2, metalness: 0.3 }),
  stone: flat({ color: '#d8ccb8' }),
  rock: flat({ color: '#8a857c', roughness: 0.95 }),
  bark: flat({ color: '#5a4434' }),
  leaf: flat({ color: '#ffffff', roughness: 0.9 }),
  wood: std({ color: '#ffffff', map: TEX.wood }),
  metal: std({ color: '#25221f', roughness: 0.45, metalness: 0.5 }),
  lantern: new THREE.MeshStandardMaterial({ color: '#ffe2b0', emissive: '#ffb35a', emissiveIntensity: 2.2 }),
  water: new THREE.MeshPhysicalMaterial({ color: '#2f5a63', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88, clearcoat: 1 }),
  hay: flat({ color: '#c9a45c' }),
  sail: std({ color: '#efe6d6', roughness: 0.9, side: THREE.DoubleSide })
};
const CONIFER = ['#3f5a46', '#4a6650', '#36503f', '#566f55'].map(c => new THREE.Color(c));
const BROAD = ['#6a7a4b', '#7d8a55', '#5d6c45', '#8c8a55', '#9a7a48'].map(c => new THREE.Color(c));
const WALLS = ['#e8dfcf', '#d9cdb9', '#cfc4b2', '#e3d6c0', '#c9bda9'].map(c => new THREE.Color(c));
const ROOFS = ['#4a4f55', '#3e4349', '#565c62', '#5b4a42'].map(c => new THREE.Color(c));

/* ---------- Le monde : routes et relief ---------- */
const V = (x, z) => new THREE.Vector3(x, 0, z);
const ring = new THREE.CatmullRomCurve3([V(-85, 62), V(-35, 92), V(22, 98), V(78, 70), V(112, 22), V(118, -48), V(100, -110), V(48, -128), V(-8, -112), V(-62, -86), V(-112, -40), V(-122, 18)], true, 'centripetal');
const cross = new THREE.CatmullRomCurve3([V(22, 98), V(14, 52), V(2, 10), V(4, -48), V(-8, -112)], false, 'centripetal');
const ROAD_W = 9;
const roadSamples = [];
for (const [curve, n] of [[ring, 420], [cross, 180]]) for (let i = 0; i <= n; i++) { const p = curve.getPointAt(i / n); roadSamples.push(p.x, p.z); }
const RS = roadSamples.length / 2;
const LAKE = { x: 62, z: -58, r: 26 }, HILL = { x: 78, z: 102 }, VILLAGE = { x: -78, z: 50 };

function base(x, z) {
  let h = 2.4 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017) + 1.7 * Math.sin((x - z) * 0.029) + 0.9 * Math.sin(x * 0.07) * Math.sin(z * 0.061);
  h += 11 * Math.exp(-((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / (2 * 24 * 24));
  const r = Math.hypot(x, z); h += Math.pow(Math.max(0, r - 152), 1.25) * 0.14;
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z); h -= 5.5 * smooth(LAKE.r + 9, LAKE.r - 3, dl);
  return h;
}
function roadNearest(x, z) {
  let best = 1e9, bi = 0;
  for (let i = 0; i < RS; i++) { const dx = roadSamples[i * 2] - x, dz = roadSamples[i * 2 + 1] - z, d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
  return { d: Math.sqrt(best), i: bi };
}
const roadH = new Float32Array(RS);
for (let i = 0; i < RS; i++) roadH[i] = base(roadSamples[i * 2], roadSamples[i * 2 + 1]);
for (let pass = 0; pass < 6; pass++) for (let i = 1; i < RS - 1; i++) roadH[i] = (roadH[i - 1] + roadH[i] * 2 + roadH[i + 1]) / 4; // route adoucie
function H(x, z) {
  const n = roadNearest(x, z);
  return lerp(roadH[n.i], base(x, z), smooth(ROAD_W / 2 + 1, ROAD_W / 2 + 9, n.d));
}
function forestDensity(x, z) {
  const sw = smooth(60, 0, Math.hypot(x + 60, z + 55));
  const edge = smooth(118, 150, Math.hypot(x, z));
  const noise = 0.5 + 0.5 * Math.sin(x * 0.045 + 2) * Math.cos(z * 0.05 - 1);
  return Math.min(1, Math.max(sw, edge * 0.9, noise * 0.45));
}

// relief avec couleurs (prairie, sous-bois, sable, rocher)
{
  const SIZE = 380, SEG = LITE ? 120 : 190;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  const cMeadow = new THREE.Color('#7f8a5a'), cForest = new THREE.Color('#4d5a3c'), cSand = new THREE.Color('#c9b48e'), cRock = new THREE.Color('#8b8378'), cShoulder = new THREE.Color('#9b8c70'), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), n = roadNearest(x, z);
    pos.setY(i, lerp(roadH[n.i] - 0.45, base(x, z), smooth(ROAD_W / 2 + 1, ROAD_W / 2 + 9, n.d))); // un peu sous la route
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z), r = Math.hypot(x, z);
    tmp.copy(cMeadow).lerp(cForest, forestDensity(x, z) * 0.9);
    tmp.lerp(cSand, smooth(LAKE.r + 10, LAKE.r + 2, dl));
    tmp.lerp(cShoulder, smooth(ROAD_W / 2 + 3, ROAD_W / 2, n.d) * 0.8);
    tmp.lerp(cRock, smooth(150, 175, r));
    const v = 0.93 + Math.random() * 0.12; col[i * 3] = tmp.r * v; col[i * 3 + 1] = tmp.g * v; col[i * 3 + 2] = tmp.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(shadowy(new THREE.Mesh(g, M.terrain), false, true));
}

// la route : ruban qui suit le relief, avec deux fines lignes de rive
function ribbon(curve, n, width, mat, offset = 0, lift = 0.12, uvScale = 8) {
  const verts = [], uvs = [], idx = [], len = curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t), nx = -tg.z, nz = tg.x;
    for (const s of [-1, 1]) {
      const x = p.x + nx * (offset + s * width / 2), z = p.z + nz * (offset + s * width / 2);
      verts.push(x, H(x, z) + lift, z); uvs.push(s > 0 ? 1 : 0, t * len / uvScale);
    }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  return shadowy(new THREE.Mesh(g, mat), false, true);
}
for (const [curve, n] of [[ring, 520], [cross, 220]]) {
  scene.add(ribbon(curve, n, ROAD_W, M.road));
  for (const s of [-1, 1]) scene.add(ribbon(curve, n, 0.18, M.roadLine, s * (ROAD_W / 2 - 0.55), 0.15));
}

/* ---------- Collisions ---------- */
const circles = [], boxes = [];
const nearRoad = (x, z, m = 0) => roadNearest(x, z).d < ROAD_W / 2 + m;

/* ---------- Forêt ---------- */
const P = {
  trunk: new Pool(new THREE.CylinderGeometry(0.28, 0.45, 1, 7), M.bark),
  cone: new Pool(new THREE.ConeGeometry(1, 1, 8), M.leaf),
  crown: new Pool(new THREE.IcosahedronGeometry(1, 0), M.leaf),
  rock: new Pool(new THREE.DodecahedronGeometry(1, 0), M.rock),
  window: new Pool(new RoundedBoxGeometry(1, 1, 0.12, 2, 0.04), M.window, { cast: false }),
  windowDark: new Pool(new RoundedBoxGeometry(1, 1, 0.12, 2, 0.04), M.windowDark, { cast: false }),
  frame: new Pool(new THREE.BoxGeometry(1, 1, 0.1), M.trim),
  chimney: new Pool(new RoundedBoxGeometry(1, 1, 1, 2, 0.08), M.stone),
  post: new Pool(new THREE.CylinderGeometry(0.09, 0.12, 1, 8), M.metal),
  lantern: new Pool(new RoundedBoxGeometry(0.36, 0.5, 0.36, 2, 0.06), M.lantern, { cast: false }),
  plank: new Pool(new THREE.BoxGeometry(1, 0.16, 1), M.wood),
  hay: new Pool(new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2), M.hay)
};
function conifer(x, z, s) {
  const y = H(x, z), c = pick(CONIFER);
  P.trunk.add(mtx(x, y + 1.2 * s, z, 0, 0, 0, s, 2.4 * s, s));
  for (let k = 0; k < 3; k++) P.cone.add(mtx(x, y + (2.4 + k * 2.3) * s, z, 0, rnd() * 6, 0, (3.1 - k * 0.75) * s, (4.2 - k * 0.6) * s, (3.1 - k * 0.75) * s), c);
  circles.push({ x, z, r: 0.9 * s, cr: 3 * s, ch: 9.5 * s });
}
function broadleaf(x, z, s) {
  const y = H(x, z), c = pick(BROAD);
  P.trunk.add(mtx(x, y + 1.6 * s, z, 0, 0, 0, s * 0.9, 3.2 * s, s * 0.9));
  P.crown.add(mtx(x, y + 4.4 * s, z, rnd(), rnd() * 6, 0, 2.8 * s, 2.4 * s, 2.8 * s), c);
  P.crown.add(mtx(x + 1.2 * s, y + 5.4 * s, z - 0.6 * s, rnd(), rnd() * 6, 0, 1.9 * s, 1.7 * s, 1.9 * s), c);
  circles.push({ x, z, r: 0.8 * s, cr: 2.8 * s, ch: 7 * s });
}
function rock(x, z, s) { const y = H(x, z); P.rock.add(mtx(x, y + 0.4 * s, z, rnd() * 3, rnd() * 6, rnd() * 3, s * (1 + rnd() * 0.6), s * (0.6 + rnd() * 0.4), s * (1 + rnd() * 0.5))); circles.push({ x, z, r: s * 1.1 }); }
const blocked = (x, z) => Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 38 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 7 || Math.hypot(x - HILL.x, z - HILL.z) < 16 || Math.hypot(x, z) > 168;

/* ---------- Départ et monolithe (réservés avant de planter la forêt) ---------- */
const START = (() => { const t = 0.38, p = cross.getPointAt(t), tg = cross.getTangentAt(t); return { x: p.x, z: p.z, h: Math.atan2(-tg.z, tg.x), fx: tg.x, fz: tg.z }; })();
const MONO = (() => { const x = START.x + START.fx * 24 - START.fz * 11, z = START.z + START.fz * 24 + START.fx * 11; return { x, z }; })();
const segDist = (x, z, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz))); return Math.hypot(x - ax - vx * t, z - az - vz * t); };
const clearing = (x, z) => Math.hypot(x - MONO.x, z - MONO.z) < 14 || segDist(x, z, START.x - START.fx * 20, START.z - START.fz * 20, MONO.x, MONO.z) < 13;
{
  const N = LITE ? 520 : 950; let placed = 0, tries = 0;
  while (placed < N && tries++ < N * 12) {
    const x = (rnd() * 2 - 1) * 170, z = (rnd() * 2 - 1) * 170;
    if (blocked(x, z) || clearing(x, z) || nearRoad(x, z, 8)) continue;
    if (rnd() > forestDensity(x, z) * 0.95 + 0.05) continue;
    const s = 1.1 + rnd() * 1.1;
    if (rnd() < 0.72) conifer(x, z, s); else broadleaf(x, z, s * 0.9);
    placed++;
  }
  for (let k = 0; k < 70; k++) { const x = (rnd() * 2 - 1) * 160, z = (rnd() * 2 - 1) * 160; if (!blocked(x, z) && !clearing(x, z) && !nearRoad(x, z, 3)) rock(x, z, 0.8 + rnd() * 1.6); }
}

/* ---------- Village de pierre ---------- */
const wallParts = [], roofParts = [];
function merge(parts) {
  const out = { p: [], n: [], u: [], c: [] };
  for (const { geo, matrix, color } of parts) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix), p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { out.p.push(p.getX(i), p.getY(i), p.getZ(i)); out.n.push(n.getX(i), n.getY(i), n.getZ(i)); out.u.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); out.c.push(color.r, color.g, color.b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(out.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(out.c, 3)); return g;
}
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z); // la façade (+z local) regarde la cible
function house(x, z, face, w, d, h, tower = false) {
  const y = H(x, z) - 0.4, base = new THREE.Matrix4().makeRotationY(face).setPosition(x, y, z);
  const at = (lx, ly, lz, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().multiplyMatrices(base, mtx(lx, ly, lz, 0, ry, 0, sx, sy, sz));
  wallParts.push({ geo: new RoundedBoxGeometry(w, h, d, 3, 0.25), matrix: at(0, h / 2, 0), color: pick(WALLS) });
  const roofC = pick(ROOFS);
  if (tower) {
    roofParts.push({ geo: new THREE.ConeGeometry(w * 0.82, h * 0.7, 4).rotateY(Math.PI / 4), matrix: at(0, h + h * 0.35, 0), color: roofC });
  } else {
    const rh = h * 0.42, s = new THREE.Shape(); s.moveTo(-w / 2 - 0.7, 0); s.lineTo(w / 2 + 0.7, 0); s.lineTo(0, rh); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d + 1.2, bevelEnabled: false }); const ps = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < ps.count; i++) uv.setXY(i, ps.getZ(i) / 3, (Math.abs(ps.getX(i)) * 0.7 + ps.getY(i)) / 3);
    roofParts.push({ geo: g, matrix: at(0, h, -d / 2 - 0.6), color: roofC });
    P.chimney.add(at(w * 0.25, h + rh * 0.7, d * 0.15, 1, rh + 1.2, 1));
  }
  const floors = Math.max(1, Math.floor(h / 3.6)), cols = Math.max(1, Math.floor(w / 3));
  for (const side of [1, -1]) for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const lx = (-w / 2 + (c + 0.5) * w / cols) * side, ly = 2.2 + f * 3.6, lz = side * (d / 2 + 0.02), ry = side > 0 ? 0 : Math.PI;
    if (f === 0 && side > 0 && c === Math.floor(cols / 2)) { P.frame.add(at(lx, 1.5, lz, 1.7, 3, 1, ry)); P.windowDark.add(at(lx, 1.45, lz + side * 0.05, 1.3, 2.7, 1, ry)); continue; }
    P.frame.add(at(lx, ly, lz, 1.6, 2.2, 1, ry));
    (rnd() < 0.55 ? P.window : P.windowDark).add(at(lx, ly, lz + side * 0.05, 1.3, 1.9, 1, ry));
  }
  boxes.push({ x, z, a: face, hw: w / 2 + 0.3, hd: d / 2 + 0.3, ch: h * (tower ? 1.7 : 1.45) });
}
{
  const placed = [];
  for (let k = 0; k < 90 && placed.length < (LITE ? 11 : 15); k++) {
    const t = (0.9 + k * 0.0032) % 1, p = ring.getPointAt(t), tg = ring.getTangentAt(t), side = k % 2 ? 1 : -1;
    if (Math.hypot(p.x - VILLAGE.x, p.z - VILLAGE.z) > 50) continue;
    const w = 8 + rnd() * 4, d = 7 + rnd() * 2, h = 6.5 + rnd() * 4, off = ROAD_W / 2 + 4 + d / 2;
    const x = p.x - tg.z * side * off, z = p.z + tg.x * side * off;
    if (placed.some(q => Math.hypot(q.x - x, q.z - z) < 11.5) || nearRoad(x, z, 3 + d / 2 - 1)) continue;
    house(x, z, faceTo(x, z, p.x, p.z), w, d, h);
    placed.push({ x, z });
  }
  house(VILLAGE.x + 6, VILLAGE.z - 10, 0.6, 6, 6, 16, true); // clocher
  for (let k = 0; k < 16; k++) { // lanternes
    const t = (0.9 + k * 0.011) % 1, p = ring.getPointAt(t), tg = ring.getTangentAt(t), side = k % 2 ? 1 : -1;
    if (Math.hypot(p.x - VILLAGE.x, p.z - VILLAGE.z) > 55) continue;
    const x = p.x - tg.z * side * (ROAD_W / 2 + 1.4), z = p.z + tg.x * side * (ROAD_W / 2 + 1.4), y = H(x, z);
    P.post.add(mtx(x, y + 2.3, z, 0, 0, 0, 1, 4.6, 1)); P.lantern.add(mtx(x, y + 4.8, z)); circles.push({ x, z, r: 0.35 });
  }
}
scene.add(shadowy(new THREE.Mesh(merge(wallParts), M.walls)));
scene.add(shadowy(new THREE.Mesh(merge(roofParts), M.slate)));

/* ---------- Lac et ponton ---------- */
const lakeWater = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 8, 64).rotateX(-Math.PI / 2), M.water);
{
  lakeWater.position.set(LAKE.x, -1.4, LAKE.z); lakeWater.receiveShadow = !LITE; scene.add(lakeWater);
  circles.push({ x: LAKE.x, z: LAKE.z, r: LAKE.r + 1 });
  const a = Math.atan2(0 - LAKE.z, 30 - LAKE.x), sx = LAKE.x + Math.cos(a) * (LAKE.r + 6), sz = LAKE.z + Math.sin(a) * (LAKE.r + 6);
  for (let k = 0; k < 9; k++) {
    const x = sx - Math.cos(a) * k * 1.4, z = sz - Math.sin(a) * k * 1.4;
    P.plank.add(mtx(x, -0.5, z, 0, -a + Math.PI / 2, 0, 2.6, 1, 1.25));
    if (k % 2 === 0) for (const s of [-1, 1]) P.post.add(mtx(x + Math.sin(a) * s * 1.2, -1.2, z - Math.cos(a) * s * 1.2, 0, 0, 0, 1.4, 2.2, 1.4));
  }
}

/* ---------- Colline et moulin ---------- */
const mill = new THREE.Group(), millHub = new THREE.Group();
{
  const y = H(HILL.x, HILL.z);
  const tower = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 12, 12), M.stone)); tower.position.set(HILL.x, y + 6, HILL.z); scene.add(tower);
  const cap = shadowy(new THREE.Mesh(new THREE.ConeGeometry(3.4, 3.4, 12), flat({ color: '#3e4349', roughness: 0.6 }))); cap.position.set(HILL.x, y + 13.6, HILL.z); scene.add(cap);
  mill.position.set(HILL.x, y + 11.5, HILL.z); mill.rotation.y = -2.2; scene.add(mill);
  millHub.position.z = 3.2; mill.add(millHub);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; millHub.add(arm);
    const spar = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, 11, 0.3), M.trim)); spar.position.y = 5.5; arm.add(spar);
    const sail = shadowy(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 8.5), M.sail)); sail.position.set(1.25, 6.2, 0.1); arm.add(sail);
  }
  circles.push({ x: HILL.x, z: HILL.z, r: 4.2 });
  for (let k = 0; k < 7; k++) { const a = k * 0.9 + 0.4, x = HILL.x + Math.cos(a) * 11, z = HILL.z + Math.sin(a) * 11; P.hay.add(mtx(x, H(x, z) + 1.1, z, 0, a, 0, 2.2, 1.1, 1.1)); circles.push({ x, z, r: 1.4 }); }
}

/* ---------- Monolithe de bienvenue ---------- */
const monolith = new THREE.Group(); scene.add(monolith);
const MONO_POS = new THREE.Vector3(MONO.x, H(MONO.x, MONO.z) + 4, MONO.z);
{
  const { x, z } = MONO, y = H(x, z);
  const stoneDark = std({ color: '#262422', roughness: 0.55, metalness: 0.05 });
  const W = 12, Hh = 5.2;
  const plinth = shadowy(new THREE.Mesh(new RoundedBoxGeometry(W + 1.6, 0.8, 2.6, 3, 0.15), M.stone)); plinth.position.y = 0.4; monolith.add(plinth);
  const slab = shadowy(new THREE.Mesh(new RoundedBoxGeometry(W, Hh, 1, 4, 0.18), stoneDark)); slab.position.y = 0.8 + Hh / 2; monolith.add(slab);
  const c = document.createElement('canvas'); c.width = LITE ? 1024 : 2048; c.height = Math.round(c.width * Hh / W);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = LITE ? 2 : renderer.capabilities.getMaxAnisotropy();
  const draw = () => {
    const g = c.getContext('2d'), w = c.width, h = c.height; g.clearRect(0, 0, w, h);
    let size = h * 0.5; const font = s => `italic 400 ${s}px "Instrument Serif", Georgia, serif`;
    g.font = font(size); while (g.measureText('Bienvenue').width > w * 0.72) { size *= 0.95; g.font = font(size); }
    g.fillStyle = '#efe4d0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Bienvenue', w / 2, h * 0.53);
    tex.needsUpdate = true;
  };
  draw(); if (document.fonts) document.fonts.load('italic 400 80px "Instrument Serif"').then(draw).catch(() => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.94, Hh * 0.9), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.2 }));
  face.position.set(0, 0.8 + Hh / 2, 0.51); monolith.add(face);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.3, 4, 8).rotateX(Math.PI / 2), M.lantern); l.position.set(s * (W / 2 - 1.2), 0.85, 1.4); monolith.add(l); }
  monolith.position.set(x, y - 0.2, z);
  monolith.rotation.y = faceTo(x, z, START.x, START.z) + 0.3;
  monolith.scale.setScalar(0.001);
  boxes.push({ x, z, a: monolith.rotation.y, hw: W / 2 + 1, hd: 1.4, ch: 6 });
}

Object.values(P).forEach(p => p.build());

/* Lucioles en forêt */
const fireflies = (() => {
  const n = LITE ? 50 : 140, pos = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) {
    let x, z, k = 0; do { x = (rnd() * 2 - 1) * 150; z = (rnd() * 2 - 1) * 150; } while ((forestDensity(x, z) < 0.55 || blocked(x, z)) && k++ < 200);
    seeds.push({ x, z, y: H(x, z) + 1 + rnd() * 3, p: rnd() * 6 });
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sprite = canvasTex(64, (c, s) => { const gr = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,230,160,1)'); gr.addColorStop(0.3, 'rgba(255,200,110,.6)'); gr.addColorStop(1, 'rgba(255,180,80,0)'); c.fillStyle = gr; c.fillRect(0, 0, s, s); });
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ map: sprite, size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffd38a' })));
  return { g, seeds, pos };
})();

/* Rondins et bottes de foin à bousculer */
const props = [];
{
  const logG = new THREE.CylinderGeometry(0.45, 0.45, 3.2, 10).rotateZ(Math.PI / 2), baleG = new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14).rotateX(Math.PI / 2);
  const make = (geo, mat, x, z, y0, k) => { const g = new THREE.Group(); g.add(shadowy(new THREE.Mesh(geo, mat))); g.position.set(x, H(x, z) + y0, z); g.rotation.y = rnd() * 3; scene.add(g); props.push({ g, r: 1.8, k, v: new THREE.Vector3(), w: new THREE.Vector3(), still: true }); };
  const p = cross.getPointAt(0.72), tg = cross.getTangentAt(0.72);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) { const x = p.x - tg.z * 7.5 + tg.x * (c + r * 0.5), z = p.z + tg.x * 7.5 + tg.z * (c + r * 0.5); make(logG, M.bark, x, z, 0.45 + r * 0.85, 0.7); }
  for (let k = 0; k < 5; k++) { const t = 0.15 + k * 0.012, q = ring.getPointAt(t), tq = ring.getTangentAt(t), s = k % 2 ? 1 : -1; make(baleG, M.hay, q.x - tq.z * s * 6.5, q.z + tq.x * s * 6.5, 0.9, 0.6); }
}

/* ---------- La 2CV « Charleston » ---------- */
const car = new THREE.Group(), body = new THREE.Group(), wheels = [];
car.add(body); scene.add(car);
{
  const red = new THREE.MeshPhysicalMaterial({ color: '#7d1f2c', roughness: 0.35, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.12 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#15120f', roughness: 0.38, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const canvasTop = std({ color: '#2b2622', roughness: 0.95 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.12, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#33464f', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55 });
  const seam = std({ color: '#3a0c12' });
  const tire = std({ color: '#1b1b1d', roughness: 0.9 }), hub = std({ color: '#efe5cf' });
  const lens = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffe1a0', emissiveIntensity: 1.2, roughness: 0.15 });
  const seatM = std({ color: '#6b4a36', roughness: 0.9 });
  const W = 1.48;
  const add = (geo, m, x, y, z, sh = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); if (sh) shadowy(o); body.add(o); return o; };

  // carrosserie : profil bossu de la 2CV
  const p = new THREE.Shape();
  p.moveTo(-1.92, 0.42); p.lineTo(1.82, 0.42); p.quadraticCurveTo(1.97, 0.45, 1.96, 0.62); p.lineTo(1.9, 0.82);
  p.quadraticCurveTo(1.5, 0.98, 0.58, 1.04); p.lineTo(0.28, 1.5); p.quadraticCurveTo(-0.3, 1.68, -0.95, 1.6);
  p.quadraticCurveTo(-1.55, 1.5, -1.86, 0.98); p.quadraticCurveTo(-1.98, 0.7, -1.92, 0.42);
  add(new THREE.ExtrudeGeometry(p, { depth: W, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 5, curveSegments: 22 }).translate(0, 0, -W / 2), red, 0, 0, 0);
  // capot noir à nervures
  const hood = new THREE.Shape();
  hood.moveTo(1.93, 0.84); hood.quadraticCurveTo(1.5, 1.0, 0.56, 1.07); hood.lineTo(0.56, 0.86); hood.quadraticCurveTo(1.5, 0.78, 1.95, 0.6); hood.closePath();
  add(new THREE.ExtrudeGeometry(hood, { depth: W + 0.14, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 16 }).translate(0, 0.02, -W / 2 - 0.07), black, 0, 0, 0);
  for (let k = 0; k < 6; k++) add(new THREE.CapsuleGeometry(0.018, 1.05, 2, 6).rotateZ(Math.PI / 2 - 0.13), black, 1.24, 1.05, -0.5 + k * 0.2);
  // portières, poignées, décor noir sur les flancs
  for (const s of [-1, 1]) {
    const zz = s * (W / 2 + 0.095);
    for (const x of [0.5, -0.32, -1.2]) add(new THREE.BoxGeometry(0.025, 0.62, 0.02), seam, x, 0.78, zz, false);
    add(new THREE.BoxGeometry(1.75, 0.025, 0.02), seam, -0.35, 1.08, zz, false);
    for (const x of [0.32, -0.55]) add(new THREE.CapsuleGeometry(0.025, 0.12, 2, 6).rotateZ(Math.PI / 2), chrome, x, 0.98, zz + s * 0.02, false);
    const deco = new THREE.Shape(); deco.moveTo(1.6, 0.5); deco.quadraticCurveTo(0.2, 1.08, -1.75, 0.62); deco.lineTo(-1.75, 0.5); deco.closePath();
    const dm = new THREE.Mesh(new THREE.ExtrudeGeometry(deco, { depth: 0.01, bevelEnabled: false, curveSegments: 18 }), black);
    dm.position.z = s > 0 ? W / 2 + 0.092 : -(W / 2 + 0.092) - 0.01; body.add(dm);
  }
  // capote en toile
  const top = new THREE.Shape();
  top.moveTo(0.26, 1.5); top.quadraticCurveTo(-0.3, 1.69, -0.95, 1.61); top.quadraticCurveTo(-1.4, 1.55, -1.62, 1.36); top.lineTo(-1.5, 1.3); top.quadraticCurveTo(-1.2, 1.46, -0.95, 1.5); top.quadraticCurveTo(-0.3, 1.58, 0.3, 1.42); top.closePath();
  add(new THREE.ExtrudeGeometry(top, { depth: W - 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 18 }).translate(0, 0.03, -(W - 0.14) / 2), canvasTop, 0, 0, 0);
  for (let k = 0; k < 4; k++) add(new THREE.CapsuleGeometry(0.02, W - 0.2, 2, 6).rotateX(Math.PI / 2), canvasTop, 0.05 - k * 0.42, 1.66 - Math.abs(k - 1.2) * 0.03, 0, false);
  // vitres, habitacle, volant, essuie-glaces
  const win = new THREE.Shape();
  win.moveTo(0.42, 1.1); win.lineTo(0.2, 1.43); win.quadraticCurveTo(-0.3, 1.55, -0.85, 1.5); win.quadraticCurveTo(-1.25, 1.44, -1.4, 1.2); win.lineTo(-1.35, 1.1); win.closePath();
  for (const s of [-1, 1]) { const wm = new THREE.Mesh(new THREE.ExtrudeGeometry(win, { depth: 0.02, bevelEnabled: false }), glass); wm.position.z = s > 0 ? W / 2 + 0.1 : -(W / 2 + 0.1) - 0.02; body.add(wm); }
  add(new THREE.BoxGeometry(0.06, 0.44, W + 0.22), red, -0.32, 1.31, 0);
  add(new THREE.BoxGeometry(0.03, 0.52, W - 0.04), glass, 0.43, 1.28, 0, false).rotation.z = 0.98;
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.02, 0.4, 0.02), black, 0.6, 1.2, s * 0.3, false).rotation.set(0.5 * s, 0, 0.98);
  for (const x of [0.0, -0.85]) { add(new RoundedBoxGeometry(0.5, 0.12, 1.2, 2, 0.05), seatM, x, 0.78, 0); add(new RoundedBoxGeometry(0.12, 0.5, 1.2, 2, 0.05), seatM, x - 0.25, 1.02, 0); }
  add(new THREE.TorusGeometry(0.17, 0.025, 6, 20), black, 0.28, 1.08, 0.32, false).rotation.set(0, Math.PI / 2, 0.5);
  // ailes avant et arrière, marchepieds, phares, clignotants, feux
  const arch = (r, len) => { const s = new THREE.Shape(); s.absarc(0, 0, r + 0.12, 0, Math.PI, false); s.lineTo(-r - 0.12 - len * 0.2, -0.02); s.lineTo(-r + 0.02, -0.02); s.absarc(0, 0, r - 0.02, Math.PI, 0, true); s.lineTo(r + 0.12, -0.02); return s; };
  const ext = d => ({ depth: d, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 24 });
  for (const s of [-1, 1]) {
    add(new THREE.ExtrudeGeometry(arch(0.5, 1.6), ext(0.36)), red, 1.28, 0.48, s * (W / 2 - 0.02) - (s > 0 ? 0 : 0.36));
    add(new THREE.ExtrudeGeometry(arch(0.5, 0.5), ext(0.3)), red, -1.22, 0.48, s * (W / 2 - 0.04) - (s > 0 ? 0 : 0.3));
    add(new RoundedBoxGeometry(1.55, 0.07, 0.22, 2, 0.03), black, 0.03, 0.42, s * (W / 2 + 0.13));
    const hl = new THREE.Group();
    hl.add(shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2), chrome)));
    const ln = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24).rotateY(Math.PI / 2), lens); ln.position.x = 0.006; hl.add(ln);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24).rotateY(Math.PI / 2), chrome); rim.position.x = 0.01; hl.add(rim);
    const st = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), chrome)); st.position.set(-0.1, -0.2, 0); hl.add(st);
    hl.position.set(1.78, 1.18, s * 0.6); body.add(hl);
    add(new THREE.SphereGeometry(0.07, 10, 8), chrome, 0.55, 1.22, s * (W / 2 + 0.2));
    add(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#f5a623', emissive: '#d9861a', emissiveIntensity: 0.6 }), 1.5, 0.95, s * 0.72, false);
    add(new THREE.CapsuleGeometry(0.06, 0.06, 4, 8), new THREE.MeshStandardMaterial({ color: '#d0352a', emissive: '#c22b20', emissiveIntensity: 1 }), -1.96, 0.78, s * 0.55, false);
  }
  // calandre, chevrons, pare-chocs, plaques
  for (let k = 0; k < 6; k++) add(new THREE.CapsuleGeometry(0.018, 0.74, 2, 6).rotateX(Math.PI / 2), chrome, 1.98, 0.52 + k * 0.058, 0, false);
  for (const y of [0.76, 0.81]) add(new THREE.TorusGeometry(0.12, 0.022, 6, 3, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), chrome, 2.0, y, 0, false);
  for (const x of [2.05, -2.01]) add(new THREE.CapsuleGeometry(0.065, W + 0.24, 4, 12).rotateX(Math.PI / 2), chrome, x, 0.46, 0);
  const plateTex = canvasTex(256, (g, s) => { g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, s, s); g.fillStyle = '#1a3a8a'; g.fillRect(0, 0, s * 0.12, s); g.fillStyle = '#111'; g.font = 'bold 120px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2CV', s * 0.56, s * 0.52); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10); });
  const plateM = std({ map: plateTex, roughness: 0.5 });
  for (const [x, ry] of [[2.12, Math.PI / 2], [-2.06, -Math.PI / 2]]) add(new THREE.PlaneGeometry(0.5, 0.14), plateM, x, 0.62, 0, false).rotation.y = ry;
  // roues fines et hautes
  const tg = new THREE.TorusGeometry(0.34, 0.1, 12, 32), sg = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 28).rotateX(Math.PI / 2), hg = new THREE.CylinderGeometry(0.2, 0.22, 0.24, 24).rotateX(Math.PI / 2), cg = new THREE.SphereGeometry(0.08, 10, 8);
  for (const [x, z, front] of [[1.28, 0.78, true], [1.28, -0.78, true], [-1.22, 0.78, false], [-1.22, -0.78, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.43, z);
    const spin = new THREE.Group(); pivot.add(spin);
    spin.add(shadowy(new THREE.Mesh(tg, tire)), shadowy(new THREE.Mesh(sg, tire)), shadowy(new THREE.Mesh(hg, hub)));
    const cap = new THREE.Mesh(cg, chrome); cap.position.z = z > 0 ? 0.13 : -0.13; spin.add(cap);
    car.add(pivot); wheels.push({ pivot, spin, front });
  }
  // ombre douce sous la voiture
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: canvasTex(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }),
    transparent: true, depthWrite: false }));
  blob.position.y = 0.36; car.add(blob);
  car.scale.setScalar(1.6);
}



/* ---------- Conduite ---------- */
const keys = { up: false, down: false, left: false, right: false, brake: false };
const KMAP = { ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake' };
const setKey = (k, v) => { if (k in keys) keys[k] = v; };
addEventListener('keydown', e => { const k = KMAP[e.code]; if (k) { setKey(k, true); e.preventDefault(); } if (e.code === 'KeyR') resetCar(); });
addEventListener('keyup', e => { const k = KMAP[e.code]; if (k) setKey(k, false); });
const resetBtn = $('reset'); if (resetBtn) resetBtn.addEventListener('click', () => resetCar());
document.querySelectorAll('.touch button[data-k]').forEach(b => {
  const on = e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); setKey(b.dataset.k, true); };
  const off = () => { b.classList.remove('on'); setKey(b.dataset.k, false); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
const state = { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0, bounce: 0, y: H(START.x, START.z) };
const MAX = 30, REV = -10, ACC = 13, BRAKE = 30, DRAG = 0.32, CAR_R = 2.4;
let snapCam = false;
function resetCar() { Object.assign(state, { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0 }); cam.yaw = Math.atan2(Math.sin(START.h), -Math.cos(START.h)); snapCam = true; }
let shake = 0; const bump = () => { shake = Math.min(1, shake + 0.5); };
let stuckT = 0; const stuckP = { x: 0, z: 0 };
function pushOut(nx, nz, depth) {
  state.x += nx * depth; state.z += nz * depth;
  const vx = Math.cos(state.heading) * state.speed, vz = -Math.sin(state.heading) * state.speed, vn = vx * nx + vz * nz;
  if (vn < 0) { const hard = -vn > 12; state.speed *= hard ? -0.3 : 0.55; if (-vn > 4) bump(); }
}
function collide() {
  for (const c of circles) {
    const dx = state.x - c.x, dz = state.z - c.z; if (Math.abs(dx) > c.r + CAR_R || Math.abs(dz) > c.r + CAR_R) continue;
    const d = Math.hypot(dx, dz) || 1e-3, min = c.r + CAR_R; if (d < min) pushOut(dx / d, dz / d, min - d);
  }
  for (const b of boxes) {
    const dx = state.x - b.x, dz = state.z - b.z, reach = b.hw + b.hd + CAR_R; if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const ca = Math.cos(b.a), sa = Math.sin(b.a), lx = dx * ca - dz * sa, lz = dx * sa + dz * ca; // repère local de la boîte
    const qx = Math.max(-b.hw, Math.min(lx, b.hw)), qz = Math.max(-b.hd, Math.min(lz, b.hd));
    let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez), depth;
    if (d < 1e-4) { const ox = b.hw - Math.abs(lx), oz = b.hd - Math.abs(lz); if (ox < oz) { ex = Math.sign(lx) || 1; ez = 0; depth = ox + CAR_R; } else { ex = 0; ez = Math.sign(lz) || 1; depth = oz + CAR_R; } d = 1; }
    else { if (d >= CAR_R) continue; depth = CAR_R - d; }
    const nlx = ex / d, nlz = ez / d; pushOut(nlx * ca + nlz * sa, -nlx * sa + nlz * ca, depth);
  }
  const r = Math.hypot(state.x, state.z), L = 152; if (r > L) pushOut(-state.x / r, -state.z / r, r - L);
  if (!Number.isFinite(state.x) || !Number.isFinite(state.z) || !Number.isFinite(state.speed)) resetCar();
}

/* Poussière */
const dust = (() => {
  const n = LITE ? 30 : 80, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshStandardMaterial({ color: '#d9c4a6', roughness: 1, transparent: true, opacity: 0.6 }), n);
  const items = [...Array(n)].map(() => ({ life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  scene.add(m); return { m, items, i: 0 };
})();
function puff(x, y, z, vx, vz) { const d = dust.items[dust.i = (dust.i + 1) % dust.items.length]; d.life = 0; d.p.set(x, y + 0.4, z); d.v.set(vx + (Math.random() - .5), 0.7 + Math.random(), vz + (Math.random() - .5)); d.s = 0.4 + Math.random() * 0.5; }

// la caméra ne traverse ni arbres ni maisons : on cherche la première gêne entre la voiture et elle
function camBlocked(px, py, pz) {
  for (const c of circles) { if (!c.cr || py > c.ch + H(c.x, c.z)) continue; const dx = px - c.x, dz = pz - c.z; if (dx * dx + dz * dz < (c.cr + 0.6) ** 2) return true; }
  for (const b of boxes) {
    const dx = px - b.x, dz = pz - b.z, ca = Math.cos(b.a), sa = Math.sin(b.a), lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
    if (Math.abs(lx) < b.hw + 1 && Math.abs(lz) < b.hd + 1 && py < H(b.x, b.z) + b.ch) return true;
  }
  return false;
}
let camReach = 1;

/* ---------- Caméra : derrière la voiture, orientable au doigt ou à la souris ---------- */
const cam = { yaw: Math.atan2(Math.sin(START.h), -Math.cos(START.h)), pitch: 0.3, dist: 13.5, look: 0, lookPitch: 0, userT: 0 };
let drag = null;
const isUI = t => t && t.closest && t.closest('button, a, .touch');
const look0 = (x, y, id) => { drag = { x, y, id }; document.body.classList.add('grabbing'); };
const lookMove = (x, y) => { const dx = x - drag.x, dy = y - drag.y; drag.x = x; drag.y = y; cam.look += dx * 0.006; cam.lookPitch = Math.max(-0.25, Math.min(0.9, cam.lookPitch + dy * 0.004)); cam.userT = 2.5; };
const lookEnd = () => { drag = null; document.body.classList.remove('grabbing'); };
addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || isUI(e.target)) return; look0(e.clientX, e.clientY, 'm'); });
addEventListener('pointermove', e => { if (drag && drag.id === 'm') lookMove(e.clientX, e.clientY); });
addEventListener('pointerup', () => { if (drag && drag.id === 'm') lookEnd(); });
addEventListener('touchstart', e => { for (const t of e.changedTouches) if (!drag && !isUI(t.target)) look0(t.clientX, t.clientY, t.identifier); }, { passive: true });
addEventListener('touchmove', e => { if (!drag) return; for (const t of e.changedTouches) if (t.identifier === drag.id) { lookMove(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
const touchEnd = e => { if (!drag) return; for (const t of e.changedTouches) if (t.identifier === drag.id) lookEnd(); };
addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), follow = new THREE.Vector3(), look = new THREE.Vector3();
const intro = { t: 0, dur: reduce ? 0.01 : 4.2, done: false, started: false };
const INTRO_FROM = new THREE.Vector3(START.x + 120, 95, START.z - 140), INTRO_LOOK = new THREE.Vector3(START.x, 0, START.z);
camera.position.copy(INTRO_FROM); camera.lookAt(INTRO_LOOK);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- Rendu : lueur, étalonnage, vignettage, grain ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (!LITE) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.6, 0.82));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(.299,.587,.114));
      c = mix(c, c * vec3(.92,.98,1.08), smoothstep(.5, .0, l) * .5);
      c = mix(c, c * vec3(1.06,1.0,.92), smoothstep(.4, 1., l) * .5);
      c = mix(vec3(l), c, .92);
      float v = smoothstep(1.0, .3, length((vUv - .5) * vec2(1.1, 1.))); c *= mix(.7, 1., v);
      c += (h(vUv * 1000. + time) - .5) * .03;
      gl_FragColor = vec4(c, 1.); }`
});
composer.addPass(grade);

/* ---------- Interface ---------- */
const hint = $('hint'), speedo = $('speedo'), kmh = $('kmh'), touchUI = $('touch'), wipe = $('wipe');
let driving = false, signT = -1, welcomeK = 1;
function startDriving() {
  if (driving || !intro.done) return; driving = true;
  hint && hint.classList.add('gone');
  wipe.classList.add('on'); setTimeout(() => wipe.classList.remove('on'), 160);
}
function introFinished() { speedo.classList.add('show'); touchUI.classList.add('show'); hint && hint.classList.add('show'); signT = 0; }
(() => {
  const loader = $('loader'), count = $('count'), bar = $('bar'), t0 = performance.now(), dur = reduce ? 10 : 2200;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); count.textContent = String(Math.round(e * 100)).padStart(2, '0'); bar.style.width = e * 100 + '%';
    if (k < 1) requestAnimationFrame(step); else { loader.classList.add('open'); intro.started = true; setTimeout(() => loader.remove(), 1700); } };
  requestAnimationFrame(step);
})();

/* Lieux */
const ZONES = [
  { x: VILLAGE.x, z: VILLAGE.z, r: 42, k: 'Modèle à venir', t: 'Le Village' },
  { x: -60, z: -55, r: 42, k: 'Modèle à venir', t: 'La Forêt' },
  { x: LAKE.x, z: LAKE.z, r: LAKE.r + 22, k: 'Modèle à venir', t: 'Le Lac' },
  { x: HILL.x, z: HILL.z, r: 36, k: 'Modèle à venir', t: 'Le Moulin' }
];
const zoneEl = $('zone'), zoneK = $('zone-k'), zoneT = $('zone-t'); let curZone = null, zoneTimer = 0;
function updateZone() {
  if (!intro.done) return;
  const z = ZONES.find(z => Math.hypot(state.x - z.x, state.z - z.z) < z.r) || null;
  if (z === curZone) return; curZone = z; clearTimeout(zoneTimer);
  zoneEl.classList.remove('on'); zoneEl.classList.add('off');
  if (z) zoneTimer = setTimeout(() => { zoneK.textContent = z.k; zoneT.textContent = z.t; zoneEl.classList.remove('off'); void zoneEl.offsetWidth; zoneEl.classList.add('on'); }, 350);
}
const showErr = msg => { if (document.querySelector('.glerr')) return; const d = document.createElement('div'); d.className = 'glerr'; d.innerHTML = msg + '<br><button type="button">Recharger</button>'; d.querySelector('button').onclick = () => location.reload(); document.body.appendChild(d); };
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showErr('La 3D a été interrompue par l’appareil (mémoire).'); });
addEventListener('error', e => showErr('Erreur : ' + (e.message || 'inconnue')));

/* ---------- Boucle principale ---------- */
const clock = new THREE.Clock(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), Om = new THREE.Object3D();
function tick() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 1 / 30), t = clock.elapsedTime;
  if (intro.done && !driving && Object.values(keys).some(Boolean)) startDriving();

  // voiture
  const throttle = intro.done ? (keys.up ? 1 : 0) - (keys.down ? 1 : 0) : 0;
  if (intro.done) {
    if (throttle > 0) state.speed += ACC * dt * (state.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) state.speed -= (state.speed > 0 ? BRAKE : ACC * 0.8) * dt;
    if (keys.brake) state.speed *= Math.pow(0.04, dt);
    state.speed -= state.speed * DRAG * dt; if (!throttle && Math.abs(state.speed) < 0.3) state.speed = 0;
    state.speed = Math.max(REV, Math.min(MAX, state.speed));
    const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    state.steer += (steerIn * 0.55 - state.steer) * Math.min(1, dt * 6);
    const grip = Math.max(Math.min(1, Math.abs(state.speed) / 7), throttle ? 0.45 : 0);
    state.heading += state.steer * grip * (Math.sign(state.speed) || throttle || 1) * dt * 2.0 * (1 - Math.abs(state.speed) / MAX * 0.3);
    state.x += Math.cos(state.heading) * state.speed * dt; state.z -= Math.sin(state.heading) * state.speed * dt;
    collide();
    if (throttle) { stuckT += dt; if (Math.hypot(state.x - stuckP.x, state.z - stuckP.z) > 3) { stuckT = 0; stuckP.x = state.x; stuckP.z = state.z; } if (stuckT > 4) { resetCar(); stuckT = 0; } } else { stuckT = 0; stuckP.x = state.x; stuckP.z = state.z; }
  }
  // la voiture épouse le relief
  fwd.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
  const hC = H(state.x, state.z), hF = H(state.x + fwd.x * 2.6, state.z + fwd.z * 2.6), hB = H(state.x - fwd.x * 2.6, state.z - fwd.z * 2.6);
  const hL = H(state.x - fwd.z * 1.3, state.z + fwd.x * 1.3), hR = H(state.x + fwd.z * 1.3, state.z - fwd.x * 1.3);
  state.y += (Math.max(hC, (hF + hB) / 2) - state.y) * Math.min(1, dt * 12);
  car.position.set(state.x, state.y, state.z);
  car.rotation.set(0, state.heading, 0);
  const slopeP = Math.atan2(hF - hB, 5.2), slopeR = Math.atan2(hL - hR, 2.6);
  const targetRoll = -state.steer * Math.min(1, Math.abs(state.speed) / MAX) * 0.2 * Math.sign(state.speed || 1) + slopeR;
  state.roll += (targetRoll - state.roll) * Math.min(1, dt * 5);
  state.pitch += (throttle * 0.03 + slopeP - state.pitch) * Math.min(1, dt * 4);
  state.bounce += dt * (4 + Math.abs(state.speed) * 0.4);
  body.rotation.set(state.roll, 0, state.pitch);
  body.position.y = Math.sin(state.bounce) * 0.015 * (0.3 + Math.abs(state.speed) / MAX) + 0.02;
  state.wheelSpin -= state.speed * dt / (0.43 * 1.6);
  for (const w of wheels) { w.spin.rotation.z = state.wheelSpin; if (w.front) w.pivot.rotation.y = state.steer * 0.9; }

  // poussière
  if (intro.done && Math.abs(state.speed) > 6 && (keys.up || Math.abs(state.steer) > 0.3) && Math.random() < 0.5) for (const side of [-1, 1]) {
    tmp.set(-fwd.z, 0, fwd.x).multiplyScalar(side * 1.25); puff(state.x - fwd.x * 2.2 + tmp.x, state.y, state.z - fwd.z * 2.2 + tmp.z, -fwd.x * 2, -fwd.z * 2);
  }
  dust.items.forEach((d, i) => {
    if (d.life < 1) { d.life += dt * 1.1; d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(0.96); }
    const s = d.life < 1 ? d.s * (0.6 + d.life * 1.4) * (1 - d.life) : 0;
    Om.position.copy(d.p); Om.rotation.set(0, 0, 0); Om.scale.setScalar(s); Om.updateMatrix(); dust.m.setMatrixAt(i, Om.matrix);
  });
  dust.m.instanceMatrix.needsUpdate = true;

  // rondins et bottes de foin
  for (const c of props) {
    const dx = c.g.position.x - state.x, dz = c.g.position.z - state.z, d = Math.hypot(dx, dz) || 1e-3;
    if (d < c.r + 1.6 && Math.abs(state.speed) > 2 && c.still) {
      const k = Math.abs(state.speed) * 0.6 * c.k;
      c.v.set(dx / d * k + fwd.x * state.speed * 0.4 * c.k, (3.5 + Math.abs(state.speed) * 0.2) * c.k, dz / d * k + fwd.z * state.speed * 0.4 * c.k);
      c.w.set((Math.random() - .5) * 8, (Math.random() - .5) * 5, (Math.random() - .5) * 8); c.still = false; bump();
    }
    if (!c.still) {
      c.v.y -= 25 * dt; c.g.position.addScaledVector(c.v, dt);
      c.g.rotation.x += c.w.x * dt; c.g.rotation.y += c.w.y * dt; c.g.rotation.z += c.w.z * dt;
      const g0 = H(c.g.position.x, c.g.position.z) + 0.45;
      if (c.g.position.y < g0) { c.g.position.y = g0; c.v.y *= -0.3; c.v.x *= 0.65; c.v.z *= 0.65; c.w.multiplyScalar(0.6); if (Math.abs(c.v.y) < 0.6 && Math.hypot(c.v.x, c.v.z) < 0.3) c.still = true; }
    }
  }

  // moulin, eau, lucioles
  millHub.rotation.z += dt * 0.5;
  lakeWater.position.y = -1.4 + Math.sin(t * 0.6) * 0.05;
  fireflies.seeds.forEach((f, i) => { fireflies.pos[i * 3] = f.x + Math.sin(t * 0.4 + f.p) * 1.5; fireflies.pos[i * 3 + 1] = f.y + Math.sin(t * 0.9 + f.p * 2) * 0.6; fireflies.pos[i * 3 + 2] = f.z + Math.cos(t * 0.35 + f.p) * 1.5; });
  fireflies.g.attributes.position.needsUpdate = true;

  // monolithe : s'élève du sol à l'arrivée
  if (signT >= 0 && signT < 1) { signT = Math.min(1, signT + dt / 1.6); const k = 1 - Math.pow(1 - signT, 4); monolith.scale.setScalar(Math.max(0.001, k)); monolith.position.y = H(MONO.x, MONO.z) - 0.2 - (1 - k) * 5; }

  // caméra : derrière la voiture ; le regard revient doucement quand on lâche
  cam.userT = Math.max(0, cam.userT - dt);
  if (!drag && cam.userT === 0) { cam.look *= Math.pow(0.25, dt); cam.lookPitch *= Math.pow(0.35, dt); }
  const behind = Math.atan2(Math.sin(state.heading), -Math.cos(state.heading));
  let dy = behind - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); cam.yaw += dy * Math.min(1, dt * (Math.abs(state.speed) > 2 ? 2.2 : 0.8));
  const yaw = cam.yaw + cam.look, pitch = Math.max(0.06, cam.pitch + cam.lookPitch);
  const speedK = Math.abs(state.speed) / MAX, portrait = camera.aspect < 0.8 ? 1.25 : 1, dist = cam.dist * portrait * (1 + speedK * 0.18);
  follow.set(Math.cos(pitch) * Math.cos(yaw) * dist, Math.sin(pitch) * dist + 1.2, Math.cos(pitch) * Math.sin(yaw) * dist).add(car.position);
  { // anti-collision de la caméra
    const ox = car.position.x, oy = car.position.y + 2, oz = car.position.z; let reach = 1;
    for (let k = 3; k <= 10; k++) { const f = k / 10; if (camBlocked(lerp(ox, follow.x, f), lerp(oy, follow.y, f), lerp(oz, follow.z, f))) { reach = Math.max(0.28, f - 0.12); break; } }
    camReach += (reach - camReach) * Math.min(1, dt * (reach < camReach ? 10 : 2));
    follow.set(lerp(ox, follow.x, camReach), lerp(oy, follow.y, camReach), lerp(oz, follow.z, camReach));
  }
  follow.y = Math.max(follow.y, H(follow.x, follow.z) + 1.5);
  look.set(car.position.x + fwd.x * 3, car.position.y + 2.2, car.position.z + fwd.z * 3);
  welcomeK += ((driving ? 0 : 1) - welcomeK) * Math.min(1, dt * 1.2);
  look.lerp(MONO_POS, welcomeK * (camera.aspect < 0.8 ? 0.42 : 0.3));
  if (intro.started && !intro.done) {
    intro.t += Math.min(rawDt, 0.1) / intro.dur; const e = ease(Math.min(1, intro.t));
    camPos.lerpVectors(INTRO_FROM, follow, e); camLook.lerpVectors(INTRO_LOOK, look, e);
    if (intro.t >= 1) { intro.done = true; introFinished(); }
  } else if (snapCam) { camPos.copy(follow); camLook.copy(look); snapCam = false; }
  else if (intro.done) { camPos.lerp(follow, Math.min(1, dt * 4)); camLook.lerp(look, Math.min(1, dt * 6)); }
  else { camPos.copy(INTRO_FROM); camLook.copy(INTRO_LOOK); }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * 0.4; camera.position.y += (Math.random() - .5) * shake * 0.4; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(camLook);
  camera.fov += ((42 + speedK * 8) - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
  skyMesh.position.copy(camera.position);
  sun.position.copy(car.position).addScaledVector(SUN_DIR, 120); sun.target.position.copy(car.position);

  updateZone();
  kmh.textContent = Math.round(Math.abs(state.speed) * 3.4);
  grade.uniforms.time.value = (grade.uniforms.time.value + 1) % 1000;
  if (LITE) renderer.render(scene, camera); else composer.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
window.__atelier = { state, resetCar, cam, camPos, camera, dbg: () => ({ reach: camReach, car: car.position.toArray().map(v => +v.toFixed(1)), cam: camera.position.toArray().map(v => +v.toFixed(1)), look: camLook.toArray().map(v => +v.toFixed(1)) }), placeOn: (t, c = 'ring') => { const cv = c === 'ring' ? ring : cross, p = cv.getPointAt(t), tg = cv.getTangentAt(t); Object.assign(state, { x: p.x, z: p.z, heading: Math.atan2(-tg.z, tg.x), speed: 0 }); cam.yaw = Math.atan2(Math.sin(state.heading), -Math.cos(state.heading)); state.y = H(p.x, p.z); snapCam = true; driving = true; welcomeK = 0; }, ring };
