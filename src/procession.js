// Processione del Venerdì Santo: dalle 18 un prete con il crocifisso guida almeno 50 fedeli (con le candele)
// dalla Piazza del Monumento fino alla Cattedrale. All'arrivo, in cattedrale, si pregano Padre Nostro e Ave Maria
// insieme ai fedeli (+10 Aura, una volta). I fedeli sono NPC con corpo Cannon-es cinematico (mesh e corpo coincidono).
import * as THREE from 'three';
import { Npc } from './npcs.js';
import { randomLook } from './characters.js';
import { makeCrucifix } from './sacred.js';
import { dayInfo } from './calendar.js';
import { HALF, CELL, URBAN_HALF, SIDEWALK_H } from './world.js';
import { audio } from './audio.js';

export const PROCESSION_FAITHFUL = 50;
const START_HOUR = 18;
const END_HOUR = 23.5;
const SPEED = 1.15; // m/s, passo lento
const ROW_GAP = 1.5;
const COLS = 4;

export class Procession {
  constructor(game) {
    this.game = game;
    this.state = 'idle'; // idle → gathering → walking → arrived
    this.npcs = [];
    this.priest = null;
    this.path = null;
    this.s = 0;
    this.waitT = 0;
    this.visible = true;
    this.day = -1;
  }

  /** Oggi è Venerdì Santo? */
  isGoodFriday() {
    const info = dayInfo(this.game.today());
    return info.feast === 'Venerdì Santo';
  }

  get active() {
    return this.state !== 'idle';
  }

  /** Arrivata in cattedrale oggi (serve per la preghiera finale). */
  get arrivedToday() {
    return this.state === 'arrived' && this.day === this.game.day;
  }

  /** Percorso: centro della piazza → ingresso sud → viale → strade della città → porta della Cattedrale. */
  buildPath() {
    const w = this.game.world;
    const P = w.mapData.plaza;
    const cathedral = w.doors.find((d) => d.type === 'cathedral');
    if (!P || !cathedral) return null;
    const lineAt = (k) => -HALF + k * CELL;
    // Strada orizzontale più vicina davanti alla porta della cattedrale
    const k = Math.round((cathedral.z + HALF) / CELL);
    const roadZ = lineAt(k);
    // Partenza nella metà sud della piazza (lontano dal monumento): tutta la colonna sta tra qui e l'uscita
    const pts = [
      [P.x, P.z + 36],
      [P.x, P.z + P.half - 2],
      [P.x, -URBAN_HALF + 2],
      [P.x, roadZ],
      [cathedral.x, roadZ],
      [cathedral.x, cathedral.z + cathedral.nz * 3.2],
    ];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1], door: cathedral };
  }

  /** Punto (x, z) e direzione lungo il percorso alla distanza s (s < 0: davanti alla partenza, in piazza). */
  sample(s) {
    const { pts, cum, len } = this.path;
    s = Math.max(-40, Math.min(len, s));
    if (s <= 0) {
      const dx = pts[1][0] - pts[0][0], dz = pts[1][1] - pts[0][1];
      const l = Math.hypot(dx, dz) || 1;
      return { x: pts[0][0] + (dx / l) * s, z: pts[0][1] + (dz / l) * s, h: Math.atan2(dx, dz) };
    }
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (s - cum[i - 1]) / seg;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, h: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }

  groundY(x, z, nearDoor) {
    if (nearDoor) return SIDEWALK_H;
    const inCity = Math.abs(x) < URBAN_HALF && Math.abs(z) < URBAN_HALF;
    return inCity ? 0 : Math.max(0, this.game.world.getHeight(x, z));
  }

  /** Raduna prete e fedeli in piazza (formazione in file da 4). */
  spawn() {
    this.path = this.buildPath();
    if (!this.path) return false;
    const g = this.game;
    this.day = g.day;
    const rng = Math.random;
    // Prete in talare nera con il crocifisso processionale (asta + croce), affiancato da due chierichetti
    this.priest = new Npc(g.scene, g.physics, { ...randomLook(rng), sex: 'm', shirt: 0x111111, pants: 0x111111, sleeves: 'long', hair: 0x8a8a8a, cap: null }, { x: 0, z: 0, name: 'Don Michele' });
    const staff = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.3, 8), new THREE.MeshStandardMaterial({ color: 0xd6a73a, metalness: 0.9, roughness: 0.25 }));
    pole.position.y = 1.15;
    const cross = makeCrucifix(0.85, { wood: 0x5a3a22 });
    cross.position.y = 2.25;
    staff.add(pole, cross);
    staff.position.set(0.12, 0.55, 0.38);
    this.priest.mesh.add(staff);
    this.npcs = [];
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa040, emissiveIntensity: 2.4 });
    const waxMat = new THREE.MeshStandardMaterial({ color: 0xf8f4e8, roughness: 0.6 });
    for (let i = 0; i < PROCESSION_FAITHFUL + 2; i++) {
      const altar = i < 2;
      const look = altar
        ? { ...randomLook(rng), shirt: 0xf4f1ea, pants: 0xf4f1ea, sleeves: 'long' }
        : { ...randomLook(rng), sleeves: 'long' };
      const n = new Npc(g.scene, g.physics, look, { x: 0, z: 0 });
      // Candela accesa in mano (chierichetti con candele più alte)
      const hold = n.mesh.userData.holdR;
      if (hold && (altar || i % 2 === 0)) {
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, altar ? 0.5 : 0.22, 8), waxMat);
        candle.position.y = altar ? 0.2 : 0.08;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, 6), flameMat);
        flame.position.y = altar ? 0.47 : 0.21;
        hold.add(candle, flame);
      }
      n.slot = altar ? { row: -1, col: i === 0 ? -0.9 : 0.9 } : { row: Math.floor((i - 2) / COLS), col: ((i - 2) % COLS) - (COLS - 1) / 2 };
      n.kind = 'procession';
      this.npcs.push(n);
    }
    // La testa parte già avanti quanto la colonna: l'ultima fila resta dentro la piazza
    this.s = (PROCESSION_ROWS + 2) * ROW_GAP;
    this.state = 'gathering';
    this.waitT = 0;
    this.place(0, true);
    this.setVisible(!g.interior);
    g.toast('Venerdì Santo: i fedeli si radunano nella Piazza del Monumento per la processione verso la Cattedrale.', 5200);
    return true;
  }

  /** Posiziona tutti lungo il percorso: il prete in testa, poi chierichetti e fedeli in file. */
  place(dt, snap = false) {
    const moving = this.state === 'walking';
    const put = (n, s, lateral, animate) => {
      const q = this.sample(s);
      const rx = Math.cos(q.h), rz = -Math.sin(q.h);
      const x = q.x + rx * lateral, z = q.z + rz * lateral;
      const nearDoor = this.path.len - s < 6;
      const y = this.groundY(x, z, nearDoor);
      const dx = x - n.pos.x, dz = z - n.pos.z;
      const v = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      n.pos.set(x, y, z);
      if (snap || v > 0.05) n.facing = q.h;
      n.speed += ((moving ? Math.min(2, v) : 0) - n.speed) * Math.min(1, dt * 6);
      n.body.velocity.set(0, 0, 0);
      n.body.position.set(x, y, z);
      if (animate || snap) {
        n.sync();
        n.animator.update(dt || 1 / 60, { speed: n.speed, grounded: true, state: this.state === 'arrived' ? 'pray' : 'auto' });
      }
    };
    const pp = this.game.mapPosition();
    const near = (n) => Math.hypot(n.pos.x - pp.x, n.pos.z - pp.z) < 90;
    put(this.priest, this.s, 0, near(this.priest));
    for (const n of this.npcs) {
      const back = (n.slot.row + 2) * ROW_GAP;
      put(n, this.s - back, n.slot.col * 0.95, near(n));
    }
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'idle') {
      // Parte il Venerdì Santo dalle 18 (una sola volta al giorno)
      if (g.hour >= START_HOUR && g.hour < END_HOUR - 1 && g.state.daily.procession !== g.day && this.isGoodFriday()) {
        g.state.daily.procession = g.day;
        this.spawn();
      }
      return;
    }
    if (this.day !== g.day || g.hour >= END_HOUR) { this.clear(); return; }
    if (this.state === 'gathering') {
      this.waitT += dt;
      // Si parte dopo un minuto di raccoglimento, o subito se il giocatore è arrivato in piazza
      const P = g.world.mapData.plaza;
      const pp = g.mapPosition();
      const close = P && Math.hypot(pp.x - P.x, pp.z - P.z) < P.half + 20;
      if (this.waitT > 60 || (close && this.waitT > 8)) {
        this.state = 'walking';
        audio.churchBells(3);
        g.toast('La processione del Venerdì Santo è partita: segui il crocifisso fino alla Cattedrale.', 4200);
      }
    } else if (this.state === 'walking') {
      this.s = Math.min(this.path.len, this.s + SPEED * dt);
      if (this.s >= this.path.len) {
        this.state = 'arrived';
        audio.churchBells(5);
        g.toast('La processione è arrivata alla Cattedrale: entra e prega con i fedeli (Padre Nostro e Ave Maria, +10 Aura).', 5200);
      }
    }
    this.place(dt);
  }

  setVisible(v) {
    this.visible = v;
    if (this.priest) this.priest.setVisible(v);
    for (const n of this.npcs) n.setVisible(v);
  }

  /** Punti per la minimappa (testa della processione). */
  dots() {
    return this.priest ? [{ x: this.priest.pos.x, z: this.priest.pos.z }] : [];
  }

  clear() {
    if (this.priest) this.priest.dispose();
    for (const n of this.npcs) n.dispose();
    this.priest = null;
    this.npcs = [];
    this.state = 'idle';
  }

  dispose() {
    this.clear();
  }
}

/** Numero di file della processione (4 fedeli per fila). */
export const PROCESSION_ROWS = Math.ceil(PROCESSION_FAITHFUL / COLS);
