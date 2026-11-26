// Intro du portfolio : une petite boutique dessinée, la caméra entre seule,
// fait un tour rapide, passe derrière le comptoir et plonge dans l'écran du PC.
// Ensuite tout se joue en HTML : la souris clique sur l'onglet du portfolio.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TARGET = '../index.html';
const $ = id => document.getElementById(id);
const canvas = $('shop'), veil = $('veil'), skipBtn = $('skip');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const LITE = matchMedia('(hover: none) and (pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 560;

let leaving = false;
function leave() {
  if (leaving) return; leaving = true;
  try { sessionStorage.setItem('ga-intro-vue', '1'); } catch (e) {}
  location.replace(TARGET);
}
skipBtn.addEventListener('click', leave);
addEventListener('keydown', e => { if (e.key === 'Escape') leave(); });
if (reduce) leave();

/* ---------- Rendu ---------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.body.insertAdjacentHTML('beforeend', '<div class="err"><p>Votre navigateur n’affiche pas la 3D.<br><a href="' + TARGET + '">Entrer sur le site →</a></p></div>');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const SKY = new THREE.Color('#2e2e33');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 22, 60);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 120);

// Petit hasard reproductible : la boutique est toujours la même
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const wait = ms => new Promise(r => setTimeout(r, ms));
// Les textures écrites (enseigne, affiches, écran) attendent les polices
await (document.fonts ? Promise.race([
  Promise.all(['500 20px "Inter Tight"', '600 20px "Inter Tight"', '400 20px "JetBrains Mono"'].map(f => document.fonts.load(f))), wait(2500),
]) : null);

/* ---------- Matières ---------- */
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...o });
const mat = {
  white: M('#f3f1ec'), wall: M('#efece6'), black: M('#1c1c1e', { roughness: 0.6 }), grey: M('#6c6c70'), darkGrey: M('#46464a'),
  steel: M('#2a2a2d', { roughness: 0.4, metalness: 0.5 }), green: M('#4d7a3c', { flatShading: true }), green2: M('#3c6630', { flatShading: true }),
  green3: M('#5f8f45', { flatShading: true }), pot: M('#ece9e2'), terracotta: M('#b86b4b'), oak: M('#c49a6c'),
  glass: new THREE.MeshStandardMaterial({ color: '#cfe0e4', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false }),
  glassCase: new THREE.MeshStandardMaterial({ color: '#e6f0f2', roughness: 0.05, transparent: true, opacity: 0.2, depthWrite: false }),
  bulb: new THREE.MeshBasicMaterial({ color: '#ffe3b8' }), panel: new THREE.MeshBasicMaterial({ color: '#fff4e2' }),
};
const lineMat = new THREE.LineBasicMaterial({ color: '#171615', transparent: true, opacity: 0.3 });
const lineDark = new THREE.LineBasicMaterial({ color: '#111', transparent: true, opacity: 0.85 });

// Textures dessinées à la main sur canvas
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const woodFloor = canvasTex(1024, 1024, (g, w, h) => {
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 400;
    while (x < w) {
      const len = 260 + rnd() * 320, l = 52 + rnd() * 9;
      g.fillStyle = `hsl(${30 + rnd() * 6}, ${38 + rnd() * 10}%, ${l}%)`; g.fillRect(x, r * rh, len, rh);
      g.globalAlpha = 0.12; g.strokeStyle = '#5a3a20';
      for (let k = 0; k < 6; k++) { const y = r * rh + rnd() * rh; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + len * .3, y + 4, x + len * .6, y - 4, x + len, y + rnd() * 4); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = 'rgba(60,38,20,.45)'; g.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    g.fillStyle = 'rgba(60,38,20,.4)'; g.fillRect(0, r * rh, w, 2);
  }
}, [3, 3]);
const woodDark = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#7a5537'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 64) { g.fillStyle = `hsl(26, 36%, ${30 + rnd() * 6}%)`; g.fillRect(x, 0, 64, h); g.fillStyle = 'rgba(30,18,8,.35)'; g.fillRect(x + 60, 0, 4, h); }
});
const paving = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#58585c'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = `hsl(240, 2%, ${33 + rnd() * 6}%)`; g.fillRect(x * 128 + 3, y * 128 + 3, 122, 122); }
}, [10, 3]);

function poster(kind) {
  return canvasTex(512, 720, (g, w, h) => {
    if (kind === 'mont') {
      g.fillStyle = '#efe7da'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#e2a56b'; g.beginPath(); g.arc(w * .68, h * .3, 70, 0, 7); g.fill();
      [['#3d4a5c', .62, .2], ['#56677c', .7, .45], ['#1f2833', .8, .7]].forEach(([c, b, p]) => {
        g.fillStyle = c; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * b);
        for (let i = 0; i <= 6; i++) g.lineTo(w * i / 6, h * (b - (i % 2 ? .12 + p * .05 : 0)));
        g.lineTo(w, h); g.fill();
      });
      g.fillStyle = '#1f2833'; g.font = '600 34px "Inter Tight"'; g.fillText('ALTITUDE', 36, 70);
    } else if (kind === 'menu') {
      g.fillStyle = '#18181a'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ededeb'; g.font = '600 44px "Inter Tight"'; g.fillText('NOUVEAUTÉS', 40, 90);
      g.fillStyle = 'rgba(237,237,235,.55)';
      for (let i = 0; i < 9; i++) { g.fillRect(40, 150 + i * 58, 200 + rnd() * 160, 10); g.fillRect(w - 110, 150 + i * 58, 70, 10); }
    } else if (kind === 'figure') {
      g.fillStyle = '#d9cfc0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#b8573c'; g.beginPath(); g.ellipse(w / 2, h * .36, 90, 110, 0, 0, 7); g.fill();
      g.fillStyle = '#20232b'; g.beginPath(); g.moveTo(w * .2, h); g.quadraticCurveTo(w / 2, h * .38, w * .8, h); g.fill();
      g.strokeStyle = '#20232b'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, h * .36, 150, 3.6, 5.8); g.stroke();
    } else {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#111'; g.lineWidth = 10; g.beginPath(); g.arc(w / 2, h * .42, 130, 0, 7); g.stroke();
      g.fillStyle = '#111'; g.font = '500 40px "Inter Tight"'; g.textAlign = 'center'; g.fillText('Gabriel Aillet', w / 2, h * .82);
      g.font = '400 22px "JetBrains Mono"'; g.fillText('PORTFOLIO · 2026', w / 2, h * .87);
    }
  });
}

/* ---------- Petits outils de construction ---------- */
function outline(mesh, m = lineMat) { mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 30), m)); return mesh; }
function box(w, h, d, material, x, y, z, o = {}) {
  const m = new THREE.Mesh(o.round ? new RoundedBoxGeometry(w, h, d, 2, o.round) : new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z); if (o.ry) m.rotation.y = o.ry;
  m.castShadow = o.cast !== false; m.receiveShadow = true;
  if (o.edges !== false && !o.round) outline(m, o.lines);
  (o.parent || scene).add(m); return m;
}
function cyl(rt, rb, h, material, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, o.seg || 24), material);
  m.position.set(x, y + h / 2, z); m.castShadow = o.cast !== false; m.receiveShadow = true;
  (o.parent || scene).add(m); return m;
}
function plane(w, h, material, x, y, z, ry = 0, parent = scene) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; parent.add(m); return m;
}
function plant(x, z, s = 1, potKind = 'black') {
  const g = new THREE.Group(); g.position.set(x, 0, z); scene.add(g);
  if (potKind === 'black') box(0.5 * s, 0.55 * s, 0.5 * s, mat.black, 0, 0, 0, { parent: g });
  else cyl(0.26 * s, 0.2 * s, 0.5 * s, potKind === 'white' ? mat.pot : mat.terracotta, 0, 0, 0, { parent: g });
  const top = 0.5 * s, greens = [mat.green, mat.green2, mat.green3];
  const n = 14 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const r = (0.13 + rnd() * 0.12) * s, a = rnd() * 6.28, d = rnd() * 0.24 * s;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), greens[i % 3]);
    leaf.position.set(Math.cos(a) * d, top + 0.14 * s + rnd() * 0.5 * s, Math.sin(a) * d);
    leaf.rotation.set(rnd() * 3, rnd() * 3, 0); leaf.castShadow = true; g.add(leaf);
  }
  return g;
}
function tree(x, z, s = 1) {
  const g = plant(x, z, s, 'black');
  cyl(0.035 * s, 0.05 * s, 1.3 * s, mat.oak, 0, 0.5 * s, 0, { parent: g, seg: 8 });
  for (let i = 0; i < 30; i++) {
    const r = (0.17 + rnd() * 0.14) * s, a = rnd() * 6.28, d = rnd() * 0.5 * s;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), [mat.green, mat.green2, mat.green3][i % 3]);
    leaf.position.set(Math.cos(a) * d, 1.6 * s + rnd() * 0.9 * s, Math.sin(a) * d); leaf.castShadow = true; g.add(leaf);
  }
}
function frame(tex, w, h, x, y, z, ry) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
  box(w + 0.08, h + 0.08, 0.04, mat.black, 0, -(h + 0.08) / 2, 0, { parent: g, cast: false });
  plane(w, h, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, 0, 0.022, 0, g);
}

/* ---------- La boutique ----------
   Pièce : x de -7 à 7, z de -12 (fond) à 0 (vitrine), hauteur 3.6 */
const W = 7, D = -12, HT = 3.6;
// Sol, plafond, murs
const floor = plane(14, 12, new THREE.MeshStandardMaterial({ map: woodFloor, roughness: 0.7 }), 0, 0, -6); floor.rotation.x = -Math.PI / 2;
const ceil = plane(14, 12, M('#f3f1ec', { emissive: '#d9d3c8', emissiveIntensity: 0.55 }), 0, HT, -6); ceil.rotation.x = Math.PI / 2;
box(14.4, HT, 0.2, mat.wall, 0, 0, D - 0.1, { edges: false, cast: false });
box(0.2, HT, 12, mat.wall, -W - 0.1, 0, -6, { edges: false, cast: false });
box(0.2, HT, 12, mat.wall, W + 0.1, 0, -6, { edges: false, cast: false });
// Plinthes noires
box(14, 0.08, 0.03, mat.black, 0, 0, D + 0.015, { edges: false, cast: false });
box(0.03, 0.08, 12, mat.black, -W + 0.015, 0, -6, { edges: false, cast: false });
box(0.03, 0.08, 12, mat.black, W - 0.015, 0, -6, { edges: false, cast: false });
// Spots encastrés
for (let x = -4.5; x <= 4.5; x += 3) for (let z = -2.5; z >= -10.5; z -= 4) {
  const s = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), mat.panel); s.rotation.x = Math.PI / 2; s.position.set(x, HT - 0.005, z); scene.add(s);
}

// Façade : bâtiment gris, grande vitrine à montants noirs, enseigne
const facade = new THREE.Group(); scene.add(facade);
box(0.6, 7, 0.4, mat.grey, -W - 0.3, 0, 0.05, { parent: facade });
box(0.6, 7, 0.4, mat.grey, W + 0.3, 0, 0.05, { parent: facade });
box(15.2, 3.7, 0.4, mat.grey, 0, 3.3, 0.05, { parent: facade });
box(15.2, 0.12, 0.5, mat.darkGrey, 0, 3.3, 0.1, { parent: facade });
box(15.2, 0.12, 0.5, mat.darkGrey, 0, 6.88, 0.1, { parent: facade });
for (const x of [-4.6, -1.6, 1.6, 4.6]) { // fenêtres d'étage, allumées
  box(2, 1.7, 0.1, mat.black, x, 4.4, 0.26, { parent: facade });
  plane(1.8, 1.5, new THREE.MeshBasicMaterial({ color: x === 1.6 ? '#f2c98a' : '#2b2c33' }), x, 5.25, 0.315, 0, facade);
}
// Enseigne
const sign = canvasTex(1024, 128, (g, w, h) => {
  g.fillStyle = '#141416'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f3efe6'; g.lineWidth = 7; g.beginPath(); g.arc(70, h / 2, 30, 0, 7); g.stroke();
  g.fillStyle = '#f3efe6'; g.font = '600 64px "Inter Tight"'; g.textBaseline = 'middle'; g.fillText('GABRIEL AILLET', 130, h / 2 + 3);
  g.fillStyle = 'rgba(243,239,230,.6)'; g.font = '400 26px "JetBrains Mono"'; g.textAlign = 'right'; g.fillText('PORTFOLIO', w - 40, h / 2 + 2);
});
box(7.2, 0.62, 0.12, mat.black, 0, 3.42, 0.32, { parent: facade, lines: lineDark });
plane(7, 0.58, new THREE.MeshBasicMaterial({ map: sign }), 0, 3.73, 0.385, 0, facade);
// Vitrine : montants, imposte, vitres, portes coulissantes
box(14, 0.12, 0.16, mat.black, 0, 0, 0, { lines: lineDark });
box(14, 0.14, 0.16, mat.black, 0, 2.86, 0, { lines: lineDark });
box(14.4, 0.32, 0.36, mat.darkGrey, 0, 2.99, 0.02, { edges: false }); // linteau : plus de jour entre la vitrine et la façade
box(14, 0.06, 0.12, mat.black, 0, 2.5, 0, { lines: lineDark });
for (const x of [-6.93, -4.4, -1.15, 1.15, 4.4, 6.93]) box(0.14, 3, 0.18, mat.black, x, 0, 0, { lines: lineDark });
for (const [a, b] of [[-6.86, -4.47], [-4.33, -1.22], [1.22, 4.33], [4.47, 6.86]]) {
  plane(b - a, 2.38, mat.glass, (a + b) / 2, 1.31, 0).renderOrder = 2;
}
plane(2.16, 0.3, mat.glass, 0, 2.68, 0).renderOrder = 2;
const doors = [-1, 1].map(s => {
  const g = new THREE.Group(); g.position.set(s * 0.54, 0, 0.12); scene.add(g);
  box(1.08, 0.06, 0.06, mat.black, 0, 0.12, 0, { parent: g, lines: lineDark }); box(1.08, 0.06, 0.06, mat.black, 0, 2.38, 0, { parent: g, lines: lineDark });
  box(0.06, 2.32, 0.06, mat.black, -0.51, 0.12, 0, { parent: g, lines: lineDark }); box(0.06, 2.32, 0.06, mat.black, 0.51, 0.12, 0, { parent: g, lines: lineDark });
  plane(0.96, 2.2, mat.glass, 0, 1.27, 0, 0, g).renderOrder = 2;
  box(0.03, 0.5, 0.05, mat.steel, -s * 0.42, 1.0, 0.05, { parent: g, edges: false });
  return { g, s };
});
// Trottoir, rue, bacs à plantes de part et d'autre de l'entrée
const walk = plane(40, 6, new THREE.MeshStandardMaterial({ map: paving, roughness: 0.95 }), 0, 0.001, 3); walk.rotation.x = -Math.PI / 2;
const road = plane(120, 60, M('#2a2a2d'), 0, -0.12, 36); road.rotation.x = -Math.PI / 2;
box(40, 0.14, 0.3, M('#7a7a7e'), 0, -0.12, 6.1, { edges: false });
for (const s of [-1, 1]) {
  box(2.4, 0.5, 0.6, mat.black, s * 2.7, 0, 0.75, { lines: lineDark });
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + rnd() * 0.08, 0), [mat.green, mat.green2, mat.green3][i % 3]); l.position.set(s * 2.7 - 1 + i * 0.25, 0.6 + rnd() * 0.12, 0.75 + (rnd() - .5) * 0.25); l.castShadow = true; scene.add(l); }
}
// Bâtiments voisins
box(9, 9, 1, M('#3f3f44'), -12.1, 0, 0.3, { edges: false });
box(9, 7.5, 1, M('#4b4a4f'), 12.1, 0, 0.3, { edges: false });
for (const x of [-14, -10.5]) plane(1.6, 2.2, new THREE.MeshBasicMaterial({ color: x === -14 ? '#e7b979' : '#25262b' }), x, 4.6, 0.81);
// Lampadaire de rue
cyl(0.05, 0.07, 4.2, mat.black, 5.3, 0, 4.6, { seg: 10 });
box(0.9, 0.08, 0.2, mat.black, 4.9, 4.15, 4.6, { edges: false });
const streetBulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), mat.bulb); streetBulb.position.set(4.5, 4.08, 4.6); scene.add(streetBulb);

// Mur gauche : portant de vêtements
box(0.06, 2.4, 3.2, mat.white, -W + 0.03, 0.1, -4.6, { cast: false });
box(0.6, 0.06, 3.0, mat.white, -W + 0.32, 0.15, -4.6);
cyl(0.015, 0.015, 3, mat.steel, -W + 0.42, 1.7 - 1.5, -4.6, { seg: 8 }).rotation.x = Math.PI / 2; // la tringle, couchée le long du mur
for (const z of [-3.15, -6.05]) box(0.03, 0.03, 0.03, mat.steel, -W + 0.21, 1.685, z, { edges: false }), box(0.42, 0.02, 0.02, mat.steel, -W + 0.21, 1.69, z, { edges: false });
const cloth = ['#e9b8b5', '#2b2b2b', '#8aa7c4', '#d9d4cc', '#6f7a68', '#c9a27a', '#f2f0ea', '#3b4a63', '#b65f4a', '#9a9a96', '#e1c8a0', '#2f3b33'];
for (let i = 0; i < 12; i++) {
  const z = -3.3 - i * 0.23, h = 0.72 + rnd() * 0.25;
  box(0.5, h, 0.1, M(cloth[i], { roughness: 0.95 }), -W + 0.42, 1.68 - h, z, { round: 0.03 });
  box(0.36, 0.02, 0.02, mat.steel, -W + 0.42, 1.68, z, { edges: false, cast: false });
}
frame(poster('menu'), 0.9, 1.25, -W + 0.06, 2.95, -2.2, Math.PI / 2);
frame(poster('figure'), 1.1, 1.5, -W + 0.06, 2.6, -8.2, Math.PI / 2);
box(0.45, 1.2, 1.6, mat.white, -W + 0.23, 0, -8.2);
for (let i = 0; i < 6; i++) box(0.24, 0.16 + rnd() * 0.1, 0.18, M(cloth[(i * 5) % 12]), -W + 0.25, 1.2, -8.85 + i * 0.26);
plant(-6.3, -1.2, 1.1, 'white');

// Fond : étagère de produits, porte de réserve, affiches
const shelf = new THREE.Group(); shelf.position.set(0.4, 0, D + 0.25); scene.add(shelf);
box(3.6, 2.5, 0.04, mat.white, 0, 0, -0.23, { parent: shelf, cast: false }); // fond
for (const x of [-1.78, 1.78]) box(0.04, 2.5, 0.4, mat.white, x, 0, -0.05, { parent: shelf });
box(3.6, 0.04, 0.4, mat.white, 0, 2.46, -0.05, { parent: shelf }); box(3.52, 0.12, 0.38, mat.white, 0, 0, -0.05, { parent: shelf });
for (let r = 0; r < 4; r++) {
  const y = 0.45 + r * 0.52;
  box(3.52, 0.03, 0.38, mat.white, 0, y, -0.05, { parent: shelf });
  let x = -1.55;
  while (x < 1.3) {
    const w = 0.14 + rnd() * 0.2, h = 0.14 + rnd() * 0.26;
    if (rnd() < 0.3) cyl(w / 2.4, w / 2.4, h, M(cloth[Math.floor(rnd() * 12)]), x + w / 2, y + 0.03, -0.04, { parent: shelf, seg: 14 });
    else box(w, h, 0.22, M(cloth[Math.floor(rnd() * 12)]), x + w / 2, y + 0.03, -0.04, { parent: shelf });
    x += w + 0.05 + rnd() * 0.08;
  }
}
frame(poster('mont'), 1.1, 1.5, -3.4, 2.55, D + 0.03, 0);
plant(-2.2, D + 0.6, 1.2, 'white');
box(1.3, 2.5, 0.08, mat.black, -5.4, 0, D + 0.05, { lines: lineDark });
plane(1.16, 2.36, M('#2c2d33', { roughness: 0.3 }), -5.4, 1.25, D + 0.1);
frame(poster('logo'), 0.95, 1.3, 4.2, 2.45, D + 0.03, 0);
tree(6.2, D + 0.8, 1);

// Centre : vitrine en verre et table basse
const vcase = new THREE.Group(); vcase.position.set(-1.6, 0, -6.4); vcase.rotation.y = 0.12; scene.add(vcase);
box(1.9, 0.82, 0.8, mat.black, 0, 0, 0, { parent: vcase, lines: lineDark });
const glassBox = box(1.9, 0.55, 0.8, mat.glassCase, 0, 0.82, 0, { parent: vcase, cast: false, lines: lineDark }); glassBox.renderOrder = 2;
box(1.84, 0.02, 0.74, mat.white, 0, 1.08, 0, { parent: vcase, edges: false });
for (let i = 0; i < 5; i++) box(0.18, 0.06 + rnd() * 0.1, 0.18, M(cloth[(i * 3 + 1) % 12]), -0.7 + i * 0.35, 0.84, (rnd() - .5) * 0.3, { parent: vcase });
for (let i = 0; i < 4; i++) box(0.22, 0.05, 0.16, M(cloth[(i * 4 + 2) % 12]), -0.55 + i * 0.37, 1.1, (rnd() - .5) * 0.3, { parent: vcase });
const low = new THREE.Group(); low.position.set(-3.9, 0, -6.2); scene.add(low);
box(1.66, 0.62, 0.66, mat.white, 0, 0, 0, { parent: low });
box(1.72, 0.07, 0.72, M('#8f6142', { roughness: 0.6 }), 0, 0.625, 0, { parent: low }); // plateau en bois uni : plus de rayures qui scintillent
for (let i = 0; i < 4; i++) box(0.28, 0.04 + i * 0.02, 0.36, M(cloth[(i * 2 + 3) % 12]), -0.55 + i * 0.36, 0.7, 0, { parent: low });
plant(-4.95, -1.7, 1.15); plant(-4.15, -1.0, 0.95);

// Devant à droite : table en bois et chaises, suspensions
const oakMat = M('#b88a5c', { roughness: 0.6 });
function chair(x, z, ry) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
  box(0.42, 0.04, 0.42, oakMat, 0, 0.44, 0, { parent: g });
  box(0.42, 0.42, 0.04, oakMat, 0, 0.5, -0.2, { parent: g });
  for (const [a, b] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) cyl(0.015, 0.015, 0.44, mat.black, a, 0, b, { parent: g, seg: 6 });
}
const table = new THREE.Group(); table.position.set(3.6, 0, -3.3); scene.add(table);
box(2.1, 0.05, 0.95, oakMat, 0, 0.72, 0, { parent: table });
for (const [a, b] of [[-0.95, -0.38], [0.95, -0.38], [-0.95, 0.38], [0.95, 0.38]]) box(0.05, 0.72, 0.05, mat.black, a, 0, b, { parent: table, edges: false });
box(0.32, 0.03, 0.24, mat.white, -0.4, 0.77, 0.1, { parent: table }); box(0.3, 0.02, 0.22, M('#c9a27a'), 0.35, 0.77, -0.1, { parent: table });
cyl(0.04, 0.035, 0.09, mat.white, 0.1, 0.77, 0.2, { parent: table, seg: 12 });
for (const s of [-1, 1]) for (const d of [-0.5, 0.5]) chair(3.6 + d * 1.25, -3.3 + s * 0.72, s > 0 ? Math.PI : 0);
for (const x of [3.0, 4.2]) {
  cyl(0.006, 0.006, 1.2, mat.black, x, HT - 1.2, -3.3, { seg: 4, cast: false });
  const shade = cyl(0.04, 0.22, 0.2, mat.black, x, HT - 1.4, -3.3, { cast: false });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), mat.bulb); b.position.set(x, HT - 1.42, -3.3); scene.add(b);
}
tree(6.3, -1.1, 0.9);

// Fond à droite : le point de vente, le PC tourné vers le vendeur
const C = { x: 3.2, z: -8.3 };
const counter = new THREE.Group(); counter.position.set(C.x, 0, C.z); scene.add(counter);
box(3.0, 0.98, 0.62, new THREE.MeshStandardMaterial({ map: woodDark, roughness: 0.7 }), 0, 0, 0.02, { parent: counter });
box(3.18, 0.05, 0.8, mat.white, 0, 0.98, -0.02, { parent: counter });
box(0.1, 0.98, 0.7, mat.white, -1.52, 0, 0, { parent: counter }); box(0.1, 0.98, 0.7, mat.white, 1.52, 0, 0, { parent: counter });
box(3.0, 0.06, 0.04, mat.black, 0, 0, 0.33, { parent: counter, edges: false });
// Moniteur : pied, bras, dalle. L'écran regarde vers le fond (-z), côté vendeur.
const TOP = 1.03;
box(0.26, 0.015, 0.2, mat.steel, 0, TOP, 0.05, { parent: counter, edges: false });
box(0.05, 0.3, 0.03, mat.steel, 0, TOP, 0.1, { parent: counter, edges: false });
const SW = 0.6, SH = 0.36;
box(SW + 0.03, SH + 0.03, 0.03, mat.black, 0, TOP + 0.13, 0.07, { parent: counter, lines: lineDark });
const scrCanvas = document.createElement('canvas'); scrCanvas.width = 1280; scrCanvas.height = 768;
const scrTex = new THREE.CanvasTexture(scrCanvas); scrTex.colorSpace = THREE.SRGBColorSpace; scrTex.anisotropy = 8;
const screen = plane(SW, SH, new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }), 0, TOP + 0.13 + (SH + 0.03) / 2, 0.07 - 0.0155, Math.PI, counter);
// Clavier, souris, terminal de paiement, sac
box(0.42, 0.02, 0.14, mat.white, -0.05, TOP, -0.22, { parent: counter });
const mouse = box(0.06, 0.025, 0.1, mat.white, 0.32, TOP, -0.22, { parent: counter, round: 0.012 });
box(0.4, 0.004, 0.3, mat.black, 0.32, TOP, -0.22, { parent: counter, edges: false, cast: false });
box(0.09, 0.04, 0.16, mat.black, -0.9, TOP, 0.05, { parent: counter, round: 0.01 });
box(0.24, 0.26, 0.1, M('#d9cdb8'), 1.1, TOP, 0.12, { parent: counter }); // petit sac kraft et ses anses
for (const dx of [-0.05, 0.05]) box(0.012, 0.06, 0.012, mat.black, 1.1 + dx, TOP + 0.26, 0.12, { parent: counter, edges: false, cast: false });
box(0.112, 0.012, 0.012, mat.black, 1.1, TOP + 0.32, 0.12, { parent: counter, edges: false, cast: false });
cyl(0.045, 0.04, 0.1, M('#b65f4a'), -0.6, TOP, -0.15, { parent: counter, seg: 12 });
// Tabouret du vendeur
cyl(0.2, 0.2, 0.05, mat.black, 3.9, 0.7, -9.3, { seg: 20 }); cyl(0.025, 0.025, 0.7, mat.steel, 3.9, 0, -9.3, { seg: 8 });
cyl(0.2, 0.22, 0.02, mat.steel, 3.9, 0, -9.3, { seg: 20 });

/* ---------- Lumière ---------- */
scene.add(new THREE.HemisphereLight('#fff7ec', '#8a6d52', 1.25));
const sun = new THREE.DirectionalLight('#fff2dd', 1.6);
sun.position.set(3, 9, 1); sun.target.position.set(-0.5, 0, -6.5); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(LITE ? 1024 : 2048, LITE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 22 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
// le plafond et les murs ne doivent pas faire d'ombre au soleil intérieur
const warm1 = new THREE.PointLight('#ffcf94', 6, 7, 1.6); warm1.position.set(3.6, 2.3, -3.3); scene.add(warm1);
const warm2 = new THREE.PointLight('#ffd9a8', 5, 8, 1.6); warm2.position.set(2.6, 2.8, -8.6); scene.add(warm2);
const facadeLight = new THREE.SpotLight('#ffe1b8', 40, 16, 0.7, 0.8, 1.5); facadeLight.position.set(0, 1.2, 9); facadeLight.target.position.set(0, 3.6, 0); scene.add(facadeLight, facadeLight.target);
const street = new THREE.PointLight('#ffc17a', 10, 10, 1.4); street.position.set(4.5, 3.9, 4.6); scene.add(street);

/* ---------- L'écran du PC : même dessin que la page HTML qui prendra le relais ---------- */
function drawScreen() {
  const g = scrCanvas.getContext('2d'), w = scrCanvas.width, h = scrCanvas.height, u = w / 100; // 1 cqw
  g.fillStyle = '#121214'; g.fillRect(0, 0, w, h);
  // Accueil du navigateur
  const cy = h / 2 + 3 * u;
  const lr = 3.5 * u, sh = 3.8 * u, gap = 2.4 * u, total = lr * 2 + gap + sh, top = cy - total / 2;
  g.strokeStyle = '#ededeb'; g.lineWidth = 0.35 * u; g.beginPath(); g.arc(w / 2, top + lr, lr - 0.175 * u, 0, 7); g.stroke();
  const sw = 38 * u, sy = top + lr * 2 + gap;
  g.fillStyle = '#1f1f23'; g.strokeStyle = '#2e2e34'; g.lineWidth = 2; rr(g, w / 2 - sw / 2, sy, sw, sh, sh / 2); g.fill(); g.stroke();
  g.fillStyle = '#6c6c73'; g.font = `400 ${1.15 * u}px "Inter Tight"`; g.textBaseline = 'middle'; g.fillText('Rechercher ou saisir une adresse', w / 2 - sw / 2 + 1.6 * u, sy + sh / 2);
  // Barre d'onglets
  const th = 5 * u, bh = 4.4 * u;
  g.fillStyle = '#1d1d20'; g.fillRect(0, 0, w, th);
  g.fillStyle = '#2b2b30'; g.fillRect(0, th, w, bh);
  let x = 1.2 * u;
  g.fillStyle = '#3a3a3f'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 0.45 * u, th / 2, 0.45 * u, 0, 7); g.fill(); x += 0.9 * u + 0.55 * u; }
  x += 1 * u - 0.55 * u + 0.4 * u;
  const tabH = th * 0.78;
  [['Nouvel onglet', true], ['Gabriel Aillet — Portfolio', false]].forEach(([t, on], i) => {
    if (on) { g.fillStyle = '#2b2b30'; rr(g, x, th - tabH, 19 * u, tabH + 2, 0.8 * u, true); g.fill(); }
    const fy = th - tabH / 2;
    if (i === 0) { g.fillStyle = '#4a4a52'; rr(g, x + 1.1 * u, fy - 0.6 * u, 1.2 * u, 1.2 * u, 3); g.fill(); }
    else { g.strokeStyle = '#9b9ba1'; g.lineWidth = 0.18 * u; g.beginPath(); g.arc(x + 1.7 * u, fy, 0.51 * u, 0, 7); g.stroke(); }
    g.fillStyle = on ? '#ededeb' : '#9b9ba1'; g.font = `500 ${1.15 * u}px "Inter Tight"`; g.fillText(t, x + 3 * u, fy + 1);
    x += 19 * u + 0.4 * u;
  });
  // Barre d'adresse
  g.fillStyle = '#6c6c73'; g.font = `400 ${1.3 * u}px "Inter Tight"`; g.fillText('←   →   ↻', 1.4 * u, th + bh / 2);
  const ux = 1.4 * u + 10 * u, uh = bh * 0.68;
  g.fillStyle = '#18181b'; rr(g, ux, th + (bh - uh) / 2, w - ux - 1.4 * u, uh, uh / 2); g.fill();
  g.fillStyle = '#9b9ba1'; g.font = `400 ${1.1 * u}px "JetBrains Mono"`; g.fillText('Rechercher ou saisir une adresse', ux + 1.3 * u, th + bh / 2);
  scrTex.needsUpdate = true;
}
function rr(g, x, y, w, h, r, topOnly) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  if (topOnly) { g.lineTo(x + w, y + h); g.lineTo(x, y + h); } else { g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); }
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

/* ---------- Trajet de la caméra ---------- */
scene.updateMatrixWorld(true);
const S = new THREE.Vector3(); screen.getWorldPosition(S);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const path = new THREE.CatmullRomCurve3([
  V(-3.6, 2.5, 12), V(-1.2, 1.95, 6.6), V(0, 1.7, 2.4), V(0, 1.66, -1.4), V(-0.4, 1.66, -3.3),
  V(0.5, 1.66, -5.1), V(2.6, 1.62, -6.2), V(5.4, 1.58, -7.4), V(4.7, 1.52, -9.6), V(S.x, S.y + 0.02, S.z - 0.62),
], false, 'centripetal');
const look = new THREE.CatmullRomCurve3([
  V(0, 1.7, 0), V(0, 1.5, -1), V(-0.6, 1.5, -6), V(-4, 1.5, -5.2), V(-6.5, 1.35, -5),
  V(-1, 1.4, -12), V(6, 1.3, -9.4), V(4.6, 1.4, -11), S.clone().add(V(0.1, 0.02, 0)), S.clone(),
], false, 'centripetal');
const T = 10.5; // durée du trajet (s)
const ease = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeCruise = k => 0.5 * ease(k) + 0.5 * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

function fit() {
  const a = innerWidth / innerHeight;
  camera.aspect = a; camera.fov = a < 0.8 ? 72 : a < 1.2 ? 62 : 52; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
}
addEventListener('resize', fit); fit();

/* ---------- Animation ---------- */
const pos = new THREE.Vector3(), tgt = new THREE.Vector3();
let t0 = null, phase = 'path', last = 0;
function frameAt(t) {
  const k = Math.min(t / T, 1), u = easeCruise(k);
  path.getPoint(u, pos); look.getPoint(u, tgt);
  // petit balancement de marche, qui s'éteint à l'approche de l'écran
  const walkAmp = 0.012 * Math.sin(Math.PI * Math.min(k * 1.15, 1));
  camera.position.copy(pos); camera.position.y += Math.sin(t * 7.5) * walkAmp;
  camera.lookAt(tgt);
  // les portes s'écartent quand on approche
  const o = THREE.MathUtils.smoothstep(7, 3.2, pos.z);
  for (const d of doors) d.g.position.x = d.s * (0.54 + o * 1.05);
  return k;
}
let paused = new URLSearchParams(location.search).has('pause');
function tick(now) {
  if (leaving) return;
  if (paused) { requestAnimationFrame(tick); return; }
  if (t0 === null) t0 = now;
  const t = (now - t0) / 1000;
  if (phase === 'path') {
    const k = frameAt(t);
    if (k >= 1) { phase = 'screen'; enterScreen(); }
  } else if (phase === 'screen') {
    // la caméra continue d'avancer doucement sous la page HTML
    const k = Math.min((t - T) / 1.2, 1), e = k * k;
    camera.position.lerpVectors(path.getPoint(1), S, e * 0.55);
    camera.lookAt(S);
    if (k >= 1) phase = 'done';
  }
  if (phase !== 'done') renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ---------- Dans l'écran : la page HTML prend le relais ---------- */
const pc = $('pc'), cursor = $('cursor'), ripple = $('ripple'), tab1 = $('tab1'), tab2 = $('tab2'), url = $('url'), page = $('page'), load = $('load'), chrome = $('chrome');
function screenRect() {
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const p = new THREE.Vector3(a * SW / 2, b * SH / 2, 0); screen.localToWorld(p); p.project(camera);
    return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight];
  });
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
async function enterScreen() {
  const r = screenRect();
  Object.assign(pc.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', borderRadius: '2px' });
  pc.classList.add('on'); pc.getBoundingClientRect();
  pc.classList.add('vis');
  await wait(280);
  pc.classList.add('grow'); pc.getBoundingClientRect();
  Object.assign(pc.style, { left: '0px', top: '0px', width: innerWidth + 'px', height: innerHeight + 'px', borderRadius: '0px' });
  await wait(1000);
  pc.classList.remove('grow'); Object.assign(pc.style, { width: '100%', height: '100%' });
  canvas.style.visibility = 'hidden';
  await clickTab();
}
async function clickTab() {
  const box = pc.getBoundingClientRect(), tb = tab2.getBoundingClientRect();
  const from = { x: box.width * 0.62, y: box.height * 0.72 }, to = { x: tb.left - box.left + tb.width * 0.42, y: tb.top - box.top + tb.height * 0.55 };
  cursor.style.opacity = '1';
  const move = cursor.animate([
    { transform: `translate(${from.x}px, ${from.y}px)` },
    { transform: `translate(${(from.x + to.x) / 2 + box.width * 0.05}px, ${(from.y + to.y) / 2 + box.height * 0.08}px)`, offset: 0.55 },
    { transform: `translate(${to.x}px, ${to.y}px)` },
  ], { duration: 1100, easing: 'cubic-bezier(.45,.05,.25,1)', fill: 'forwards' });
  cursor.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  await move.finished;
  await wait(180);
  // clic
  tab2.classList.add('press');
  cursor.animate([{ transform: `translate(${to.x}px, ${to.y}px) scale(1)` }, { transform: `translate(${to.x}px, ${to.y}px) scale(.82)` }, { transform: `translate(${to.x}px, ${to.y}px) scale(1)` }], { duration: 220, fill: 'forwards' });
  Object.assign(ripple.style, { left: to.x + 'px', top: to.y + 'px' }); ripple.classList.add('pop');
  await wait(140);
  tab2.classList.remove('press'); tab1.classList.remove('on'); tab2.classList.add('on');
  url.innerHTML = '<span>https://</span><b>gabyaillet.github.io</b><span>/port/</span>';
  page.classList.add('go'); load.classList.add('run');
  await wait(850);
  cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
  chrome.classList.add('up');
  await wait(720);
  leave();
}

/* ---------- Démarrage ---------- */
{
  drawScreen();
  frameAt(0); renderer.render(scene, camera);
  requestAnimationFrame(() => { veil.classList.add('off'); skipBtn.classList.add('show'); requestAnimationFrame(tick); });
}
window.__magasin = { camera, scene, T, jump: t => { t0 = performance.now() - t * 1000; paused = false; }, shot: t => { frameAt(t); renderer.render(scene, camera); }, play: () => { paused = false; } };
