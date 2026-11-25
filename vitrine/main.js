import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =========================================================
   Atelier Folio — un monde nocturne et vallonné, visité en 2CV
   ========================================================= */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const LITE = isTouch || innerWidth < 760;
const $ = id => document.getElementById(id);

/* ---------- Rendu ---------- */
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, LITE ? 1 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = !LITE;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOG = new THREE.Color('#5d57b4'); // ciel de crépuscule, plus clair
scene.background = FOG;
scene.fog = new THREE.Fog(FOG, 70, 210);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.5, 400);

/* Lumières de nuit : lune froide, ambiance violette, lanternes chaudes */
scene.add(new THREE.HemisphereLight('#9993ff', '#2e2450', 1.6));
const moon = new THREE.DirectionalLight('#c4c0ff', 1.7);
moon.castShadow = true; moon.shadow.mapSize.set(2048, 2048);
Object.assign(moon.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 });
moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.05;
const MOON_DIR = new THREE.Vector3(-0.4, 1, 0.3).normalize();
scene.add(moon, moon.target);

/* ---------- Outils ---------- */
let seed = 1234; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = LITE ? 2 : renderer.capabilities.getMaxAnisotropy(); return t;
}
const std = o => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...o });
const flat = o => std({ flatShading: true, ...o });
const shadowy = (m, cast = true, receive = true) => { m.castShadow = cast && !LITE; m.receiveShadow = receive && !LITE; return m; };
const O3 = new THREE.Object3D();
const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { O3.position.set(x, y, z); O3.rotation.set(rx, ry, rz); O3.scale.set(sx, sy, sz); O3.updateMatrix(); return O3.matrix.clone(); };
class Pool {
  constructor(geo, material, { cast = true, receive = true } = {}) { Object.assign(this, { geo, mat: material, items: [], cast, receive }); }
  add(m, c) { this.items.push([m, c]); }
  build() {
    if (!this.items.length) return null;
    const m = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    this.items.forEach(([mx, c], i) => { m.setMatrixAt(i, mx); if (c) m.setColorAt(i, c); });
    if (m.instanceColor) this.items.forEach(([, c], i) => { if (!c) m.setColorAt(i, new THREE.Color('#fff')); });
    shadowy(m, this.cast, this.receive); scene.add(m); return m;
  }
}
const C = h => new THREE.Color(h);

/* ---------- Textures ---------- */
const TEX = {
  cobble: canvasTex(256, (g, s) => { g.fillStyle = '#5d5a99'; g.fillRect(0, 0, s, s); const n = 8, w = s / n;
    for (let r = 0; r < n; r++) for (let c = -1; c <= n; c++) { const x = c * w + (r % 2) * w / 2, y = r * w; const v = 150 + Math.random() * 40; g.fillStyle = `rgb(${v - 22},${v - 24},${v + 10})`;
      g.beginPath(); g.roundRect(x + 3, y + 3, w - 6, w - 6, 8); g.fill(); } }),
  plaster: canvasTex(256, (g, s) => { g.fillStyle = '#fff'; g.fillRect(0, 0, s, s); for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); } }, 2, 2),
  wood: canvasTex(128, (g, s) => { g.fillStyle = '#c99a6a'; g.fillRect(0, 0, s, s); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(60,35,15,.25)'; g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.bezierCurveTo(s * .3, y + 3, s * .6, y - 3, s, y + 1); g.stroke(); } g.strokeStyle = 'rgba(50,25,10,.6)'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8); g.beginPath(); g.moveTo(4, 4); g.lineTo(s - 4, s - 4); g.stroke(); })
};
TEX.ground = canvasTex(256, (g, s) => { g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) { const v = 170 + Math.random() * 85; g.fillStyle = `rgb(${v},${v},${v})`; const r = 1 + Math.random() * 3; g.beginPath(); g.arc(Math.random() * s, Math.random() * s, r, 0, 7); g.fill(); }
  for (let i = 0; i < 500; i++) { g.strokeStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.3})`; const x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 4, y - 4 - Math.random() * 5); g.stroke(); } }, 70, 70);
TEX.bricks = canvasTex(256, (g, s) => { g.fillStyle = '#4c4889'; g.fillRect(0, 0, s, s); const rows = 6, h = s / rows;
  for (let r = 0; r < rows; r++) for (let c = -1; c < 5; c++) { const w = s / 4, x = c * w + (r % 2) * w / 2; const v = 0.85 + Math.random() * 0.3; g.fillStyle = `rgb(${130 * v | 0},${126 * v | 0},${200 * v | 0})`; g.beginPath(); g.roundRect(x + 3, r * h + 3, w - 6, h - 6, 6); g.fill(); } });
TEX.planks = canvasTex(256, (g, s) => { g.fillStyle = '#7a5a3c'; g.fillRect(0, 0, s, s); for (let i = 0; i < 6; i++) { const v = 0.8 + Math.random() * 0.35; g.fillStyle = `rgb(${190 * v | 0},${140 * v | 0},${95 * v | 0})`; g.fillRect(4, i * s / 6 + 3, s - 8, s / 6 - 6); }
  for (let i = 0; i < 60; i++) { g.strokeStyle = 'rgba(60,35,15,.25)'; g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.lineTo(s, y + (Math.random() - .5) * 6); g.stroke(); }
  g.fillStyle = '#3a2a1d'; for (let i = 0; i < 6; i++) for (const x of [14, s - 14]) { g.beginPath(); g.arc(x, i * s / 6 + s / 12, 3, 0, 7); g.fill(); } });
TEX.barrel = canvasTex(128, (g, s) => { for (let i = 0; i < 8; i++) { const v = 0.8 + Math.random() * 0.3; g.fillStyle = `rgb(${170 * v | 0},${115 * v | 0},${70 * v | 0})`; g.fillRect(i * s / 8, 0, s / 8 - 2, s); } g.fillStyle = '#2b2546'; for (const y of [0.12, 0.85]) g.fillRect(0, y * s, s, s * 0.07); });
const M = {
  terrain: std({ vertexColors: true, roughness: 0.95, map: TEX.ground }),
  path: std({ color: '#ffffff', map: TEX.cobble, roughness: 0.9 }),
  bark: std({ color: '#c9c6f2', roughness: 0.8 }),
  barkDark: flat({ color: '#3b2f5c' }),
  leaf: std({ color: '#ffffff', roughness: 0.9 }),
  rock: flat({ color: '#6e6bc0', roughness: 0.9 }),
  wood: std({ color: '#ffffff', map: TEX.wood }),
  plank: std({ color: '#8b7aa8', roughness: 0.8 }),
  metal: std({ color: '#2a2548', roughness: 0.5, metalness: 0.4 }),
  lamp: new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ff9a2e', emissiveIntensity: 3 }),
  window: new THREE.MeshStandardMaterial({ color: '#ffcf8a', emissive: '#ff9f40', emissiveIntensity: 2 }),
  windowDark: std({ color: '#1d1a3a', roughness: 0.3 }),
  walls: std({ map: TEX.plaster, vertexColors: true }),
  roof: flat({ vertexColors: true, roughness: 0.7 }),
  trim: std({ color: '#262046' }),
  water: new THREE.MeshPhysicalMaterial({ color: '#241f5c', roughness: 0.05, metalness: 0.2, clearcoat: 1 }),
  leafBit: std({ color: '#6e4a63', roughness: 1, side: THREE.DoubleSide }), // feuilles mortes : prune sourd, plus des « trous » noirs
  letters: std({ color: '#8d8bff', roughness: 0.45, metalness: 0.05, emissive: '#3a33c9', emissiveIntensity: 0.35 }),
  stone: flat({ color: '#8f8bd0' }),
  sail: std({ color: '#d8d4ff', side: THREE.DoubleSide }),
  hay: flat({ color: '#b88f5a' })
};

/* ---------- Relief vallonné et chemins pavés ---------- */
const V = (x, z) => new THREE.Vector3(x, 0, z);
const SIGN = { x: -23.8, z: -7.7 }; // grand panneau d'accueil : devant à gauche du départ, un peu de travers
const POST = { x: 6.5, z: -17.9 };  // panneau directionnel en planches peintes : devant à droite
const PLAZA = { x: 0, z: 0, r: 15 }, VILLAGE = { x: -72, z: 54 }, LAKE = { x: 68, z: -62, r: 24 }, HILL = { x: 70, z: 84 }, FOREST = { x: -60, z: -62 };
const paths = [
  [V(0, 0), V(-20, 14), V(-46, 30), V(-72, 52)],
  [V(0, 0), V(16, 26), V(38, 56), V(62, 76)],
  [V(0, 0), V(24, -12), V(44, -28), V(58, -36)],
  [V(0, 0), V(-12, -24), V(-34, -44), V(-58, -60)]
].map(p => new THREE.CatmullRomCurve3(p, false, 'centripetal'));
const PATH_W = 7;
const samples = [];
for (const c of paths) for (let i = 0; i <= 90; i++) { const p = c.getPointAt(i / 90); samples.push(p.x, p.z); }
const NS = samples.length / 2;
function nearest(x, z) {
  let best = 1e9; for (let i = 0; i < NS; i++) { const dx = samples[i * 2] - x, dz = samples[i * 2 + 1] - z, d = dx * dx + dz * dz; if (d < best) best = d; }
  return Math.sqrt(best);
}
function hills(x, z) {
  let h = 4.2 * Math.sin(x * 0.028 + 0.7) * Math.cos(z * 0.023 - 0.4) + 2.6 * Math.sin((x + z) * 0.036) + 1.1 * Math.sin(x * 0.09) * Math.cos(z * 0.08);
  h += 12 * Math.exp(-((x - HILL.x) ** 2 + (z - HILL.z) ** 2) / (2 * 20 * 20));
  h += Math.pow(Math.max(0, Math.hypot(x, z) - 120), 1.3) * 0.25;
  h -= 6 * smooth(LAKE.r + 8, LAKE.r - 4, Math.hypot(x - LAKE.x, z - LAKE.z));
  return h;
}
const PLAZA_H = hills(0, 0);
function H(x, z) {
  let h = hills(x, z);
  h = lerp(PLAZA_H, h, smooth(PLAZA.r, PLAZA.r + 12, Math.hypot(x - PLAZA.x, z - PLAZA.z))); // place à plat
  const d = nearest(x, z);
  return h - smooth(PATH_W / 2 + 2, PATH_W / 2 - 1, d) * 0.08;
}
// relief
const GROUND = { grass: C('#3e3f8c'), dark: C('#2a2a63'), path: C('#5a579e'), sand: C('#6d68a8'), hill: C('#4a4c9e') };
{
  const SIZE = 300, SEG = LITE ? 130 : 200;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG).rotateX(-Math.PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), t = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i); pos.setY(i, H(x, z));
    const forest = smooth(55, 10, Math.hypot(x - FOREST.x, z - FOREST.z)) + smooth(105, 130, Math.hypot(x, z));
    t.copy(GROUND.grass).lerp(GROUND.dark, Math.min(1, forest) * 0.8);
    t.lerp(GROUND.sand, smooth(LAKE.r + 9, LAKE.r + 2, Math.hypot(x - LAKE.x, z - LAKE.z)));
    t.lerp(GROUND.path, smooth(PATH_W / 2 + 2.5, PATH_W / 2, nearest(x, z)) * 0.7);
    const v = 0.9 + Math.random() * 0.15; col[i * 3] = t.r * v; col[i * 3 + 1] = t.g * v; col[i * 3 + 2] = t.b * v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  scene.add(shadowy(new THREE.Mesh(g, M.terrain), false, true));
}
// chemins pavés : rubans qui épousent le relief
function ribbon(curve, n, width, mat) {
  const v = [], uv = [], idx = [], len = curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t), nx = -tg.z, nz = tg.x;
    for (const s of [-1, 1]) { const x = p.x + nx * s * width / 2, z = p.z + nz * s * width / 2; v.push(x, H(x, z) + 0.12, z); uv.push(s > 0 ? width / 5 : 0, t * len / 5); }
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return shadowy(new THREE.Mesh(g, mat), false, true);
}
for (const c of paths) scene.add(ribbon(c, 140, PATH_W, M.path));
{ const plaza = shadowy(new THREE.Mesh(new THREE.CircleGeometry(PLAZA.r, 64).rotateX(-Math.PI / 2), M.path), false, true); plaza.position.set(PLAZA.x, PLAZA_H + 0.1, PLAZA.z); const t = TEX.cobble.clone(); t.needsUpdate = true; t.repeat.set(PLAZA.r * 2 / 5, PLAZA.r * 2 / 5); plaza.material = M.path.clone(); plaza.material.map = t; scene.add(plaza); }

/* ---------- Collisions ---------- */
const circles = [], boxes = [];
const free = (x, z, m = 0) => nearest(x, z) > PATH_W / 2 + m && Math.hypot(x - PLAZA.x, z - PLAZA.z) > PLAZA.r + m && Math.hypot(x - LAKE.x, z - LAKE.z) > LAKE.r + 4 + m && Math.hypot(x - VILLAGE.x, z - VILLAGE.z) > 26 + m && Math.hypot(x - HILL.x, z - HILL.z) > 10 + m && Math.hypot(x - SIGN.x, z - SIGN.z) > 13 + m && Math.hypot(x - POST.x, z - POST.z) > 4 + m && Math.hypot(x, z) < 140;

/* ---------- Végétation : arbres touffus, herbe qui ondule, rochers, feuilles ---------- */
const P = {
  trunk: new Pool(new THREE.CylinderGeometry(0.2, 0.32, 1, 7), M.bark),
  branch: new Pool(new THREE.CylinderGeometry(0.08, 0.12, 1, 5), M.bark),
  puff: new Pool(new THREE.IcosahedronGeometry(1, 1), M.leaf),
  pine: new Pool(new THREE.ConeGeometry(1, 1, 7), M.leaf),
  pineTrunk: new Pool(new THREE.CylinderGeometry(0.2, 0.35, 1, 6), M.barkDark),
  rock: new Pool(new THREE.DodecahedronGeometry(1, 0), M.rock),
  bit: new Pool(new THREE.CircleGeometry(0.2, 5).scale(1.6, 0.8, 1).rotateX(-Math.PI / 2), M.leafBit, { cast: false }),
  post: new Pool(new THREE.CylinderGeometry(0.1, 0.13, 1, 8), M.metal),
  lampHead: new Pool(new RoundedBoxGeometry(0.55, 0.75, 0.55, 2, 0.06), M.lamp, { cast: false }),
  lampCap: new Pool(new THREE.ConeGeometry(0.5, 0.4, 4).rotateY(Math.PI / 4), M.metal),
  fence: new Pool(new RoundedBoxGeometry(1, 1, 1, 2, 0.05), M.plank),
  window: new Pool(new RoundedBoxGeometry(1, 1, 0.12, 2, 0.04), M.window, { cast: false }),
  windowDark: new Pool(new RoundedBoxGeometry(1, 1, 0.12, 2, 0.04), M.windowDark, { cast: false }),
  frame: new Pool(new THREE.BoxGeometry(1, 1, 0.1), M.trim),
  chimney: new Pool(new RoundedBoxGeometry(1, 1, 1, 2, 0.08), M.stone),
  hay: new Pool(new THREE.CylinderGeometry(1, 1, 1, 14).rotateZ(Math.PI / 2), M.hay)
};
const LEAVES = ['#3d3f96', '#4b4fb3', '#33357e', '#5a55c4', '#43418f'].map(C);
const PINES = ['#2c2f6e', '#363a82', '#252862'].map(C);
function fluffyTree(x, z, s) {
  const y = H(x, z), c = pick(LEAVES);
  P.trunk.add(mtx(x, y + 2 * s, z, 0, 0, 0, s, 4 * s, s));
  P.branch.add(mtx(x + 0.5 * s, y + 3.2 * s, z, 0, 0, -0.7, s, 1.6 * s, s));
  for (let k = 0; k < 6; k++) { const a = rnd() * 6.28, r = rnd() * 1.6 * s; P.puff.add(mtx(x + Math.cos(a) * r, y + (4.6 + rnd() * 2) * s, z + Math.sin(a) * r, rnd(), rnd(), 0, (1.4 + rnd() * 0.8) * s, (1.2 + rnd() * 0.6) * s, (1.4 + rnd() * 0.8) * s), c.clone().multiplyScalar(0.85 + rnd() * 0.3)); }
  circles.push({ x, z, r: 0.6 * s, cr: 2.6 * s, ch: 7 * s });
}
function pine(x, z, s) {
  const y = H(x, z), c = pick(PINES);
  P.pineTrunk.add(mtx(x, y + 1 * s, z, 0, 0, 0, s, 2 * s, s));
  for (let k = 0; k < 3; k++) P.pine.add(mtx(x, y + (2.2 + k * 2) * s, z, 0, rnd() * 6, 0, (2.6 - k * 0.6) * s, (3.6 - k * 0.5) * s, (2.6 - k * 0.6) * s), c);
  circles.push({ x, z, r: 0.7 * s, cr: 2.4 * s, ch: 8 * s });
}
function rock(x, z, s) { P.rock.add(mtx(x, H(x, z) + 0.3 * s, z, rnd() * 3, rnd() * 6, rnd() * 3, s * (1 + rnd() * 0.5), s * (0.6 + rnd() * 0.4), s * (1 + rnd() * 0.5)), C('#6e6bc0').multiplyScalar(0.8 + rnd() * 0.4)); circles.push({ x, z, r: s }); }
{
  const N = LITE ? 190 : 330; let placed = 0, tries = 0;
  while (placed < N && tries++ < N * 20) {
    const x = (rnd() * 2 - 1) * 140, z = (rnd() * 2 - 1) * 140;
    if (!free(x, z, 6)) continue;
    const dens = Math.min(1, smooth(60, 5, Math.hypot(x - FOREST.x, z - FOREST.z)) * 0.55 + smooth(95, 125, Math.hypot(x, z)) + 0.1);
    if (rnd() > dens) continue;
    const s = 0.9 + rnd() * 0.7; (rnd() < 0.6 ? fluffyTree : pine)(x, z, s); placed++;
  }
  for (let k = 0; k < 90; k++) { const x = (rnd() * 2 - 1) * 130, z = (rnd() * 2 - 1) * 130; if (free(x, z, 1)) rock(x, z, 0.5 + rnd() * 1.2); }
  // feuilles mortes sur les chemins et la place
  for (let k = 0; k < (LITE ? 250 : 600); k++) {
    const c = pick(paths), p = c.getPointAt(rnd()), a = rnd() * 6.28, r = rnd() * (PATH_W / 2 + 1);
    const x = k % 4 === 0 ? PLAZA.x + Math.cos(a) * rnd() * PLAZA.r : p.x + Math.cos(a) * r, z = k % 4 === 0 ? PLAZA.z + Math.sin(a) * rnd() * PLAZA.r : p.z + Math.sin(a) * r;
    P.bit.add(mtx(x, H(x, z) + 0.13, z, (rnd() - .5) * 0.12, rnd() * 6, (rnd() - .5) * 0.12, 0.6 + rnd(), 1, 0.6 + rnd()));
  }
}
// herbe : brins instanciés qui ondulent au vent
const grassUniforms = { uTime: { value: 0 } };
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.32, 0, 0, 0.32, 0, 0, 0, 0.55, 0], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([0.2, 0.2, 0.45, 0.2, 0.2, 0.45, 0.36, 0.37, 0.72], 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = grassUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
      float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
      #else
      float ph = 0.;
      #endif
      float w = sin(uTime * 1.6 + ph) * 0.5 + sin(uTime * 2.7 + ph * 1.7) * 0.25;
      transformed.x += w * 0.12 * position.y; transformed.z += w * 0.06 * position.y;`);
  };
  const N = LITE ? 9000 : 30000, grass = new THREE.InstancedMesh(g, mat, N);
  let n = 0, tries = 0;
  while (n < N && tries++ < N * 4) {
    const cx = (rnd() * 2 - 1) * 125, cz = (rnd() * 2 - 1) * 125;
    if (!free(cx, cz, 0.5)) continue;
    for (let k = 0; k < 40 && n < N; k++) {
      const x = cx + (rnd() - .5) * 7, z = cz + (rnd() - .5) * 7;
      if (nearest(x, z) < PATH_W / 2 + 0.3 || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.5) continue;
      grass.setMatrixAt(n++, mtx(x, H(x, z) - 0.05, z, 0, rnd() * 6, 0, 0.8 + rnd() * 0.6, 0.7 + rnd() * 0.6, 1));
    }
  }
  grass.count = n; grass.receiveShadow = !LITE; scene.add(grass);
}

/* ---------- Lanternes ---------- */
const lampLights = [];
function lantern(x, z, light = false) {
  if (nearest(x, z) < PATH_W / 2 + 1.2 || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 0.8) return; // pas sur la route
  if (Math.hypot(x - SIGN.x, z - SIGN.z) < 20 || Math.hypot(x - POST.x, z - POST.z) < 5) return; // rien devant les panneaux
  const y = H(x, z);
  P.post.add(mtx(x, y + 1.8, z, 0, 0, 0, 1, 3.6, 1)); P.post.add(mtx(x, y + 0.2, z, 0, 0, 0, 2.6, 0.4, 2.6));
  P.lampHead.add(mtx(x, y + 4, z)); P.lampCap.add(mtx(x, y + 4.55, z));
  circles.push({ x, z, r: 0.35 });
  if (light && !LITE) { const l = new THREE.PointLight('#ff9b45', 25, 16, 1.6); l.position.set(x, y + 3.8, z); scene.add(l); lampLights.push(l); }
}
for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; lantern(PLAZA.x + Math.cos(a) * (PLAZA.r + 1.8), PLAZA.z + Math.sin(a) * (PLAZA.r + 1.8), k % 2 === 0); }
for (const c of paths) for (let i = 1; i < 6; i++) { const t = i / 6, p = c.getPointAt(t), tg = c.getTangentAt(t), s = i % 2 ? 1 : -1; lantern(p.x - tg.z * s * (PATH_W / 2 + 2), p.z + tg.x * s * (PATH_W / 2 + 2)); }
// barrières en bois le long des chemins près de la place
for (const c of paths) for (let i = 0; i < 10; i++) {
  const t = 0.2 + i * 0.018, p = c.getPointAt(t), tg = c.getTangentAt(t), q = c.getPointAt(t + 0.018);
  for (const s of [-1, 1]) {
    const x = p.x - tg.z * s * (PATH_W / 2 + 2.2), z = p.z + tg.x * s * (PATH_W / 2 + 2.2), y = H(x, z);
    if (nearest(x, z) < PATH_W / 2 + 1.5 || Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 1) continue;
    P.fence.add(mtx(x, y + 0.6, z, 0, 0, 0, 0.25, 1.2, 0.25));
    if (i < 9) { const x2 = q.x - tg.z * s * (PATH_W / 2 + 2.2), z2 = q.z + tg.x * s * (PATH_W / 2 + 2.2), mx = (x + x2) / 2, mz = (z + z2) / 2, len = Math.hypot(x2 - x, z2 - z); P.fence.add(mtx(mx, H(mx, mz) + 0.9, mz, 0, -Math.atan2(z2 - z, x2 - x), 0, len, 0.18, 0.12)); boxes.push({ x: mx, z: mz, a: -Math.atan2(z2 - z, x2 - x), hw: len / 2 + 0.15, hd: 0.2, ch: 1.2 }); } // la barrière arrête la voiture
  }
}

/* ---------- Village ---------- */
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
const faceTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
function house(x, z, face, w, d, h) {
  const y = H(x, z) - 0.5, base = new THREE.Matrix4().makeRotationY(face).setPosition(x, y, z);
  const at = (lx, ly, lz, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().multiplyMatrices(base, mtx(lx, ly, lz, 0, ry, 0, sx, sy, sz));
  wallParts.push({ geo: new RoundedBoxGeometry(w, h, d, 3, 0.3), matrix: at(0, h / 2, 0), color: pick(['#7471c2', '#6966b5', '#807dcc', '#5f5ca8'].map(C)) });
  const rh = h * 0.5, s = new THREE.Shape(); s.moveTo(-w / 2 - 0.8, 0); s.lineTo(w / 2 + 0.8, 0); s.lineTo(0, rh); s.closePath();
  roofParts.push({ geo: new THREE.ExtrudeGeometry(s, { depth: d + 1.4, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 1 }), matrix: at(0, h, -d / 2 - 0.7), color: pick(['#2d2a5e', '#36326b', '#25224f'].map(C)) });
  P.chimney.add(at(w * 0.25, h + rh * 0.7, 0, 1, rh + 1.2, 1));
  const cols = Math.max(1, Math.floor(w / 3)), floors = Math.max(1, Math.floor(h / 3.5));
  for (const side of [1, -1]) for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const lx = (-w / 2 + (c + 0.5) * w / cols) * side, ly = 2.2 + f * 3.5, lz = side * (d / 2 + 0.02), ry = side > 0 ? 0 : Math.PI;
    P.frame.add(at(lx, ly, lz, 1.6, 2.2, 1, ry)); (rnd() < 0.6 ? P.window : P.windowDark).add(at(lx, ly, lz + side * 0.05, 1.3, 1.9, 1, ry));
  }
  boxes.push({ x, z, a: face, hw: w / 2 + 0.3, hd: d / 2 + 0.3, ch: h * 1.5 });
}
{
  const spots = [[-14, -6], [-2, 12], [12, -2], [-22, 10], [8, 16], [-10, -18], [18, 10], [-26, -4]].slice(0, LITE ? 6 : 8);
  for (const [dx, dz] of spots) { const x = VILLAGE.x + dx, z = VILLAGE.z + dz; house(x, z, faceTo(x, z, VILLAGE.x, VILLAGE.z), 7 + rnd() * 3, 6 + rnd() * 2, 6 + rnd() * 3); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28, x = VILLAGE.x + Math.cos(a) * 6, z = VILLAGE.z + Math.sin(a) * 6; lantern(x, z, k % 3 === 0); }
}
scene.add(shadowy(new THREE.Mesh(merge(wallParts), M.walls)));
scene.add(shadowy(new THREE.Mesh(merge(roofParts), M.roof)));

/* ---------- Lac, moulin ---------- */
// l'eau suit le relief : partout où la rive est plus basse que l'eau, la surface passe sous le sol (plus de disque qui flotte)
const lake = (() => {
  let level = hills(LAKE.x, LAKE.z) + 3.2; // niveau voulu, mais jamais plus haut que la rive (sinon l'eau déborde en « mur »)
  for (let k = 0; k < 96; k++) { const a = k / 96 * Math.PI * 2; level = Math.min(level, H(LAKE.x + Math.cos(a) * (LAKE.r + 3), LAKE.z + Math.sin(a) * (LAKE.r + 3)) - 0.25); }
  const R = LAKE.r + 10, g = new THREE.PlaneGeometry(R * 2, R * 2, 72, 72).rotateX(-Math.PI / 2), pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) + LAKE.x, z = pos.getZ(i) + LAKE.z, h = H(x, z), inBasin = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 3;
    pos.setY(i, inBasin && h < level ? level : Math.min(level, h - 0.12)); } // hors du bassin : sous le sol
  g.computeVertexNormals(); for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, 0, 1, 0); // reflets d'un plan d'eau calme
  const m = new THREE.Mesh(g, M.water); m.position.set(LAKE.x, 0, LAKE.z); m.receiveShadow = !LITE; scene.add(m); return m;
})();
circles.push({ x: LAKE.x, z: LAKE.z, r: LAKE.r });
const millHub = new THREE.Group();
{
  const y = H(HILL.x, HILL.z);
  const tower = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.4, 11, 12), M.stone)); tower.position.set(HILL.x, y + 5.5, HILL.z); scene.add(tower);
  const cap = shadowy(new THREE.Mesh(new THREE.ConeGeometry(3.2, 3.2, 12), flat({ color: '#2d2a5e' }))); cap.position.set(HILL.x, y + 12.6, HILL.z); scene.add(cap);
  const mill = new THREE.Group(); mill.position.set(HILL.x, y + 10.5, HILL.z); mill.rotation.y = faceTo(HILL.x, HILL.z, 0, 0); scene.add(mill);
  millHub.position.z = 3; mill.add(millHub);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2; millHub.add(arm);
    const spar = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, 10, 0.3), M.trim)); spar.position.y = 5; arm.add(spar);
    const sail = shadowy(new THREE.Mesh(new THREE.PlaneGeometry(2, 7.5), M.sail)); sail.position.set(1.2, 5.6, 0.1); arm.add(sail);
  }
  circles.push({ x: HILL.x, z: HILL.z, r: 4 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(1, 1.4, 0.2), M.window); win.position.set(HILL.x, y + 4, HILL.z); win.rotation.y = mill.rotation.y; win.translateZ(2.9); scene.add(win);
}

/* ---------- Obstacles : tremplins, murets de pierre ---------- */
const ramps = [];
function ramp(x, z, ang, L = 9, W = 5, h = 1.8) {
  const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(L, 0); sh.lineTo(L, h); sh.lineTo(L - 0.6, h + 0.05); sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: W, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 }).translate(0, 0, -W / 2);
  const uv = geo.attributes.uv, ps = geo.attributes.position; for (let i = 0; i < ps.count; i++) uv.setXY(i, ps.getZ(i) / 5 + 0.5, ps.getX(i) / 3);
  const m = shadowy(new THREE.Mesh(geo, std({ map: TEX.planks, roughness: 0.8 }))); const y = H(x, z);
  m.position.set(x, y - 0.05, z); m.rotation.y = ang; scene.add(m);
  const fx = Math.cos(ang), fz = -Math.sin(ang); // sens de montée
  ramps.push({ x, z, fx, fz, L, W, h, y });
  // le dos du tremplin est un mur : on ne peut pas monter par l'arrière
  const bx = x + fx * L, bz = z + fz * L; boxes.push({ x: bx, z: bz, a: ang + Math.PI / 2, hw: W / 2, hd: 0.4, ch: h + 1, below: y + h * 0.5 }); // mur arrière, seulement pour qui arrive par le bas
}
function rampHeight(x, z) {
  let best = 0;
  for (const r of ramps) { const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, w = -dx * r.fz + dz * r.fx; if (u > 0 && u < r.L && Math.abs(w) < r.W / 2) best = Math.max(best, r.y - H(x, z) + u / r.L * r.h); }
  return best;
}
// une place est-elle déjà prise (tremplin, arbre, rocher, maison, muret) ?
function occupied(x, z, m) {
  for (const r of ramps) { const dx = x - r.x, dz = z - r.z, u = dx * r.fx + dz * r.fz, w = -dx * r.fz + dz * r.fx; if (u > -m && u < r.L + m && Math.abs(w) < r.W / 2 + m) return true; }
  for (const c of circles) if (Math.hypot(x - c.x, z - c.z) < c.r + m) return true;
  for (const b of boxes) { const dx = x - b.x, dz = z - b.z, ca = Math.cos(b.a), sa = Math.sin(b.a); if (Math.abs(dx * ca - dz * sa) < b.hw + m && Math.abs(dx * sa + dz * ca) < b.hd + m) return true; }
  return false;
}
const groundAt = (x, z) => H(x, z) + (ramps.length ? rampHeight(x, z) : 0);
{
  // tremplins : sur la prairie, autour de la place
  const rampFree = (x, z, a, L = 9, W = 5) => { const fx = Math.cos(a), fz = -Math.sin(a); for (const u of [0, L / 2, L]) for (const w of [-W / 2, 0, W / 2]) if (!free(x + fx * u - fz * w, z + fz * u + fx * w, 4)) return false; return free(x - fx * 10, z - fz * 10, 1) && free(x + fx * (L + 10), z + fz * (L + 10), 1); }; // dégagé devant et derrière pour l'élan et l'atterrissage
  let nr = 0; for (let k = 0; k < 400 && nr < 6; k++) { const a = rnd() * 6.28, d = 24 + rnd() * 60, x = Math.cos(a) * d, z = Math.sin(a) * d, ang = rnd() * 6.28; if (rampFree(x, z, ang) && !ramps.some(r => Math.hypot(r.x - x, r.z - z) < 25)) { ramp(x, z, ang); nr++; } }
  // murets de pierre texturés
  const wallMat = std({ map: TEX.bricks, roughness: 0.9 });
  const wall = (x, z, a, len) => { const y = H(x, z); const t = TEX.bricks.clone(); t.needsUpdate = true; t.repeat.set(len / 3, 1); const m = shadowy(new THREE.Mesh(new RoundedBoxGeometry(len, 1.3, 0.9, 2, 0.12), wallMat.clone())); m.material.map = t; m.position.set(x, y + 0.5, z); m.rotation.y = a; scene.add(m); boxes.push({ x, z, a, hw: len / 2, hd: 0.45, ch: 1.4 }); };
  for (const [x, z, a, l] of [[32, -6, 0.3, 10], [-14, 32, -0.8, 12], [-38, 8, 1.4, 9], [8, 40, 0.1, 11], [44, -48, -0.6, 10], [-50, -30, 0.9, 12], [58, 46, 2.0, 9]]) if ([-0.5, -0.25, 0, 0.25, 0.5].every(f => { const px = x + Math.cos(a) * l * f, pz = z - Math.sin(a) * l * f; return free(px, pz, 2.5) && !occupied(px, pz, 3); })) wall(x, z, a, l);
}
Object.values(P).forEach(p => p.build());

/* ---------- Départ, lettres « BIENVENUE » à bousculer ---------- */
const VIEW = new THREE.Vector3(1, 0, 1).normalize();            // côté où se tient la caméra
const START = { x: PLAZA.x + VIEW.x * 5, z: PLAZA.z + VIEW.z * 5, h: Math.atan2(VIEW.z, -VIEW.x) }; // la voiture s'éloigne de la caméra
const HOME = { x: START.x, z: START.z }; // départ habituel, fixe : sert à orienter les panneaux quel que soit le point d'arrivée
const FROM = new URLSearchParams(location.search).get('from'); // on revient d'une page (village, forêt) : on repart sur son chemin, cap vers la place
const FROM_VILLAGE = FROM === 'village';
if (FROM_VILLAGE) { const c = paths[0], p = c.getPointAt(0.68), tg = c.getTangentAt(0.68); Object.assign(START, { x: p.x, z: p.z, h: Math.atan2(tg.z, -tg.x) }); history.replaceState(null, '', location.pathname); }
const props = [];
function addProp(mesh, x, z, r, k, lift) { const g = new THREE.Group(); g.add(mesh); g.position.set(x, H(x, z) + lift, z); scene.add(g); props.push({ g, r, k, lift, v: new THREE.Vector3(), w: new THREE.Vector3(), still: true, cd: 0 }); return g; }
fetch('./vendor/fonts/helvetiker_bold.typeface.json').then(r => r.json()).then(json => {
  const font = new FontLoader().parse(json), word = 'BIENVENUE', size = 2.3, gap = 0.35;
  const geos = [...word].map(ch => { const g = new TextGeometry(ch, { font, size, depth: 0.9, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 3 }); g.computeBoundingBox(); return g; });
  const widths = geos.map(g => g.boundingBox.max.x - g.boundingBox.min.x), total = widths.reduce((a, b) => a + b, 0) + gap * (word.length - 1);
  const right = new THREE.Vector3(VIEW.z, 0, -VIEW.x), cx = PLAZA.x - VIEW.x * 3.5, cz = PLAZA.z - VIEW.z * 3.5, rotY = Math.atan2(VIEW.x, VIEW.z);
  let off = -total / 2;
  geos.forEach((g, i) => {
    const w = widths[i], hgt = g.boundingBox.max.y - g.boundingBox.min.y; g.translate(-g.boundingBox.min.x - w / 2, -g.boundingBox.min.y - hgt / 2, -0.45);
    const m = shadowy(new THREE.Mesh(g, M.letters)); m.rotation.y = rotY;
    const along = off + w / 2; off += w + gap;
    addProp(m, cx + right.x * along, cz + right.z * along, Math.max(0.9, w / 2), 0.8, hgt / 2 + 0.1);
  });
}).catch(() => {});
/* ---------- Grand panneau d'accueil : ce qu'est le site, en quelques lignes ---------- */
{
  const signWood = std({ color: '#3a2c4f', roughness: 0.75 });
  const W = 17, Hh = 9.4, lift = 1.4, y = H(SIGN.x, SIGN.z), rot = Math.atan2(HOME.x - SIGN.x, HOME.z - SIGN.z) + 0.4; // un peu de travers
  const g = new THREE.Group(); g.position.set(SIGN.x, y, SIGN.z); g.rotation.y = rot; scene.add(g);
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = Math.round(2048 * Hh / W);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = LITE ? 4 : renderer.capabilities.getMaxAnisotropy();
  const draw = () => {
    const x = cv.getContext('2d'), w = cv.width, h = cv.height, m = 120;
    const bg = x.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#231e4c'); bg.addColorStop(1, '#17132f'); x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(239,230,214,.35)'; x.lineWidth = 3; x.strokeRect(46, 46, w - 92, h - 92);
    x.textBaseline = 'alphabetic'; x.textAlign = 'center';
    const sp = (t, cy, gap) => { const tw = [...t].reduce((a, ch) => a + x.measureText(ch).width + gap, -gap); let cx = (w - tw) / 2; x.textAlign = 'left'; for (const ch of t) { x.fillText(ch, cx, cy); cx += x.measureText(ch).width + gap; } x.textAlign = 'center'; };
    x.fillStyle = '#ffb066'; x.font = '500 54px "DM Mono", monospace'; sp('ATELIER FOLIO', 230, 18);
    x.fillStyle = '#efe6d6'; x.font = 'italic 400 300px "Instrument Serif", Georgia, serif';
    x.fillText('Voyagez', w / 2, 520); x.fillText('pour découvrir.', w / 2, 790);
    x.fillStyle = 'rgba(239,230,214,.8)'; x.font = '400 64px "Inter Tight", Arial, sans-serif';
    x.fillText('Les maquettes au Village, le portfolio au Moulin →', w / 2, 960);
    tex.needsUpdate = true;
  };
  draw(); if (document.fonts) document.fonts.ready.then(draw);
  const face = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.85 });
  const board = shadowy(new THREE.Mesh(new RoundedBoxGeometry(W + 0.6, Hh + 0.6, 0.35, 2, 0.12), signWood)); board.position.set(0, lift + Hh / 2, 0); g.add(board);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), face); front.position.set(0, lift + Hh / 2, 0.19); g.add(front);
  for (const sx of [-1, 1]) { const post = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.5, lift + Hh + 0.9, 0.5, 2, 0.08), signWood)); post.position.set(sx * (W / 2 - 0.4), (lift + Hh + 0.9) / 2 - 0.3, -0.35); g.add(post); }
  const roof = shadowy(new THREE.Mesh(new RoundedBoxGeometry(W + 1.6, 0.3, 1.4, 2, 0.1), signWood)); roof.position.set(0, lift + Hh + 0.75, 0.15); g.add(roof);
  const glow = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffa040', emissiveIntensity: 3 });
  for (const sx of [-0.3, 0.3]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glow); b.position.set(sx * W, lift + Hh + 0.5, 0.6); g.add(b); }
  if (!LITE) { const l = new THREE.PointLight('#ffb066', 60, 22, 1.5); l.position.set(0, lift + Hh + 0.4, 3.5); g.add(l); }
  boxes.push({ x: SIGN.x, z: SIGN.z, a: rot, hw: W / 2 + 0.4, hd: 0.6, ch: lift + Hh + 1 });
}
/* ---------- Panneau directionnel : planches de récup peintes, flèches à gauche et à droite, lettres au pochoir ---------- */
function signpost(P, rotY, rows, poleH = 6.6) {
  const y = H(P.x, P.z), g = new THREE.Group(); g.position.set(P.x, y, P.z);
  g.rotation.y = rotY; scene.add(g);
  const woodCanvas = (w, h, base) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(50,28,12,${0.08 + Math.random() * 0.16})`; x.lineWidth = 1 + Math.random() * 2; const yy = Math.random() * h; x.beginPath(); x.moveTo(0, yy); x.bezierCurveTo(w * .3, yy + (Math.random() - .5) * 8, w * .7, yy + (Math.random() - .5) * 8, w, yy + (Math.random() - .5) * 5); x.stroke(); }
    return { c, x }; };
  const pTex = new THREE.CanvasTexture(woodCanvas(64, 512, '#a7713f').c); pTex.colorSpace = THREE.SRGBColorSpace;
  const poleMat = std({ map: pTex, roughness: 0.9 });
  const pole = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.5, poleH, 0.3, 2, 0.04), poleMat)); pole.position.set(0, poleH / 2, -0.2); g.add(pole);
  const T = 0.6, sideMat = std({ color: '#6b4a2e', roughness: 0.95 });
  const fontsReady = document.fonts ? document.fonts.load('400 80px "Stardos Stencil"').catch(() => {}) : Promise.resolve();
  rows.forEach(([name, dist, dir, paint, ink, bold], i) => {
    const sign = dir === 0, L = sign ? 2.9 : 3.3 + (i % 3) * 0.15, tip = 0.42;
    const shape = new THREE.Shape(), hl = L / 2, h2 = (sign ? 0.85 : T) / 2;
    if (sign) { shape.moveTo(-hl, -h2); shape.lineTo(hl, -h2); shape.lineTo(hl, h2); shape.lineTo(-hl, h2); }
    else { shape.moveTo(-hl, -h2); shape.lineTo(hl - tip, -h2); shape.lineTo(hl, 0); shape.lineTo(hl - tip, h2); shape.lineTo(-hl, h2); shape.lineTo(-hl + 0.12, 0); } // pointe d'un côté, encoche de l'autre
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 }); geo.translate(0, 0, -0.05);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let k = 0; k < pos.count; k++) uv.setXY(k, (pos.getX(k) + hl) / L, (pos.getY(k) + h2) / (h2 * 2));
    if (dir < 0) { geo.rotateZ(Math.PI); for (let k = 0; k < pos.count; k++) uv.setXY(k, 1 - uv.getX(k), 1 - uv.getY(k)); } // pointe à gauche, texte toujours à l'endroit
    uv.needsUpdate = true;
    const W2 = 1024, H2 = Math.round(1024 * (h2 * 2) / L), { c, x } = woodCanvas(W2, H2, '#9b6a40');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const paintIt = () => {
      x.fillStyle = paint; x.fillRect(0, 0, W2, H2);
      x.globalCompositeOperation = 'destination-out'; // peinture écaillée sur les bords : le bois réapparaît
      for (let k = 0; k < 140; k++) { const edge = Math.random() < 0.5, ex = Math.random() * W2, ey = edge ? (Math.random() < 0.5 ? Math.random() * 14 : H2 - Math.random() * 14) : Math.random() * H2; x.globalAlpha = 0.5 + Math.random() * 0.5; x.fillRect(ex, ey, 6 + Math.random() * 30, 2 + Math.random() * 5); }
      x.globalAlpha = 1; x.globalCompositeOperation = 'destination-over'; const w = woodCanvas(W2, H2, '#9b6a40'); x.drawImage(w.c, 0, 0); x.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 30; k++) { x.strokeStyle = 'rgba(0,0,0,.06)'; x.lineWidth = 2; const yy = Math.random() * H2; x.beginPath(); x.moveTo(0, yy); x.lineTo(W2, yy + (Math.random() - .5) * 4); x.stroke(); }
      const fs = sign ? H2 * 0.36 : H2 * (bold ? 0.5 : 0.44);
      x.fillStyle = ink; x.textBaseline = 'middle';
      x.font = `400 ${fs}px "Stardos Stencil", "Courier New", monospace`;
      if (sign) { x.textAlign = 'center'; const parts = name.split(' '); if (parts.length > 1) { x.fillText(parts[0], W2 / 2, H2 * 0.32); x.fillText(parts.slice(1).join(' '), W2 / 2, H2 * 0.7); } else { x.font = `400 ${fs * 1.35}px "Stardos Stencil", "Courier New", monospace`; x.fillText(name, W2 / 2, H2 * 0.54); } }
      else {
        const pad = W2 * 0.07, tipPad = W2 * (tip / L) + W2 * 0.03; // le côté de la pointe est à droite sur la texture si dir > 0
        const nameRight = (i % 2 === 0); // comme sur les vrais panneaux : nom et distance changent de côté
        const left = dir > 0 ? pad : tipPad, right = dir > 0 ? W2 - tipPad : W2 - pad;
        x.textAlign = nameRight ? 'right' : 'left'; x.fillText(name, nameRight ? right : left, H2 * 0.54);
        x.font = `400 ${fs * 0.72}px "Stardos Stencil", "Courier New", monospace`; x.textAlign = nameRight ? 'left' : 'right'; x.fillText(dist, nameRight ? left : right, H2 * 0.54);
      }
      tex.needsUpdate = true;
    };
    paintIt(); fontsReady.then(paintIt);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.05, roughness: 0.9 });
    const m = shadowy(new THREE.Mesh(geo, [mat, sideMat]));
    m.position.set((i % 2 ? 0.12 : -0.1) + (sign ? 0 : dir * 0.25), poleH - 0.6 - i * 0.74 - (sign ? 0 : 0.12), 0.02 * (i % 2));
    m.rotation.set(0, (i % 3 - 1) * 0.05, (i % 2 ? 1 : -1) * (0.02 + (i % 3) * 0.012));
    g.add(m);
  });
  if (!LITE) { const l = new THREE.PointLight('#ffcf9a', 6, 9, 1.6); l.position.set(0, poleH - 2, 2.6); g.add(l); }
  circles.push({ x: P.x, z: P.z, r: 0.5 });
}
{
  // [texte, distance, sens (1 = pointe à droite, -1 = à gauche, 0 = écriteau), peinture, encre, police large]
  const D = (o) => Math.round(Math.hypot(o.x - POST.x, o.z - POST.z) * 2) * 5;
  const rows = [
    ['ATELIER FOLIO', '', 0, '#cfc6b4', '#1d1a17', true],
    ['LE VILLAGE', D(VILLAGE) + ' m', -1, '#dcd2bf', '#1d1a17', true],
    ['LA FORÊT', D(FOREST) + ' m', 1, '#2a2725', '#ece4d3', false],
    ['LE LAC', D(LAKE) + ' m', 1, '#b9a98f', '#1d1a17', true],
    ['LE MOULIN', D(HILL) + ' m', -1, '#8a3f2b', '#f1e6d4', false],
    ['LES MAQUETTES', D(VILLAGE) + ' m', 1, '#d4cab6', '#1d1a17', false]
  ];
  signpost(POST, Math.atan2(HOME.x - POST.x, HOME.z - POST.z) - 0.25, rows);
}
// au bout du chemin du lac : cul-de-sac
{
  const c = paths[2], e = c.getPointAt(1), tg = c.getTangentAt(1), at = { x: e.x + tg.x * 3.5, z: e.z + tg.z * 3.5 };
  signpost(at, Math.atan2(-tg.x, -tg.z), [
    ['CUL-DE-SAC', '', 0, '#e2d9c6', '#1d1a17', true],
    ['LE LAC', 'IMPASSE', 1, '#2f4a5c', '#ece4d3', false]
  ], 4.6);
  boxes.push({ x: at.x, z: at.z, a: Math.atan2(-tg.x, -tg.z), hw: 1.7, hd: 0.5, ch: 5 });
}
// caisses en bois empilées
{ const g = new RoundedBoxGeometry(1.6, 1.6, 1.6, 2, 0.08); const bx = PLAZA.x + VIEW.z * 10 - 1.7, bz = PLAZA.z - VIEW.x * 10;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) addProp(shadowy(new THREE.Mesh(g, M.wood)), bx + c * 1.7 + r * 0.85, bz, 1.1, 0.6, 0.8 + r * 1.6); }
{ const bg = new THREE.CylinderGeometry(0.75, 0.75, 1.7, 16), bm = std({ map: TEX.barrel, roughness: 0.7 });
  for (const [x, z] of [[11, -12], [12.5, -11], [11.6, -13.6], [-16, 20], [-17.4, 21], [30, -18], [-22, -26], [-23.5, -25]]) if (nearest(x, z) > PATH_W / 2 + 1.5) addProp(shadowy(new THREE.Mesh(bg, bm)), x, z, 1, 0.7, 0.85); }
for (let k = 0; k < 6; k++) { const a = k * 1.05, x = HILL.x + Math.cos(a) * 10, z = HILL.z + Math.sin(a) * 10; addProp(shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14).rotateX(Math.PI / 2), M.hay)), x, z, 1.4, 0.6, 0.9); }

/* ---------- La 2CV, version nocturne ---------- */
/* ---------- La 2CV « Charleston » ---------- */
const car = new THREE.Group(), body = new THREE.Group(), wheels = [];
const chassis = new THREE.Group(); // porte la caisse ET les roues : la pente les incline ensemble
car.add(chassis); chassis.add(body); scene.add(car);
{
  const red = new THREE.MeshPhysicalMaterial({ color: '#2a2246', roughness: 0.4, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#120f1f', roughness: 0.38, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const canvasTop = std({ color: '#2b2622', roughness: 0.95 });
  const chrome = new THREE.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.12, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#33464f', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.55 });
  const seam = std({ color: '#3a0c12' });
  const tire = std({ color: '#1b1b1d', roughness: 0.9 }), hub = std({ color: '#efe5cf' });
  const lens = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: '#ffa040', emissiveIntensity: 4, roughness: 0.15 });
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
    add(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: '#f5a623', emissive: '#ff8a1a', emissiveIntensity: 3 }), 1.5, 0.95, s * 0.72, false);
    add(new THREE.CapsuleGeometry(0.06, 0.06, 4, 8), new THREE.MeshStandardMaterial({ color: '#d0352a', emissive: '#ff2a1a', emissiveIntensity: 4 }), -1.96, 0.78, s * 0.55, false);
  }
  // calandre, chevrons, pare-chocs, plaques
  for (let k = 0; k < 6; k++) add(new THREE.CapsuleGeometry(0.018, 0.74, 2, 6).rotateX(Math.PI / 2), chrome, 1.98, 0.52 + k * 0.058, 0, false);
  for (const y of [0.76, 0.81]) add(new THREE.TorusGeometry(0.12, 0.022, 6, 3, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), chrome, 2.0, y, 0, false);
  for (const x of [2.05, -2.01]) add(new THREE.CapsuleGeometry(0.065, W + 0.24, 4, 12).rotateX(Math.PI / 2), chrome, x, 0.46, 0);
  const plateTex = canvasTex(256, (g, s) => { g.fillStyle = '#fbfbf6'; g.fillRect(0, 0, s, s); g.fillStyle = '#1a3a8a'; g.fillRect(0, 0, s * 0.12, s); g.fillStyle = '#111'; g.font = 'bold 120px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('2CV', s * 0.56, s * 0.52); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10); });
  const plateM = std({ map: plateTex, roughness: 0.5 });
  for (const [x, ry] of [[2.12, Math.PI / 2], [-2.06, -Math.PI / 2]]) add(new THREE.PlaneGeometry(0.5, 0.14), plateM, x, 0.62, 0, false).rotation.y = ry;
  // roues fines et hautes
  const tg = new THREE.TorusGeometry(0.44, 0.17, 14, 36), sg = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 30).rotateX(Math.PI / 2), hg = new THREE.CylinderGeometry(0.27, 0.3, 0.36, 26).rotateX(Math.PI / 2), cg = new THREE.SphereGeometry(0.1, 12, 10); // grosses roues bien visibles
  for (const [x, z, front] of [[1.3, 0.92, true], [1.3, -0.92, true], [-1.24, 0.92, false], [-1.24, -0.92, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.61, z);
    const spin = new THREE.Group(); pivot.add(spin);
    spin.add(shadowy(new THREE.Mesh(tg, tire)), shadowy(new THREE.Mesh(sg, tire)), shadowy(new THREE.Mesh(hg, hub)));
    const cap = new THREE.Mesh(cg, chrome); cap.position.z = z > 0 ? 0.19 : -0.19; spin.add(cap);
    chassis.add(pivot); wheels.push({ pivot, spin, front });
  }
  // ombre douce sous la voiture
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: canvasTex(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }),
    transparent: true, depthWrite: false }));
  blob.position.y = 0.36; car.add(blob);
  car.scale.setScalar(1.6);

}


// style nocturne : bandeau lumineux sur le toit, lignes orange sur les flancs, faisceau des phares
{
  const glow = new THREE.MeshStandardMaterial({ color: '#ffb066', emissive: '#ff8a1a', emissiveIntensity: 3.5 });
  const bar = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.9, 4, 8).rotateX(Math.PI / 2), glow); bar.position.set(0.15, 1.74, 0); body.add(bar);
  for (const s of [-1, 1]) { const line = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 2.6, 2, 6).rotateZ(Math.PI / 2), glow); line.position.set(-0.1, 0.52, s * 0.86); body.add(line); }
  const beam = new THREE.SpotLight('#ffb36b', LITE ? 0 : 60, 30, 0.55, 0.6, 1.4); beam.position.set(1.9, 1.1, 0); beam.target.position.set(8, 0, 0);
  if (!LITE) { body.add(beam, beam.target); }
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(7, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    map: canvasTex(128, (g, s) => { const gr = g.createRadialGradient(s * 0.4, s / 2, 0, s * 0.4, s / 2, s * 0.42); gr.addColorStop(0, 'rgba(255,170,90,.45)'); gr.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }) }));
  pool.position.set(5, 0.42, 0); pool.visible = LITE; car.add(pool); // halo des phares au sol (visible aussi sur téléphone)
}


/* ---------- Entrées : clavier sur ordinateur, doigt sur téléphone ---------- */
const keys = { up: false, down: false, left: false, right: false, brake: false };
const KMAP = { ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake' };
addEventListener('keydown', e => { const k = KMAP[e.code]; if (k) { keys[k] = true; e.preventDefault(); } if (e.code === 'KeyR') resetCar(); });
addEventListener('keyup', e => { const k = KMAP[e.code]; if (k) keys[k] = false; });
const resetBtn = $('reset'); if (resetBtn) resetBtn.addEventListener('click', () => resetCar());
// doigt : la voiture roule vers le point touché et tourne pour le suivre
const finger = { on: false, x: 0, y: 0, id: null };
const isUI = t => t && t.closest && t.closest('button, a');
addEventListener('touchstart', e => { for (const t of e.changedTouches) if (!finger.on && !isUI(t.target)) Object.assign(finger, { on: true, x: t.clientX, y: t.clientY, id: t.identifier }); }, { passive: true });
addEventListener('touchmove', e => { for (const t of e.changedTouches) if (finger.on && t.identifier === finger.id) { finger.x = t.clientX; finger.y = t.clientY; e.preventDefault(); } }, { passive: false });
const fingerEnd = e => { for (const t of e.changedTouches) if (t.identifier === finger.id) finger.on = false; };
addEventListener('touchend', fingerEnd); addEventListener('touchcancel', fingerEnd);
// souris (ordinateur) : glisser pour faire tourner la caméra
let drag = null, camTurn = 0;
addEventListener('pointerdown', e => { if (e.pointerType !== 'touch' && !isUI(e.target)) { drag = { x: e.clientX }; document.body.classList.add('grabbing'); } });
addEventListener('pointermove', e => { if (drag) { camTurn += (e.clientX - drag.x) * 0.006; drag.x = e.clientX; } });
addEventListener('pointerup', () => { drag = null; document.body.classList.remove('grabbing'); });

const state = { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0, bounce: 0, y: H(START.x, START.z), vy: 0, air: false, landV: 0 };
const MAX = 26, REV = -9, ACC = 13, BRAKE = 30, DRAG = 0.4, CAR_R = 2.3, CAR_HL = 3.3, CAR_HW = 1.65; // demi-longueur / demi-largeur de la 2CV
let snapCam = false;
function resetCar() { Object.assign(state, { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0, vy: 0, air: false }); state.y = groundAt(START.x, START.z); snapCam = true; }
let shake = 0; const bump = () => { shake = Math.min(1, shake + 0.45); };
let stuckT = 0; const stuckP = { x: 0, z: 0 };
function pushOut(nx, nz, depth) {
  state.x += nx * depth; state.z += nz * depth;
  const vn = Math.cos(state.heading) * state.speed * nx - Math.sin(state.heading) * state.speed * nz;
  if (vn < 0) { state.speed *= -vn > 12 ? -0.3 : 0.55; if (-vn > 4) bump(); }
}
// la 2CV est longue : trois cercles le long de la caisse (arrière, milieu, avant) au lieu d'un seul gros
const CAR_PTS = [-1.7, 0, 1.7], CAR_CR = 1.7;
function collide() {
  for (const o of CAR_PTS) {
    const fx = Math.cos(state.heading), fz = -Math.sin(state.heading);
    const px = () => state.x + fx * o, pz = () => state.z + fz * o;
    for (const c of circles) {
      if (c.ch && state.air && state.y > H(c.x, c.z) + c.ch) continue;            // on passe au-dessus en sautant
      const dx = px() - c.x, dz = pz() - c.z; if (Math.abs(dx) > c.r + CAR_CR || Math.abs(dz) > c.r + CAR_CR) continue;
      const d = Math.hypot(dx, dz) || 1e-3, min = c.r + CAR_CR; if (d < min) pushOut(dx / d, dz / d, min - d);
    }
    for (const b of boxes) {
      if (b.below !== undefined && state.y > b.below) continue;
      if (b.ch && state.air && state.y > H(b.x, b.z) + b.ch * 0.7) continue;     // muret survolé
      const dx = px() - b.x, dz = pz() - b.z, reach = b.hw + b.hd + CAR_CR; if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
      const ca = Math.cos(b.a), sa = Math.sin(b.a), lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
      const qx = Math.max(-b.hw, Math.min(lx, b.hw)), qz = Math.max(-b.hd, Math.min(lz, b.hd));
      let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez), depth;
      if (d < 1e-4) { const ox = b.hw - Math.abs(lx), oz = b.hd - Math.abs(lz); if (ox < oz) { ex = Math.sign(lx) || 1; ez = 0; depth = ox + CAR_CR; } else { ex = 0; ez = Math.sign(lz) || 1; depth = oz + CAR_CR; } d = 1; }
      else { if (d >= CAR_CR) continue; depth = CAR_CR - d; }
      const nlx = ex / d, nlz = ez / d; pushOut(nlx * ca + nlz * sa, -nlx * sa + nlz * ca, depth);
    }
  }
  const r = Math.hypot(state.x, state.z), L = 128; if (r > L) pushOut(-state.x / r, -state.z / r, r - L);
  if (!Number.isFinite(state.x + state.z + state.speed + state.y)) resetCar();
}

/* Poussière */
const dust = (() => {
  const n = LITE ? 30 : 70, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.4, 1), new THREE.MeshStandardMaterial({ color: '#9b97e0', roughness: 1, transparent: true, opacity: 0.55 }), n);
  const items = [...Array(n)].map(() => ({ life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  scene.add(m); return { m, items, i: 0 };
})();
function puff(x, y, z, vx, vz) { const d = dust.items[dust.i = (dust.i + 1) % dust.items.length]; d.life = 0; d.p.set(x, y + 0.3, z); d.v.set(vx + (Math.random() - .5), 0.6 + Math.random(), vz + (Math.random() - .5)); d.s = 0.4 + Math.random() * 0.4; }

/* ---------- Caméra : vue plongeante qui suit la voiture ---------- */
let camLift = 0;
const cam = { yaw: Math.atan2(VIEW.z, VIEW.x), pitch: 0.7, dist: LITE ? 38 : 33 };
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), follow = new THREE.Vector3(), look = new THREE.Vector3();
const intro = { t: 0, dur: reduce || FROM_VILLAGE ? 1.2 : 3.8, done: false, started: false };
const INTRO_FROM = FROM_VILLAGE ? new THREE.Vector3(START.x + 4, 8, START.z + 4) : new THREE.Vector3(START.x + 70, 80, START.z + 70);
camera.position.copy(INTRO_FROM); camera.lookAt(START.x, 0, START.z);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- Rendu ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// finesse adaptative : si l'appareil peine (< 45 i/s), on baisse un peu la résolution, par paliers, jamais sous 1
let dprCur = renderer.getPixelRatio(), perfAcc = 0, perfN = 0;
function adaptDpr(rawDt) {
  if (dprCur <= 1 || rawDt > 0.25) return;            // onglet caché, à-coup : on ignore
  perfAcc += rawDt; if (++perfN < 90) return;
  if (perfAcc / perfN > 1 / 45) { dprCur = Math.max(1, dprCur - 0.25); renderer.setPixelRatio(dprCur); composer.setPixelRatio(dprCur); }
  perfAcc = 0; perfN = 0;
}
if (!LITE) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.5, 0.72));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float v = smoothstep(1.05, .3, length((vUv - .5) * vec2(1.15, 1.))); c *= mix(.55, 1., v);
      c = mix(c, c * vec3(1.02, .94, 1.04), .3);
      c += (h(vUv * 1000. + time) - .5) * .035;
      gl_FragColor = vec4(c, 1.); }`
});
composer.addPass(grade);

/* ---------- Interface ---------- */
const hint = $('hint'), speedo = $('speedo'), kmh = $('kmh'), wipe = $('wipe');
let driving = false;
function startDriving() { if (driving || !intro.done) return; driving = true; hint && hint.classList.add('gone'); wipe.classList.add('on'); setTimeout(() => wipe.classList.remove('on'), 160); }
function introFinished() { speedo.classList.add('show'); hint && hint.classList.add('show'); $('reset') && $('reset').classList.add('show'); }
(() => {
  const loader = $('loader'), count = $('count'), bar = $('bar'), t0 = performance.now(), dur = reduce || FROM_VILLAGE ? 10 : 2200;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); count.textContent = String(Math.round(e * 100)).padStart(2, '0'); bar.style.width = e * 100 + '%';
    if (k < 1) requestAnimationFrame(step); else { loader.classList.add('open'); intro.started = true; setTimeout(() => loader.remove(), 1700); } };
  requestAnimationFrame(step);
})();
const ZONES = [
  { x: VILLAGE.x, z: VILLAGE.z, r: 30, t: 'Le Village' }, { x: FOREST.x, z: FOREST.z, r: 30, t: 'La Forêt' },
  { x: LAKE.x, z: LAKE.z, r: LAKE.r + 16, t: 'Le Lac' }, { x: HILL.x, z: HILL.z, r: 26, t: 'Le Moulin' }
];
const zoneEl = $('zone'), zoneK = $('zone-k'), zoneT = $('zone-t'); let curZone = null, zoneTimer = 0;
let ignoreZone = FROM_VILLAGE ? FROM : null, leaving = 0, leaveMode = 'village';
const LINK = { 'Le Village': 'village', 'Le Moulin': 'mill' };
const KICKER = { 'Le Village': 'Les maquettes', 'La Forêt': 'Promenade', 'Le Moulin': 'Mon portfolio', 'Le Lac': 'Cul-de-sac' };
// trois départs, trois façons de quitter la ville
function goTo(mode) {
  if (leaving) return; leaving = 0.0001; leaveMode = mode;
  for (const k in keys) keys[k] = false; finger.on = false;
  if (mode === 'village') { setTimeout(() => $('portal').classList.add('in'), 750); setTimeout(() => { location.href = 'village.html'; }, 1650); }      // gros zoom puis un cercle de couleur
  if (mode === 'mill') { setTimeout(() => $('curtain').classList.add('in'), 900); setTimeout(() => { location.href = '../index.html'; }, 2500); }      // on s'élève dans le ciel, un rideau clair monte
}
function updateZone() {
  if (!intro.done) return;
  const z = ZONES.find(z => Math.hypot(state.x - z.x, state.z - z.z) < z.r) || null;
  if (z && LINK[z.t] && LINK[z.t] !== ignoreZone && driving) goTo(LINK[z.t]);
  if (!z || LINK[z.t] !== ignoreZone) ignoreZone = null;
  if (z === curZone) return; curZone = z; clearTimeout(zoneTimer);
  zoneEl.classList.remove('on'); zoneEl.classList.add('off');
  if (z) zoneTimer = setTimeout(() => { zoneK.textContent = KICKER[z.t] || ''; zoneT.textContent = z.t; zoneEl.classList.remove('off'); void zoneEl.offsetWidth; zoneEl.classList.add('on'); }, 350);
}
const showErr = msg => { if (document.querySelector('.glerr')) return; const d = document.createElement('div'); d.className = 'glerr'; d.innerHTML = msg + '<br><button type="button">Recharger</button>'; d.querySelector('button').onclick = () => location.reload(); document.body.appendChild(d); };
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); showErr('La 3D a été interrompue par l’appareil (mémoire).'); });
addEventListener('error', e => showErr('Erreur : ' + (e.message || 'inconnue')));

/* ---------- Boucle ---------- */
const propBox = new THREE.Box3();
const clock = new THREE.Clock(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), Om = new THREE.Object3D();
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
let lastKmh = -1;
function tick() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 1 / 30), t = clock.elapsedTime;

  // commandes : clavier, ou doigt sur l'écran
  let throttle = (keys.up ? 1 : 0) - (keys.down ? 1 : 0), steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  if (leaving) { leaving = Math.min(1, leaving + rawDt / (leaveMode === 'mill' ? 2.2 : 1.4)); state.speed *= Math.pow(0.15, dt); }
  if (finger.on && intro.done) {
    ndc.set(finger.x / innerWidth * 2 - 1, -(finger.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    groundPlane.constant = -state.y;
    if (ray.ray.intersectPlane(groundPlane, hit)) {
      const dx = hit.x - state.x, dz = hit.z - state.z, dist = Math.hypot(dx, dz);
      let diff = Math.atan2(-dz, dx) - state.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const back = dist >= 3 && Math.abs(diff) > 2.4 && dist < 14;        // doigt juste derrière : on recule en braquant pour se retourner
      steerIn = Math.max(-1, Math.min(1, diff * 1.8)) * (back ? -1 : 1);
      throttle = dist < 3 ? 0 : back ? -0.6 : Math.min(1, dist / 10) * (Math.abs(diff) > 1.6 ? 0.55 : 1); // loin derrière : demi-tour en avançant
      if (dist < 3) state.speed *= Math.pow(0.1, dt);
    }
  }
  if (intro.done && !driving && (throttle || steerIn)) startDriving();
  if (intro.done) {
    if (throttle > 0) state.speed += ACC * throttle * dt * (state.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) state.speed -= (state.speed > 0 ? BRAKE : ACC * 0.8) * -throttle * dt;
    if (keys.brake) state.speed *= Math.pow(0.04, dt);
    state.speed -= state.speed * DRAG * dt; if (!throttle && Math.abs(state.speed) < 0.3) state.speed = 0;
    state.speed = Math.max(REV, Math.min(MAX, state.speed));
    state.steer += (steerIn * 0.6 - state.steer) * Math.min(1, dt * 6);
    const grip = Math.max(Math.min(1, Math.abs(state.speed) / 6), throttle ? 0.45 : 0);
    state.heading += state.steer * grip * (Math.sign(state.speed) || Math.sign(throttle) || 1) * dt * 2.3;
    state.x += Math.cos(state.heading) * state.speed * dt; state.z -= Math.sin(state.heading) * state.speed * dt;
    collide();
    if (throttle) { stuckT += dt; if (Math.hypot(state.x - stuckP.x, state.z - stuckP.z) > 1.2) { stuckT = 0; stuckP.x = state.x; stuckP.z = state.z; } if (stuckT > 7) { resetCar(); stuckT = 0; } } else { stuckT = 0; stuckP.x = state.x; stuckP.z = state.z; }
  }
  // la voiture épouse les collines
  fwd.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
  const hF = groundAt(state.x + fwd.x * 2.4, state.z + fwd.z * 2.4), hB = groundAt(state.x - fwd.x * 2.4, state.z - fwd.z * 2.4), hL = groundAt(state.x - fwd.z * 1.3, state.z + fwd.x * 1.3), hR = groundAt(state.x + fwd.z * 1.3, state.z - fwd.x * 1.3);
  const gY = Math.max((hF + hB + hL + hR) / 4, groundAt(state.x, state.z)) + 0.05, onRamp = ramps.length && rampHeight(state.x, state.z) > 0.05;
  const leftRamp = state.wasRamp && !onRamp; state.wasRamp = onRamp;
  const stick = !state.air && !leftRamp && state.y - gY < 0.3 + Math.abs(state.speed) * dt * 1.2; // en descente, on reste collé au sol
  if (state.y <= gY + 0.03 || stick) {                       // au sol
    const climb = (gY - state.y) / Math.max(dt, 1e-3);
    state.vy = onRamp ? Math.min(14, Math.max(0, climb)) : 0; // en montant un tremplin, on garde l'élan vertical
    if (state.air && state.landV < -7) bump();
    state.y = gY; state.air = false;
  } else {                                          // en l'air
    state.air = true; state.vy -= 30 * dt; state.y += state.vy * dt; state.landV = state.vy;
    if (state.y < gY) { state.y = gY; if (state.vy < -7) bump(); state.vy = 0; state.air = false; }
  }
  car.position.set(state.x, state.y, state.z); car.rotation.set(0, state.heading, 0);
  // pente : châssis entier (caisse + roues) ; virage et accélération : léger balancement de la caisse seule, assez faible pour ne jamais toucher les roues
  const slopeRoll = Math.atan2(hL - hR, 2.6), slopePitch = state.air ? -0.12 : Math.atan2(hF - hB, 4.8);
  state.roll += (slopeRoll - state.roll) * Math.min(1, dt * 5);
  state.pitch += (slopePitch - state.pitch) * Math.min(1, dt * (state.air ? 1.5 : 5));
  chassis.rotation.set(state.roll, 0, state.pitch);
  const lean = Math.max(-0.06, Math.min(0.06, -state.steer * Math.min(1, Math.abs(state.speed) / MAX) * 0.2 * Math.sign(state.speed || 1)));
  const squat = state.air ? 0 : Math.max(-0.025, Math.min(0.025, throttle * 0.025));
  state.lean = (state.lean || 0) + (lean - (state.lean || 0)) * Math.min(1, dt * 5); state.squat = (state.squat || 0) + (squat - (state.squat || 0)) * Math.min(1, dt * 5);
  state.bounce += dt * (4 + Math.abs(state.speed) * 0.4);
  body.rotation.set(state.lean, 0, state.squat); body.position.y = Math.sin(state.bounce) * 0.015 * (0.3 + Math.abs(state.speed) / MAX) + 0.16; // caisse relevée sur les grosses roues
  state.wheelSpin -= state.speed * dt / (0.61 * 1.6);
  for (const w of wheels) { w.spin.rotation.z = state.wheelSpin; if (w.front) w.pivot.rotation.y = state.steer * 0.9; }

  if (intro.done && Math.abs(state.speed) > 6 && Math.random() < 0.5) for (const side of [-1, 1]) { tmp.set(-fwd.z, 0, fwd.x).multiplyScalar(side * 1.2); puff(state.x - fwd.x * 2.2 + tmp.x, state.y, state.z - fwd.z * 2.2 + tmp.z, -fwd.x * 2, -fwd.z * 2); }
  let dustDirty = false;
  dust.items.forEach((d, i) => { if (d.life >= 1 && d.dead) return; if (d.life < 1) { d.life += dt * 1.1; d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(0.96); d.dead = false; } else d.dead = true; const s = d.life < 1 ? d.s * (0.6 + d.life * 1.4) * (1 - d.life) : 0; Om.position.copy(d.p); Om.rotation.set(0, 0, 0); Om.scale.setScalar(s); Om.updateMatrix(); dust.m.setMatrixAt(i, Om.matrix); dustDirty = true; });
  if (dustDirty) dust.m.instanceMatrix.needsUpdate = true;

  // lettres, caisses, foin : poussés par la voiture, ils basculent et glissent
  for (const c of props) {
    c.cd = Math.max(0, c.cd - dt);
    // contact avec la vraie forme de la voiture (rectangle allongé), pas un simple cercle
    const dx = c.g.position.x - state.x, dz = c.g.position.z - state.z, sx = -fwd.z, sz = fwd.x;
    const lx = dx * fwd.x + dz * fwd.z, ls = dx * sx + dz * sz;
    const qx = Math.max(-CAR_HL, Math.min(lx, CAR_HL + 0.2)), qs = Math.max(-CAR_HW, Math.min(ls, CAR_HW));
    let ex = lx - qx, es = ls - qs, d = Math.hypot(ex, es);
    if (d < 1e-3) { ex = 1; es = 0; d = 1e-3; }
    const nx = (ex * fwd.x + es * sx) / d, nz = (ex * fwd.z + es * sz) / d, rr = c.r * 0.75;
    if (d < rr + 0.35) {
      const sp = Math.abs(state.speed);
      if (sp > 1.2 && c.cd === 0) {
        const push = sp * 0.75 * c.k;
        c.v.set(nx * push * 0.6 + fwd.x * state.speed * 0.75 * c.k, Math.min(5, 1.2 + sp * 0.12) * c.k, nz * push * 0.6 + fwd.z * state.speed * 0.75 * c.k);
        const hl = Math.hypot(c.v.x, c.v.z) || 1;
        c.w.set(c.v.z / hl * (2 + sp * 0.18), (Math.random() - .5) * 2, -c.v.x / hl * (2 + sp * 0.18));
        c.cd = 0.35; if (c.still) bump(); c.still = false;
        state.speed *= 0.88;
      }
      if (d < rr) { c.g.position.x += nx * (rr - d); c.g.position.z += nz * (rr - d); } // jamais à l'intérieur de la carrosserie
    }
    if (!c.still) {
      c.v.y -= 22 * dt; c.g.position.addScaledVector(c.v, dt);
      c.g.rotation.x += c.w.x * dt; c.g.rotation.y += c.w.y * dt; c.g.rotation.z += c.w.z * dt;
      propBox.setFromObject(c.g, false);
      const ground = groundAt(c.g.position.x, c.g.position.z) + 0.1;
      if (propBox.min.y < ground) {
        c.g.position.y += ground - propBox.min.y;               // ne s'enfonce jamais dans le sol
        if (c.v.y < 0) c.v.y *= -0.25;
        const fr = Math.pow(0.08, dt); c.v.x *= fr; c.v.z *= fr; c.w.multiplyScalar(Math.pow(0.05, dt));
        if (Math.abs(c.v.y) < 0.5 && Math.hypot(c.v.x, c.v.z) < 0.25 && c.w.length() < 0.25) c.still = true;
      }
    }
  }

  millHub.rotation.z += dt * 0.5;
  grassUniforms.uTime.value = t;
  lampLights.forEach((l, i) => l.intensity = 25 + Math.sin(t * 7 + i * 2) * 1.5 + Math.sin(t * 13 + i) * 1);

  // caméra
  cam.yaw += camTurn; camTurn = 0;
  { // si un arbre ou une maison cache la voiture, la caméra monte pour la voir d'au-dessus
    let hidden = false; const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    for (let k = 1; k <= 8 && !hidden; k++) { const f = k / 9, px = lerp(car.position.x, cx, f), py = lerp(car.position.y + 1.5, cy, f), pz = lerp(car.position.z, cz, f);
      for (const c of circles) { if (!c.cr || py > c.ch + H(c.x, c.z)) continue; const dx = px - c.x, dz = pz - c.z; if (dx * dx + dz * dz < c.cr * c.cr) { hidden = true; break; } }
      if (!hidden) for (const b of boxes) { if (!b.ch || py > H(b.x, b.z) + b.ch) continue; const dx = px - b.x, dz = pz - b.z, ca = Math.cos(b.a), sa = Math.sin(b.a); if (Math.abs(dx * ca - dz * sa) < b.hw && Math.abs(dx * sa + dz * ca) < b.hd) { hidden = true; break; } } }
    camLift += ((hidden ? 0.55 : 0) - camLift) * Math.min(1, dt * (hidden ? 3 : 1));
  }
  const zk = leaving ? 1 - Math.pow(1 - leaving, 3) : 0, LV = { village: [7, 0.32, 0], forest: [9, 0.1, 1.3], mill: [cam.dist * 3, 1.42, -0.5] }[leaveMode]; // [distance, inclinaison, rotation] visées en partant
  const speedK = Math.abs(state.speed) / MAX, dist = lerp(cam.dist * (camera.aspect < 0.8 ? 1.15 : 1) * (1 + speedK * 0.12), LV[0], zk);
  const pitch = lerp(Math.min(1.35, cam.pitch + camLift), LV[1], zk), yaw = cam.yaw + LV[2] * zk;
  follow.set(Math.cos(pitch) * Math.cos(yaw) * dist, Math.sin(pitch) * dist, Math.cos(pitch) * Math.sin(yaw) * dist).add(car.position);
  look.set(car.position.x + fwd.x * (4 + speedK * 6), car.position.y + 0.5, car.position.z + fwd.z * (4 + speedK * 6)); // on regarde un peu devant la voiture
  if (intro.started && !intro.done) {
    intro.t += Math.min(rawDt, 0.1) / intro.dur; const e = ease(Math.min(1, intro.t));
    camPos.lerpVectors(INTRO_FROM, follow, e); camLook.lerpVectors(tmp.set(START.x, 0, START.z), look, e);
    if (intro.t >= 1) { intro.done = true; introFinished(); }
  } else if (snapCam) { camPos.copy(follow); camLook.copy(look); snapCam = false; }
  else if (intro.done) { camPos.lerp(follow, Math.min(1, dt * (leaving ? 7 : 4))); camLook.lerp(look, Math.min(1, dt * 6)); }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * 0.4; camera.position.y += (Math.random() - .5) * shake * 0.4; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(camLook);
  moon.position.copy(car.position).addScaledVector(MOON_DIR, 80); moon.target.position.copy(car.position);

  updateZone();
  const kv = Math.round(Math.abs(state.speed) * 3.6); if (kv !== lastKmh) { kmh.textContent = kv; lastKmh = kv; }
  grade.uniforms.time.value = (grade.uniforms.time.value + 1) % 1000;
  if (intro.done) adaptDpr(rawDt);
  if (LITE) renderer.render(scene, camera); else composer.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
window.__atelier = { state, resetCar, cam, finger, props, ramps, boxes, placeAt: (x, z, h) => { Object.assign(state, { x, z, heading: h, speed: 0 }); state.y = H(x, z); snapCam = true; } };
