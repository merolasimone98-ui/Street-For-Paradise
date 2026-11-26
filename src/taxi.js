// Taxi giallo: chiamato dal telefono arriva un'auto gialla con insegna TAXI e tassista. Sali dietro con [F]
// (prima persona dal sedile posteriore), scegli la destinazione e il taxi ti porta lungo le strade della città.
// Tassametro: da € 10 a € 200 in base alla strada percorsa. [E] salta il viaggio (paghi la corsa intera),
// [F] scendi subito (paghi quanto segna il tassametro). Corpo Cannon-es cinematico che coincide con la mesh.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { makePerson, HumanAnimator, randomLook } from './characters.js';
import { HALF, CELL, RINGS, GRID, URBAN_HALF } from './world.js';
import { TAXI_FARE } from './items.js';
import { formatMoney } from './birthdata.js';
import { audio } from './audio.js';
import { fadeTo, disposeObject3D } from './ui.js';

const LINES = [];
for (let i = -RINGS; i <= GRID + RINGS; i++) LINES.push(-HALF + i * CELL);
const LANE = 2.6; // corsia di destra
const CRUISE = 13; // m/s in rettilineo
const CORNER = 5; // m/s in curva
const nearestLine = (v) => LINES.reduce((b, l) => (Math.abs(l - v) < Math.abs(b - v) ? l : b), LINES[0]);

export class TaxiService {
  constructor(game) {
    this.game = game;
    this.state = 'idle'; // idle → arriving → waiting → riding → leaving
    this.car = null;
    this.driver = null;
    this.path = null;
    this.s = 0;
    this.speed = 0;
    this.meter = 0;
    this.dest = null;
    this.waitT = 0;
    this._v = new THREE.Vector3();
  }

  get riding() {
    return this.state === 'riding';
  }

  /** Tariffa per una certa distanza su strada (€ 10-200). */
  fareFor(meters) {
    return Math.round(Math.min(TAXI_FARE.max, Math.max(TAXI_FARE.base, TAXI_FARE.base + meters * TAXI_FARE.perMeter)));
  }

  /* ---------- Percorsi lungo la griglia stradale ---------- */
  /** Punto della strada più vicino a p (si aggancia alla via verticale o orizzontale più vicina). */
  snapToRoad(p) {
    const lx = nearestLine(p.x), lz = nearestLine(p.z);
    const lim = URBAN_HALF;
    // Fuori città (strada della piazza): si resta sul viale x = linea più vicina
    if (Math.abs(p.z) > lim || Math.abs(p.x) > lim) return { x: lx, z: p.z };
    return Math.abs(p.x - lx) <= Math.abs(p.z - lz) ? { x: lx, z: Math.max(-lim, Math.min(lim, p.z)) } : { x: Math.max(-lim, Math.min(lim, p.x)), z: lz };
  }

  /** Percorso da a a b: marciapiede → strada → incroci (prima lungo X poi lungo Z) → strada → marciapiede. */
  route(a, b) {
    const A = this.snapToRoad(a), B = this.snapToRoad(b);
    const clampLine = (v) => Math.max(-URBAN_HALF + 0.1, Math.min(URBAN_HALF - 0.1, v));
    const J1 = { x: nearestLine(A.x), z: nearestLine(clampLine(A.z)) };
    const J2 = { x: nearestLine(B.x), z: nearestLine(clampLine(B.z)) };
    const raw = [A, { x: J1.x, z: J1.z }, { x: J2.x, z: J1.z }, { x: J2.x, z: J2.z }, B];
    // Togli i punti doppi o allineati
    const pts = [];
    for (const p of raw) {
      const last = pts[pts.length - 1];
      if (last && Math.hypot(last.x - p.x, last.z - p.z) < 0.5) continue;
      pts.push({ x: p.x, z: p.z });
    }
    // Corsia di destra: ogni punto si sposta a destra della direzione di marcia
    const lanePts = pts.map((p, i) => {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next.x - prev.x, dz = next.z - prev.z;
      const l = Math.hypot(dx, dz) || 1;
      return { x: p.x - (dz / l) * LANE, z: p.z + (dx / l) * LANE };
    });
    const cum = [0];
    for (let i = 1; i < lanePts.length; i++) cum.push(cum[i - 1] + Math.hypot(lanePts[i].x - lanePts[i - 1].x, lanePts[i].z - lanePts[i - 1].z));
    return { pts: lanePts, cum, len: cum[cum.length - 1] };
  }

  sample(s) {
    const { pts, cum, len } = this.path;
    s = Math.max(0, Math.min(len, s));
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    const a = pts[i - 1], b = pts[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = (s - cum[i - 1]) / seg;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, h: Math.atan2(b.x - a.x, b.z - a.z), corner: Math.min(cum[i] - s, s - cum[i - 1]) };
  }

  /* ---------- Chiamata ---------- */
  call() {
    const g = this.game;
    if (this.state !== 'idle') { g.toast(this.state === 'waiting' ? 'Il taxi ti sta già aspettando: sali con F.' : 'Il taxi è già in arrivo.', 2400); return; }
    if (g.hospital.inside && g.state.hospitalBill > 0) {
      g.toast(`Prima devi pagare le cure all'accettazione dell'ospedale (${formatMoney(g.state.hospitalBill)}).`, 2800);
      return;
    }
    // Punto di attesa: sulla strada davanti a te (o davanti alla porta dell'edificio in cui ti trovi)
    let here = g.interior && g.currentDoor ? g.world.doorExitSpot(g.currentDoor) : g.mapPosition();
    // Fuori dalla mappa giocabile (coordinate anomale): il taxi arriva al punto di partenza della città
    if (!Number.isFinite(here.x) || Math.max(Math.abs(here.x), Math.abs(here.z)) > URBAN_HALF + 400) here = g.world.getSpawn();
    const stop = this.snapToRoad(here);
    // Parte da un incrocio a circa 120 m (fuori vista) e arriva fino a te seguendo le strade
    const ang = Math.random() * Math.PI * 2;
    const from = this.snapToRoad({ x: stop.x + Math.cos(ang) * 120, z: stop.z + Math.sin(ang) * 120 });
    this.spawnCar(from);
    this.path = this.route(from, stop);
    this.pickup = { ...here };
    this.speed = 0;
    this.teleportTo(0);
    this.state = 'arriving';
    audio.phoneNotify();
    g.toast('Radio Taxi: «Un taxi giallo arriva tra poco, aspettalo sul marciapiede.»', 3200);
  }

  spawnCar(at) {
    const g = this.game;
    const v = new Vehicle(g.scene, g.physics, { model: 'berlina', color: 0xf2c200, x: at.x, z: at.z, heading: 0, owner: 'taxi' });
    v.setKinematic();
    v.taxi = true;
    // Insegna TAXI luminosa sul tetto
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const cg = c.getContext('2d');
    cg.fillStyle = '#1a1a1a'; cg.fillRect(0, 0, 256, 64);
    cg.fillStyle = '#ffd200'; cg.font = '700 46px Oswald, Impact, sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
    cg.fillText('TAXI', 128, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffd200, emissiveMap: tex, emissiveIntensity: 0.9 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.18, 0.24), [signMat, signMat, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }), signMat, signMat]);
    sign.position.set(0, v.spec.h + 0.1, -0.2);
    v.mesh.add(sign);
    // Fascia a scacchi sulle fiancate
    const checker = document.createElement('canvas');
    checker.width = 256; checker.height = 32;
    const kg = checker.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { kg.fillStyle = (i + j) % 2 ? '#111' : '#f2f2f2'; kg.fillRect(i * 16, j * 16, 16, 16); }
    const ct = new THREE.CanvasTexture(checker);
    ct.colorSpace = THREE.SRGBColorSpace;
    for (const sx of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.12), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.5 }));
      band.position.set(sx * (v.spec.wid / 2 + 0.012), 0.6 * (v.spec.h / 1.45), 0);
      band.rotation.y = sx * Math.PI / 2;
      v.mesh.add(band);
    }
    // Tassista seduto al posto di guida (figlio della mesh: si muove con l'auto)
    const s = v.spec;
    const k = s.h / 1.45;
    const gFront = s.len / 2 - 1.25;
    const driver = makePerson({ ...randomLook(Math.random), shirt: 0x1b2a4a, sleeves: 'short' });
    driver.position.set(s.wid / 2 - 0.5, 0.57 * k - driver.userData.hipHeight + 0.05, gFront - 0.32 - 1.2);
    v.mesh.add(driver);
    const anim = new HumanAnimator(driver);
    anim.update(1 / 60, { speed: 0, state: 'sit' });
    v.mesh.traverse((o) => { if (o.isMesh && o.material && o.material.userData && o.material.userData.glass) o.material.opacity = 0.55; });
    this.car = v;
    this.driver = { mesh: driver, anim };
    // Occhi del passeggero: centro del divano posteriore, sopra gli schienali anteriori (vedi la strada tra i sedili)
    this.rearEye = new THREE.Vector3(-0.12, 1.24 * k, gFront - 0.32 - 2.1);
  }

  /** Muove l'auto lungo il percorso (corpo cinematico che arriva esattamente nel punto calcolato). */
  drive(dt, cruise) {
    const ahead = this.sample(this.s + 6);
    const target = this.path.len - this.s < 10 ? Math.max(2, (this.path.len - this.s) * 0.9) : ahead.corner < 6 ? CORNER : cruise;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), (target > this.speed ? 3.2 : 7) * dt);
    this.s = Math.min(this.path.len, this.s + this.speed * dt);
    this.place(dt);
    return this.s >= this.path.len - 0.05;
  }

  /**
   * Corpo cinematico: come il traffico, si imposta la velocità che porta l'auto esattamente nel punto del
   * percorso al prossimo passo di fisica (mesh e corpo coincidono dopo lo step; vedi sync()).
   */
  place(dt) {
    const q = this.sample(this.s);
    const v = this.car;
    const b = v.body;
    const prevH = this.h;
    let dh = q.h - this.h;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.h += dh * Math.min(1, dt * 8);
    b.velocity.set((q.x - b.position.x) / dt, 0, (q.z - b.position.z) / dt);
    b.position.y = 0;
    b.quaternion.setFromEuler(0, this.h, 0);
    b.angularVelocity.set(0, 0, 0);
    v.speed = this.speed;
    v.steer += ((this.h - prevH) / dt / 1.2 - v.steer) * Math.min(1, dt * 6);
    this.turned = this.h - prevH;
  }

  /** Mette l'auto ferma in un punto del percorso (partenza, arrivo saltando il viaggio). */
  teleportTo(s) {
    this.s = s;
    const q = this.sample(s);
    this.h = q.h;
    this.car.teleport(q.x, q.z, q.h, 0);
    this.car.body.position.y = 0;
  }

  /** Dopo lo step di fisica: la mesh segue il corpo. */
  sync(dt) {
    if (this.car) this.car.sync(dt);
  }

  update(dt) {
    const g = this.game;
    if (this.state === 'idle' || !this.car || dt <= 0) return;
    const night = g.lastNight || 0;
    this.car.setLights(night > 0.3 ? 1 : 0, this.speed < 1 && this.state !== 'waiting');
    if (this.state === 'arriving') {
      if (this.drive(dt, CRUISE)) {
        this.state = 'waiting';
        this.waitT = 0;
        audio.npcHorn('car', 8);
        g.toast('Il taxi giallo è arrivato: avvicinati e premi F per salire dietro.', 3600);
      }
    } else if (this.state === 'waiting' || this.state === 'boarded') {
      this.place(dt);
      this.waitT += dt;
      // Se non sali entro 2 minuti il tassista se ne va
      if (this.state === 'waiting' && this.waitT > 120) { this.leave(); g.toast('Il taxi se n\'è andato: non sei salito.', 2600); }
    } else if (this.state === 'riding') {
      const before = this.s;
      const done = this.drive(dt, CRUISE);
      this.meter += this.s - before;
      // La visuale ruota con l'auto (guardi sempre in avanti dal sedile posteriore)
      g.rig.yaw += this.turned || 0;
      if (done) this.arrive();
    } else if (this.state === 'leaving') {
      this.drive(dt, CRUISE);
      this.leaveT -= dt;
      if (this.leaveT <= 0 || this.s >= this.path.len - 0.1) this.clear();
    }
  }

  /** Vicino al taxi che aspetta? (per il prompt [F]) */
  canBoard(feet) {
    if (this.state !== 'waiting' || !this.car) return false;
    const p = this.car.body.position;
    return Math.hypot(feet.x - p.x, feet.z - p.z) < 3.6;
  }

  /** Sali dietro: prima persona, poi scegli la destinazione. */
  board() {
    const g = this.game;
    if (this.state !== 'waiting') return;
    this.state = 'boarded';
    audio.door();
    g.player.setPhysicsEnabled(false);
    g.player.setPose('hidden', new THREE.Vector3(this.car.body.position.x, 0, this.car.body.position.z), this.h);
    this.prevFP = g.rig.firstPerson;
    g.rig.firstPerson = true;
    g.rig.yaw = this.h + Math.PI;
    g.rig.pitch = 0.05;
    this.car.updateCockpit(true);
    g.dialogs.taxiDestinations(this, (door) => this.start(door), () => this.alight(true));
  }

  start(door) {
    const g = this.game;
    const spot = g.world.doorExitSpot(door);
    const from = { x: this.car.body.position.x, z: this.car.body.position.z };
    this.path = this.route(from, spot);
    this.s = 0;
    this.speed = 0;
    this.meter = 0;
    this.dest = door;
    this.state = 'riding';
    audio.engineIgnition('car');
    g.toast(`Tassista: «Andiamo a ${door.name}!» · E salta il viaggio · F scendi qui`, 3600);
  }

  /** Corsa stimata per una destinazione (per il menu). */
  estimate(door) {
    const g = this.game;
    const spot = g.world.doorExitSpot(door);
    const from = this.car ? { x: this.car.body.position.x, z: this.car.body.position.z } : g.mapPosition();
    return this.fareFor(this.route(from, spot).len);
  }

  /** [E] durante la corsa: si salta il resto del viaggio (dissolvenza), la corsa si paga intera. */
  async skip() {
    const g = this.game;
    if (this.state !== 'riding' || this.skipping) return;
    this.skipping = true;
    await fadeTo(1, 0.4, '#000');
    if (g.disposed) return;
    const left = this.path.len - this.s;
    g.hour = Math.min(23.9, g.hour + left / 14 / 150); // 1 ora di gioco = 150 s reali
    this.meter += left;
    this.teleportTo(this.path.len);
    this.skipping = false;
    this.arrive();
    await fadeTo(0, 0.5);
  }

  arrive() {
    const g = this.game;
    const fare = this.fareFor(this.meter);
    const st = g.state;
    if (!st.payWith(fare, 'cash') && !st.payWith(fare, 'card')) {
      st.cash -= fare; // il tassista ti segna il debito: i contanti vanno in negativo
      g.toast(`Non avevi abbastanza soldi: la corsa di ${formatMoney(fare)} è segnata come debito.`, 3600);
    } else {
      audio.cash();
      g.toast(`Taxi: arrivato a ${this.dest.name}. Tassametro ${formatMoney(fare)}.`, 3200);
    }
    st.changeHappiness(1, 'Corsa in taxi');
    this.alight(false);
  }

  /** Scendi: sul marciapiede della destinazione (o accanto all'auto se scendi prima). */
  alight(cancelled = false) {
    const g = this.game;
    if (this.state === 'riding' && !cancelled && this.s < this.path.len - 1) {
      // [F] durante la corsa: scendi qui e paghi il tassametro
      const fare = this.fareFor(this.meter);
      if (!g.state.payWith(fare, 'cash') && !g.state.payWith(fare, 'card')) g.state.cash -= fare;
      audio.cash();
      g.toast(`Sei sceso dal taxi: tassametro ${formatMoney(fare)}.`, 2800);
    }
    const p = this.car.body.position;
    const h = this.h;
    // Si scende sul lato destro (verso il marciapiede)
    const ex = { x: p.x - Math.cos(h) * 2.0, z: p.z + Math.sin(h) * 2.0 };
    const arrived = this.dest && this.s >= this.path.len - 1 && !cancelled;
    const spot = arrived ? g.world.doorExitSpot(this.dest) : { x: ex.x, z: ex.z, facing: h };
    g.player.setPose('auto');
    g.player.setPhysicsEnabled(true);
    g.player.setPosition(spot.x, 0.3, spot.z, spot.facing ?? h);
    g.rig.firstPerson = !!this.prevFP;
    this.car.updateCockpit(false);
    audio.door();
    this.dest = null;
    this.leave();
  }

  /** Il taxi riparte e sparisce poco dopo. */
  leave() {
    if (!this.car) { this.state = 'idle'; return; }
    const p = this.car.body.position;
    const h = this.h || 0;
    const far = { x: p.x + Math.sin(h) * 160, z: p.z + Math.cos(h) * 160 };
    this.path = this.route({ x: p.x, z: p.z }, far);
    this.s = 0;
    this.leaveT = 14;
    this.state = 'leaving';
  }

  clear() {
    if (this.car) {
      if (this.driver) { this.car.mesh.remove(this.driver.mesh); disposeObject3D(this.driver.mesh); }
      this.car.dispose();
    }
    this.car = null;
    this.driver = null;
    this.state = 'idle';
  }

  /** Occhi del passeggero (sedile posteriore destro), in coordinate mondo. */
  eyeWorld() {
    this.car.mesh.updateMatrixWorld(true);
    return this.car.mesh.localToWorld(this._v.copy(this.rearEye));
  }

  setVisible(v) {
    if (this.car) this.car.mesh.visible = v;
  }

  dispose() {
    this.clear();
  }
}


