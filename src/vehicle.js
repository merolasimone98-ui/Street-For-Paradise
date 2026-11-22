// Veicoli guidabili (bici, motorini, moto, auto): modelli 3D, fisica Cannon-es arcade, gestione parco veicoli.
// Tasto F: sali/scendi (o forza la serratura con il cacciavite speciale se il veicolo non è tuo).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS } from './playerstate.js';
import { VEHICLE_MODELS } from './items.js';
import { disposeObject3D } from './ui.js';

export const SPECS = {
  bike: { len: 1.75, wid: 0.6, h: 1.05, mass: 90, maxSpeed: 9, accel: 3.2, brake: 8, reverseAccel: 1.2, reverseMax: 1.5, steer: 2.4, ride: true, seatY: 0.92, seatZ: -0.2, wheelR: 0.34, wheelBase: 1.05 },
  scooter: { len: 1.8, wid: 0.66, h: 1.15, mass: 110, maxSpeed: 15, accel: 4.5, brake: 9, reverseAccel: 1.2, reverseMax: 1.5, steer: 2.2, ride: true, seatY: 0.76, seatZ: -0.25, wheelR: 0.26, wheelBase: 1.25 },
  moto: { len: 2.1, wid: 0.72, h: 1.15, mass: 200, maxSpeed: 38, accel: 9, brake: 12, reverseAccel: 1.5, reverseMax: 2, steer: 2.0, ride: true, seatY: 0.84, seatZ: -0.3, wheelR: 0.32, wheelBase: 1.45 },
  car_small: { len: 3.7, wid: 1.68, h: 1.45, mass: 950, maxSpeed: 30, accel: 6.5, brake: 12, reverseAccel: 4, reverseMax: 6, steer: 1.6, wheelR: 0.3 },
  car: { len: 4.6, wid: 1.84, h: 1.45, mass: 1350, maxSpeed: 40, accel: 8, brake: 13, reverseAccel: 4, reverseMax: 7, steer: 1.45, wheelR: 0.33 },
  suv: { len: 4.8, wid: 1.95, h: 1.8, mass: 1900, maxSpeed: 36, accel: 7, brake: 12, reverseAccel: 4, reverseMax: 7, steer: 1.35, wheelR: 0.38 },
  sport: { len: 4.4, wid: 1.95, h: 1.22, mass: 1300, maxSpeed: 55, accel: 13, brake: 16, reverseAccel: 5, reverseMax: 7, steer: 1.6, wheelR: 0.34 },
};

export const KIND_LABEL = { bike: 'bici', scooter: 'motorino', moto: 'moto', car_small: 'auto', car: 'auto', suv: 'auto', sport: 'auto' };

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

function tube(parent, a, b, r, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}

function extrudeProfile(points, depth, bevel) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4,
  });
  geo.rotateY(-Math.PI / 2); // lunghezza della sagoma lungo +Z
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function wheel(r, width, kind) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 22), std(0x141414, { roughness: 0.9 }));
  tire.rotation.z = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.01, 14), std(kind === 'sport' ? 0x2b2b2e : 0xc4c8cc, { metalness: 0.9, roughness: 0.28 }));
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.035, r * 1.1), std(0x9aa0a6, { metalness: 0.9, roughness: 0.3 }));
    sp.rotation.x = (i / 5) * Math.PI;
    g.add(sp);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function twoWheel(r, tubeR) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r, tubeR, 10, 30), std(0x151515, { roughness: 0.9 }));
  tire.rotation.y = Math.PI / 2;
  g.add(tire);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10), std(0xbfc4c9, { metalness: 0.9, roughness: 0.3 }));
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.008, r * 2 - tubeR, 0.008), std(0xc9ced3, { metalness: 0.9 }));
    sp.rotation.x = (i / 8) * Math.PI;
    g.add(sp);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/** Costruisce il modello 3D. Ritorna { group, wheels: [{ node, front }], steerNodes: [] } */
export function buildVehicleMesh(kind, color) {
  const s = SPECS[kind];
  const group = new THREE.Group();
  const wheels = [];
  const steerNodes = [];
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  const black = std(0x16171a, { roughness: 0.5 });
  const chrome = std(0xd0d4d8, { metalness: 0.95, roughness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1b2836, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.82 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 1.3 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1a1a, emissiveIntensity: 0.9 });

  if (!s.ride) {
    const L = s.len, W = s.wid, k = s.h / 1.45;
    const rear = -L / 2, front = L / 2;
    const bodyPts = [
      [rear, 0.26], [rear, 0.74 * k], [rear + 0.22, 0.9 * k], [rear + (kind === 'suv' ? 0.4 : 0.9), 0.95 * k],
      [front - (kind === 'sport' ? 1.55 : 1.25), 0.95 * k], [front - 0.25, 0.8 * k], [front, 0.66 * k], [front, 0.26],
    ];
    const body = new THREE.Mesh(extrudeProfile(bodyPts, W - 0.12, 0.06), paint);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const gRear = rear + (kind === 'suv' ? 0.4 : 0.9);
    const gFront = front - (kind === 'sport' ? 1.55 : 1.25);
    const roofY = s.h;
    const glassPts = [
      [gRear, 0.94 * k], [gRear + (kind === 'suv' ? 0.15 : 0.5), roofY - 0.05], [gFront - (kind === 'sport' ? 0.85 : 0.6), roofY - 0.04], [gFront, 0.94 * k],
    ];
    const cabin = new THREE.Mesh(extrudeProfile(glassPts, W - 0.34, 0.04), glass);
    group.add(cabin);
    const roofLen = (gFront - (kind === 'sport' ? 0.85 : 0.6)) - (gRear + (kind === 'suv' ? 0.15 : 0.5));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.05, roofLen + 0.04), paint);
    roof.position.set(0, roofY - 0.01, (gRear + (kind === 'suv' ? 0.15 : 0.5) + gFront - (kind === 'sport' ? 0.85 : 0.6)) / 2);
    roof.castShadow = true;
    group.add(roof);
    // Paraurti, griglia, luci, targa, specchietti
    for (const z of [front + 0.04, rear - 0.04]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.16, 0.12), black);
      bump.position.set(0, 0.34, z);
      group.add(bump);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.45, 0.14, 0.02), black);
    grille.position.set(0, 0.55 * k, front + 0.03);
    group.add(grille);
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.04), headMat);
      hl.position.set(sx * (W / 2 - 0.3), 0.62 * k, front + 0.02);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.04), tailMat);
      tl.position.set(sx * (W / 2 - 0.28), 0.7 * k, rear - 0.02);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.07), paint);
      mirror.position.set(sx * (W / 2 + 0.04), 0.98 * k, gFront - 0.15);
      group.add(hl, tl, mirror);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.14), chrome);
      handle.position.set(sx * (W / 2 - 0.02), 0.82 * k, 0.1);
      group.add(handle);
    }
    for (const z of [front + 0.105, rear - 0.105]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.01), std(0xf2f2ee));
      plate.position.set(0, 0.36, z);
      group.add(plate);
    }
    const wb = L / 2 - 0.72;
    for (const [sx, sz, isFront] of [[-1, wb, true], [1, wb, true], [-1, -wb, false], [1, -wb, false]]) {
      const holder = new THREE.Group();
      holder.position.set(sx * (W / 2 - 0.13), s.wheelR, sz);
      const w = wheel(s.wheelR, 0.24, kind);
      holder.add(w);
      group.add(holder);
      wheels.push({ node: w, front: isFront });
      if (isFront) steerNodes.push(holder);
    }
  } else if (kind === 'moto') {
    const r = s.wheelR;
    const fw = twoWheel(r, 0.065);
    const rw = twoWheel(r, 0.075);
    const fHolder = new THREE.Group();
    fHolder.position.set(0, r, s.wheelBase / 2);
    fHolder.add(fw);
    rw.position.set(0, r, -s.wheelBase / 2);
    group.add(fHolder, rw);
    wheels.push({ node: fw, front: true }, { node: rw, front: false });
    steerNodes.push(fHolder);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 6, 12), paint);
    tank.rotation.x = Math.PI / 2 - 0.15;
    tank.scale.set(1, 1, 0.85);
    tank.position.set(0, 0.86, 0.22);
    tank.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.62), black);
    seat.position.set(0, 0.82, -0.3);
    seat.rotation.x = 0.08;
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.4), std(0x3a3d42, { metalness: 0.7, roughness: 0.35 }));
    engine.position.set(0, 0.48, 0.05);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.4), paint);
    tail.position.set(0, 0.86, -0.7);
    tail.rotation.x = -0.25;
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 12), chrome);
    exhaust.rotation.x = Math.PI / 2 - 0.2;
    exhaust.position.set(0.18, 0.42, -0.45);
    group.add(tank, seat, engine, tail, exhaust);
    const fork = new THREE.Group();
    fHolder.add(fork);
    for (const sx of [-0.08, 0.08]) tube(fork, new THREE.Vector3(sx, 0, 0), new THREE.Vector3(sx, 0.62, -0.22), 0.022, chrome);
    tube(fork, new THREE.Vector3(-0.32, 0.72, -0.27), new THREE.Vector3(0.32, 0.72, -0.27), 0.016, black);
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), headMat);
    light.rotation.x = Math.PI / 2;
    light.position.set(0, 0.55, -0.1);
    fork.add(light);
    tube(group, new THREE.Vector3(0, 0.75, 0.45), new THREE.Vector3(0, r, -s.wheelBase / 2), 0.035, black);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), tailMat);
    tl.position.set(0, 0.84, -0.92);
    group.add(tl);
  } else if (kind === 'scooter') {
    const r = s.wheelR;
    const fw = twoWheel(r, 0.07);
    const rw = twoWheel(r, 0.08);
    const fHolder = new THREE.Group();
    fHolder.position.set(0, r, s.wheelBase / 2);
    fHolder.add(fw);
    rw.position.set(0, r, -s.wheelBase / 2);
    group.add(fHolder, rw);
    wheels.push({ node: fw, front: true }, { node: rw, front: false });
    steerNodes.push(fHolder);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.6), paint);
    floor.position.set(0, 0.32, 0.05);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.1), paint);
    shield.position.set(0, 0.68, 0.42);
    shield.rotation.x = -0.25;
    const rearBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), paint);
    rearBody.rotation.x = Math.PI / 2;
    rearBody.scale.set(1, 1, 0.8);
    rearBody.position.set(0, 0.55, -0.42);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.6), black);
    seat.position.set(0, 0.76, -0.32);
    [floor, shield, rearBody, seat].forEach((m) => { m.castShadow = true; group.add(m); });
    const col = new THREE.Group();
    fHolder.add(col);
    tube(col, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.75, -0.12), 0.03, black);
    tube(col, new THREE.Vector3(-0.3, 0.8, -0.14), new THREE.Vector3(0.3, 0.8, -0.14), 0.016, black);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), headMat);
    light.position.set(0, 0.72, -0.08);
    col.add(light);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), tailMat);
    tl.position.set(0, 0.6, -0.86);
    group.add(tl);
  } else {
    // bicicletta
    const r = s.wheelR;
    const fw = twoWheel(r, 0.022);
    const rw = twoWheel(r, 0.022);
    const fHolder = new THREE.Group();
    fHolder.position.set(0, r, s.wheelBase / 2);
    fHolder.add(fw);
    rw.position.set(0, r, -s.wheelBase / 2);
    group.add(fHolder, rw);
    wheels.push({ node: fw, front: true }, { node: rw, front: false });
    steerNodes.push(fHolder);
    const frame = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1 });
    const bb = new THREE.Vector3(0, r, 0.0);
    const seatTop = new THREE.Vector3(0, 0.88, -0.22);
    const head = new THREE.Vector3(0, 0.86, 0.38);
    const rearAx = new THREE.Vector3(0, r, -s.wheelBase / 2);
    tube(group, bb, seatTop, 0.02, frame);
    tube(group, bb, head, 0.022, frame);
    tube(group, seatTop, head, 0.02, frame);
    tube(group, bb, rearAx, 0.014, frame);
    tube(group, seatTop, rearAx, 0.014, frame);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.25), black);
    saddle.position.set(0, 0.93, -0.24);
    group.add(saddle);
    const fork = new THREE.Group();
    fHolder.add(fork);
    tube(fork, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.6, -0.12), 0.016, chrome);
    tube(fork, new THREE.Vector3(-0.28, 0.66, -0.15), new THREE.Vector3(0.28, 0.66, -0.15), 0.014, black);
    const crank = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), chrome);
    crank.rotation.z = Math.PI / 2;
    crank.position.copy(bb);
    group.add(crank);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { group, wheels, steerNodes };
}

let UID = 1;

export class Vehicle {
  /**
   * @param {{ model: string, color?: number, x: number, z: number, heading?: number, owner?: 'player'|'npc'|'stolen', uid?: string }} o
   */
  constructor(scene, physics, o) {
    this.scene = scene;
    this.physics = physics;
    this.model = o.model;
    const def = VEHICLE_MODELS[o.model] || VEHICLE_MODELS.berlina;
    this.name = def.name;
    this.kind = def.kind;
    this.spec = SPECS[this.kind];
    this.color = o.color ?? def.colors[0];
    this.owner = o.owner || 'npc';
    this.uid = o.uid || `v${Date.now().toString(36)}${(UID++).toString(36)}`;
    const built = buildVehicleMesh(this.kind, this.color);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.steerNodes = built.steerNodes;
    scene.add(this.mesh);

    const s = this.spec;
    this.body = new CANNON.Body({ mass: s.mass, allowSleep: false, linearDamping: 0.02, angularDamping: 0.6 });
    const sphereR = s.ride ? 0.28 : 0.32;
    if (s.ride) {
      this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.2, (s.h - 0.45) / 2, s.len / 2 - 0.15)), new CANNON.Vec3(0, 0.45 + (s.h - 0.45) / 2, 0));
      for (const z of [s.wheelBase / 2, -s.wheelBase / 2]) this.body.addShape(new CANNON.Sphere(sphereR), new CANNON.Vec3(0, sphereR, z));
    } else {
      const chassisH = s.h - 0.32;
      this.body.addShape(new CANNON.Box(new CANNON.Vec3(s.wid / 2, chassisH / 2, s.len / 2)), new CANNON.Vec3(0, 0.32 + chassisH / 2, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        this.body.addShape(new CANNON.Sphere(sphereR), new CANNON.Vec3(sx * (s.wid / 2 - 0.3), sphereR, sz * (s.len / 2 - 0.7)));
      }
    }
    this.body.angularFactor.set(0, 1, 0);
    this.body.collisionFilterGroup = GROUPS.VEHICLE;
    this.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PLAYER | GROUPS.NPC | GROUPS.VEHICLE;
    this.body.position.set(o.x, 0.25, o.z);
    this.body.quaternion.setFromEuler(0, o.heading || 0, 0);
    physics.addBody(this.body);

    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.occupied = false;
    this.impact = 0;
    this.lean = 0;
  }

  get heading() {
    const q = this.body.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  get position() {
    return this.body.interpolatedPosition;
  }

  get locked() {
    return this.owner === 'npc';
  }

  /** Punto di discesa sul lato sinistro (lato guida). */
  exitPoint() {
    const h = this.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = fz, lz = -fx;
    const d = this.spec.wid / 2 + 0.75;
    const p = this.body.position;
    return { x: p.x + lx * d, z: p.z + lz * d, facing: h };
  }

  /** Punto della sella in coordinate mondo (dove vanno appoggiate le anche del pilota). */
  seatPosition() {
    const h = this.heading;
    const p = this.position;
    const s = this.spec;
    return new THREE.Vector3(p.x + Math.sin(h) * s.seatZ, p.y + s.seatY, p.z + Math.cos(h) * s.seatZ);
  }

  /**
   * @param {number} dt
   * @param {{ throttle: boolean, brake: boolean, steer: number, handbrake: boolean } | null} ctl
   */
  update(dt, ctl) {
    const s = this.spec;
    const h = this.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const v = this.body.velocity;
    const measured = v.x * fx + v.z * fz;
    const lost = Math.abs(this.speed) - Math.abs(measured);
    this.impact = this.occupied && lost > 6 ? lost : 0;
    let speed = measured;

    if (ctl) {
      this.steer += (ctl.steer - this.steer) * Math.min(1, dt * 6);
      if (ctl.throttle) {
        if (speed < -0.4) speed += s.brake * dt;
        else speed += s.accel * dt * Math.max(0.15, 1 - speed / s.maxSpeed);
      } else if (ctl.brake) {
        if (speed > 0.4) speed -= s.brake * dt;
        else speed -= s.reverseAccel * dt;
      } else {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), (1.2 + Math.abs(speed) * 0.06) * dt);
      }
      if (ctl.handbrake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), s.brake * 1.4 * dt);
    } else {
      this.steer += (0 - this.steer) * Math.min(1, dt * 4);
      speed -= Math.sign(speed) * Math.min(Math.abs(speed), 7 * dt);
    }
    speed = THREE.MathUtils.clamp(speed, -s.reverseMax, s.maxSpeed);
    const yawRate = this.steer * s.steer * THREE.MathUtils.clamp(speed / 5, -1, 1) / (1 + Math.abs(speed) / 30);
    v.x = fx * speed;
    v.z = fz * speed;
    if (v.y > 2) v.y = 2; // niente "salti" sui cordoli
    this.body.angularVelocity.set(0, Math.abs(speed) < 0.05 ? 0 : yawRate, 0);
    if (!ctl && Math.abs(speed) < 0.05) { v.x = 0; v.z = 0; }
    this.speed = speed;
    this.yawRate = yawRate;
  }

  sync(dt) {
    const p = this.body.interpolatedPosition;
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(this.body.interpolatedQuaternion.x, this.body.interpolatedQuaternion.y, this.body.interpolatedQuaternion.z, this.body.interpolatedQuaternion.w);
    if (this.spec.ride) {
      const targetLean = THREE.MathUtils.clamp(-(this.yawRate || 0) * this.speed * 0.045, -0.45, 0.45);
      this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
      this.mesh.rotateZ(this.lean);
    }
    this.wheelSpin += (this.speed / this.spec.wheelR) * dt;
    for (const w of this.wheels) w.node.rotation.x = this.wheelSpin;
    for (const n of this.steerNodes) n.rotation.y = this.steer * 0.45;
  }

  dispose() {
    this.physics.removeBody(this.body);
    this.scene.remove(this.mesh);
    disposeObject3D(this.mesh);
  }
}

/** Gestisce tutti i veicoli: parcheggiati (non tuoi), acquistati, rubati. */
export class VehicleManager {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.list = [];
  }

  add(opts) {
    const v = new Vehicle(this.scene, this.physics, opts);
    this.list.push(v);
    return v;
  }

  remove(v) {
    v.dispose();
    this.list = this.list.filter((x) => x !== v);
  }

  spawnParked(spots, rng) {
    const models = ['utilitaria', 'utilitaria', 'berlina', 'berlina', 'suv', 'sportiva', 'motorino', 'moto_naked', 'bici'];
    for (const [x, z, heading] of spots) {
      const model = models[Math.floor(rng() * models.length)];
      const colors = VEHICLE_MODELS[model].colors;
      this.add({ model, color: colors[Math.floor(rng() * colors.length)], x, z, heading, owner: 'npc' });
    }
  }

  spawnSaved(saved) {
    for (const s of saved) this.add({ ...s, owner: s.owner === 'stolen' ? 'stolen' : 'player' });
  }

  /** Veicolo più vicino entro maxDist dal bordo. */
  nearest(x, z, maxDist = 1.6) {
    let best = null;
    let bestD = Infinity;
    for (const v of this.list) {
      if (v.occupied) continue;
      const p = v.body.position;
      const d = Math.hypot(p.x - x, p.z - z) - Math.max(v.spec.wid, v.spec.len * 0.5) * 0.5;
      if (d < maxDist && d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  update(dt, driven, ctl) {
    for (const v of this.list) v.update(dt, v === driven ? ctl : null);
  }

  sync(dt) {
    for (const v of this.list) v.sync(dt);
  }

  serializeOwned() {
    return this.list
      .filter((v) => v.owner === 'player' || v.owner === 'stolen')
      .map((v) => ({
        uid: v.uid, model: v.model, color: v.color, owner: v.owner,
        x: +v.body.position.x.toFixed(2), z: +v.body.position.z.toFixed(2), heading: +v.heading.toFixed(3),
      }));
  }

  dispose() {
    for (const v of this.list) v.dispose();
    this.list = [];
  }
}
