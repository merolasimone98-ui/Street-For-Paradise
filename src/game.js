// Gameplay open-world: mondo, giocatore, veicoli, NPC, interni, negozi, salute/stamina, Aura, audio,
// mappa ESC (senza pausa) con pulsante PAUSA, inventario/telefono TAB, prima persona, Paradiso e salvataggi.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityWorld, DayCycle } from './world.js';
import { Player, CameraRig } from './player.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AutoSaver } from './save.js';
import { getCity, getFamily, formatMoney, seededRandom } from './birthdata.js';
import { Interior } from './interiors.js';
import { PlayerState, GROUPS } from './playerstate.js';
import { ITEMS, itemInfo } from './items.js';
import { VehicleManager, KIND_LABEL } from './vehicle.js';
import { NpcManager, pickHomelessSpots } from './npcs.js';
import { RestaurantService } from './restaurant.js';
import { Dialogs } from './dialogs.js';
import { EscMenu, TabMenu } from './menus.js';
import { Paradise } from './paradise.js';
import { loadSettings, onSettingsChange, pixelRatioFor } from './settings.js';
import { audio } from './audio.js';
import { $, toast, fadeTo, disposeObject3D } from './ui.js';
import { Conversation } from './conversation.js';
import { DrunkEffect } from './drunk.js';
import { gameDate, dayInfo, formatDate } from './calendar.js';
import { rewardFor, levelTitle, PARADISE_LEVEL, PARADISE_PREVIEW_LEVEL, MAX_AURA_LEVEL } from './aura.js';
import { PoliceManager } from './police.js';
import { Workshop } from './workshop.js';
import { VEHICLE_MODELS } from './items.js';

const LOOT_ITEMS = ['torcia', 'coperta', 'kit_pronto_soccorso', 'candela'];

// 1 giorno di gioco = 1 ora reale: 1440 minuti di gioco in 3600 secondi reali.
const GAME_MINUTES_PER_SECOND = 1440 / 3600;
const AUTOSAVE_SECONDS = 30;
const INTERACT_RADIUS = 2.5;
const SLEEP_WAKE_HOUR = 7;
const PEDESTRIANS = 40;
const DRUNK_FAINT = 50; // oltre il 50% di ubriachezza si sviene
const DRUNK_DECAY = 0.12; // punti di ubriachezza smaltiti al secondo
const DRINK_SIPS = 3;
const SIP_TIME = 1.6;
const CHURCH_TYPES = ['church', 'cathedral', 'chapel'];

const SURFACE_BY_DOOR = {
  home: 'wood', hospital: 'tile', market: 'tile', bank: 'marble', bar: 'wood', garage: 'asphalt', weapons: 'wood',
  clothing: 'wood', pharmacy: 'tile', restaurant: 'wood', pizzeria: 'tile', church: 'marble', police: 'tile',
  cathedral: 'marble', chapel: 'marble', house: 'wood', workshop: 'asphalt',
};

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
    this.paused = false;
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
    this.paradise = null;
    this.transitioning = false;
    this.driving = null;
    this.action = null;
    this.healOverTime = null;
    this.deliveries = [];
    this.elapsed = 0;
    this.mouseIdle = 0;
    this.openUis = new Set();
    this.stepPhase = 0;
    this.shotCooldown = 0;
    this.drinking = null;
    this.drunkView = 0;

    // Scena e fisica (la camera vede lontano: colline e montagne all'orizzonte)
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.08, 2600);
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
    this.npcs.spawnPedestrians(PEDESTRIANS);
    this.npcs.spawnHomeless(pickHomelessSpots(this.world, rng, 5));
    // Case già acquistate nei salvataggi: cartello VENDESI rimosso e nome aggiornato
    for (const door of this.world.houses) if (this.state.houses.includes(door.house.id)) this.markHouseOwned(door);

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
    this.convo = new Conversation(this);
    this.drunkFx = new DrunkEffect(renderer);
    this.police = new PoliceManager(this);
    this.workshop = null;
    this.buildShotFx();
    this.updateHeadlights(0); // crea subito i fari (niente ricompilazione degli shader durante il gioco)

    this.el = { ctp: $('click-to-play'), ctpTitle: $('ctp-title'), ctpSub: $('ctp-sub') };
    this.bindEvents();
    this.unsubSettings = onSettingsChange(() => this.applyAllSettings());
    this.applyAllSettings();
    this.dayCycle.update(this.hour, this.player.feet);
    this.rig.update(0.016, { dx: 0, dy: 0, wheel: 0 }, this.player.feet);
    this.player.animate(0);
    audio.playMusic(null);

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
        // Una finestra si è aperta mentre il lock era in arrivo: si rilascia subito il mouse.
        if (this.openUis.size) { document.exitPointerLock(); return; }
        this.el.ctp.classList.add('hidden');
        this.input.enabled = true;
      } else if (!this.disposed && !this.exiting && this.openUis.size === 0 && !this.transitioning) {
        // ESC durante il gioco: si apre la mappa a schermo intero (il gioco NON va in pausa).
        this.openMap();
      }
    };
    this._onLockError = () => {
      if (this.disposed || this.openUis.size) return;
      this.showClickToPlay('Clicca per riprendere', '');
    };
    this._onCtpClick = () => this.requestLock();
    this._onCanvasClick = () => { if (!this.locked && this.openUis.size === 0) this.requestLock(); };
    this._onVisibility = () => { if (document.visibilityState === 'hidden') this.autosaver.saveNow(); };
    this._onPageHide = () => this.autosaver.saveNow();
    this._onKey = (e) => {
      if (this.disposed) return;
      if (this.paradise) {
        if (e.code === 'Escape') { e.preventDefault(); if (this.paradise.mode === 'memory') this.paradise.backToHub(); }
        return;
      }
      // Con i menu aperti il mouse è libero: TAB/ESC chiudono il menu TAB, ESC chiude la mappa.
      if (this.tabMenu.isOpen && (e.code === 'Tab' || e.code === 'Escape')) {
        e.preventDefault();
        this.closeTabMenu();
      } else if (this.escMenu.isOpen && e.code === 'Escape' && !this.dialogs.isOpen && !document.querySelector('#modal:not(.hidden)')) {
        e.preventDefault();
        this.resume();
      } else if (e.code === 'Tab') {
        e.preventDefault();
      }
    };

    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    this.el.ctp.addEventListener('click', this._onCtpClick);
    this.canvas.addEventListener('click', this._onCanvasClick);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('pagehide', this._onPageHide);
    window.addEventListener('beforeunload', this._onPageHide);
    window.addEventListener('keydown', this._onKey);
  }

  unbindEvents() {
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    this.el.ctp.removeEventListener('click', this._onCtpClick);
    this.canvas.removeEventListener('click', this._onCanvasClick);
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

  /** Una finestra/menu ha bisogno del cursore: si rilascia il Pointer Lock (il mondo continua a vivere). */
  openUi(kind) {
    this.openUis.add(kind);
    this.input.enabled = false;
    this.input.reset();
    this.el.ctp.classList.add('hidden');
    this.hud.hidePrompt();
    audio.chainsaw(false);
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /**
   * Chiude una finestra. Il Pointer Lock viene richiesto SUBITO (dentro il gesto dell'utente, es. il clic su "Acquista"),
   * così il controllo torna immediatamente al giocatore senza blocchi.
   */
  closeUi(kind) {
    this.openUis.delete(kind);
    if (this.openUis.size === 0) {
      this.input.enabled = true;
      if (!this.locked && !this.disposed) {
        this.showClickToPlay('Clicca per riprendere', '');
        this.requestLock();
      }
    }
  }

  setPaused(p) {
    this.paused = !!p;
  }

  openMap() {
    if (this.disposed || this.escMenu.isOpen || this.paradise) return;
    if (this.tabMenu.isOpen) { this.tabMenu.close(); this.openUis.delete('tab'); }
    this.openUi('esc');
    this.escMenu.open('map');
    audio.click();
  }

  resume() {
    if (this.disposed) return;
    this.escMenu.close();
    this.setPaused(false);
    this.closeUi('esc');
  }

  openTabMenu() {
    if (this.tabMenu.isOpen || this.paradise) return;
    this.openUi('tab');
    this.tabMenu.open();
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
    if (ok) audio.confirm();
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
     Impostazioni (sincronizzate con menu principale e pausa)
     ===================================================================== */
  applyAllSettings() {
    const s = this.settings = loadSettings();
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
    if (this.paradise) {
      this.paradise.update(dt);
      return;
    }
    const running = !this.paused;
    const control = this.locked && this.openUis.size === 0;

    if (running) {
      this.playTime += dt;
      this.advanceTime(dt);
      this.updateTimers(dt);
      if (this.driving) this.updateDriving(dt, control);
      else {
        this.updateOnFoot(dt, control);
        // Anche a piedi i veicoli vanno aggiornati: si fermano e diventano statici (non scivolano se li urti)
        this.vehicles.update(dt, null, null);
      }
      this.physics.step(1 / 60, dt, 5);
      if (!this.driving && this.player.bodyInWorld && this.player.body.position.y < -20) {
        const sp = this.world.getSpawn();
        this.player.setPosition(sp.x, 0.2, sp.z, 0);
      }
      this.autosaver.update(dt);
      this.updateDrunk(dt);
      this.updateLevelUps();
      this.checkHealth();
    }
    if (control && running) {
      if (this.input.consumePressed('KeyC')) this.hud.toggleCard();
      if (this.convo.isOpen) {
        this.hud.hidePrompt();
        this.convo.update(dt, this.input);
      } else {
        if (this.input.consumePressed('Tab') && !this.drinking) this.openTabMenu();
        this.updateInteraction();
      }
      this.updateEquipment(dt);
    } else {
      if (this.convo.isOpen && !this.paused) this.convo.close();
      this.hud.hidePrompt();
      audio.chainsaw(false);
    }
    // Recupero: se il mouse non è catturato e nessun menu è aperto, l'invito a cliccare deve essere sempre visibile.
    if (!this.locked && this.openUis.size === 0 && !this.transitioning && this.el.ctp.classList.contains('hidden')) {
      this.showClickToPlay('Clicca per riprendere', '');
    }
    const mouse = control ? this.input.consumeMouse() : { dx: 0, dy: 0, wheel: 0 };
    if (!control) this.input.consumeMouse();
    this.input.endFrame();

    this.elapsed += dt;
    this.world.update(this.elapsed);
    if (this.interior) this.interior.update(dt);
    if (this.restaurant && running) this.restaurant.update(dt);
    if (!this.interior && running) this.npcs.update(dt, this.player.feet);
    if (this.workshop && running) this.workshop.update(dt);
    if (running) this.police.update(dt);
    this.vehicles.sync(dt);
    this.police.sync(dt);
    if (running && !this.interior) this.vehicles.updateSmoke(dt, this.mapPosition(), this.police.cars);
    this.updateShotFx(dt);
    if (this.driving) this.placeRider();
    this.player.animate(running ? dt : 0);
    this.escMenu.update(dt);

    // Camera (terza o prima persona)
    let focus = this.player.feet;
    this.rig.allowFirstPerson = !this.driving && this.player.pose === 'auto';
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
    const eye = 1.7 * this.player.mesh.userData.scale;
    this.rig.aim = !!this.player.aiming;
    this.rig.update(dt, mouse, focus, eye);
    // Zoom della mira
    const fov = this.settings.fov * (1 - 0.3 * (this.rig.aimBlend || 0));
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    // Da ubriachi la visuale ondeggia (rollio e beccheggio)
    const dk = this.drunkView;
    if (dk > 0.01) {
      this.camera.rotateZ(Math.sin(this.elapsed * 0.9) * 0.06 * dk);
      this.camera.rotateX(Math.sin(this.elapsed * 0.7 + 1) * 0.025 * dk);
    }
    const fp = this.rig.fpBlend > 0.5;
    this.player.mesh.userData.head.visible = !fp;
    if (fp && this.player.pose === 'auto') this.player.facing = this.rig.yaw + Math.PI;
    const light = this.dayCycle.update(this.hour, focus);
    this.renderer.toneMappingExposure += (this.dayCycle.exposure - this.renderer.toneMappingExposure) * Math.min(1, dt * 2);
    this.updateHeadlights(light.night);
    this.updateAmbience(dt);

    const mapPos = this.mapPosition();
    const today = this.today();
    this.hud.update(dt, {
      money: this.state.cash, age: this.age, day: this.day, hour: this.hour,
      date: formatDate(today), redDay: dayInfo(today).red,
      district: this.currentPlaceName(), x: mapPos.x, z: mapPos.z,
      facing: this.driving ? this.driving.heading : this.player.facing, camYaw: this.rig.yaw,
      health: this.state.health, maxHealth: this.state.maxHealth, stamina: this.state.stamina, maxStamina: this.state.maxStamina,
      exhausted: this.state.exhausted, aura: this.state.aura, auraLevel: this.state.auraLevel,
      drunk: this.state.drunk, vehicle: this.driving,
      stars: this.police.stars, starsBlink: this.police.blinking, police: this.interior ? [] : this.police.dots(),
      crosshair: !!this.player.aiming && ((this.rig.aimBlend || 0) > 0.5 || this.rig.fpBlend > 0.5),
      vehicleHealth: this.driving ? this.driving.health : null,
    });
  }

  /** Data del calendario corrispondente al giorno di gioco corrente. */
  today() {
    if (this._todayDay !== this.day) {
      this._todayDay = this.day;
      this._today = gameDate(this.character, this.day);
    }
    return this._today;
  }

  updateOnFoot(dt, control) {
    const st = this.state;
    const blocked = !control || !!this.action || !!this.drinking || this.convo.isOpen || this.player.pose !== 'auto' || !!this.player.workState;
    const canRun = !st.exhausted && st.stamina > 1 && st.drunk < 35 && !this.player.aiming;
    const noInput = { down: () => false, consumePressed: () => false };
    const wasGrounded = this.player.grounded;
    // Da ubriachi si cammina storti: la direzione oscilla
    const sway = st.drunk > 8 ? Math.sin(this.elapsed * 1.3) * Math.min(0.55, st.drunk / 80) : 0;
    const running = this.player.update(dt, blocked ? noInput : this.input, this.rig.yaw + sway, blocked ? false : canRun);
    if (wasGrounded && !this.player.grounded && this.player.body.velocity.y > 2) audio.jump();
    if (running) {
      const drain = 16 * (1.25 - this.character.stats.resistenza / 200);
      st.stamina = Math.max(0, st.stamina - drain * dt);
      if (st.stamina <= 0) st.exhausted = true;
    } else {
      st.restoreStamina((this.player.speed > 0.3 ? 9 : 18) * dt);
      if (st.exhausted && st.stamina >= 30) st.exhausted = false;
    }
    // Passi sincronizzati con la camminata (due appoggi per ciclo)
    if (this.player.grounded && this.player.speed > 0.6 && this.player.pose === 'auto') {
      const ph = this.player.animator.phase;
      const step = Math.floor(ph / Math.PI);
      if (step !== this.stepPhase) {
        this.stepPhase = step;
        audio.footstep(this.surfaceUnderfoot(), running);
      }
    }
  }

  surfaceUnderfoot() {
    if (this.interior && this.currentDoor) return SURFACE_BY_DOOR[this.currentDoor.type] || 'tile';
    const f = this.player.feet;
    return f.y > 0.12 ? 'sidewalk' : 'asphalt';
  }

  updateDriving(dt, control) {
    const v = this.driving;
    const ctl = control ? {
      throttle: this.input.down('KeyW', 'ArrowUp'),
      brake: this.input.down('KeyS', 'ArrowDown'),
      steer: (this.input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.input.down('KeyD', 'ArrowRight') ? 1 : 0),
      handbrake: this.input.down('Space'),
      wheelie: this.input.down('ShiftLeft', 'ShiftRight'),
    } : { throttle: false, brake: true, steer: 0, handbrake: false, wheelie: false };
    const wasBroken = v.broken;
    this.vehicles.update(dt, v, ctl);
    audio.engineUpdate(v.uid, v.broken ? 0 : v.speed, v.spec.maxSpeed, ctl.throttle && !v.broken);
    if (v.impact > 0) {
      const dmg = (v.impact - 6) * (v.spec.ride ? 5 : 2.5);
      audio.crash(v.impact / 10);
      if (dmg > 1) {
        this.state.damage(dmg);
        audio.hurt();
        this.toast(`Incidente! −${Math.round(dmg)} salute · veicolo al ${Math.round(v.health)}%`, 1800);
      }
    }
    if (v.broken && !wasBroken) {
      audio.engineDie();
      audio.engineStop(v.uid);
      this.toast(`${v.name} è in panne! Fallo riparare dal meccanico dell'Officina (O sulla mappa): lo sistema ovunque sia.`, 4200);
    }
    this.state.restoreStamina(12 * dt);
    if (this.state.exhausted && this.state.stamina >= 30) this.state.exhausted = false;
  }

  /** Armi/attrezzi impugnati: pistola (clic = sparo), motosega (tenere premuto). */
  updateEquipment(dt) {
    this.shotCooldown -= dt;
    const eq = this.state.equipped;
    const kind = eq && ITEMS[eq] ? ITEMS[eq].hold : null;
    const sawing = !!(this.action && this.action.chainsaw);
    if (this.driving || this.player.pose !== 'auto' || this.player.phone || this.player.workState || this.drinking) {
      this.player.aiming = false;
      audio.chainsaw(sawing);
      return;
    }
    // Pistola: tasto destro = mira sulla spalla con puntino al centro, sinistro = sparo
    this.player.aiming = kind === 'pistol' && this.input.rightDown && !this.action;
    if (this.player.aiming) this.player.facing = this.rig.yaw + Math.PI;
    if (kind === 'pistol' && this.input.consumePressed('Mouse0') && this.shotCooldown <= 0 && !this.action) {
      this.shotCooldown = 0.35;
      this.fireShot(this.player.aiming);
    }
    audio.chainsaw(sawing || (kind === 'chainsaw' && this.input.mouseDown));
  }

  /* =====================================================================
     Pistola: proiettile (raycast dal centro dello schermo), traccia, scintille, conseguenze
     ===================================================================== */
  /** Fari del veicolo guidato: SpotLight reale di notte (sempre in scena, intensità 0 di giorno). */
  updateHeadlights(night) {
    if (!this.headlight) {
      this.headlight = new THREE.SpotLight(0xfff1d6, 0, 60, 0.5, 0.45, 1.6);
      this.headlight.position.set(0, -500, 0);
      this.scene.add(this.headlight, this.headlight.target);
    }
    const v = this.driving;
    const on = v && !this.interior && night > 0.3 && !v.broken;
    if (!on) { this.headlight.intensity = 0; return; }
    const h = v.heading;
    const p = v.body.interpolatedPosition;
    const front = v.spec.ride ? 0.6 : v.spec.len / 2;
    this.headlight.position.set(p.x + Math.sin(h) * front, p.y + 0.8, p.z + Math.cos(h) * front);
    this.headlight.target.position.set(p.x + Math.sin(h) * (front + 18), p.y - 0.5, p.z + Math.cos(h) * (front + 18));
    this.headlight.target.updateMatrixWorld();
    this.headlight.intensity = (v.spec.ride ? 160 : 260) * Math.min(1, (night - 0.3) * 3);
  }

  buildShotFx() {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    this.tracer.frustumCulled = false;
    this.flash = new THREE.PointLight(0xffc870, 0, 8, 2);
    this.spark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    this.scene.add(this.tracer, this.flash, this.spark);
    this.shotT = 0;
    this.shooter = new THREE.Raycaster();
    this.shooter.far = 140;
  }

  updateShotFx(dt) {
    if (this.shotT <= 0) return;
    this.shotT -= dt;
    const k = Math.max(0, this.shotT / 0.12);
    this.tracer.material.opacity = k;
    this.spark.material.opacity = k;
    this.spark.scale.setScalar(1 + (1 - k) * 2);
    this.flash.intensity = k * 6;
  }

  fireShot(aimed) {
    const st = this.state;
    st.stats.shots++;
    audio.gunshot();
    const hand = new THREE.Vector3();
    this.player.mesh.userData.holdR.getWorldPosition(hand);
    // Dal centro dello schermo (con un po' di dispersione se non si mira)
    const spread = aimed ? 0.004 : 0.05;
    this.shooter.setFromCamera(new THREE.Vector2((Math.random() - 0.5) * spread * 2, (Math.random() - 0.5) * spread * 2), this.camera);
    // Bersagli: passanti, barboni, veicoli, volanti e palazzi (escluso il giocatore)
    const targets = [];
    if (this.interior) targets.push(this.interior.group);
    else {
      for (const n of [...this.npcs.pedestrians, ...this.npcs.homeless]) if (n.mesh.visible) targets.push(n.mesh);
      for (const v of this.vehicles.list) targets.push(v.mesh);
      for (const c of this.police.cars) targets.push(c.mesh);
      targets.push(...this.world.collidables);
    }
    const hits = this.shooter.intersectObjects(targets, true).filter((h) => h.distance > 1.2);
    const hit = hits[0];
    const end = hit ? hit.point : this.shooter.ray.at(this.shooter.far, new THREE.Vector3());
    this.tracer.geometry.setFromPoints([hand, end]);
    this.flash.position.copy(hand);
    this.spark.position.copy(end);
    this.spark.visible = !!hit;
    this.shotT = 0.12;
    if (this.interior) {
      if (hit) audio.ricochet();
      st.changeAura(-1, 'Hai sparato dentro un locale');
      return;
    }
    let owner = hit ? hit.object : null;
    while (owner && !owner.userData.npc && !owner.userData.vehicle) owner = owner.parent;
    const npc = owner && owner.userData.npc;
    const veh = owner && owner.userData.vehicle;
    if (npc) {
      npc.knockDown(15);
      audio.hurt();
      audio.voice(npc.look && npc.look.sex === 'f', 4);
      st.changeAura(-8, `Hai sparato a ${npc.name} (5° comandamento: non uccidere)`);
      this.police.report(3, 'Hai ferito una persona');
    } else if (veh) {
      audio.ricochet();
      veh.applyDamage(7);
      if (veh.police) {
        st.changeAura(-4, 'Hai sparato a una volante della polizia');
        this.police.report(3, 'Hai sparato alla polizia');
      } else {
        if (veh.owner === 'npc') audio.carAlarm(3);
        st.changeAura(-1, 'Hai danneggiato un veicolo sparando');
        this.police.report(1, 'Colpi d\'arma da fuoco');
      }
    } else {
      if (hit) audio.ricochet();
      // Sparare in città spaventa e turba: piccola perdita di Aura (5° comandamento)
      st.changeAura(-0.5, 'Hai sparato in città, mettendo in pericolo le persone');
      const f = this.player.feet;
      if (this.npcs.pedestrians.some((p) => Math.hypot(p.pos.x - f.x, p.pos.z - f.z) < 45)) this.police.report(1, 'Colpi d\'arma da fuoco');
    }
  }

  /** Suoni d'ambiente: uccellini di giorno, città, brusio della folla. */
  updateAmbience(dt) {
    const outdoors = !this.interior;
    const day = this.hour > 6 && this.hour < 19.5;
    audio.birds(dt, outdoors && day && !this.driving);
    audio.setCity(outdoors ? 0.8 : 0.15);
    let crowd = 0;
    if (outdoors) {
      const f = this.player.feet;
      let n = 0;
      for (const p of this.npcs.pedestrians) if (Math.abs(p.pos.x - f.x) < 18 && Math.abs(p.pos.z - f.z) < 18) n++;
      crowd = Math.min(1, n / 4);
    } else if (this.currentDoor && ['restaurant', 'pizzeria', 'bar', 'market', 'hospital'].includes(this.currentDoor.type)) {
      crowd = 0.8;
    }
    audio.setCrowd(crowd);
  }

  /** Posizione del pilota (sella o abitacolo) sincronizzata col veicolo. */
  placeRider() {
    const v = this.driving;
    if (v.spec.ride) {
      // Il pilota segue piega e impennata: la sella è calcolata nello spazio locale del mezzo
      v.mesh.updateMatrixWorld(true);
      const seat = v.mesh.localToWorld(new THREE.Vector3(0, v.spec.seatY - this.player.mesh.userData.hipHeight, v.spec.seatZ));
      this.player.rideQuat = v.mesh.quaternion;
      this.player.rideLean = v.lean;
      this.player.setPose('ride', seat, v.heading);
    } else {
      const p = v.position;
      this.player.setPose('hidden', new THREE.Vector3(p.x, p.y, p.z), v.heading);
    }
  }

  updateTimers(dt) {
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
    for (const d of this.deliveries) {
      d.t -= dt;
      if (d.t <= 0) {
        this.state.addItem(d.item, d.qty);
        audio.phoneNotify();
        this.toast(d.text, 3200);
      }
    }
    this.deliveries = this.deliveries.filter((d) => d.t > 0);
    if (this.drinking) this.updateDrinking(dt);
  }

  /* =====================================================================
     Bar: bevande consumate al bancone e ubriachezza
     ===================================================================== */
  startDrink(drink) {
    if (this.drinking || this.transitioning) return;
    this.rig.firstPerson = false;
    this.player.phone = false;
    this.player.setHeld('glass:' + drink.color);
    this.player.drinkT = 0;
    this.drinking = { drink, t: 0, dur: DRINK_SIPS * SIP_TIME, sip: -1 };
    this.toast(`Il barista ti serve: ${drink.name}`, 1800);
  }

  updateDrinking(dt) {
    const d = this.drinking;
    d.t += dt;
    const sip = Math.floor(d.t / SIP_TIME);
    this.player.drinkT = (d.t % SIP_TIME) / SIP_TIME;
    if (sip !== d.sip && sip < DRINK_SIPS) {
      d.sip = sip;
      setTimeout(() => { if (!this.disposed) audio.drink(); }, SIP_TIME * 450);
      // Il liquido nel bicchiere cala a ogni sorso
      const glass = this.player.mesh.userData.holdR.children[0];
      const liquid = glass && glass.getObjectByName('liquid');
      if (liquid) liquid.scale.y = Math.max(0.15, 1 - sip / DRINK_SIPS);
    }
    this.hud.setProgress(Math.min(1, d.t / d.dur), `Bevi: ${d.drink.name}`);
    if (d.t >= d.dur) this.finishDrink();
  }

  finishDrink() {
    const d = this.drinking.drink;
    const st = this.state;
    this.drinking = null;
    this.player.drinkT = null;
    this.hud.setProgress(null);
    this.player.updateHeld(st.equipped);
    if (d.stamina) st.restoreStamina(d.stamina);
    if (d.heal) st.heal(d.heal);
    if (d.alcohol) {
      st.drunk = Math.min(100, st.drunk + d.alcohol);
      if (st.drunk > DRUNK_FAINT) { this.faint('drunk'); return; }
      this.toast(st.drunk > 35
        ? `Ubriachezza ${Math.round(st.drunk)}%: la testa gira forte… oltre il ${DRUNK_FAINT}% svieni!`
        : `${d.name}: ubriachezza ${Math.round(st.drunk)}%.`, 2600);
    } else {
      this.toast(`${d.name}: rinfrescante!${d.stamina ? ` (+${d.stamina} stamina)` : ''}`, 2000);
    }
  }

  updateDrunk(dt) {
    const st = this.state;
    if (st.drunk > 0 && !this.drinking) st.drunk = Math.max(0, st.drunk - DRUNK_DECAY * dt);
    const target = Math.min(1, Math.max(0, (st.drunk - 4) / 40));
    this.drunkView += (target - this.drunkView) * Math.min(1, dt * 1.5);
  }

  /* =====================================================================
     Livelli Aura e ricompense (app "Livelli" del telefono)
     ===================================================================== */
  updateLevelUps() {
    const st = this.state;
    if (!st.levelUps.length || this.transitioning) return;
    const lvl = st.levelUps.shift();
    audio.confirm();
    this.hud.flashLevel(lvl);
    this.toast(`✨ LIVELLO AURA ${lvl}${lvl >= MAX_AURA_LEVEL ? ' (MASSIMO)' : ''} · ${levelTitle(lvl)} — riscatta la ricompensa nell'app «Livelli» del telefono (TAB).`, 5000);
    this.autosaver.saveNow();
  }

  /** Ricompense non ancora riscattate (fino al livello attuale). */
  pendingRewards() {
    const st = this.state;
    const list = [];
    for (let l = 1; l <= st.auraLevel; l++) if (!st.rewardsClaimed.includes(l)) list.push(rewardFor(l));
    return list;
  }

  claimReward(level) {
    const st = this.state;
    if (level > st.auraLevel || st.rewardsClaimed.includes(level)) return 'Ricompensa non disponibile.';
    const r = rewardFor(level);
    st.rewardsClaimed.push(level);
    const got = [];
    if (r.money) { st.cash += r.money; got.push(formatMoney(r.money)); }
    if (r.items) for (const [id, qty] of r.items) { st.addItem(id, qty); got.push(`${itemInfo(id).name}${qty > 1 ? ` x${qty}` : ''}`); }
    if (r.vehicle) {
      const model = r.vehicle;
      setTimeout(() => { if (!this.disposed) this.onPurchaseVehicle(model, null, true); }, 300);
      got.push('veicolo consegnato vicino a te');
    }
    audio.cash();
    this.autosaver.saveNow();
    if (r.paradise) {
      this.closeTabMenu();
      setTimeout(() => { if (!this.disposed) this.enterParadise(); }, 400);
      return 'Il cielo si apre…';
    }
    return `Riscattato livello ${level}: ${got.join(', ')}.`;
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
    this.checkChurchAbsence();
    // I bancomat rapinati vengono riparati il giorno dopo
    for (const a of this.world.atms) {
      if (a.robbedDay >= 0 && a.robbedDay < this.day) {
        a.robbedDay = -1;
        a.screen.visible = true;
        a.group.rotation.z = 0;
      }
    }
    const info = dayInfo(this.today());
    if (info.feast) setTimeout(() => { if (!this.disposed) this.toast(`Oggi è ${info.feast}: vai a Messa per +5 Aura extra!`, 4200); }, 3800);
  }

  /** Dopo 7 giorni senza andare in chiesa: −5 Aura, poi −2 per ogni giorno in più. */
  checkChurchAbsence() {
    const st = this.state;
    const since = this.day - st.lastChurchDay;
    if (since < 7 || st.lastChurchPenaltyDay === this.day) return;
    st.lastChurchPenaltyDay = this.day;
    const loss = since === 7 ? 5 : 2;
    st.changeAura(-loss, `Non vai in chiesa da ${since} giorni`);
    this.toast(`Non vai in chiesa da ${since} giorni: −${loss} Aura. Una Messa ti farà bene.`, 4000);
  }

  /** Visita in chiesa: azzera il conteggio dei giorni di assenza. */
  markChurchVisit() {
    this.state.lastChurchDay = this.day;
  }

  onLand(impactSpeed) {
    if (impactSpeed > 4) audio.land(impactSpeed / 8);
    if (impactSpeed > 12) {
      const dmg = (impactSpeed - 12) * 7;
      this.state.damage(dmg);
      audio.hurt();
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
    if (this.transitioning || this.action || this.drinking) {
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
          const dist = Math.hypot(p.x - feet.x, p.z - feet.z);
          if (door.type === 'house') {
            const owned = this.state.houses.includes(door.house.id);
            consider(dist, owned ? `entrare · ${door.name}` : `vedere la ${door.house.kind} in vendita · ${formatMoney(door.house.price)}`, () => this.houseDoor(door));
          } else {
            consider(dist, `entrare · ${door.name}`, () => this.enterBuilding(door));
          }
        }
      }
      const saw = this.state.equipped === 'motosega';
      for (const a of this.world.atms) {
        const d = Math.hypot(feet.x - a.x, feet.z - a.z);
        if (d >= 1.4) continue;
        if (a.robbedDay === this.day) consider(d, 'guardare il bancomat distrutto', () => this.toast('Il bancomat è squarciato: lo ripareranno domani.', 2200));
        else if (saw) consider(d, 'tagliare il bancomat con la motosega (rapina)', () => this.robAtm(a));
        else consider(d, 'usare il bancomat', () => this.dialogs.atm());
      }
      const npc = this.npcs.nearest(feet.x, feet.z, 2.0);
      if (npc && npc.downT > 0) {
        consider(Math.hypot(feet.x - npc.pos.x, feet.z - npc.pos.z), `soccorrere ${npc.name}`, () => this.helpDowned(npc));
      } else if (npc) {
        const d = Math.hypot(feet.x - npc.pos.x, feet.z - npc.pos.z);
        if (npc.kind === 'homeless') consider(d, `aiutare ${npc.name}`, () => this.dialogs.donate(npc));
        else consider(d + 0.3, `parlare con ${npc.name}`, () => this.convo.open(npc));
      }
      const v = this.vehicles.nearest(feet.x, feet.z, 1.6);
      if (v) {
        if (!v.locked) {
          fLabel = `guidare ${v.name}`;
          fAction = () => this.mountVehicle(v);
        } else if (this.state.has('cacciavite')) {
          fLabel = `forzare ${v.name} e rubarlo (cacciavite)`;
          fAction = () => this.forceVehicle(v);
          // [E] scasso per saccheggiare l'abitacolo (solo auto, una volta per veicolo)
          if (!v.spec.ride && !v.looted) {
            const p = v.body.position;
            consider(Math.hypot(feet.x - p.x, feet.z - p.z), `scassinare la portiera e frugare dentro (cacciavite)`, () => this.lootVehicle(v));
          }
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
      case 'sleep':
        if (this.currentDoor && this.currentDoor.type === 'house' && !st.houses.includes(this.currentDoor.house.id)) {
          this.toast('Questa casa non è tua: comprala per poterci dormire.', 2600);
          break;
        }
        this.sleep(it.data);
        break;
      case 'bar': this.dialogs.barMenu((drink) => this.startDrink(drink)); break;
      case 'sellcar': this.dialogs.sellVehicle(); break;
      case 'mechanic':
        if (this.workshop && this.workshop.onShift) {
          this.toast('Meccanico: «Siamo colleghi oggi! Se ti serve una mano chiedi pure quando arriva un cliente.»', 3200);
          audio.voice(false, 10);
        } else this.dialogs.repairShop();
        break;
      case 'workjob': if (this.workshop) this.workshop.manager(); break;
      case 'workpc': if (this.workshop) this.workshop.computer(); break;
      case 'ws': if (this.workshop) this.workshop.interact(it); break;
      case 'calendar': this.dialogs.calendar(this.today()); break;
      case 'mass': this.attendMass(); break;
      case 'confess': this.confess(); break;
      case 'hospital': {
        if (st.health >= st.maxHealth - 0.5) { this.toast('Il medico ti visita: sei in perfetta salute!'); break; }
        if (st.payWith(150, 'cash') || st.payWith(150, 'card')) {
          st.heal(st.maxHealth);
          audio.cash();
          this.toast('Cure completate: salute al massimo (−€ 150).');
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
          audio.confirm();
          this.toast('Preghi in silenzio per mamma e papà. Senti una grande pace. (+2 Aura)', 3000);
        } else {
          this.toast('Resti qualche minuto in raccoglimento.');
        }
        break;
      case 'candle':
        if (!st.pay(2)) { this.toast('Ti servono € 2 per l\'offerta.'); break; }
        if (st.daily.candle !== this.day) {
          st.daily.candle = this.day;
          st.changeAura(1, 'Hai acceso una candela e fatto un\'offerta');
          this.toast('Accendi una candela per i tuoi genitori. (+1 Aura)');
        } else this.toast('Accendi un\'altra candela.');
        break;
      case 'paradise':
        if (st.auraLevel >= PARADISE_LEVEL) this.enterParadise();
        else if (st.auraLevel >= PARADISE_PREVIEW_LEVEL) this.paradisePreview();
        else this.toast(`La luce è ancora lontana: serve il Livello Aura ${PARADISE_PREVIEW_LEVEL} per intravederla e il ${PARADISE_LEVEL} per entrare (ora livello ${st.auraLevel}).`, 3800);
        break;
      case 'police':
        this.dialogs.message('Stazione di Polizia', st.aura < 30
          ? 'Agente: «Ti teniamo d\'occhio. Rigare dritto conviene a tutti.»'
          : st.stats.arrests > 0
            ? `Agente: «Spero che la notte in cella ti sia servita da lezione. Arresti finora: ${st.stats.arrests}.»`
            : 'Agente: «Buongiorno! Se ti serve aiuto, chiama il 112 dal telefono.»');
        audio.voice(false, 10);
        break;
      default: break;
    }
  }

  /* ---------- Chiesa: Messa, confessione, anteprima del Paradiso ---------- */
  attendMass() {
    const st = this.state;
    this.markChurchVisit();
    if (st.daily.mass === this.day) { this.toast('Hai già partecipato alla Messa oggi. Torna domani.', 2600); return; }
    const info = dayInfo(this.today());
    this.action = {
      t: 0, dur: 8, text: info.red ? `Santa Messa · ${info.feast || 'Domenica'}` : 'Partecipi alla Santa Messa…',
      onDone: () => {
        st.daily.mass = this.day;
        st.stats.prayers++;
        const bonus = info.red ? 5 : 0;
        st.changeAura(2 + bonus, info.red ? `Messa nel giorno festivo: ${info.feast || 'Domenica'}` : 'Hai partecipato alla Santa Messa');
        audio.confirm();
        this.toast(info.red
          ? `Messa solenne (${info.feast || 'Domenica'}): +2 Aura e +5 Aura extra per il giorno in rosso!`
          : 'La Messa ti ha riempito il cuore. (+2 Aura)', 3600);
      },
    };
    audio.voice(false, 14);
  }

  confess() {
    const st = this.state;
    this.markChurchVisit();
    if (st.daily.confession === this.day) { this.toast('Ti sei già confessato oggi.', 2200); return; }
    this.action = {
      t: 0, dur: 5, text: 'Ti confessi davanti al sacerdote…',
      onDone: () => {
        st.daily.confession = this.day;
        st.changeAura(3, 'Ti sei confessato con sincerità');
        audio.confirm();
        const penance = st.stats.badDeeds > st.stats.goodDeeds ? 'Penitenza: dieci Ave Maria e una buona azione al giorno.' : 'Penitenza: un Padre Nostro per i tuoi genitori.';
        this.dialogs.message('Confessione', `Don Michele: «Ego te absolvo a peccatis tuis. Va' in pace.» ${penance} (+3 Aura)`);
      },
    };
    audio.voice(false, 8);
  }

  async paradisePreview() {
    if (this.transitioning) return;
    this.transitioning = true;
    audio.confirm();
    await fadeTo(0.85, 1.4, '#fff');
    if (this.disposed) return;
    await this.showCaption(`Livello Aura ${this.state.auraLevel}`, 'Intravedi la luce del Paradiso',
      `Senti la voce di mamma e papà, lontana. Raggiungi il Livello ${PARADISE_LEVEL} per incontrare Gesù e rivivere i tuoi ricordi.`, 3600);
    await fadeTo(0, 1.4);
    this.transitioning = false;
  }

  /* ---------- Case nei quartieri residenziali ---------- */
  houseDoor(door) {
    this.dialogs.houseForSale(door, {
      onBuy: () => this.buyHouse(door),
      onVisit: () => this.enterBuilding(door),
    });
  }

  buyHouse(door) {
    const st = this.state;
    if (!st.houses.includes(door.house.id)) st.houses.push(door.house.id);
    this.markHouseOwned(door);
    this.toast(`Congratulazioni! ${door.name} è tua: puoi dormirci e consultare il calendario.`, 4000);
    setTimeout(() => { if (!this.disposed) this.autosaver.saveNow(); }, 500);
  }

  markHouseOwned(door) {
    if (door.saleSign) door.saleSign.visible = false;
    door.name = door.house.kind === 'villetta' ? 'La tua villetta' : 'La tua casa';
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
        audio.engineStop(v.uid);
        this.vehicles.remove(v);
      }
      aura = 8;
      reason = `Hai regalato un veicolo a ${npc.name}`;
    }
    st.changeAura(aura, reason + ' (opera di carità)');
    audio.voice(npc.look && npc.look.sex === 'f', 7);
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
      if (['acqua', 'caffe'].includes(id)) audio.drink(); else audio.eat();
      return `Hai consumato: ${it.name} (+${it.heal || 0} salute${it.stamina ? `, +${it.stamina} stamina` : ''}).`;
    }
    if (it.cat === 'medicinali') {
      if (st.health >= st.maxHealth - 0.5) return 'Sei già in piena salute.';
      st.removeItem(id, 1);
      this.healOverTime = { total: it.heal, remaining: it.heal, t: 0, name: it.name };
      if (it.stamina) st.restoreStamina(it.stamina);
      audio.pills();
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

  /** Si accovaccia accanto alla portiera e armeggia con il cacciavite (animazione di scasso). */
  crouchAtDoor(v) {
    const ex = v.exitPoint();
    const p = v.body.position;
    this.player.setPosition(ex.x, this.player.feet.y, ex.z, Math.atan2(p.x - ex.x, p.z - ex.z));
    this.player.setHeld('screwdriver');
    this.player.workState = 'tinker';
    this.player.aiming = false;
    audio.screwdriver();
  }

  forceVehicle(v) {
    this.crouchAtDoor(v);
    this.action = {
      t: 0, dur: 3.2, text: `Forzi la serratura di ${v.name}…`,
      onDone: () => {
        this.player.workState = null;
        this.player.updateHeld(this.state.equipped);
        v.owner = 'stolen';
        this.state.stats.stolenVehicles++;
        this.state.changeAura(-8, 'Hai rubato un veicolo (7° comandamento: non rubare)');
        audio.carAlarm(6);
        this.toast('Serratura forzata: scatta l\'antifurto! (−8 Aura)', 2400);
        this.police.report(3, 'Furto di veicolo');
        this.mountVehicle(v);
      },
    };
  }

  /** Scasso della portiera per frugare nell'abitacolo: soldi o oggetti, antifurto e polizia. */
  lootVehicle(v) {
    this.crouchAtDoor(v);
    this.action = {
      t: 0, dur: 4.5, text: `Scassini la portiera di ${v.name} e frughi dentro…`,
      onDone: () => {
        this.player.workState = null;
        this.player.updateHeld(this.state.equipped);
        v.looted = true;
        const st = this.state;
        let found;
        if (Math.random() < 0.7) {
          const cash = 20 + Math.round(Math.random() * 16) * 10;
          st.cash += cash;
          found = formatMoney(cash);
          audio.cash();
        } else {
          const id = LOOT_ITEMS[Math.floor(Math.random() * LOOT_ITEMS.length)];
          st.addItem(id, 1);
          found = itemInfo(id).name;
        }
        st.stats.robberies++;
        st.changeAura(-4, 'Hai rubato da un\'auto (7° comandamento: non rubare)');
        audio.carAlarm(5);
        this.toast(`Hai trovato: ${found}. Scatta l'antifurto! (−4 Aura)`, 3000);
        this.police.report(2, 'Furto in auto');
      },
    };
  }

  /** Rapina al bancomat con la motosega: scintille, rumore assordante, contanti e 3 stelle. */
  robAtm(atm) {
    const f = this.player.feet;
    this.player.facing = Math.atan2(atm.mx - f.x, atm.mz - f.z);
    this.player.aiming = false;
    const sparks = setInterval(() => {
      if (this.disposed) return;
      audio.grind();
      const p = new THREE.Vector3(atm.mx + (Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 0.6, atm.mz);
      this.vehicles.smoke.emit(p, 0, true);
    }, 250);
    this.action = {
      t: 0, dur: 6, text: 'Tagli la cassaforte del bancomat con la motosega…', chainsaw: true,
      onDone: () => {
        clearInterval(sparks);
        const st = this.state;
        const cash = 300 + Math.round(Math.random() * 90) * 10;
        st.cash += cash;
        st.stats.robberies++;
        atm.robbedDay = this.day;
        atm.screen.visible = false;
        atm.group.rotation.z = 0.12;
        audio.cash();
        audio.carAlarm(8);
        st.changeAura(-10, 'Hai rapinato un bancomat (7° comandamento: non rubare)');
        this.toast(`Hai preso ${formatMoney(cash)} dal bancomat! Scatta l'allarme… (−10 Aura)`, 3400);
        this.police.report(3, 'Rapina al bancomat');
      },
      onCancel: () => clearInterval(sparks),
    };
  }

  /** Soccorrere una persona a terra: si rialza e ringrazia. */
  helpDowned(npc) {
    npc.downT = 0.01;
    this.state.changeAura(1, `Hai soccorso ${npc.name}`);
    audio.voice(npc.look && npc.look.sex === 'f', 6);
    this.toast(`${npc.name}: «Grazie… mi hai salvato.» (+1 Aura)`, 2600);
  }

  /* ---------- Concessionario (usato) e officina ---------- */
  vehicleSellPrice(v) {
    const m = VEHICLE_MODELS[v.model];
    const base = m ? m.price : 5000;
    return Math.max(50, Math.round((base * 0.55 * (0.3 + 0.7 * v.health / 100)) / 10) * 10);
  }

  sellVehicle(v) {
    const price = this.vehicleSellPrice(v);
    if (this.driving === v) this.exitVehicle();
    audio.engineStop(v.uid);
    this.vehicles.remove(v);
    this.state.cash += price;
    this.state.vehicles = this.vehicles.serializeOwned();
    this.toast(`Hai venduto ${v.name} per ${formatMoney(price)}.`, 2600);
    setTimeout(() => { if (!this.disposed) this.autosaver.saveNow(); }, 400);
  }

  repairCost(v) {
    const m = VEHICLE_MODELS[v.model];
    const perPoint = (m ? m.price : 5000) / 2500 + 2;
    return Math.max(40, Math.round(((100 - v.health) * perPoint) / 5) * 5);
  }

  /** Fermato dalla polizia: arresto, multa e veicolo rubato restituito. */
  busted() {
    if (this.transitioning) return;
    const v = this.driving;
    if (v) {
      this.exitVehicle();
      if (v.owner === 'stolen') { v.owner = 'npc'; this.state.vehicles = this.vehicles.serializeOwned(); }
    }
    const fine = Math.min(this.state.cash, 300 * Math.max(1, this.police.stars));
    this.state.cash -= fine;
    this.police.clear(true);
    audio.siren(3);
    this.arrest(`Gli agenti ti hanno fermato e ammanettato. Multa: ${formatMoney(fine)}.`);
  }

  mountVehicle(v) {
    if (this.driving || this.interior) return;
    this.driving = v;
    v.occupied = true;
    v.makeDynamic();
    this.player.setPhysicsEnabled(false);
    this.player.phone = false;
    this.player.setHeld(null);
    this.rig.firstPerson = false;
    this.rig.maxDist = v.spec.ride ? 8 : 12;
    this.rig.targetDist = v.spec.ride ? 4.8 : 7.5;
    this.rig.height = v.spec.ride ? 1.6 : 1.3;
    this.rig.yaw = v.heading + Math.PI;
    this.player.aiming = false;
    this.placeRider();
    audio.door();
    if (v.broken) {
      audio.engineDie();
      this.toast(`${v.name} è in panne: il motore non parte. Serve il meccanico dell'Officina.`, 3200);
      return;
    }
    audio.engineIgnition(v.kind);
    audio.engineStart(v.uid, v.kind);
    if (v.spec.ride && v.kind !== 'bike' && !this.state.stats.wheelieTip) {
      this.state.stats.wheelieTip = 1;
      this.toast('Tieni premuto SHIFT per impennare. In curva il mezzo si piega e tu con lui!', 3600);
    }
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
    audio.engineStop(v.uid);
    audio.door();
    this.player.setPose('auto');
    this.player.setPhysicsEnabled(true);
    this.player.setPosition(ex.x, 0.35, ex.z, ex.facing);
    this.player.updateHeld(this.state.equipped);
    this.rig.maxDist = 10;
    this.rig.height = 1.55;
    this.rig.targetDist = Math.min(this.rig.targetDist, 5);
  }

  /**
   * Veicolo acquistato: compare subito in strada davanti al concessionario (o vicino a te se ordinato al telefono).
   * Nessuna attesa bloccante: la finestra è già chiusa e il controllo torna immediatamente al giocatore.
   */
  onPurchaseVehicle(model, color, delivery) {
    let spot;
    try {
      if (delivery && !this.interior) {
        const f = this.player.feet;
        const h = this.player.facing;
        spot = { x: f.x + Math.sin(h) * 6, z: f.z + Math.cos(h) * 6, heading: h };
      } else {
        spot = this.world.dealerSpot || { ...this.world.getSpawn(), heading: 0 };
      }
      // Se il punto è occupato da un altro veicolo, lo si sposta lungo la strada
      for (let tries = 0; tries < 6; tries++) {
        const busy = this.vehicles.list.some((x) => Math.hypot(x.body.position.x - spot.x, x.body.position.z - spot.z) < 5);
        if (!busy) break;
        spot = { ...spot, x: spot.x + Math.sin(spot.heading) * 6, z: spot.z + Math.cos(spot.heading) * 6 };
      }
      const v = this.vehicles.add({ model, color, x: spot.x, z: spot.z, heading: spot.heading, owner: 'player' });
      if (this.interior) v.mesh.visible = false;
      this.state.vehicles = this.vehicles.serializeOwned();
      this.toast(delivery ? `${v.name} consegnata davanti a te!` : `${v.name} acquistata! Ti aspetta in strada davanti al concessionario.`, 3500);
    } catch (e) {
      console.error('[Game] acquisto veicolo', e);
      this.toast('Il veicolo verrà consegnato a breve.');
    }
    // Salvataggio fuori dal gesto di acquisto, per non rallentare la ripresa del controllo
    setTimeout(() => { if (!this.disposed) this.autosaver.saveNow(); }, 600);
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
      case 'priest': {
        let txt = 'Don Michele: «Figliolo, i tuoi genitori vegliano su di te. Fai del bene e un giorno li rivedrai.»';
        if (st.daily.momCall !== this.day) {
          st.daily.momCall = this.day;
          st.changeAura(1, 'Hai cercato conforto e consiglio dal parroco');
          txt += ' (+1 Aura)';
        }
        tab.call('⛪', 'Don Michele', txt);
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
        tab.renderPhone();
        break;
      case 'pizza':
        if (st.pay(12)) {
          this.deliveries.push({ t: 20, item: 'pizza_trancio', qty: 4, text: 'Il fattorino ti consegna la pizza: 4 tranci nell\'inventario.' });
          tab.call('🍕', 'Pizzeria Vesuvio', 'Ordine ricevuto: una margherita intera (€ 12). Arriva tra 20 secondi ovunque tu sia!');
        } else tab.call('🍕', 'Pizzeria Vesuvio', 'Servono € 12 in contanti per la consegna.');
        break;
      case 'police':
        tab.call('🚓', 'Polizia 112', 'Centrale operativa: «Nessuna emergenza in corso nella tua zona. Grazie per la segnalazione.»');
        break;
      case 'ambulance':
        tab.call('🚑', 'Ambulanza 118', st.health < st.maxHealth * 0.5
          ? 'Se ti senti male raggiungi l\'Ospedale (H sulla mappa) o usa un medicinale dall\'inventario.'
          : 'I tuoi parametri sembrano buoni. In caso di bisogno vai in Farmacia o all\'Ospedale.');
        audio.siren(3);
        break;
      default: break;
    }
  }

  /* =====================================================================
     Paradiso
     ===================================================================== */
  async enterParadise() {
    if (this.transitioning || this.paradise) return;
    this.transitioning = true;
    audio.confirm();
    await fadeTo(1, 1.6, '#fff');
    if (this.disposed) return;
    this.openUi('paradise');
    this.hud.hide();
    audio.stopAllLoops();
    this.paradise = new Paradise({ renderer: this.renderer, character: this.character, onExit: () => this.exitParadise() });
    this.paradise.resize(window.innerWidth, window.innerHeight);
    await fadeTo(0, 1.6);
    this.transitioning = false;
  }

  async exitParadise() {
    if (this.transitioning || !this.paradise) return;
    this.transitioning = true;
    await fadeTo(1, 1.2, '#fff');
    if (this.disposed) return;
    this.paradise.dispose();
    this.paradise = null;
    this.hud.show();
    this.applyAllSettings();
    await fadeTo(0, 1.2);
    this.transitioning = false;
    this.closeUi('paradise');
  }

  /* =====================================================================
     Ristorante, sonno, prigione, svenimento
     ===================================================================== */
  sitAt(seat) {
    this.player.setPhysicsEnabled(false);
    this.rig.firstPerson = false;
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
    this.rig.firstPerson = false;
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
    st.drunk = 0;
    this.drunkView = 0;
    const info = dayInfo(this.today());
    await this.showCaption('Buonanotte', `${formatDate(this.today(), true)} · ore 07:00`,
      `Hai dormito ${Math.round(slept)} ore. Salute e stamina al massimo.${info.red ? ` Oggi è ${info.feast || 'domenica'}: c'è la Messa!` : ''}`, 2600);
    this.player.setPose('auto');
    this.player.setPhysicsEnabled(true);
    const it = this.interior ? this.interior.interactables.find((i) => i.action === 'sleep') : null;
    if (it) this.player.setPosition(it.x, 0.02, it.z, data.facing);
    this.autosaver.saveNow();
    await fadeTo(0, 1.0);
    this.transitioning = false;
  }

  leaveInteriorImmediate() {
    if (!this.interior) return;
    const door = this.currentDoor;
    if (this.restaurant) { this.restaurant.dispose(); this.restaurant = null; }
    if (this.workshop) {
      const onShift = this.workshop.onShift;
      this.workshop.dispose();
      this.workshop = null;
      if (onShift) this.toast('Sei uscito dall\'officina: turno terminato, ti sei tolto la tuta.', 2800);
    }
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
    if (this.convo.isOpen) this.convo.close();
    if (this.driving) this.exitVehicle();
    this.player.aiming = false;
    this.police.clear(true);
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

  /** Svenimento: per salute a zero oppure per ubriachezza oltre il 50% (kind = 'drunk'). */
  async faint(kind = 'health') {
    if (this.transitioning) return;
    this.transitioning = true;
    const drunk = kind === 'drunk';
    if (this.driving) this.exitVehicle();
    if (this.convo.isOpen) this.convo.close();
    this.player.aiming = false;
    this.police.clear(true);
    if (drunk) {
      // Il personaggio crolla a terra prima del buio
      this.rig.firstPerson = false;
      const f = this.player.feet;
      this.player.setPhysicsEnabled(false);
      this.player.setPose('lie', new THREE.Vector3(f.x, f.y + 0.12, f.z), this.player.facing);
      audio.land(1.2);
      await new Promise((r) => setTimeout(r, 1400));
    }
    await fadeTo(1, 1.2, '#000');
    if (this.disposed) return;
    if (drunk) { this.player.setPose('auto'); this.player.setPhysicsEnabled(true); }
    this.leaveInteriorImmediate();
    const st = this.state;
    const bill = Math.min(st.cash, 250);
    st.cash -= bill;
    st.health = st.maxHealth * 0.6;
    st.stamina = st.maxStamina;
    if (drunk) {
      st.drunk = 0;
      this.drunkView = 0;
      st.changeAura(-10, 'Ti sei ubriacato fino a svenire');
    }
    const hosp = this.world.doors.find((d) => d.type === 'hospital');
    if (hosp) {
      const spot = this.world.doorExitSpot(hosp);
      this.player.setPosition(spot.x, 0.25, spot.z, spot.facing);
      this.rig.yaw = spot.facing;
    }
    this.hour = Math.min(23.5, this.hour + 6);
    await this.showCaption('Ospedale', drunk ? 'Coma etilico' : 'Sei svenuto', drunk
      ? `Hai bevuto troppo e sei crollato a terra. Ti risvegli in ospedale. Spese mediche: ${formatMoney(bill)}. (−10 Aura)`
      : `Ti hanno soccorso e curato. Spese mediche: ${formatMoney(bill)}.`, 3200);
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
    this.police.setVisible(v);
    this.vehicles.smoke.setVisible(v);
  }

  async enterBuilding(door) {
    if (this.transitioning || this.interior || this.driving) return;
    this.transitioning = true;
    this.hud.hidePrompt();
    audio.door();
    await fadeTo(1, 0.35, '#000');
    if (this.disposed) return;
    try {
      this.interior = new Interior({
        scene: this.scene,
        physics: this.physics,
        staticMaterial: this.world.staticMaterial,
        door,
        ctx: { familyId: this.family.id, city: this.city, seed: this.seed, houseTier: door.house ? door.house.tier : null },
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
    if (this.convo.isOpen) this.convo.close();
    if (CHURCH_TYPES.includes(door.type)) this.markChurchVisit();
    if (door.type === 'restaurant' || door.type === 'pizzeria') this.restaurant = new RestaurantService(this, this.interior, door.type);
    if (door.type === 'workshop') this.workshop = new Workshop(this, this.interior);
    this.player.aiming = false;
    this.setOutdoorVisible(false);
    this.dayCycle.indoor = true;
    const sp = this.interior.spawn;
    this.player.setPosition(sp.x, 0, sp.z, sp.facing);
    this.rig.collidables = this.interior.collidables;
    this.rig.maxDist = 4;
    this.rig.yaw = 0;
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
    audio.door();
    await fadeTo(1, 0.35, '#000');
    if (this.disposed) return;
    const door = this.currentDoor;
    this.leaveInteriorImmediate();
    const spot = this.world.doorExitSpot(door);
    this.rig.yaw = spot.facing;
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
    if (this.paradise) {
      this.renderer.toneMappingExposure = 1;
      this.renderer.render(this.paradise.scene, this.paradise.camera);
    } else this.drunkFx.render(this.scene, this.camera, this.drunkView, this.elapsed);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.paradise) this.paradise.resize(w, h);
  }

  dispose() {
    if (this.disposed) return;
    this.autosaver.saveNow();
    this.disposed = true;
    this.unbindEvents();
    if (this.unsubSettings) this.unsubSettings();
    if (document.pointerLockElement) document.exitPointerLock();
    audio.stopAllLoops();
    this.input.detach();
    this.dialogs.dispose();
    this.convo.close();
    this.drunkFx.dispose();
    if (this.action && this.action.onCancel) this.action.onCancel();
    if (this.workshop) { this.workshop.dispose(); this.workshop = null; }
    this.police.dispose();
    this.renderer.toneMappingExposure = 1; // il menu principale torna all'esposizione neutra
    this.escMenu.close();
    this.tabMenu.close();
    this.hud.hide();
    this.el.ctp.classList.add('hidden');
    $('big-caption').classList.add('hidden');
    if (this.paradise) { this.paradise.dispose(); this.paradise = null; }
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
