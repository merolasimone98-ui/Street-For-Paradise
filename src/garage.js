// Garage fisico di casa: 4 box per i tuoi veicoli, consegne dal concessionario, tuning ed entrata/uscita
// guidando attraverso la serranda (stile GTA). I veicoli custoditi escono dalla fisica della città
// e vengono riposizionati nei box (corpo Cannon-es + mesh) solo quando entri nel garage.
import { INTERIOR_ORIGIN, GARAGE_LAYOUT } from './interiors.js';
import { audio } from './audio.js';
import { fadeTo } from './ui.js';

export class HomeGarage {
  constructor(game) {
    this.game = game;
    this.fullWarnT = 0;
  }

  /** Porta (serranda) del garage sulla mappa. */
  get door() {
    return this.game.world.homeGarage || null;
  }

  /** Il giocatore si trova dentro il garage di casa. */
  get inside() {
    const g = this.game;
    return !!(g.interior && g.currentDoor && g.currentDoor.type === 'homegarage');
  }

  vehicles() {
    return this.game.vehicles.garaged();
  }

  get capacity() {
    return GARAGE_LAYOUT.bays.length;
  }

  freeBay() {
    const used = new Set(this.vehicles().map((v) => v.bay));
    for (let i = 0; i < this.capacity; i++) if (!used.has(i)) return i;
    return -1;
  }

  /** Box i-esimo in coordinate mondo (il muso guarda la serranda, verso +Z). */
  bayWorld(i) {
    return { x: INTERIOR_ORIGIN.x + GARAGE_LAYOUT.bays[i], z: INTERIOR_ORIGIN.z + GARAGE_LAYOUT.bayZ, heading: 0 };
  }

  /** Corregge box mancanti o doppi (salvataggi vecchi, consegne). */
  normalizeBays() {
    const seen = new Set();
    for (const v of this.vehicles()) {
      if (v.bay < 0 || v.bay >= this.capacity || seen.has(v.bay)) v.bay = -1;
      else seen.add(v.bay);
    }
    for (const v of this.vehicles()) {
      if (v.bay >= 0) continue;
      for (let i = 0; i < this.capacity; i++) if (!seen.has(i)) { v.bay = i; seen.add(i); break; }
    }
  }

  /** Mette un veicolo in garage (consegna). Ritorna false se i box sono tutti occupati. */
  store(v) {
    const bay = this.freeBay();
    if (bay < 0) return false;
    v.bay = bay;
    v.stash();
    if (this.inside) this.activate();
    return true;
  }

  /** Entrando nel garage: i veicoli custoditi compaiono nei rispettivi box. */
  activate() {
    this.normalizeBays();
    for (const v of this.vehicles()) {
      if (v.bay < 0) continue; // più veicoli che box (non dovrebbe accadere): restano custoditi
      if (v.bayActive && v.occupied) continue;
      const b = this.bayWorld(v.bay);
      v.placeInBay(b.x, b.z, b.heading);
    }
  }

  /** Uscendo: i veicoli rimasti nei box tornano custoditi fuori scena. */
  deactivate() {
    for (const v of this.vehicles()) if (v.bayActive) v.stash();
  }

  /** Punto in cui un veicolo compare uscendo dalla serranda (sul marciapiede, muso verso la strada). */
  exitSpot(v) {
    const d = this.door;
    const heading = d.nz > 0 ? 0 : Math.PI;
    const off = (v ? v.spec.len / 2 : 2) + 1.2;
    return { x: d.x, z: d.z + d.nz * off, heading };
  }

  /** Punto in strada davanti al garage (consegne quando i box sono pieni). */
  streetSpot() {
    const d = this.door;
    return { x: d.x, z: d.z + d.nz * 9.5, heading: Math.PI / 2 };
  }

  /** Guidando verso la serranda, piano, con un tuo veicolo: entri nel garage. */
  checkDriveIn(v, dt) {
    const g = this.game;
    this.fullWarnT -= dt;
    const d = this.door;
    if (!d || g.interior || g.transitioning || !v || v.inGarage) return false;
    if (v.owner !== 'player' && v.owner !== 'stolen') return false;
    const p = v.body.position;
    const ahead = (p.z - d.z) * d.nz; // distanza davanti alla facciata
    if (Math.abs(p.x - d.x) > 2.6 || ahead < 0 || ahead > v.spec.len / 2 + 2.2) return false;
    const h = v.heading;
    const towards = Math.cos(h) * -d.nz; // muso verso la serranda
    if (towards < 0.6 || v.speed < 0.3 || v.speed > 9) return false;
    if (this.freeBay() < 0) {
      if (this.fullWarnT <= 0) {
        this.fullWarnT = 4;
        g.toast('Il garage è pieno (4 box occupati): vendi o porta fuori un veicolo.', 3000);
      }
      return false;
    }
    this.driveIn(v);
    return true;
  }

  async driveIn(v) {
    const g = this.game;
    if (g.transitioning) return;
    g.transitioning = true;
    g.hud.hidePrompt();
    audio.shutter();
    await fadeTo(1, 0.45, '#000');
    if (g.disposed) return;
    v.bay = this.freeBay();
    // Il giocatore scende dentro il garage, accanto al suo veicolo
    g.driving = null;
    v.occupied = false;
    audio.engineStop(v.uid);
    g.player.setPose('auto');
    g.player.setPhysicsEnabled(true);
    g.player.updateHeld(g.state.equipped);
    v.stash();
    g.openInterior(this.door);
    const b = this.bayWorld(v.bay);
    const side = v.bay < this.capacity / 2 ? 1 : -1;
    g.player.setPosition(b.x + side * (v.spec.wid / 2 + 0.8), 0, b.z + 1.2, Math.PI);
    g.rig.yaw = Math.PI;
    g.rig.maxDist = 6;
    g.rig.height = 1.55;
    g.rig.targetDist = g.rig.dist = 4;
    g.state.vehicles = g.vehicles.serializeOwned();
    await fadeTo(0, 0.5);
    g.transitioning = false;
    g.toast(`${v.name} parcheggiato nel garage. Avvicinati e premi E per il tuning, F per guidarlo fuori.`, 3600);
    g.autosaver.saveNow();
  }

  /** Dentro il garage: superata la linea della serranda con il veicolo, esci in strada guidando. */
  checkDriveOut(v) {
    const g = this.game;
    if (!this.inside || g.transitioning || !v) return false;
    const p = v.body.position;
    const front = p.z + Math.cos(v.heading) * v.spec.len / 2;
    if (front > INTERIOR_ORIGIN.z + GARAGE_LAYOUT.d / 2 - 1.1 && v.speed > 0.2) {
      this.driveOut(v);
      return true;
    }
    return false;
  }

  async driveOut(v) {
    const g = this.game;
    if (g.transitioning) return;
    g.transitioning = true;
    audio.shutter();
    await fadeTo(1, 0.4, '#000');
    if (g.disposed) return;
    v.leaveGarage();
    g.closeInterior();
    const s = this.exitSpot(v);
    v.teleport(s.x, s.z, s.heading, 2.5);
    v.makeDynamic();
    v.mesh.visible = true;
    g.placeRider();
    g.rig.collidables = g.world.collidables;
    g.rig.maxDist = v.spec.ride ? 8 : 12;
    g.rig.targetDist = g.rig.dist = v.spec.ride ? 4.8 : 7.5;
    g.rig.height = v.spec.ride ? 1.6 : 1.3;
    g.rig.yaw = s.heading + Math.PI;
    g.rig.pitch = 0.18;
    g.dayCycle.update(g.hour, g.player.feet);
    g.renderer.compile(g.scene, g.camera);
    g.state.vehicles = g.vehicles.serializeOwned();
    await fadeTo(0, 0.5);
    g.transitioning = false;
    audio.engineStart(v.uid, v.kind);
  }
}
