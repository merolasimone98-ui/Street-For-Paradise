// Giocatore (corpo fisico Cannon + modello Three) e camera in terza persona.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makePerson } from './characters.js';

export const PLAYER_RADIUS = 0.45;

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Player {
  constructor(scene, physics, { skin, hair, sex, stats }) {
    this.scene = scene;
    this.physics = physics;
    this.stats = stats;
    this.material = new CANNON.Material('player');
    this.body = new CANNON.Body({
      mass: 70,
      material: this.material,
      fixedRotation: true,
      linearDamping: 0,
      allowSleep: false,
    });
    this.body.addShape(new CANNON.Sphere(PLAYER_RADIUS));
    this.body.collisionFilterGroup = 2;
    this.body.collisionFilterMask = 1;
    physics.addBody(this.body);

    const shirt = new THREE.Color().setHSL(Math.random(), 0.35, 0.35).getHex();
    this.mesh = makePerson({ height: 1.78, skin, hair, sex, shirt, pants: 0x22293a });
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.mesh);

    this.facing = 0;
    this.walkPhase = 0;
    this.grounded = false;
    this.speed = 0;
    this.ray = new CANNON.RaycastResult();
    this._from = new CANNON.Vec3();
    this._to = new CANNON.Vec3();
  }

  setPosition(x, y, z, facing = 0) {
    this.body.position.set(x, y + PLAYER_RADIUS + 0.05, z);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.velocity.set(0, 0, 0);
    this.facing = facing;
    this.syncMesh();
  }

  /** Piedi del personaggio (y del terreno sotto di lui). */
  get feet() {
    const p = this.body.interpolatedPosition;
    return new THREE.Vector3(p.x, p.y - PLAYER_RADIUS, p.z);
  }

  update(dt, input, camYaw) {
    // Controllo a terra con un raggio verso il basso (solo geometria del mondo, gruppo 1)
    const p = this.body.position;
    this._from.set(p.x, p.y, p.z);
    this._to.set(p.x, p.y - PLAYER_RADIUS - 0.22, p.z);
    this.ray.reset();
    this.physics.raycastClosest(this._from, this._to, { collisionFilterMask: 1, skipBackfaces: true }, this.ray);
    this.grounded = this.ray.hasHit;

    const f = (input.down('KeyW', 'ArrowUp') ? 1 : 0) - (input.down('KeyS', 'ArrowDown') ? 1 : 0);
    const s = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
    const run = input.down('ShiftLeft', 'ShiftRight');

    // Direzioni relative alla camera
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * f + rx * s;
    let dz = fz * f + rz * s;
    const len = Math.hypot(dx, dz);
    const agility = 0.85 + (this.stats.riflessi / 100) * 0.3;
    const maxSpeed = (run ? 7.4 : 3.4) * agility;
    let tx = 0, tz = 0;
    if (len > 0.001) {
      dx /= len;
      dz /= len;
      tx = dx * maxSpeed;
      tz = dz * maxSpeed;
    }
    const v = this.body.velocity;
    const k = 1 - Math.exp(-(this.grounded ? 14 : 2.5) * dt);
    v.x += (tx - v.x) * k;
    v.z += (tz - v.z) * k;

    if (input.consumePressed('Space') && this.grounded) {
      v.y = 5.6 + (this.stats.resistenza / 100) * 1.2;
      this.grounded = false;
    }
    if (len > 0.001) this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), 1 - Math.exp(-12 * dt));
    this.speed = Math.hypot(v.x, v.z);
  }

  syncMesh() {
    const p = this.body.interpolatedPosition;
    this.mesh.position.set(p.x, p.y - PLAYER_RADIUS, p.z);
    this.mesh.rotation.y = this.facing;
  }

  animate(dt) {
    this.syncMesh();
    const u = this.mesh.userData;
    const moving = Math.min(1, this.speed / 3.5);
    this.walkPhase += dt * (4 + this.speed * 1.6);
    if (!this.grounded) {
      u.legL.rotation.x = THREE.MathUtils.lerp(u.legL.rotation.x, -0.6, 0.2);
      u.legR.rotation.x = THREE.MathUtils.lerp(u.legR.rotation.x, 0.3, 0.2);
      u.armL.rotation.x = THREE.MathUtils.lerp(u.armL.rotation.x, -2.4, 0.15);
      u.armR.rotation.x = THREE.MathUtils.lerp(u.armR.rotation.x, -2.4, 0.15);
      return;
    }
    const swing = Math.sin(this.walkPhase) * 0.75 * moving;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.8;
    u.armR.rotation.x = swing * 0.8;
    u.torso.rotation.y = Math.sin(this.walkPhase) * 0.06 * moving;
    // Respirazione da fermo
    const idle = 1 - moving;
    u.torso.scale.y = 1 + Math.sin(performance.now() * 0.002) * 0.012 * idle;
  }

  dispose() {
    this.physics.removeBody(this.body);
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
    this.sensitivity = 0.0024;
    this.raycaster = new THREE.Raycaster();
    this._target = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  update(dt, mouse, feet) {
    this.yaw -= mouse.dx * this.sensitivity;
    this.pitch += mouse.dy * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.45, 1.15);
    this.targetDist = THREE.MathUtils.clamp(this.targetDist + mouse.wheel * 0.6, 2.2, this.maxDist);

    this._target.set(feet.x, feet.y + 1.55, feet.z);
    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).normalize();

    // Evita che la camera entri nei palazzi
    let wanted = this.targetDist;
    this.raycaster.set(this._target, this._dir);
    this.raycaster.far = this.targetDist + 0.3;
    const hits = this.raycaster.intersectObjects(this.collidables, false);
    if (hits.length) wanted = Math.max(0.7, hits[0].distance - 0.35);

    // Avvicinamento rapido (niente compenetrazioni), allontanamento lento (niente tremolii)
    const rate = wanted < this.dist ? 22 : 3.5;
    this.dist += (wanted - this.dist) * (1 - Math.exp(-rate * dt));
    if (this.dist > wanted) this.dist = Math.max(wanted, this.dist - 40 * dt); // mai oltre il muro
    this.camera.position.copy(this._target).addScaledVector(this._dir, this.dist);
    if (this.camera.position.y < 0.35) this.camera.position.y = 0.35;
    this.camera.lookAt(this._target);
  }
}
