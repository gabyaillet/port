import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =========================================================
   Atelier Folio — mini-ville stylisée, visitée en 2CV
   ========================================================= */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const $ = id => document.getElementById(id);

/* ---------- Rendu ---------- */
const canvas = $('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const SKY_TOP = new THREE.Color('#8fa9bc'), SKY_BOTTOM = new THREE.Color('#e6dccd');
scene.fog = new THREE.Fog('#e3d9ca', 90, 240);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 700);

/* Ciel en dégradé, avec un halo de soleil */
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: SKY_TOP }, bottom: { value: SKY_BOTTOM }, sunDir: { value: new THREE.Vector3(0.5, 0.35, 0.4).normalize() } },
  vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;
    void main(){ float t = smoothstep(-0.08, 0.6, vDir.y); vec3 c = mix(bottom, top, t);
      float s = max(dot(vDir, sunDir), 0.); c += vec3(1.,.82,.55) * (pow(s, 40.) * .6 + pow(s, 6.) * .12);
      gl_FragColor = vec4(c, 1.); }`
}));
scene.add(skyMesh);

/* Lumières : soleil chaud et lumière de remplissage froide (rendu « jeu vidéo ») */
scene.add(new THREE.HemisphereLight('#ffeedd', '#8a6d5c', 1.15));
const sun = new THREE.DirectionalLight('#fbe6cc', 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const SC = 55; Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 240 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const fill = new THREE.DirectionalLight('#9cc3ff', 0.55); fill.position.set(-50, 30, -40); scene.add(fill);

/* ---------- Textures dessinées par le code ---------- */
const rnd = (() => { let s = 20240601; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const pick = a => a[Math.floor(rnd() * a.length)];
function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
const speckle = (g, s, n, a, light = false) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${light ? '255,255,255' : '0,0,0'},${Math.random() * a})`; const r = Math.random() * 2 + 0.5; g.fillRect(Math.random() * s, Math.random() * s, r, r); } };
const TEX = {
  plaster: canvasTex(256, (g, s) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s); speckle(g, s, 2600, 0.07); speckle(g, s, 900, 0.5, true);
    for (let i = 0; i < 7; i++) { const gr = g.createRadialGradient(Math.random() * s, Math.random() * s, 0, Math.random() * s, Math.random() * s, 60); gr.addColorStop(0, 'rgba(0,0,0,.035)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } }, 2, 2),
  tiles: canvasTex(256, (g, s) => { g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, s, s); const rows = 10, h = s / rows, w = s / 8;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 9; c++) { const x = c * w + (r % 2) * w / 2, y = r * h;
      const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.75, '#d9d9d9'); gr.addColorStop(1, '#9a9a9a'); g.fillStyle = gr;
      g.beginPath(); g.moveTo(x + 2, y); g.lineTo(x + w - 2, y); g.quadraticCurveTo(x + w - 2, y + h, x + w / 2, y + h); g.quadraticCurveTo(x + 2, y + h, x + 2, y); g.fill(); } speckle(g, s, 600, 0.08); }, 1, 1),
  asphalt: canvasTex(512, (g, s) => { g.fillStyle = '#9b9b9b'; g.fillRect(0, 0, s, s); speckle(g, s, 9000, 0.18); speckle(g, s, 4000, 0.25, true);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1.2; for (let i = 0; i < 5; i++) { g.beginPath(); let x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 40; y += (Math.random() - .5) * 40; g.lineTo(x, y); } g.stroke(); } }),
  pavers: canvasTex(256, (g, s) => { g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, s, s); const n = 8, w = s / n;
    for (let r = 0; r < n * 2; r++) for (let c = -1; c <= n; c++) { const x = c * w + (r % 2) * w / 2, y = r * w / 2; const v = 235 + Math.floor(Math.random() * 18); g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.fillRect(x + 2, y + 2, w - 4, w / 2 - 4); }
    speckle(g, s, 700, 0.07); }),
  grass: canvasTex(256, (g, s) => { g.fillStyle = '#dcdcdc'; g.fillRect(0, 0, s, s); for (let i = 0; i < 2600; i++) { const v = 200 + Math.random() * 55; g.strokeStyle = `rgba(${v * .9},${v},${v * .8},.6)`; const x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 3, y - 3 - Math.random() * 4); g.stroke(); } }, 40, 40),
  stripes: canvasTex(128, (g, s) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#c0392b'; g.fillRect(i * s / 8, 0, s / 8, s); } }),
  stripesB: canvasTex(128, (g, s) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#ffffff' : '#2f6f8f'; g.fillRect(i * s / 8, 0, s / 8, s); } }),
  wood: canvasTex(128, (g, s) => { g.fillStyle = '#c9925a'; g.fillRect(0, 0, s, s); for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(80,40,10,.35)'; g.fillRect(0, i * s / 6, s, 2); } for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(90,50,20,.18)'; g.beginPath(); const y = Math.random() * s; g.moveTo(0, y); g.bezierCurveTo(s * .3, y + 4, s * .6, y - 4, s, y + 2); g.stroke(); } g.strokeStyle = 'rgba(60,30,10,.5)'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6); })
};

/* ---------- Matériaux ---------- */
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, ...o });
const M = {
  grass: std({ color: '#98a581', map: TEX.grass }),
  road: std({ color: '#5d5862', map: TEX.asphalt, roughness: 0.92 }),
  line: std({ color: '#f3ecdc' }),
  curb: std({ color: '#cdbfa8' }),
  stone: std({ color: '#dccfb9', map: TEX.plaster }),
  walls: std({ color: '#ffffff', map: TEX.plaster, vertexColors: true }),
  roofs: std({ color: '#ffffff', map: TEX.tiles, vertexColors: true, roughness: 0.7 }),
  trim: std({ color: '#f6efe2' }),
  glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.12, metalness: 0.35 }),
  shutter: std({ color: '#ffffff' }),
  trunk: std({ color: '#7b5a3f' }),
  leaf: std({ color: '#ffffff', roughness: 0.9 }),
  dark: std({ color: '#2d2a2b', roughness: 0.6, metalness: 0.2 }),
  lantern: new THREE.MeshStandardMaterial({ color: '#fff1cf', emissive: '#ffcf7a', emissiveIntensity: 1.6 }),
  water: new THREE.MeshStandardMaterial({ color: '#79b4d4', roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.92 }),
  cone: std({ color: '#f07b3a' }), white: std({ color: '#f7f2e8' }),
  wood: std({ color: '#ffffff', map: TEX.wood }),
  awning: std({ color: '#ffffff', map: TEX.stripes }), awningB: std({ color: '#ffffff', map: TEX.stripesB }),
  flower: std({ color: '#ffffff' })
};
const WALL_COLORS = ['#e9e2d6', '#d8cfc0', '#c9c4bb', '#e2d8c6', '#b8bfc2', '#d6d1c4', '#c7bba8', '#ece8e0', '#bfc4b6'].map(c => new THREE.Color(c));
const ROOF_COLORS = ['#5e6469', '#4f5559', '#6d7378', '#8a5e4c', '#73665d'].map(c => new THREE.Color(c));
const SHUTTER_COLORS = ['#3f4a52', '#56605a', '#6b4a44', '#2f3a44', '#8a8478', '#e6e1d6'].map(c => new THREE.Color(c));
const LEAF_COLORS = ['#5f7a54', '#6b8660', '#566e4c', '#7a8f68'].map(c => new THREE.Color(c));
const shadowy = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

/* Fusionne plusieurs géométries (avec une couleur par morceau) en une seule : beaucoup moins d'appels de rendu */
function merge(parts) {
  const out = { position: [], normal: [], uv: [], color: [] };
  for (const { geo, matrix, color } of parts) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      out.position.push(p.getX(i), p.getY(i), p.getZ(i)); out.normal.push(n.getX(i), n.getY(i), n.getZ(i));
      out.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); out.color.push(color.r, color.g, color.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.position, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(out.normal, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(out.color, 3));
  return g;
}
/* Pool d'instances : on accumule des matrices (et couleurs), puis on crée un InstancedMesh */
class Pool {
  constructor(geo, material, { cast = true, receive = true } = {}) { this.geo = geo; this.mat = material; this.items = []; this.cast = cast; this.receive = receive; }
  add(matrix, color) { this.items.push([matrix.clone(), color]); }
  build() {
    if (!this.items.length) return null;
    const m = new THREE.InstancedMesh(this.geo, this.mat, this.items.length);
    this.items.forEach(([mx, c], i) => { m.setMatrixAt(i, mx); if (c) m.setColorAt(i, c); });
    if (m.instanceColor) { for (let i = 0; i < this.items.length; i++) if (!this.items[i][1]) m.setColorAt(i, new THREE.Color('#ffffff')); }
    m.castShadow = this.cast; m.receiveShadow = this.receive; scene.add(m); return m;
  }
}
const O = new THREE.Object3D();
const mtx = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { O.position.set(x, y, z); O.rotation.set(rx, ry, rz); O.scale.set(sx, sy, sz); O.updateMatrix(); return O.matrix.clone(); };

/* ---------- La ville ---------- */
const ROAD = 10, LINES = [-100, -50, 0, 50, 100], WORLD = 125;
const colliders = [];
const P = {
  frame: new Pool(new THREE.BoxGeometry(1, 1, 0.16), M.trim),
  glass: new Pool(new THREE.BoxGeometry(0.82, 0.84, 0.18), M.glass, { cast: false }),
  mullion: new Pool(new THREE.BoxGeometry(0.06, 1, 0.2), M.trim, { cast: false }),
  sill: new Pool(new RoundedBoxGeometry(1.3, 0.14, 0.36, 2, 0.05), M.trim),
  shutter: new Pool(new RoundedBoxGeometry(0.5, 1, 0.07, 2, 0.03), M.shutter),
  door: new Pool(new RoundedBoxGeometry(1, 1, 0.14, 2, 0.05), M.shutter),
  step: new Pool(new RoundedBoxGeometry(1.8, 0.25, 0.7, 2, 0.08), M.stone),
  plinth: new Pool(new THREE.BoxGeometry(1, 1, 1), M.curb),
  cornice: new Pool(new THREE.BoxGeometry(1, 1, 1), M.trim),
  balcony: new Pool(new RoundedBoxGeometry(1, 0.18, 1, 2, 0.06), M.trim),
  rail: new Pool(new THREE.BoxGeometry(1, 0.06, 0.06), M.dark),
  bar: new Pool(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), M.dark, { cast: false }),
  flowerbox: new Pool(new RoundedBoxGeometry(1.1, 0.28, 0.3, 2, 0.06), M.wood),
  flower: new Pool(new THREE.IcosahedronGeometry(0.16, 1), M.flower, { cast: false }),
  chimney: new Pool(new RoundedBoxGeometry(1, 1, 1, 2, 0.08), M.stone),
  chimneyCap: new Pool(new RoundedBoxGeometry(1.25, 0.18, 1.25, 2, 0.05), M.dark),
  ridge: new Pool(new THREE.CylinderGeometry(0.16, 0.16, 1, 8).rotateZ(Math.PI / 2), M.trim),
  trunk: new Pool(new THREE.CylinderGeometry(0.22, 0.34, 1, 8), M.trunk),
  crown: new Pool(new THREE.IcosahedronGeometry(1, 1), M.leaf),
  bush: new Pool(new THREE.IcosahedronGeometry(1, 1), M.leaf),
  pole: new Pool(new THREE.CylinderGeometry(0.1, 0.14, 1, 10), M.dark),
  arm: new Pool(new THREE.TorusGeometry(0.6, 0.06, 6, 12, Math.PI / 2), M.dark),
  lantern: new Pool(new RoundedBoxGeometry(0.42, 0.55, 0.42, 2, 0.08), M.lantern, { cast: false }),
  lampCap: new Pool(new THREE.ConeGeometry(0.4, 0.3, 4).rotateY(Math.PI / 4), M.dark),
  bollard: new Pool(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10), M.dark),
  benchSeat: new Pool(new RoundedBoxGeometry(2.2, 0.12, 0.6, 2, 0.04), M.wood),
  benchBack: new Pool(new RoundedBoxGeometry(2.2, 0.5, 0.1, 2, 0.04), M.wood),
  benchLeg: new Pool(new THREE.BoxGeometry(0.1, 0.5, 0.55), M.dark),
  bin: new Pool(new THREE.CylinderGeometry(0.35, 0.3, 1, 12), std({ color: '#3d5a46' })),
  tableTop: new Pool(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 16), M.white),
  tableLeg: new Pool(new THREE.CylinderGeometry(0.05, 0.08, 0.75, 8), M.dark),
  chair: new Pool(new RoundedBoxGeometry(0.45, 0.08, 0.45, 2, 0.03), std({ color: '#c94f3a' })),
  chairBack: new Pool(new RoundedBoxGeometry(0.45, 0.45, 0.06, 2, 0.03), std({ color: '#c94f3a' })),
  umbrella: new Pool(new THREE.ConeGeometry(1.6, 0.6, 12, 1, true), M.awning),
  umbrellaPole: new Pool(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), M.white),
  dash: new Pool(new THREE.BoxGeometry(2.4, 0.02, 0.26), M.line, { cast: false }),
  zebra: new Pool(new THREE.BoxGeometry(0.7, 0.02, 4), M.line, { cast: false }),
  sign: new Pool(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 20).rotateX(Math.PI / 2), std({ color: '#d63a2f' })),
  signIn: new Pool(new THREE.BoxGeometry(0.55, 0.12, 0.08), M.white, { cast: false })
};
const wallParts = [], roofParts = [];

// sol, rues et passages piétons
scene.add(shadowy(new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2.8, WORLD * 2.8).rotateX(-Math.PI / 2), M.grass), false, true));
for (const c of LINES) {
  for (const horiz of [true, false]) {
    const t = TEX.asphalt.clone(); t.needsUpdate = true; t.repeat.set(horiz ? WORLD * 2 / 12 : 1, horiz ? 1 : WORLD * 2 / 12);
    const m = shadowy(new THREE.Mesh(new THREE.BoxGeometry(horiz ? WORLD * 2 : ROAD, 0.1, horiz ? ROAD : WORLD * 2), M.road.clone()), false, true);
    m.material.map = t; m.position.set(horiz ? 0 : c, horiz ? 0.03 : 0.031, horiz ? c : 0); scene.add(m);
  }
  for (let t = -WORLD; t < WORLD; t += 5.5) {
    if (LINES.some(o => Math.abs(t - o) < ROAD / 2 + 4)) continue;
    P.dash.add(mtx(t, 0.09, c)); P.dash.add(mtx(c, 0.09, t, 0, Math.PI / 2, 0));
  }
}
for (const x of LINES) for (const z of LINES) for (const [dx, dz, rot] of [[0, 6.5, 0], [0, -6.5, 0], [6.5, 0, Math.PI / 2], [-6.5, 0, Math.PI / 2]])
  for (let k = -3; k <= 3; k++) P.zebra.add(mtx(x + dx + (rot ? 0 : k * 1.3), 0.09, z + dz + (rot ? k * 1.3 : 0), 0, rot, 0, 1, 1, 0.55));

function addHouse(x, z, w, d, h, face) {
  // face : angle de la façade (0 = vers +z)
  const base = new THREE.Matrix4().makeRotationY(face).setPosition(x, 0, z);
  const at = (lx, ly, lz, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) => new THREE.Matrix4().multiplyMatrices(base, mtx(lx, ly, lz, rx, ry, 0, sx, sy, sz));
  const wallC = pick(WALL_COLORS), roofC = pick(ROOF_COLORS), shutC = pick(SHUTTER_COLORS);
  wallParts.push({ geo: new RoundedBoxGeometry(w, h, d, 3, 0.22), matrix: at(0, h / 2, 0), color: wallC });
  P.plinth.add(at(0, 0.45, 0, 0, w + 0.16, 0.9, d + 0.16));
  P.cornice.add(at(0, h - 0.05, 0, 0, w + 0.35, 0.28, d + 0.35));
  // toit à deux pans avec débord et faîtage
  if (rnd() < 0.78) {
    const rh = 1.6 + rnd() * 1.6, s = new THREE.Shape();
    s.moveTo(-w / 2 - 0.55, 0); s.lineTo(w / 2 + 0.55, 0); s.lineTo(0, rh); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d + 0.9, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    const pos = g.attributes.position, uv = g.attributes.uv; // UV à l'échelle du monde : tuiles régulières
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getZ(i) / 2.4, (Math.abs(pos.getX(i)) * 0.6 + pos.getY(i)) / 2.2);
    roofParts.push({ geo: g, matrix: at(0, h + 0.1, -d / 2 - 0.45), color: roofC });
    P.ridge.add(at(0, h + 0.12 + rh, 0, Math.PI / 2, d + 0.9, 1, 1));
    if (rnd() < 0.6) { const cx = (rnd() - .5) * w * 0.5, cz = (rnd() - .5) * d * 0.4, ch = rh + 1.4; P.chimney.add(at(cx, h + ch / 2, cz, 0, 0.9, ch, 0.9)); P.chimneyCap.add(at(cx, h + ch + 0.05, cz)); }
  } else {
    P.cornice.add(at(0, h + 0.35, 0, 0, w + 0.2, 0.5, d + 0.2));
    roofParts.push({ geo: new RoundedBoxGeometry(w - 0.4, 0.3, d - 0.4, 2, 0.1), matrix: at(0, h + 0.2, 0), color: new THREE.Color('#8c8a86') });
  }
  // façades avant et arrière : fenêtres, volets, rebords, jardinières, porte, balcon
  const floors = Math.max(1, Math.floor((h - 1.2) / 2.8)), cols = Math.max(1, Math.floor(w / 2.6));
  for (const side of [1, -1]) {
    const zf = side * (d / 2), ry = side > 0 ? 0 : Math.PI;
    const doorCol = side > 0 ? Math.floor(cols / 2) : -1;
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const lx = (-w / 2 + (c + 0.5) * (w / cols)) * side, ly = 1.9 + f * 2.8;
      if (f === 0 && c === doorCol) {
        P.door.add(at(lx, 1.25, zf + side * 0.04, ry, 1.25, 2.3, 1), shutC);
        P.frame.add(at(lx, 1.3, zf + side * 0.02, ry, 1.55, 2.6, 1));
        P.step.add(at(lx, 0.12, zf + side * 0.4, ry));
        if (rnd() < 0.5) P.frame.add(at(lx, 2.75, zf + side * 0.4, ry, 1.9, 0.12, 4)); // marquise
        continue;
      }
      P.frame.add(at(lx, ly, zf + side * 0.02, ry, 1.15, 1.55, 1));
      P.glass.add(at(lx, ly, zf + side * 0.03, ry, 1.05, 1.6, 1), new THREE.Color(rnd() < 0.12 ? '#f1d49a' : '#3a4650'));
      P.mullion.add(at(lx, ly, zf + side * 0.05, ry, 1, 1.25, 1));
      P.sill.add(at(lx, ly - 0.86, zf + side * 0.14, ry));
      if (rnd() < 0.65) for (const sx of [-1, 1]) P.shutter.add(at(lx + sx * 0.88 * side, ly, zf + side * 0.06, ry, 1, 1.45, 1), shutC);
      if (f > 0 && rnd() < 0.35) {
        P.flowerbox.add(at(lx, ly - 0.66, zf + side * 0.32, ry));
        for (let k = 0; k < 4; k++) P.flower.add(at(lx - 0.38 + k * 0.25, ly - 0.42, zf + side * 0.32, ry), new THREE.Color(pick(['#b4524f', '#e8e2d4', '#c9a65a'])));
      }
    }
    if (floors > 1 && side > 0 && rnd() < 0.45) { // balcon
      const bw = Math.min(w - 1, 3.6), by = 1.9 + 2.8 - 1.05;
      P.balcony.add(at(0, by, zf + side * 0.55, ry, bw, 1, 1.1));
      P.rail.add(at(0, by + 0.85, zf + side * 1.05, ry, bw, 1, 1));
      for (let k = 0; k <= Math.floor(bw / 0.3); k++) P.bar.add(at(-bw / 2 + k * 0.3, by + 0.45, zf + side * 1.05, ry));
    }
    if (side > 0 && rnd() < 0.3) { // store rayé
      const aw = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w - 0.6, 5), 0.08, 1.7), rnd() < 0.5 ? M.awning : M.awningB);
      aw.applyMatrix4(at(0, 2.95, zf + side * 0.85, ry, 1, 1, 1, 0.32)); shadowy(aw); scene.add(aw);
    }
  }
  const c = Math.abs(Math.cos(face)) > 0.5, hw = (c ? w : d) / 2 + 0.4, hd = (c ? d : w) / 2 + 0.4;
  colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
}
const tree = (x, z, s = 1) => {
  P.trunk.add(mtx(x, 1.3 * s, z, 0, 0, 0, s, 2.6 * s, s));
  const c1 = pick(LEAF_COLORS), c2 = pick(LEAF_COLORS);
  P.crown.add(mtx(x, 3.4 * s, z, rnd(), rnd() * 6, 0, 2 * s, 1.7 * s, 2 * s), c1);
  P.crown.add(mtx(x + 0.6 * s, 4.4 * s, z - 0.3 * s, rnd(), rnd() * 6, 0, 1.4 * s, 1.3 * s, 1.4 * s), c2);
  P.crown.add(mtx(x - 0.7 * s, 3.9 * s, z + 0.4 * s, rnd(), rnd() * 6, 0, 1.2 * s, 1.1 * s, 1.2 * s), c1);
  colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6 });
};
const bush = (x, z, s = 1) => P.bush.add(mtx(x, 0.5 * s, z, rnd(), rnd() * 6, 0, s * 1.1, s * 0.8, s), pick(LEAF_COLORS));
const lamp = (x, z, ry) => {
  P.pole.add(mtx(x, 2.7, z, 0, 0, 0, 1, 5.4, 1)); P.pole.add(mtx(x, 0.25, z, 0, 0, 0, 2.2, 0.5, 2.2));
  const a = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z), at = (lx, ly, lz) => new THREE.Matrix4().multiplyMatrices(a, mtx(lx, ly, lz));
  P.arm.add(at(0.6, 5.4, 0)); P.lantern.add(at(1.2, 4.95, 0)); P.lampCap.add(at(1.2, 5.35, 0));
  colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 });
};
const bench = (x, z, ry) => {
  const a = new THREE.Matrix4().makeRotationY(ry).setPosition(x, 0, z), at = (lx, ly, lz) => new THREE.Matrix4().multiplyMatrices(a, mtx(lx, ly, lz));
  P.benchSeat.add(at(0, 0.5, 0)); P.benchBack.add(at(0, 0.85, -0.28)); P.benchLeg.add(at(-0.9, 0.25, 0)); P.benchLeg.add(at(0.9, 0.25, 0));
};

// pâtés de maisons
const PLAZA = { x: 25, z: -25 };
for (let i = 0; i < LINES.length - 1; i++) for (let j = 0; j < LINES.length - 1; j++) {
  const x0 = LINES[i] + ROAD / 2, x1 = LINES[i + 1] - ROAD / 2, z0 = LINES[j] + ROAD / 2, z1 = LINES[j + 1] - ROAD / 2;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pav = TEX.pavers.clone(); pav.needsUpdate = true; pav.repeat.set((x1 - x0) / 4, (z1 - z0) / 4);
  const walk = shadowy(new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, 0.32, z1 - z0, 2, 0.1), std({ color: '#ffffff', map: pav })), false, true);
  walk.position.set(cx, 0.16, cz); scene.add(walk);
  for (let t = x0 + 6; t < x1 - 4; t += 16) { lamp(t, z0 + 1, Math.PI / 2); lamp(t + 8, z1 - 1, -Math.PI / 2); }
  if (cx === PLAZA.x && cz === PLAZA.z) continue;
  // jardin intérieur
  const g = shadowy(new THREE.Mesh(new RoundedBoxGeometry(x1 - x0 - 6, 0.12, z1 - z0 - 24, 2, 0.05), M.grass), false, true); g.position.set(cx, 0.36, cz); scene.add(g);
  for (let k = 0; k < 5; k++) bush(x0 + 5 + rnd() * (x1 - x0 - 10), cz + (rnd() - .5) * (z1 - z0 - 28), 0.8 + rnd() * 0.7);
  if (rnd() < 0.8) tree(cx + (rnd() - .5) * 14, cz + (rnd() - .5) * 6, 1 + rnd() * 0.3);
  // maisons côté rue
  const inset = 2.4;
  const row = (fx, fz, dx, dz, len, face) => {
    let t = 0.6;
    while (t < len) {
      const w = 6 + rnd() * 4; if (t + w > len) break;
      const d = 7 + rnd() * 2.5, h = 4.6 + rnd() * 4.4, along = t + w / 2;
      addHouse(fx + dx * along - Math.sin(face) * (d / 2), fz + dz * along - Math.cos(face) * (d / 2), w, d, h, face);
      t += w + 0.25 + rnd() * 0.6;
    }
  };
  row(x0 + inset, z1 - inset, 1, 0, x1 - x0 - inset * 2, 0);
  row(x0 + inset, z0 + inset, 1, 0, x1 - x0 - inset * 2, Math.PI);
  for (let t = x0 + 4; t < x1 - 3; t += 9) { if (rnd() < 0.7) tree(t + rnd() * 2, z0 + 1.1, 0.75 + rnd() * 0.25); if (rnd() < 0.7) tree(t + rnd() * 2, z1 - 1.1, 0.75 + rnd() * 0.25); }
  if (rnd() < 0.6) bench(cx + 6, z1 - 1.3, Math.PI);
  if (rnd() < 0.5) P.bin.add(mtx(cx - 6, 0.82, z0 + 1.2));
}
// panneaux aux carrefours
for (const x of LINES) for (const z of LINES) if (rnd() < 0.5) {
  const sx = x + 6.2, sz = z + 6.2;
  P.pole.add(mtx(sx, 1.5, sz, 0, 0, 0, 0.7, 3, 0.7)); P.sign.add(mtx(sx, 3.1, sz, 0, -Math.PI / 4, 0)); P.signIn.add(mtx(sx + 0.03, 3.1, sz + 0.03, 0, -Math.PI / 4, 0));
}

/* Place de la Fontaine */
{
  const { x, z } = PLAZA;
  const ringTex = TEX.pavers.clone(); ringTex.needsUpdate = true; ringTex.repeat.set(8, 8);
  const ring = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 0.06, 64), std({ color: '#e9dcc4', map: ringTex })), false, true); ring.position.set(x, 0.34, z); scene.add(ring);
  const add = (geo, m, px, py, pz) => { const o = shadowy(new THREE.Mesh(geo, m)); o.position.set(px, py, pz); scene.add(o); return o; };
  add(new THREE.CylinderGeometry(6.2, 6.6, 1.0, 48), M.stone, x, 0.8, z);
  add(new THREE.TorusGeometry(6.2, 0.28, 10, 48).rotateX(Math.PI / 2), M.trim, x, 1.3, z);
  add(new THREE.CylinderGeometry(5.8, 5.8, 0.1, 48), M.water, x, 1.2, z).castShadow = false;
  add(new THREE.CylinderGeometry(0.7, 1.0, 3.2, 20), M.stone, x, 2.7, z);
  add(new THREE.CylinderGeometry(2.3, 1.3, 0.6, 32), M.stone, x, 4.3, z);
  add(new THREE.CylinderGeometry(2.1, 2.1, 0.08, 32), M.water, x, 4.62, z);
  add(new THREE.CylinderGeometry(0.35, 0.5, 1.4, 16), M.stone, x, 5.3, z);
  add(new THREE.SphereGeometry(0.45, 16, 12), M.trim, x, 6.2, z);
  colliders.push({ x0: x - 6.6, x1: x + 6.6, z0: z - 6.6, z1: z + 6.6, round: 6.8 });
  for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2 + 0.2; tree(x + Math.cos(ang) * 17.5, z + Math.sin(ang) * 17.5, 1.05); }
  for (let a = 0; a < 6; a++) { const ang = a / 6 * Math.PI * 2; bench(x + Math.cos(ang) * 11, z + Math.sin(ang) * 11, -ang - Math.PI / 2); }
  for (let a = 0; a < 24; a++) { const ang = a / 24 * Math.PI * 2; P.bollard.add(mtx(x + Math.cos(ang) * 16.2, 0.8, z + Math.sin(ang) * 16.2)); }
  for (let k = 0; k < 4; k++) { // terrasse de café
    const tx = x - 9 + k * 6, tz = z - 12;
    P.tableTop.add(mtx(tx, 1.15, tz)); P.tableLeg.add(mtx(tx, 0.75, tz)); P.umbrellaPole.add(mtx(tx, 1.9, tz)); P.umbrella.add(mtx(tx, 3.2, tz));
    for (const [cx, r] of [[0.9, -Math.PI / 2], [-0.9, Math.PI / 2]]) { P.chair.add(mtx(tx + cx, 0.8, tz, 0, r)); P.chairBack.add(mtx(tx + cx * 1.25, 1.05, tz, 0, r)); }
  }
}
const fountain = (() => {
  const n = 160, m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 6), M.water, n), data = [];
  for (let i = 0; i < n; i++) data.push({ t: Math.random(), a: Math.random() * Math.PI * 2, s: 0.7 + Math.random() * 0.6, up: Math.random() < 0.4 });
  scene.add(m); return { m, data };
})();

// assemblage : murs et toits fusionnés, éléments instanciés
scene.add(shadowy(new THREE.Mesh(merge(wallParts), M.walls)));
scene.add(shadowy(new THREE.Mesh(merge(roofParts), M.roofs)));
Object.values(P).forEach(p => p.build());

/* Objets à renverser : cônes et caisses en bois */
const props = [];
{
  const coneG = new THREE.ConeGeometry(0.5, 1.4, 16), bandG = new THREE.CylinderGeometry(0.3, 0.37, 0.24, 16), baseG = new RoundedBoxGeometry(1.15, 0.14, 1.15, 2, 0.05), crateG = new RoundedBoxGeometry(1.6, 1.6, 1.6, 2, 0.08);
  const cone = (x, z) => { const g = new THREE.Group(); const a = shadowy(new THREE.Mesh(coneG, M.cone)); a.position.y = 0.84; const b = shadowy(new THREE.Mesh(bandG, M.white)); b.position.y = 0.9; const c = shadowy(new THREE.Mesh(baseG, M.cone)); c.position.y = 0.07; g.add(a, b, c); g.position.set(x, 0.32, z); scene.add(g); props.push({ g, r: 1.4, k: 1 }); };
  const crate = (x, y, z) => { const g = new THREE.Group(); const m = shadowy(new THREE.Mesh(crateG, M.wood)); m.position.y = 0.8; g.add(m); g.position.set(x, y, z); g.rotation.y = rnd() * 0.4; scene.add(g); props.push({ g, r: 1.7, k: 0.6 }); };
  for (let k = 0; k < 7; k++) cone(44 + k * 3.2, -2.5);
  for (let k = 0; k < 5; k++) cone(-2.5, 20 + k * 3.5);
  for (let a = 0; a < 10; a++) { const ang = a / 10 * Math.PI * 2; cone(PLAZA.x + Math.cos(ang) * 9, PLAZA.z + Math.sin(ang) * 9); }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3 - r; c++) crate(-30 + c * 1.7 + r * 0.85, 0.32 + r * 1.6, 2.5); // pyramide de caisses
  props.forEach(p => { p.v = new THREE.Vector3(); p.w = new THREE.Vector3(); p.still = true; });
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

/* ---------- Conduite (arcade) ---------- */
const keys = { up: false, down: false, left: false, right: false, brake: false };
const KMAP = { ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake' };
const kbd = Object.fromEntries([...document.querySelectorAll('.keys kbd')].map(k => [k.dataset.k, k]));
const setKey = (k, v) => { if (!(k in keys)) return; keys[k] = v; kbd[k] && kbd[k].classList.toggle('on', v); };
addEventListener('keydown', e => { const k = KMAP[e.code]; if (k) { setKey(k, true); e.preventDefault(); } if (e.code === 'KeyR') resetCar(); });
addEventListener('keyup', e => { const k = KMAP[e.code]; if (k) setKey(k, false); });
document.querySelectorAll('.touch button').forEach(b => {
  const on = e => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); setKey(b.dataset.k, true); };
  const off = () => { b.classList.remove('on'); setKey(b.dataset.k, false); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
const START = { x: 25, z: 0, h: 0 };
const state = { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0, bounce: 0 };
const MAX = 34, REV = -12, ACC = 16, BRAKE = 34, DRAG = 0.35, CAR_R = 3.1;
function resetCar() { Object.assign(state, { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0 }); }
let shake = 0; const bump = () => { shake = Math.min(1, shake + 0.6); };
function collide() {
  for (const c of colliders) {
    if (c.round) {
      const dx = state.x - (c.x0 + c.x1) / 2, dz = state.z - (c.z0 + c.z1) / 2, d = Math.hypot(dx, dz), min = c.round + CAR_R * 0.8;
      if (d < min) { state.x += dx / d * (min - d); state.z += dz / d * (min - d); state.speed *= 0.5; bump(); }
      continue;
    }
    const nx = Math.max(c.x0, Math.min(state.x, c.x1)), nz = Math.max(c.z0, Math.min(state.z, c.z1));
    const dx = state.x - nx, dz = state.z - nz, d = Math.hypot(dx, dz), r = CAR_R * 0.75;
    if (d < r) { if (d > 1e-4) { state.x += dx / d * (r - d); state.z += dz / d * (r - d); } else state.x += r; state.speed *= -0.25; bump(); }
  }
  state.x = Math.max(-WORLD + 3, Math.min(WORLD - 3, state.x)); state.z = Math.max(-WORLD + 3, Math.min(WORLD - 3, state.z));
}

/* Poussière */
const dust = (() => {
  const n = 80, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: '#f1e5d0', roughness: 1, transparent: true, opacity: 0.7 }), n);
  const items = [...Array(n)].map(() => ({ life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  scene.add(m); return { m, items, i: 0 };
})();
function puff(x, z, vx, vz) { const d = dust.items[dust.i = (dust.i + 1) % dust.items.length]; d.life = 0; d.p.set(x, 0.5, z); d.v.set(vx + (Math.random() - .5), 0.8 + Math.random(), vz + (Math.random() - .5)); d.s = 0.4 + Math.random() * 0.5; }

/* ---------- Grand panneau de bienvenue ---------- */
const signboard = new THREE.Group(); scene.add(signboard);
{
  const W = 11, H = 6.4, sx = 43, sz = -10, ry = -1.15, POST = 5.6;
  const wood = std({ color: '#3a302a', roughness: 0.7 });
  const board = document.createElement('canvas'); board.width = 2200; board.height = Math.round(2200 * H / W);
  const tex = new THREE.CanvasTexture(board); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const draw = () => {
    const g = board.getContext('2d'), w = board.width, h = board.height, F = '"Bricolage Grotesque", "Helvetica Neue", Arial, sans-serif', MONO = '"DM Mono", ui-monospace, monospace';
    g.fillStyle = '#f3ede2'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.strokeStyle = '#2b2522'; g.lineWidth = 6; g.strokeRect(60, 60, w - 120, h - 120);
    const pad = 150;
    g.fillStyle = '#7a1f2b'; g.font = `500 46px ${MONO}`; g.textBaseline = 'alphabetic'; g.fillText('ATELIER FOLIO  ·  PORTFOLIOS À PERSONNALISER', pad, pad + 40);
    g.fillStyle = '#211c19'; g.font = `800 230px ${F}`; g.fillText('Bienvenue.', pad - 8, pad + 300);
    g.font = `500 72px ${F}`; g.fillStyle = '#3b3430';
    const lines = ['Des portfolios animés, prêts à recevoir vos infos.', 'Chaque quartier de la ville présente un modèle :', 'prenez le volant et allez les visiter.'];
    lines.forEach((l, i) => g.fillText(l, pad, pad + 470 + i * 96));
    g.fillStyle = '#211c19'; g.fillRect(pad, h - pad - 120, w - pad * 2, 3);
    g.font = `500 50px ${MONO}`; g.fillStyle = '#211c19';
    g.fillText(isTouch ? 'BOUTONS EN BAS : CONDUIRE   ·   GLISSER UN DOIGT : REGARDER' : '↑ ← ↓ →  CONDUIRE   ·   ESPACE  FREINER   ·   GLISSER  REGARDER', pad, h - pad - 30);
    tex.needsUpdate = true;
  };
  draw(); if (document.fonts) document.fonts.load('800 100px "Bricolage Grotesque"').then(() => document.fonts.load('500 40px "DM Mono"')).then(draw).catch(() => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), std({ map: tex, roughness: 0.85 })); face.position.set(0, POST + H / 2, 0.16);
  const back = shadowy(new THREE.Mesh(new RoundedBoxGeometry(W + 0.6, H + 0.6, 0.28, 3, 0.12), wood)); back.position.set(0, POST + H / 2, 0);
  const cap = shadowy(new THREE.Mesh(new RoundedBoxGeometry(W + 1.2, 0.3, 0.7, 2, 0.1), wood)); cap.position.set(0, POST + H + 0.45, 0);
  signboard.add(face, back, cap);
  for (const px of [-W / 2 + 1, W / 2 - 1]) { const post = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.5, POST + 0.4, 0.5, 2, 0.08), wood)); post.position.set(px, (POST + 0.4) / 2, 0); signboard.add(post); }
  for (const px of [-W / 2 + 2.4, 0, W / 2 - 2.4]) { const spot = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 4, 8).rotateX(Math.PI / 2), M.lantern); spot.position.set(px, POST + H + 0.45, 0.55); signboard.add(spot); }
  signboard.position.set(sx, 0, sz); signboard.rotation.y = ry; signboard.scale.setScalar(0.001);
  for (const px of [-W / 2 + 1, W / 2 - 1]) { const k = px * 1.15, cx = sx + Math.cos(ry) * k, cz = sz - Math.sin(ry) * k; colliders.push({ x0: cx - 0.5, x1: cx + 0.5, z0: cz - 0.5, z1: cz + 0.5 }); }
}
let signT = -1, welcomeK = 1;
const SIGN_CENTER = new THREE.Vector3(43, 7, -10); // animation d'apparition du panneau

/* ---------- Interface ---------- */
const hint = $('hint'), speedo = $('speedo'), kmh = $('kmh'), touchUI = $('touch'), wipe = $('wipe');

/* ---------- Caméra libre autour de la voiture (glisser pour regarder) ---------- */
const cam = { yaw: Math.PI - 0.22, pitch: 0.5, dist: 19 }; // derrière la voiture, dans l'axe de la rue
cam.tYaw = cam.yaw; cam.tPitch = cam.pitch;
let drag = null;
const isUI = t => t && t.closest && t.closest('button, a, .touch');
const look0 = (x, y, id) => { drag = { x, y, id }; document.body.classList.add('grabbing'); };
const lookMove = (x, y) => { const dx = x - drag.x, dy = y - drag.y; drag.x = x; drag.y = y; cam.tYaw += dx * 0.006; cam.tPitch = Math.max(0.08, Math.min(1.45, cam.tPitch + dy * 0.005)); };
const lookEnd = () => { drag = null; document.body.classList.remove('grabbing'); };
// souris / stylet
addEventListener('pointerdown', e => { if (e.pointerType === 'touch' || isUI(e.target)) return; look0(e.clientX, e.clientY, 'm'); });
addEventListener('pointermove', e => { if (drag && drag.id === 'm') lookMove(e.clientX, e.clientY); });
addEventListener('pointerup', e => { if (drag && drag.id === 'm') lookEnd(); });
// doigts : un doigt posé hors des boutons fait tourner la caméra, même si un autre doigt conduit
addEventListener('touchstart', e => { for (const t of e.changedTouches) if (!drag && !isUI(t.target)) look0(t.clientX, t.clientY, t.identifier); }, { passive: true });
addEventListener('touchmove', e => { if (!drag) return; for (const t of e.changedTouches) if (t.identifier === drag.id) { lookMove(t.clientX, t.clientY); e.preventDefault(); } }, { passive: false });
const touchEnd = e => { if (!drag) return; for (const t of e.changedTouches) if (t.identifier === drag.id) lookEnd(); };
addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);

const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), follow = new THREE.Vector3(), look = new THREE.Vector3();
const intro = { t: 0, dur: reduce ? 0.01 : 3.8, done: false, started: false };
const INTRO_FROM = new THREE.Vector3(170, 170, 190), INTRO_LOOK = new THREE.Vector3(0, 0, 0);
camera.position.copy(INTRO_FROM); camera.lookAt(INTRO_LOOK);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- Rendu « jeu vidéo » : lueur, vignettage, grain ---------- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
if (!isTouch) composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.55, 0.88));
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = mix(c, c * vec3(1.02, 1.0, 0.97), 0.6);
      c = mix(vec3(dot(c, vec3(.299,.587,.114))), c, 0.9);
      float v = smoothstep(0.95, 0.35, length(vUv - .5)); c *= mix(0.82, 1.0, v);
      c += (h(vUv * 1000. + time) - .5) * 0.035;
      gl_FragColor = vec4(c, 1.); }`
});
composer.addPass(grade);

let driving = false;
function startDriving() {
  if (driving || !intro.done) return; driving = true;
  hint.classList.add('gone');
  wipe.classList.add('on'); setTimeout(() => wipe.classList.remove('on'), 160);
}
function introFinished() { speedo.classList.add('show'); touchUI.classList.add('show'); signT = 0; }
(() => {
  const loader = $('loader'), count = $('count'), bar = $('bar'), t0 = performance.now(), dur = reduce ? 10 : 2000;
  const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); count.textContent = Math.round(e * 100); bar.style.width = e * 100 + '%';
    if (k < 1) requestAnimationFrame(step); else { loader.classList.add('open'); intro.started = true; setTimeout(() => loader.remove(), 1600); } };
  requestAnimationFrame(step);
})();

/* Quartiers */
const ZONES = [
  { x: 25, z: -25, r: 24, k: 'Quartier 01 · modèle à venir', t: 'Place de la Fontaine' },
  { x: -25, z: 25, r: 24, k: 'Quartier 02 · modèle à venir', t: 'Rue des Ateliers' },
  { x: -75, z: -75, r: 26, k: 'Quartier 03 · modèle à venir', t: 'Les Hauts' },
  { x: 75, z: 75, r: 26, k: 'Quartier 04 · modèle à venir', t: 'Le Port' }
];
const zoneEl = $('zone'), zoneK = $('zone-k'), zoneT = $('zone-t'); let curZone = null, zoneTimer = 0;
function updateZone() {
  if (!intro.done) return;
  const z = ZONES.find(z => Math.hypot(state.x - z.x, state.z - z.z) < z.r) || null;
  if (z === curZone) return; curZone = z; clearTimeout(zoneTimer);
  zoneEl.classList.remove('on'); zoneEl.classList.add('off');
  if (z) zoneTimer = setTimeout(() => { zoneK.textContent = z.k; zoneT.textContent = z.t; zoneEl.classList.remove('off'); void zoneEl.offsetWidth; zoneEl.classList.add('on'); }, 350);
}

/* ---------- Boucle principale ---------- */
const clock = new THREE.Clock(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), Om = new THREE.Object3D();
function tick() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 1 / 30);
  if (intro.done && !driving && Object.values(keys).some(Boolean)) startDriving();

  // voiture
  if (intro.done) {
    const throttle = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    if (throttle > 0) state.speed += ACC * dt * (state.speed < 0 ? 2.2 : 1);
    else if (throttle < 0) state.speed -= (state.speed > 0 ? BRAKE : ACC * 0.8) * dt;
    if (keys.brake) state.speed *= Math.pow(0.04, dt);
    state.speed -= state.speed * DRAG * dt; if (!throttle && Math.abs(state.speed) < 0.3) state.speed = 0;
    state.speed = Math.max(REV, Math.min(MAX, state.speed));
    const steerIn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    state.steer += (steerIn * 0.55 - state.steer) * Math.min(1, dt * 7);
    const grip = Math.min(1, Math.abs(state.speed) / 8);
    state.heading += state.steer * grip * Math.sign(state.speed) * dt * 2.2 * (1 - Math.abs(state.speed) / MAX * 0.35);
    state.x += Math.cos(state.heading) * state.speed * dt; state.z -= Math.sin(state.heading) * state.speed * dt;
    collide();
  }
  car.position.set(state.x, 0, state.z); car.rotation.y = state.heading;
  const targetRoll = -state.steer * Math.min(1, Math.abs(state.speed) / MAX) * 0.22 * Math.sign(state.speed || 1);
  state.roll += (targetRoll - state.roll) * Math.min(1, dt * 4);
  const accelPitch = ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * 0.035 * (intro.done ? 1 : 0);
  state.pitch += (accelPitch - state.pitch) * Math.min(1, dt * 3);
  state.bounce += dt * (4 + Math.abs(state.speed) * 0.4);
  body.rotation.set(state.roll, 0, state.pitch);
  body.position.y = Math.sin(state.bounce) * 0.015 * (0.3 + Math.abs(state.speed) / MAX) + 0.02;
  state.wheelSpin -= state.speed * dt / (0.43 * 1.6);
  for (const w of wheels) { w.spin.rotation.z = state.wheelSpin; if (w.front) w.pivot.rotation.y = state.steer * 0.9; }

  // poussière
  if (intro.done && Math.abs(state.speed) > 6 && (keys.up || Math.abs(state.steer) > 0.3) && Math.random() < 0.6) {
    fwd.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
    for (const side of [-1, 1]) { tmp.set(-fwd.z, 0, fwd.x).multiplyScalar(side * 1.25); puff(state.x - fwd.x * 2 + tmp.x, state.z - fwd.z * 2 + tmp.z, -fwd.x * 2, -fwd.z * 2); }
  }
  dust.items.forEach((d, i) => {
    if (d.life < 1) { d.life += dt * 1.2; d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(0.96); }
    const s = d.life < 1 ? d.s * (0.6 + d.life * 1.4) * (1 - d.life) : 0;
    Om.position.copy(d.p); Om.rotation.set(0, 0, 0); Om.scale.setScalar(s); Om.updateMatrix(); dust.m.setMatrixAt(i, Om.matrix);
  });
  dust.m.instanceMatrix.needsUpdate = true;

  // objets renversables
  for (const c of props) {
    const dx = c.g.position.x - state.x, dz = c.g.position.z - state.z, d = Math.hypot(dx, dz);
    if (d < c.r + 1.6 && Math.abs(state.speed) > 2 && c.g.position.y < 4) {
      const k = Math.abs(state.speed) * 0.7 * c.k;
      c.v.set(dx / d * k + Math.cos(state.heading) * state.speed * 0.4 * c.k, (4 + Math.abs(state.speed) * 0.25) * c.k, dz / d * k - Math.sin(state.heading) * state.speed * 0.4 * c.k);
      c.w.set((Math.random() - .5) * 10, (Math.random() - .5) * 6, (Math.random() - .5) * 10); c.still = false; if (c.k < 1) bump();
    }
    if (!c.still) {
      c.v.y -= 25 * dt; c.g.position.addScaledVector(c.v, dt);
      c.g.rotation.x += c.w.x * dt; c.g.rotation.y += c.w.y * dt; c.g.rotation.z += c.w.z * dt;
      if (c.g.position.y < 0.32) { c.g.position.y = 0.32; c.v.y *= -0.35; c.v.x *= 0.7; c.v.z *= 0.7; c.w.multiplyScalar(0.6);
        if (Math.abs(c.v.y) < 0.6 && Math.hypot(c.v.x, c.v.z) < 0.3) { c.still = true; c.g.rotation.x = Math.round(c.g.rotation.x / (Math.PI / 2)) * Math.PI / 2; c.g.rotation.z = Math.round(c.g.rotation.z / (Math.PI / 2)) * Math.PI / 2; } }
    }
  }

  // fontaine
  fountain.data.forEach((dr, i) => {
    dr.t += dt * 0.6 * dr.s; if (dr.t > 1) dr.t -= 1;
    const r = dr.up ? dr.t * 2.2 : dr.t * 3.6, y = dr.up ? 6.6 + Math.sin(dr.t * Math.PI) * 1.4 - dr.t * 2.2 : 4.7 + Math.sin(dr.t * Math.PI) * 0.6 - dr.t * 3.4;
    Om.position.set(PLAZA.x + Math.cos(dr.a) * r, Math.max(1.25, y), PLAZA.z + Math.sin(dr.a) * r); Om.scale.setScalar(1); Om.updateMatrix(); fountain.m.setMatrixAt(i, Om.matrix);
  });
  fountain.m.instanceMatrix.needsUpdate = true;

  // caméra : suit la voiture, orientable en glissant (sans s'éloigner)
  cam.yaw += (cam.tYaw - cam.yaw) * Math.min(1, dt * 6); cam.pitch += (cam.tPitch - cam.pitch) * Math.min(1, dt * 6);
  const portrait = camera.aspect < 0.8 ? 1.2 : 1; // écran en hauteur : on recule un peu pour voir la ville
  const speedK = Math.abs(state.speed) / MAX, dist = cam.dist * portrait * (1 + speedK * 0.15);
  follow.set(Math.cos(cam.pitch) * Math.cos(cam.yaw) * dist, Math.max(2.2, Math.sin(cam.pitch) * dist), Math.cos(cam.pitch) * Math.sin(cam.yaw) * dist).add(car.position);
  const lowK = 1 - Math.min(1, cam.pitch / 0.7); // caméra basse : on regarde plus haut, vers le ciel
  look.set(car.position.x, 1.5 + lowK * 10, car.position.z);
  // tant qu'on n'a pas démarré, on cadre la voiture ET le panneau de bienvenue
  welcomeK += ((driving ? 0 : 1) - welcomeK) * Math.min(1, dt * 1.5);
  look.lerp(SIGN_CENTER, welcomeK * (camera.aspect < 0.8 ? 0.36 : 0.18));
  if (intro.started && !intro.done) {
    intro.t += Math.min(rawDt, 0.1) / intro.dur; const e = ease(Math.min(1, intro.t));
    camPos.lerpVectors(INTRO_FROM, follow, e); camLook.lerpVectors(INTRO_LOOK, look, e);
    if (intro.t >= 1) { intro.done = true; introFinished(); }
  } else if (intro.done) { camPos.lerp(follow, Math.min(1, dt * 4)); camLook.lerp(look, Math.min(1, dt * 6)); }
  else { camPos.copy(INTRO_FROM); camLook.copy(INTRO_LOOK); }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * 0.6; camera.position.y += (Math.random() - .5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(camLook);
  camera.fov += ((34 + speedK * 6) - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
  skyMesh.position.copy(camera.position);
  sun.position.set(car.position.x + 45, 75, car.position.z + 35); sun.target.position.copy(car.position);

  // panneau : surgit avec un rebond à l'arrivée
  if (signT >= 0 && signT < 1) { signT = Math.min(1, signT + dt / 1.1); const k = signT, e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); signboard.scale.setScalar(Math.max(0.001, e) * 1.15); signboard.position.y = (1 - Math.min(1, k * 1.6)) * -3; }
  updateZone();
  kmh.textContent = Math.round(Math.abs(state.speed) * 3.2);
  grade.uniforms.time.value = (grade.uniforms.time.value + 1) % 1000;
  composer.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
window.__atelier = { state, resetCar, cam };
