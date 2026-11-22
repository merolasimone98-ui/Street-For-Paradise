// Nascita in ospedale + panoramica narrativa e visiva 0-18 anni.
import * as THREE from 'three';
import { $, disposeObject3D } from './ui.js';
import { Ease, lerp, clamp } from './tween.js';
import { seededRandom, formatMoney } from './birthdata.js';
import { makePerson } from './characters.js';

const STAT_KEYS = ['resistenza', 'carisma', 'riflessi'];
const STAT_SHORT = { resistenza: 'RES', carisma: 'CAR', riflessi: 'RIF' };
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/* =====================================================================
   Helper geometrici
   ===================================================================== */
const stdMat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

function addBox(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? stdMat(mat) : mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function buildRoom(root, { w, d, h, wall, floor, ceiling = 0xf2f2ee, floorMap = null }) {
  const wallMat = stdMat(wall, { roughness: 0.95 });
  const floorMat = stdMat(floor, { roughness: 0.7, map: floorMap });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  fl.rotation.x = -Math.PI / 2;
  root.add(fl);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  back.position.set(0, h / 2, -d / 2);
  root.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-w / 2, h / 2, 0);
  root.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat);
  right.rotation.y = -Math.PI / 2;
  right.position.set(w / 2, h / 2, 0);
  root.add(right);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), stdMat(ceiling, { roughness: 1 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = h;
  root.add(ceil);
  // Battiscopa
  addBox(root, w, 0.1, 0.03, stdMat(0x000000, { color: new THREE.Color(wall).multiplyScalar(0.6) }), 0, 0.05, -d / 2 + 0.015);
  return { wallMat };
}

function addWindow(root, { x, y, z, w, h, sky, frame = 0xf4f4f0, bars = false, rotY = 0 }) {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: sky }));
  g.add(glass);
  const fm = stdMat(frame, { roughness: 0.5 });
  const t = 0.07;
  addBox(g, w + t * 2, t, 0.08, fm, 0, h / 2 + t / 2, 0);
  addBox(g, w + t * 2, t, 0.08, fm, 0, -h / 2 - t / 2, 0);
  addBox(g, t, h, 0.08, fm, -w / 2 - t / 2, 0, 0);
  addBox(g, t, h, 0.08, fm, w / 2 + t / 2, 0, 0);
  addBox(g, 0.04, h, 0.05, fm, 0, 0, 0.01);
  addBox(g, w, 0.04, 0.05, fm, 0, 0, 0.01);
  if (bars) {
    const bm = stdMat(0x2a2a2a, { metalness: 0.6, roughness: 0.5 });
    for (let i = 1; i < 6; i++) addBox(g, 0.025, h, 0.025, bm, -w / 2 + (w / 6) * i, 0, 0.06);
  }
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  root.add(g);
  return g;
}

function makeBaby(skin) {
  const g = new THREE.Group();
  const blanket = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 6, 12), stdMat(0xf4efe6, { roughness: 1 }));
  blanket.rotation.x = Math.PI / 2;
  g.add(blanket);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), stdMat(skin, { roughness: 0.6 }));
  head.position.set(0, 0.02, -0.19);
  g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), stdMat(0xbfe0f2));
  hat.position.copy(head.position);
  hat.rotation.x = -0.6;
  g.add(hat);
  g.userData.blanket = blanket;
  return g;
}

function skyDome(top, bottom, radius = 180) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) / radius + 0.05) / 0.6, 0, 1);
    c.copy(cb).lerp(ct, Math.pow(t, 0.8));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
}

function windowsTexture(rng, litChance = 0.45, base = '#3b3f46') {
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const lit = rng() < litChance;
        g.fillStyle = lit ? (rng() < 0.5 ? '#ffd68a' : '#ffe9b8') : '#1c2028';
        g.fillRect(x * 32 + 7, y * 32 + 6, 18, 20);
      }
    }
  });
}

function addPlant(root, x, z, scale = 1) {
  const pot = addBox(root, 0.32 * scale, 0.36 * scale, 0.32 * scale, stdMat(0x8a5a3c), x, 0.18 * scale, z);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38 * scale, 1), stdMat(0x3f7a3a, { flatShading: true }));
  leaves.position.set(x, 0.72 * scale, z);
  root.add(leaves);
  return pot;
}

function addSofa(root, x, z, color, rotY = 0, len = 2) {
  const g = new THREE.Group();
  const m = stdMat(color, { roughness: 1 });
  addBox(g, len, 0.42, 0.85, m, 0, 0.21, 0);
  addBox(g, len, 0.5, 0.2, m, 0, 0.62, -0.33);
  addBox(g, 0.18, 0.3, 0.85, m, -len / 2 + 0.09, 0.55, 0);
  addBox(g, 0.18, 0.3, 0.85, m, len / 2 - 0.09, 0.55, 0);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  root.add(g);
  return g;
}

function addTable(root, x, z, w, d, color, h = 0.75) {
  const m = stdMat(color, { roughness: 0.6 });
  addBox(root, w, 0.05, d, m, x, h, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(root, 0.05, h, 0.05, m, x + sx * (w / 2 - 0.06), h / 2, z + sz * (d / 2 - 0.06));
}

function addToys(root, rng, cx, cz, n = 8) {
  const colors = [0xe94f37, 0xf6c445, 0x3f88c5, 0x44bba4, 0xa45ee5];
  for (let i = 0; i < n; i++) {
    const s = 0.08 + rng() * 0.06;
    const b = addBox(root, s, s, s, stdMat(colors[i % colors.length], { roughness: 0.5 }), cx + (rng() - 0.5) * 1.0, s / 2, cz + (rng() - 0.5) * 0.8);
    b.rotation.y = rng() * Math.PI;
  }
}

/* =====================================================================
   Scene delle tappe
   ===================================================================== */
const HOSPITAL = {
  premium: { w: 7, d: 6, h: 3.2, wall: 0xf3efe7, floor: 0x9a7350, ceiling: 0xfbfaf6, light: 0xfff0dc, li: 26, amb: 1.1, sky: 0xcfe7ff, winW: 2.6, winH: 1.7, frame: 0xffffff, blanket: 0xe9dcc6, crib: 0xd8b58a, extraBeds: 0, flicker: false },
  standard: { w: 5.6, d: 5, h: 3, wall: 0xd5e5ee, floor: 0xbfc5ca, ceiling: 0xf4f6f8, light: 0xf2f7ff, li: 20, amb: 0.9, sky: 0xd2e4f2, winW: 1.5, winH: 1.2, frame: 0xf0f0f0, blanket: 0x9cc3db, crib: 0xe8eef2, extraBeds: 0, flicker: false },
  public: { w: 6.2, d: 5, h: 3, wall: 0xc2d3b4, floor: 0x8d9286, ceiling: 0xe9ece2, light: 0xe6f3dc, li: 15, amb: 0.65, sky: 0xa9b8c2, winW: 1.0, winH: 0.9, frame: 0xd8d8cc, blanket: 0x8fa58a, crib: 0x9aa3a8, extraBeds: 1, flicker: false },
  poor: { w: 6.6, d: 5, h: 2.8, wall: 0x8b856e, floor: 0x57534a, ceiling: 0xa6a08c, light: 0xffd598, li: 9, amb: 0.35, sky: 0x7d8790, winW: 0.9, winH: 0.8, frame: 0x6e6a5c, blanket: 0x7d6e5a, crib: 0x6d7275, extraBeds: 2, flicker: true },
};

function addHospitalBed(root, x, z, C, withPatient, skin, hair) {
  const frame = stdMat(C.crib === 0xd8b58a ? 0xe8e8e8 : 0xb9c0c4, { metalness: 0.4, roughness: 0.4 });
  addBox(root, 1.0, 0.45, 2.0, frame, x, 0.32, z);
  addBox(root, 0.95, 0.16, 1.92, stdMat(0xf7f7f5, { roughness: 1 }), x, 0.62, z);
  addBox(root, 1.02, 0.8, 0.06, frame, x, 0.7, z - 1.0);
  addBox(root, 0.6, 0.12, 0.35, stdMat(0xffffff, { roughness: 1 }), x, 0.76, z - 0.75);
  const blanket = addBox(root, 0.99, 0.14, 1.35, stdMat(C.blanket, { roughness: 1 }), x, 0.73, z + 0.28);
  if (withPatient) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), stdMat(skin, { roughness: 0.6 }));
    head.position.set(x, 0.9, z - 0.68);
    root.add(head);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), stdMat(hair));
    h.position.set(x, 0.9, z - 0.72);
    h.rotation.x = -1.1;
    root.add(h);
    blanket.scale.y = 1.6;
  }
}

function buildHospital(root, ctx) {
  const C = HOSPITAL[ctx.family.hospital] || HOSPITAL.standard;
  const { w, d, h } = C;
  buildRoom(root, { w, d, h, wall: C.wall, floor: C.floor, ceiling: C.ceiling });
  root.add(new THREE.HemisphereLight(0xffffff, C.floor, C.amb));
  const lamp = new THREE.PointLight(C.light, C.li, 0, 2);
  lamp.position.set(0, h - 0.35, -0.4);
  root.add(lamp);
  const panelMat = stdMat(0xffffff, { emissive: new THREE.Color(C.light), emissiveIntensity: 1.6 });
  addBox(root, ctx.family.hospital === 'poor' ? 0.12 : 1.2, 0.04, ctx.family.hospital === 'poor' ? 0.12 : 0.4, panelMat, 0, h - 0.02, -0.4);

  const win = addWindow(root, { x: 1.35, y: 1.65, z: -d / 2 + 0.02, w: C.winW, h: C.winH, sky: C.sky, frame: C.frame, bars: ctx.family.hospital === 'poor' });
  const sun = new THREE.DirectionalLight(C.sky, ctx.family.hospital === 'premium' ? 1.6 : 0.7);
  sun.position.set(1.4, 3, -d / 2 + 0.5);
  sun.target.position.set(0.4, 0, 0.5);
  root.add(sun, sun.target);

  addHospitalBed(root, -1.35, -d / 2 + 1.15, C, true, ctx.motherSkin, ctx.hair);

  // Culla
  const cribMat = stdMat(C.crib, { roughness: 0.6 });
  const cx = 0.6, cz = -0.5;
  addBox(root, 0.78, 0.05, 0.5, cribMat, cx, 0.72, cz);
  addBox(root, 0.78, 0.24, 0.03, cribMat, cx, 0.86, cz - 0.25);
  addBox(root, 0.78, 0.24, 0.03, cribMat, cx, 0.86, cz + 0.25);
  addBox(root, 0.03, 0.24, 0.5, cribMat, cx - 0.39, 0.86, cz);
  addBox(root, 0.03, 0.24, 0.5, cribMat, cx + 0.39, 0.86, cz);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) addBox(root, 0.04, 0.72, 0.04, cribMat, cx + sx * 0.36, 0.36, cz + sz * 0.22);
  addBox(root, 0.72, 0.05, 0.44, stdMat(0xffffff, { roughness: 1 }), cx, 0.77, cz);
  const baby = makeBaby(ctx.skin);
  baby.position.set(cx, 0.86, cz + 0.03);
  baby.rotation.y = Math.PI / 2;
  root.add(baby);

  // Monitor + flebo
  const monMat = stdMat(0x2a2d31, { roughness: 0.4 });
  addBox(root, 0.05, 1.3, 0.05, monMat, -2.3, 0.65, -d / 2 + 0.6);
  addBox(root, 0.45, 0.32, 0.08, monMat, -2.3, 1.45, -d / 2 + 0.6);
  const screen = addBox(root, 0.38, 0.25, 0.01, new THREE.MeshBasicMaterial({ color: 0x29e07a }), -2.3, 1.45, -d / 2 + 0.645);
  addBox(root, 0.03, 1.8, 0.03, stdMat(0xcfd4d8, { metalness: 0.7, roughness: 0.3 }), -0.55, 0.9, -d / 2 + 0.4);
  addBox(root, 0.12, 0.2, 0.05, stdMat(0xe8f4ff, { transparent: true, opacity: 0.7 }), -0.55, 1.75, -d / 2 + 0.4);

  // Extra per contesto
  const rng = ctx.rng;
  if (ctx.family.hospital === 'premium') {
    addPlant(root, 2.9, -d / 2 + 0.6, 1.3);
    addSofa(root, 2.6, 0.9, 0xb9a68a, -Math.PI / 2, 1.8);
    addTable(root, -0.6, 0.6, 0.5, 0.5, 0x6b4a32, 0.55);
    const vase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.22, 12), stdMat(0xdde8f0, { roughness: 0.2 }));
    vase.position.set(-0.6, 0.69, 0.6);
    root.add(vase);
    const flowers = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 1), stdMat(0xf08aa8, { flatShading: true }));
    flowers.position.set(-0.6, 0.9, 0.6);
    root.add(flowers);
  } else if (ctx.family.hospital === 'standard') {
    const curtain = addBox(root, 0.04, 2.1, 2.2, stdMat(0x9cc7de, { roughness: 1, transparent: true, opacity: 0.85 }), -0.2, 1.15, -d / 2 + 1.3);
    curtain.rotation.y = 0.05;
    addBox(root, 0.45, 0.45, 0.45, stdMat(0x5c7a8c), 1.9, 0.225, 0.6);
  }
  for (let i = 0; i < C.extraBeds; i++) {
    addHospitalBed(root, 2.35, -d / 2 + 1.15 + i * 2.25, C, rng() < 0.8, ctx.randomSkin(), 0x1b1410);
  }
  if (ctx.family.hospital === 'poor') {
    for (let i = 0; i < 6; i++) {
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.2 + rng() * 0.45, 16), new THREE.MeshBasicMaterial({ color: 0x4f4a3c, transparent: true, opacity: 0.35 + rng() * 0.3 }));
      stain.position.set(-w / 2 + 0.6 + rng() * (w - 1.2), 0.6 + rng() * 1.8, -d / 2 + 0.012);
      root.add(stain);
    }
    addBox(root, w, 0.08, 0.08, stdMat(0x6d6150, { metalness: 0.5 }), 0, h - 0.25, -d / 2 + 0.1);
  }

  let flickerT = 0;
  return {
    camFrom: [1.7, 1.8, d / 2 - 0.15], camTo: [1.0, 1.35, 1.15],
    lookFrom: [-0.2, 1.0, -1.2], lookTo: [0.6, 0.82, -0.5],
    animate: (t, dt) => {
      baby.userData.blanket.scale.setScalar(1 + Math.sin(t * 3) * 0.025);
      screen.material.color.setHSL(0.4, 0.8, 0.35 + Math.max(0, Math.sin(t * 7)) * 0.2);
      if (C.flicker) {
        flickerT -= dt;
        if (flickerT <= 0) {
          lamp.intensity = Math.random() < 0.25 ? C.li * 0.15 : C.li;
          panelMat.emissiveIntensity = lamp.intensity > C.li * 0.5 ? 1.6 : 0.2;
          flickerT = 0.05 + Math.random() * 0.4;
        }
      }
    },
  };
}

const HOME = {
  rich: { w: 8, d: 6, h: 3.2, wall: 0xebe4d6, floor: 0xa27850, light: 0xfff0d8, li: 28, amb: 1.0, sky: 0xbfe0ff, sofa: 0xd9cbb3 },
  middle: { w: 6, d: 5, h: 2.9, wall: 0xe4d8c0, floor: 0xb69870, light: 0xffeccc, li: 20, amb: 0.8, sky: 0xc9dcec, sofa: 0x5f7389 },
  worker: { w: 5.2, d: 4.6, h: 2.8, wall: 0xcdbe9f, floor: 0x9a8c78, light: 0xffe4b5, li: 15, amb: 0.6, sky: 0xaab7c0, sofa: 0x7a5d48 },
  poor: { w: 4.6, d: 4.2, h: 2.6, wall: 0x7c7360, floor: 0x4b463d, light: 0xffcf86, li: 8, amb: 0.3, sky: 0x77818a, sofa: 0x4d4436 },
};

function buildHome(root, ctx) {
  const tier = ctx.family.id;
  const C = HOME[tier] || HOME.middle;
  const { w, d, h } = C;
  const rng = ctx.rng;
  buildRoom(root, { w, d, h, wall: C.wall, floor: C.floor });
  root.add(new THREE.HemisphereLight(0xfff6ea, C.floor, C.amb));
  const lamp = new THREE.PointLight(C.light, C.li, 0, 2);
  lamp.position.set(0, h - 0.45, 0);
  root.add(lamp);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: C.light }));
  bulb.position.copy(lamp.position);
  root.add(bulb);
  addBox(root, 0.01, 0.4, 0.01, 0x222222, 0, h - 0.2, 0);

  addWindow(root, { x: -w / 4, y: 1.55, z: -d / 2 + 0.02, w: tier === 'rich' ? 2.2 : 1.1, h: tier === 'rich' ? 1.6 : 1.0, sky: C.sky, bars: tier === 'poor' });
  if (tier === 'rich') addWindow(root, { x: w / 4, y: 1.55, z: -d / 2 + 0.02, w: 2.2, h: 1.6, sky: C.sky });

  // Tappeto
  if (tier !== 'poor') {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), stdMat(tier === 'rich' ? 0x8c3b3b : 0x6a7d5c, { roughness: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0.2, 0.005, 0.2);
    root.add(rug);
  }

  if (tier === 'poor') {
    addBox(root, 1.4, 0.18, 1.9, stdMat(0x8c8270, { roughness: 1 }), -1.3, 0.09, -0.8);
    addBox(root, 1.0, 0.6, 0.5, stdMat(0x5a4c3c), 1.5, 0.3, -d / 2 + 0.3);
    for (let i = 0; i < 5; i++) {
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.2 + rng() * 0.4, 14), new THREE.MeshBasicMaterial({ color: 0x3e392f, transparent: true, opacity: 0.4 }));
      stain.position.set(-w / 2 + 0.5 + rng() * (w - 1), 0.5 + rng() * 1.6, -d / 2 + 0.012);
      root.add(stain);
    }
  } else {
    addSofa(root, 0.3, -d / 2 + 0.7, C.sofa, 0, tier === 'rich' ? 2.6 : 2.0);
    if (tier === 'rich') {
      addPlant(root, -w / 2 + 0.5, -d / 2 + 0.5, 1.4);
      addBox(root, 0.4, 2.0, 1.6, stdMat(0x5b3f2a), w / 2 - 0.25, 1.0, -0.6);
      for (let i = 0; i < 4; i++) addBox(root, 0.3, 0.05, 1.5, stdMat(0x3e2a1c), w / 2 - 0.25, 0.45 + i * 0.45, -0.6);
    } else {
      addBox(root, 1.1, 0.5, 0.4, stdMat(0x3a2f27), w / 2 - 0.7, 0.25, -0.3);
      addBox(root, tier === 'worker' ? 0.55 : 0.9, tier === 'worker' ? 0.45 : 0.55, tier === 'worker' ? 0.45 : 0.06, stdMat(0x111111, { roughness: 0.3 }), w / 2 - 0.7, tier === 'worker' ? 0.73 : 0.8, -0.3);
    }
    if (tier === 'worker') addTable(root, -w / 2 + 1.1, 0.7, 1.0, 0.8, 0x7a6a55);
  }

  addToys(root, rng, 0.3, 0.5, tier === 'rich' ? 12 : tier === 'poor' ? 3 : 7);
  const kid = makePerson({ height: 0.92, skin: ctx.skin, hair: ctx.hair, shirt: 0xf2c14e, pants: 0x3f6fb5, sex: ctx.sex, child: true });
  kid.position.set(0.3, 0, 0.75);
  kid.rotation.y = Math.PI + 0.4;
  root.add(kid);

  const parents = [];
  if (tier !== 'poor' || rng() < 0.6) {
    const p1 = makePerson({ height: 1.72, skin: ctx.motherSkin, hair: ctx.hair, shirt: 0xa23b52, pants: 0x2c2c38, sex: 'f' });
    p1.position.set(-1.1, 0, -0.2);
    p1.rotation.y = 0.6;
    root.add(p1);
    parents.push(p1);
  }
  if (tier === 'rich' || tier === 'middle') {
    const p2 = makePerson({ height: 1.8, skin: ctx.fatherSkin, hair: 0x2a2a2a, shirt: 0x3f6b8c, pants: 0x34343c, sex: 'm' });
    p2.position.set(1.4, 0, -0.4);
    p2.rotation.y = -0.7;
    root.add(p2);
    parents.push(p2);
  }

  return {
    camFrom: [w / 2 - 0.5, 1.7, d / 2 - 0.1], camTo: [0.9, 1.05, d / 2 - 0.6],
    lookFrom: [0, 0.9, -0.5], lookTo: [0.3, 0.5, 0.7],
    animate: (t) => {
      kid.userData.armR.rotation.x = -0.8 + Math.sin(t * 4) * 0.6;
      kid.userData.armL.rotation.x = -0.4 + Math.sin(t * 4 + 1.5) * 0.3;
      kid.position.y = Math.abs(Math.sin(t * 4)) * 0.03;
      parents.forEach((p, i) => { p.userData.head.rotation.y = Math.sin(t * 0.7 + i) * 0.3; });
    },
  };
}

function buildSchool(root, ctx) {
  const tier = ctx.family.id;
  const rng = ctx.rng;
  const cfg = {
    rich: { wall: 0xe9eef0, floor: 0xb08a62, amb: 1.0, li: 28, rows: 2, cols: 3, sky: 0xcfe6ff },
    middle: { wall: 0xe8e0c8, floor: 0xa89a82, amb: 0.85, li: 24, rows: 3, cols: 3, sky: 0xc8dcea },
    worker: { wall: 0xd8d2b6, floor: 0x8f8775, amb: 0.7, li: 20, rows: 3, cols: 4, sky: 0xaeb9c2 },
    poor: { wall: 0xa8a48c, floor: 0x6b675a, amb: 0.45, li: 14, rows: 4, cols: 4, sky: 0x8a949c },
  }[tier];
  const w = 9, d = 7.5, h = 3.2;
  buildRoom(root, { w, d, h, wall: cfg.wall, floor: cfg.floor });
  root.add(new THREE.HemisphereLight(0xffffff, cfg.floor, cfg.amb));
  for (const lx of [-2.2, 2.2]) {
    const l = new THREE.PointLight(0xf4f8ff, cfg.li, 0, 2);
    l.position.set(lx, h - 0.3, 0);
    root.add(l);
    addBox(root, 1.4, 0.04, 0.3, stdMat(0xffffff, { emissive: 0xf4f8ff, emissiveIntensity: 1.4 }), lx, h - 0.02, 0);
  }
  for (let i = 0; i < 3; i++) {
    addWindow(root, { x: -w / 2 + 0.03, y: 1.7, z: -2.2 + i * 2.2, w: 1.5, h: 1.3, sky: cfg.sky, rotY: Math.PI / 2 });
  }
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.1);
  sun.position.set(-6, 4, 0);
  root.add(sun);

  // Lavagna
  const year = ctx.birthYear + 7;
  const board = canvasTexture(1024, 400, (g, W, H) => {
    g.fillStyle = '#1f3a2e';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.08;
    for (let i = 0; i < 60; i++) { g.fillStyle = '#fff'; g.fillRect(rng() * W, rng() * H, 80 * rng(), 2); }
    g.globalAlpha = 1;
    g.fillStyle = '#eef3ea';
    g.font = '600 58px "Inter", sans-serif';
    g.fillText(`${ctx.city.city}, ${year}`, 60, 110);
    g.font = '400 52px "Inter", sans-serif';
    g.fillText('7 × 8 = 56', 60, 220);
    g.fillText('La mia città da grande…', 60, 320);
  });
  const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.6), new THREE.MeshStandardMaterial({ map: board, roughness: 0.9 }));
  boardMesh.position.set(0.6, 1.65, -d / 2 + 0.03);
  root.add(boardMesh);
  addBox(root, 4.4, 0.08, 0.12, stdMat(0x6b4a32), 0.6, 0.82, -d / 2 + 0.08);

  // Banchi + alunni
  const deskMat = stdMat(tier === 'poor' ? 0x7d6a52 : 0xc9a77a, { roughness: 0.7 });
  const shirts = [0xe94f37, 0x3f88c5, 0xf6c445, 0x44bba4, 0xffffff, 0x8e6bbf, 0x2f2f3a];
  let hero = null;
  const startZ = -d / 2 + 2.4;
  for (let r = 0; r < cfg.rows; r++) {
    for (let c = 0; c < cfg.cols; c++) {
      const x = (c - (cfg.cols - 1) / 2) * 1.6 + 0.6;
      const z = startZ + r * 1.15;
      addBox(root, 0.9, 0.04, 0.55, deskMat, x, 0.68, z);
      addBox(root, 0.05, 0.68, 0.5, deskMat, x - 0.4, 0.34, z);
      addBox(root, 0.05, 0.68, 0.5, deskMat, x + 0.4, 0.34, z);
      addBox(root, 0.4, 0.04, 0.4, stdMat(0x5b6670), x, 0.42, z + 0.45);
      const isHero = r === 1 && c === Math.floor(cfg.cols / 2);
      if (isHero || rng() < 0.85) {
        const kid = makePerson({
          height: 1.3, skin: isHero ? ctx.skin : ctx.randomSkin(), hair: isHero ? ctx.hair : 0x2a1d14,
          shirt: isHero ? 0xf2c14e : shirts[Math.floor(rng() * shirts.length)], pants: 0x2f3b52, sex: isHero ? ctx.sex : (rng() < 0.5 ? 'm' : 'f'), child: true,
        });
        kid.userData.legL.rotation.x = -1.45;
        kid.userData.legR.rotation.x = -1.45;
        kid.userData.shinL.rotation.x = 1.45;
        kid.userData.shinR.rotation.x = 1.45;
        kid.position.set(x, 0.5 - kid.userData.hipHeight, z + 0.45);
        kid.rotation.y = Math.PI;
        // Il modello guarda +Z: lo giriamo verso la lavagna (−Z).
        root.add(kid);
        if (isHero) hero = kid;
      }
    }
  }
  const teacher = makePerson({ height: 1.7, skin: ctx.randomSkin(), hair: 0x6b6b6b, shirt: 0x6d5a8a, pants: 0x2c2c30, sex: rng() < 0.5 ? 'm' : 'f' });
  teacher.position.set(-1.9, 0, -d / 2 + 0.9);
  teacher.rotation.y = 0.3;
  root.add(teacher);

  if (tier === 'poor') {
    for (let i = 0; i < 6; i++) {
      const stain = new THREE.Mesh(new THREE.CircleGeometry(0.25 + rng() * 0.4, 14), new THREE.MeshBasicMaterial({ color: 0x5e5a48, transparent: true, opacity: 0.4 }));
      stain.position.set(w / 2 - 0.02, 0.6 + rng() * 2, -d / 2 + 0.6 + rng() * (d - 1.2));
      stain.rotation.y = -Math.PI / 2;
      root.add(stain);
    }
  }

  const heroPos = hero ? hero.position.clone() : new THREE.Vector3(0.6, 0.5, 0);
  return {
    camFrom: [3.6, 2.4, d / 2 - 0.2], camTo: [heroPos.x + 1.3, 1.5, heroPos.z + 1.9],
    lookFrom: [0, 1.2, -d / 2 + 0.5], lookTo: [heroPos.x - 0.2, 0.9, heroPos.z - 1.2],
    animate: (t) => {
      teacher.userData.armR.rotation.x = -1.6 + Math.sin(t * 2) * 0.25;
      teacher.userData.armR.rotation.z = 0.2;
      if (hero) hero.userData.head.rotation.y = Math.sin(t * 0.8) * 0.4;
    },
  };
}

function buildStreet(root, ctx) {
  const tier = ctx.family.id;
  const rng = ctx.rng;
  root.add(skyDome(0x3a4a7a, 0xf3a25e));
  ctx.scene.fog = new THREE.Fog(0xe7925a, 30, 120);
  root.add(new THREE.HemisphereLight(0xffc89a, 0x3a3040, 0.9));
  const sun = new THREE.DirectionalLight(0xffa860, 2.4);
  sun.position.set(-30, 10, -40);
  root.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), stdMat(0x3b3a3d, { roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);
  const walkMat = stdMat(tier === 'poor' ? 0x77736b : 0xa29d93, { roughness: 1 });
  addBox(root, 4, 0.15, 160, walkMat, -7, 0.075, -40);
  addBox(root, 4, 0.15, 160, walkMat, 7, 0.075, -40);
  for (let i = 0; i < 20; i++) addBox(root, 0.15, 0.01, 1.6, stdMat(0xf2efe6), 0, 0.006, 4 - i * 4);

  const winTex = windowsTexture(rng, tier === 'rich' ? 0.6 : 0.45);
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const palette = ctx.city.palette;
  for (const side of [-1, 1]) {
    let z = 6;
    while (z > -90) {
      const bw = 6 + rng() * 6;
      const bh = tier === 'poor' ? 6 + rng() * 10 : tier === 'rich' ? 8 + rng() * 14 : 8 + rng() * 18;
      const bd = 8 + rng() * 6;
      const geo = new THREE.BoxGeometry(bd, bh, bw);
      const tex = winTex.clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.max(1, Math.round(bw / 4)), Math.max(1, Math.round(bh / 3.5)));
      const mat = stdMat(palette[Math.floor(rng() * palette.length)], { map: tex, roughness: 0.9 });
      const b = new THREE.Mesh(geo, mat);
      b.position.set(side * (9 + bd / 2), bh / 2, z - bw / 2);
      root.add(b);
      if (tier === 'poor' && rng() < 0.6) {
        const graffiti = new THREE.Mesh(new THREE.PlaneGeometry(2 + rng() * 2, 1 + rng()), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(rng(), 0.8, 0.55) }));
        graffiti.position.set(side * 8.99, 1.2, z - bw / 2);
        graffiti.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        root.add(graffiti);
      }
      z -= bw + 0.5;
    }
  }

  // Campetto da basket
  const poleMat = stdMat(0x3c4650, { metalness: 0.6, roughness: 0.4 });
  addBox(root, 0.12, 3.2, 0.12, poleMat, 5.6, 1.6, -6);
  addBox(root, 0.05, 0.9, 1.3, stdMat(0xffffff), 5.4, 3.1, -6);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 8, 24), stdMat(0xe8592a, { metalness: 0.3 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(5.1, 2.85, -6);
  root.add(ring);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), stdMat(0xd9682b));
  root.add(ball);

  // Ragazzi
  const hero = makePerson({ height: 1.68, skin: ctx.skin, hair: ctx.hair, shirt: 0xf2c14e, pants: 0x34405a, sex: ctx.sex });
  hero.position.set(3.4, 0.15, -5);
  hero.rotation.y = -Math.PI / 2 + 0.3;
  root.add(hero);
  const friends = [];
  const fShirts = [0xd94b4b, 0x3f88c5, 0xffffff];
  for (let i = 0; i < 3; i++) {
    const f = makePerson({ height: 1.6 + rng() * 0.2, skin: ctx.randomSkin(), hair: 0x1f1812, shirt: fShirts[i], pants: 0x2b2b33, sex: rng() < 0.5 ? 'm' : 'f' });
    f.position.set(2.2 + i * 0.9, 0.15, -3.3 - i * 0.6);
    f.rotation.y = -2.4 + i * 0.3;
    root.add(f);
    friends.push(f);
  }
  // Motorino
  const scooter = new THREE.Group();
  addBox(scooter, 0.35, 0.35, 1.3, stdMat(tier === 'rich' ? 0xe8e8e8 : 0x9d2b2b, { metalness: 0.3, roughness: 0.4 }), 0, 0.45, 0);
  for (const zz of [-0.5, 0.5]) {
    const wh = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.07, 8, 16), stdMat(0x111111));
    wh.rotation.y = Math.PI / 2;
    wh.position.set(0, 0.22, zz);
    scooter.add(wh);
  }
  addBox(scooter, 0.6, 0.05, 0.05, stdMat(0x222222), 0, 1.0, -0.55);
  addBox(scooter, 0.05, 0.5, 0.05, stdMat(0x222222), 0, 0.75, -0.55);
  scooter.position.set(-4.5, 0, -2);
  scooter.rotation.y = 0.4;
  root.add(scooter);

  return {
    camFrom: [-2.5, 1.8, 5], camTo: [0.6, 1.6, 0.5],
    lookFrom: [3, 1.5, -6], lookTo: [4, 1.6, -5.5],
    animate: (t) => {
      const k = (t * 0.6) % 1;
      const p = new THREE.Vector3(3.6, 1.3, -5).lerp(new THREE.Vector3(5.1, 2.9, -6), k);
      p.y += Math.sin(k * Math.PI) * 1.2;
      ball.position.copy(p);
      hero.userData.armR.rotation.x = -2.2 + k * 1.4;
      hero.userData.armL.rotation.x = -2.0 + k * 1.2;
      friends.forEach((f, i) => { f.userData.armL.rotation.x = Math.sin(t * 2 + i) * 0.4; });
    },
  };
}

function signSprite(text, color) {
  const tex = canvasTexture(512, 160, (g, W, H) => {
    g.fillStyle = 'rgba(10,10,14,0.75)';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = color;
    g.lineWidth = 8;
    g.strokeRect(6, 6, W - 12, H - 12);
    g.fillStyle = color;
    g.font = '600 92px "Oswald", "Impact", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 4);
  });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false }));
  spr.scale.set(3.2, 1.0, 1);
  return spr;
}

function buildCrossroads(root, ctx) {
  const rng = ctx.rng;
  root.add(skyDome(0x070b1c, 0x1d2443));
  ctx.scene.fog = new THREE.Fog(0x141a30, 18, 70);
  root.add(new THREE.HemisphereLight(0x5a6aa0, 0x10101a, 0.6));
  const moon = new THREE.DirectionalLight(0x9fb4ff, 0.8);
  moon.position.set(10, 20, 10);
  root.add(moon);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), stdMat(0x23242b, { roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  root.add(ground);

  const paths = [
    { id: 'studio', label: 'STUDIO', color: '#f3d28a', hex: 0xf3d28a, ang: 0.55 },
    { id: 'lavoro', label: 'LAVORO', color: '#8fc8ff', hex: 0x8fc8ff, ang: 0 },
    { id: 'strada', label: 'STRADA', color: '#ff6fae', hex: 0xff6fae, ang: -0.55 },
  ];
  const glowLights = [];
  for (const p of paths) {
    const dir = new THREE.Vector3(-Math.sin(p.ang), 0, -Math.cos(p.ang));
    const road = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 26), stdMat(0x3a3b42, { roughness: 0.8 }));
    road.rotation.x = -Math.PI / 2;
    road.rotation.z = p.ang;
    road.position.copy(dir.clone().multiplyScalar(13)).setY(0.01);
    root.add(road);
    for (let i = 0; i < 6; i++) {
      const lampPos = dir.clone().multiplyScalar(4 + i * 3.6);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: p.hex }));
      dot.position.copy(lampPos).setY(0.06);
      dot.position.addScaledVector(new THREE.Vector3(dir.z, 0, -dir.x), 1.4);
      root.add(dot);
    }
    const end = dir.clone().multiplyScalar(24);
    const light = new THREE.PointLight(p.hex, 40, 30, 2);
    light.position.copy(end).setY(3);
    root.add(light);
    glowLights.push(light);
    const sign = signSprite(p.label, p.color);
    sign.position.copy(dir.clone().multiplyScalar(7)).setY(2.6);
    root.add(sign);
    addBox(root, 0.08, 2.1, 0.08, stdMat(0x3a3a40), sign.position.x, 1.05, sign.position.z);

    const g = new THREE.Group();
    g.position.copy(end);
    g.rotation.y = p.ang;
    if (p.id === 'studio') {
      addBox(g, 9, 6, 6, stdMat(0xd8cfbf), 0, 3, -3);
      addBox(g, 10, 0.6, 7, stdMat(0xbfb5a2), 0, 6.3, -3);
      for (let i = -2; i <= 2; i++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 5, 12), stdMat(0xeee6d6));
        col.position.set(i * 1.8, 2.5, 0.6);
        g.add(col);
      }
      addBox(g, 2, 3, 0.1, new THREE.MeshBasicMaterial({ color: 0xffd98a }), 0, 1.5, 0.02);
    } else if (p.id === 'lavoro') {
      addBox(g, 10, 5, 7, stdMat(0x5f6b78, { metalness: 0.3 }), 0, 2.5, -3.5);
      addBox(g, 4.5, 3.5, 0.1, stdMat(0x9aa6b2, { metalness: 0.5 }), -1.5, 1.75, 0.02);
      addBox(g, 1.2, 0.5, 0.1, new THREE.MeshBasicMaterial({ color: 0x8fc8ff }), 3, 4, 0.05);
      addBox(g, 1.2, 2.2, 0.1, new THREE.MeshBasicMaterial({ color: 0xffe7b0 }), 3, 1.1, 0.03);
    } else {
      addBox(g, 3, 9, 10, stdMat(0x3a3036), -3.2, 4.5, -4);
      addBox(g, 3, 11, 10, stdMat(0x2f2a33), 3.2, 5.5, -4);
      for (let i = 0; i < 4; i++) {
        const neon = addBox(g, 0.08, 0.12, 2 + rng() * 2, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xff6fae : 0x5ff2ff }), i % 2 ? 1.68 : -1.68, 2.5 + i * 1.3, -2 - rng() * 4);
        neon.userData.neon = true;
      }
    }
    root.add(g);
  }

  const hero = makePerson({ height: 1.74, skin: ctx.skin, hair: ctx.hair, shirt: 0x2b2b30, pants: 0x34405a, sex: ctx.sex });
  hero.position.set(0, 0, 0.5);
  hero.rotation.y = Math.PI;
  root.add(hero);

  return {
    camFrom: [0.6, 1.9, 5.2], camTo: [0.2, 1.75, 2.9],
    lookFrom: [0, 1.4, -6], lookTo: [0, 1.6, -10],
    animate: (t) => {
      glowLights.forEach((l, i) => { l.intensity = 34 + Math.sin(t * 2 + i * 2) * 8; });
      hero.userData.head.rotation.y = Math.sin(t * 0.6) * 0.5;
    },
  };
}

function buildDoorway(root, ctx) {
  const w = 2.6, d = 12, h = 2.8;
  buildRoom(root, { w, d, h, wall: ctx.family.id === 'poor' ? 0x5d574a : 0x8a8170, floor: 0x3a352f, ceiling: 0x5a554c });
  root.add(new THREE.HemisphereLight(0xfff6e6, 0x221e1a, 0.25));
  // Porta aperta sul fondo
  const door = new THREE.Group();
  const frameMat = stdMat(0x3b2f26);
  addBox(door, 0.12, 2.2, 0.15, frameMat, -0.55, 1.1, 0);
  addBox(door, 0.12, 2.2, 0.15, frameMat, 0.55, 1.1, 0);
  addBox(door, 1.22, 0.12, 0.15, frameMat, 0, 2.2, 0);
  const leaf = new THREE.Group();
  addBox(leaf, 1.0, 2.1, 0.06, stdMat(0x6b4a32), 0.5, 1.05, 0);
  leaf.position.set(-0.5, 0, 0.05);
  leaf.rotation.y = 0.15;
  door.add(leaf);
  door.position.set(0, 0, -d / 2 + 0.02);
  root.add(door);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.1), new THREE.MeshBasicMaterial({ color: 0xfff6e2 }));
  // Davanti al muro di fondo, dentro il telaio: è la luce del mondo esterno.
  outside.position.set(0, 1.05, -d / 2 + 0.025);
  root.add(outside);
  const blast = new THREE.PointLight(0xfff1d6, 30, 0, 2);
  blast.position.set(0, 1.4, -d / 2 + 0.6);
  root.add(blast);
  // Corridoio: lampadina tenue + quadri
  const bulb = new THREE.PointLight(0xffc98a, 3, 0, 2);
  bulb.position.set(0, h - 0.3, 2);
  root.add(bulb);
  for (let i = 0; i < 3; i++) {
    addBox(root, 0.04, 0.6, 0.8, stdMat(0x2c2a28), -w / 2 + 0.03, 1.5, 2 - i * 3);
    addBox(root, 0.02, 0.5, 0.7, stdMat(new THREE.Color().setHSL(ctx.rng(), 0.3, 0.45)), -w / 2 + 0.06, 1.5, 2 - i * 3);
  }
  const hero = makePerson({ height: 1.76, skin: ctx.skin, hair: ctx.hair, shirt: 0x2f3440, pants: 0x232a38, sex: ctx.sex });
  hero.rotation.y = Math.PI;
  root.add(hero);
  // Valigia
  const bag = new THREE.Group();
  addBox(bag, 0.15, 0.45, 0.4, stdMat(0x6a4b2e), 0, 0, 0);
  bag.position.set(0.32, 0.75, 0);
  hero.add(bag);

  const startZ = 2.5, endZ = -d / 2 + 1.2;
  return {
    camFrom: [0.3, 1.75, 5], camTo: [0.2, 1.6, -1],
    lookFrom: [0, 1.4, -6], lookTo: [0, 1.3, -6.5],
    animate: (t, dt, k) => {
      const z = lerp(startZ, endZ, Ease.inOutSine(Math.min(1, k * 1.05)));
      hero.position.set(0, 0, z);
      const sw = Math.sin(t * 6) * 0.5;
      hero.userData.legL.rotation.x = sw;
      hero.userData.legR.rotation.x = -sw;
      hero.userData.armL.rotation.x = -sw * 0.6;
      leaf.rotation.y = lerp(0.15, 1.4, Ease.inOutCubic(clamp(k * 1.6 - 0.2, 0, 1)));
      blast.intensity = 30 + k * 120;
    },
  };
}

/* =====================================================================
   Eventi narrativi
   ===================================================================== */
const EVENTS = {
  infanzia: [
    { text: 'La prima parola di {name} è "{word}". Lo sa tutto il palazzo.', eff: { carisma: 2 } },
    { text: 'Una febbre altissima a tre anni: giorni di paura, ma {name} ne esce più forte.', eff: { resistenza: 3 } },
    { text: '{name} passa i pomeriggi a rincorrere piccioni e gatti: riflessi da predatore.', eff: { riflessi: 3 } },
    { text: 'Cade dall’altalena e si rialza senza piangere. "Testa dura", dicono i nonni.', eff: { resistenza: 2 } },
    { tiers: ['rich'], text: 'Asilo bilingue e lezioni di musica a quattro anni.', eff: { carisma: 3 }, tag: 'Infanzia privilegiata' },
    { tiers: ['rich'], text: 'Il primo viaggio in aereo, a tre anni: {name} dorme per tutto il volo.', eff: { carisma: 1, riflessi: 1 } },
    { tiers: ['middle'], text: 'Domeniche al parco con i genitori e il gelato come premio.', eff: { carisma: 2 } },
    { tiers: ['middle', 'worker'], text: 'Arriva un fratellino: {name} impara presto a dividere i giochi.', eff: { carisma: 2 } },
    { tiers: ['worker'], text: 'Papà fa i turni di notte: {name} cresce tra le storie della nonna.', eff: { resistenza: 2 } },
    { tiers: ['worker', 'poor'], text: 'I giocattoli sono quasi tutti di seconda mano, ma vanno benissimo lo stesso.', eff: { resistenza: 2 } },
    { tiers: ['poor'], text: 'Lo sfratto a quattro anni: due mesi ospiti da una zia, tutti in una stanza.', eff: { resistenza: 4 }, tag: 'Sfrattat{o} da piccol{o}' },
    { tiers: ['poor'], text: 'Il cortile del palazzo è l’unico parco giochi: si impara a cavarsela da soli.', eff: { riflessi: 3, resistenza: 1 } },
  ],
  scuola: [
    { text: 'Il primo giorno di scuola {name} non lascia la mano della mamma per un’ora intera.', eff: { carisma: 1 } },
    { text: 'Una rissa in cortile per difendere un compagno: nota sul diario, ma rispetto di tutti.', eff: { resistenza: 2, carisma: 2 } },
    { text: 'Scopre il calcio: ogni pomeriggio fino al tramonto.', eff: { resistenza: 2, riflessi: 2 } },
    { text: 'Una maestra nota il talento di {name} per i numeri e non lo dimentica più.', eff: { carisma: 2 } },
    { tiers: ['rich'], text: 'Scuola privata internazionale: inglese fluente a otto anni.', eff: { carisma: 3, money: 1500 }, tag: 'Scuola privata' },
    { tiers: ['rich'], text: 'Lezioni di tennis e settimane bianche ogni inverno.', eff: { riflessi: 2 } },
    { tiers: ['middle'], text: 'Pagella sempre sopra la media: i disegni di {name} finiscono appesi in cucina.', eff: { carisma: 2 } },
    { tiers: ['worker'], text: 'D’estate aiuta lo zio al mercato: le prime monete guadagnate.', eff: { money: 200, carisma: 1 } },
    { tiers: ['poor'], text: 'Classi da trenta alunni e libri usati: chi vuole imparare deve sgomitare.', eff: { resistenza: 3 } },
    { tiers: ['poor', 'worker'], text: 'Spesso salta la merenda: impara presto il valore di ogni moneta.', eff: { resistenza: 2, money: 50 } },
  ],
  adolescenza: [
    { text: 'Il primo amore, la prima delusione. {name} scrive canzoni che nessuno sentirà mai.', eff: { carisma: 3 } },
    { text: 'Un motorino truccato e una multa memorabile.', eff: { riflessi: 3, money: -150 } },
    { text: 'Il gruppo di amici del quartiere diventa una seconda famiglia.', eff: { carisma: 2, resistenza: 1 } },
    { text: 'Una notte al pronto soccorso dopo una caduta in skate. Due punti, zero rimpianti.', eff: { resistenza: 3 } },
    { tiers: ['rich'], text: 'Vacanza studio all’estero: torna con un accento nuovo e tanta sicurezza.', eff: { carisma: 4, money: 2000 }, tag: 'Vacanze studio all’estero' },
    { tiers: ['rich'], text: 'Per i quindici anni arriva un’auto elettrica… che non può ancora guidare.', eff: { money: 3000 } },
    { tiers: ['middle'], text: 'Primo telefono tutto suo: {name} diventa il re dei gruppi chat.', eff: { carisma: 2 } },
    { tiers: ['middle', 'worker'], text: 'Lavoretti nel weekend in un bar del centro.', eff: { money: 800, resistenza: 1 }, tag: 'Lavoretti da ragazz{o}' },
    { tiers: ['poor'], text: 'Fa da palo per i ragazzi più grandi: soldi facili e un brutto presentimento.', eff: { riflessi: 4, money: 600 }, tag: 'Primi giri sbagliati' },
    { tiers: ['poor', 'worker'], text: 'Si allena da sol{o} nella palestra popolare: l’unico posto sicuro del quartiere.', eff: { resistenza: 4 } },
  ],
};

const CHOICES = [
  {
    id: 'studio', key: '1', label: 'STUDIO', desc: 'Libri, esami, borse di studio. Lunga ma solida.',
    eff: { carisma: 4, riflessi: 1, money: 300 },
    outcome: '{name} si butta sui libri: diploma con lode e una borsa di studio.', tag: 'Diplomat{o} con lode',
  },
  {
    id: 'lavoro', key: '2', label: 'LAVORO', desc: 'Officina, cantiere o bancone: soldi veri, subito.',
    eff: { resistenza: 5, money: 2600 },
    outcome: 'Lavora nei weekend e d’estate: mani rovinate, ma il conto in banca cresce.', tag: 'Lavoratore precoce',
  },
  {
    id: 'strada', key: '3', label: 'STRADA', desc: 'Amicizie pericolose, affari rapidi, reputazione.',
    eff: { riflessi: 6, carisma: 2, resistenza: -1, money: 3200 },
    outcome: 'Impara le regole della strada: contatti, scorciatoie e qualche guaio.', tag: 'Conosciut{o} in strada',
  },
];

const HOSPITAL_NAMES = {
  premium: 'Clinica privata Villa Aurora',
  standard: 'Ospedale Generale',
  public: 'Ospedale Civico',
  poor: 'Presidio ospedaliero di quartiere',
};
const HOSPITAL_LINES = {
  premium: 'Fiori, una suite tutta per la famiglia e un pediatra sempre presente.',
  standard: 'I nonni sono già in corridoio con i palloncini.',
  public: 'Sei letti in una stanza, un ventilatore che gira piano e tanta speranza.',
  poor: 'La luce sfarfalla e i letti sono tutti occupati, ma il pianto è forte e chiaro.',
};

/* =====================================================================
   LifeStory
   ===================================================================== */
export class LifeStory {
  constructor({ renderer, birth, onFinish }) {
    this.renderer = renderer;
    this.birth = birth;
    this.onFinish = onFinish;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 500);
    this.content = null;
    this.rng = seededRandom((birth.seed ^ 0x5f3759df) >>> 0);
    this.state = { stats: { ...birth.genetics }, moneyDelta: 0, path: null, tags: [] };
    this.finished = false;
    this.index = -1;
    this.t = 0;
    this.view = null;
    this._look = new THREE.Vector3();

    const day = 1 + Math.floor(this.rng() * 28);
    this.birthDay = day;
    this.birthMonth = Math.floor(this.rng() * 12);

    this.ui = {
      root: $('story-ui'),
      chapter: $('story-chapter'),
      title: $('story-title'),
      age: $('story-age'),
      text: $('story-text'),
      choices: $('story-choices'),
      buttons: $('sc-buttons'),
      timer: $('sc-timer-bar'),
      fade: $('story-fade'),
    };
    this.ui.text.innerHTML = '';
    this.ui.choices.classList.add('hidden');
    this.ui.fade.style.opacity = '0';
    this.ui.root.classList.remove('hidden');

    this._onKey = (e) => {
      if (!this.awaitingChoice) return;
      const c = CHOICES.find((x) => e.code === 'Digit' + x.key || e.code === 'Numpad' + x.key);
      if (c) { e.preventDefault(); this.choose(c.id); }
    };
    window.addEventListener('keydown', this._onKey);

    this.stages = this.createStages();
    this.nextStage();
  }

  /* ---------- Testo ---------- */
  fmt(text) {
    const b = this.birth;
    const o = b.sex === 'f' ? 'a' : 'o';
    return text
      .replace(/\{name\}/g, b.name)
      .replace(/\{city\}/g, b.city.city)
      .replace(/\{o\}/g, o)
      .replace(/\{lui\}/g, b.sex === 'f' ? 'lei' : 'lui')
      .replace(/\{word\}/g, ['pappa', 'no', 'palla', 'ciao', 'mamma', 'nanna'][Math.floor(this.rng() * 6)]);
  }

  pickEvents(pool, n) {
    const tier = this.birth.family.id;
    const list = EVENTS[pool].filter((e) => !e.tiers || e.tiers.includes(tier));
    const chosen = [];
    while (chosen.length < n && list.length) {
      const i = Math.floor(this.rng() * list.length);
      chosen.push(list.splice(i, 1)[0]);
    }
    return chosen.map((e) => ({ text: this.fmt(e.text), eff: e.eff, tag: e.tag ? this.fmt(e.tag) : null }));
  }

  createStages() {
    const b = this.birth;
    const dateStr = `${this.birthDay} ${MONTHS[this.birthMonth]} ${b.birthYear}`;
    return [
      {
        chapter: 'CAPITOLO I', title: 'La nascita', from: 0, to: 0, build: buildHospital,
        makeLines: () => [
          { text: `${dateStr}. ${HOSPITAL_NAMES[b.family.hospital]}, ${b.city.city}.` },
          { text: `Nasce ${b.name} ${b.surname}: ${b.weightKg.toFixed(2).replace('.', ',')} kg, gruppo ${b.blood}.` },
          { text: HOSPITAL_LINES[b.family.hospital] },
        ],
      },
      { chapter: 'CAPITOLO II', title: 'Infanzia', from: 1, to: 5, build: buildHome, makeLines: () => this.pickEvents('infanzia', 2) },
      { chapter: 'CAPITOLO III', title: 'Gli anni della scuola', from: 6, to: 10, build: buildSchool, makeLines: () => this.pickEvents('scuola', 2) },
      { chapter: 'CAPITOLO IV', title: 'Adolescenza', from: 11, to: 15, build: buildStreet, makeLines: () => this.pickEvents('adolescenza', 2) },
      {
        chapter: 'CAPITOLO V', title: 'Le prime scelte', from: 16, to: 17, build: buildCrossroads, choice: true,
        makeLines: () => [{ text: `A sedici anni ${b.name} si ritrova davanti a un bivio. Nessuno può scegliere al posto suo.` }],
      },
      {
        chapter: 'CAPITOLO VI', title: 'Diciotto anni', from: 18, to: 18, build: buildDoorway, last: true,
        makeLines: () => {
          const path = this.state.path || 'lavoro';
          const summary = {
            studio: 'Diploma in tasca e grandi aspettative.',
            lavoro: 'Esperienza da vendere e qualche risparmio da parte.',
            strada: `Conosce ogni vicolo di ${b.city.city}, e ogni vicolo conosce ${b.sex === 'f' ? 'lei' : 'lui'}.`,
          }[path];
          return [
            { text: `${this.birthDay} ${MONTHS[this.birthMonth]} ${b.birthYear + 18}. ${b.name} compie diciotto anni. ${summary}` },
            { text: `Qualche mese fa mamma e papà se ne sono andati insieme, in un incidente. Da oggi ${b.name} è ${b.sex === 'f' ? 'sola' : 'solo'} al mondo, ma porta con sé tutto il loro amore.` },
            { text: `Patrimonio iniziale: ${formatMoney(this.finalMoney())}. La porta si apre: ${b.city.city} ti aspetta.` },
          ];
        },
      },
    ];
  }

  ensureLines(st) {
    if (!st.lines) {
      st.lines = st.makeLines();
      st.lineTimes = st.lines.map((_, i) => 0.9 + i * 2.7);
      const lastLine = st.lineTimes.length ? st.lineTimes[st.lineTimes.length - 1] : 0;
      st.choiceAt = lastLine + 1.6;
      st.duration = st.choice ? st.choiceAt + 0.1 : Math.max(6.5, lastLine + 3.4);
    }
  }

  /* ---------- Effetti ---------- */
  applyEffect(eff, tag) {
    if (!eff && !tag) return '';
    const parts = [];
    if (eff) {
      for (const k of STAT_KEYS) {
        if (eff[k]) {
          this.state.stats[k] = clamp(this.state.stats[k] + eff[k], 1, 100);
          parts.push(`${eff[k] > 0 ? '+' : ''}${eff[k]} ${STAT_SHORT[k]}`);
        }
      }
      if (eff.money) {
        this.state.moneyDelta += eff.money;
        parts.push(`${eff.money > 0 ? '+' : '−'}${formatMoney(Math.abs(eff.money))}`);
      }
    }
    if (tag && !this.state.tags.includes(tag)) this.state.tags.push(tag);
    return parts.join(' · ');
  }

  finalMoney() {
    const b = this.birth;
    return Math.max(20, Math.round(b.baseMoney * b.city.moneyMult + this.state.moneyDelta));
  }

  /* ---------- Flusso delle tappe ---------- */
  nextStage() {
    this.index++;
    const st = this.stages[this.index];
    this.stage = st;
    this.ensureLines(st);
    this.t = 0;
    this.animT = 0;
    this.lineIdx = 0;
    this.choiceShown = false;
    this.awaitingChoice = false;

    if (this.content) {
      this.scene.remove(this.content);
      disposeObject3D(this.content);
    }
    this.scene.fog = null;
    this.scene.background = new THREE.Color(0x000000);
    this.content = new THREE.Group();
    this.scene.add(this.content);
    const b = this.birth;
    const ctx = {
      scene: this.scene, rng: this.rng, family: b.family, city: b.city, sex: b.sex, skin: b.skin, hair: b.hair,
      birthYear: b.birthYear, motherSkin: b.mother ? b.mother.skin : b.skin, fatherSkin: b.father ? b.father.skin : b.skin,
      randomSkin: () => [0xf3d3b8, 0xe7bc98, 0xd29f78, 0xb7835b, 0x8d5a3b, 0x6b4129][Math.floor(this.rng() * 6)],
    };
    this.view = st.build(this.content, ctx);

    this.ui.chapter.textContent = st.chapter;
    this.ui.title.textContent = st.title;
    for (const el of [this.ui.chapter, this.ui.title]) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'lineIn 0.9s cubic-bezier(0.22,1,0.36,1) both';
    }
    this.ui.text.innerHTML = '';
    this.ui.age.textContent = String(st.from);
    this.applyCamera(0);
  }

  applyCamera(k) {
    const v = this.view;
    if (!v) return;
    const e = Ease.inOutSine(k);
    this.camera.position.set(lerp(v.camFrom[0], v.camTo[0], e), lerp(v.camFrom[1], v.camTo[1], e), lerp(v.camFrom[2], v.camTo[2], e));
    this._look.set(lerp(v.lookFrom[0], v.lookTo[0], e), lerp(v.lookFrom[1], v.lookTo[1], e), lerp(v.lookFrom[2], v.lookTo[2], e));
    this.camera.lookAt(this._look);
  }

  showLine(line) {
    const effText = line.applied ? '' : this.applyEffect(line.eff, line.tag);
    line.applied = true;
    for (const old of this.ui.text.querySelectorAll('.story-line')) old.classList.add('old');
    const div = document.createElement('div');
    div.className = 'story-line';
    div.textContent = line.text;
    if (effText) {
      const s = document.createElement('span');
      s.className = 'eff';
      s.textContent = effText;
      div.appendChild(s);
    }
    this.ui.text.appendChild(div);
    while (this.ui.text.children.length > 3) this.ui.text.removeChild(this.ui.text.firstChild);
  }

  showChoice() {
    this.awaitingChoice = true;
    this.choiceTime = 10;
    this.ui.buttons.innerHTML = '';
    for (const c of CHOICES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sc-btn';
      btn.innerHTML = `<kbd>${c.key}</kbd><b>${c.label}</b><span>${c.desc}</span>`;
      btn.addEventListener('click', () => this.choose(c.id));
      this.ui.buttons.appendChild(btn);
    }
    this.ui.timer.style.transform = 'scaleX(1)';
    this.ui.choices.classList.remove('hidden');
  }

  defaultChoice() {
    const s = this.state.stats;
    if (s.carisma >= s.resistenza && s.carisma >= s.riflessi) return 'studio';
    if (s.resistenza >= s.riflessi) return 'lavoro';
    return 'strada';
  }

  /** Applica la scelta; se silent non aggiunge testo (usato dallo skip). */
  choose(id, silent = false) {
    if (this.state.path) return;
    const c = CHOICES.find((x) => x.id === id) || CHOICES[1];
    this.state.path = c.id;
    this.awaitingChoice = false;
    this.ui.choices.classList.add('hidden');
    const line = { text: this.fmt(c.outcome), eff: c.eff, tag: this.fmt(c.tag) };
    if (silent) {
      this.applyEffect(line.eff, line.tag);
      return;
    }
    const st = this.stage;
    st.lines.push(line);
    st.lineTimes.push(this.t + 0.3);
    st.duration = this.t + 3.6;
  }

  update(dt) {
    if (this.finished || !this.stage) return;
    const st = this.stage;

    if (this.awaitingChoice) {
      this.choiceTime -= dt;
      this.ui.timer.style.transform = `scaleX(${Math.max(0, this.choiceTime / 10)})`;
      if (this.choiceTime <= 0) this.choose(this.defaultChoice());
    } else {
      this.t += dt;
    }

    while (this.lineIdx < st.lines.length && this.t >= st.lineTimes[this.lineIdx]) {
      this.showLine(st.lines[this.lineIdx]);
      this.lineIdx++;
    }
    if (st.choice && !this.choiceShown && this.t >= st.choiceAt) {
      this.choiceShown = true;
      this.showChoice();
    }

    // Durata visiva della tappa (durante la scelta la camera resta ferma, le animazioni no)
    this.animT += dt;
    const visualDur = st.choice ? Math.max(st.duration, st.choiceAt + 4) : st.duration;
    const k = clamp(this.t / visualDur, 0, 1);
    const span = st.to - st.from;
    const age = span === 0 ? st.from : Math.min(st.to, st.from + Math.floor((span + 1) * k));
    this.ui.age.textContent = String(age);
    this.applyCamera(k);
    if (this.view && this.view.animate) this.view.animate(this.animT, dt, k);

    // Dissolvenze tra le tappe
    let fade = 0;
    if (this.index > 0 && this.t < 0.7) fade = 1 - this.t / 0.7;
    const remaining = st.duration - this.t;
    if (!st.last && !this.awaitingChoice && !(st.choice && !this.state.path) && remaining < 0.6) fade = Math.max(fade, 1 - remaining / 0.6);
    this.ui.fade.style.opacity = String(clamp(fade, 0, 1));

    const canEnd = !st.choice || this.state.path;
    if (canEnd && this.t >= st.duration) {
      if (st.last) this.finish();
      else this.nextStage();
    }
  }

  /** Salta direttamente ai 18 anni applicando tutti gli effetti rimanenti. */
  skip() {
    if (this.finished) return;
    for (let i = Math.max(0, this.index); i < this.stages.length; i++) {
      const st = this.stages[i];
      if (st.last) continue; // il testo finale non ha effetti
      this.ensureLines(st);
      for (const line of st.lines) {
        if (!line.applied) {
          this.applyEffect(line.eff, line.tag);
          line.applied = true;
        }
      }
      if (st.choice && !this.state.path) this.choose(this.defaultChoice(), true);
    }
    this.finish();
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.awaitingChoice = false;
    this.ui.choices.classList.add('hidden');
    const b = this.birth;
    const stats = {};
    for (const k of STAT_KEYS) stats[k] = Math.round(clamp(this.state.stats[k], 1, 100));
    const character = {
      name: b.name,
      surname: b.surname,
      sex: b.sex,
      cityId: b.cityId,
      familyId: b.familyId,
      birthYear: b.birthYear,
      birthday: { day: this.birthDay, month: this.birthMonth },
      stats,
      money: this.finalMoney(),
      startMoney: this.finalMoney(),
      // Tratti della "placenta" (selezione biologica) mostrati nella scheda personaggio
      birth: {
        weightKg: b.weightKg,
        blood: b.blood,
        bpm: b.bpm,
        genetics: { ...b.genetics },
      },
      path: this.state.path || 'lavoro',
      background: this.state.tags.slice(0, 8),
      skin: b.skin,
      hair: b.hair,
      height: b.height,
      hairStyle: b.hairStyle,
      region: b.region,
      // Orfano a 18 anni: i genitori restano nei ricordi (scena del Paradiso)
      orphan: true,
      parents: { mother: b.mother || null, father: b.father || null },
    };
    this.onFinish(character);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    if (this.content) {
      this.scene.remove(this.content);
      disposeObject3D(this.content);
    }
    this.ui.root.classList.add('hidden');
    this.ui.choices.classList.add('hidden');
    this.ui.text.innerHTML = '';
    this.ui.fade.style.opacity = '0';
  }
}
