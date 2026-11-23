// Traffico NPC: auto, scooter, Vespe e moto che circolano sulla griglia stradale (corsia di destra),
// rispettano i semafori del centro, gli STOP dei quartieri e le precedenze, mantengono la distanza
// dal veicolo davanti (e da te), accendono i fari di notte, frenano con le luci di stop e suonano il clacson.
// Ogni mezzo è un Vehicle con corpo Cannon-es CINEMATICO: mesh e corpo coincidono e ti bloccano se ti urtano.
import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { makePerson, HumanAnimator, randomLook } from './characters.js';
import { HALF, CELL, RINGS, GRID, ROAD } from './world.js';
import { audio } from './audio.js';
import { disposeObject3D } from './ui.js';

const MIN = -RINGS, MAX = GRID + RINGS;
const LANE = 3.4; // distanza della corsia dalla mezzeria
const EDGE = ROAD / 2 + 1.2; // linea d'arresto prima dell'incrocio
const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
const CARS = ['utilitaria', 'berlina', 'suv', 'utilitaria', 'berlina', 'sportiva', 'berlina', 'utilitaria', 'suv', 'berlina', 'utilitaria', 'berlina'];
const TWO = ['motorino', 'vespa_primavera', 'vespa_special', 'moto_naked', 'scooter125'];
const CAR_COLORS = [0xb3121d, 0x1d3f8f, 0xe8e8e8, 0x222222, 0x8a8f96, 0x2f6b3f, 0xd9a62b, 0x5b2a6e, 0x9ed9c9];

const lineAt = (k) => -HALF + k * CELL;
const rightOf = (d) => [-d[1], d[0]];
const inRange = (i, j) => i >= MIN && i <= MAX && j >= MIN && j <= MAX;

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class TrafficManager {
  /**
   * @param {object} game  usa scene, physics, world (semafori), police (volanti), driving, player
   */
  constructor(game, rng = Math.random) {
    this.game = game;
    this.rng = rng;
    this.cars = [];
    this.visible = true;
    this.engines = new Set();
    this._v = new THREE.Vector3();
    const total = 13, two = 5;
    for (let n = 0; n < total; n++) {
      const isTwo = n < two;
      const model = isTwo ? TWO[n % TWO.length] : CARS[n % CARS.length];
      this.cars.push(this.makeCar(model, isTwo));
    }
    const p = game.mapPosition();
    for (const c of this.cars) this.respawn(c, p, 15, 220);
  }

  makeCar(model, isTwo) {
    const g = this.game;
    const color = CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)];
    const v = new Vehicle(g.scene, g.physics, { model, color, x: 9000, z: 9000, heading: 0, owner: 'traffic' });
    v.setKinematic();
    v.traffic = true;
    const car = { v, pts: [], cum: [], s: 0, len: 0, node: null, dir: null, speed: 0, heading: 0, cruise: 0, waitT: 0, stopDone: false, blockedT: 0, honkT: 0, flashT: 0, prevSpeed: 0, rider: null };
    car.cruise = isTwo ? 9 + this.rng() * 3 : 10.5 + this.rng() * 2.5;
    if (isTwo) {
      // Pilota con casco (berretto scuro) seduto in sella
      const look = { ...randomLook(this.rng), cap: 0x15161a };
      const mesh = makePerson(look);
      mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      g.scene.add(mesh);
      car.rider = { mesh, anim: new HumanAnimator(mesh) };
    }
    return car;
  }

  /* ---------- Percorsi ---------- */
  center(i, j) {
    return [lineAt(i), lineAt(j)];
  }

  laneEntry(i, j, d) {
    const [cx, cz] = this.center(i, j);
    const r = rightOf(d);
    return [cx - d[0] * EDGE + r[0] * LANE, cz - d[1] * EDGE + r[1] * LANE];
  }

  laneExit(i, j, d) {
    const [cx, cz] = this.center(i, j);
    const r = rightOf(d);
    return [cx + d[0] * EDGE + r[0] * LANE, cz + d[1] * EDGE + r[1] * LANE];
  }

  /** Sceglie la prossima direzione all'incrocio (dritto più probabile, niente inversioni se evitabili). */
  chooseDir(i, j, din) {
    const opts = [];
    for (const d of DIRS) {
      if (d[0] === -din[0] && d[1] === -din[1]) continue;
      if (!inRange(i + d[0], j + d[1])) continue;
      const straight = d[0] === din[0] && d[1] === din[1];
      opts.push([d, straight ? 0.56 : 0.22]);
    }
    if (!opts.length) return [-din[0], -din[1]];
    let r = this.rng() * opts.reduce((a, o) => a + o[1], 0);
    for (const [d, w] of opts) { r -= w; if (r <= 0) return d; }
    return opts[0][0];
  }

  /** Nuovo tratto: curva dentro l'incrocio (i,j) e rettilineo fino alla linea d'arresto del prossimo. */
  plan(car, i, j, din) {
    const dout = this.chooseDir(i, j, din);
    const entry = this.laneEntry(i, j, din);
    const exit = this.laneExit(i, j, dout);
    const [cx, cz] = this.center(i, j);
    const rin = rightOf(din), rout = rightOf(dout);
    const straight = dout[0] === din[0] && dout[1] === din[1];
    const uturn = dout[0] === -din[0] && dout[1] === -din[1];
    const pts = [];
    if (uturn) {
      pts.push(entry, [cx + din[0] * 2, cz + din[1] * 2], exit);
    } else {
      const ctrl = straight ? [(entry[0] + exit[0]) / 2, (entry[1] + exit[1]) / 2] : [cx + (rin[0] + rout[0]) * LANE, cz + (rin[1] + rout[1]) * LANE];
      for (let k = 0; k <= 8; k++) {
        const t = k / 8, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        pts.push([a * entry[0] + b * ctrl[0] + c * exit[0], a * entry[1] + b * ctrl[1] + c * exit[1]]);
      }
    }
    const ni = i + dout[0], nj = j + dout[1];
    pts.push(this.laneEntry(ni, nj, dout));
    car.pts = pts;
    car.cum = [0];
    for (let k = 1; k < pts.length; k++) car.cum.push(car.cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    car.len = car.cum[car.cum.length - 1];
    car.node = [ni, nj];
    car.dir = dout;
    car.stopDone = false;
    car.waitT = 0;
  }

  /** Posizione e direzione lungo il percorso alla distanza s. */
  sample(car, s) {
    const { pts, cum } = car;
    let k = 1;
    while (k < cum.length - 1 && cum[k] < s) k++;
    const a = pts[k - 1], b = pts[k];
    const seg = cum[k] - cum[k - 1] || 1;
    const t = THREE.MathUtils.clamp((s - cum[k - 1]) / seg, 0, 1);
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, h: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }

  /** Riposiziona un mezzo su una strada a distanza [minD, maxD] dal punto p (fuori vista se possibile). */
  respawn(car, p, minD, maxD) {
    for (let tries = 0; tries < 40; tries++) {
      const i = MIN + Math.floor(this.rng() * (MAX - MIN + 1));
      const j = MIN + Math.floor(this.rng() * (MAX - MIN + 1));
      const din = DIRS[Math.floor(this.rng() * 4)];
      if (!inRange(i - din[0], j - din[1])) continue;
      const [cx, cz] = this.center(i, j);
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d < minD || d > maxD) continue;
      this.plan(car, i, j, din);
      car.s = car.cum[Math.min(car.cum.length - 2, 9)] + this.rng() * Math.max(1, car.len - car.cum[Math.min(car.cum.length - 2, 9)] - 8);
      const q = this.sample(car, car.s);
      if (this.cars.some((o) => o !== car && o.pts.length && Math.hypot(o.v.body.position.x - q.x, o.v.body.position.z - q.z) < 9)) continue;
      car.heading = q.h;
      car.speed = car.cruise * 0.6;
      car.v.teleport(q.x, q.z, q.h, 0);
      car.v.body.position.y = 0;
      car.v.mesh.visible = this.visible;
      return true;
    }
    return false;
  }

  /* ---------- Regole della strada ---------- */
  lightFor(i, j, dir) {
    // Semafori solo agli incroci interni del centro (come in world.buildTraffic)
    if (!(i >= 1 && i <= GRID - 1 && j >= 1 && j <= GRID - 1)) return null;
    const phase = this.game.world.trafficPhase;
    if (phase == null || phase < 0) return 'green';
    const axis = dir[0] === 0 ? 0 : 1;
    if (axis === 0) return phase === 0 ? 'green' : phase === 1 ? 'yellow' : 'red';
    return phase === 2 ? 'green' : phase === 3 ? 'yellow' : 'red';
  }

  isStop(i, j) {
    const city = i >= 0 && i <= GRID && j >= 0 && j <= GRID;
    if (city) return false;
    return i > MIN && i < MAX && j > MIN && j < MAX;
  }

  isYield(i, j) {
    const border = (i === 0 || i === GRID || j === 0 || j === GRID) && i >= 0 && i <= GRID && j >= 0 && j <= GRID;
    return border && this.lightFor(i, j, [0, 1]) === null;
  }

  /** Ostacoli davanti (altri mezzi, volanti, il tuo veicolo o tu a piedi): velocità massima consentita. */
  obstacleSpeed(car, ctx) {
    const p = car.v.body.position;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const rx = -fz, rz = fx;
    let limit = Infinity;
    let byPlayer = false;
    const myHalf = car.v.spec.len / 2;
    const check = (x, z, half, player) => {
      const dx = x - p.x, dz = z - p.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 32) return;
      const lat = Math.abs(dx * rx + dz * rz);
      if (lat > 2.3) return;
      const gap = along - myHalf - half;
      const v = gap < 1.2 ? 0 : Math.max(0, (gap - 2.2) * 1.15);
      if (v < limit) { limit = v; byPlayer = player; }
    };
    for (const o of this.cars) if (o !== car && o.pts.length) check(o.v.body.position.x, o.v.body.position.z, o.v.spec.len / 2, false);
    for (const c of ctx.police) check(c.body.position.x, c.body.position.z, c.spec.len / 2, false);
    if (ctx.vehicle) check(ctx.vehicle.body.position.x, ctx.vehicle.body.position.z, ctx.vehicle.spec.len / 2, true);
    else if (ctx.onFoot) check(ctx.onFoot.x, ctx.onFoot.z, 0.4, true);
    return { limit, byPlayer };
  }

  /** L'incrocio è libero da altri mezzi? (per ripartire dopo lo STOP) */
  junctionClear(car) {
    const [cx, cz] = this.center(car.node[0], car.node[1]);
    return !this.cars.some((o) => o !== car && Math.hypot(o.v.body.position.x - cx, o.v.body.position.z - cz) < ROAD / 2 + 1);
  }

  /* ---------- Aggiornamento ---------- */
  update(dt, ctx) {
    if (!this.visible || dt <= 0) return;
    const p = ctx.pos;
    const night = ctx.night;
    for (const car of this.cars) {
      const vp = car.v.body.position;
      const dPlayer = Math.hypot(vp.x - p.x, vp.z - p.z);
      if (dPlayer > 290 || !car.pts.length) { this.respawn(car, p, 130, 240); continue; }
      let target = car.cruise;
      const dEnd = car.len - car.s;
      const [ni, nj] = car.node;
      // Semaforo
      const light = this.lightFor(ni, nj, car.dir);
      if (light === 'red' || (light === 'yellow' && dEnd > 9)) target = Math.min(target, Math.sqrt(2 * 4.2 * Math.max(0, dEnd - 1.2)));
      // STOP: fermarsi, attendere, ripartire se l'incrocio è libero
      if (this.isStop(ni, nj) && !car.stopDone) {
        target = Math.min(target, Math.sqrt(2 * 3.6 * Math.max(0, dEnd - 1.2)));
        if (dEnd < 2.8 && car.speed < 0.5) {
          car.waitT += dt;
          if (car.waitT > 0.9 && this.junctionClear(car)) car.stopDone = true;
        }
      }
      if (car.stopDone && dEnd < 3) target = Math.max(target, 4);
      // Precedenza ai confini del centro: rallenta
      if (this.isYield(ni, nj) && dEnd < 12) target = Math.min(target, 5.5);
      // Curve più lente
      const ahead = this.sample(car, Math.min(car.len, car.s + 6));
      let turn = Math.abs(((ahead.h - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (turn > 0.3) target = Math.min(target, 6.5);
      // Ostacoli
      const obs = this.obstacleSpeed(car, ctx);
      target = Math.min(target, obs.limit);
      // Bloccato da te: dopo un po' suona il clacson
      if (obs.byPlayer && car.speed < 0.6) {
        car.blockedT += dt;
        car.honkT -= dt;
        if (car.blockedT > 2.5 && car.honkT <= 0) {
          car.honkT = 4 + this.rng() * 3;
          if (dPlayer < 60) audio.npcHorn(car.v.spec.ride ? 'scooter' : 'car', dPlayer);
        }
      } else car.blockedT = 0;
      // Accelerazione / frenata
      if (target > car.speed) car.speed = Math.min(target, car.speed + 2.6 * dt);
      else car.speed = Math.max(target, car.speed - Math.max(4.5, (car.speed - target) * 3) * dt);
      car.speed = Math.max(0, car.speed);
      // Avanzamento lungo il percorso
      car.s += car.speed * dt;
      while (car.s >= car.len) {
        const rest = car.s - car.len;
        const d = car.dir;
        this.plan(car, car.node[0], car.node[1], d);
        car.s = rest;
      }
      const q = this.sample(car, car.s);
      const prevH = car.heading;
      car.heading = lerpAngle(car.heading, q.h, 1 - Math.exp(-10 * dt));
      // Corpo cinematico: velocità tale da arrivare esattamente nel punto calcolato
      const b = car.v.body;
      b.velocity.set((q.x - b.position.x) / dt, 0, (q.z - b.position.z) / dt);
      b.position.y = 0;
      b.quaternion.setFromEuler(0, car.heading, 0);
      b.angularVelocity.set(0, 0, 0);
      let dh = car.heading - prevH;
      if (dh > Math.PI) dh -= Math.PI * 2;
      if (dh < -Math.PI) dh += Math.PI * 2;
      car.v.speed = car.speed;
      car.v.yawRate = dh / dt;
      car.v.steer += (THREE.MathUtils.clamp(dh / dt / 1.2, -1, 1) - car.v.steer) * Math.min(1, dt * 6);
      // Luci: anabbaglianti di notte, stop in frenata, lampeggio degli abbaglianti se abbagliato
      const braking = car.speed < car.prevSpeed - 1.2 * dt || (target < 0.5 && car.speed < 1);
      car.prevSpeed = car.speed;
      if (car.flashT > 0) {
        car.flashT -= dt;
        car.v.setLights(Math.floor(car.flashT * 6) % 2 ? 2 : (night > 0.3 ? 1 : 0), braking);
      } else car.v.setLights(night > 0.3 ? 1 : 0, braking);
    }
    this.updateEngines(p);
  }

  /** Rumore dei motori dei due mezzi più vicini (volume in base alla distanza). */
  updateEngines(p) {
    const near = this.cars
      .map((c) => ({ c, d: Math.hypot(c.v.body.position.x - p.x, c.v.body.position.z - p.z) }))
      .filter((o) => o.d < 32 && o.c.v.kind !== 'bike')
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    const keep = new Set(near.map((o) => o.c.v.uid));
    for (const uid of this.engines) if (!keep.has(uid)) { audio.engineStop(uid, true); this.engines.delete(uid); }
    for (const { c, d } of near) {
      if (!this.engines.has(c.v.uid)) { audio.engineStart(c.v.uid, c.v.kind); this.engines.add(c.v.uid); }
      audio.engineUpdate(c.v.uid, c.speed, c.v.spec.maxSpeed, c.speed < c.cruise, null, Math.max(0, 1 - d / 32) * 0.7);
    }
  }

  sync(dt) {
    if (!this.visible) return;
    const pp = this.game.mapPosition();
    for (const car of this.cars) {
      car.v.sync(dt);
      if (car.rider) {
        const v = car.v;
        const r = car.rider;
        const near = Math.hypot(v.body.position.x - pp.x, v.body.position.z - pp.z) < 90;
        r.mesh.visible = near && v.mesh.visible;
        if (!r.mesh.visible) continue;
        v.mesh.updateMatrixWorld(true);
        this._v.set(0, v.spec.seatY - r.mesh.userData.hipHeight, v.spec.seatZ);
        v.mesh.localToWorld(this._v);
        r.mesh.position.copy(this._v);
        r.mesh.quaternion.copy(v.mesh.quaternion);
        r.anim.update(dt, { speed: 0, state: 'ride', lean: v.lean });
      }
    }
  }

  /** Abbaglianti puntati: i mezzi che arrivano di fronte lampeggiano e a volte suonano. */
  reactHighBeam(x, z, heading) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const car of this.cars) {
      if (car.flashT > 0) continue;
      const dx = car.v.body.position.x - x, dz = car.v.body.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d > 70 || d < 4) continue;
      if ((dx * fx + dz * fz) / d < 0.93) continue; // fuori dal fascio
      const facing = Math.sin(car.heading) * fx + Math.cos(car.heading) * fz;
      if (facing > -0.5) continue; // ti viene incontro
      car.flashT = 1.2;
      if (this.rng() < 0.5) setTimeout(() => audio.npcHorn(car.v.spec.ride ? 'scooter' : 'car', d), 450);
    }
  }

  /** Clacson del giocatore: chi ti sta davanti e vicino a volte risponde. */
  reactHorn(x, z) {
    for (const car of this.cars) {
      const d = Math.hypot(car.v.body.position.x - x, car.v.body.position.z - z);
      if (d < 22 && this.rng() < 0.3 && car.honkT <= 0) {
        car.honkT = 5;
        setTimeout(() => audio.npcHorn(car.v.spec.ride ? 'scooter' : 'car', d), 600 + this.rng() * 500);
      }
    }
  }

  /** Mesh colpibili dai proiettili. */
  meshes() {
    return this.cars.map((c) => c.v.mesh);
  }

  dots() {
    return this.cars.map((c) => ({ x: c.v.body.position.x, z: c.v.body.position.z }));
  }

  setVisible(v) {
    this.visible = v;
    for (const c of this.cars) {
      c.v.mesh.visible = v;
      if (c.rider) c.rider.mesh.visible = v;
      // Al chiuso il traffico si ferma e non occupa la fisica della città
      if (!v) c.v.body.velocity.set(0, 0, 0);
    }
    if (!v) { for (const uid of this.engines) audio.engineStop(uid, true); this.engines.clear(); }
  }

  dispose() {
    for (const uid of this.engines) audio.engineStop(uid, true);
    this.engines.clear();
    for (const c of this.cars) {
      c.v.dispose();
      if (c.rider) { this.game.scene.remove(c.rider.mesh); disposeObject3D(c.rider.mesh); }
    }
    this.cars = [];
  }
}
