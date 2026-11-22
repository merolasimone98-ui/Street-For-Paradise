// Giocatore (corpo fisico Cannon + modello umano animato) e camera in terza persona.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makePerson, makeHeldItem, HumanAnimator } from './characters.js';
import { CLOTHES, ITEMS } from './items.js';
import { GROUPS } from './playerstate.js';
import { disposeObject3D } from './ui.js';

export const PLAYER_RADIUS = 0.42;

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Converte outfit (id dei vestiti) + personaggio in opzioni per makePerson. */
export function lookFromOutfit(character, outfit) {
  const c = (id, fallback) => (id && CLOTHES[id] ? CLOTHES[id] : fallback);
  const shirt = c(outfit.shirt, { color: 0x7b7f86, sleeves: 'short' });
  return {
    height: character.sex === 'f' ? 1.68 : 1.79,
    skin: character.skin,
    hair: character.hair,
    sex: character.sex,
    hairStyle: character.sex === 'f' ? 'long' : 'short',
    shirt: shirt.color,
    sleeves: shirt.sleeves || 'short',
    pants: c(outfit.pants, { color: 0x2d3d5c }).color,
    shoes: c(outfit.shoes, { color: 0xf0f0ee }).color,
    cap: outfit.cap && CLOTHES[outfit.cap] ? CLOTHES[outfit.cap].color : null,
    bracelet: outfit.bracelet && CLOTHES[outfit.bracelet] ? CLOTHES[outfit.bracelet] : null,
    ring: outfit.ring && CLOTHES[outfit.ring] ? CLOTHES[outfit.ring] : null,
    glasses: !!(outfit.glasses && CLOTHES[outfit.glasses]),
  };
}

export class Player {
  constructor(scene, physics, character, outfit) {
    this.scene = scene;
    this.physics = physics;
    this.character = character;
    this.stats = character.stats;
    this.material = new CANNON.Material('player');
    this.body = new CANNON.Body({ mass: 70, material: this.material, fixedRotation: true, linearDamping: 0, allowSleep: false });
    this.body.addShape(new CANNON.Sphere(PLAYER_RADIUS));
    this.body.collisionFilterGroup = GROUPS.PLAYER;
    this.body.collisionFilterMask = GROUPS.WORLD | GROUPS.NPC | GROUPS.VEHICLE;
    physics.addBody(this.body);
    this.bodyInWorld = true;

    this.mesh = null;
    this.setOutfit(outfit);

    this.facing = 0;
    this.grounded = false;
    this.speed = 0;
    this.running = false;
    this.pose = 'auto'; // 'auto' | 'sit' | 'lie' | 'ride' | 'hidden'
    this.phone = false;
    this.heldKind = null;
    this.prevVy = 0;
    this.onLand = null; // callback(velocitàImpatto)
    this.ray = new CANNON.RaycastResult();
    this._from = new CANNON.Vec3();
    this._to = new CANNON.Vec3();
    this.posePosition = null; // posizione forzata quando seduto/sdraiato/in sella
  }

  setOutfit(outfit) {
    const look = lookFromOutfit(this.character, outfit);
    const old = this.mesh;
    this.mesh = makePerson(look);
    this.mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.animator = new HumanAnimator(this.mesh);
    this.scene.add(this.mesh);
    if (old) {
      this.mesh.position.copy(old.position);
      this.mesh.rotation.copy(old.rotation);
      this.scene.remove(old);
      disposeObject3D(old);
    }
    const held = this.heldKind;
    this.heldKind = null;
    this.setHeld(held);
  }

  /** Oggetto in mano: 'phone' ha la precedenza sull'oggetto equipaggiato. */
  setHeld(kind) {
    if (this.heldKind === kind) return;
    const hold = this.mesh.userData.holdR;
    for (const c of hold.children.slice()) { hold.remove(c); disposeObject3D(c); }
    this.heldKind = kind;
    if (kind) hold.add(makeHeldItem(kind));
  }

  updateHeld(equippedId) {
    const kind = this.phone ? 'phone' : (equippedId && ITEMS[equippedId] && ITEMS[equippedId].hold) || null;
    this.setHeld(kind);
  }

  setPosition(x, y, z, facing = 0) {
    this.body.position.set(x, y + PLAYER_RADIUS + 0.05, z);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.velocity.set(0, 0, 0);
    this.facing = facing;
    this.prevVy = 0;
    this.syncMesh();
  }

  /** Toglie o rimette il corpo fisico (es. alla guida di un veicolo). */
  setPhysicsEnabled(on) {
    if (on && !this.bodyInWorld) { this.physics.addBody(this.body); this.bodyInWorld = true; }
    if (!on && this.bodyInWorld) { this.physics.removeBody(this.body); this.bodyInWorld = false; }
  }

  get feet() {
    if (this.posePosition) return this.posePosition.clone();
    const p = this.body.interpolatedPosition;
    return new THREE.Vector3(p.x, p.y - PLAYER_RADIUS, p.z);
  }

  /**
   * Movimento a piedi. canRun dipende dalla stamina.
   * @returns {boolean} true se sta correndo
   */
  update(dt, input, camYaw, canRun) {
    if (this.pose !== 'auto') {
      this.body.velocity.set(0, 0, 0);
      this.running = false;
      this.speed = 0;
      return false;
    }
    const p = this.body.position;
    this._from.set(p.x, p.y, p.z);
    this._to.set(p.x, p.y - PLAYER_RADIUS - 0.22, p.z);
    this.ray.reset();
    this.physics.raycastClosest(this._from, this._to, { collisionFilterMask: GROUPS.WORLD | GROUPS.VEHICLE, skipBackfaces: true }, this.ray);
    const wasGrounded = this.grounded;
    this.grounded = this.ray.hasHit;
    if (!wasGrounded && this.grounded && this.onLand) this.onLand(-this.prevVy);
    this.prevVy = this.body.velocity.y;

    const f = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    const s = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const wantsRun = input.down('ShiftLeft', 'ShiftRight');
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * f + rx * s;
    let dz = fz * f + rz * s;
    const len = Math.hypot(dx, dz);
    const moving = len > 0.001;
    this.running = moving && wantsRun && canRun && !this.phone;
    const agility = 0.88 + (this.stats.riflessi / 100) * 0.25;
    const maxSpeed = (this.running ? 6.8 : this.phone ? 1.6 : 2.6) * agility;
    let tx = 0, tz = 0;
    if (moving) {
      dx /= len; dz /= len;
      tx = dx * maxSpeed; tz = dz * maxSpeed;
    }
    const v = this.body.velocity;
    const k = 1 - Math.exp(-(this.grounded ? 10 : 2.2) * dt);
    v.x += (tx - v.x) * k;
    v.z += (tz - v.z) * k;
    if (input.consumePressed('Space') && this.grounded && !this.phone) {
      v.y = 5.4 + (this.stats.resistenza / 100) * 1.1;
      this.grounded = false;
    }
    if (moving) this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), 1 - Math.exp(-10 * dt));
    this.speed = Math.hypot(v.x, v.z);
    return this.running;
  }

  syncMesh() {
    if (this.posePosition) {
      this.mesh.position.copy(this.posePosition);
    } else {
      const p = this.body.interpolatedPosition;
      this.mesh.position.set(p.x, p.y - PLAYER_RADIUS, p.z);
    }
    if (this.pose !== 'lie') {
      this.mesh.rotation.set(0, this.facing, 0);
    }
  }

  animate(dt) {
    this.mesh.visible = this.pose !== 'hidden';
    this.syncMesh();
    let state = 'auto';
    if (this.pose === 'sit') state = 'sit';
    else if (this.pose === 'lie') state = 'lie';
    else if (this.pose === 'ride') state = 'ride';
    else if (this.phone) state = 'phone';
    // Con il telefono le gambe continuano a camminare, il braccio destro lo tiene davanti al viso.
    this.animator.update(dt, { speed: this.pose === 'auto' ? this.speed : 0, grounded: this.grounded || this.pose !== 'auto', state });
  }

  /** Imposta una posa statica (seduto/sdraiato/in sella) in una posizione precisa. */
  setPose(pose, position = null, facing = null) {
    this.pose = pose;
    this.posePosition = position ? position.clone() : null;
    if (facing !== null) this.facing = facing;
    if (pose === 'lie' && position) {
      this.mesh.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      this.mesh.rotation.y = this.facing;
    }
  }

  dispose() {
    this.setPhysicsEnabled(false);
    this.scene.remove(this.mesh);
  }
}

export class CameraRig {
  constructor(camera, collidables) {
    this.camera = camera;
    this.collidables = collidables;
    this.yaw = 0;
    this.pitch = 0.22;
    this.targetDist = 4.8;
    this.dist = 4.8;
    this.maxDist = 10;
    this.minDist = 2.2;
    this.sensitivity = 0.0024;
    this.invertY = false;
    this.height = 1.55;
    this.raycaster = new THREE.Raycaster();
    this._target = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  update(dt, mouse, focus) {
    this.yaw -= mouse.dx * this.sensitivity;
    this.pitch += mouse.dy * this.sensitivity * (this.invertY ? -1 : 1);
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.45, 1.15);
    this.targetDist = THREE.MathUtils.clamp(this.targetDist + mouse.wheel * 0.6, this.minDist, this.maxDist);

    this._target.set(focus.x, focus.y + this.height, focus.z);
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    let wanted = this.targetDist;
    this.raycaster.set(this._target, this._dir);
    this.raycaster.far = this.targetDist + 0.3;
    const hits = this.raycaster.intersectObjects(this.collidables, false);
    if (hits.length) wanted = Math.max(0.7, hits[0].distance - 0.35);

    // Avvicinamento rapido (niente compenetrazioni), allontanamento lento (niente tremolii)
    const rate = wanted < this.dist ? 22 : 3.5;
    this.dist += (wanted - this.dist) * (1 - Math.exp(-rate * dt));
    if (this.dist > wanted) this.dist = Math.max(wanted, this.dist - 40 * dt);
    this.camera.position.copy(this._target).addScaledVector(this._dir, this.dist);
    if (this.camera.position.y < 0.35) this.camera.position.y = 0.35;
    this.camera.lookAt(this._target);
  }
}
