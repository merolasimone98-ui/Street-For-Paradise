// Città procedurale open-world (grafica Three.js + collisioni Cannon-es) e ciclo giorno/notte.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { seededRandom } from './birthdata.js';
import { buildLandmark, CITY_STYLE } from './landmarks.js';

export const BLOCK = 44;
export const ROAD = 14;
export const GRID = 7;
export const CELL = BLOCK + ROAD;
export const HALF = (GRID * CELL) / 2;
const SIDEWALK_H = 0.2;
const TILE_W = 16; // metri coperti da una ripetizione della texture di facciata
const TILE_H = 14;

export const DISTRICTS = {
  rich: { id: 'rich', name: 'Quartiere Alto', style: 'glass', minH: 26, maxH: 78, lots: [1, 2], sidewalk: 0xc4bfb4, trees: true },
  middle: { id: 'middle', name: 'Centro', style: 'concrete', minH: 14, maxH: 36, lots: [2, 2], sidewalk: 0xaaa59b, trees: true },
  worker: { id: 'worker', name: 'Zona Industriale', style: 'industrial', minH: 7, maxH: 14, lots: [2, 2], sidewalk: 0x8f8b83, trees: false },
  poor: { id: 'poor', name: 'Periferia', style: 'brick', minH: 9, maxH: 22, lots: [2, 3], sidewalk: 0x7f7b73, trees: false },
};

const SPAWN_ROW = { rich: 1, middle: 3, worker: 4, poor: 5 };
const SPAWN_COL = 3;

/** Edifici accessibili con [E]. */
export const BUILDING_TYPES = {
  home: { name: 'Casa', sign: null, w: 16, d: 14 },
  hospital: { name: 'Ospedale', sign: null, w: 30, d: 24, h: 22 },
  market: { name: 'Minimarket', sign: 'MINIMARKET', signColor: '#7dff9a', signBg: 'rgba(16,60,36,0.95)', w: 18, d: 12, h: 6, style: 'concrete' },
  bank: { name: 'Banca', sign: 'BANCA', signColor: '#f0c860', signBg: 'rgba(30,22,12,0.95)', w: 20, d: 16, h: 18, style: 'glass' },
  bar: { name: 'Locale "Paradise"', sign: 'PARADISE', signColor: '#ff6fae', signBg: 'rgba(10,6,12,0.95)', w: 14, d: 12, h: 9, style: 'brick' },
  garage: { name: 'Concessionario', sign: 'CONCESSIONARIO', signColor: '#8fd0ff', signBg: 'rgba(10,20,32,0.95)', w: 24, d: 16, h: 8, style: 'industrial' },
  weapons: { name: 'Armeria', sign: 'ARMERIA', signColor: '#ff9a4a', signBg: 'rgba(24,14,8,0.95)', w: 14, d: 12, h: 7, style: 'brick' },
  clothing: { name: 'Boutique abbigliamento', sign: 'BOUTIQUE', signColor: '#f5e6ff', signBg: 'rgba(30,18,40,0.95)', w: 18, d: 13, h: 10, style: 'glass' },
  pharmacy: { name: 'Farmacia', sign: '✚ FARMACIA', signColor: '#5dff8a', signBg: 'rgba(6,30,14,0.95)', w: 14, d: 12, h: 9, style: 'concrete' },
  restaurant: { name: 'Trattoria del Porto', sign: 'RISTORANTE', signColor: '#ffd27a', signBg: 'rgba(40,14,10,0.95)', w: 18, d: 14, h: 9, style: 'brick' },
  pizzeria: { name: 'Pizzeria Vesuvio', sign: 'PIZZERIA', signColor: '#ff6a4d', signBg: 'rgba(16,40,20,0.95)', w: 16, d: 13, h: 8, style: 'brick' },
  church: { name: 'Chiesa di San Michele', sign: null, w: 18, d: 26, h: 14, style: 'concrete' },
  police: { name: 'Stazione di Polizia', sign: 'POLIZIA', signColor: '#8fc0ff', signBg: 'rgba(10,20,50,0.95)', w: 22, d: 14, h: 12, style: 'concrete' },
};

/** Icone/colori per minimappa e mappa grande. */
export const MAP_ICONS = {
  home: { color: '#f0b43c', letter: 'C' }, hospital: { color: '#ff5a5a', letter: 'H' }, market: { color: '#7dff9a', letter: 'M' },
  bank: { color: '#f0c860', letter: '€' }, bar: { color: '#ff6fae', letter: 'B' }, garage: { color: '#8fd0ff', letter: 'V' },
  weapons: { color: '#ff9a4a', letter: 'A' }, clothing: { color: '#d9b8ff', letter: 'S' }, pharmacy: { color: '#5dff8a', letter: '+' },
  restaurant: { color: '#ffd27a', letter: 'R' }, pizzeria: { color: '#ff6a4d', letter: 'P' }, church: { color: '#ffffff', letter: '†' },
  police: { color: '#8fc0ff', letter: 'Π' }, atm: { color: '#7fd0ff', letter: '$' },
};

function signTexture(text, color, bg) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 256);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(10, 10, 1004, 236);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 28;
  g.font = '600 140px "Oswald", "Impact", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 512, 134);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function districtForRow(row) {
  if (row <= 1) return DISTRICTS.rich;
  if (row <= 3) return DISTRICTS.middle;
  if (row === 4) return DISTRICTS.worker;
  return DISTRICTS.poor;
}

const blockCenter = (i) => -HALF + i * CELL + CELL / 2;

/* ---------- Texture procedurali ---------- */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function facadeTextures(style, rng) {
  const W = 512, H = 448;
  const cols = 4, rows = 4;
  const cw = W / cols, rh = H / rows;
  const map = makeCanvas(W, H), emi = makeCanvas(W, H);
  const g = map.getContext('2d'), e = emi.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, W, H);

  if (style === 'glass') {
    g.fillStyle = '#9fb0bf';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const grd = g.createLinearGradient(c * cw, r * rh, c * cw + cw, r * rh + rh);
      grd.addColorStop(0, '#5f7488');
      grd.addColorStop(1, '#3a4b5c');
      g.fillStyle = grd;
      g.fillRect(c * cw + 4, r * rh + 4, cw - 8, rh - 10);
      if (rng() < 0.42) { e.fillStyle = rng() < 0.5 ? '#ffe2a8' : '#cfe3ff'; e.fillRect(c * cw + 4, r * rh + 4, cw - 8, rh - 10); }
    }
  } else if (style === 'concrete') {
    g.fillStyle = '#d9d4ca';
    g.fillRect(0, 0, W, H);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = '#b7b1a6';
      g.fillRect(c * cw + 18, r * rh + 18, cw - 36, rh - 30);
      g.fillStyle = '#39424d';
      g.fillRect(c * cw + 24, r * rh + 24, cw - 48, rh - 42);
      g.fillStyle = '#c9c3b8';
      g.fillRect(c * cw + 14, r * rh + rh - 14, cw - 28, 6);
      if (rng() < 0.38) { e.fillStyle = '#ffd590'; e.fillRect(c * cw + 24, r * rh + 24, cw - 48, rh - 42); }
    }
  } else if (style === 'brick') {
    g.fillStyle = '#b9b2a6';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 10) for (let x = (y / 10) % 2 ? -12 : 0; x < W; x += 24) {
      const v = 160 + Math.floor(rng() * 50);
      g.fillStyle = `rgb(${v},${v - 8},${v - 18})`;
      g.fillRect(x + 1, y + 1, 22, 8);
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      g.fillStyle = '#2b2f35';
      g.fillRect(c * cw + 36, r * rh + 30, cw - 72, rh - 52);
      g.fillStyle = '#8d8478';
      g.fillRect(c * cw + 30, r * rh + rh - 24, cw - 60, 6);
      if (rng() < 0.3) { e.fillStyle = '#ffc878'; e.fillRect(c * cw + 36, r * rh + 30, cw - 72, rh - 52); }
      if (rng() < 0.15) { g.fillStyle = 'rgba(40,40,35,0.35)'; g.fillRect(c * cw + rng() * cw, r * rh, 20 + rng() * 40, rh); }
    }
  } else {
    // industriale: lamiera ondulata con finestre a nastro
    g.fillStyle = '#b8bcbf';
    g.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 8) { g.fillStyle = x % 16 ? '#a7abaf' : '#c4c8cb'; g.fillRect(x, 0, 4, H); }
    for (let r = 0; r < rows; r++) {
      g.fillStyle = '#3b444d';
      g.fillRect(0, r * rh + 14, W, 26);
      if (rng() < 0.4) { e.fillStyle = '#d8ecff'; e.fillRect(0, r * rh + 14, W, 26); }
    }
  }
  const tMap = new THREE.CanvasTexture(map);
  tMap.colorSpace = THREE.SRGBColorSpace;
  const tEmi = new THREE.CanvasTexture(emi);
  tEmi.colorSpace = THREE.SRGBColorSpace;
  for (const t of [tMap, tEmi]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map: tMap, emissive: tEmi };
}

function noiseTexture(base, variance, size = 256, repeat = 1, rng = Math.random, lines = false) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const col = new THREE.Color(base);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const n = (rng() - 0.5) * variance;
    img.data[i * 4] = THREE.MathUtils.clamp(col.r * 255 + n, 0, 255);
    img.data[i * 4 + 1] = THREE.MathUtils.clamp(col.g * 255 + n, 0, 255);
    img.data[i * 4 + 2] = THREE.MathUtils.clamp(col.b * 255 + n, 0, 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  if (lines) {
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    for (let p = 0; p <= size; p += size / 4) {
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

function buildingGeometry(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const snap = (v) => Math.max(0.25, Math.round(v * 4) / 4);
  for (let face = 0; face < 6; face++) {
    let su, sv;
    if (face === 0 || face === 1) { su = snap(d / TILE_W); sv = h / TILE_H; }
    else if (face === 4 || face === 5) { su = snap(w / TILE_W); sv = h / TILE_H; }
    else { su = w / 10; sv = d / 10; }
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  return geo;
}

/* =====================================================================
   CityWorld
   ===================================================================== */
export class CityWorld {
  /**
   * @param {THREE.Scene} scene
   * @param {CANNON.World} physics
   * @param {{ city: object, familyId: string, seed: number }} opts
   */
  constructor(scene, physics, { city, familyId, seed }) {
    this.scene = scene;
    this.physics = physics;
    this.city = city;
    this.familyId = familyId;
    this.rng = seededRandom(seed >>> 0);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.collidables = []; // mesh per il raycast della camera
    this.bodies = [];
    this.windowMaterials = [];
    this.doors = [];
    this.doorRings = [];
    this.mapData = { blocks: [], buildings: [], home: null, hospital: null, doors: [] };
    const homeRow = SPAWN_ROW[familyId] ?? 3;
    this.style = CITY_STYLE[city.id] || {};
    this.atms = [];
    this.parkingSpots = [];
    this.dealerSpot = null;
    // Blocchi con edifici speciali. Le righe 0, 2 e 6 non ospitano mai la casa (righe 1, 3, 4, 5).
    this.features = {
      [`${homeRow},${SPAWN_COL}`]: 'home',
      [`${homeRow},2`]: 'market',
      [`${homeRow},4`]: 'bar',
      '2,5': 'hospital',
      '2,1': { south: 'bank', north: 'pharmacy' },
      '2,3': 'church',
      '2,4': 'restaurant',
      '0,3': { south: 'clothing', north: 'police' },
      '6,3': { south: 'garage', north: 'weapons' },
      '6,5': { south: 'pizzeria', north: 'pharmacy' },
    };

    this.staticMaterial = new CANNON.Material('static');

    this.buildMaterials();
    this.buildGround();
    this.buildBlocks();
    this.buildRoadMarkings();
    this.buildStreetProps();
    this.buildAtms();
    this.buildBounds();
    this.buildSky();
    const lm = buildLandmark(city.id, HALF);
    this.landmark = lm.group;
    this.root.add(this.landmark);
  }

  /** Bancomat sui marciapiedi (uno accanto alla banca + altri sparsi). */
  buildAtms() {
    const spots = [];
    const bankDoor = this.doors.find((d) => d.type === 'bank');
    if (bankDoor) spots.push({ x: bankDoor.x + 4.5, z: bankDoor.z + bankDoor.nz * 0.35, nz: bankDoor.nz });
    const picks = [[1, 1], [3, 5], [4, 2], [5, 4], [3, 0], [0, 5], [6, 1], [5, 6]];
    for (const [r, c] of picks) {
      const cx = blockCenter(c), cz = blockCenter(r);
      spots.push({ x: cx + 3, z: cz + BLOCK / 2 - 0.9, nz: -1 });
    }
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.6, roughness: 0.35 });
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x3fa9ff, emissiveIntensity: 0.9 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x7fd0ff, emissiveIntensity: 0.8 });
    for (const s of spots) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.6), bodyMat);
      box.position.y = 0.85;
      box.castShadow = true;
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.02), screenMat);
      screen.position.set(0, 1.28, 0.31);
      screen.rotation.x = -0.25;
      const keypad = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 0.22), new THREE.MeshStandardMaterial({ color: 0x8a9099, metalness: 0.7 }));
      keypad.position.set(0, 1.02, 0.36);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.62), topMat);
      top.position.y = 1.79;
      g.add(box, screen, keypad, top);
      g.position.set(s.x, SIDEWALK_H, s.z);
      // Lo schermo guarda verso il lato da cui arriva il giocatore
      g.rotation.y = s.nz > 0 ? 0 : Math.PI;
      this.root.add(g);
      this.addStaticBox(s.x, SIDEWALK_H + 0.85, s.z, 0.45, 0.85, 0.3);
      const front = { x: s.x, z: s.z + (s.nz > 0 ? 0.9 : -0.9) };
      this.atms.push({ x: front.x, z: front.z, mx: s.x, mz: s.z });
    }
    this.windowMaterials.push(topMat);
  }

  /* ---------- Fisica ---------- */
  addStaticBox(x, y, z, hx, hy, hz) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    body.position.set(x, y, z);
    this.physics.addBody(body);
    this.bodies.push(body);
    return body;
  }

  /* ---------- Materiali ---------- */
  buildMaterials() {
    const rng = this.rng;
    this.styleMaterials = {};
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.95 });
    const palette = this.city.palette;
    for (const style of ['glass', 'concrete', 'brick', 'industrial']) {
      const tex = facadeTextures(style, rng);
      const mats = [];
      const variants = style === 'glass' ? [0xffffff, 0xdfe8f0, 0xcfd9e2] : palette.slice(0, 5);
      for (const col of variants) {
        const m = new THREE.MeshStandardMaterial({
          color: col,
          map: tex.map,
          bumpMap: tex.map,
          bumpScale: style === 'glass' ? 0.3 : 1.2,
          emissive: 0xffffff,
          emissiveMap: tex.emissive,
          emissiveIntensity: 0,
          roughness: style === 'glass' ? 0.35 : 0.9,
          metalness: style === 'glass' ? 0.35 : 0,
        });
        mats.push(m);
        this.windowMaterials.push(m);
      }
      this.styleMaterials[style] = mats;
    }
  }

  pickMaterialArray(style) {
    const list = this.styleMaterials[style];
    const side = list[Math.floor(this.rng() * list.length)];
    return [side, side, this.roofMat, this.roofMat, side, side];
  }

  /* ---------- Terreno ---------- */
  buildGround() {
    const size = HALF * 2 + 600;
    const asphalt = noiseTexture(0x3b3d41, 26, 256, size / 12, this.rng);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0xffffff, map: asphalt, bumpMap: asphalt, bumpScale: 0.9, roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.groundMesh = ground;

    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physics.addBody(body);
    this.bodies.push(body);
  }

  buildBlocks() {
    const rng = this.rng;
    const sidewalkTex = noiseTexture(0xffffff, 30, 256, BLOCK / 4, rng, true);
    const sidewalkGeo = new THREE.BoxGeometry(BLOCK, SIDEWALK_H, BLOCK);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: sidewalkTex, bumpMap: sidewalkTex, bumpScale: 1.0, roughness: 0.85 });
    const sidewalks = new THREE.InstancedMesh(sidewalkGeo, sidewalkMat, GRID * GRID);
    sidewalks.receiveShadow = true;
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x5f8a45, roughness: 1, map: noiseTexture(0x5f8a45, 40, 128, 8, rng) });
    this.treeSpots = [];
    this.benchSpots = [];

    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let idx = 0;

    for (let row = 0; row < GRID; row++) {
      for (let c = 0; c < GRID; c++) {
        const cx = blockCenter(c);
        const cz = blockCenter(row);
        const dist = districtForRow(row);
        m4.makeTranslation(cx, SIDEWALK_H / 2, cz);
        sidewalks.setMatrixAt(idx, m4);
        sidewalks.setColorAt(idx, col.set(dist.sidewalk));
        idx++;
        this.addStaticBox(cx, SIDEWALK_H / 2, cz, BLOCK / 2, SIDEWALK_H / 2, BLOCK / 2);

        const feature = this.features[`${row},${c}`] || null;
        const isPark = !feature && (dist.id === 'rich' || dist.id === 'middle' ? rng() < 0.14 : rng() < 0.07);
        this.mapData.blocks.push({ x: cx, z: cz, size: BLOCK, district: dist.id, park: isPark });

        if (feature === 'hospital') this.buildHospitalBlock(cx, cz);
        else if (feature) this.buildFeatureBlock(cx, cz, dist, feature);
        else if (isPark) this.buildPark(cx, cz, grassMat);
        else this.buildBuildingsOnBlock(cx, cz, dist);

        if (dist.trees && !isPark) {
          for (let s = -BLOCK / 2 + 6; s <= BLOCK / 2 - 6; s += 12) {
            this.treeSpots.push([cx + s, cz + BLOCK / 2 - 1.6], [cx + s, cz - BLOCK / 2 + 1.6]);
          }
        }
      }
    }
    sidewalks.instanceMatrix.needsUpdate = true;
    if (sidewalks.instanceColor) sidewalks.instanceColor.needsUpdate = true;
    this.root.add(sidewalks);
  }

  addBuilding(x, z, w, d, h, style, district) {
    const mesh = new THREE.Mesh(buildingGeometry(w, h, d), this.pickMaterialArray(style));
    mesh.position.set(x, SIDEWALK_H + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.collidables.push(mesh);
    this.addStaticBox(x, SIDEWALK_H + h / 2, z, w / 2, h / 2, d / 2);
    this.mapData.buildings.push({ x, z, w, d, district });
    // Cornicione sul tetto
    if (h > 10 && this.rng() < 0.7) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 2.5, d * 0.4), this.roofMat);
      cap.position.set(x + (this.rng() - 0.5) * w * 0.3, SIDEWALK_H + h + 1.25, z + (this.rng() - 0.5) * d * 0.3);
      cap.castShadow = true;
      this.root.add(cap);
    }
    return mesh;
  }

  buildBuildingsOnBlock(cx, cz, dist) {
    const rng = this.rng;
    const inset = 4;
    const inner = BLOCK - inset * 2;
    const [minL, maxL] = dist.lots;
    const n = minL + Math.floor(rng() * (maxL - minL + 1));
    const lot = inner / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (n >= 3 && rng() < 0.12) continue; // cortili/terreni vuoti in periferia
        const w = lot - 1.5 - rng() * lot * 0.18;
        const d = lot - 1.5 - rng() * lot * 0.18;
        let h = dist.minH + Math.pow(rng(), 1.6) * (dist.maxH - dist.minH);
        if (n === 1) h *= 1.15;
        const x = cx - inner / 2 + lot * (i + 0.5);
        const z = cz - inner / 2 + lot * (j + 0.5);
        let style = dist.style;
        if (dist.id === 'middle' && rng() < 0.25) style = 'brick';
        if (dist.id === 'rich' && rng() < 0.2) style = 'concrete';
        this.addBuilding(x, z, w, d, h, style, dist.id);
      }
    }
  }

  /**
   * Blocco con edifici accessibili: uno sul lato sud (porta verso +Z) e/o uno sul lato nord (porta verso −Z).
   * Se c'è un solo edificio speciale, la metà libera viene riempita con palazzi generici.
   */
  buildFeatureBlock(cx, cz, dist, spec) {
    const rng = this.rng;
    const faces = typeof spec === 'string' ? { south: spec } : spec;
    let southDepth = 0, northDepth = 0;
    for (const [face, type] of Object.entries(faces)) {
      if (!type) continue;
      const def = BUILDING_TYPES[type];
      const nz = face === 'south' ? 1 : -1;
      const w = def.w, d = def.d;
      const h = def.h ?? { rich: 12, middle: 18, worker: 11, poor: 16 }[dist.id];
      const style = def.style ?? (dist.id === 'rich' ? 'concrete' : dist.style);
      const bz = cz + nz * (BLOCK / 2 - 4 - d / 2);
      const faceZ = bz + nz * (d / 2);
      if (face === 'south') southDepth = d; else northDepth = d;

      if (type === 'church') this.buildChurch(cx, bz, w, d, h, nz);
      else this.addBuilding(cx, bz, w, d, h, style, dist.id);
      this.addDoor(type, cx, faceZ, def, type === 'church' || type === 'garage' ? 2.6 : 1.8, nz);

      if (type === 'market' || type === 'clothing' || type === 'pharmacy' || type === 'restaurant' || type === 'pizzeria') {
        // Vetrine illuminate ai lati dell'ingresso
        const tint = { market: 0xdfffe8, clothing: 0xf6eaff, pharmacy: 0xe4ffe9, restaurant: 0xffe3b0, pizzeria: 0xffd6a8 }[type];
        const glow = new THREE.MeshStandardMaterial({ color: 0x0c1014, emissive: tint, emissiveIntensity: 0.7, roughness: 0.08, metalness: 0.4 });
        this.windowMaterials.push(glow);
        for (const sx of [-1, 1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(Math.min(5, w / 2 - 2.2), 2.4, 0.08), glow);
          win.position.set(cx + sx * (Math.min(5, w / 2 - 2.2) / 2 + 1.7), SIDEWALK_H + 1.6, faceZ + nz * 0.05);
          this.root.add(win);
        }
      }
      if (type === 'pharmacy') {
        const crossMat = new THREE.MeshStandardMaterial({ color: 0x0a3d1a, emissive: 0x2dff6a, emissiveIntensity: 1.4 });
        this.pharmacyCross = crossMat;
        const cross = new THREE.Group();
        cross.add(new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.15), crossMat), new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.15), crossMat));
        cross.position.set(cx + w / 2 - 1.2, SIDEWALK_H + 4.2, faceZ + nz * 0.5);
        this.root.add(cross);
      }
      if (type === 'garage') {
        const shutter = new THREE.Mesh(new THREE.BoxGeometry(6, 4.2, 0.12), new THREE.MeshStandardMaterial({ color: 0x8e979f, metalness: 0.7, roughness: 0.35 }));
        shutter.position.set(cx - 7, SIDEWALK_H + 2.1, faceZ + nz * 0.06);
        this.root.add(shutter);
        // Piazzale dove compaiono i veicoli acquistati (sulla strada davanti al concessionario)
        this.dealerSpot = { x: cx + 6, z: faceZ + nz * 6.8, heading: Math.PI / 2 };
      }
      if (type === 'home') {
        this.mapData.home = { x: cx, z: faceZ };
        // Esci di casa: personaggio rivolto verso la strada, camera sul marciapiede che guarda la porta.
        this.spawn = { x: cx, z: faceZ + nz * 1.6, yaw: nz > 0 ? 0 : Math.PI };
      }
    }

    // Palazzi generici nella metà libera del blocco
    const inner = BLOCK - 8;
    if (!northDepth && southDepth) {
      const depth = Math.min(inner / 2 - 2, inner - southDepth - 1.5);
      if (depth > 6) {
        for (const sx of [-1, 1]) {
          const hh = dist.minH + rng() * (dist.maxH - dist.minH) * 0.6;
          this.addBuilding(cx + sx * inner / 4, cz - inner / 2 + depth / 2, inner / 2 - 2, depth, hh, dist.style, dist.id);
        }
      }
    } else if (!southDepth && northDepth) {
      const depth = Math.min(inner / 2 - 2, inner - northDepth - 1.5);
      if (depth > 6) {
        for (const sx of [-1, 1]) {
          const hh = dist.minH + rng() * (dist.maxH - dist.minH) * 0.6;
          this.addBuilding(cx + sx * inner / 4, cz + inner / 2 - depth / 2, inner / 2 - 2, depth, hh, dist.style, dist.id);
        }
      }
    }
  }

  /** Chiesa: navata in pietra, tetto a capanna, campanile con croce e rosone. */
  buildChurch(cx, bz, w, d, h, nz) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xd8cdb6, roughness: 0.9, map: this.stoneTex || (this.stoneTex = noiseTexture(0xd8cdb6, 30, 256, 6, this.rng, true)) });
    const nave = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    nave.position.set(cx, SIDEWALK_H + h / 2, bz);
    nave.castShadow = nave.receiveShadow = true;
    this.root.add(nave);
    this.collidables.push(nave);
    this.addStaticBox(cx, SIDEWALK_H + h / 2, bz, w / 2, h / 2, d / 2);
    // Tetto a capanna
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-w / 2 - 0.6, 0);
    roofShape.lineTo(0, 6);
    roofShape.lineTo(w / 2 + 0.6, 0);
    roofShape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: d + 1, bevelEnabled: false });
    roofGeo.translate(0, 0, -(d + 1) / 2);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 0.8 }));
    roof.position.set(cx, SIDEWALK_H + h, bz);
    roof.castShadow = true;
    this.root.add(roof);
    // Campanile
    const tx = cx + w / 2 - 2.5, tz = bz + nz * (d / 2 - 2.5);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(5, h + 12, 5), stone);
    tower.position.set(tx, SIDEWALK_H + (h + 12) / 2, tz);
    tower.castShadow = true;
    this.root.add(tower);
    this.collidables.push(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(3.8, 7, 4), new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.6, metalness: 0.3 }));
    spire.rotation.y = Math.PI / 4;
    spire.position.set(tx, SIDEWALK_H + h + 12 + 3.5, tz);
    this.root.add(spire);
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xd6a73a, metalness: 0.9, roughness: 0.25 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 0.25), crossMat);
    c1.position.set(tx, SIDEWALK_H + h + 12 + 8, tz);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.25), crossMat);
    c2.position.set(tx, SIDEWALK_H + h + 12 + 8.4, tz);
    this.root.add(c1, c2);
    // Rosone sulla facciata
    const rose = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshStandardMaterial({ color: 0x223355, emissive: 0x6a5acd, emissiveIntensity: 0.6 }));
    rose.position.set(cx, SIDEWALK_H + h - 3, bz + nz * (d / 2 + 0.03));
    if (nz < 0) rose.rotation.y = Math.PI;
    this.windowMaterials.push(rose.material);
    this.root.add(rose);
    this.mapData.buildings.push({ x: cx, z: bz, w, d, district: 'church' });
  }

  /** Porta accessibile: battente, telaio, pensilina, lampada, insegna e anello luminoso a terra. */
  addDoor(type, x, faceZ, def, doorW = 1.8, nz = 1) {
    const g = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: type === 'hospital' ? 0x9fb3bd : 0x4a3324, roughness: 0.55, metalness: type === 'hospital' ? 0.4 : 0 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4, metalness: 0.5 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, 2.7, 0.14), wood);
    door.position.set(0, 1.35, 0.07);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 0.22), frameMat);
    fl.position.set(-doorW / 2 - 0.08, 1.45, 0.1);
    const fr = fl.clone();
    fr.position.x = doorW / 2 + 0.08;
    const ft = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.32, 0.16, 0.22), frameMat);
    ft.position.set(0, 2.9, 0.1);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), new THREE.MeshStandardMaterial({ color: 0xc9b27a, metalness: 0.9, roughness: 0.25 }));
    handle.position.set(doorW / 2 - 0.25, 1.15, 0.18);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(doorW + 1.8, 0.15, 1.6), new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6 }));
    awning.position.set(0, 3.25, 0.8);
    awning.castShadow = true;
    if (!this.doorLampMat) {
      this.doorLampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd28a, emissiveIntensity: 1.5 });
    }
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.2), this.doorLampMat);
    lamp.position.set(doorW / 2 + 0.6, 2.5, 0.12);
    g.add(door, fl, fr, ft, handle, awning, lamp);

    if (def.sign) {
      const signMat = new THREE.MeshBasicMaterial({ map: signTexture(def.sign, def.signColor, def.signBg), toneMapped: false });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), signMat);
      sign.position.set(0, 4.3, 0.12);
      g.add(sign);
    }
    g.position.set(x, SIDEWALK_H, faceZ);
    if (nz < 0) g.rotation.y = Math.PI;
    this.root.add(g);

    // Indicatore luminoso discreto a terra
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0b43c, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, SIDEWALK_H + 0.02, faceZ + nz * 1.2);
    ring.renderOrder = 2;
    this.root.add(ring);
    this.doorRings.push(ring);

    const doorInfo = { id: `${type}-${this.doors.length}`, type, name: def.name, x, z: faceZ, nx: 0, nz };
    this.doors.push(doorInfo);
    this.mapData.doors.push(doorInfo);
    return doorInfo;
  }

  buildHospitalBlock(cx, cz) {
    const def = BUILDING_TYPES.hospital;
    const w = def.w, d = def.d, h = def.h;
    const mesh = this.addBuilding(cx, cz - 2, w, d, h, 'concrete', 'middle');
    mesh.material = mesh.material.map((m, i) => (i === 2 || i === 3 ? m : this.styleMaterials.concrete[0]));
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff2a2a, emissiveIntensity: 1.2 });
    this.hospitalCrossMat = crossMat;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.3, 0.3), crossMat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 4, 0.3), crossMat));
    g.position.set(cx, SIDEWALK_H + h - 4, cz - 2 + d / 2 + 0.2);
    this.root.add(g);
    const heli = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0x3a3f44 }));
    heli.position.set(cx, SIDEWALK_H + h + 0.1, cz - 2);
    this.root.add(heli);
    this.addDoor('hospital', cx, cz - 2 + d / 2, { ...def, sign: 'OSPEDALE', signColor: '#ff5a5a', signBg: 'rgba(250,250,250,0.95)' }, 2.6);
    this.mapData.hospital = { x: cx, z: cz - 2 };
  }

  buildPark(cx, cz, grassMat) {
    const rng = this.rng;
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(BLOCK - 6, BLOCK - 6), grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(cx, SIDEWALK_H + 0.01, cz);
    grass.receiveShadow = true;
    this.root.add(grass);
    for (let i = 0; i < 14; i++) {
      this.treeSpots.push([cx + (rng() - 0.5) * (BLOCK - 10), cz + (rng() - 0.5) * (BLOCK - 10)]);
    }
    for (let i = 0; i < 4; i++) this.benchSpots.push([cx + (rng() - 0.5) * 20, cz + (rng() - 0.5) * 20, rng() * Math.PI]);
  }

  buildRoadMarkings() {
    const dashLen = 3, gap = 3;
    const positions = [];
    const lines = [];
    for (let i = 0; i <= GRID; i++) lines.push(-HALF + i * CELL);
    const nearIntersection = (v) => lines.some((l) => Math.abs(v - l) < ROAD / 2 + 4.5);
    for (const l of lines) {
      for (let s = -HALF; s <= HALF; s += dashLen + gap) {
        const mid = s + dashLen / 2;
        if (nearIntersection(mid)) continue;
        positions.push([l, mid, 0]); // linea lungo Z
        positions.push([mid, l, 1]); // linea lungo X
      }
    }
    const geo = new THREE.PlaneGeometry(0.18, dashLen);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe9e4d6, roughness: 0.8 });
    const dashes = new THREE.InstancedMesh(geo, mat, positions.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);
    positions.forEach(([a, b, along], i) => {
      p.set(a, 0.02, b);
      q.setFromAxisAngle(yAxis, along ? Math.PI / 2 : 0);
      m4.compose(p, q, s);
      dashes.setMatrixAt(i, m4);
    });
    dashes.receiveShadow = true;
    this.root.add(dashes);

    // Strisce pedonali vicino agli incroci
    const zebra = [];
    for (let i = 0; i <= GRID; i++) for (let j = 0; j < GRID; j++) {
      const roadX = -HALF + i * CELL;
      const bz = blockCenter(j);
      for (const side of [-1, 1]) zebra.push([roadX, bz + side * (BLOCK / 2 - 2), 0]);
      const roadZ = -HALF + i * CELL;
      const bx = blockCenter(j);
      for (const side of [-1, 1]) zebra.push([bx + side * (BLOCK / 2 - 2), roadZ, 1]);
    }
    // Ogni striscia è parallela al senso di marcia; le strisce si susseguono attraverso la carreggiata.
    const zGeo = new THREE.PlaneGeometry(0.55, 3);
    zGeo.rotateX(-Math.PI / 2);
    const stripes = new THREE.InstancedMesh(zGeo, mat, zebra.length * 11);
    let k = 0;
    for (const [x, z, along] of zebra) {
      for (let n = -5; n <= 5; n++) {
        if (along === 0) p.set(x + n * 1.1, 0.021, z);
        else p.set(x, 0.021, z + n * 1.1);
        q.setFromAxisAngle(yAxis, along ? Math.PI / 2 : 0);
        m4.compose(p, q, s);
        stripes.setMatrixAt(k++, m4);
      }
    }
    this.root.add(stripes);
  }

  buildStreetProps() {
    const rng = this.rng;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const yAxis = new THREE.Vector3(0, 1, 0);

    /* Alberi */
    // Città calde: palme (tronco alto e chioma appiattita); altrimenti latifoglie.
    const palms = !!this.style.warm;
    const trunkGeo = palms ? new THREE.CylinderGeometry(0.14, 0.22, 6, 7) : new THREE.CylinderGeometry(0.18, 0.25, 3, 6);
    trunkGeo.translate(0, palms ? 3 : 1.5, 0);
    const crownGeo = palms ? new THREE.IcosahedronGeometry(2.1, 1) : new THREE.IcosahedronGeometry(1.9, 1);
    if (palms) crownGeo.scale(1, 0.32, 1);
    crownGeo.translate(0, palms ? 6.1 : 4.2, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: palms ? 0x7a6248 : 0x5a3f2c, roughness: 1 }), this.treeSpots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 1, flatShading: true }), this.treeSpots.length);
    const col = new THREE.Color();
    this.treeSpots.forEach(([x, z], i) => {
      const sc = 0.8 + rng() * 0.5;
      p.set(x, SIDEWALK_H, z);
      q.setFromAxisAngle(yAxis, rng() * Math.PI * 2);
      m4.compose(p, q, new THREE.Vector3(sc, sc, sc));
      trunks.setMatrixAt(i, m4);
      crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.setHSL(0.25 + rng() * 0.08, 0.45, 0.28 + rng() * 0.1));
      this.addStaticBox(x, SIDEWALK_H + 1.5, z, 0.3, 1.5, 0.3);
    });
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    this.root.add(trunks, crowns);

    /* Lampioni agli angoli dei blocchi */
    const lampSpots = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const cx = blockCenter(c), cz = blockCenter(r);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) lampSpots.push([cx + sx * (BLOCK / 2 - 1), cz + sz * (BLOCK / 2 - 1), Math.atan2(sx, sz)]);
      // A metà lato ma spostati dal centro, dove si trovano gli ingressi degli edifici
      lampSpots.push([cx + 9, cz + BLOCK / 2 - 1, 0], [cx - 9, cz - BLOCK / 2 + 1, Math.PI]);
    }
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6, 6);
    poleGeo.translate(0, 3, 0);
    const armGeo = new THREE.BoxGeometry(0.1, 0.1, 1.6);
    armGeo.translate(0, 5.9, 0.8);
    const headGeo = new THREE.BoxGeometry(0.4, 0.15, 0.6);
    headGeo.translate(0, 5.8, 1.5);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.6 });
    this.lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
    const arms = new THREE.InstancedMesh(armGeo, poleMat, lampSpots.length);
    const heads = new THREE.InstancedMesh(headGeo, this.lampHeadMat, lampSpots.length);
    lampSpots.forEach(([x, z, rot], i) => {
      p.set(x, SIDEWALK_H, z);
      q.setFromAxisAngle(yAxis, rot);
      m4.compose(p, q, one);
      poles.setMatrixAt(i, m4);
      arms.setMatrixAt(i, m4);
      heads.setMatrixAt(i, m4);
      this.addStaticBox(x, SIDEWALK_H + 3, z, 0.15, 3, 0.15);
    });
    poles.castShadow = true;
    this.root.add(poles, arms, heads);
    this.lampSpots = lampSpots;

    /* Auto parcheggiate */
    const carSpots = [];
    for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) {
      const cx = blockCenter(c), cz = blockCenter(r);
      for (let k = 0; k < 3; k++) {
        if (rng() < 0.45) continue;
        const along = (rng() - 0.5) * (BLOCK - 14);
        const side = Math.floor(rng() * 4);
        const off = BLOCK / 2 + 1.4;
        if (side === 0) carSpots.push([cx + along, cz + off, Math.PI / 2]);
        else if (side === 1) carSpots.push([cx + along, cz - off, -Math.PI / 2]);
        else if (side === 2) carSpots.push([cx + off, cz + along, 0]);
        else carSpots.push([cx - off, cz + along, Math.PI]);
      }
    }
    // Una parte dei posti va ai veicoli veri (guidabili/rubabili), il resto resta decorativo.
    for (let i = carSpots.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [carSpots[i], carSpots[j]] = [carSpots[j], carSpots[i]];
    }
    const nearDoor = (x, z) => this.doors.some((d) => Math.hypot(d.x - x, d.z + d.nz * 6 - z) < 10);
    const decor = [];
    for (const s of carSpots) {
      if (nearDoor(s[0], s[1])) continue;
      if (this.parkingSpots.length < 18) this.parkingSpots.push(s);
      else if (decor.length < 30) decor.push(s);
    }
    carSpots.length = 0;
    carSpots.push(...decor);
    const bodyGeo = new THREE.BoxGeometry(1.85, 0.75, 4.3);
    bodyGeo.translate(0, 0.7, 0);
    const cabinGeo = new THREE.BoxGeometry(1.6, 0.6, 2.2);
    cabinGeo.translate(0, 1.36, -0.2);
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const carBodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.5 }), carSpots.length);
    const cabins = new THREE.InstancedMesh(cabinGeo, new THREE.MeshStandardMaterial({ color: 0x1d2630, roughness: 0.15, metalness: 0.6 }), carSpots.length);
    const wheels = new THREE.InstancedMesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.8 }), carSpots.length * 4);
    const carColors = [0xb3121d, 0x1d3f8f, 0xe8e8e8, 0x222222, 0x8a8f96, 0x2f6b3f, 0xd9a62b, 0x5b2a6e];
    const wheelOffsets = [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]];
    const tmpM = new THREE.Matrix4();
    carSpots.forEach(([x, z, rot], i) => {
      p.set(x, 0, z);
      q.setFromAxisAngle(yAxis, rot);
      m4.compose(p, q, one);
      carBodies.setMatrixAt(i, m4);
      cabins.setMatrixAt(i, m4);
      carBodies.setColorAt(i, col.set(carColors[Math.floor(rng() * carColors.length)]));
      wheelOffsets.forEach(([wx, wz], k) => {
        tmpM.makeTranslation(wx, 0.34, wz);
        wheels.setMatrixAt(i * 4 + k, m4.clone().multiply(tmpM));
      });
      // Corpo fisico orientato
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(0.95, 0.8, 2.15)));
      body.position.set(x, 0.8, z);
      body.quaternion.setFromEuler(0, rot, 0);
      this.physics.addBody(body);
      this.bodies.push(body);
      this.mapData.buildings.push({ x, z, w: Math.abs(Math.sin(rot)) > 0.5 ? 4.3 : 1.9, d: Math.abs(Math.sin(rot)) > 0.5 ? 1.9 : 4.3, district: 'car' });
    });
    carBodies.castShadow = cabins.castShadow = true;
    this.root.add(carBodies, cabins, wheels);

    /* Panchine nei parchi */
    for (const [x, z, rot] of this.benchSpots) {
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), wood);
      seat.position.y = 0.48;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.06), wood);
      back.position.set(0, 0.78, -0.24);
      g.add(seat, back);
      for (const sx of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.45), poleMat);
        leg.position.set(sx, 0.24, 0);
        g.add(leg);
      }
      g.position.set(x, SIDEWALK_H, z);
      g.rotation.y = rot;
      this.root.add(g);
    }
  }

  buildBounds() {
    const edge = HALF + ROAD / 2 + 2;
    const len = edge * 2 + 10;
    this.addStaticBox(0, 10, -edge, len / 2, 10, 1);
    this.addStaticBox(0, 10, edge, len / 2, 10, 1);
    this.addStaticBox(-edge, 10, 0, 1, 10, len / 2);
    this.addStaticBox(edge, 10, 0, 1, 10, len / 2);
    // Fila di edifici bassi sul perimetro per chiudere visivamente la città
    const rng = this.rng;
    for (let s = -edge; s < edge; s += 14) {
      for (const [x, z] of [[s + 7, -edge - 9], [s + 7, edge + 9], [-edge - 9, s + 7], [edge + 9, s + 7]]) {
        const h = 10 + rng() * 26;
        const mesh = new THREE.Mesh(buildingGeometry(13, h, 13), this.pickMaterialArray(rng() < 0.5 ? 'concrete' : 'brick'));
        mesh.position.set(x, h / 2, z);
        this.root.add(mesh);
      }
    }
  }

  buildSky() {
    this.skyUniforms = {
      top: { value: new THREE.Color(0x3b7bd6) },
      bottom: { value: new THREE.Color(0xcfe3f5) },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color(0xfff2d8) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0);
          vec3 col = mix(bottom, top, pow(h, 0.7));
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.25);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  /* ---------- Query ---------- */
  getDistrictAt(x, z) {
    const row = THREE.MathUtils.clamp(Math.floor((z + HALF) / CELL), 0, GRID - 1);
    return districtForRow(row);
  }

  getSpawn() {
    return this.spawn || { x: blockCenter(SPAWN_COL), z: blockCenter(3) + BLOCK / 2 + 2, yaw: 0 };
  }

  /** Porta più vicina entro maxDist (misurata dal punto davanti all'ingresso). */
  nearestDoor(x, z, maxDist = 2.5) {
    let best = null;
    let bestD = maxDist;
    for (const d of this.doors) {
      const px = d.x + d.nx * 0.9;
      const pz = d.z + d.nz * 0.9;
      const dist = Math.hypot(x - px, z - pz);
      if (dist <= bestD) { bestD = dist; best = d; }
    }
    return best;
  }

  /** Punto esterno davanti alla porta (dove ricompare il giocatore uscendo). */
  doorExitSpot(door) {
    return { x: door.x + door.nx * 1.7, z: door.z + door.nz * 1.7, facing: Math.atan2(door.nx, door.nz) };
  }

  setVisible(v) {
    this.root.visible = v;
    this.sky.visible = v;
  }

  update(t) {
    for (let i = 0; i < this.doorRings.length; i++) {
      const r = this.doorRings[i];
      r.material.opacity = 0.32 + Math.sin(t * 2.6 + i) * 0.16;
      const s = 1 + Math.sin(t * 2.6 + i) * 0.05;
      r.scale.set(s, s, 1);
    }
  }

  dispose() {
    for (const b of this.bodies) this.physics.removeBody(b);
    this.bodies.length = 0;
    this.scene.remove(this.root);
    this.scene.remove(this.sky);
  }
}

/* =====================================================================
   Ciclo giorno / notte
   ===================================================================== */
export class DayCycle {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a4438, 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 70;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 400 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xcfe3f5, 60, 420);
    scene.fog = this.fog;
    this._dir = new THREE.Vector3();

    this.palette = {
      nightTop: new THREE.Color(0x050914), nightBottom: new THREE.Color(0x141c33),
      dawnTop: new THREE.Color(0x3a4f86), dawnBottom: new THREE.Color(0xf2a36b),
      dayTop: new THREE.Color(0x3b7bd6), dayBottom: new THREE.Color(0xcfe3f5),
    };
    this._top = new THREE.Color();
    this._bottom = new THREE.Color();
    this.indoor = false;
    this.shadowsEnabled = true;
    this.pmrem = null;
  }

  /** Riflessi PBR: mappa d'ambiente generata dal cielo (aggiornata quando cambia la luce). */
  setupEnvironment(renderer) {
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this.world.sky.material));
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(9.5, 32), new THREE.MeshBasicMaterial({ color: 0x404040 }));
    this.envGround.rotation.x = -Math.PI / 2;
    this.envGround.position.y = -0.5;
    this.envScene.add(this.envGround);
    const indoor = new THREE.Scene();
    indoor.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 8), new THREE.MeshBasicMaterial({ color: 0x5a524a, side: THREE.BackSide })));
    const light = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0xfff3e0 }));
    light.rotation.x = Math.PI / 2;
    light.position.y = 8;
    indoor.add(light);
    this.indoorEnv = this.pmrem.fromScene(indoor, 0.04);
    this.envTarget = null;
    this.lastEnvDay = -1;
    this.lastEnvDusk = -1;
  }

  updateEnvironment(day, dusk) {
    if (!this.pmrem) return;
    if (this.indoor) {
      this.scene.environment = this.indoorEnv.texture;
      this.lastEnvDay = -1;
      return;
    }
    if (this.envTarget && Math.abs(day - this.lastEnvDay) < 0.05 && Math.abs(dusk - this.lastEnvDusk) < 0.08) {
      this.scene.environment = this.envTarget.texture;
      return;
    }
    this.lastEnvDay = day;
    this.lastEnvDusk = dusk;
    this.envGround.material.color.setScalar(0.04 + day * 0.22);
    const rt = this.pmrem.fromScene(this.envScene, 0.03);
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = rt;
    this.scene.environment = rt.texture;
  }

  /** hour: 0..24 */
  update(hour, focus) {
    if (this.indoor) {
      // Dentro un edificio: niente sole, solo luce diffusa di base (le luci le fornisce l'interno).
      this.sun.intensity = 0;
      this.sun.castShadow = false;
      this.hemi.intensity = 0.08;
      this.hemi.color.set(0xffffff);
      this.fog.far = 2000;
      this.updateEnvironment(1, 0);
      return { day: 1, night: 0 };
    }
    this.sun.castShadow = this.shadowsEnabled;
    const angle = ((hour - 6) / 24) * Math.PI * 2; // 6:00 alba, 12:00 zenit, 18:00 tramonto
    const elev = Math.sin(angle);
    this._dir.set(Math.cos(angle) * 0.8, elev, 0.45).normalize();
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (elev > -0.2 ? 1 : 0);

    const p = this.palette;
    this._top.copy(p.nightTop).lerp(p.dayTop, day).lerp(p.dawnTop, dusk * 0.5);
    this._bottom.copy(p.nightBottom).lerp(p.dayBottom, day).lerp(p.dawnBottom, dusk * 0.7);
    const sky = this.world.skyUniforms;
    sky.top.value.copy(this._top);
    sky.bottom.value.copy(this._bottom);
    sky.sunDir.value.copy(this._dir);
    sky.sunColor.value.setRGB(1, 0.85 + day * 0.1, 0.7 + day * 0.2).multiplyScalar(day > 0.02 ? 1 : 0);
    this.fog.color.copy(this._bottom);
    this.fog.near = 90;
    this.fog.far = 480 + day * 420;

    // Sole (o luna) che segue il giocatore per le ombre
    const sunUp = elev > -0.05;
    const lightDir = sunUp ? this._dir : this._dir.clone().negate().setY(Math.abs(this._dir.y) + 0.3).normalize();
    this.sun.position.set(focus.x + lightDir.x * 150, focus.y + lightDir.y * 150, focus.z + lightDir.z * 150);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = sunUp ? 0.4 + day * 2.4 : 0.35;
    this.sun.color.setRGB(1, 0.75 + day * 0.2, 0.55 + day * 0.35);
    if (!sunUp) this.sun.color.set(0x8fa6d8);
    // Con la mappa d'ambiente attiva la luce emisferica serve meno
    this.hemi.intensity = this.pmrem ? 0.18 + day * 0.5 : 0.35 + day * 0.85;
    this.hemi.color.copy(this._top).lerp(new THREE.Color(0xffffff), 0.4);
    this.updateEnvironment(day, dusk);

    // Finestre e lampioni accesi di sera
    const night = 1 - day;
    for (const m of this.world.windowMaterials) m.emissiveIntensity = night * 0.95;
    if (this.world.lampHeadMat) this.world.lampHeadMat.emissiveIntensity = night * 2.2;
    if (this.world.doorLampMat) this.world.doorLampMat.emissiveIntensity = 0.4 + night * 1.8;
    return { day, night };
  }

  setShadows(enabled, size = 2048) {
    this.shadowsEnabled = enabled;
    this.sun.castShadow = enabled && !this.indoor;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
  }

  dispose() {
    this.scene.remove(this.hemi, this.sun, this.sun.target);
    this.scene.fog = null;
    this.scene.environment = null;
    if (this.envTarget) this.envTarget.dispose();
    if (this.indoorEnv) this.indoorEnv.dispose();
    if (this.pmrem) this.pmrem.dispose();
  }
}
