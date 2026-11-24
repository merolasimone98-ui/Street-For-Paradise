// Città procedurale open-world (grafica Three.js + collisioni Cannon-es) e ciclo giorno/notte.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { seededRandom } from './birthdata.js';
import { buildLandmark, CITY_STYLE } from './landmarks.js';
import { tr } from './i18n.js';
import { makeFountain, makeShrine } from './sacred.js';

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
/** Punto del "burrone" (allucinazioni alla guida): sopra la conca del lago, lontano dalla città. */
export const LAKE_SPOT = { x: LAKE.x + LAKE.r + 30, z: LAKE.z, heading: -Math.PI / 2 };
// Gradino del marciapiede: basso (12 cm) per salirci a piedi e coi veicoli senza incastrarsi
export const SIDEWALK_H = 0.12;
/**
 * Piazza del Monumento: a nord della città, in campagna, collegata alla strada nord-sud x = PLAZA.x.
 * Il terreno viene spianato sotto la piazza e lungo la strada d'accesso (vedi terrainHeight).
 */
export const PLAZA = { x: -(GRID * CELL) / 2 + 4 * CELL, z: -((GRID * CELL) / 2 + RINGS * CELL) - 128, half: 92 };

/** 1 dentro piazza e strada d'accesso, 0 lontano (bordo sfumato). */
function plazaMask(x, z) {
  const urbanEdge = (GRID * CELL) / 2 + RINGS * CELL;
  const dx = Math.max(0, Math.abs(x - PLAZA.x) - PLAZA.half);
  const dz = Math.max(0, Math.abs(z - PLAZA.z) - PLAZA.half);
  const plaza = 1 - THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 2, 30);
  let road = 0;
  if (z < -urbanEdge + 15 && z > PLAZA.z) road = 1 - THREE.MathUtils.smoothstep(Math.abs(x - PLAZA.x), 10, 26);
  return Math.max(plaza, road);
}

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
  // Piazza del Monumento e strada d'accesso in piano
  if (r < PLAY_EDGE) h *= 1 - plazaMask(x, z);
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
  plaza: { id: 'plaza', name: 'Piazza del Monumento', style: 'none', minH: 0, maxH: 0, lots: [0, 0], sidewalk: 0xb9ad97, trees: true },
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
  homegarage: { name: 'Garage di casa', sign: null, w: 4.4, d: 1 },
  barber: { name: 'Salone di bellezza', sign: '✂ BARBIERE', signColor: '#ff9ad5', signBg: 'rgba(30,10,24,0.95)', w: 11, d: 9 },
  helmets: { name: 'Caschi & Moto Store', sign: 'CASCHI · MOTO', signColor: '#ffd24a', signBg: 'rgba(20,16,6,0.95)', w: 12, d: 10 },
};

/** Icone/colori per minimappa e mappa grande. */
export const MAP_ICONS = {
  home: { color: '#f0b43c', letter: 'C' }, hospital: { color: '#ff5a5a', letter: 'H' }, market: { color: '#7dff9a', letter: 'M' },
  bank: { color: '#f0c860', letter: 'B' }, bar: { color: '#ff6fae', letter: 'L' }, garage: { color: '#8fd0ff', letter: 'V' },
  weapons: { color: '#ff9a4a', letter: 'A' }, clothing: { color: '#d9b8ff', letter: 'S' }, pharmacy: { color: '#5dff8a', letter: '+' },
  restaurant: { color: '#ffd27a', letter: 'R' }, pizzeria: { color: '#ff6a4d', letter: 'P' }, church: { color: '#ffffff', letter: '†' },
  police: { color: '#8fc0ff', letter: 'Π' }, atm: { color: '#7fd0ff', letter: '€' },
  cathedral: { color: '#fff3c4', letter: '✝' }, chapel: { color: '#ffffff', letter: '†' }, house: { color: '#9be37a', letter: '⌂' },
  workshop: { color: '#ffb347', letter: 'O' }, homegarage: { color: '#f0b43c', letter: 'G' },
  monument: { color: '#e8d9b0', letter: '★' }, barber: { color: '#ff9ad5', letter: '✂' }, helmets: { color: '#ffd24a', letter: 'K' },
  fountain: { color: '#7fd0ff', letter: '≈' }, madonna: { color: '#9fc4ff', letter: 'M' }, crucifix: { color: '#ffe2b0', letter: '✝' },
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
  const label = tr(text); // insegna nella lingua scelta all'avvio della partita
  g.font = `600 ${Math.round(140 * Math.min(1, 12 / Math.max(12, label.length)))}px "Oswald", "Impact", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 512, 134);
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
    // Monumento tipico in una piazza dedicata (solido), sfondo naturale oltre il confine.
    // Tutto ciò che segue non usa il generatore della città: disposizione e salvataggi restano identici.
    this.buildPlaza();
    this.buildHomeGarage();
    this.buildTraffic();
    this.buildBarber();
    this.buildShopFront('helmets', 45);
    this.pickDealerSpots();
    this.buildSacredSites();
  }

  /* ---------- Chiese decorate, alberi, fontane, Madonna e crocifisso in città ---------- */
  /**
   * Aggiunte dopo la città (generatore separato dal seme: la disposizione della città e i salvataggi non cambiano):
   * portali, contrafforti, vetrate e alberi attorno a chiese e cattedrali; alberi lungo il viale della piazza;
   * due fontane (piazza e parco alberato); una statua della Madonna illuminata e un crocifisso in due punti diversi.
   */
  buildSacredSites() {
    const rng = seededRandom((this.seed ^ 0x5acced) >>> 0);
    this.fountains = [];
    this.shrines = [];
    this.extraTrees = [];
    this.night = 0;
    for (const c of this.churchSpots || []) this.decorateChurch(c);
    // Alberi lungo il viale che porta alla Piazza del Monumento
    const P = this.mapData.plaza || PLAZA;
    if (P) {
      const z0 = -URBAN_HALF - 6, z1 = P.z + P.half + 6;
      for (let z = z0; z > z1; z -= 14) for (const sx of [-1, 1]) this.extraTrees.push([P.x + sx * (ROAD / 2 + 3.5), z]);
    }
    // Fontana 1: in piazza (quadrante libero lontano dal monumento e dalle aiuole del bordo)
    if (P) this.addFountain(P.x - 52, P.z + 46, 3.4);
    // Fontana 2: nel parco alberato più vicino al centro (posizione lontana da alberi e panchine)
    const parks = this.mapData.blocks.filter((b) => b.park).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const park = parks[0];
    let parkSpot = null;
    if (park) {
      parkSpot = this.freeSpotIn(park.x, park.z, BLOCK / 2 - 7, 4.6);
      if (parkSpot) this.addFountain(parkSpot.x, parkSpot.z, 3.0);
    } else {
      // Nessun parco in questa città: un giardino con fontana nella seconda metà della piazza
      if (P) this.addFountain(P.x + 52, P.z + 46, 3.0);
    }
    // Candidati per Madonna e crocifisso: collina, parco (giardino/giochi), angolo della piazza, viale alberato
    const cands = [];
    const hill = this.findHillTop();
    if (hill) cands.push({ ...hill, where: 'collina' });
    for (const pk of parks.slice(0, 3)) {
      const s = this.freeSpotIn(pk.x, pk.z, BLOCK / 2 - 6, 2.6, parkSpot);
      if (s) cands.push({ ...s, y: SIDEWALK_H, where: 'parco' });
    }
    if (P) {
      cands.push({ x: P.x + 52, z: P.z - 50, y: 0, where: 'piazza' });
      cands.push({ x: P.x - 52, z: P.z - 50, y: 0, where: 'piazza' });
      cands.push({ x: P.x + ROAD / 2 + 6, z: -URBAN_HALF - 30, y: this.getHeight(P.x + ROAD / 2 + 6, -URBAN_HALF - 30), where: 'viale' });
    }
    if (cands.length >= 2) {
      const i = Math.floor(rng() * cands.length);
      let j = Math.floor(rng() * (cands.length - 1));
      if (j >= i) j++;
      // Due luoghi di tipo diverso quando possibile
      if (cands[j].where === cands[i].where) {
        const other = cands.findIndex((c, k) => k !== i && c.where !== cands[i].where);
        if (other >= 0) j = other;
      }
      this.addShrine('madonna', cands[i]);
      this.addShrine('crucifix', cands[j]);
    }
    this.buildExtraTrees();
  }

  /** Punto libero (lontano da alberi, panchine e da un punto da evitare) dentro un quadrato attorno a (cx, cz). */
  freeSpotIn(cx, cz, half, clearance, avoid = null) {
    let best = null, bestScore = -1;
    for (let gx = -half; gx <= half; gx += 2) {
      for (let gz = -half; gz <= half; gz += 2) {
        const x = cx + gx, z = cz + gz;
        let dmin = Infinity;
        for (const [tx, tz] of this.treeSpots) dmin = Math.min(dmin, Math.hypot(tx - x, tz - z));
        for (const [bx, bz] of this.benchSpots) dmin = Math.min(dmin, Math.hypot(bx - x, bz - z) - 1);
        if (avoid) dmin = Math.min(dmin, Math.hypot(avoid.x - x, avoid.z - z) - 5);
        if (dmin > bestScore) { bestScore = dmin; best = { x, z }; }
      }
    }
    return bestScore >= clearance ? best : null;
  }

  /** Cima di una collina in campagna, non troppo lontana dalla città (raggiungibile a piedi). */
  findHillTop() {
    let best = null;
    const P = PLAZA;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 24) {
      for (let r = URBAN_HALF + 40; r < URBAN_HALF + 170; r += 10) {
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        // Niente piazza, lago né strada d'accesso alla piazza
        if (Math.abs(x - P.x) < P.half + 14 && z < -URBAN_HALF + 10) continue;
        if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 18) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) > PLAY_EDGE - 20) continue;
        const y = this.getHeight(x, z);
        if (!best || y > best.y) best = { x, z, y };
      }
    }
    return best && best.y > 3 ? best : null;
  }

  addFountain(x, z, radius) {
    const f = makeFountain(radius);
    const y = this.getHeight(x, z) > 0.5 ? this.getHeight(x, z) : (Math.abs(x) < URBAN_HALF && Math.abs(z) < URBAN_HALF ? SIDEWALK_H : 0);
    f.group.position.set(x, y, z);
    this.root.add(f.group);
    // Collider: vasca (cilindro approssimato con due box incrociati) e colonna
    const r = f.radius;
    this.addStaticBox(x, y + 0.4, z, r, 0.4, r * 0.72);
    this.addStaticBox(x, y + 0.4, z, r * 0.72, 0.4, r);
    this.fountains.push({ x, z, r, f });
    (this.mapData.landmarks || (this.mapData.landmarks = [])).push({ x, z, type: 'fountain', name: 'Fontana' });
  }

  addShrine(kind, spot) {
    const s = makeShrine(kind);
    const y = spot.y ?? this.getHeight(spot.x, spot.z);
    s.group.position.set(spot.x, y, spot.z);
    // Rivolta verso il centro della città
    s.group.rotation.y = Math.atan2(-spot.x, -spot.z);
    this.root.add(s.group);
    this.addStaticBox(spot.x, y + 0.9, spot.z, 0.75, 0.9, 0.75);
    const nx = Math.sin(s.group.rotation.y), nz = Math.cos(s.group.rotation.y);
    this.shrines.push({ kind, x: spot.x, z: spot.z, y, px: spot.x + nx * 1.9, pz: spot.z + nz * 1.9, facing: s.group.rotation.y + Math.PI, where: spot.where, s });
    (this.mapData.landmarks || (this.mapData.landmarks = [])).push({ x: spot.x, z: spot.z, type: kind === 'madonna' ? 'madonna' : 'crucifix', name: kind === 'madonna' ? 'Statua della Madonna' : 'Crocifisso' });
  }

  /** Portale con colonne e timpano, gradini, contrafforti, vetrate laterali, aiuole e alberi attorno alla chiesa. */
  decorateChurch({ cx, bz, w, d, h, nz }) {
    const stone = new THREE.MeshStandardMaterial({ color: 0xe4dac6, roughness: 0.8 });
    const faceZ = bz + nz * (d / 2);
    const base = SIDEWALK_H;
    // Gradini davanti all'ingresso (bassi: si salgono a piedi senza fatica)
    for (let k = 0; k < 2; k++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(7 - k * 0.8, 0.06, 1.0 - k * 0.4), stone);
      step.position.set(cx, base + 0.03 + k * 0.06, faceZ + nz * (0.5 - k * 0.2));
      step.receiveShadow = true;
      this.root.add(step);
    }
    // Colonne del portale e timpano triangolare
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 5.2, 14), stone);
      col.position.set(cx + sx * 2.3, base + 2.6, faceZ + nz * 0.45);
      col.castShadow = true;
      this.root.add(col);
      this.addStaticBox(cx + sx * 2.3, base + 2.6, faceZ + nz * 0.45, 0.3, 2.6, 0.3);
      const capital = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 0.8), stone);
      capital.position.set(cx + sx * 2.3, base + 5.3, faceZ + nz * 0.45);
      this.root.add(capital);
    }
    const ped = new THREE.Shape();
    ped.moveTo(-3.1, 0); ped.lineTo(0, 1.6); ped.lineTo(3.1, 0); ped.closePath();
    const pedGeo = new THREE.ExtrudeGeometry(ped, { depth: 0.7, bevelEnabled: false });
    pedGeo.translate(0, 0, -0.35);
    const pediment = new THREE.Mesh(pedGeo, stone);
    pediment.position.set(cx, base + 5.42, faceZ + nz * 0.45);
    pediment.castShadow = true;
    this.root.add(pediment);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.3, 0.8), stone);
    lintel.position.set(cx, base + 5.4, faceZ + nz * 0.45);
    this.root.add(lintel);
    // Croce sopra il timpano
    const gold = new THREE.MeshStandardMaterial({ color: 0xd6a73a, metalness: 0.9, roughness: 0.25 });
    const cv = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.0, 0.15), gold);
    cv.position.set(cx, base + 7.5, faceZ + nz * 0.45);
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.15, 0.15), gold);
    ch.position.set(cx, base + 7.7, faceZ + nz * 0.45);
    this.root.add(cv, ch);
    // Contrafforti e vetrate a sesto acuto sui fianchi
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1c2440, emissive: 0x7a5ad0, emissiveIntensity: 0.35, roughness: 0.2 });
    this.windowMaterials.push(glassMat);
    const n = Math.max(2, Math.floor(d / 6));
    for (const sx of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const z = bz - d / 2 + 3 + i * ((d - 6) / Math.max(1, n - 1));
        const but = new THREE.Mesh(new THREE.BoxGeometry(0.8, h * 0.7, 1.0), stone);
        but.position.set(cx + sx * (w / 2 + 0.4), base + h * 0.35, z);
        but.castShadow = true;
        this.root.add(but);
        this.addStaticBox(cx + sx * (w / 2 + 0.4), base + h * 0.35, z, 0.4, h * 0.35, 0.5);
        if (i < n - 1) {
          const wz = z + ((d - 6) / Math.max(1, n - 1)) / 2;
          const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, h * 0.42), glassMat);
          win.position.set(cx + sx * (w / 2 + 0.02), base + h * 0.5, wz);
          win.rotation.y = sx * Math.PI / 2;
          const arch = new THREE.Mesh(new THREE.CircleGeometry(0.6, 16, 0, Math.PI), glassMat);
          arch.position.set(cx + sx * (w / 2 + 0.02), base + h * 0.5 + h * 0.21, wz);
          arch.rotation.y = sx * Math.PI / 2;
          this.root.add(win, arch);
        }
      }
    }
    // Aiuole con fiori ai lati della facciata e alberi attorno all'edificio
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x9a9283, roughness: 1 });
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xd65a7a, roughness: 0.9, flatShading: true });
    for (const sx of [-1, 1]) {
      const px = cx + sx * 4.6, pz = faceZ + nz * 1.3;
      const planter = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.9), planterMat);
      planter.position.set(px, base + 0.225, pz);
      const flowers = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), flowerMat);
      flowers.scale.set(1.3, 0.5, 0.7);
      flowers.position.set(px, base + 0.55, pz);
      this.root.add(planter, flowers);
      this.addStaticBox(px, base + 0.225, pz, 0.8, 0.225, 0.45);
      this.extraTrees.push([cx + sx * (w / 2 + 3.4), bz - nz * d / 3]);
      this.extraTrees.push([cx + sx * (w / 2 + 3.4), bz + nz * d / 3]);
    }
  }

  /** Alberi aggiunti (chiese, viale della piazza): istanziati, con collider sottile sul tronco. */
  buildExtraTrees() {
    const spots = this.extraTrees.filter(([x, z]) => !this.doors.some((dd) => Math.hypot(dd.x - x, dd.z - z) < 4));
    if (!spots.length) return;
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.26, 3.2, 7);
    trunkGeo.translate(0, 1.6, 0);
    const crownGeo = new THREE.IcosahedronGeometry(2.0, 1);
    crownGeo.translate(0, 4.4, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 1 }), spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 1, flatShading: true }), spots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), col = new THREE.Color();
    const yAxis = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z], i) => {
      const inCity = Math.abs(x) < URBAN_HALF && Math.abs(z) < URBAN_HALF;
      const y = inCity ? SIDEWALK_H : this.getHeight(x, z);
      const sc = 0.85 + ((i * 37) % 10) / 25;
      p.set(x, y, z);
      q.setFromAxisAngle(yAxis, i * 1.3);
      m4.compose(p, q, new THREE.Vector3(sc, sc, sc));
      trunks.setMatrixAt(i, m4);
      crowns.setMatrixAt(i, m4);
      crowns.setColorAt(i, col.setHSL(0.26 + ((i * 13) % 7) / 100, 0.45, 0.3 + ((i * 7) % 9) / 100));
      this.addStaticBox(x, y + 1.5, z, 0.3, 1.5, 0.3);
    });
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    this.root.add(trunks, crowns);
  }

  /**
   * Salone di bellezza: porta e insegna sulla facciata di un palazzo del centro che dà sul marciapiede
   * (scelto in modo deterministico, il più vicino a casa, senza usare il generatore della città).
   */
  buildBarber() {
    this.buildShopFront('barber', 30);
  }

  /**
   * Negozio su una facciata esistente del centro (deterministico, senza generatore): il palazzo più vicino
   * a casa oltre minDist metri, lontano dalle altre porte e dai bancomat. La porta va in coda all'elenco.
   */
  buildShopFront(type, minDist) {
    const home = this.mapData.home || { x: 0, z: 0 };
    let best = null, bestD = Infinity;
    for (const b of this.mapData.buildings) {
      if (b.district !== 'middle' && b.district !== 'rich' && b.district !== 'worker') continue;
      if (b.w < 9 || b.d < 8) continue;
      const row = Math.floor((b.z + HALF) / CELL);
      const col = Math.floor((b.x + HALF) / CELL);
      if (row < 0 || row >= GRID || col < 0 || col >= GRID) continue;
      const edge = -HALF + row * CELL + CELL / 2 + BLOCK / 2;
      const face = b.z + b.d / 2;
      if (edge - face < 1 || edge - face > 7.5) continue; // facciata sul marciapiede sud
      if (this.doors.some((d) => Math.hypot(d.x - b.x, d.z - face) < 14)) continue;
      if (this.atms.some((a) => Math.hypot(a.mx - b.x, a.mz - face) < 4)) continue;
      const dd = Math.hypot(b.x - home.x, face - home.z);
      if (dd > minDist && dd < bestD) { bestD = dd; best = { x: b.x, face }; }
    }
    if (!best) return;
    this.addDoor(type, best.x, best.face, BUILDING_TYPES[type], 1.8, 1);
  }

  /** Spacciatori: angoli appartati dei marciapiedi in periferia e zona industriale (nessuna icona sulla mappa). */
  pickDealerSpots() {
    const spots = [];
    for (const [r, c] of [[5, 0], [6, 2], [4, 6], [5, 2]]) {
      if (this.features[`${r},${c}`]) continue;
      const cx = -HALF + c * CELL + CELL / 2, cz = -HALF + r * CELL + CELL / 2;
      spots.push({ x: cx + BLOCK / 2 - 2.4, z: cz - 7.5, facing: -Math.PI / 2 });
    }
    this.dealerSpots = spots.slice(0, 3);
  }

  /* ---------- Piazza del Monumento ---------- */
  buildPlaza() {
    const lm = buildLandmark(this.city.id, { ...PLAZA, edge: PLAY_EDGE });
    this.landmark = lm.group;
    this.root.add(this.landmark);
    for (const c of lm.colliders) this.addStaticBox(c.x, c.y, c.z, c.hx, c.hy, c.hz);
    this.collidables.push(...lm.solids);
    const P = PLAZA;
    // Pavimentazione in pietra con fughe e cordolo
    const c = makeCanvas(512, 512);
    const g = c.getContext('2d');
    g.fillStyle = '#b9ad97';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < 512; x += 64) {
      const k = 0.9 + ((x * 7 + y * 13) % 17) / 100;
      g.fillStyle = `rgb(${Math.round(190 * k)},${Math.round(178 * k)},${Math.round(156 * k)})`;
      g.fillRect(x + 2, y + 2, 60, 28);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(P.half / 8, P.half / 8);
    tex.anisotropy = 8;
    const paving = new THREE.Mesh(new THREE.PlaneGeometry(P.half * 2, P.half * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    paving.rotation.x = -Math.PI / 2;
    paving.position.set(P.x, 0.04, P.z);
    paving.receiveShadow = true;
    this.root.add(paving);
    // Strada d'accesso dalla città
    const z0 = -URBAN_HALF + 2, z1 = P.z + P.half - 1;
    const roadTex = asphaltTextures(seededRandom((this.seed ^ 0x9a2a) >>> 0), 4);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, z0 - z1), new THREE.MeshStandardMaterial({ map: roadTex.map, normalMap: roadTex.normalMap, roughnessMap: roadTex.roughnessMap, roughness: 1 }));
    road.rotation.x = -Math.PI / 2;
    road.position.set(P.x, 0.035, (z0 + z1) / 2);
    road.receiveShadow = true;
    this.root.add(road);
    // Panchine, aiuole con alberi, lampioni decorativi (con collider) ai bordi della piazza
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.6 });
    const planterMat = new THREE.MeshStandardMaterial({ color: 0x8f877a, roughness: 1 });
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 1, flatShading: true });
    const edgeR = P.half - 8;
    for (let i = -3; i <= 3; i++) {
      for (const [sx, sz] of [[i * 24, -edgeR], [i * 24, edgeR], [-edgeR, i * 24], [edgeR, i * 24]]) {
        if (Math.abs(sx) < 10 && sz > 0) continue; // ingresso dalla strada (lato sud)
        const x = P.x + sx, z = P.z + sz;
        const planter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 2.2), planterMat);
        planter.position.set(x, 0.3, z);
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 1), crownMat);
        crown.position.set(x, 3.8, z);
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 3, 6), new THREE.MeshStandardMaterial({ color: 0x5a3f2c, roughness: 1 }));
        trunk.position.set(x, 2, z);
        planter.castShadow = crown.castShadow = true;
        this.root.add(planter, trunk, crown);
        this.addStaticBox(x, 0.6, z, 1.1, 0.6, 1.1);
        // Panchina accanto
        const bx = x + (Math.abs(sz) === edgeR ? 3.2 : 0), bz = z + (Math.abs(sx) === edgeR ? 3.2 : 0);
        const bench = new THREE.Group();
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), benchMat);
        seat.position.y = 0.48;
        const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.06), benchMat);
        back.position.set(0, 0.78, -0.24);
        bench.add(seat, back);
        for (const lx of [-0.8, 0.8]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.48, 0.45), ironMat);
          leg.position.set(lx, 0.24, 0);
          bench.add(leg);
        }
        bench.position.set(bx, 0.04, bz);
        bench.rotation.y = Math.atan2(P.x - bx, P.z - bz);
        this.root.add(bench);
      }
    }
    // Targa con il nome del monumento all'ingresso
    const plateTex = signTexture(`★ ${CITY_STYLE[this.city.id] ? CITY_STYLE[this.city.id].label : 'Monumento'}`, '#f6e7b0', 'rgba(30,24,14,0.95)');
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: plateTex, toneMapped: false }));
    plate.position.set(P.x + 11, 2.4, P.z + P.half - 2);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.4, 0.2), ironMat);
    post.position.set(P.x + 11, 1.2, P.z + P.half - 2.05);
    this.root.add(plate, post);
    this.addStaticBox(P.x + 11, 1.2, P.z + P.half - 2.05, 0.1, 1.2, 0.1);
    this.mapData.plaza = { x: P.x, z: P.z, half: P.half, roadZ0: z0, roadZ1: z1, label: lm.style.label };
    this.mapData.landmarks = [{ x: P.x, z: P.z, type: 'monument', name: `Piazza del Monumento · ${lm.style.label}` }];
  }

  /* ---------- Garage di casa: serranda accanto all'ingresso di casa ---------- */
  buildHomeGarage() {
    const home = this.mapData.home;
    if (!home) return;
    const nz = this.spawn && this.spawn.yaw === Math.PI ? -1 : 1;
    const x = home.x + 5.2;
    const faceZ = home.z;
    const W = 4.2, H = 3.0;
    const slatC = makeCanvas(128, 128);
    const sg = slatC.getContext('2d');
    sg.fillStyle = '#9aa3ab';
    sg.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 12) { sg.fillStyle = '#7c858d'; sg.fillRect(0, y, 128, 2); sg.fillStyle = '#b8c0c7'; sg.fillRect(0, y + 2, 128, 2); }
    const slatTex = new THREE.CanvasTexture(slatC);
    slatTex.colorSpace = THREE.SRGBColorSpace;
    slatTex.wrapS = slatTex.wrapT = THREE.RepeatWrapping;
    slatTex.repeat.set(2, 2);
    const g = new THREE.Group();
    const shutter = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.1), new THREE.MeshStandardMaterial({ map: slatTex, bumpMap: slatTex, bumpScale: 0.6, metalness: 0.6, roughness: 0.4 }));
    shutter.position.set(0, H / 2, 0.06);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4, metalness: 0.5 });
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.16, H + 0.2, 0.2), frameMat);
    fl.position.set(-W / 2 - 0.08, (H + 0.2) / 2, 0.1);
    const fr = fl.clone();
    fr.position.x = W / 2 + 0.08;
    const box = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 0.4, 0.35), frameMat);
    box.position.set(0, H + 0.2, 0.17);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture('GARAGE', '#f0b43c', 'rgba(14,12,8,0.95)'), toneMapped: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), signMat);
    sign.position.set(0, H + 0.75, 0.12);
    g.add(shutter, fl, fr, box, sign);
    g.position.set(x, SIDEWALK_H, faceZ);
    if (nz < 0) g.rotation.y = Math.PI;
    this.root.add(g);
    // Rampa/passo carrabile dipinto sul marciapiede
    const ramp = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.9 }));
    ramp.rotation.x = -Math.PI / 2;
    ramp.position.set(x, SIDEWALK_H + 0.012, faceZ + nz * 2);
    ramp.receiveShadow = true;
    this.root.add(ramp);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0b43c, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.68, 48), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, SIDEWALK_H + 0.02, faceZ + nz * 1.2);
    ring.renderOrder = 2;
    this.root.add(ring);
    this.doorRings.push(ring);
    const door = { id: 'homegarage', type: 'homegarage', name: 'Garage di casa', x, z: faceZ, nx: 0, nz };
    this.doors.push(door);
    this.mapData.doors.push(door);
    this.homeGarage = door;
    // Nessun veicolo parcheggiato davanti alla serranda
    this.parkingSpots = this.parkingSpots.filter(([px, pz]) => Math.hypot(px - x, pz - (faceZ + nz * 8)) > 9);
  }

  /* ---------- Semafori agli incroci del centro e segnaletica nei quartieri ---------- */
  buildTraffic() {
    const lines = [];
    for (let i = 0; i <= GRID; i++) lines.push(-HALF + i * CELL);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    // Semafori: incroci interni del centro (escluse le strade di bordo), un palo per ogni angolo.
    // Ogni testa guarda il traffico che arriva lungo un asse: gruppo 0 = asse Z (nord-sud), gruppo 1 = asse X.
    const poles = [];
    const heads = [[], []];
    for (let i = 1; i < GRID; i++) {
      for (let j = 1; j < GRID; j++) {
        const ix = lines[i], iz = lines[j];
        for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          // Il palo sta sul marciapiede vicino all'angolo (lontano dal lampione d'angolo);
          // la testa guarda chi arriva verso l'incrocio lungo il suo asse
          const axis = sx * sz > 0 ? 0 : 1;
          const x = ix + sx * (ROAD / 2 + (axis === 0 ? 0.6 : 3.2));
          const z = iz + sz * (ROAD / 2 + (axis === 0 ? 3.2 : 0.6));
          const rot = axis === 0 ? (sz > 0 ? 0 : Math.PI) : (sx > 0 ? Math.PI / 2 : -Math.PI / 2);
          poles.push([x, z, rot]);
          heads[axis].push([x, z, rot]);
          this.addStaticBox(x, SIDEWALK_H + 1.7, z, 0.1, 1.7, 0.1);
        }
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8);
    poleGeo.translate(0, 1.7, 0);
    const housingGeo = new THREE.BoxGeometry(0.34, 0.95, 0.26);
    housingGeo.translate(0, 3.35, 0.05);
    const visorGeo = new THREE.BoxGeometry(0.36, 0.05, 0.16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.6 });
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.6, metalness: 0.3 });
    const inst = (geo, mat, list, offset = null) => {
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      list.forEach(([x, z, rot], i) => {
        p.set(x, SIDEWALK_H, z);
        q.setFromAxisAngle(yAxis, rot);
        m4.compose(p, q, one);
        if (offset) m4.multiply(offset);
        im.setMatrixAt(i, m4);
      });
      im.count = list.length;
      im.instanceMatrix.needsUpdate = true;
      this.root.add(im);
      return im;
    };
    inst(poleGeo, poleMat, poles).castShadow = true;
    inst(housingGeo, housingMat, poles).castShadow = true;
    // Lampade: 3 per testa (rosso, giallo, verde); materiali per gruppo → si accendono a turno
    const bulbGeo = new THREE.CircleGeometry(0.085, 16);
    this.trafficMats = [0, 1].map(() => ({
      red: new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 0, roughness: 0.3 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0x221800, emissive: 0xffb21a, emissiveIntensity: 0, roughness: 0.3 }),
      green: new THREE.MeshStandardMaterial({ color: 0x002210, emissive: 0x1aff7a, emissiveIntensity: 0, roughness: 0.3 }),
    }));
    for (const axis of [0, 1]) {
      for (const [k, y] of [['red', 3.64], ['yellow', 3.36], ['green', 3.08]]) {
        const off = new THREE.Matrix4().makeTranslation(0, y, 0.185);
        inst(bulbGeo, this.trafficMats[axis][k], heads[axis], off);
        const vOff = new THREE.Matrix4().makeTranslation(0, y + 0.11, 0.24);
        inst(visorGeo, housingMat, heads[axis], vOff);
      }
    }
    this.trafficPhase = -1;

    // Segnaletica nei quartieri: STOP agli incroci delle strade residenziali, limite 50 all'ingresso della città,
    // precedenza sulle strade di bordo del centro. Pali con collider sottile.
    const signCanvas = (draw) => {
      const c = makeCanvas(128, 128);
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const stopTex = signCanvas((g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k * Math.PI) / 4; g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); }
      g.closePath(); g.fill();
      g.fillStyle = '#c8102e';
      g.beginPath();
      for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + (k * Math.PI) / 4; g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); }
      g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; g.font = '700 38px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('STOP', 64, 66);
    });
    const yieldTex = signCanvas((g) => {
      g.fillStyle = '#c8102e';
      g.beginPath(); g.moveTo(4, 10); g.lineTo(124, 10); g.lineTo(64, 120); g.closePath(); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(24, 22); g.lineTo(104, 22); g.lineTo(64, 96); g.closePath(); g.fill();
    });
    const limitTex = signCanvas((g) => {
      g.fillStyle = '#c8102e'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111111'; g.font = '700 50px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('50', 64, 68);
    });
    const allLines = [];
    for (let i = -RINGS; i <= GRID + RINGS; i++) allLines.push(-HALF + i * CELL);
    const stops = [], yields = [], limits = [];
    for (const ix of allLines) {
      for (const iz of allLines) {
        const inner = Math.abs(ix) < HALF - 1 && Math.abs(iz) < HALF - 1;
        if (inner) continue; // incroci del centro: ci sono i semafori
        const edge = Math.abs(ix) > URBAN_HALF - 1 || Math.abs(iz) > URBAN_HALF - 1;
        if (edge) continue;
        const onCityBorder = Math.abs(Math.abs(ix) - HALF) < 1 || Math.abs(Math.abs(iz) - HALF) < 1;
        // Un cartello per incrocio, vicino all'angolo sud-est (lontano dal lampione), rivolto al traffico da sud
        const x = ix + ROAD / 2 + 0.6, z = iz + ROAD / 2 + 3.5;
        (onCityBorder ? yields : stops).push([x, z, 0]);
        this.addStaticBox(x, SIDEWALK_H + 1.2, z, 0.06, 1.2, 0.06);
      }
    }
    // Limite 50 sulle quattro strade principali d'ingresso al centro
    for (const l of [lines[2], lines[5]]) {
      const o = ROAD / 2 + 6;
      limits.push([l + ROAD / 2 + 0.6, HALF + o, 0], [l - ROAD / 2 - 0.6, -HALF - o, Math.PI], [HALF + o, l - ROAD / 2 - 0.6, Math.PI / 2], [-HALF - o, l + ROAD / 2 + 0.6, -Math.PI / 2]);
    }
    for (const [x, z] of limits) this.addStaticBox(x, SIDEWALK_H + 1.2, z, 0.06, 1.2, 0.06);
    const signPole = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6);
    signPole.translate(0, 1.2, 0);
    const plate = new THREE.CircleGeometry(0.38, 24);
    plate.translate(0, 2.25, 0.05);
    const tri = new THREE.PlaneGeometry(0.8, 0.8);
    tri.translate(0, 2.25, 0.05);
    const all = [...stops, ...yields, ...limits];
    inst(signPole, poleMat, all).castShadow = true;
    inst(plate, new THREE.MeshStandardMaterial({ map: stopTex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), stops);
    inst(tri, new THREE.MeshStandardMaterial({ map: yieldTex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), yields);
    inst(plate, new THREE.MeshStandardMaterial({ map: limitTex, transparent: true, alphaTest: 0.5, roughness: 0.5 }), limits);
    // Retro dei cartelli (grigio)
    const back = plate.clone();
    back.rotateY(Math.PI);
    inst(back, new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.4 }), [...stops, ...limits]);
  }

  /** Ciclo dei semafori: 14 s verde, 3 s giallo, poi tocca all'altro asse (rosso per l'asse fermo). */
  updateTraffic(t, night) {
    this.night = night; // usato anche da edicole votive e fontane (update)
    if (!this.trafficMats) return;
    const cycle = 34;
    const k = t % cycle;
    const phase = k < 14 ? 0 : k < 17 ? 1 : k < 31 ? 2 : 3; // 0: Z verde · 1: Z giallo · 2: X verde · 3: X giallo
    const glow = 2.2 + night * 1.6;
    if (phase === this.trafficPhase && Math.abs(glow - (this.trafficGlow || 0)) < 0.05) return;
    this.trafficPhase = phase;
    this.trafficGlow = glow;
    const set = (axis, light) => {
      const m = this.trafficMats[axis];
      m.red.emissiveIntensity = light === 'red' ? glow : 0;
      m.yellow.emissiveIntensity = light === 'yellow' ? glow : 0;
      m.green.emissiveIntensity = light === 'green' ? glow : 0;
    };
    set(0, phase === 0 ? 'green' : phase === 1 ? 'yellow' : 'red');
    set(1, phase === 2 ? 'green' : phase === 3 ? 'yellow' : 'red');
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
  /**
   * Collider statico a scatola. I collider piccoli e medi (palazzi, alberi, lampioni, pali, cartelli…) vengono
   * raggruppati in un corpo composto per zona di 44 m: le collisioni sono identiche, ma la fase di broadphase
   * di Cannon-es gestisce poche centinaia di corpi invece di migliaia (fisica molto più leggera e fluida).
   */
  addStaticBox(x, y, z, hx, hy, hz) {
    if (Math.max(hx, hz) > 30) {
      const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
      body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
      body.position.set(x, y, z);
      this.physics.addBody(body);
      this.bodies.push(body);
      return body;
    }
    if (!this.staticBuckets) this.staticBuckets = new Map();
    const S = 44;
    const kx = Math.floor(x / S), kz = Math.floor(z / S);
    const key = `${kx},${kz}`;
    let body = this.staticBuckets.get(key);
    if (!body) {
      body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
      body.position.set((kx + 0.5) * S, 0, (kz + 0.5) * S);
      this.physics.addBody(body);
      this.bodies.push(body);
      this.staticBuckets.set(key, body);
    }
    body.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), new CANNON.Vec3(x - body.position.x, y, z - body.position.z));
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
      if (plazaMask(x, z) > 0.01) continue; // niente alberi sulla piazza e sulla strada del monumento
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
    // Dettagli architettonici, alberi e aiuole vengono aggiunti dopo la costruzione della città
    // (decorateChurch): qui niente generatore casuale, così la città resta identica.
    (this.churchSpots || (this.churchSpots = [])).push({ cx, bz, w, d, h, nz });
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
            // Prezzi ribassati del 35%: case ~€ 105.000-215.000, villette ~€ 255.000-580.000
            // (una sola estrazione dal generatore, come prima: la città e i salvataggi non cambiano)
            const listPrice = villas ? (390 + rng() * 500) * 1000 : (165 + rng() * 165) * 1000;
            const price = Math.round((listPrice * 0.65) / 5000) * 5000;
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
    if (Math.abs(x - PLAZA.x) < PLAZA.half + 4 && Math.abs(z - PLAZA.z) < PLAZA.half + 4) return DISTRICTS.plaza;
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
    // Fontane (acqua animata) ed edicole votive (lumini, fascio di luce più forte di notte)
    for (const f of this.fountains || []) f.f.update(t);
    for (const s of this.shrines || []) s.s.update(t, this.night || 0);
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
