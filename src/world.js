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
/** Anelli di quartieri residenziali attorno al centro città. */
export const RINGS = 4;
export const URBAN_HALF = HALF + RINGS * CELL; // fine dei quartieri (strade comprese)
export const PLAY_EDGE = 690; // confine giocabile (campagna e colline comprese): area ~10x la città iniziale
export const WORLD_EXT = PLAY_EDGE + 20; // estensione usata da minimappa e mappa grande
const TERRAIN_ES = 10; // passo della griglia del terreno (fisica e grafica coincidono)
const LAKE = { x: -560, z: 120, r: 75 };
const SIDEWALK_H = 0.2;

/** Rumore deterministico a somma di sinusoidi (0..1). */
function terrainNoise(x, z) {
  return 0.5 + 0.25 * Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.013 - 0.7)
    + 0.15 * Math.sin(x * 0.027 + z * 0.019 + 2.1)
    + 0.1 * Math.cos(x * 0.051 - z * 0.043 + 0.4);
}

/**
 * Altezza del terreno: piatto in città e nei quartieri, colline dolci in campagna, montagne oltre il confine.
 */
export function terrainHeight(x, z) {
  const d = Math.max(Math.abs(x), Math.abs(z)) - (URBAN_HALF + 12);
  if (d <= 0) return 0;
  const k = THREE.MathUtils.smoothstep(d, 0, 140);
  let h = k * (4 + 22 * terrainNoise(x, z));
  // Lago con conca
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (ld < LAKE.r + 40) h = THREE.MathUtils.lerp(-1.2, h, THREE.MathUtils.smoothstep(ld, LAKE.r - 25, LAKE.r + 40));
  // Montagne oltre l'area giocabile
  const r = Math.max(Math.abs(x), Math.abs(z));
  if (r > PLAY_EDGE - 20) h += THREE.MathUtils.smoothstep(r, PLAY_EDGE - 20, PLAY_EDGE + 500) * (90 + 220 * terrainNoise(x * 0.6 + 300, z * 0.6 - 200));
  return h;
}
const TILE_W = 16; // metri coperti da una ripetizione della texture di facciata
const TILE_H = 14;

export const DISTRICTS = {
  rich: { id: 'rich', name: 'Quartiere Alto', style: 'glass', minH: 26, maxH: 78, lots: [1, 2], sidewalk: 0xc4bfb4, trees: true },
  middle: { id: 'middle', name: 'Centro', style: 'concrete', minH: 14, maxH: 36, lots: [2, 2], sidewalk: 0xaaa59b, trees: true },
  worker: { id: 'worker', name: 'Zona Industriale', style: 'industrial', minH: 7, maxH: 14, lots: [2, 2], sidewalk: 0x8f8b83, trees: false },
  poor: { id: 'poor', name: 'Periferia', style: 'brick', minH: 9, maxH: 22, lots: [2, 3], sidewalk: 0x7f7b73, trees: false },
  suburb: { id: 'suburb', name: 'Quartiere residenziale', style: 'house', minH: 6, maxH: 8, lots: [2, 2], sidewalk: 0xb8b3a8, trees: true },
  villas: { id: 'villas', name: 'Zona villette', style: 'house', minH: 6, maxH: 8, lots: [2, 2], sidewalk: 0xc2bdb2, trees: true },
  country: { id: 'country', name: 'Campagna e colline', style: 'none', minH: 0, maxH: 0, lots: [0, 0], sidewalk: 0x8f8b83, trees: false },
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
  cathedral: { name: 'Cattedrale di Santa Maria', sign: null, w: 26, d: 36, h: 22, style: 'concrete' },
  chapel: { name: 'Chiesa di San Francesco', sign: null, w: 16, d: 22, h: 12, style: 'concrete' },
  house: { name: 'Casa in vendita', sign: null, w: 12, d: 10, h: 7 },
  workshop: { name: 'Officina Meccanica', sign: 'OFFICINA', signColor: '#ffb347', signBg: 'rgba(28,18,6,0.95)', w: 26, d: 18, h: 8, style: 'industrial' },
};

/** Icone/colori per minimappa e mappa grande. */
export const MAP_ICONS = {
  home: { color: '#f0b43c', letter: 'C' }, hospital: { color: '#ff5a5a', letter: 'H' }, market: { color: '#7dff9a', letter: 'M' },
  bank: { color: '#f0c860', letter: 'B' }, bar: { color: '#ff6fae', letter: 'L' }, garage: { color: '#8fd0ff', letter: 'V' },
  weapons: { color: '#ff9a4a', letter: 'A' }, clothing: { color: '#d9b8ff', letter: 'S' }, pharmacy: { color: '#5dff8a', letter: '+' },
  restaurant: { color: '#ffd27a', letter: 'R' }, pizzeria: { color: '#ff6a4d', letter: 'P' }, church: { color: '#ffffff', letter: '†' },
  police: { color: '#8fc0ff', letter: 'Π' }, atm: { color: '#7fd0ff', letter: '€' },
  cathedral: { color: '#fff3c4', letter: '✝' }, chapel: { color: '#ffffff', letter: '†' }, house: { color: '#9be37a', letter: '⌂' },
  workshop: { color: '#ffb347', letter: 'O' },
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
  // Roughness map ricavata dal disegno (nessun numero casuale in più: il seed della città non cambia):
  // i vetri delle finestre (zone scure) sono lisci e riflettono il cielo, i muri restano opachi.
  const rough = makeCanvas(W, H);
  const rgc = rough.getContext('2d');
  const src = g.getImageData(0, 0, W, H).data;
  const rimg = rgc.createImageData(W, H);
  const glassCut = style === 'glass' ? 0.5 : 0.3;
  for (let i = 0; i < W * H; i++) {
    const l = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
    const r = l < glassCut ? 22 : style === 'industrial' ? 150 : 235;
    rimg.data[i * 4] = rimg.data[i * 4 + 1] = rimg.data[i * 4 + 2] = r;
    rimg.data[i * 4 + 3] = 255;
  }
  rgc.putImageData(rimg, 0, 0);
  const tMap = new THREE.CanvasTexture(map);
  tMap.colorSpace = THREE.SRGBColorSpace;
  const tEmi = new THREE.CanvasTexture(emi);
  tEmi.colorSpace = THREE.SRGBColorSpace;
  const tRough = new THREE.CanvasTexture(rough);
  for (const t of [tMap, tEmi, tRough]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map: tMap, emissive: tEmi, rough: tRough };
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

/** Normal map tangente ricavata da un'immagine in scala di grigi (altezza = luminosità). */
function normalMapFromCanvas(src, strength = 2) {
  const W = src.width, H = src.height;
  const sg = src.getContext('2d').getImageData(0, 0, W, H).data;
  const out = makeCanvas(W, H);
  const og = out.getContext('2d');
  const img = og.createImageData(W, H);
  const h = (x, y) => sg[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
    const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const len = Math.hypot(dx, dy, 1);
    const i = (y * W + x) * 4;
    img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
    img.data[i + 1] = (dy / len * 0.5 + 0.5) * 255;
    img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out); // dati lineari: nessuno spazio colore sRGB
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/**
 * Asfalto PBR procedurale: colore (graniglia, rattoppi, macchie d'olio), normal map dalla graniglia
 * e roughness map con chiazze più lisce e lucide (usura e umidità) che riflettono il cielo.
 */
function asphaltTextures(rng, repeat) {
  const S = 512;
  const height = makeCanvas(S, S);
  const hg = height.getContext('2d');
  const himg = hg.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 110 + (rng() - 0.5) * 120 + (rng() < 0.04 ? 70 : 0); // graniglia con sassolini
    himg.data[i * 4] = himg.data[i * 4 + 1] = himg.data[i * 4 + 2] = THREE.MathUtils.clamp(v, 0, 255);
    himg.data[i * 4 + 3] = 255;
  }
  hg.putImageData(himg, 0, 0);
  const color = makeCanvas(S, S);
  const cg = color.getContext('2d');
  cg.drawImage(height, 0, 0);
  cg.globalCompositeOperation = 'multiply';
  cg.fillStyle = '#4a4c51';
  cg.fillRect(0, 0, S, S);
  cg.globalCompositeOperation = 'source-over';
  const rough = makeCanvas(S, S);
  const rg = rough.getContext('2d');
  rg.fillStyle = 'rgb(235,235,235)';
  rg.fillRect(0, 0, S, S);
  for (let k = 0; k < 14; k++) {
    // Rattoppi più scuri e lisci
    const x = rng() * S, y = rng() * S, w = 30 + rng() * 90, h = 20 + rng() * 60;
    cg.fillStyle = `rgba(20,20,22,${0.15 + rng() * 0.2})`;
    cg.fillRect(x, y, w, h);
    rg.fillStyle = `rgba(150,150,150,${0.5 + rng() * 0.3})`;
    rg.fillRect(x, y, w, h);
  }
  for (let k = 0; k < 10; k++) {
    // Macchie d'olio / pozzanghere: quasi a specchio
    const x = rng() * S, y = rng() * S, r = 12 + rng() * 40;
    const grd = cg.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(8,8,10,0.45)');
    grd.addColorStop(1, 'rgba(8,8,10,0)');
    cg.fillStyle = grd;
    cg.fillRect(x - r, y - r, r * 2, r * 2);
    const rgr = rg.createRadialGradient(x, y, 0, x, y, r);
    rgr.addColorStop(0, 'rgba(40,40,40,0.95)');
    rgr.addColorStop(1, 'rgba(40,40,40,0)');
    rg.fillStyle = rgr;
    rg.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Crepe sottili
  cg.strokeStyle = 'rgba(10,10,10,0.5)';
  cg.lineWidth = 1.2;
  for (let k = 0; k < 8; k++) {
    let x = rng() * S, y = rng() * S;
    cg.beginPath(); cg.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (rng() - 0.5) * 50; y += (rng() - 0.5) * 50; cg.lineTo(x, y); }
    cg.stroke();
  }
  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  const normalMap = normalMapFromCanvas(height, 2.2);
  for (const t of [map, roughnessMap, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
  }
  return { map, roughnessMap, normalMap };
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
    this.lampPoints = [];
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
    this.seed = seed >>> 0;
    this.houses = [];
    // Chiese aggiuntive nei quartieri (chiave: riga,colonna nella griglia estesa)
    this.suburbFeatures = { '-2,3': 'cathedral', '8,1': 'chapel', '3,9': 'chapel', '-1,1': 'workshop' };

    this.buildMaterials();
    this.buildGround();
    this.buildBlocks();
    this.buildRoadMarkings();
    this.buildStreetProps();
    this.buildAtms();
    // Espansione: quartieri residenziali, campagna collinare, lago e montagne (generatore separato:
    // il centro città resta identico a prima, quindi i salvataggi esistenti restano validi)
    this.buildSuburbs();
    this.buildTerrain();
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
      this.atms.push({ x: front.x, z: front.z, mx: s.x, mz: s.z, group: g, screen, robbedDay: -1 });
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
    this.roofMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.92, metalness: 0.05 });
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
          roughnessMap: tex.rough,
          roughness: 1,
          metalness: style === 'glass' ? 0.25 : style === 'industrial' ? 0.35 : 0,
          envMapIntensity: style === 'glass' ? 1.3 : 1.0,
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
    // Asfalto su città e quartieri; il resto è terreno (vedi buildTerrain)
    const size = URBAN_HALF * 2 + 20;
    // La vecchia texture consumava 256×256 numeri dal generatore della città: li scartiamo uguali,
    // così la disposizione di edifici e porte resta identica e i salvataggi esistenti restano validi.
    for (let i = 0; i < 256 * 256; i++) this.rng();
    // Generatore separato per il nuovo asfalto PBR
    const tex = asphaltTextures(seededRandom((this.seed ^ 0xa5fa17) >>> 0), size / 14);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({
        color: 0xffffff, map: tex.map, normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
        roughnessMap: tex.roughnessMap, roughness: 1, metalness: 0, envMapIntensity: 0.9,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.root.add(ground);
    this.groundMesh = ground;
    // Pavimento fisico della zona degli interni (lontana dalla mappa)
    this.addStaticBox(4000, -0.5, 4000, 150, 0.5, 150);
  }

  /** Terreno giocabile (heightfield Cannon-es + mesh identica), lago e montagne all'orizzonte. */
  buildTerrain() {
    const es = TERRAIN_ES;
    const n = Math.round((PLAY_EDGE + 10) * 2 / es) + 1;
    const x0 = -(n - 1) * es / 2;
    const z0 = (n - 1) * es / 2;
    const matrix = [];
    for (let i = 0; i < n; i++) {
      const col = [];
      for (let j = 0; j < n; j++) col.push(terrainHeight(x0 + i * es, z0 - j * es));
      matrix.push(col);
    }
    const hf = new CANNON.Heightfield(matrix, { elementSize: es });
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
    body.addShape(hf);
    body.position.set(x0, 0, z0);
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physics.addBody(body);
    this.bodies.push(body);

    // Mesh del terreno con gli stessi vertici della fisica (sotto l'asfalto in città)
    const size = (n - 1) * es;
    const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v), z = pos.getZ(v);
      const h = terrainHeight(x, z);
      const urban = Math.max(Math.abs(x), Math.abs(z)) < URBAN_HALF + 10;
      pos.setY(v, urban ? -0.06 : h);
      const lake = Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4;
      if (lake) c.setRGB(0.55, 0.5, 0.38);
      else c.setHSL(0.27 + terrainNoise(x * 3, z * 3) * 0.05, 0.42, 0.26 + Math.min(0.12, h * 0.004) + terrainNoise(x * 7, z * 7) * 0.05);
      colors[v * 3] = c.r; colors[v * 3 + 1] = c.g; colors[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const grassTex = noiseTexture(0xffffff, 40, 128, size / 8, this.rng);
    const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 1 }));
    terrain.receiveShadow = true;
    this.root.add(terrain);

    // Lago
    const water = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 2, 48), new THREE.MeshStandardMaterial({ color: 0x2f6f8f, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.88 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(LAKE.x, -0.45, LAKE.z);
    this.root.add(water);
    this.mapData.lake = { ...LAKE };

    // Montagne (solo grafica, oltre il confine)
    const mSize = 3600, mSeg = 90;
    const mGeo = new THREE.PlaneGeometry(mSize, mSize, mSeg, mSeg);
    mGeo.rotateX(-Math.PI / 2);
    const mp = mGeo.attributes.position;
    const mCol = new Float32Array(mp.count * 3);
    for (let v = 0; v < mp.count; v++) {
      const x = mp.getX(v), z = mp.getZ(v);
      const r = Math.max(Math.abs(x), Math.abs(z));
      const h = r < PLAY_EDGE + 15 ? -2 : terrainHeight(x, z);
      mp.setY(v, h);
      if (h > 230) c.setRGB(0.95, 0.96, 0.98);
      else if (h > 140) c.setRGB(0.48, 0.46, 0.44);
      else c.setHSL(0.28, 0.35, 0.22 + h * 0.0006);
      mCol[v * 3] = c.r; mCol[v * 3 + 1] = c.g; mCol[v * 3 + 2] = c.b;
    }
    mGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3));
    mGeo.computeVertexNormals();
    const mountains = new THREE.Mesh(mGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    mountains.position.y = -0.1;
    this.root.add(mountains);

    // Alberi di campagna (latifoglie e pini) con collider
    const rng = seededRandom((this.seed ^ 0x7a3c11) >>> 0);
    const spots = [];
    let guard = 0;
    while (spots.length < 320 && guard++ < 6000) {
      const x = (rng() * 2 - 1) * (PLAY_EDGE - 15);
      const z = (rng() * 2 - 1) * (PLAY_EDGE - 15);
      if (Math.max(Math.abs(x), Math.abs(z)) < URBAN_HALF + 25) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) continue;
      spots.push([x, z, rng() < 0.5]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.32, 4, 6);
    trunkGeo.translate(0, 2, 0);
    const leafGeo = new THREE.IcosahedronGeometry(2.4, 1);
    leafGeo.translate(0, 5.2, 0);
    const pineGeo = new THREE.ConeGeometry(2.2, 7, 8);
    pineGeo.translate(0, 6.5, 0);
    const leafy = spots.filter((s) => !s[2]), pines = spots.filter((s) => s[2]);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 1 }), spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ color: 0x4f7d3a, roughness: 1, flatShading: true }), Math.max(1, leafy.length));
    const pineM = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: 0x2f5a35, roughness: 1, flatShading: true }), Math.max(1, pines.length));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    let li = 0, pi = 0;
    spots.forEach(([x, z, pine], i) => {
      const y = terrainHeight(x, z);
      const s = 0.8 + rng() * 0.6;
      p.set(x, y - 0.2, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
      sc.set(s, s, s);
      m4.compose(p, q, sc);
      trunks.setMatrixAt(i, m4);
      if (pine) pineM.setMatrixAt(pi++, m4); else leaves.setMatrixAt(li++, m4);
      this.addStaticBox(x, y + 2, z, 0.35, 2, 0.35);
    });
    leaves.count = li;
    pineM.count = pi;
    trunks.castShadow = leaves.castShadow = pineM.castShadow = true;
    this.root.add(trunks, leaves, pineM);
  }

  getHeight(x, z) {
    return terrainHeight(x, z);
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

  /** Officina meccanica: capannone con serrande, piazzale e pneumatici impilati. */
  buildWorkshop(cx, bz, def) {
    const { w, d, h } = def;
    this.addBuilding(cx, bz, w, d, h, 'industrial', 'worker');
    const shutterMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ab, metalness: 0.7, roughness: 0.35 });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf0b43c, roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(6.5, 4.6, 0.12), shutterMat);
      shutter.position.set(cx + sx * 7.5, SIDEWALK_H + 2.3, bz + d / 2 + 0.06);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.25, 0.14), stripeMat);
      stripe.position.set(cx + sx * 7.5, SIDEWALK_H + 4.75, bz + d / 2 + 0.07);
      this.root.add(shutter, stripe);
    }
    // Pneumatici impilati sul piazzale (con collider)
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.14, 10, 20), tireMat);
      t.rotation.x = Math.PI / 2;
      t.position.set(cx + w / 2 - 1, SIDEWALK_H + 0.14 + i * 0.28, bz + d / 2 + 1.6);
      t.castShadow = true;
      this.root.add(t);
    }
    this.addStaticBox(cx + w / 2 - 1, SIDEWALK_H + 0.6, bz + d / 2 + 1.6, 0.5, 0.6, 0.5);
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
    // Strade di città + quartieri residenziali
    for (let i = -RINGS; i <= GRID + RINGS; i++) lines.push(-HALF + i * CELL);
    const nearIntersection = (v) => lines.some((l) => Math.abs(v - l) < ROAD / 2 + 4.5);
    for (const l of lines) {
      for (let s = -URBAN_HALF; s <= URBAN_HALF; s += dashLen + gap) {
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
      // Posizione della lampada (per le luci reali notturne vicino al giocatore)
      this.lampPoints.push(new THREE.Vector3(x + Math.sin(rot) * 1.5, SIDEWALK_H + 5.6, z + Math.cos(rot) * 1.5));
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
    // Confine invisibile dell'area giocabile (dove iniziano le montagne)
    const edge = PLAY_EDGE;
    const len = edge * 2 + 10;
    this.addStaticBox(0, 100, -edge, len / 2, 200, 1);
    this.addStaticBox(0, 100, edge, len / 2, 200, 1);
    this.addStaticBox(-edge, 100, 0, 1, 200, len / 2);
    this.addStaticBox(edge, 100, 0, 1, 200, len / 2);
  }

  /* ---------- Quartieri residenziali: case, villette, chiese ---------- */
  houseTexture() {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
    // Due piani, due finestre per piano con persiane
    for (const y of [40, 150]) {
      for (const x of [40, 156]) {
        g.fillStyle = '#5b4a3a'; g.fillRect(x - 14, y, 12, 62); g.fillRect(x + 62, y, 12, 62);
        g.fillStyle = '#f4f1ea'; g.fillRect(x - 4, y - 4, 68, 70);
        g.fillStyle = '#2d3a46'; g.fillRect(x, y, 60, 62);
        g.fillStyle = '#e8e4dc'; g.fillRect(x + 28, y, 4, 62); g.fillRect(x, y + 29, 60, 4);
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, 128, 256, 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const e = makeCanvas(256, 256);
    const ge = e.getContext('2d');
    ge.fillStyle = '#000';
    ge.fillRect(0, 0, 256, 256);
    ge.fillStyle = '#ffcf86';
    ge.fillRect(40, 150, 60, 62);
    ge.fillRect(156, 40, 60, 62);
    const te = new THREE.CanvasTexture(e);
    te.colorSpace = THREE.SRGBColorSpace;
    return { map: t, emissive: te };
  }

  buildSuburbs() {
    const rng = seededRandom((this.seed ^ 0x51ed27) >>> 0);
    const cells = [];
    for (let gj = -RINGS; gj < GRID + RINGS; gj++) {
      for (let gi = -RINGS; gi < GRID + RINGS; gi++) {
        if (gi >= 0 && gi < GRID && gj >= 0 && gj < GRID) continue;
        cells.push([gj, gi]);
      }
    }
    const tex = this.houseTexture();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.map, emissive: 0xffffff, emissiveMap: tex.emissive, emissiveIntensity: 0, roughness: 0.85 });
    this.windowMaterials.push(wallMat);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-0.5, 0); roofShape.lineTo(0, 1); roofShape.lineTo(0.5, 0); roofShape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false });
    roofGeo.translate(0, 0, -0.5);
    roofGeo.rotateY(Math.PI / 2); // colmo lungo X
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const walls = [], roofs = [], gardens = [], hedges = [], doors = [], walksY = [], lamps = [], trees = [];
    const wallColors = [0xf2e6d0, 0xe8d3b0, 0xf4f0e6, 0xd9c2a3, 0xefd9c9, 0xcfd8d6, 0xf0e1b8];
    const roofColors = [0xa5452b, 0x8c3b25, 0x6b4a3a, 0x4a4d52, 0xb0573a];
    const sidewalkCol = new THREE.Color();
    let forSale = 0;

    for (const [gj, gi] of cells) {
      const cx = blockCenter(gi), cz = blockCenter(gj);
      const ring = Math.max(-gi, gi - (GRID - 1), -gj, gj - (GRID - 1));
      const villas = ring >= 3;
      const dist = villas ? DISTRICTS.villas : DISTRICTS.suburb;
      walksY.push([cx, cz, dist.sidewalk]);
      this.addStaticBox(cx, SIDEWALK_H / 2, cz, BLOCK / 2, SIDEWALK_H / 2, BLOCK / 2);
      const feature = this.suburbFeatures[`${gj},${gi}`];
      const park = !feature && rng() < 0.07;
      this.mapData.blocks.push({ x: cx, z: cz, size: BLOCK, district: dist.id, park });
      lamps.push([cx - BLOCK / 2 + 1, cz - BLOCK / 2 + 1], [cx + BLOCK / 2 - 1, cz + BLOCK / 2 - 1]);

      if (feature) {
        const def = BUILDING_TYPES[feature];
        const bz = cz + BLOCK / 2 - 4 - def.d / 2;
        if (feature === 'workshop') this.buildWorkshop(cx, bz, def);
        else this.buildChurch(cx, bz, def.w, def.d, def.h, 1);
        this.addDoor(feature, cx, bz + def.d / 2, def, feature === 'workshop' ? 2.2 : 2.6, 1);
        continue;
      }
      if (park) {
        gardens.push([cx, cz, BLOCK - 6, BLOCK - 6]);
        for (let k = 0; k < 10; k++) trees.push([cx + (rng() - 0.5) * (BLOCK - 10), cz + (rng() - 0.5) * (BLOCK - 10)]);
        continue;
      }
      // Lotti: due file di case (una guarda a sud, una a nord)
      const perRow = villas ? 1 : 2;
      for (const nz of [1, -1]) {
        for (let k = 0; k < perRow; k++) {
          const lx = perRow === 1 ? cx : cx + (k === 0 ? -9.5 : 9.5);
          const w = villas ? 13 + rng() * 3 : 8.5 + rng() * 2.5;
          const d = villas ? 10.5 + rng() * 2 : 8 + rng() * 2;
          const h = villas ? 6.6 + rng() * 0.8 : 5.8 + rng() * 1.4;
          const frontZ = cz + nz * (BLOCK / 2 - (villas ? 7 : 5.5));
          const hz = frontZ - nz * d / 2;
          const wallC = wallColors[Math.floor(rng() * wallColors.length)];
          walls.push([lx, hz, w, h, d, wallC]);
          roofs.push([lx, hz, w + 0.7, villas ? 2.6 : 2.2, d + 0.7, roofColors[Math.floor(rng() * roofColors.length)], h]);
          this.addStaticBox(lx, SIDEWALK_H + h / 2, hz, w / 2, h / 2, d / 2);
          this.mapData.buildings.push({ x: lx, z: hz, w, d, district: 'suburb' });
          if (villas) {
            gardens.push([lx, frontZ + nz * 2.2, w + 6, 4.2]);
            hedges.push([lx - (w / 2 + 2.6), frontZ + nz * 4.1, 0.6, 1.1, 0.7], [lx + (w / 2 + 2.6), frontZ + nz * 4.1, 0.6, 1.1, 0.7]);
          }
          const sale = forSale < 16 && rng() < (villas ? 0.22 : 0.1);
          if (sale) {
            forSale++;
            const kind = villas ? 'villetta' : 'casa';
            const price = villas ? Math.round((180 + rng() * 270) / 5) * 5000 : Math.round((65 + rng() * 60) / 5) * 5000;
            const id = `h${gj}_${gi}_${nz}_${k}`;
            const name = villas ? 'Villetta in vendita' : 'Casa in vendita';
            const door = this.addDoor('house', lx, frontZ + nz * 0.02, { ...BUILDING_TYPES.house, name }, 1.4, nz);
            door.house = { id, kind, price, tier: villas ? 'rich' : 'middle' };
            // Cartello VENDESI in giardino
            const board = new THREE.Group();
            const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.08), new THREE.MeshStandardMaterial({ color: 0x5a3e2b }));
            post.position.y = 0.7;
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: signTexture('VENDESI', '#ffffff', 'rgba(200,30,40,0.98)'), side: THREE.DoubleSide, toneMapped: false }));
            panel.position.y = 1.3;
            board.add(post, panel);
            board.position.set(lx + w / 2 - 0.5, SIDEWALK_H, frontZ + nz * 2.6);
            if (nz < 0) board.rotation.y = Math.PI;
            this.root.add(board);
            door.saleSign = board;
            this.houses.push(door);
          } else {
            doors.push([lx, frontZ + nz * 0.05, nz]);
          }
          trees.push([lx + w / 2 + (villas ? 3.5 : 1.5), cz + nz * (BLOCK / 2 - 1.6)]);
        }
      }
    }

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const col = new THREE.Color();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const inst = (geo, mat, list, fn) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach((it, i) => fn(im, it, i));
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      this.root.add(im);
      return im;
    };
    const sidewalkGeo = new THREE.BoxGeometry(BLOCK, SIDEWALK_H, BLOCK);
    inst(sidewalkGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, map: noiseTexture(0xffffff, 30, 256, BLOCK / 4, rng, true), roughness: 0.85 }), walksY, (im, [x, z, c], i) => {
      m4.makeTranslation(x, SIDEWALK_H / 2, z); im.setMatrixAt(i, m4); im.setColorAt(i, sidewalkCol.set(c));
    }).receiveShadow = true;
    const wallsMesh = inst(boxGeo, wallMat, walls, (im, [x, z, w, h, d, c], i) => {
      p.set(x, SIDEWALK_H, z); q.identity(); sc.set(w, h, d); m4.compose(p, q, sc); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(c));
    });
    wallsMesh.castShadow = wallsMesh.receiveShadow = true;
    this.collidables.push(wallsMesh);
    const roofMesh = inst(roofGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 }), roofs, (im, [x, z, w, h, d, c, wallH], i) => {
      p.set(x, SIDEWALK_H + wallH, z); q.identity(); sc.set(w, h, d); m4.compose(p, q, sc); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(c));
    });
    roofMesh.castShadow = true;
    const garden = new THREE.PlaneGeometry(1, 1);
    garden.rotateX(-Math.PI / 2);
    inst(garden, new THREE.MeshStandardMaterial({ color: 0x5f9a45, roughness: 1, map: noiseTexture(0x5f9a45, 40, 128, 4, rng) }), gardens, (im, [x, z, w, d], i) => {
      p.set(x, SIDEWALK_H + 0.012, z); q.identity(); sc.set(w, 1, d); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
    }).receiveShadow = true;
    inst(boxGeo, new THREE.MeshStandardMaterial({ color: 0x3f6b33, roughness: 1 }), hedges, (im, [x, z, w, h, d], i) => {
      p.set(x, SIDEWALK_H, z); q.identity(); sc.set(w, h, d); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
    });
    inst(new THREE.BoxGeometry(1.2, 2.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.6 }), doors, (im, [x, z, nz], i) => {
      p.set(x, SIDEWALK_H + 1.15, z); q.setFromAxisAngle(yAxis, nz > 0 ? 0 : Math.PI); sc.set(1, 1, 1); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
    });
    // Alberi di quartiere
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 3, 6);
    trunkGeo.translate(0, 1.5, 0);
    const crownGeo = new THREE.IcosahedronGeometry(1.7, 1);
    crownGeo.translate(0, 4, 0);
    const tMat = new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 1 });
    const cMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true });
    inst(trunkGeo, tMat, trees, (im, [x, z], i) => {
      p.set(x, SIDEWALK_H, z); q.identity(); sc.set(1, 1, 1); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
      this.addStaticBox(x, SIDEWALK_H + 1.5, z, 0.25, 1.5, 0.25);
    }).castShadow = true;
    inst(crownGeo, cMat, trees, (im, [x, z], i) => {
      p.set(x, SIDEWALK_H, z); q.setFromAxisAngle(yAxis, i * 1.7); sc.setScalar(0.85 + ((i * 37) % 10) / 20); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
      im.setColorAt(i, col.setHSL(0.24 + ((i * 13) % 10) / 120, 0.45, 0.3));
    }).castShadow = true;
    // Lampioni di quartiere
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 5, 6);
    poleGeo.translate(0, 2.5, 0);
    const headGeo = new THREE.SphereGeometry(0.28, 10, 8);
    headGeo.translate(0, 5.1, 0);
    inst(poleGeo, new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.6, roughness: 0.5 }), lamps, (im, [x, z], i) => {
      m4.makeTranslation(x, SIDEWALK_H, z); im.setMatrixAt(i, m4);
      this.addStaticBox(x, SIDEWALK_H + 2.5, z, 0.12, 2.5, 0.12);
    });
    inst(headGeo, this.lampHeadMat, lamps, (im, [x, z], i) => { m4.makeTranslation(x, SIDEWALK_H, z); im.setMatrixAt(i, m4); });
    for (const [x, z] of lamps) this.lampPoints.push(new THREE.Vector3(x, SIDEWALK_H + 5.6, z + 1.5));
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
          // Foschia atmosferica: l'orizzonte è più chiaro e lattiginoso (prospettiva aerea)
          float haze = exp(-max(vDir.y, 0.0) * 9.0);
          col = mix(col, bottom * 1.1 + vec3(0.02), haze * 0.55);
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          // Disco solare, alone vicino e diffusione ampia (Mie) più forte verso l'orizzonte
          col += sunColor * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.25 + pow(s, 3.0) * 0.12 * haze);
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
    const r = Math.max(Math.abs(x), Math.abs(z));
    if (r > URBAN_HALF + 8) return DISTRICTS.country;
    if (Math.abs(x) > HALF + ROAD / 2 || Math.abs(z) > HALF + ROAD / 2) {
      const ring = Math.ceil((r - HALF) / CELL);
      return ring >= 3 ? DISTRICTS.villas : DISTRICTS.suburb;
    }
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
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    this.shadowHalf = s;
    scene.add(this.sun, this.sun.target);
    this.fog = new THREE.Fog(0xcfe3f5, 60, 420);
    scene.fog = this.fog;
    this._dir = new THREE.Vector3();
    this._snap = new THREE.Vector3();
    this._lightM = new THREE.Matrix4();
    this._lightInv = new THREE.Matrix4();
    this._up = new THREE.Vector3(0, 1, 0);
    this._origin = new THREE.Vector3();
    this.exposure = 1;

    // Luci reali dei lampioni: un piccolo gruppo di PointLight assegnate di notte ai lampioni più vicini
    this.lampLights = [];
    for (let i = 0; i < 6; i++) {
      // Sempre nella scena (intensità 0 di giorno): cambiare il numero di luci visibili ricompila gli shader
      const l = new THREE.PointLight(0xffc98a, 0, 22, 2);
      l.position.set(0, -500, 0);
      scene.add(l);
      this.lampLights.push(l);
    }
    this.lampTimer = 0;

    // Stelle (visibili solo di notte), agganciate al cielo
    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    const rnd = seededRandom(0x57a12 >>> 0);
    for (let i = 0; i < 1400; i++) {
      const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const r = Math.sqrt(1 - y * y);
      pts.push(Math.cos(th) * r * 850, y * 850, Math.sin(th) * r * 850);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.frustumCulled = false;
    world.sky.add(this.stars);

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
      this.exposure = 1;
      for (const l of this.lampLights) l.intensity = 0;
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
    this.fog.far = 750 + day * 950;

    // Il cielo (con le stelle) è centrato sul giocatore: niente bordi visibili ai margini della mappa
    this.world.sky.position.set(focus.x, 0, focus.z);
    this.starMat.opacity = THREE.MathUtils.clamp((0.45 - day) * 2.2, 0, 0.9);

    // Sole (o luna) che segue il giocatore per le ombre. Il centro della shadow camera viene agganciato
    // alla griglia dei texel della shadow map nello spazio della luce: le ombre non "tremolano" camminando.
    const sunUp = elev > -0.05;
    const lightDir = sunUp ? this._dir : this._dir.clone().negate().setY(Math.abs(this._dir.y) + 0.3).normalize();
    this._lightM.lookAt(this._origin, lightDir, this._up);
    this._lightInv.copy(this._lightM).invert();
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
    this._snap.set(focus.x, focus.y, focus.z).applyMatrix4(this._lightInv);
    this._snap.x = Math.round(this._snap.x / texel) * texel;
    this._snap.y = Math.round(this._snap.y / texel) * texel;
    this._snap.applyMatrix4(this._lightM);
    this.sun.position.set(this._snap.x + lightDir.x * 150, this._snap.y + lightDir.y * 150, this._snap.z + lightDir.z * 150);
    this.sun.target.position.copy(this._snap);
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
    for (const m of this.world.windowMaterials) m.emissiveIntensity = night * 0.55;
    if (this.world.lampHeadMat) this.world.lampHeadMat.emissiveIntensity = night * 2.2;
    if (this.world.doorLampMat) this.world.doorLampMat.emissiveIntensity = 0.4 + night * 1.8;
    this.updateLampLights(focus, night);
    // Esposizione: un filo più alta di notte (l'occhio si adatta), più bassa a mezzogiorno pieno
    this.exposure = 0.92 + night * 0.16 + dusk * 0.06;
    return { day, night };
  }

  /** Accende luci reali sui lampioni più vicini al giocatore (illuminano strada, auto e personaggi). */
  updateLampLights(focus, night) {
    const on = night > 0.35 && !this.indoor;
    this.lampTimer -= 1 / 60;
    if (on && this.lampTimer <= 0) {
      this.lampTimer = 0.5;
      const pts = this.world.lampPoints;
      const best = [];
      for (const p of pts) {
        const d = (p.x - focus.x) ** 2 + (p.z - focus.z) ** 2;
        if (d > 70 * 70) continue;
        best.push([d, p]);
      }
      best.sort((a, b) => a[0] - b[0]);
      this.lampLights.forEach((l, i) => {
        const b = best[i];
        if (b) l.position.copy(b[1]);
        l.userData.active = !!b;
      });
    }
    const k = on ? 38 * Math.min(1, (night - 0.35) * 2.5) : 0;
    for (const l of this.lampLights) l.intensity = l.userData.active ? k : 0;
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
    this.scene.remove(this.hemi, this.sun, this.sun.target, ...this.lampLights);
    this.stars.geometry.dispose();
    this.starMat.dispose();
    this.scene.fog = null;
    this.scene.environment = null;
    if (this.envTarget) this.envTarget.dispose();
    if (this.indoorEnv) this.indoorEnv.dispose();
    if (this.pmrem) this.pmrem.dispose();
  }
}
