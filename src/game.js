// Gameplay open-world: mondo, giocatore, HUD, pausa, Pointer Lock e autosalvataggio.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { CityWorld, DayCycle } from './world.js';
import { Player, CameraRig } from './player.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { SaveSystem, AutoSaver } from './save.js';
import { getCity, getFamily, formatMoney } from './birthdata.js';
import { Interior } from './interiors.js';
import { $, toast, fadeTo, disposeObject3D } from './ui.js';

const INTERACT_RADIUS = 2.5;

const GAME_MINUTES_PER_SECOND = 1; // 1 secondo reale = 1 minuto di gioco (1 giorno = 24 minuti)
const AUTOSAVE_SECONDS = 30;

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
    this.paused = false;
    this.locked = false;
    this.exiting = false;

    // Stato di gioco
    this.money = save ? save.money : this.character.money;
    this.age = save ? save.age : 18;
    this.day = save ? save.time.day : 1;
    this.hour = save ? save.time.hour : 9.5;
    this.playTime = save ? save.playTime || 0 : 0;
    this.daysSinceBirthday = save ? save.time.daysSinceBirthday || 0 : 0;

    // Scena
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    this.physics.broadphase = new CANNON.SAPBroadphase(this.physics);
    this.physics.allowSleep = false;
    this.physics.solver.iterations = 12;
    this.physics.solver.tolerance = 0.0005;
    this.interior = null;
    this.currentDoor = null;
    this.transitioning = false;
    this.elapsed = 0;
    this.physics.defaultContactMaterial.friction = 0;
    this.physics.defaultContactMaterial.restitution = 0;

    const seed = this.seed = this.hashSeed(`${this.character.name}|${this.character.surname}|${this.character.cityId}|${this.character.birthYear}`);
    this.world = new CityWorld(this.scene, this.physics, { city: this.city, familyId: this.family.id, seed });
    this.dayCycle = new DayCycle(this.scene, this.world);

    this.player = new Player(this.scene, this.physics, {
      skin: this.character.skin,
      hair: this.character.hair,
      sex: this.character.sex,
      stats: this.character.stats,
    });
    this.physics.addContactMaterial(new CANNON.ContactMaterial(this.player.material, this.world.staticMaterial, { friction: 0, restitution: 0 }));

    this.rig = new CameraRig(this.camera, this.world.collidables);
    if (save && save.player) {
      this.player.setPosition(save.player.x, save.player.y - 0.05, save.player.z, save.player.facing || 0);
      this.rig.yaw = save.player.camYaw ?? 0;
      this.rig.pitch = save.player.camPitch ?? 0.22;
    } else {
      const sp = this.world.getSpawn();
      this.player.setPosition(sp.x, 0.2, sp.z, sp.yaw);
      this.rig.yaw = 0;   // camera sulla strada che guarda il personaggio e la porta di casa
      this.rig.pitch = 0.12;
      this.rig.dist = this.rig.targetDist = 5.2;
    }

    this.hud = new HUD(this.world);
    this.hud.setCharacter(this.character, this.city, this.family);
    this.hud.show();

    this.input = new Input();
    this.input.attach();
    this.autosaver = new AutoSaver(() => this.getSaveData(), AUTOSAVE_SECONDS, (ok) => this.hud.flashSave(ok));

    this.el = {
      ctp: $('click-to-play'), ctpTitle: $('ctp-title'), ctpSub: $('ctp-sub'),
      pause: $('pause'), pauseInfo: $('pause-info'),
      btnResume: $('btn-resume'), btnSave: $('btn-save'), btnMenu: $('btn-menu'),
    };

    this.bindEvents();
    this.dayCycle.update(this.hour, this.player.feet);
    this.rig.update(0.016, { dx: 0, dy: 0, wheel: 0 }, this.player.feet);
    this.player.animate(0);

    // Primo salvataggio: per una nuova vita sovrascrive quello vecchio.
    this.autosaver.saveNow();

    this.showClickToPlay(
      save ? 'Bentornato' : `${this.character.name}, 18 anni`,
      save
        ? `${this.city.city} · ${this.world.getDistrictAt(this.player.feet.x, this.player.feet.z).name} · ${formatMoney(this.money)}`
        : `${this.city.city}. Esci di casa con ${formatMoney(this.money)} in tasca. Clicca per iniziare.`,
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

  /* ---------- Pointer Lock / pausa ---------- */
  bindEvents() {
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) {
        this.input.enabled = true;
        this.el.ctp.classList.add('hidden');
        this.el.pause.classList.add('hidden');
        this.paused = false;
      } else if (!this.disposed && !this.paused && !this.exiting) {
        // ESC (o perdita del focus) durante il gioco -> pausa
        this.pause();
      }
    };
    this._onLockError = () => {
      if (this.disposed) return;
      this.showClickToPlay('Clicca per riprendere', 'Il browser ha bloccato la cattura del mouse: clicca di nuovo.');
    };
    this._onCtpClick = () => this.requestLock();
    this._onResume = () => this.resume();
    this._onSave = () => {
      const ok = this.autosaver.saveNow();
      toast(ok ? 'Partita salvata' : 'Impossibile salvare (spazio di archiviazione non disponibile)');
      this.updatePauseInfo();
    };
    this._onMenu = () => this.exitToMenu();
    this._onVisibility = () => { if (document.visibilityState === 'hidden') this.autosaver.saveNow(); };
    this._onPageHide = () => this.autosaver.saveNow();

    document.addEventListener('pointerlockchange', this._onLockChange);
    document.addEventListener('pointerlockerror', this._onLockError);
    this.el.ctp.addEventListener('click', this._onCtpClick);
    this.el.btnResume.addEventListener('click', this._onResume);
    this.el.btnSave.addEventListener('click', this._onSave);
    this.el.btnMenu.addEventListener('click', this._onMenu);
    document.addEventListener('visibilitychange', this._onVisibility);
    window.addEventListener('pagehide', this._onPageHide);
    window.addEventListener('beforeunload', this._onPageHide);
  }

  unbindEvents() {
    document.removeEventListener('pointerlockchange', this._onLockChange);
    document.removeEventListener('pointerlockerror', this._onLockError);
    this.el.ctp.removeEventListener('click', this._onCtpClick);
    this.el.btnResume.removeEventListener('click', this._onResume);
    this.el.btnSave.removeEventListener('click', this._onSave);
    this.el.btnMenu.removeEventListener('click', this._onMenu);
    document.removeEventListener('visibilitychange', this._onVisibility);
    window.removeEventListener('pagehide', this._onPageHide);
    window.removeEventListener('beforeunload', this._onPageHide);
  }

  showClickToPlay(title, sub) {
    this.el.ctpTitle.textContent = title;
    this.el.ctpSub.textContent = sub || '';
    this.el.ctp.classList.remove('hidden');
  }

  requestLock() {
    if (this.disposed || this.locked) return;
    try {
      const r = this.canvas.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => this._onLockError());
    } catch (e) {
      this._onLockError();
    }
  }

  pause() {
    if (this.disposed || this.paused) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.reset();
    this.el.ctp.classList.add('hidden');
    this.updatePauseInfo();
    this.el.pause.classList.remove('hidden');
    this.autosaver.saveNow();
  }

  updatePauseInfo() {
    const s = SaveSystem.load();
    const when = s ? new Date(s.savedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
    const bg = this.character.background && this.character.background.length ? `<br>${this.character.background.join(' · ')}` : '';
    this.el.pauseInfo.innerHTML =
      `${this.character.name} ${this.character.surname} · ${this.age} anni · ${this.city.city} (${this.family.short})<br>` +
      `Ultimo salvataggio: ${when}${bg}`;
  }

  resume() {
    if (this.disposed) return;
    this.paused = false;
    this.el.pause.classList.add('hidden');
    // Mostra il fallback: se il lock riesce viene nascosto subito da pointerlockchange.
    this.showClickToPlay('Clicca per riprendere', '');
    this.requestLock();
  }

  exitToMenu() {
    if (this.exiting) return;
    this.exiting = true;
    this.autosaver.saveNow();
    this.onExitToMenu();
  }

  /* ---------- Salvataggio ---------- */
  getSaveData() {
    if (this.disposed) return null;
    let p = this.player.body.position;
    let facing = this.player.facing;
    // Dentro un edificio si salva la posizione davanti all'ingresso esterno (nessun rischio di caricare "nel vuoto").
    if (this.interior && this.currentDoor) {
      const spot = this.world.doorExitSpot(this.currentDoor);
      p = { x: spot.x, y: 0.2 + 0.45, z: spot.z };
      facing = spot.facing;
    }
    return {
      character: this.character,
      money: Math.round(this.money),
      age: this.age,
      time: { day: this.day, hour: this.hour, daysSinceBirthday: this.daysSinceBirthday },
      playTime: Math.round(this.playTime),
      player: {
        x: +p.x.toFixed(2), y: +(p.y - 0.45).toFixed(2), z: +p.z.toFixed(2),
        facing: +facing.toFixed(3),
        camYaw: +this.rig.yaw.toFixed(3), camPitch: +this.rig.pitch.toFixed(3),
      },
    };
  }

  /* ---------- Loop ---------- */
  update(dt) {
    if (this.disposed) return;
    const active = this.locked && !this.paused;
    if (active) {
      this.playTime += dt;
      this.advanceTime(dt);
      const camYaw = this.rig.yaw;
      this.player.update(dt, this.input, camYaw);
      this.physics.step(1 / 60, dt, 5);
      // Rete di sicurezza: se si cade sotto la mappa si torna a casa.
      if (this.player.body.position.y < -20) {
        const sp = this.world.getSpawn();
        this.player.setPosition(sp.x, 0.2, sp.z, 0);
      }
      this.autosaver.update(dt);
      if (this.input.consumePressed('KeyC')) this.hud.toggleCard();
      this.updateInteraction();
    } else {
      this.hud.hidePrompt();
    }
    const mouse = active ? this.input.consumeMouse() : { dx: 0, dy: 0, wheel: 0 };
    if (!active) this.input.consumeMouse();
    this.input.endFrame();

    this.elapsed += dt;
    this.world.update(this.elapsed);
    if (this.interior) this.interior.update(dt);
    this.player.animate(active ? dt : 0);
    const feet = this.player.feet;
    this.rig.update(dt, mouse, feet);
    this.dayCycle.update(this.hour, feet);

    const mapPos = this.interior && this.currentDoor ? this.currentDoor : feet;
    this.hud.update(dt, {
      money: this.money,
      age: this.age,
      day: this.day,
      hour: this.hour,
      district: this.interior && this.currentDoor ? this.currentDoor.name : this.world.getDistrictAt(feet.x, feet.z).name,
      x: mapPos.x, z: mapPos.z,
      facing: this.player.facing,
      camYaw: this.rig.yaw,
    });
  }

  /* ---------- Porte ed edifici accessibili ---------- */
  updateInteraction() {
    if (this.transitioning) {
      this.hud.hidePrompt();
      return;
    }
    const feet = this.player.feet;
    if (this.interior) {
      const ex = this.interior.exitPoint;
      if (Math.hypot(feet.x - ex.x, feet.z - ex.z) <= INTERACT_RADIUS) {
        this.hud.showPrompt('uscire');
        if (this.input.consumePressed('KeyE')) this.exitBuilding();
      } else {
        this.hud.hidePrompt();
      }
      return;
    }
    const door = this.player.grounded ? this.world.nearestDoor(feet.x, feet.z, INTERACT_RADIUS) : null;
    if (door) {
      this.hud.showPrompt(`entrare ${door.name}`);
      if (this.input.consumePressed('KeyE')) this.enterBuilding(door);
    } else {
      this.hud.hidePrompt();
    }
  }

  async enterBuilding(door) {
    if (this.transitioning || this.interior) return;
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
      toast('Questo edificio è chiuso.');
      return;
    }
    this.currentDoor = door;
    this.world.setVisible(false);
    this.dayCycle.indoor = true;
    const sp = this.interior.spawn;
    this.player.setPosition(sp.x, 0, sp.z, sp.facing);
    this.rig.collidables = this.interior.collidables;
    this.rig.maxDist = 4;
    this.rig.yaw = 0; // camera alle spalle del giocatore, verso l'ingresso
    this.rig.pitch = 0.3;
    this.rig.targetDist = this.rig.dist = 3.2;
    // Precompila gli shader del nuovo interno mentre lo schermo è nero.
    this.renderer.compile(this.scene, this.camera);
    await fadeTo(0, 0.45);
    this.transitioning = false;
    toast(door.name, 1600);
  }

  async exitBuilding() {
    if (this.transitioning || !this.interior) return;
    this.transitioning = true;
    this.hud.hidePrompt();
    await fadeTo(1, 0.35, '#000');
    if (this.disposed) return;
    const door = this.currentDoor;
    this.interior.dispose();
    this.interior = null;
    this.currentDoor = null;
    this.world.setVisible(true);
    this.dayCycle.indoor = false;
    const spot = this.world.doorExitSpot(door);
    this.player.setPosition(spot.x, 0.2, spot.z, spot.facing);
    this.rig.collidables = this.world.collidables;
    this.rig.maxDist = 10;
    this.rig.yaw = spot.facing; // camera sul marciapiede che guarda il personaggio e l'ingresso
    this.rig.pitch = 0.15;
    this.rig.targetDist = this.rig.dist = 4.6;
    this.renderer.compile(this.scene, this.camera);
    await fadeTo(0, 0.45);
    this.transitioning = false;
  }

  advanceTime(dt) {
    this.hour += (dt * GAME_MINUTES_PER_SECOND) / 60;
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
      this.daysSinceBirthday++;
      if (this.daysSinceBirthday >= 365) {
        this.daysSinceBirthday = 0;
        this.age++;
        toast(`Buon compleanno! Ora hai ${this.age} anni.`, 3500);
      }
    }
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
    this.hud.hide();
    this.el.ctp.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    if (this.interior) {
      this.interior.dispose();
      this.interior = null;
    }
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
