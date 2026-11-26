// Ricercato dalla polizia (1-3 stelle): le volanti partono dal garage della stazione di polizia,
// percorrono le strade della griglia e ti inseguono. Per seminarle devi uscire dal loro cono visivo
// (palazzi, vicoli, interni): dopo qualche secondo le stelle lampeggiano e poi spariscono.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle } from './vehicle.js';
import { Npc } from './npcs.js';
import { GROUPS } from './playerstate.js';
import { HALF, CELL, RINGS, GRID, BLOCK, URBAN_HALF, SIDEWALK_H } from './world.js';
import { audio } from './audio.js';

const MAX_STARS = 3;
// Polizia molto più difficile da seminare: vedono più lontano e più di lato, ti sentono da più vicino,
// la centrale ritrasmette la tua posizione anche con una stella e servono quasi 1 minuto fuori vista.
const VIEW_DIST = 190;
const VIEW_HALF_ANGLE = THREE.MathUtils.degToRad(88);
const NEAR_SENSE = 34; // da vicino ti "sentono" anche alle spalle
const BLINK_AFTER = 26; // secondi fuori vista prima che le stelle lampeggino
const LOSE_AFTER = 55; // secondi fuori vista per far perdere le tracce
const DIRECT_CHASE = 70; // sotto questa distanza (e in vista) puntano dritto al giocatore
const RADIO_UPDATE = 6; // la centrale ritrasmette la tua posizione ogni tot secondi (con 3 stelle)
const ARREST_DIST = 6.5;
// Inseguimento a piedi: se scappi a piedi gli agenti scendono dalla volante, ti rincorrono seguendo
// la strada che hai fatto tu (niente scorciatoie nei muri), ti ammanettano e ti caricano in pattuglia.
const DEPLOY_DIST = 26; // la volante si ferma e gli agenti scendono sotto questa distanza
const OFFICER_SPEED = 6.4; // m/s di corsa (tu corri più veloce solo finché hai stamina)
const CUFF_DIST = 1.15;
const TRAIL_STEP = 0.9; // distanza tra due "impronte" del giocatore
const GIVE_UP_DIST = 90;
const MIN_LINE = -RINGS, MAX_LINE = GRID + RINGS;

/** Coordinata della strada (linea di mezzeria) più vicina. */
function snapRoad(v) {
  const k = THREE.MathUtils.clamp(Math.round((v + HALF) / CELL), MIN_LINE, MAX_LINE);
  return -HALF + k * CELL;
}

function wrapAngle(a) {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PoliceManager {
  constructor(game) {
    this.game = game;
    this.stars = 0;
    this.cars = [];
    this.unseen = 0;
    this.lastKnown = null;
    this.spawnTimer = 0;
    this.sirenTimer = 0;
    this.arrestT = 0;
    this.visible = true;
    this.ray = new CANNON.RaycastResult();
    this._from = new CANNON.Vec3();
    this._to = new CANNON.Vec3();
    this.officers = []; // agenti a piedi
    this.trail = []; // percorso fatto a piedi dal giocatore (gli agenti lo seguono)
    this.cuffing = false;
    const door = game.world.doors.find((d) => d.type === 'police');
    // Uscita del garage: strada davanti alla stazione, auto orientata lungo la carreggiata
    this.garage = door
      ? { x: door.x + 6, z: snapRoad(door.z + door.nz * 8), heading: Math.PI / 2 }
      : { x: 0, z: snapRoad(0), heading: 0 };
  }

  get wanted() {
    return this.stars > 0;
  }

  /** Stelle lampeggianti: la polizia ti sta perdendo di vista. */
  get blinking() {
    return this.stars > 0 && this.unseen > BLINK_AFTER;
  }

  /**
   * Segnala un crimine: le stelle salgono (mai scendono) e parte la chiamata alla centrale.
   * @param {number} stars 1-3
   */
  report(stars, reason) {
    const s = Math.min(MAX_STARS, stars);
    const was = this.stars;
    this.stars = Math.max(this.stars, s);
    this.unseen = 0;
    this.lastKnown = this.game.mapPosition();
    if (this.stars > was) {
      if (!was) this.spawnTimer = 2; // il tempo della chiamata al 112
      this.game.toast(`🚨 ${reason} — qualcuno ha chiamato la polizia! ${'★'.repeat(this.stars)}`, 3600);
      audio.siren(6);
    }
    // I passanti vicini al crimine scappano spaventati
    if (!this.game.interior && this.game.npcs) this.game.npcs.panic(this.lastKnown.x, this.lastKnown.z, 30 + this.stars * 10);
  }

  /** Il giocatore è stato fermato: tutte le pattuglie rientrano. */
  clear(immediate = false) {
    this.stars = 0;
    this.unseen = 0;
    this.arrestT = 0;
    this.cuffing = false;
    this.trail = [];
    for (const c of this.cars) {
      c.sirenOn = false;
      c.leaving = true;
      c.leaveT = 0;
      c.deployed = false;
    }
    // Gli agenti a piedi tornano in pattuglia (o spariscono subito)
    if (immediate) this.disposeOfficers();
    else for (const o of this.officers) o.state = 'return';
    if (immediate) this.disposeCars();
  }

  /* ---------- Inseguimento a piedi ---------- */
  /** Quota del terreno: marciapiede sui blocchi della città, asfalto sulle strade, terreno fuori città. */
  groundY(x, z) {
    if (Math.abs(x) < URBAN_HALF && Math.abs(z) < URBAN_HALF) {
      const lx = ((x + HALF) % CELL + CELL) % CELL, lz = ((z + HALF) % CELL + CELL) % CELL;
      const onBlock = lx > CELL - BLOCK - (CELL - BLOCK) / 2 && lz > (CELL - BLOCK) / 2 && lx < CELL - (CELL - BLOCK) / 2 && lz < CELL - (CELL - BLOCK) / 2;
      return onBlock ? SIDEWALK_H : 0;
    }
    return Math.max(0, this.game.world.getHeight(x, z));
  }

  /** Due agenti scendono dalla volante ferma e iniziano a inseguirti. */
  deploy(car) {
    const g = this.game;
    car.deployed = true;
    const p = car.body.position;
    const h = car.heading;
    for (const side of [-1, 1]) {
      const x = p.x + Math.cos(h) * side * 1.4, z = p.z - Math.sin(h) * side * 1.4;
      const o = new Npc(g.scene, g.physics, {
        sex: side < 0 ? 'm' : (Math.random() < 0.5 ? 'f' : 'm'), skin: [0xe7bc98, 0xb7835b, 0xd29f78][Math.floor(Math.random() * 3)], hair: 0x1b1410,
        shirt: 0x2c4a7a, pants: 0x1b2a4a, shoes: 0x111111, sleeves: 'long', uniform: 'police', height: 1.76 + Math.random() * 0.1,
      }, { x, y: this.groundY(x, z), z, facing: h, name: 'Agente' });
      o.mesh.visible = this.visible;
      o.state = 'chase';
      o.car = car;
      o.trailIdx = Math.max(0, this.trail.length - 1);
      o.speed = 0;
      this.officers.push(o);
    }
    audio.door();
    g.toast('🚔 Gli agenti scendono dalla volante e ti inseguono a piedi!', 2600);
  }

  /** L'agente vede direttamente il giocatore (nessun palazzo in mezzo)? */
  officerSees(o, t) {
    this._from.set(o.pos.x, o.pos.y + 1.4, o.pos.z);
    this._to.set(t.x, t.y + 1.2, t.z);
    this.ray.reset();
    this.game.physics.raycastClosest(this._from, this._to, { collisionFilterMask: GROUPS.WORLD, skipBackfaces: true }, this.ray);
    return !(this.ray.hasHit && this.ray.distance < Math.hypot(t.x - o.pos.x, t.z - o.pos.z) - 0.8);
  }

  updateOfficers(dt) {
    const g = this.game;
    const f = g.player.feet;
    const onFoot = !g.driving && !g.interior && !g.taxi?.riding;
    // Impronte: il percorso fatto a piedi dal giocatore mentre è ricercato
    if (this.stars && onFoot) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - f.x, last.z - f.z) > TRAIL_STEP) this.trail.push({ x: f.x, y: f.y, z: f.z });
      if (this.trail.length > 600) this.trail.splice(0, 100);
    }
    for (const o of this.officers) {
      let tx, tz, ty;
      const d = Math.hypot(f.x - o.pos.x, f.z - o.pos.z);
      if (o.state === 'chase' && (!onFoot || !this.stars || d > GIVE_UP_DIST)) o.state = 'return';
      if (o.state === 'chase') {
        if (this.officerSees(o, f)) {
          // In vista: dritto verso di te (e le impronte ripartono da qui)
          tx = f.x; tz = f.z; ty = f.y;
          o.trailIdx = Math.max(0, this.trail.length - 1);
        } else {
          // Fuori vista: segue le tue impronte, punto per punto
          while (o.trailIdx < this.trail.length - 1 && Math.hypot(this.trail[o.trailIdx].x - o.pos.x, this.trail[o.trailIdx].z - o.pos.z) < 0.7) o.trailIdx++;
          const tp = this.trail[Math.min(o.trailIdx, this.trail.length - 1)] || f;
          tx = tp.x; tz = tp.z; ty = tp.y;
        }
        if (d < CUFF_DIST && !this.cuffing && !g.transitioning && !g.action) {
          this.cuffing = true;
          g.cuffedByPolice(o);
        }
      } else if (o.state === 'cuff') {
        tx = o.pos.x; tz = o.pos.z; ty = o.pos.y;
      } else {
        // Ritorno alla volante
        const cp = o.car && !o.car.dead ? o.car.body.position : o.pos;
        tx = cp.x; tz = cp.z; ty = o.pos.y;
        if (Math.hypot(cp.x - o.pos.x, cp.z - o.pos.z) < 2 || !o.car || o.car.dead) o.dead = true;
      }
      const dx = tx - o.pos.x, dz = tz - o.pos.z;
      const dist = Math.hypot(dx, dz);
      const want = o.state === 'cuff' ? 0 : o.state === 'return' ? 3.2 : OFFICER_SPEED;
      o.speed += (Math.min(want, dist / Math.max(dt, 1e-3)) - o.speed) * Math.min(1, dt * 5);
      if (dist > 0.05) {
        const step = Math.min(dist, o.speed * dt);
        o.pos.x += (dx / dist) * step;
        o.pos.z += (dz / dist) * step;
        const a = Math.atan2(dx, dz);
        let da = a - o.facing;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        o.facing += da * Math.min(1, dt * 10);
      } else if (o.state === 'cuff') {
        o.facing = Math.atan2(f.x - o.pos.x, f.z - o.pos.z);
      }
      o.pos.y += ((ty ?? this.groundY(o.pos.x, o.pos.z)) - o.pos.y) * Math.min(1, dt * 8);
      o.body.velocity.set(0, 0, 0);
      o.body.position.set(o.pos.x, o.pos.y, o.pos.z);
      o.sync();
      o.animator.update(dt, { speed: o.speed, grounded: true, state: o.state === 'cuff' ? 'give' : 'auto' });
    }
    for (const o of this.officers.filter((x) => x.dead)) {
      if (o.car) o.car.deployed = this.officers.some((x) => x !== o && !x.dead && x.car === o.car);
      o.dispose();
    }
    this.officers = this.officers.filter((x) => !x.dead);
  }

  disposeOfficers() {
    for (const o of this.officers) o.dispose();
    this.officers = [];
    for (const c of this.cars) c.deployed = false;
  }

  spawnCar() {
    const g = this.garage;
    // Se l'uscita è occupata da un'altra volante, la nuova si accoda lungo la strada
    let x = g.x;
    for (let i = 0; i < 4 && this.cars.some((c) => Math.hypot(c.body.position.x - x, c.body.position.z - g.z) < 6); i++) x -= 7;
    const car = new Vehicle(this.game.scene, this.game.physics, { model: 'polizia', police: true, owner: 'police', x, z: g.z, heading: g.heading });
    // Volanti potenziate: più veloci e scattanti delle auto civili
    car.spec.maxSpeed *= 1.3;
    car.spec.accel *= 1.35;
    car.spec.steer *= 1.12;
    car.makeDynamic();
    car.sirenOn = true;
    car.wp = null;
    car.stuckT = 0;
    car.reverseT = 0;
    car.mesh.visible = this.visible;
    this.cars.push(car);
  }

  /** La volante vede il giocatore? Cono visivo + linea di vista libera da palazzi. */
  canSee(car, target) {
    if (this.game.interior || this.game.paradise) return false;
    const p = car.body.position;
    const dx = target.x - p.x, dz = target.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > VIEW_DIST) return false;
    if (d > NEAR_SENSE) {
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - car.heading));
      if (ang > VIEW_HALF_ANGLE) return false;
    }
    this._from.set(p.x, 1.4, p.z);
    this._to.set(target.x, (target.y || 0) + 1.2, target.z);
    this.ray.reset();
    this.game.physics.raycastClosest(this._from, this._to, { collisionFilterMask: GROUPS.WORLD, skipBackfaces: true }, this.ray);
    return !(this.ray.hasHit && this.ray.distance < d - 1.5);
  }

  /** Prossimo punto da raggiungere: incrocio per incrocio lungo le strade, oppure dritto al bersaglio se vicino. */
  waypoint(car, target, direct) {
    const p = car.body.position;
    if (direct) return target;
    const nx = snapRoad(p.x), nz = snapRoad(p.z);
    const tx = snapRoad(target.x), tz = snapRoad(target.z);
    if (car.wp && Math.hypot(car.wp.x - p.x, car.wp.z - p.z) > 6) return car.wp;
    if (nx === tx && nz === tz) {
      car.wp = null;
      return target;
    }
    const dx = tx - nx, dz = tz - nz;
    const alongX = Math.abs(dx) > Math.abs(dz);
    car.wp = alongX ? { x: nx + Math.sign(dx) * CELL, z: nz } : { x: nx, z: nz + Math.sign(dz) * CELL };
    return car.wp;
  }

  drive(car, dt, target, direct) {
    const p = car.body.position;
    const wp = this.waypoint(car, target, direct);
    const dx = wp.x - p.x, dz = wp.z - p.z;
    const dist = Math.hypot(dx, dz);
    const err = wrapAngle(Math.atan2(dx, dz) - car.heading);
    const ctl = { throttle: false, brake: false, steer: THREE.MathUtils.clamp(err * 2.2, -1, 1), handbrake: false };
    if (car.reverseT > 0) {
      // Manovra per sbloccarsi: retromarcia con sterzo invertito
      car.reverseT -= dt;
      ctl.brake = true;
      ctl.steer = -ctl.steer;
    } else {
      const sharp = Math.abs(err) > 1.1;
      const slowZone = direct && dist < 9;
      ctl.throttle = !slowZone && (!sharp || car.speed < 5);
      ctl.brake = (sharp && car.speed > 9) || (slowZone && car.speed > 1.5) || (!direct && dist < 16 && Math.abs(err) > 0.5 && car.speed > 12);
      if (ctl.throttle && Math.abs(car.speed) < 1) {
        car.stuckT += dt;
        if (car.stuckT > 1.6) { car.stuckT = 0; car.reverseT = 1.3; }
      } else car.stuckT = Math.max(0, car.stuckT - dt);
    }
    car.update(dt, ctl);
  }

  update(dt) {
    const g = this.game;
    if (!this.stars && !this.cars.length && !this.officers.length) return;
    const target = g.mapPosition();
    const tgt = { x: target.x, y: g.driving ? g.driving.body.position.y : g.player.feet.y, z: target.z };

    if (this.stars) {
      // Pattuglie in arrivo dal garage della centrale (una per stella più una di rinforzo)
      this.spawnTimer -= dt;
      const active = this.cars.filter((c) => !c.leaving).length;
      if (active < this.stars + 1 && this.spawnTimer <= 0) {
        this.spawnCar();
        this.spawnTimer = 1.8;
      }
      // La centrale aggiorna via radio la tua ultima posizione nota (anche con una sola stella)
      this.radioT = (this.radioT || 0) - dt;
      if (this.stars >= 1 && this.radioT <= 0) {
        this.radioT = this.stars >= 3 ? RADIO_UPDATE : this.stars === 2 ? RADIO_UPDATE * 1.5 : RADIO_UPDATE * 2.2;
        if (this.unseen < LOSE_AFTER * 0.6) this.lastKnown = { x: tgt.x, z: tgt.z };
      }
      let seen = false;
      for (const c of this.cars) if (!c.leaving && this.canSee(c, tgt)) { seen = true; break; }
      if (seen) {
        this.unseen = 0;
        this.lastKnown = { x: tgt.x, z: tgt.z };
      } else {
        this.unseen += dt;
        if (this.unseen > LOSE_AFTER) {
          g.toast('Hai seminato la polizia. Le stelle sono sparite.', 3000);
          audio.confirm();
          this.clear();
        }
      }
      this.sirenTimer -= dt;
      if (this.sirenTimer <= 0 && this.cars.length && !g.interior) {
        const near = this.cars.some((c) => Math.hypot(c.body.position.x - tgt.x, c.body.position.z - tgt.z) < 120);
        if (near) audio.siren(5);
        this.sirenTimer = 5;
      }
    }

    let closeCar = false;
    for (const c of this.cars) {
      if (c.leaving) {
        // Rientro: si allontanano e spariscono fuori dalla vista
        c.leaveT += dt;
        this.drive(c, dt, this.garage, false);
        const far = Math.hypot(c.body.position.x - tgt.x, c.body.position.z - tgt.z) > 90;
        if (far || c.leaveT > 25 || g.interior) c.dead = true;
        continue;
      }
      const sees = this.unseen === 0;
      const goal = sees ? tgt : (this.lastKnown || tgt);
      const d = Math.hypot(c.body.position.x - tgt.x, c.body.position.z - tgt.z);
      const onFoot = !g.driving && !g.interior && !(g.taxi && g.taxi.riding);
      // A piedi e vicino: la volante inchioda e gli agenti scendono (una sola coppia di agenti per volta)
      if (onFoot && !c.deployed && d < DEPLOY_DIST && sees && !this.officers.some((o) => o.state === 'chase')) {
        c.update(dt, { throttle: false, brake: true, steer: 0, handbrake: true });
        if (Math.abs(c.speed) < 3) this.deploy(c);
        continue;
      }
      if (c.deployed) {
        // Volante ferma con le porte aperte finché gli agenti non tornano
        c.update(dt, { throttle: false, brake: true, steer: 0, handbrake: true });
        continue;
      }
      this.drive(c, dt, goal, sees && d < DIRECT_CHASE);
      if (d < ARREST_DIST && sees) closeCar = true;
    }
    for (const c of this.cars.filter((x) => x.dead)) {
      for (const o of this.officers) if (o.car === c) o.car = null;
      c.dispose();
    }
    this.cars = this.cars.filter((x) => !x.dead);
    this.updateOfficers(dt);

    // Arresto in auto: una volante ti blocca con il mezzo quasi fermo per un secondo e mezzo
    // (a piedi ti prendono gli agenti, vedi updateOfficers)
    const slow = g.driving && Math.abs(g.driving.speed) < 2.5;
    if (this.stars && closeCar && slow && !g.transitioning) {
      this.arrestT += dt;
      if (this.arrestT > 1.5) {
        this.arrestT = 0;
        g.busted();
      }
    } else {
      this.arrestT = Math.max(0, this.arrestT - dt * 0.5);
    }
  }

  sync(dt) {
    for (const c of this.cars) c.sync(dt);
  }

  setVisible(v) {
    this.visible = v;
    for (const c of this.cars) c.mesh.visible = v;
    for (const o of this.officers) o.mesh.visible = v;
  }

  /** Posizioni per la mappa e la minimappa. */
  dots() {
    return [...this.cars, ...this.officers.map((o) => ({ body: { position: o.pos } }))].map((c) => ({ x: c.body.position.x, z: c.body.position.z }));
  }

  disposeCars() {
    for (const c of this.cars) c.dispose();
    this.cars = [];
  }

  dispose() {
    this.disposeOfficers();
    this.disposeCars();
  }
}
