// Ricercato dalla polizia (1-3 stelle): le volanti partono dal garage della stazione di polizia,
// percorrono le strade della griglia e ti inseguono. Per seminarle devi uscire dal loro cono visivo
// (palazzi, vicoli, interni): dopo qualche secondo le stelle lampeggiano e poi spariscono.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Vehicle } from './vehicle.js';
import { GROUPS } from './playerstate.js';
import { HALF, CELL, RINGS, GRID } from './world.js';
import { audio } from './audio.js';

const MAX_STARS = 3;
const VIEW_DIST = 110;
const VIEW_HALF_ANGLE = THREE.MathUtils.degToRad(70);
const NEAR_SENSE = 14; // da vicino ti "sentono" anche alle spalle
const BLINK_AFTER = 7; // secondi fuori vista prima che le stelle lampeggino
const LOSE_AFTER = 16; // secondi fuori vista per far perdere le tracce
const DIRECT_CHASE = 45; // sotto questa distanza (e in vista) puntano dritto al giocatore
const ARREST_DIST = 6.5;
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
      if (!was) this.spawnTimer = 3; // il tempo della chiamata al 112
      this.game.toast(`🚨 ${reason} — qualcuno ha chiamato la polizia! ${'★'.repeat(this.stars)}`, 3600);
      audio.siren(6);
    }
  }

  /** Il giocatore è stato fermato: tutte le pattuglie rientrano. */
  clear(immediate = false) {
    this.stars = 0;
    this.unseen = 0;
    this.arrestT = 0;
    for (const c of this.cars) {
      c.sirenOn = false;
      c.leaving = true;
      c.leaveT = 0;
    }
    if (immediate) this.disposeCars();
  }

  spawnCar() {
    const g = this.garage;
    // Se l'uscita è occupata da un'altra volante, la nuova si accoda lungo la strada
    let x = g.x;
    for (let i = 0; i < 4 && this.cars.some((c) => Math.hypot(c.body.position.x - x, c.body.position.z - g.z) < 6); i++) x -= 7;
    const car = new Vehicle(this.game.scene, this.game.physics, { model: 'polizia', police: true, owner: 'police', x, z: g.z, heading: g.heading });
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
    if (!this.stars && !this.cars.length) return;
    const target = g.mapPosition();
    const tgt = { x: target.x, y: g.driving ? g.driving.body.position.y : g.player.feet.y, z: target.z };

    if (this.stars) {
      // Pattuglie in arrivo dal garage della centrale (una per stella)
      this.spawnTimer -= dt;
      const active = this.cars.filter((c) => !c.leaving).length;
      if (active < this.stars && this.spawnTimer <= 0) {
        this.spawnCar();
        this.spawnTimer = 2.5;
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
      this.drive(c, dt, goal, sees && d < DIRECT_CHASE);
      if (d < ARREST_DIST && sees) closeCar = true;
    }
    for (const c of this.cars.filter((x) => x.dead)) c.dispose();
    this.cars = this.cars.filter((x) => !x.dead);

    // Arresto: una volante ti blocca (a piedi o con il mezzo quasi fermo) per un secondo e mezzo
    const slow = !g.driving || Math.abs(g.driving.speed) < 2.5;
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
  }

  /** Posizioni per la mappa e la minimappa. */
  dots() {
    return this.cars.map((c) => ({ x: c.body.position.x, z: c.body.position.z }));
  }

  disposeCars() {
    for (const c of this.cars) c.dispose();
    this.cars = [];
  }

  dispose() {
    this.disposeCars();
  }
}
