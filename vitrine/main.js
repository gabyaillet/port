import * as THREE from 'three';

/* =========================================================
   Atelier Folio — mini-ville en 3D visitée en 2CV
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
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const SKY_TOP = new THREE.Color('#9cc7e0'), SKY_BOTTOM = new THREE.Color('#f6d9b3');
scene.fog = new THREE.Fog(SKY_BOTTOM, 120, 260);

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.5, 600);

/* Ciel en dégradé */
{
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, bottom: { value: SKY_BOTTOM } },
    vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ float t = smoothstep(-0.05, 0.55, h); gl_FragColor = vec4(mix(bottom, top, t), 1.); }'
  });
  const sky = new THREE.Mesh(geo, mat); sky.name = 'sky'; scene.add(sky);
}
const skyMesh = scene.getObjectByName('sky');

/* Lumières : soleil chaud de fin d'après-midi */
scene.add(new THREE.HemisphereLight('#fff4e0', '#b58c6a', 1.25));
const sun = new THREE.DirectionalLight('#ffe2b8', 2.4);
sun.position.set(40, 70, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
const SC = 60; Object.assign(sun.shadow.camera, { left: -SC, right: SC, top: SC, bottom: -SC, near: 1, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

/* ---------- Matériaux ---------- */
const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 });
const M = {
  grass: mat('#a9c98a'), road: mat('#4a4c52'), line: mat('#f4efe2'), walk: mat('#e4d8c4'), curb: mat('#cbbba3'),
  trunk: mat('#7a5638'), leaf: mat('#6fa35a'), leaf2: mat('#89b960'), lamp: mat('#2b2b2e'), glass: new THREE.MeshStandardMaterial({ color: '#2d3f52', roughness: 0.15, metalness: 0.3 }),
  frame: mat('#f7f1e6'), water: new THREE.MeshStandardMaterial({ color: '#7fb6d6', roughness: 0.1, metalness: 0.1 }), stone: mat('#d9ccb6'),
  cone: mat('#ef7d3c'), coneW: mat('#f7f1e6'), awning: mat('#c0392b'), awning2: mat('#2f6f8f')
};
const WALLS = ['#f2e3c6', '#e9a87c', '#a8c5da', '#b8d8be', '#f4c7a1', '#f7f3ea', '#e6b8b0', '#d8cfa8'].map(c => mat(c));
const ROOFS = ['#c4623f', '#5b6770', '#a4483a', '#6b5e57'].map(c => mat(c));

const shadowy = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };
const rnd = (() => { let s = 20240601; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const pick = a => a[Math.floor(rnd() * a.length)];

/* ---------- La ville ---------- */
const ROAD = 10, BLOCK = 40, STEP = ROAD + BLOCK;      // rues tous les 50 unités
const LINES = [-100, -50, 0, 50, 100];                  // axes des rues (x et z)
const WORLD = 125;
const colliders = [];                                    // boîtes { x0, x1, z0, z1 }

// sol (herbe) et rues
scene.add(shadowy(new THREE.Mesh(new THREE.PlaneGeometry(WORLD * 2.6, WORLD * 2.6).rotateX(-Math.PI / 2), M.grass), false, true));
for (const c of LINES) {
  const h = new THREE.Mesh(new THREE.BoxGeometry(WORLD * 2, 0.1, ROAD), M.road); h.position.set(0, 0.03, c); shadowy(h, false, true); scene.add(h);
  const v = new THREE.Mesh(new THREE.BoxGeometry(ROAD, 0.1, WORLD * 2), M.road); v.position.set(c, 0.031, 0); shadowy(v, false, true); scene.add(v);
}
// pointillés au milieu des rues (instanciés)
{
  const dash = new THREE.BoxGeometry(2.2, 0.02, 0.28), list = [];
  for (const c of LINES) for (let t = -WORLD; t < WORLD; t += 5) {
    if (LINES.some(o => Math.abs(t - o) < ROAD / 2 + 1)) continue;
    list.push([t, c, 0], [c, t, Math.PI / 2]);
  }
  const inst = new THREE.InstancedMesh(dash, M.line, list.length), o = new THREE.Object3D();
  list.forEach(([x, z, r], i) => { o.position.set(x, 0.09, z); o.rotation.set(0, r, 0); o.updateMatrix(); inst.setMatrixAt(i, o.matrix); });
  inst.receiveShadow = true; scene.add(inst);
}

// pools instanciés pour fenêtres, arbres et lampadaires
const windows = [], trees = [], lamps = [];

function house(x, z, w, d, h, face) {
  // face : direction de la rue (angle en radians) pour placer les fenêtres
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face;
  const wall = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pick(WALLS))); wall.position.y = h / 2; g.add(wall);
  if (rnd() < 0.72) {
    // toit à deux pans
    const rh = 1.5 + rnd() * 1.5, shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.5, 0); shape.lineTo(w / 2 + 0.5, 0); shape.lineTo(0, rh); shape.closePath();
    const roof = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: d + 0.8, bevelEnabled: false }), pick(ROOFS)));
    roof.position.set(0, h, -d / 2 - 0.4); g.add(roof);
    if (rnd() < 0.5) { const ch = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), M.curb)); ch.position.set(w * 0.25, h + rh * 0.6, d * 0.1); g.add(ch); }
  } else {
    const p = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.6, d + 0.3), M.curb)); p.position.y = h + 0.3; g.add(p);
  }
  // fenêtres sur la façade côté rue
  const floors = Math.max(1, Math.floor((h - 1.5) / 3)), cols = Math.max(1, Math.floor(w / 3));
  for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
    const lx = -w / 2 + (c + 0.5) * (w / cols), ly = 2.4 + f * 3;
    if (f === 0 && c === Math.floor(cols / 2)) { windows.push({ g, x: lx, y: 1.25, z: d / 2 + 0.06, sx: 1.4, sy: 2.5, door: true }); continue; }
    windows.push({ g, x: lx, y: ly, z: d / 2 + 0.06, sx: 1.2, sy: 1.6 });
  }
  // store (auvent) au rez-de-chaussée, parfois
  if (rnd() < 0.35) {
    const aw = shadowy(new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.2, 1.6), rnd() < 0.5 ? M.awning : M.awning2));
    aw.position.set(0, 3.1, d / 2 + 0.8); aw.rotation.x = 0.25; g.add(aw);
  }
  scene.add(g);
  // boîte de collision (dans le repère du monde)
  const c = Math.abs(Math.cos(face)) > 0.5, hw = (c ? w : d) / 2 + 0.3, hd = (c ? d : w) / 2 + 0.3;
  colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });
}

const cells = [];
for (let i = 0; i < LINES.length - 1; i++) for (let j = 0; j < LINES.length - 1; j++) cells.push([i, j]);
for (const [i, j] of cells) {
  const x0 = LINES[i] + ROAD / 2, x1 = LINES[i + 1] - ROAD / 2, z0 = LINES[j] + ROAD / 2, z1 = LINES[j + 1] - ROAD / 2;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  // trottoir
  const walk = shadowy(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.3, z1 - z0), M.walk), false, true); walk.position.set(cx, 0.15, cz); scene.add(walk);
  const isPlaza = i === 2 && j === 1; // la place centrale avec la fontaine
  if (isPlaza) continue;
  // maisons le long des quatre bords du pâté
  const inset = 2.2;
  const edge = (fromX, fromZ, dirX, dirZ, len, face) => {
    let t = 1.5;
    while (t < len - 7) {
      const w = 6 + rnd() * 5; if (t + w > len - 1.5) break;
      const d = 7 + rnd() * 3, h = 4 + rnd() * 5;
      const along = t + w / 2;
      const px = fromX + dirX * along - Math.sin(face) * (d / 2), pz = fromZ + dirZ * along - Math.cos(face) * (d / 2);
      house(px, pz, w, d, h, face);
      t += w + 0.4 + rnd() * 1.2;
    }
  };
  edge(x0 + inset, z1 - inset, 1, 0, x1 - x0 - inset * 2, 0);            // façade vers +z
  edge(x0 + inset, z0 + inset, 1, 0, x1 - x0 - inset * 2, Math.PI);      // façade vers -z
  // arbres sur le trottoir
  for (let k = 0; k < 4; k++) trees.push([x0 + 4 + rnd() * (x1 - x0 - 8), z0 + 1.2, 0.8 + rnd() * 0.4], [x0 + 4 + rnd() * (x1 - x0 - 8), z1 - 1.2, 0.8 + rnd() * 0.4]);
  // lampadaires aux coins
  lamps.push([x0 + 1, z0 + 1], [x1 - 1, z1 - 1]);
}

/* Place centrale : fontaine, bancs, arbres, cônes */
const PLAZA = { x: 25, z: -25 };
{
  const base = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.9, 40), M.stone)); base.position.set(PLAZA.x, 0.45, PLAZA.z); scene.add(base);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 0.2, 40), M.water); water.position.set(PLAZA.x, 0.85, PLAZA.z); water.receiveShadow = true; scene.add(water);
  const col = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 3.4, 16), M.stone)); col.position.set(PLAZA.x, 2.4, PLAZA.z); scene.add(col);
  const bowl = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(2, 1.1, 0.7, 24), M.stone)); bowl.position.set(PLAZA.x, 4.2, PLAZA.z); scene.add(bowl);
  colliders.push({ x0: PLAZA.x - 6.4, x1: PLAZA.x + 6.4, z0: PLAZA.z - 6.4, z1: PLAZA.z + 6.4, round: 6.6 });
  for (let a = 0; a < 8; a++) { const ang = a / 8 * Math.PI * 2; trees.push([PLAZA.x + Math.cos(ang) * 15, PLAZA.z + Math.sin(ang) * 15, 1.1]); }
}
const fountainDrops = (() => {
  const n = 120, geo = new THREE.SphereGeometry(0.09, 6, 6), m = new THREE.InstancedMesh(geo, M.water, n), data = [];
  for (let i = 0; i < n; i++) data.push({ t: Math.random(), a: Math.random() * Math.PI * 2, s: 0.8 + Math.random() * 0.6 });
  scene.add(m); return { m, data, o: new THREE.Object3D() };
})();

/* Arbres et lampadaires instanciés */
{
  const tg = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 8), cg = new THREE.IcosahedronGeometry(1.9, 0), cg2 = new THREE.IcosahedronGeometry(1.4, 0);
  const trunks = shadowy(new THREE.InstancedMesh(tg, M.trunk, trees.length)), crowns = shadowy(new THREE.InstancedMesh(cg, M.leaf, trees.length)), tops = shadowy(new THREE.InstancedMesh(cg2, M.leaf2, trees.length));
  const o = new THREE.Object3D();
  trees.forEach(([x, z, s], i) => {
    o.position.set(x, 1.2 * s + 0.3, z); o.scale.setScalar(s); o.rotation.set(0, 0, 0); o.updateMatrix(); trunks.setMatrixAt(i, o.matrix);
    o.position.set(x, 3.3 * s + 0.3, z); o.rotation.set(rnd(), rnd() * 6, 0); o.updateMatrix(); crowns.setMatrixAt(i, o.matrix);
    o.position.set(x + 0.4 * s, 4.6 * s + 0.3, z - 0.3 * s); o.updateMatrix(); tops.setMatrixAt(i, o.matrix);
    colliders.push({ x0: x - 0.6, x1: x + 0.6, z0: z - 0.6, z1: z + 0.6 });
  });
  scene.add(trunks, crowns, tops);
  const pg = new THREE.CylinderGeometry(0.12, 0.16, 5, 8), hg = new THREE.SphereGeometry(0.45, 12, 8);
  const poles = shadowy(new THREE.InstancedMesh(pg, M.lamp, lamps.length)), heads = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd98a', emissiveIntensity: 0.8 }), lamps.length);
  lamps.forEach(([x, z], i) => { o.rotation.set(0, 0, 0); o.scale.setScalar(1); o.position.set(x, 2.8, z); o.updateMatrix(); poles.setMatrixAt(i, o.matrix); o.position.set(x, 5.4, z); o.updateMatrix(); heads.setMatrixAt(i, o.matrix); colliders.push({ x0: x - 0.3, x1: x + 0.3, z0: z - 0.3, z1: z + 0.3 }); });
  scene.add(poles, heads);
}

/* Fenêtres instanciées (vitre + cadre) */
{
  const n = windows.length, frames = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.12), M.frame, n), panes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 0.82, 0.14), M.glass, n);
  const o = new THREE.Object3D(), mtx = new THREE.Matrix4();
  windows.forEach((w, i) => {
    w.g.updateMatrixWorld(true);
    o.position.set(w.x, w.y, w.z); o.scale.set(w.sx, w.sy, 1); o.rotation.set(0, 0, 0); o.updateMatrix();
    mtx.multiplyMatrices(w.g.matrixWorld, o.matrix); frames.setMatrixAt(i, mtx); panes.setMatrixAt(i, mtx);
  });
  scene.add(frames, panes);
}

/* Cônes de chantier qu'on peut renverser */
const cones = [];
{
  const g1 = new THREE.ConeGeometry(0.55, 1.5, 16), g2 = new THREE.CylinderGeometry(0.33, 0.4, 0.25, 16), gb = new THREE.BoxGeometry(1.2, 0.12, 1.2);
  const spots = [];
  for (let k = 0; k < 7; k++) spots.push([44 + k * 3.2, -2.5]);
  for (let k = 0; k < 5; k++) spots.push([-3, 20 + k * 3.5]);
  for (let a = 0; a < 10; a++) { const ang = a / 10 * Math.PI * 2; spots.push([PLAZA.x + Math.cos(ang) * 10, PLAZA.z + Math.sin(ang) * 10]); }
  for (const [x, z] of spots) {
    const c = new THREE.Group();
    const body = shadowy(new THREE.Mesh(g1, M.cone)); body.position.y = 0.85; c.add(body);
    const band = shadowy(new THREE.Mesh(g2, M.coneW)); band.position.y = 0.95; c.add(band);
    const base = shadowy(new THREE.Mesh(gb, M.cone)); base.position.y = 0.06; c.add(base);
    c.position.set(x, 0, z); scene.add(c);
    cones.push({ g: c, v: new THREE.Vector3(), w: new THREE.Vector3(), home: new THREE.Vector3(x, 0, z), still: true });
  }
}

/* ---------- La 2CV (Charleston bordeaux et noir) ---------- */
const car = new THREE.Group(), body = new THREE.Group(), wheels = [];
car.add(body); scene.add(car);
{
  const red = new THREE.MeshPhysicalMaterial({ color: '#7a1f2b', roughness: 0.32, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  const black = new THREE.MeshPhysicalMaterial({ color: '#16130f', roughness: 0.4, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const canvasTop = mat('#2a2622');
  const chrome = new THREE.MeshStandardMaterial({ color: '#e8e6e1', roughness: 0.15, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#2b3a44', roughness: 0.05, metalness: 0.2, transmission: 0, opacity: 0.85, transparent: true });
  const tire = mat('#1d1d1f'), hub = mat('#efe6d2');
  const lens = new THREE.MeshStandardMaterial({ color: '#fff6dc', emissive: '#ffe9a8', emissiveIntensity: 0.6, roughness: 0.2 });

  const W = 1.48; // largeur de la caisse
  // silhouette de profil : la forme bossue de la 2CV
  const p = new THREE.Shape();
  p.moveTo(-1.92, 0.42); p.lineTo(1.82, 0.42);
  p.quadraticCurveTo(1.97, 0.45, 1.96, 0.62);
  p.lineTo(1.9, 0.82);
  p.quadraticCurveTo(1.5, 0.98, 0.58, 1.04);                 // capot bombé
  p.lineTo(0.28, 1.5);                                        // pare-brise
  p.quadraticCurveTo(-0.3, 1.68, -0.95, 1.6);                 // toit arrondi
  p.quadraticCurveTo(-1.55, 1.5, -1.86, 0.98);                // arrière en goutte d'eau
  p.quadraticCurveTo(-1.98, 0.7, -1.92, 0.42);
  const ext = { depth: W, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 4, curveSegments: 18 };
  const shell = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(p, ext).translate(0, 0, -W / 2), red)); body.add(shell);

  // capot noir (bande Charleston)
  const hood = new THREE.Shape();
  hood.moveTo(1.93, 0.84); hood.quadraticCurveTo(1.5, 1.0, 0.56, 1.07); hood.lineTo(0.56, 0.86); hood.quadraticCurveTo(1.5, 0.78, 1.95, 0.6); hood.closePath();
  const hoodM = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(hood, { depth: W + 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 16 }).translate(0, 0.02, -W / 2 - 0.06), black)); body.add(hoodM);
  // nervures du capot
  for (let k = 0; k < 5; k++) { const rib = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.025, 0.03), black); rib.position.set(1.22, 1.035 - k * 0.0, -0.4 + k * 0.2); rib.rotation.z = -0.16; body.add(rib); }
  // capote en toile sur le toit
  const top = new THREE.Shape();
  top.moveTo(0.26, 1.5); top.quadraticCurveTo(-0.3, 1.69, -0.95, 1.61); top.quadraticCurveTo(-1.4, 1.55, -1.62, 1.36); top.lineTo(-1.5, 1.3); top.quadraticCurveTo(-1.2, 1.46, -0.95, 1.5); top.quadraticCurveTo(-0.3, 1.58, 0.3, 1.42); top.closePath();
  const topM = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(top, { depth: W - 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2, curveSegments: 16 }).translate(0, 0.03, -(W - 0.12) / 2), canvasTop)); body.add(topM);

  // vitres latérales et pare-brise
  const win = new THREE.Shape();
  win.moveTo(0.42, 1.1); win.lineTo(0.2, 1.43); win.quadraticCurveTo(-0.3, 1.55, -0.85, 1.5); win.quadraticCurveTo(-1.25, 1.44, -1.4, 1.2); win.lineTo(-1.35, 1.1); win.closePath();
  for (const s of [-1, 1]) { const wm = new THREE.Mesh(new THREE.ExtrudeGeometry(win, { depth: 0.02, bevelEnabled: false }), glass); wm.position.z = s > 0 ? W / 2 + 0.09 : -(W / 2 + 0.09) - 0.02; body.add(wm); }
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, W + 0.2), red); pillar.position.set(-0.32, 1.32, 0); body.add(pillar);
  const ws = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, W - 0.05), glass); ws.position.set(0.44, 1.28, 0); ws.rotation.z = 0.98; body.add(ws);

  // ailes avant et arrière (les fameuses « pontons »)
  const arch = (cx, r, len) => {
    const s = new THREE.Shape(); s.absarc(0, 0, r + 0.12, 0, Math.PI, false); s.lineTo(-r - 0.12 - len * 0.2, -0.02); s.lineTo(-r + 0.02, -0.02); s.absarc(0, 0, r - 0.02, Math.PI, 0, true); s.lineTo(r + 0.12, -0.02);
    return s;
  };
  for (const s of [-1, 1]) {
    const f = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(arch(0, 0.5, 1.6), { depth: 0.36, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 20 }), red));
    f.position.set(1.28, 0.48, s * (W / 2 - 0.02) - (s > 0 ? 0 : 0.36)); body.add(f);
    const r = shadowy(new THREE.Mesh(new THREE.ExtrudeGeometry(arch(0, 0.5, 0.5), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 20 }), red));
    r.position.set(-1.22, 0.48, s * (W / 2 - 0.04) - (s > 0 ? 0 : 0.3)); body.add(r);
    // marchepied entre les roues
    const step = shadowy(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.18), black)); step.position.set(0.03, 0.42, s * (W / 2 + 0.12)); body.add(step);
    // phares ronds sur les ailes
    const hl = new THREE.Group();
    const shellL = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(Math.PI / 2), chrome)); hl.add(shellL);
    const lensL = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateY(Math.PI / 2), lens); lensL.position.x = 0.005; hl.add(lensL);
    const stalk = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 8), chrome)); stalk.position.set(-0.1, -0.2, 0); hl.add(stalk);
    hl.position.set(1.78, 1.18, s * 0.6); body.add(hl);
    // rétroviseur
    const mir = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), chrome); mir.position.set(0.55, 1.2, s * (W / 2 + 0.18)); body.add(mir);
  }
  // calandre et pare-chocs chromés
  const grille = new THREE.Group();
  for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.78), chrome); b.position.y = k * 0.06; grille.add(b); }
  grille.position.set(1.98, 0.52, 0); body.add(grille);
  const chevron = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 3, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), chrome); chevron.position.set(2.0, 0.74, 0); body.add(chevron);
  for (const x of [2.04, -2.0]) { const b = shadowy(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, W + 0.2, 4, 10).rotateX(Math.PI / 2), chrome)); b.position.set(x, 0.46, 0); body.add(b); }
  // feux arrière
  for (const s of [-1, 1]) { const tl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: '#c0392b', emissive: '#a5231a', emissiveIntensity: 0.5 })); tl.position.set(-1.95, 0.78, s * 0.55); body.add(tl); }

  // roues fines et hautes (style 2CV)
  const tg = new THREE.CylinderGeometry(0.42, 0.42, 0.24, 28).rotateX(Math.PI / 2), hg = new THREE.CylinderGeometry(0.2, 0.2, 0.26, 20).rotateX(Math.PI / 2), cg = new THREE.SphereGeometry(0.08, 10, 8);
  for (const [x, z, front] of [[1.28, 0.78, true], [1.28, -0.78, true], [-1.22, 0.78, false], [-1.22, -0.78, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.42, z);
    const spin = new THREE.Group(); pivot.add(spin);
    spin.add(shadowy(new THREE.Mesh(tg, tire)), shadowy(new THREE.Mesh(hg, hub)));
    const cap = new THREE.Mesh(cg, chrome); cap.position.z = z > 0 ? 0.13 : -0.13; spin.add(cap);
    car.add(pivot); wheels.push({ pivot, spin, front });
  }
  car.scale.setScalar(1.6);
}

/* ---------- Conduite (arcade) ---------- */
const keys = { up: false, down: false, left: false, right: false, brake: false };
const KMAP = { ArrowUp: 'up', KeyW: 'up', KeyZ: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'brake' };
const kbd = Object.fromEntries([...document.querySelectorAll('.keys kbd')].map(k => [k.dataset.k, k]));
const setKey = (k, v) => { if (!(k in keys)) return; keys[k] = v; kbd[k] && kbd[k].classList.toggle('on', v); if (v) startDriving(); };
addEventListener('keydown', e => { const k = KMAP[e.code]; if (k) { setKey(k, true); e.preventDefault(); } if (e.code === 'KeyR') resetCar(); });
addEventListener('keyup', e => { const k = KMAP[e.code]; if (k) setKey(k, false); });
document.querySelectorAll('.touch button').forEach(b => {
  const on = e => { e.preventDefault(); b.classList.add('on'); setKey(b.dataset.k, true); };
  const off = () => { b.classList.remove('on'); setKey(b.dataset.k, false); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});

const START = { x: 25, z: 0, h: 0 };
const state = { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0, roll: 0, pitch: 0, wheelSpin: 0, bounce: 0 };
const MAX = 34, REV = -12, ACC = 16, BRAKE = 34, DRAG = 0.35;
function resetCar() { Object.assign(state, { x: START.x, z: START.z, heading: START.h, speed: 0, steer: 0 }); }

const CAR_R = 3.1; // rayon de collision de la voiture
function collide() {
  for (const c of colliders) {
    if (c.round) {
      const dx = state.x - (c.x0 + c.x1) / 2, dz = state.z - (c.z0 + c.z1) / 2, d = Math.hypot(dx, dz), min = c.round + CAR_R * 0.8;
      if (d < min) { state.x += dx / d * (min - d); state.z += dz / d * (min - d); state.speed *= 0.5; bump(); }
      continue;
    }
    const nx = Math.max(c.x0, Math.min(state.x, c.x1)), nz = Math.max(c.z0, Math.min(state.z, c.z1));
    const dx = state.x - nx, dz = state.z - nz, d = Math.hypot(dx, dz), r = CAR_R * 0.75;
    if (d < r) {
      if (d > 0.0001) { state.x += dx / d * (r - d); state.z += dz / d * (r - d); }
      else state.x += r;
      state.speed *= -0.25; bump();
    }
  }
  state.x = Math.max(-WORLD + 3, Math.min(WORLD - 3, state.x)); state.z = Math.max(-WORLD + 3, Math.min(WORLD - 3, state.z));
}
let shake = 0; const bump = () => { shake = Math.min(1, shake + 0.6); };

/* Poussière derrière les roues */
const dust = (() => {
  const n = 70, m = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: '#efe2cc', roughness: 1, transparent: true, opacity: 0.75 }), n);
  const items = [...Array(n)].map(() => ({ life: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), s: 1 }));
  scene.add(m); return { m, items, i: 0, o: new THREE.Object3D() };
})();
function puff(x, z, vx, vz) {
  const d = dust.items[dust.i = (dust.i + 1) % dust.items.length];
  d.life = 0; d.p.set(x, 0.4, z); d.v.set(vx + (Math.random() - .5), 0.8 + Math.random(), vz + (Math.random() - .5)); d.s = 0.4 + Math.random() * 0.5;
}

/* ---------- Caméra ---------- */
const CAM_OFFSET = new THREE.Vector3(-12, 40, 18); // vue plongeante : les maisons ne cachent jamais la voiture
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let intro = { t: 0, dur: reduce ? 0.01 : 3.6, done: false, started: false };
const INTRO_FROM = new THREE.Vector3(150, 150, 170), INTRO_LOOK = new THREE.Vector3(0, 0, 0);
camera.position.copy(INTRO_FROM); camera.lookAt(INTRO_LOOK);
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- Interface : chargement, titre, indications ---------- */
const hero = $('hero'), hint = $('hint'), speedo = $('speedo'), kmh = $('kmh'), touchUI = $('touch'), wipe = $('wipe');
// découpe du titre en lettres pour l'apparition
document.querySelectorAll('#headline .ln').forEach((ln, li) => {
  const walk = (node, out) => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) for (const ch of n.textContent) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch === ' ' ? ' ' : ch; out.appendChild(s); }
    else { const c = n.cloneNode(false); walk(n, c); out.appendChild(c); }
  });
  const frag = document.createElement('span'); walk(ln, frag); ln.replaceChildren(...frag.childNodes);
  ln.querySelectorAll('.ch').forEach((c, i) => c.style.transitionDelay = (0.25 + li * 0.18 + i * 0.028) + 's');
});
let driving = false;
function startDriving() {
  if (driving || !intro.done) return; driving = true;
  hero.classList.add('away'); hint.classList.add('gone');
  wipe.classList.add('on'); setTimeout(() => wipe.classList.remove('on'), 160);
}
function introFinished() {
  hero.classList.add('show'); speedo.classList.add('show'); touchUI.classList.add('show');
  setTimeout(() => !driving && hint.classList.add('show'), 1400);
  if (Object.values(keys).some(Boolean)) startDriving();
}

// écran de chargement : compteur 0 → 100 puis ouverture des volets
(() => {
  const loader = $('loader'), count = $('count'), bar = $('bar'), t0 = performance.now(), dur = reduce ? 10 : 1900;
  const step = t => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    count.textContent = Math.round(e * 100); bar.style.width = e * 100 + '%';
    if (k < 1) requestAnimationFrame(step);
    else { loader.classList.add('open'); intro.started = true; setTimeout(() => loader.remove(), 1600); }
  };
  requestAnimationFrame(step);
})();

/* ---------- Quartiers : un bandeau apparaît quand on y entre ---------- */
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
  if (z === curZone) return;
  curZone = z; clearTimeout(zoneTimer);
  zoneEl.classList.remove('on'); zoneEl.classList.add('off');
  if (z) zoneTimer = setTimeout(() => { zoneK.textContent = z.k; zoneT.textContent = z.t; zoneEl.classList.remove('off'); void zoneEl.offsetWidth; zoneEl.classList.add('on'); }, 350);
}

/* ---------- Boucle principale ---------- */
const clock = new THREE.Clock(), fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
function tick() {
  const rawDt = clock.getDelta(), dt = Math.min(rawDt, 1 / 30), t = clock.elapsedTime;

  // --- voiture
  if (intro.done && !driving && Object.values(keys).some(Boolean)) startDriving();
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
    state.x += Math.cos(state.heading) * state.speed * dt;
    state.z -= Math.sin(state.heading) * state.speed * dt;
    collide();
  }
  car.position.set(state.x, 0, state.z);
  car.rotation.y = state.heading;
  // roulis marqué (la 2CV penche beaucoup !) et tangage à l'accélération
  const targetRoll = -state.steer * Math.min(1, Math.abs(state.speed) / MAX) * 0.22 * Math.sign(state.speed || 1);
  state.roll += (targetRoll - state.roll) * Math.min(1, dt * 4);
  const accelPitch = ((keys.up ? 1 : 0) - (keys.down ? 1 : 0)) * 0.035 * (intro.done ? 1 : 0);
  state.pitch += (accelPitch - state.pitch) * Math.min(1, dt * 3);
  state.bounce += dt * (4 + Math.abs(state.speed) * 0.4);
  body.rotation.set(state.roll, 0, state.pitch);
  body.position.y = Math.sin(state.bounce) * 0.015 * (0.3 + Math.abs(state.speed) / MAX) + 0.02;
  state.wheelSpin -= state.speed * dt / (0.42 * 1.6);
  for (const w of wheels) { w.spin.rotation.z = state.wheelSpin; if (w.front) w.pivot.rotation.y = state.steer * 0.9; }

  // poussière quand on accélère ou dérape
  if (intro.done && (Math.abs(state.speed) > 6 && (keys.up || Math.abs(state.steer) > 0.3)) && Math.random() < 0.6) {
    fwd.set(Math.cos(state.heading), 0, -Math.sin(state.heading));
    for (const side of [-1, 1]) {
      tmp.set(-fwd.z, 0, fwd.x).multiplyScalar(side * 1.25);
      puff(state.x - fwd.x * 2 + tmp.x, state.z - fwd.z * 2 + tmp.z, -fwd.x * 2, -fwd.z * 2);
    }
  }
  dust.items.forEach((d, i) => {
    if (d.life < 1) { d.life += dt * 1.2; d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(0.96); }
    const s = d.life < 1 ? d.s * (0.6 + d.life * 1.4) * (1 - d.life) : 0;
    dust.o.position.copy(d.p); dust.o.scale.setScalar(s); dust.o.updateMatrix(); dust.m.setMatrixAt(i, dust.o.matrix);
  });
  dust.m.instanceMatrix.needsUpdate = true;

  // cônes : renversés par la voiture
  for (const c of cones) {
    const dx = c.g.position.x - state.x, dz = c.g.position.z - state.z, d = Math.hypot(dx, dz);
    if (d < 3 && Math.abs(state.speed) > 2) {
      const k = Math.abs(state.speed) * 0.7;
      c.v.set(dx / d * k + Math.cos(state.heading) * state.speed * 0.4, 4 + Math.abs(state.speed) * 0.25, dz / d * k - Math.sin(state.heading) * state.speed * 0.4);
      c.w.set((Math.random() - .5) * 10, (Math.random() - .5) * 6, (Math.random() - .5) * 10); c.still = false;
    }
    if (!c.still) {
      c.v.y -= 25 * dt; c.g.position.addScaledVector(c.v, dt);
      c.g.rotation.x += c.w.x * dt; c.g.rotation.y += c.w.y * dt; c.g.rotation.z += c.w.z * dt;
      if (c.g.position.y < 0) { c.g.position.y = 0; c.v.y *= -0.35; c.v.x *= 0.7; c.v.z *= 0.7; c.w.multiplyScalar(0.6); if (Math.abs(c.v.y) < 0.6 && Math.hypot(c.v.x, c.v.z) < 0.3) { c.still = true; c.g.rotation.x = Math.round(c.g.rotation.x / (Math.PI / 2)) * Math.PI / 2; c.g.rotation.z = Math.round(c.g.rotation.z / (Math.PI / 2)) * Math.PI / 2; } }
    }
  }

  // fontaine
  fountainDrops.data.forEach((dr, i) => {
    dr.t += dt * 0.6 * dr.s; if (dr.t > 1) dr.t -= 1;
    const r = dr.t * 3.2, y = 4.6 + Math.sin(dr.t * Math.PI) * 1.2 - dr.t * 3.6;
    fountainDrops.o.position.set(PLAZA.x + Math.cos(dr.a) * r, Math.max(0.9, y), PLAZA.z + Math.sin(dr.a) * r);
    fountainDrops.o.updateMatrix(); fountainDrops.m.setMatrixAt(i, fountainDrops.o.matrix);
  });
  fountainDrops.m.instanceMatrix.needsUpdate = true;

  // --- caméra
  const speedK = Math.abs(state.speed) / MAX;
  const follow = tmp.copy(CAM_OFFSET).multiplyScalar(1 + speedK * 0.22).add(car.position);
  if (intro.started && !intro.done) {
    intro.t += Math.min(rawDt, 0.1) / intro.dur; const e = ease(Math.min(1, intro.t));
    camPos.lerpVectors(INTRO_FROM, follow, e); camLook.lerpVectors(INTRO_LOOK, car.position, e);
    if (intro.t >= 1) { intro.done = true; introFinished(); }
  } else if (intro.done) {
    camPos.lerp(follow, Math.min(1, dt * 3)); camLook.lerp(car.position, Math.min(1, dt * 5));
  } else { camPos.copy(INTRO_FROM); camLook.copy(INTRO_LOOK); }
  camera.position.copy(camPos);
  if (shake > 0) { camera.position.x += (Math.random() - .5) * shake * 0.6; camera.position.y += (Math.random() - .5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(camLook);
  skyMesh.position.copy(camera.position); // le ciel suit la caméra
  camera.fov += ((32 + speedK * 6) - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();

  // l'ombre suit la voiture
  sun.position.set(car.position.x + 40, 70, car.position.z + 30); sun.target.position.copy(car.position);

  updateZone();
  kmh.textContent = Math.round(Math.abs(state.speed) * 3.2);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
// petit easter egg pour les testeurs : la voiture est à disposition dans la console
window.__atelier = { state, resetCar, CAM_OFFSET };
