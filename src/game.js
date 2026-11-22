// Gameplay open-world: mondo, giocatore, veicoli, NPC, interni, negozi, salute/stamina, Aura, menu ESC/TAB e salvataggi.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityWorld, DayCycle } from './world.js';
import { Player, CameraRig } from './player.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SaveSystem, AutoSaver } from './save.js';
import { getCity, getFamily, formatMoney, seededRandom } from './birthdata.js';
import { Interior } from './interiors.js';
import { PlayerState, GROUPS } from './playerstate.js';
import { ITEMS, itemInfo } from './items.js';
import { VehicleManager, KIND_LABEL } from './vehicle.js';
import { NpcManager, pickHomelessSpots } from './npcs.js';
import { RestaurantService } from './restaurant.js';
import { Dialogs } from './dialogs.js';
import { EscMenu, TabMenu } from './menus.js';
import { loadSettings, saveSettings, pixelRatioFor } from './settings.js';
import { $, toast, fadeTo, disposeObject3D } from './ui.js';

const GAME_MINUTES_PER_SECOND = 1; // 1 secondo reale = 1 minuto di gioco (1 giorno = 24 minuti)
const AUTOSAVE_SECONDS = 30;
const INTERACT_RADIUS = 2.5;
const SLEEP_WAKE_HOUR = 7;

export class Game {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, character: object, save: object|null, onExitToMenu: () => void }} opts
   */
  constructor({ renderer, character, save, onExitToMenu }) {
    this.renderer = renderer;
    this.canvas = renderer.domElement;
    this.onExitToMenu = onExitToMenu;
    this.character = save ? save.character : character;
    this.city = getCity(this.character.cityId);
    this.family = getFamily(this.character.familyId);
    this.disposed = false;
    this.locked = false;
    this.exiting = false;
    this.settings = loadSettings();

    // Stato di gioco
    this.state = new PlayerState(save ? save.state : null, this.character, save ? save.money : this.character.money);
    this.age = save ? save.age : 18;
    this.day = save ? save.time.day : 1;
    this.hour = save ? save.time.hour : 9.5;
    this.playTime = save ? save.playTime || 0 : 0;
    this.daysSinceBirthday = save ? save.time.daysSinceBirthday || 0 : 0;
    this.interior = null;
    this.currentDoor = null;
    this.restaurant = null;
    this.transitioning = false;
    this.driving = null;
    this.action = null;
    this.healOverTime = null;
    this.deliveries = [];
    this.elapsed = 0;
    this.mouseIdle = 0;
    this.openUis = new Set();

    // Scena e fisica
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.allowSleep = false;
    this.physics.solver.iterations = 12;
    this.physics.solver.tolerance = 0.0005;
    this.physics.defaultContactMaterial.friction = 0;
    this.physics.defaultContactMaterial.restitution = 0;

    const seed = this.seed = this.hashSeed(`${this.character.name}|${this.character.surname}|${this.character.cityId}|${this.character.birthYear}`);
    this.world = new CityWorld(this.scene, this.physics, { city: this.city, familyId: this.family.id, seed });
    this.dayCycle = new DayCycle(this.scene, this.world);
    this.dayCycle.setupEnvironment(renderer);

    this.player = new Player(this.scene, this.physics, this.character, this.state.outfit);
    this.player.onLand = (v) => this.onLand(v);
    this.player.updateHeld(this.state.equipped);
    this.physics.addContactMaterial(new CANNON.ContactMaterial(this.player.material, this.world.staticMaterial, { friction: 0, restitution: 0 }));

    // Veicoli e NPC
    const rng = seededRandom((seed ^ 0x9e3779b9) >>> 0);
    this.vehicles = new VehicleManager(this.scene, this.physics);
    this.vehicles.spawnParked(this.world.parkingSpots, rng);
    if (this.world.style.taxi) {
      for (const v of this.vehicles.list.filter((x) => !x.spec.ride).slice(0, 5)) v.mesh.traverse((o) => { if (o.isMesh && o.material.clearcoat !== undefined && o.material.opacity === 1) o.material.color.set(this.world.style.taxi); });
    }
    this.vehicles.spawnSaved(this.state.vehicles);
    this.npcs = new NpcManager(this.scene, this.physics, this.world, this.state, rng);
    this.npcs.spawnPedestrians(24);
    this.npcs.spawnHomeless(pickHomelessSpots(this.world, rng, 5));

    this.rig = new CameraRig(this.camera, this.world.collidables);
    if (save && save.player) {
      this.player.setPosition(save.player.x, save.player.y - 0.05, save.player.z, save.player.facing || 0);
      this.rig.yaw = save.player.camYaw ?? 0;
      this.rig.pitch = save.player.camPitch ?? 0.22;
    } else {
      const sp = this.world.getSpawn();
      this.player.setPosition(sp.x, 0.2, sp.z, sp.yaw);
      this.rig.yaw = sp.yaw;
      this.rig.pitch = 0.12;
      this.rig.dist = this.rig.targetDist = 5.2;
    }

    this.hud = new HUD(this.world);
    this.hud.setCharacter(this.character, this.city, this.family);
    this.hud.show();

    this.input = new Input();
    this.input.attach();
    this.autosaver = new AutoSaver(() => this.getSaveData(), AUTOSAVE_SECONDS, (ok) => this.hud.flashSave(ok));
    this.dialogs = new Dialogs(this);
    this.escMenu = new EscMenu(this);
    this.tabMenu = new TabMenu(this);

    this.el = { ctp: $('click-to-play'), ctpTitle: $('ctp-title'), ctpSub: $('ctp-sub') };
    this.bindEvents();
    this.applyAllSettings();
    this.dayCycle.update(this.hour, this.player.feet);
    this.rig.update(0.016, { dx: 0, dy: 0, wheel: 0 }, this.player.feet);
    this.player.animate(0);

    // Primo salvataggio: per una nuova vita sovrascrive quello vecchio.
    this.autosaver.saveNow();

    this.showClickToPlay(
      save ? 'Bentornato' : `${this.character.name}, 18 anni`,
      save
        ? `${this.city.city} · ${this.currentPlaceName()} · ${formatMoney(this.state.cash)}`
        : `${this.city.city}. Esci di casa con ${formatMoney(this.state.cash)} in tasca. Clicca per iniziare.`,
    );
  }

  hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  get money() {
    return this.state.cash;
  }

  /* =====================================================================
     Pointer Lock, menu e finestre
     ===================================================================== */
  bindEvents() {
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        this.el.ctp.classList.add('hidden');
        if (this.escMenu.isOpen) { this.escMenu.close(); this.openUis.delete('esc'); }
        this.input.enabled = this.openUis.size === 0;
      } else if (!this.disposed && !this.exiting && this.openUis.size === 0) {
        this.pause(); // ESC durante il gioco
      }
    };
    this._onLockError = () => {
      if (this.disposed || this.openUis.size) return;
      this.showClickToPlay('Clicca per riprendere', '');
    };
    this._onCtpClick = () => this.requestLock();
    this._onVisibility = () => { if (document.visibilityState === 'hidden') this.autosaver.saveNow(); };
    this._onPageHide = () => this.autosaver.saveNow();
    this._onKey = (e) => {
      if (this.disposed) return;
      // Con i menu aperti il mouse è libero: TAB/ESC chiudono il menu TAB, ESC chiude il menu ESC.
      if (this.tabMenu.isOpen && (e.code === 'Tab' || e.code === 'Escape')) {
        e.preventDefault();
        this.closeTabMenu();
      } else if (this.escMenu.isOpen && e.code === 'Escape' && !this.dialogs.isOpen) {
        e.preventDefault();
        this.resume();
      } else if (e.code === 'Tab') {
        e.preventDefault();
      }
    };

    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    this.el.ctp.addEventListener('click', this._onCtpClick);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('pagehide', this._onPageHide);
    window.addEventListener('beforeunload', this._onPageHide);
    window.addEventListener('keydown', this._onKey);
  }

  unbindEvents() {
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    this.el.ctp.removeEventListener('click', this._onCtpClick);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('pagehide', this._onPageHide);
    window.removeEventListener('beforeunload', this._onPageHide);
    window.removeEventListener('keydown', this._onKey);
  }

  showClickToPlay(title, sub) {
    this.el.ctpTitle.textContent = title;
    this.el.ctpSub.textContent = sub || '';
    this.el.ctp.classList.remove('hidden');
  }

  requestLock() {
    if (this.disposed || this.locked || this.openUis.size) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => this._onLockError());
    } catch (e) {
      this._onLockError();
    }
  }

  /** Una finestra/menu ha bisogno del cursore: si rilascia il Pointer Lock senza mettere in pausa. */
  openUi(kind) {
    this.openUis.add(kind);
    this.input.enabled = false;
    this.input.reset();
    this.el.ctp.classList.add('hidden');
    this.hud.hidePrompt();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  closeUi(kind) {
    this.openUis.delete(kind);
    if (this.openUis.size === 0) {
      this.input.enabled = true;
      // Rimandato di un tick: se nel frattempo si apre un'altra finestra non si ricattura il mouse.
      setTimeout(() => {
        if (this.disposed || this.openUis.size || this.locked) return;
        this.showClickToPlay('Clicca per riprendere', '');
        this.requestLock();
      }, 0);
    }
  }

  pause() {
    if (this.disposed || this.escMenu.isOpen) return;
    this.openUi('esc');
    this.escMenu.open('map');
    this.autosaver.saveNow();
  }

  resume() {
    if (this.disposed) return;
    this.escMenu.close();
    this.closeUi('esc');
  }

  openTabMenu(tab = 'inventory') {
    if (this.tabMenu.isOpen) return;
    this.openUi('tab');
    this.tabMenu.open(tab);
  }

  closeTabMenu() {
    if (!this.tabMenu.isOpen) return;
    this.tabMenu.close();
    this.player.updateHeld(this.state.equipped);
    this.closeUi('tab');
  }

  manualSave() {
    const ok = this.autosaver.saveNow();
    toast(ok ? 'Partita salvata' : 'Impossibile salvare (spazio di archiviazione non disponibile)');
  }

  exitToMenu() {
    if (this.exiting) return;
    this.exiting = true;
    this.autosaver.saveNow();
    this.onExitToMenu();
  }

  toast(text, ms = 2600) {
    toast(text, ms);
  }

  /* =====================================================================
     Impostazioni
     ===================================================================== */
  applySetting(key, value) {
    this.settings[key] = value;
    saveSettings(this.settings);
    this.applyAllSettings();
  }

  applyAllSettings() {
    const s = this.settings;
    this.rig.sensitivity = 0.0024 * s.sensitivity;
    this.rig.invertY = s.invertY;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.dayCycle.setShadows(s.shadows !== 'off', s.shadows === 'low' ? 1024 : 2048);
    const pr = pixelRatioFor(s.quality);
    if (Math.abs(this.renderer.getPixelRatio() - pr) > 0.01) {
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    }
    this.hud.setMinimapVisible(s.showMinimap);
  }

  /* =====================================================================
     Salvataggio
     ===================================================================== */
  getSaveData() {
    if (this.disposed) return null;
    let p = this.player.body.position;
    let facing = this.player.facing;
    // Dentro un edificio si salva la posizione davanti all'ingresso esterno (nessun rischio di caricare "nel vuoto").
    if (this.interior && this.currentDoor) {
      const spot = this.world.doorExitSpot(this.currentDoor);
      p = { x: spot.x, y: 0.2 + 0.45, z: spot.z };
      facing = spot.facing;
    } else if (this.driving) {
      const ex = this.safeExitPoint(this.driving);
      p = { x: ex.x, y: 0.65, z: ex.z };
    }
    this.state.vehicles = this.vehicles.serializeOwned();
    return {
      character: this.character,
      money: Math.round(this.state.cash),
      age: this.age,
      time: { day: this.day, hour: this.hour, daysSinceBirthday: this.daysSinceBirthday },
      playTime: Math.round(this.playTime),
      state: this.state.serialize(),
      player: {
        x: +p.x.toFixed(2), y: +(p.y - 0.45).toFixed(2), z: +p.z.toFixed(2),
        facing: +facing.toFixed(3),
        camYaw: +this.rig.yaw.toFixed(3), camPitch: +this.rig.pitch.toFixed(3),
      },
    };
  }

  /* =====================================================================
     Loop
     ===================================================================== */
  update(dt) {
    if (this.disposed) return;
    const active = this.locked && this.openUis.size === 0;
    if (active) {
      this.playTime += dt;
      this.advanceTime(dt);
      this.updateTimers(dt);
      if (this.driving) this.updateDriving(dt);
      else this.updateOnFoot(dt);
      this.physics.step(1 / 60, dt, 5);
      if (!this.driving && this.player.bodyInWorld && this.player.body.position.y < -20) {
        const sp = this.world.getSpawn();
        this.player.setPosition(sp.x, 0.2, sp.z, 0);
      }
      this.autosaver.update(dt);
      if (this.input.consumePressed('KeyC')) this.hud.toggleCard();
      if (this.input.consumePressed('Tab')) this.openTabMenu('inventory');
      this.updateInteraction();
      this.checkHealth();
    } else {
      this.hud.hidePrompt();
    }
    const mouse = active ? this.input.consumeMouse() : { dx: 0, dy: 0, wheel: 0 };
    if (!active) this.input.consumeMouse();
    this.input.endFrame();

    this.elapsed += dt;
    this.world.update(this.elapsed);
    if (this.interior) this.interior.update(dt);
    if (this.restaurant && !this.escMenu.isOpen) this.restaurant.update(dt);
    if (!this.interior) this.npcs.update(dt, this.player.feet);
    this.vehicles.sync(dt);
    if (this.driving) this.placeRider();
    this.player.animate(active || this.player.pose !== 'auto' ? dt : 0);

    // Camera
    let focus = this.player.feet;
    if (this.driving) {
      const vp = this.driving.position;
      focus = new THREE.Vector3(vp.x, vp.y, vp.z);
      this.mouseIdle = mouse.dx || mouse.dy ? 0 : this.mouseIdle + dt;
      if (this.mouseIdle > 1.2 && Math.abs(this.driving.speed) > 2) {
        const behind = this.driving.heading + (this.driving.speed < 0 ? 0 : Math.PI);
        let d = (behind - this.rig.yaw) % (Math.PI * 2);
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this.rig.yaw += d * Math.min(1, dt * 2.5);
      }
    }
    this.rig.update(dt, mouse, focus);
    this.dayCycle.update(this.hour, focus);

    const mapPos = this.mapPosition();
    this.hud.update(dt, {
      money: this.state.cash, age: this.age, day: this.day, hour: this.hour,
      district: this.currentPlaceName(), x: mapPos.x, z: mapPos.z,
      facing: this.driving ? this.driving.heading : this.player.facing, camYaw: this.rig.yaw,
      health: this.state.health, maxHealth: this.state.maxHealth, stamina: this.state.stamina, maxStamina: this.state.maxStamina,
      exhausted: this.state.exhausted, aura: this.state.aura, vehicle: this.driving,
    });
  }

  updateOnFoot(dt) {
    const st = this.state;
    const blocked = !!this.action || this.player.pose !== 'auto';
    const canRun = !st.exhausted && st.stamina > 1;
    const running = blocked ? this.player.update(dt, { down: () => false, consumePressed: () => false }, this.rig.yaw, false)
      : this.player.update(dt, this.input, this.rig.yaw, canRun);
    // Stamina: scende correndo, si ricarica camminando o da fermi
    if (running) {
      const drain = 16 * (1.25 - this.character.stats.resistenza / 200);
      st.stamina = Math.max(0, st.stamina - drain * dt);
      if (st.stamina <= 0) st.exhausted = true;
    } else {
      st.restoreStamina((this.player.speed > 0.3 ? 9 : 18) * dt);
      if (st.exhausted && st.stamina >= 30) st.exhausted = false;
    }
  }

  updateDriving(dt) {
    const v = this.driving;
    const ctl = {
      throttle: this.input.down('KeyW', 'ArrowUp'),
      brake: this.input.down('KeyS', 'ArrowDown'),
      steer: (this.input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.input.down('KeyD', 'ArrowRight') ? 1 : 0),
      handbrake: this.input.down('Space'),
    };
    this.vehicles.update(dt, v, ctl);
    if (v.impact > 0) {
      const dmg = (v.impact - 6) * (v.spec.ride ? 5 : 2.5);
      if (dmg > 1) {
        this.state.damage(dmg);
        this.toast(`Incidente! −${Math.round(dmg)} salute`, 1600);
      }
    }
    this.state.restoreStamina(12 * dt);
    if (this.state.exhausted && this.state.stamina >= 30) this.state.exhausted = false;
  }

  /** Posizione del pilota (sella o abitacolo) sincronizzata col veicolo. */
  placeRider() {
    const v = this.driving;
    if (v.spec.ride) {
      const seat = v.seatPosition();
      seat.y -= this.player.mesh.userData.hipHeight;
      this.player.setPose('ride', seat, v.heading);
    } else {
      const p = v.position;
      this.player.setPose('hidden', new THREE.Vector3(p.x, p.y, p.z), v.heading);
    }
  }

  updateTimers(dt) {
    // Azione a tempo (es. scasso con il cacciavite)
    if (this.action) {
      this.action.t += dt;
      this.hud.setProgress(this.action.t / this.action.dur, this.action.text);
      if (this.action.t >= this.action.dur) {
        const a = this.action;
        this.action = null;
        this.hud.setProgress(null);
        a.onDone();
      }
    }
    // Medicinali: guarigione distribuita in 3 secondi
    if (this.healOverTime) {
      const h = this.healOverTime;
      const step = Math.min(h.remaining, (h.total / 3) * dt);
      this.state.heal(step);
      h.remaining -= step;
      h.t += dt;
      if (!this.action) this.hud.setProgress(Math.min(1, h.t / 3), `${h.name}: la salute si ripristina…`);
      if (h.remaining <= 0.01 || h.t >= 3) {
        this.healOverTime = null;
        if (!this.action) this.hud.setProgress(null);
      }
    }
    // Consegne a domicilio ordinate col telefono
    for (const d of this.deliveries) {
      d.t -= dt;
      if (d.t <= 0) {
        this.state.addItem(d.item, d.qty);
        this.toast(d.text, 3200);
      }
    }
    this.deliveries = this.deliveries.filter((d) => d.t > 0);
  }

  advanceTime(dt) {
    this.hour += (dt * GAME_MINUTES_PER_SECOND) / 60;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.newDay();
    }
  }

  newDay() {
    this.day++;
    this.daysSinceBirthday++;
    if (this.daysSinceBirthday >= 365) {
      this.daysSinceBirthday = 0;
      this.age++;
      this.toast(`Buon compleanno! Ora hai ${this.age} anni.`, 3500);
    }
  }

  onLand(impactSpeed) {
    if (impactSpeed > 12) {
      const dmg = (impactSpeed - 12) * 7;
      this.state.damage(dmg);
      this.toast(`Caduta! −${Math.round(dmg)} salute`, 1500);
    }
  }

  checkHealth() {
    if (this.state.health <= 0 && !this.transitioning) this.faint();
  }

  /* =====================================================================
     Interazioni [E] e veicoli [F]
     ===================================================================== */
  updateInteraction() {
    if (this.transitioning || this.action) {
      this.hud.hidePrompt();
      return;
    }
    const feet = this.player.feet;
    let eLabel = null, eAction = null, fLabel = null, fAction = null;
    const consider = (dist, label, act) => {
      if (eAction === null || dist < eAction.dist) { eLabel = label; eAction = { dist, act }; }
    };

    if (this.driving) {
      fLabel = `scendere ${{ bike: 'dalla bici', scooter: 'dal motorino', moto: 'dalla moto' }[this.driving.kind] || `dall'${KIND_LABEL[this.driving.kind]}`}`;
      fAction = () => this.exitVehicle();
    } else if (this.player.pose === 'sit') {
      if (this.restaurant && this.restaurant.canStand) consider(0, 'alzarti', () => this.restaurant.stand());
    } else if (this.interior) {
      const ex = this.interior.exitPoint;
      const dEx = Math.hypot(feet.x - ex.x, feet.z - ex.z);
      if (dEx <= INTERACT_RADIUS) consider(dEx, 'uscire', () => this.exitBuilding());
      for (const it of this.interior.interactables) {
        const d = Math.hypot(feet.x - it.x, feet.z - it.z);
        if (d <= it.radius) consider(d, it.label, () => this.runInteraction(it));
      }
    } else {
      if (this.player.grounded) {
        const door = this.world.nearestDoor(feet.x, feet.z, INTERACT_RADIUS);
        if (door) {
          const p = this.world.doorExitSpot(door);
          consider(Math.hypot(p.x - feet.x, p.z - feet.z), `entrare · ${door.name}`, () => this.enterBuilding(door));
        }
      }
      for (const a of this.world.atms) {
        const d = Math.hypot(feet.x - a.x, feet.z - a.z);
        if (d < 1.4) consider(d, 'usare il bancomat', () => this.dialogs.atm());
      }
      const npc = this.npcs.nearest(feet.x, feet.z, 2.0);
      if (npc) {
        const d = Math.hypot(feet.x - npc.pos.x, feet.z - npc.pos.z);
        if (npc.kind === 'homeless') consider(d, `aiutare ${npc.name}`, () => this.dialogs.donate(npc));
        else consider(d + 0.3, `parlare con ${npc.name}`, () => this.talkTo(npc));
      }
      const v = this.vehicles.nearest(feet.x, feet.z, 1.6);
      if (v) {
        if (!v.locked) {
          fLabel = `guidare ${v.name}`;
          fAction = () => this.mountVehicle(v);
        } else if (this.state.has('cacciavite')) {
          fLabel = `forzare ${v.name} (cacciavite)`;
          fAction = () => this.forceVehicle(v);
        } else {
          fLabel = 'provare la portiera (chiusa a chiave)';
          fAction = () => this.toast('Veicolo chiuso a chiave. Serve il cacciavite speciale (Armeria).', 2600);
        }
      }
    }
    this.hud.setPrompts(eLabel, fLabel);
    if (eAction && this.input.consumePressed('KeyE')) eAction.act();
    if (fAction && this.input.consumePressed('KeyF')) fAction();
  }

  runInteraction(it) {
    const st = this.state;
    switch (it.action) {
      case 'shop': this.dialogs.shop(it.data.shop); break;
      case 'dealer': this.dialogs.dealer(false); break;
      case 'bank': this.dialogs.bank(); break;
      case 'atm': this.dialogs.atm(); break;
      case 'wardrobe': this.dialogs.wardrobe(); break;
      case 'seat': if (this.restaurant) this.restaurant.sit(it.data.index); break;
      case 'sleep': this.sleep(it.data); break;
      case 'hospital': {
        if (st.health >= st.maxHealth - 0.5) { this.toast('Il medico ti visita: sei in perfetta salute!'); break; }
        if (st.payWith(150, 'cash') || st.payWith(150, 'card')) {
          st.heal(st.maxHealth);
          this.toast('Cure completate: salute al massimo (−$150).');
        } else {
          st.heal(st.maxHealth * 0.6);
          this.toast('Non puoi pagare: la sanità pubblica ti cura comunque.');
        }
        break;
      }
      case 'pray':
        if (st.daily.prayer !== this.day) {
          st.daily.prayer = this.day;
          st.stats.prayers++;
          st.changeAura(2, 'Hai pregato in chiesa');
          this.toast('Preghi in silenzio. Senti una grande pace. (+2 Aura)', 3000);
        } else {
          this.toast('Resti qualche minuto in raccoglimento.');
        }
        break;
      case 'candle':
        if (!st.pay(2)) { this.toast('Ti servono $2 per l\'offerta.'); break; }
        if (st.daily.candle !== this.day) {
          st.daily.candle = this.day;
          st.changeAura(1, 'Hai acceso una candela e fatto un\'offerta');
          this.toast('Accendi una candela. (+1 Aura)');
        } else this.toast('Accendi un\'altra candela.');
        break;
      case 'police':
        this.dialogs.message('Stazione di Polizia', st.aura < 30
          ? 'Agente: «Ti teniamo d\'occhio. Rigare dritto conviene a tutti.»'
          : st.stats.arrests > 0
            ? `Agente: «Spero che la notte in cella ti sia servita da lezione. Arresti finora: ${st.stats.arrests}.»`
            : 'Agente: «Buongiorno! Se ti serve aiuto, chiama il 112 dal telefono.»');
        break;
      default: break;
    }
  }

  talkTo(npc) {
    npc.lookTarget = this.player.feet;
    const line = this.npcs.talkLine(this.state.aura);
    this.toast(`${npc.name}: «${line}»`, 3500);
    if (npc.talkedDay !== this.day) {
      npc.talkedDay = this.day;
      if (this.state.aura < 100) this.state.changeAura(0.2, 'Hai salutato con gentilezza un passante');
    }
  }

  nearestNpcForGift() {
    if (this.interior) return null;
    const f = this.player.feet;
    return this.npcs.nearest(f.x, f.z, 3);
  }

  thanks() {
    return this.npcs.thanksLine();
  }

  onDonate(npc, gift) {
    const st = this.state;
    const homeless = npc.kind === 'homeless';
    st.stats.donations++;
    let aura = 0;
    let reason = '';
    if (gift.kind === 'money') {
      st.stats.donatedMoney += gift.amount;
      aura = Math.min(6, 0.5 + gift.amount * 0.08) * (homeless ? 1 : 0.4);
      reason = `Hai donato ${formatMoney(gift.amount)} a ${npc.name}`;
    } else if (gift.kind === 'item') {
      const big = ['sacco_a_pelo', 'tenda', 'coperta'].includes(gift.id);
      aura = big ? 3 : 1.5;
      reason = `Hai donato ${itemInfo(gift.id).name} a ${npc.name}`;
      if (homeless && big) {
        st.homelessGifts[npc.id] = { ...(st.homelessGifts[npc.id] || {}), [gift.id]: true };
        this.npcs.refreshGifts(npc);
      }
    } else if (gift.kind === 'cloth') {
      aura = 1.5;
      reason = `Hai donato dei vestiti a ${npc.name}`;
    } else if (gift.kind === 'vehicle') {
      const v = this.vehicles.list.find((x) => x.uid === gift.uid);
      if (v) {
        if (this.driving === v) this.exitVehicle();
        this.vehicles.remove(v);
      }
      aura = 8;
      reason = `Hai regalato un veicolo a ${npc.name}`;
    }
    st.changeAura(aura, reason + ' (opera di carità)');
    this.toast(`${reason}. (+${aura.toFixed(1)} Aura)`, 2600);
  }

  /* ---------- Inventario ---------- */
  useItem(id) {
    const st = this.state;
    const it = ITEMS[id];
    if (!it || !st.has(id)) return '';
    if (it.cat === 'cibo') {
      st.removeItem(id, 1);
      st.heal(it.heal || 0);
      if (it.stamina) st.restoreStamina(it.stamina);
      return `Hai consumato: ${it.name} (+${it.heal || 0} salute${it.stamina ? `, +${it.stamina} stamina` : ''}).`;
    }
    if (it.cat === 'medicinali') {
      if (st.health >= st.maxHealth - 0.5) return 'Sei già in piena salute.';
      st.removeItem(id, 1);
      this.healOverTime = { total: it.heal, remaining: it.heal, t: 0, name: it.name };
      if (it.stamina) st.restoreStamina(it.stamina);
      return `${it.name}: la salute si ripristina in 3 secondi.`;
    }
    return '';
  }

  refreshOutfit() {
    this.player.setOutfit(this.state.outfit);
    this.player.updateHeld(this.state.equipped);
  }

  /* ---------- Veicoli ---------- */
  ownedVehicles() {
    return this.vehicles.list
      .filter((v) => v.owner === 'player' || v.owner === 'stolen')
      .map((v) => ({ uid: v.uid, name: v.name + (v.owner === 'stolen' ? ' (rubato)' : ''), x: v.body.position.x, z: v.body.position.z }));
  }

  forceVehicle(v) {
    this.player.setHeld('screwdriver');
    this.action = {
      t: 0, dur: 3, text: `Forzi la serratura di ${v.name}…`,
      onDone: () => {
        this.player.updateHeld(this.state.equipped);
        v.owner = 'stolen';
        this.state.stats.stolenVehicles++;
        this.state.changeAura(-8, 'Hai rubato un veicolo (7° comandamento: non rubare)');
        this.toast('Serratura forzata. (−8 Aura)', 2200);
        this.mountVehicle(v);
      },
    };
  }

  mountVehicle(v) {
    if (this.driving || this.interior) return;
    this.driving = v;
    v.occupied = true;
    this.player.setPhysicsEnabled(false);
    this.player.phone = false;
    this.player.setHeld(null);
    this.rig.maxDist = v.spec.ride ? 8 : 12;
    this.rig.targetDist = v.spec.ride ? 4.8 : 7.5;
    this.rig.height = v.spec.ride ? 1.6 : 1.3;
    this.rig.yaw = v.heading + Math.PI;
    this.placeRider();
  }

  /** Punto di discesa libero (lato guida, altrimenti lato opposto). */
  safeExitPoint(v) {
    const left = v.exitPoint();
    const p = v.body.position;
    const from = new CANNON.Vec3(p.x, 1.0, p.z);
    const ray = new CANNON.RaycastResult();
    const blocked = (pt) => {
      ray.reset();
      this.physics.raycastClosest(from, new CANNON.Vec3(pt.x, 1.0, pt.z), { collisionFilterMask: GROUPS.WORLD, skipBackfaces: true }, ray);
      return ray.hasHit;
    };
    if (!blocked(left)) return left;
    const right = { x: p.x * 2 - left.x, z: p.z * 2 - left.z, facing: left.facing };
    if (!blocked(right)) return right;
    const h = v.heading;
    return { x: p.x - Math.sin(h) * (v.spec.len / 2 + 0.8), z: p.z - Math.cos(h) * (v.spec.len / 2 + 0.8), facing: h };
  }

  exitVehicle() {
    const v = this.driving;
    if (!v) return;
    const ex = this.safeExitPoint(v);
    v.occupied = false;
    this.driving = null;
    this.player.setPose('auto');
    this.player.setPhysicsEnabled(true);
    this.player.setPosition(ex.x, 0.35, ex.z, ex.facing);
    this.player.updateHeld(this.state.equipped);
    this.rig.maxDist = 10;
    this.rig.height = 1.55;
    this.rig.targetDist = Math.min(this.rig.targetDist, 5);
  }

  onPurchaseVehicle(model, color, delivery) {
    let spot;
    if (delivery && !this.interior) {
      const f = this.player.feet;
      const h = this.player.facing;
      spot = { x: f.x + Math.sin(h) * 6, z: f.z + Math.cos(h) * 6, heading: h };
    } else {
      spot = this.world.dealerSpot || { ...this.world.getSpawn(), heading: 0 };
    }
    const v = this.vehicles.add({ model, color, x: spot.x, z: spot.z, heading: spot.heading, owner: 'player' });
    if (this.interior) v.mesh.visible = false;
    this.state.vehicles = this.vehicles.serializeOwned();
    this.autosaver.saveNow();
    this.toast(delivery ? `${v.name} consegnata davanti a te!` : `${v.name} acquistata! Ti aspetta in strada davanti al concessionario.`, 3500);
  }

  /* ---------- Telefono ---------- */
  taxiFare(door) {
    const f = this.mapPosition();
    return Math.round(5 + Math.hypot(door.x - f.x, door.z - f.z) * 0.05);
  }

  async taxiTo(door) {
    const fare = this.taxiFare(door);
    if (!this.state.pay(fare)) { this.tabMenu.call('🚕', 'Radio Taxi', `Servono ${formatMoney(fare)} in contanti.`); return; }
    this.closeTabMenu();
    if (this.driving) this.exitVehicle();
    this.transitioning = true;
    await fadeTo(1, 0.5, '#000');
    if (this.disposed) return;
    this.leaveInteriorImmediate();
    const spot = this.world.doorExitSpot(door);
    this.player.setPosition(spot.x, 0.25, spot.z, spot.facing);
    this.rig.yaw = spot.facing;
    this.hour = Math.min(23.9, this.hour + 0.25);
    await fadeTo(0, 0.6);
    this.transitioning = false;
    this.toast(`Taxi: arrivato a ${door.name} (−${formatMoney(fare)}).`, 2600);
  }

  phoneCall(id, tab) {
    const st = this.state;
    switch (id) {
      case 'mom': {
        let txt = 'Ciao tesoro! Mangi abbastanza? Ricordati di andare a messa e di essere sempre onesto. Ti voglio bene.';
        if (st.daily.momCall !== this.day) {
          st.daily.momCall = this.day;
          st.changeAura(1, 'Hai chiamato tua madre (4° comandamento: onora il padre e la madre)');
          txt += ' (+1 Aura)';
        }
        tab.call('👩', 'Mamma', txt);
        break;
      }
      case 'dealer':
        this.closeTabMenu();
        this.dialogs.dealer(true);
        break;
      case 'bank':
        tab.call('🏦', 'Banca', st.bank.account
          ? `Il saldo del tuo conto è ${formatMoney(st.bank.balance)}. Per prelievi usa un bancomat o lo sportello.`
          : 'Non risulta un conto a tuo nome. Passa in filiale per aprirlo e ritirare la carta.');
        break;
      case 'taxi':
        tab.phoneScreen = 'taxi';
        tab.render();
        break;
      case 'pizza':
        if (st.pay(12)) {
          this.deliveries.push({ t: 20, item: 'pizza_trancio', qty: 4, text: 'Il fattorino ti consegna la pizza: 4 tranci nell\'inventario.' });
          tab.call('🍕', 'Pizzeria Vesuvio', 'Ordine ricevuto: una margherita intera ($12). Arriva tra 20 secondi ovunque tu sia!');
        } else tab.call('🍕', 'Pizzeria Vesuvio', 'Servono $12 in contanti per la consegna.');
        break;
      case 'police':
        tab.call('🚓', 'Polizia 112', 'Centrale operativa: «Nessuna emergenza in corso nella tua zona. Grazie per la segnalazione.»');
        break;
      case 'ambulance':
        tab.call('🚑', 'Ambulanza 118', st.health < st.maxHealth * 0.5
          ? 'Se ti senti male raggiungi l\'Ospedale (H sulla mappa) o usa un medicinale dall\'inventario.'
          : 'I tuoi parametri sembrano buoni. In caso di bisogno vai in Farmacia o all\'Ospedale.');
        break;
      default: break;
    }
  }

  /* =====================================================================
     Ristorante, sonno, prigione, svenimento
     ===================================================================== */
  sitAt(seat) {
    this.player.setPhysicsEnabled(false);
    const p = seat.seat.clone();
    p.y = seat.seat.y + 0.02 - this.player.mesh.userData.hipHeight;
    this.player.setPose('sit', p, seat.facing);
  }

  standUp() {
    const pos = this.player.posePosition ? this.player.posePosition.clone() : this.player.feet;
    const f = this.player.facing;
    this.player.setPose('auto');
    this.player.setPhysicsEnabled(true);
    this.player.setPosition(pos.x - Math.sin(f) * 0.8, 0.05, pos.z - Math.cos(f) * 0.8, f + Math.PI);
  }

  async showCaption(kicker, title, sub, ms) {
    $('bc-kicker').textContent = kicker;
    $('bc-title').textContent = title;
    $('bc-sub').textContent = sub || '';
    $('big-caption').classList.remove('hidden');
    await new Promise((r) => setTimeout(r, ms));
    $('big-caption').classList.add('hidden');
  }

  async sleep(data) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.setPhysicsEnabled(false);
    this.player.setPose('lie', data.lie, data.facing);
    await new Promise((r) => setTimeout(r, 900));
    await fadeTo(1, 1.2, '#000');
    if (this.disposed) return;
    const slept = this.hour < SLEEP_WAKE_HOUR ? SLEEP_WAKE_HOUR - this.hour : 24 - this.hour + SLEEP_WAKE_HOUR;
    if (this.hour >= SLEEP_WAKE_HOUR) this.newDay();
    this.hour = SLEEP_WAKE_HOUR;
    const st = this.state;
    st.heal(st.maxHealth);
    st.stamina = st.maxStamina;
    st.exhausted = false;
    st.stats.nightsSlept++;
    await this.showCaption('Buonanotte', `Giorno ${this.day} · ore 07:00`, `Hai dormito ${Math.round(slept)} ore. Salute e stamina al massimo.`, 2200);
    this.player.setPose('auto');
    this.player.setPhysicsEnabled(true);
    const it = this.interior ? this.interior.interactables.find((i) => i.action === 'sleep') : null;
    if (it) this.player.setPosition(it.x, 0.02, it.z, data.facing);
    this.autosaver.saveNow();
    await fadeTo(0, 1.0);
    this.transitioning = false;
  }

  /** Esce subito dall'interno corrente (senza dissolvenza), lasciando il giocatore davanti alla porta. */
  leaveInteriorImmediate() {
    if (!this.interior) return;
    const door = this.currentDoor;
    if (this.restaurant) { this.restaurant.dispose(); this.restaurant = null; }
    if (this.player.pose !== 'auto') { this.player.setPose('auto'); this.player.setPhysicsEnabled(true); }
    this.interior.dispose();
    this.interior = null;
    this.currentDoor = null;
    this.setOutdoorVisible(true);
    this.dayCycle.indoor = false;
    this.rig.collidables = this.world.collidables;
    this.rig.maxDist = 10;
    const spot = this.world.doorExitSpot(door);
    this.player.setPosition(spot.x, 0.2, spot.z, spot.facing);
  }

  async arrest(reason) {
    if (this.transitioning || this.disposed) return;
    this.transitioning = true;
    if (this.dialogs.isOpen) this.dialogs.close();
    await fadeTo(1, 1.0, '#000');
    if (this.disposed) return;
    const st = this.state;
    st.stats.arrests++;
    this.leaveInteriorImmediate();
    const station = this.world.doors.find((d) => d.type === 'police');
    if (station) {
      const spot = this.world.doorExitSpot(station);
      this.player.setPosition(spot.x, 0.25, spot.z, spot.facing);
      this.rig.yaw = spot.facing;
    }
    this.newDay();
    this.hour = 8;
    st.stamina = st.maxStamina;
    await this.showCaption('Stazione di Polizia', 'Una notte in prigione', `${reason} Alle 8:00 gli agenti ti rilasciano davanti alla centrale.`, 3200);
    this.autosaver.saveNow();
    await fadeTo(0, 1.0);
    this.transitioning = false;
  }

  async faint() {
    if (this.transitioning) return;
    this.transitioning = true;
    if (this.driving) this.exitVehicle();
    await fadeTo(1, 1.2, '#000');
    if (this.disposed) return;
    this.leaveInteriorImmediate();
    const st = this.state;
    const bill = Math.min(st.cash, 250);
    st.cash -= bill;
    st.health = st.maxHealth * 0.6;
    st.stamina = st.maxStamina;
    const hosp = this.world.doors.find((d) => d.type === 'hospital');
    if (hosp) {
      const spot = this.world.doorExitSpot(hosp);
      this.player.setPosition(spot.x, 0.25, spot.z, spot.facing);
      this.rig.yaw = spot.facing;
    }
    this.hour = Math.min(23.5, this.hour + 6);
    await this.showCaption('Ospedale', 'Sei svenuto', `Ti hanno soccorso e curato. Spese mediche: ${formatMoney(bill)}.`, 2800);
    await fadeTo(0, 1.0);
    this.transitioning = false;
  }

  /* =====================================================================
     Edifici
     ===================================================================== */
  setOutdoorVisible(v) {
    this.world.setVisible(v);
    this.npcs.setVisible(v);
    for (const veh of this.vehicles.list) veh.mesh.visible = v;
  }

  async enterBuilding(door) {
    if (this.transitioning || this.interior || this.driving) return;
    this.transitioning = true;
    this.hud.hidePrompt();
    await fadeTo(1, 0.35, '#000');
    if (this.disposed) return;
    try {
      this.interior = new Interior({
        scene: this.scene,
        physics: this.physics,
        staticMaterial: this.world.staticMaterial,
        door,
        ctx: { familyId: this.family.id, city: this.city, seed: this.seed },
      });
    } catch (e) {
      console.error('[Game] impossibile costruire l\'interno', e);
      this.interior = null;
      this.transitioning = false;
      await fadeTo(0, 0.3);
      this.toast('Questo edificio è chiuso.');
      return;
    }
    this.currentDoor = door;
    if (door.type === 'restaurant' || door.type === 'pizzeria') this.restaurant = new RestaurantService(this, this.interior, door.type);
    this.setOutdoorVisible(false);
    this.dayCycle.indoor = true;
    const sp = this.interior.spawn;
    this.player.setPosition(sp.x, 0, sp.z, sp.facing);
    this.rig.collidables = this.interior.collidables;
    this.rig.maxDist = 4;
    this.rig.yaw = 0; // camera alle spalle del giocatore, verso l'ingresso
    this.rig.pitch = 0.3;
    this.rig.targetDist = this.rig.dist = 3.2;
    this.dayCycle.update(this.hour, this.player.feet);
    this.renderer.compile(this.scene, this.camera);
    await fadeTo(0, 0.45);
    this.transitioning = false;
    this.toast(door.name, 1600);
  }

  async exitBuilding() {
    if (this.transitioning || !this.interior) return;
    if (this.restaurant && this.restaurant.blocksExit) {
      this.toast(this.restaurant.state === 'police' || this.restaurant.state === 'arrest'
        ? 'La polizia ti blocca l\'uscita!'
        : 'Prima di uscire devi finire e pagare il conto.', 2400);
      return;
    }
    this.transitioning = true;
    this.hud.hidePrompt();
    await fadeTo(1, 0.35, '#000');
    if (this.disposed) return;
    const door = this.currentDoor;
    this.leaveInteriorImmediate();
    const spot = this.world.doorExitSpot(door);
    this.rig.yaw = spot.facing; // camera sul marciapiede che guarda il personaggio e l'ingresso
    this.rig.pitch = 0.15;
    this.rig.targetDist = this.rig.dist = 4.6;
    this.dayCycle.update(this.hour, this.player.feet);
    this.renderer.compile(this.scene, this.camera);
    await fadeTo(0, 0.45);
    this.transitioning = false;
  }

  /* =====================================================================
     Info per menu e HUD
     ===================================================================== */
  mapPosition() {
    if (this.interior && this.currentDoor) return { x: this.currentDoor.x, z: this.currentDoor.z };
    if (this.driving) return { x: this.driving.body.position.x, z: this.driving.body.position.z };
    const f = this.player.feet;
    return { x: f.x, z: f.z };
  }

  currentPlaceName() {
    if (this.interior && this.currentDoor) return this.currentDoor.name;
    const p = this.mapPosition();
    return this.world.getDistrictAt(p.x, p.z).name;
  }

  homeDistrictName() {
    const h = this.world.mapData.home;
    return h ? this.world.getDistrictAt(h.x, h.z).name : '—';
  }

  clockText() {
    const hh = Math.floor(this.hour);
    const mm = Math.floor((this.hour - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    if (this.disposed) return;
    this.autosaver.saveNow();
    this.disposed = true;
    this.unbindEvents();
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.detach();
    this.dialogs.dispose();
    this.escMenu.close();
    this.tabMenu.close();
    this.hud.hide();
    this.el.ctp.classList.add('hidden');
    $('big-caption').classList.add('hidden');
    if (this.restaurant) { this.restaurant.dispose(); this.restaurant = null; }
    if (this.interior) { this.interior.dispose(); this.interior = null; }
    this.vehicles.dispose();
    this.npcs.dispose();
    this.player.dispose();
    disposeObject3D(this.player.mesh);
    disposeObject3D(this.world.root);
    disposeObject3D(this.world.sky);
    this.world.dispose();
    this.dayCycle.dispose();
    disposeObject3D(this.scene);
    this.scene.clear();
  }
}
