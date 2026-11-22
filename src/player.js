import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUP } from './world.js';

// ---------------------------------------------------------------------------
// Parametri di movimento
// ---------------------------------------------------------------------------
const WALK_SPEED = 4.2;
const RUN_SPEED = 8.5;
const ACCEL_GROUND = 14;
const ACCEL_AIR = 2.5;
const JUMP_VELOCITY = 7.4;
const JUMP_COOLDOWN = 0.3;
const JUMP_BUFFER = 0.15;

// Collider: "capsula" composta da 3 sfere (piedi a y = 0, testa a ~1.84 m)
const RADIUS = 0.32;
const SPHERE_OFFSETS = [0.32, 0.92, 1.52];

// Telecamera
const MOUSE_SENSITIVITY = 0.0022;
const PITCH_MIN = -0.5;
const PITCH_MAX = 1.15;
const ZOOM_MIN = 2.2;
const ZOOM_MAX = 9;
const PIVOT_HEIGHT = 1.55;
const SHOULDER_OFFSET = 0.55;

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

export class Player {
  constructor({ scene, physicsWorld, camera, material, spawn }) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.camera = camera;
    this.spawn = { x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw || 0 };

    this.active = false;
    this.grounded = false;
    this.jumpCooldown = 0;
    this.jumpBuffer = 0;
    this.keys = { forward: false, back: false, left: false, right: false, run: false };

    // --- Corpo fisico -----------------------------------------------------
    this.body = new CANNON.Body({
      mass: 70,
      material,
      fixedRotation: true,
      linearDamping: 0,
      collisionFilterGroup: GROUP.PLAYER,
      collisionFilterMask: GROUP.STATIC,
    });
    for (const y of SPHERE_OFFSETS) {
      this.body.addShape(new CANNON.Sphere(RADIUS), new CANNON.Vec3(0, y, 0));
    }
    this.body.allowSleep = false;
    this.body.position.set(this.spawn.x, this.spawn.y, this.spawn.z);
    this.body.updateMassProperties();
    physicsWorld.addBody(this.body);

    // Rilevamento del suolo dopo ogni sotto-passo della fisica
    physicsWorld.addEventListener('postStep', () => this._checkGround());

    // --- Modello 3D articolato -------------------------------------------
    this.model = this._buildModel();
    scene.add(this.model.root);

    // --- Stato animazione -------------------------------------------------
    this.phase = 0;
    this.idleTime = 0;
    this.airBlend = 0;
    this.facing = Math.atan2(-Math.sin(this.spawn.yaw), -Math.cos(this.spawn.yaw));
    this.targetFacing = this.facing;

    // --- Stato telecamera -------------------------------------------------
    this.yaw = this.spawn.yaw;
    this.pitch = 0.18;
    this.distance = 4.5;
    this.targetDistance = 4.5;

    this.position = new THREE.Vector3(this.spawn.x, this.spawn.y, this.spawn.z);
    this.pivot = new THREE.Vector3(this.spawn.x, this.spawn.y + PIVOT_HEIGHT, this.spawn.z);

    // vettori riutilizzati (nessuna allocazione nel loop)
    this._move = new THREE.Vector3();
    this._camForward = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._camPos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._rayFrom = new CANNON.Vec3();
    this._rayTo = new CANNON.Vec3();
    this._rayResult = new CANNON.RaycastResult();

    this._bindEvents();
    this._syncVisual();
    this._updateCamera(1);
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  setActive(active) {
    this.active = active;
    if (!active) {
      for (const k of Object.keys(this.keys)) this.keys[k] = false;
      this.jumpBuffer = 0;
    }
  }

  _bindEvents() {
    const setKey = (code, value) => {
      switch (code) {
        case 'KeyW':
        case 'ArrowUp':
          this.keys.forward = value;
          return true;
        case 'KeyS':
        case 'ArrowDown':
          this.keys.back = value;
          return true;
        case 'KeyA':
        case 'ArrowLeft':
          this.keys.left = value;
          return true;
        case 'KeyD':
        case 'ArrowRight':
          this.keys.right = value;
          return true;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.keys.run = value;
          return true;
        default:
          return false;
      }
    };

    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) this.jumpBuffer = JUMP_BUFFER;
        return;
      }
      if (setKey(e.code, true)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      setKey(e.code, false);
    });

    window.addEventListener('blur', () => {
      for (const k of Object.keys(this.keys)) this.keys[k] = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.active) return;
      // alcuni browser generano picchi anomali subito dopo il Pointer Lock
      const mx = clamp(e.movementX || 0, -250, 250);
      const my = clamp(e.movementY || 0, -250, 250);
      this.yaw -= mx * MOUSE_SENSITIVITY;
      this.pitch = clamp(this.pitch + my * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX);
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.active) return;
        this.targetDistance = clamp(this.targetDistance + Math.sign(e.deltaY) * 0.6, ZOOM_MIN, ZOOM_MAX);
      },
      { passive: true }
    );
  }

  // -------------------------------------------------------------------------
  // Modello del personaggio
  // -------------------------------------------------------------------------
  _buildModel() {
    const M = (color, roughness = 0.75, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mat = {
      skin: M('#c2927a', 0.65),
      hair: M('#1c1714', 0.9),
      jacket: M('#4b3326', 0.55, 0.05),
      shirt: M('#2d3034', 0.85),
      pants: M('#2b2f3a', 0.85),
      shoes: M('#141414', 0.5),
      belt: M('#1a1a1a', 0.4, 0.2),
      eyes: M('#111111', 0.3),
    };

    const part = (geometry, material, x, y, z, parent) => {
      const m = new THREE.Mesh(geometry, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const joint = (x, y, z, parent) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };

    const root = new THREE.Group();
    const body = joint(0, 0, 0, root);

    // bacino
    const hips = joint(0, 0.95, 0, body);
    part(new THREE.BoxGeometry(0.34, 0.2, 0.22), mat.pants, 0, -0.02, 0, hips);
    part(new THREE.BoxGeometry(0.35, 0.05, 0.23), mat.belt, 0, 0.08, 0, hips);

    // busto
    const spine = joint(0, 0.1, 0, hips);
    part(new THREE.BoxGeometry(0.4, 0.48, 0.24), mat.jacket, 0, 0.24, 0, spine);
    part(new THREE.BoxGeometry(0.15, 0.4, 0.02), mat.shirt, 0, 0.25, 0.125, spine);
    part(new THREE.BoxGeometry(0.3, 0.06, 0.2), mat.jacket, 0, 0.47, 0, spine);

    // collo e testa
    const neck = joint(0, 0.48, 0, spine);
    part(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 10), mat.skin, 0, 0.04, 0, neck);
    const head = joint(0, 0.08, 0, neck);
    const skull = part(new THREE.SphereGeometry(0.115, 16, 12), mat.skin, 0, 0.1, 0, head);
    skull.scale.set(0.95, 1.12, 1.02);
    const hair = part(
      new THREE.SphereGeometry(0.122, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
      mat.hair,
      0,
      0.125,
      -0.008,
      head
    );
    hair.scale.set(0.97, 1.0, 1.05);
    part(new THREE.BoxGeometry(0.03, 0.05, 0.04), mat.skin, 0, 0.09, 0.115, head);
    part(new THREE.BoxGeometry(0.03, 0.014, 0.01), mat.eyes, 0.04, 0.125, 0.108, head);
    part(new THREE.BoxGeometry(0.03, 0.014, 0.01), mat.eyes, -0.04, 0.125, 0.108, head);
    part(new THREE.BoxGeometry(0.025, 0.05, 0.035), mat.skin, 0.11, 0.1, 0, head);
    part(new THREE.BoxGeometry(0.025, 0.05, 0.035), mat.skin, -0.11, 0.1, 0, head);

    // braccia (side +1 = sinistra del personaggio, che guarda verso +Z)
    const makeArm = (side) => {
      const shoulder = joint(side * 0.255, 0.43, 0, spine);
      part(new THREE.SphereGeometry(0.075, 10, 8), mat.jacket, 0, 0, 0, shoulder);
      part(new THREE.CylinderGeometry(0.06, 0.055, 0.3, 10), mat.jacket, 0, -0.15, 0, shoulder);
      const elbow = joint(0, -0.3, 0, shoulder);
      part(new THREE.CylinderGeometry(0.052, 0.045, 0.27, 10), mat.jacket, 0, -0.135, 0, elbow);
      const hand = part(new THREE.SphereGeometry(0.048, 10, 8), mat.skin, 0, -0.3, 0, elbow);
      hand.scale.set(0.8, 1.1, 0.6);
      return { shoulder, elbow };
    };

    // gambe
    const makeLeg = (side) => {
      const hip = joint(side * 0.095, -0.04, 0, hips);
      part(new THREE.CylinderGeometry(0.085, 0.07, 0.42, 10), mat.pants, 0, -0.21, 0, hip);
      const knee = joint(0, -0.42, 0, hip);
      part(new THREE.CylinderGeometry(0.068, 0.055, 0.4, 10), mat.pants, 0, -0.2, 0, knee);
      part(new THREE.BoxGeometry(0.11, 0.08, 0.26), mat.shoes, 0, -0.42, 0.05, knee);
      return { hip, knee };
    };

    const lArm = makeArm(1);
    const rArm = makeArm(-1);
    const lLeg = makeLeg(1);
    const rLeg = makeLeg(-1);

    return { root, body, hips, spine, neck, head, lArm, rArm, lLeg, rLeg };
  }

  // -------------------------------------------------------------------------
  // Fisica
  // -------------------------------------------------------------------------
  _checkGround() {
    let grounded = false;
    const contacts = this.physicsWorld.contacts;
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      if (c.bi === this.body) {
        if (-c.ni.y > 0.5) grounded = true;
      } else if (c.bj === this.body) {
        if (c.ni.y > 0.5) grounded = true;
      }
    }
    this.grounded = grounded;
  }

  /** Da chiamare prima di world.step: imposta la velocità desiderata. */
  preStep(dt) {
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    const f = this.active ? (this.keys.forward ? 1 : 0) - (this.keys.back ? 1 : 0) : 0;
    const r = this.active ? (this.keys.right ? 1 : 0) - (this.keys.left ? 1 : 0) : 0;

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    this._camForward.set(-sy, 0, -cy);
    this._camRight.set(cy, 0, -sy);

    this._move.set(0, 0, 0).addScaledVector(this._camForward, f).addScaledVector(this._camRight, r);
    const hasInput = this._move.lengthSq() > 0.0001;
    if (hasInput) this._move.normalize();

    const speed = this.keys.run ? RUN_SPEED : WALK_SPEED;
    const accel = this.grounded ? ACCEL_GROUND : ACCEL_AIR;
    const k = 1 - Math.exp(-accel * dt);

    const v = this.body.velocity;
    v.x += (this._move.x * speed - v.x) * k;
    v.z += (this._move.z * speed - v.z) * k;

    if (hasInput) this.targetFacing = Math.atan2(this._move.x, this._move.z);

    if (this.jumpBuffer > 0 && this.grounded && this.jumpCooldown <= 0) {
      v.y = JUMP_VELOCITY;
      this.grounded = false;
      this.jumpCooldown = JUMP_COOLDOWN;
      this.jumpBuffer = 0;
    }

    // rete di sicurezza: caduta fuori dal mondo
    if (this.body.position.y < -30) {
      this.body.position.set(this.spawn.x, this.spawn.y + 1, this.spawn.z);
      this.body.velocity.set(0, 0, 0);
    }
  }

  /** Da chiamare dopo world.step: sincronizza modello, animazioni e telecamera. */
  postStep(dt) {
    this._syncVisual();

    let diff = this.targetFacing - this.facing;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.facing += diff * (1 - Math.exp(-12 * dt));
    this.model.root.rotation.y = this.facing;

    const v = this.body.velocity;
    const horizSpeed = Math.sqrt(v.x * v.x + v.z * v.z);
    this._animate(dt, horizSpeed);
    this._updateCamera(dt);
  }

  _syncVisual() {
    const p = this.body.interpolatedPosition;
    this.position.set(p.x, p.y, p.z);
    this.model.root.position.copy(this.position);
  }

  // -------------------------------------------------------------------------
  // Animazione procedurale
  // -------------------------------------------------------------------------
  _animate(dt, horizSpeed) {
    const m = this.model;
    const moveAmt = this.grounded ? clamp(horizSpeed / WALK_SPEED, 0, 1) : 0;
    const runAmt = clamp((horizSpeed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1);

    this.airBlend += ((this.grounded ? 0 : 1) - this.airBlend) * (1 - Math.exp(-10 * dt));
    if (this.grounded && horizSpeed > 0.1) this.phase += dt * (2.2 + horizSpeed * 0.78);
    this.idleTime += dt;

    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const swing = (0.45 + 0.35 * runAmt) * moveAmt;
    const kneeAmp = 0.6 + 0.7 * runAmt;
    const ab = this.airBlend;

    // Convenzioni: rotation.x > 0 porta l'arto indietro (verso -Z);
    // ginocchio > 0 piega lo stinco all'indietro; gomito < 0 piega l'avambraccio in avanti.
    let lHip = s * swing;
    let rHip = -s * swing;
    let lKnee = 0.05 + (0.1 + Math.max(0, -c) * kneeAmp) * moveAmt;
    let rKnee = 0.05 + (0.1 + Math.max(0, c) * kneeAmp) * moveAmt;
    let lShoulder = -s * swing * 0.9;
    let rShoulder = s * swing * 0.9;
    let elbow = -(0.15 + 0.25 * moveAmt + 0.9 * runAmt);
    let armSpread = 0.08;
    let spineLean = 0.03 + 0.07 * moveAmt + 0.18 * runAmt;
    spineLean += Math.sin(this.idleTime * 2) * 0.015 * (1 - moveAmt);
    const bob = -Math.abs(s) * 0.045 * moveAmt * (1 + runAmt) + Math.sin(this.idleTime * 2) * 0.004;

    // posa in aria
    lHip = lerp(lHip, -0.6, ab);
    rHip = lerp(rHip, 0.2, ab);
    lKnee = lerp(lKnee, 1.1, ab);
    rKnee = lerp(rKnee, 0.45, ab);
    lShoulder = lerp(lShoulder, -0.5, ab);
    rShoulder = lerp(rShoulder, -0.3, ab);
    elbow = lerp(elbow, -0.7, ab);
    armSpread = lerp(armSpread, 0.45, ab);
    spineLean = lerp(spineLean, 0.12, ab);

    const k = 1 - Math.exp(-16 * dt);
    const approach = (obj, axis, target) => {
      obj.rotation[axis] += (target - obj.rotation[axis]) * k;
    };

    approach(m.lLeg.hip, 'x', lHip);
    approach(m.rLeg.hip, 'x', rHip);
    approach(m.lLeg.knee, 'x', lKnee);
    approach(m.rLeg.knee, 'x', rKnee);
    approach(m.lArm.shoulder, 'x', lShoulder);
    approach(m.rArm.shoulder, 'x', rShoulder);
    approach(m.lArm.shoulder, 'z', armSpread);
    approach(m.rArm.shoulder, 'z', -armSpread);
    approach(m.lArm.elbow, 'x', elbow);
    approach(m.rArm.elbow, 'x', elbow);
    approach(m.spine, 'x', spineLean);
    approach(m.hips, 'y', s * 0.08 * moveAmt);
    approach(m.spine, 'y', -s * 0.14 * moveAmt);
    approach(m.head, 'x', -spineLean * 0.6);
    m.body.position.y += (bob - m.body.position.y) * k;
  }

  // -------------------------------------------------------------------------
  // Telecamera in terza persona sopra la spalla
  // -------------------------------------------------------------------------
  _updateCamera(dt) {
    const p = this.position;
    const kxz = 1 - Math.exp(-25 * dt);
    const ky = 1 - Math.exp(-9 * dt);
    this.pivot.x += (p.x - this.pivot.x) * kxz;
    this.pivot.z += (p.z - this.pivot.z) * kxz;
    this.pivot.y += (p.y + PIVOT_HEIGHT - this.pivot.y) * ky;

    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-10 * dt));

    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    this._dir.set(-sy * cp, -sp, -cy * cp);
    this._camRight.set(cy, 0, -sy);

    const shoulder = SHOULDER_OFFSET * clamp(this.distance / 4.5, 0.6, 1.2);
    this._desired
      .copy(this.pivot)
      .addScaledVector(this._camRight, shoulder)
      .addScaledVector(this._dir, -this.distance);
    this._desired.y += 0.2;

    // collisione della telecamera con edifici e suolo
    this._rayFrom.set(this.pivot.x, this.pivot.y, this.pivot.z);
    this._rayTo.set(this._desired.x, this._desired.y, this._desired.z);
    this._rayResult.reset();
    const hit = this.physicsWorld.raycastClosest(
      this._rayFrom,
      this._rayTo,
      { collisionFilterMask: GROUP.STATIC, skipBackfaces: true },
      this._rayResult
    );

    this._camPos.copy(this._desired);
    if (hit && this._rayResult.hasHit) {
      const full = this._rayFrom.distanceTo(this._rayTo);
      if (full > 0.0001) {
        const safe = Math.max(0.3, this._rayResult.distance - 0.3);
        this._camPos.copy(this.pivot).lerp(this._desired, Math.min(1, safe / full));
      }
    }
    if (this._camPos.y < 0.3) this._camPos.y = 0.3;

    this.camera.position.copy(this._camPos);
    this._look.copy(this._camPos).add(this._dir);
    this.camera.lookAt(this._look);
  }
}
