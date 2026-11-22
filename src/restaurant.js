// Servizio al tavolo: cameriere NPC, menù, attesa di 10 s, pasto, scontrino, polizia se non paghi.
import * as THREE from 'three';
import { Npc } from './npcs.js';
import { MENUS } from './items.js';
import { formatMoney } from './birthdata.js';
import { disposeObject3D } from './ui.js';

const WAIT_FOOD = 10; // secondi prima che arrivi il piatto
const EAT_TIME = 8;

export class RestaurantService {
  /**
   * @param {object} game
   * @param {import('./interiors.js').Interior} interior
   * @param {'restaurant'|'pizzeria'} menuKey
   */
  constructor(game, interior, menuKey) {
    this.game = game;
    this.interior = interior;
    this.menuKey = menuKey;
    this.state = 'idle';
    this.seat = null;
    this.order = [];
    this.timer = 0;
    this.plates = [];
    this.police = [];
    const k = interior.kitchen;
    this.kitchen = k.clone();
    this.waiter = new Npc(game.scene, game.physics, {
      sex: Math.random() < 0.5 ? 'm' : 'f', skin: 0xd29f78, hair: 0x2a2018, shirt: 0xf4f4f2, pants: 0x1c1d22,
      shoes: 0x1a1a1c, sleeves: 'long', uniform: 'waiter', height: 1.74,
    }, { x: k.x, y: 0, z: k.z, facing: 0, name: 'Cameriere' });
    this.tray = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20), new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.9, roughness: 0.25 }));
    this.tray.position.set(0, 0.0, 0.1);
    this.waiter.mesh.userData.holdR.add(this.tray);
    this.tray.visible = false;
  }

  get seated() {
    return this.seat !== null;
  }

  /** Mentre c'è un'ordinazione aperta o la polizia, non si può uscire. */
  get blocksExit() {
    return ['coming', 'ordering', 'waiting', 'serving', 'eating', 'billComing', 'bill', 'police', 'arrest'].includes(this.state);
  }

  get canStand() {
    return this.seated && (this.state === 'seated' || this.state === 'idle');
  }

  route(to) {
    // Corridoio centrale (x = 0 in coordinate locali dell'interno) per evitare i tavoli
    const aisleX = this.interior.toWorld(0, 0, 0).x;
    const from = this.waiter.pos;
    return [
      new THREE.Vector3(aisleX, 0, from.z),
      new THREE.Vector3(aisleX, 0, to.z),
      to.clone(),
    ];
  }

  routeToKitchen() {
    const aisleX = this.interior.toWorld(0, 0, 0).x;
    return [
      new THREE.Vector3(aisleX, 0, this.waiter.pos.z),
      new THREE.Vector3(aisleX, 0, this.kitchen.z + 1),
      this.kitchen.clone(),
    ];
  }

  sit(index) {
    const seat = this.interior.seats[index];
    if (!seat || this.seated) return;
    this.seat = seat;
    this.game.sitAt(seat);
    this.state = 'coming';
    this.game.toast('Il cameriere arriva con il menù…', 1800);
    this.waiter.walkTo(this.route(seat.waiterSpot), 1.6, () => {
      this.waiter.lookTarget = seat.seat;
      this.state = 'ordering';
      this.game.dialogs.restaurantMenu(this.menuKey, (items) => this.onOrder(items), () => this.onNoOrder());
    });
  }

  stand() {
    if (!this.canStand) return false;
    this.seat = null;
    this.state = 'idle';
    this.clearPlates();
    this.game.standUp();
    return true;
  }

  onNoOrder() {
    this.state = 'seated';
    this.waiter.lookTarget = null;
    this.waiter.walkTo(this.routeToKitchen(), 1.5);
  }

  onOrder(items) {
    this.order = items;
    this.state = 'waiting';
    this.waiter.lookTarget = null;
    // Il piatto deve arrivare al tavolo dopo WAIT_FOOD secondi dall'ordine (vedi update()).
    this.orderClock = 0;
    this.game.toast(`Ordinazione presa. Il piatto arriva tra ${WAIT_FOOD} secondi.`, 2500);
    this.waiter.walkTo(this.routeToKitchen(), 3.0);
  }

  routeFrom(from, to) {
    const aisleX = this.interior.toWorld(0, 0, 0).x;
    return [new THREE.Vector3(aisleX, 0, from.z), new THREE.Vector3(aisleX, 0, to.z), to.clone()];
  }

  static pathLength(start, pts) {
    let len = 0;
    let prev = start;
    for (const p of pts) { len += Math.hypot(p.x - prev.x, p.z - prev.z); prev = p; }
    return len;
  }

  serve(route, speed) {
    this.state = 'serving';
    this.tray.visible = true;
    this.waiter.walkTo(route, speed, () => {
      this.tray.visible = false;
      this.waiter.lookTarget = this.seat.seat;
      this.game.hud.setProgress(null);
      this.spawnPlates();
      this.state = 'eating';
      this.timer = EAT_TIME;
      this.game.toast('Buon appetito!', 1600);
    });
  }

  spawnPlates() {
    this.clearPlates();
    const n = Math.min(4, this.order.length);
    for (let i = 0; i < n; i++) {
      const it = this.order[i];
      const g = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 }));
      const food = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: it.color, roughness: 0.7 }));
      food.scale.set(1, 0.45, 1);
      food.position.y = 0.012;
      g.add(plate, food);
      const p = this.seat.plate;
      g.position.set(p.x + (i - (n - 1) / 2) * 0.32, p.y, p.z - Math.floor(i / 2) * 0.05);
      g.userData.food = food;
      this.game.scene.add(g);
      this.plates.push(g);
    }
  }

  clearPlates() {
    for (const p of this.plates) { this.game.scene.remove(p); disposeObject3D(p); }
    this.plates = [];
  }

  bringBill() {
    this.state = 'billComing';
    this.waiter.walkTo(this.route(this.seat.waiterSpot), 1.5, () => {
      this.waiter.lookTarget = this.seat.seat;
      this.state = 'bill';
      this.game.dialogs.receipt(MENUS[this.menuKey].title, this.order, (total) => this.onPaid(total), (total) => this.onCannotPay(total));
    });
  }

  onPaid(total) {
    this.state = 'seated';
    this.game.state.stats.meals++;
    this.game.state.changeAura(0.5, 'Hai pagato onestamente il conto');
    this.game.toast(`Conto pagato: ${formatMoney(total)}. Premi E per alzarti.`, 3000);
    this.waiter.lookTarget = null;
    this.waiter.walkTo(this.routeToKitchen(), 1.5);
  }

  onCannotPay(total) {
    this.state = 'police';
    this.game.state.changeAura(-6, 'Hai consumato senza poter pagare (7° comandamento)');
    this.game.toast(`Non hai ${formatMoney(total)} in contanti! Il cameriere chiama la polizia…`, 4000);
    this.waiter.walkTo(this.routeToKitchen(), 1.8);
    // La pattuglia entra e blocca l'uscita
    const ex = this.interior.exitPoint;
    for (let i = 0; i < 2; i++) {
      const cop = new Npc(this.game.scene, this.game.physics, {
        sex: i ? 'f' : 'm', skin: i ? 0xb7835b : 0xe7bc98, hair: 0x1b1410, shirt: 0x2c4a7a, pants: 0x1b2a4a,
        shoes: 0x111111, sleeves: 'long', uniform: 'police', height: i ? 1.72 : 1.84,
      }, { x: ex.x + (i ? 0.6 : -0.6), y: 0, z: ex.z, facing: Math.PI, name: 'Agente' });
      this.police.push(cop);
    }
    this.policeDelay = 1.5;
  }

  update(dt) {
    this.waiter.update(dt);
    for (const p of this.police) p.update(dt);
    if (this.state === 'waiting' || this.state === 'serving') {
      this.orderClock += dt;
      const left = Math.max(0, WAIT_FOOD - this.orderClock);
      this.game.hud.setProgress(Math.min(1, this.orderClock / WAIT_FOOD), left > 0 ? `Il piatto arriva tra ${Math.ceil(left)} s` : 'Il cameriere porta il piatto…');
      // Il cameriere riparte dalla cucina giusto in tempo per arrivare al tavolo allo scadere dei 10 secondi
      if (this.state === 'waiting' && !this.waiter.path) {
        const route = this.routeFrom(this.waiter.pos, this.seat.waiterSpot);
        const L = RestaurantService.pathLength(this.waiter.pos, route);
        const remaining = WAIT_FOOD - this.orderClock;
        if (remaining <= L / 1.8) this.serve(route, THREE.MathUtils.clamp(L / Math.max(0.8, remaining), 1.4, 3.2));
      }
    } else if (this.state === 'eating') {
      this.timer -= dt;
      const k = 1 - this.timer / EAT_TIME;
      this.game.hud.setProgress(k, 'Stai mangiando…');
      for (const p of this.plates) p.userData.food.scale.setScalar(Math.max(0.05, 1 - k));
      if (this.timer <= 0) {
        this.game.hud.setProgress(null);
        const heal = this.order.reduce((t, i) => t + i.heal * i.qty, 0);
        this.game.state.heal(heal);
        this.game.state.restoreStamina(40);
        this.game.toast(`Sei sazio (+${heal} salute). Il cameriere porta il conto.`, 2600);
        this.bringBill();
      }
    } else if (this.state === 'police') {
      this.policeDelay -= dt;
      if (this.policeDelay <= 0 && !this.policeDispatched) {
        this.policeDispatched = true;
        const target = this.seat ? this.seat.waiterSpot : this.game.player.feet;
        this.police.forEach((cop, i) => cop.walkTo([new THREE.Vector3(target.x + (i ? 0.7 : -0.7), 0, target.z + 0.6)], 1.7, () => {
          cop.lookTarget = this.game.player.feet;
          if (this.state === 'police' && this.police.every((c) => !c.path)) {
            this.state = 'arrest';
            this.game.toast('"Venga con noi, passerà la notte in centrale."', 2500);
            setTimeout(() => this.game.arrest('Hai consumato un pasto senza pagare.'), 1600);
          }
        }));
      }
    }
  }

  dispose() {
    this.game.hud.setProgress(null);
    this.clearPlates();
    this.waiter.dispose();
    for (const p of this.police) p.dispose();
    this.police = [];
  }
}
