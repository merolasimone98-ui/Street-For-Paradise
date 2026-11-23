// NPC: pedoni sui marciapiedi, barboni a cui donare, e la classe base per camerieri e poliziotti.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makePerson, HumanAnimator, randomLook } from './characters.js';
import { GROUPS } from './playerstate.js';
import { disposeObject3D } from './ui.js';
import { BLOCK, GRID, CELL, HALF, RINGS, districtForRow } from './world.js';
import { audio } from './audio.js';

const SIDEWALK_Y = 0.2;
const NAMES_M = ['Marco', 'Luca', 'Ahmed', 'Carlos', 'Kenji', 'Oleg', 'David', 'Samuel', 'Paolo', 'Tom'];
const NAMES_F = ['Giulia', 'Sara', 'Aisha', 'Maria', 'Yuki', 'Elena', 'Fatima', 'Laura', 'Chiara', 'Ana'];

const blockCenter = (i) => -HALF + i * CELL + CELL / 2;

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Persona non giocante con corpo cinematico Cannon (sincronizzato con il modello). */
export class Npc {
  constructor(scene, physics, look, { x, y = 0, z, facing = 0, name = null, radius = 0.33 }) {
    this.scene = scene;
    this.physics = physics;
    this.look = look;
    this.name = name || (look.sex === 'f' ? NAMES_F : NAMES_M)[Math.floor(Math.random() * 10)];
    this.mesh = makePerson(look);
    this.mesh.userData.npc = this; // per il raycast dei proiettili
    this.animator = new HumanAnimator(this.mesh);
    this.pos = new THREE.Vector3(x, y, z);
    this.facing = facing;
    this.speed = 0;
    this.path = null;
    this.pathIdx = 0;
    this.walkSpeed = 1.3;
    this.onArrive = null;
    this.pose = 'auto';
    this.lookTarget = null;
    scene.add(this.mesh);
    this.body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    this.body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, radius, 0));
    this.body.addShape(new CANNON.Sphere(radius), new CANNON.Vec3(0, 1.2, 0));
    this.body.collisionFilterGroup = GROUPS.NPC;
    this.body.collisionFilterMask = GROUPS.PLAYER | GROUPS.VEHICLE;
    this.body.position.set(x, y, z);
    physics.addBody(this.body);
    this.sync();
  }

  walkTo(points, speed = 1.3, onArrive = null) {
    this.path = points.map((p) => new THREE.Vector3(p.x, p.y ?? this.pos.y, p.z));
    this.pathIdx = 0;
    this.walkSpeed = speed;
    this.onArrive = onArrive;
  }

  stop() {
    this.path = null;
    this.speed = 0;
  }

  /** Colpito (o spinto a terra): resta sdraiato per qualche secondo, poi si rialza. */
  knockDown(seconds = 12) {
    this.downT = seconds;
    this.stop();
  }

  update(dt, animate = true) {
    if (this.downT > 0) {
      this.downT -= dt;
      this.body.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.mesh.position.set(this.pos.x, this.pos.y + 0.12, this.pos.z);
      this.mesh.rotation.set(-Math.PI / 2, 0, 0, 'YXZ');
      this.mesh.rotation.y = this.facing;
      if (animate) this.animator.update(dt, { speed: 0, state: 'lie' });
      if (this.downT <= 0) this.mesh.rotation.set(0, this.facing, 0);
      return;
    }
    let moving = false;
    if (this.path && this.pose === 'auto') {
      const target = this.path[this.pathIdx];
      const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.pos.y = target.y;
        this.pathIdx++;
        if (this.pathIdx >= this.path.length) {
          const cb = this.onArrive;
          this.path = null;
          this.onArrive = null;
          if (cb) cb(this);
        }
      } else {
        const step = Math.min(d, this.walkSpeed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.pos.y += (target.y - this.pos.y) * Math.min(1, dt * 6);
        this.facing = lerpAngle(this.facing, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt));
        moving = true;
      }
    }
    if (!moving && this.lookTarget) {
      const a = Math.atan2(this.lookTarget.x - this.pos.x, this.lookTarget.z - this.pos.z);
      this.facing = lerpAngle(this.facing, a, 1 - Math.exp(-5 * dt));
    }
    this.speed += ((moving ? this.walkSpeed : 0) - this.speed) * Math.min(1, dt * 8);
    this.body.velocity.set(0, 0, 0);
    this.body.position.set(this.pos.x, this.pos.y, this.pos.z);
    if (!animate) return; // lontano dal giocatore: si muove ma non si anima (prestazioni)
    this.sync();
    // Reazioni momentanee (clacson, abbaglianti) sopra la camminata
    const state = this.reactT > 0 && this.reactPose ? this.reactPose : this.pose === 'auto' ? 'auto' : this.pose;
    this.animator.update(dt, { speed: this.speed, grounded: true, state });
  }

  sync() {
    if (this.pose === 'sit' && this.seatY != null) {
      this.mesh.position.set(this.pos.x, this.seatY - this.mesh.userData.hipHeight + 0.05, this.pos.z);
    } else {
      this.mesh.position.copy(this.pos);
    }
    this.mesh.rotation.y = this.facing;
  }

  setVisible(v) {
    this.mesh.visible = v;
  }

  dispose() {
    this.physics.removeBody(this.body);
    this.scene.remove(this.mesh);
    disposeObject3D(this.mesh);
  }
}

/* ---------- Frasi ---------- */
const TALK_GOOD = [
  'Buongiorno! Si vede che sei una brava persona.',
  'Grazie per aver salutato, non lo fa più nessuno.',
  'Che bella giornata, vero? Dio ti benedica.',
  'Ti ho visto aiutare quel signore l\'altro giorno. Bravo!',
];
const TALK_NEUTRAL = [
  'Scusa, vado di fretta.',
  'Conosci un buon ristorante qui vicino? C\'è una trattoria in centro.',
  'Hai visto i prezzi delle case? Assurdo.',
  'Il concessionario in periferia fa buoni prezzi sulle moto.',
  'Se ti serve contante c\'è un bancomat sul marciapiede.',
  'Questa città non dorme mai.',
];
const TALK_BAD = [
  'Stai lontano da me.',
  'Ho sentito parlare di te... meglio non avere guai.',
  'Non ho niente per te, vattene.',
];
const HOMELESS_THANKS = [
  'Grazie di cuore. Che Dio ti benedica.',
  'Non so come ringraziarti… oggi potrò mangiare.',
  'Sei un angelo. Ricorderò il tuo volto.',
  'Grazie, fratello. La gente di solito non mi guarda nemmeno.',
];

/* ---------- Gestore NPC ---------- */
export class NpcManager {
  constructor(scene, physics, world, state, rng) {
    this.scene = scene;
    this.physics = physics;
    this.world = world;
    this.state = state;
    this.rng = rng;
    this.pedestrians = [];
    this.homeless = [];
    this.giftMeshes = [];
    this.visible = true;
  }

  spawnPedestrians(count) {
    const lane = BLOCK / 2 - 2.8;
    for (let i = 0; i < count; i++) {
      // 70% in centro città, 30% nei quartieri residenziali
      const inCity = this.rng() < 0.7;
      const span = inCity ? GRID : GRID + RINGS * 2;
      const off = inCity ? 0 : -RINGS;
      const r = off + Math.floor(this.rng() * span), c = off + Math.floor(this.rng() * span);
      const cx = blockCenter(c), cz = blockCenter(r);
      const corners = [
        new THREE.Vector3(cx - lane, SIDEWALK_Y, cz - lane), new THREE.Vector3(cx + lane, SIDEWALK_Y, cz - lane),
        new THREE.Vector3(cx + lane, SIDEWALK_Y, cz + lane), new THREE.Vector3(cx - lane, SIDEWALK_Y, cz + lane),
      ];
      if (this.rng() < 0.5) corners.reverse();
      const start = Math.floor(this.rng() * 4);
      const t = this.rng();
      const a = corners[start], b = corners[(start + 1) % 4];
      const p = a.clone().lerp(b, t);
      const npc = new Npc(this.scene, this.physics, randomLook(this.rng), { x: p.x, y: SIDEWALK_Y, z: p.z });
      npc.corners = corners;
      npc.cornerIdx = (start + 1) % 4;
      npc.baseSpeed = 1.1 + this.rng() * 0.6;
      npc.kind = 'pedestrian';
      npc.talkedDay = -1;
      this.nextLeg(npc);
      this.pedestrians.push(npc);
    }
  }

  nextLeg(npc) {
    const target = npc.corners[npc.cornerIdx];
    npc.walkTo([target], npc.fleeT > 0 ? 5.4 : npc.baseSpeed, () => {
      npc.cornerIdx = (npc.cornerIdx + 1) % 4;
      this.nextLeg(npc);
    });
  }

  spawnHomeless(spots) {
    spots.forEach((s, i) => {
      const id = `h${i}`;
      const look = { ...randomLook(this.rng), shirt: 0x5b5346, pants: 0x3e3a33, shoes: 0x2b2620, sleeves: 'long', cap: null, glasses: false, beard: true, sex: 'm', hairStyle: 'curly', hair: 0x6b6b66 };
      const npc = new Npc(this.scene, this.physics, look, { x: s.x, y: SIDEWALK_Y, z: s.z, facing: s.facing, name: ['Giuseppe', 'Franco', 'Abdul', 'Mario', 'Ivan', 'Pietro'][i % 6] });
      npc.kind = 'homeless';
      npc.id = id;
      npc.pose = 'sit';
      npc.seatY = SIDEWALK_Y + 0.32;
      // Cassetta, cartone, bicchiere
      const g = new THREE.Group();
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 1 }));
      crate.position.set(0, 0.15, -0.05);
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.02), new THREE.MeshStandardMaterial({ color: 0xc9a77a, roughness: 1 }));
      card.position.set(0.45, 0.18, 0.35);
      card.rotation.y = -0.4;
      card.rotation.x = -0.3;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 12), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 }));
      cup.position.set(-0.3, 0.05, 0.45);
      g.add(crate, card, cup);
      g.position.set(s.x, SIDEWALK_Y, s.z);
      g.rotation.y = s.facing;
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g);
      npc.props = g;
      npc.spot = s;
      this.homeless.push(npc);
      this.refreshGifts(npc);
    });
  }

  /** Mostra accanto al barbone i regali "visibili" (sacco a pelo, tenda, coperta). */
  refreshGifts(npc) {
    if (npc.giftGroup) { this.scene.remove(npc.giftGroup); disposeObject3D(npc.giftGroup); }
    const gifts = this.state.homelessGifts[npc.id] || {};
    const g = new THREE.Group();
    if (gifts.sacco_a_pelo) {
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.3, 6, 12), new THREE.MeshStandardMaterial({ color: 0x2f6b9a, roughness: 0.8 }));
      bag.rotation.z = Math.PI / 2;
      bag.position.set(-1.2, 0.2, 0.1);
      g.add(bag);
    }
    if (gifts.tenda) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.3, 4), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.9 }));
      tent.rotation.y = Math.PI / 4;
      tent.scale.set(1, 1, 1.4);
      tent.position.set(1.7, 0.65, -0.3);
      g.add(tent);
    }
    if (gifts.coperta) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.5), new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 1 }));
      bl.position.set(0, 0.33, 0.15);
      g.add(bl);
    }
    g.position.set(npc.spot.x, SIDEWALK_Y, npc.spot.z);
    g.rotation.y = npc.spot.facing;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(g);
    npc.giftGroup = g;
  }

  setVisible(v) {
    this.visible = v;
    for (const n of [...this.pedestrians, ...this.homeless]) {
      n.setVisible(v);
      if (n.props) n.props.visible = v;
      if (n.giftGroup) n.giftGroup.visible = v;
    }
  }

  /**
   * Panico (furto, rapina, spari): i passanti vicini scappano di corsa lungo il marciapiede,
   * nella direzione opposta al pericolo, e qualcuno urla.
   */
  panic(x, z, radius = 45) {
    let screams = 0;
    for (const n of this.pedestrians) {
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d > radius || n.inConversation) continue;
      const wasFleeing = n.fleeT > 0;
      n.fleeT = 8 + Math.random() * 4;
      n.reactT = 0;
      if (n.savedPath) { n.savedPath = null; }
      // Se l'angolo verso cui cammina è più vicino al pericolo, inverte il giro dell'isolato
      const next = n.corners[n.cornerIdx];
      if (Math.hypot(next.x - x, next.z - z) < d) {
        n.corners = n.corners.slice().reverse();
        n.cornerIdx = (n.corners.length - 1 - n.cornerIdx + 1) % n.corners.length;
      }
      this.nextLeg(n);
      if (!wasFleeing && screams < 2 && d < 30) {
        screams++;
        setTimeout(() => audio.scream(n.look && n.look.sex === 'f'), Math.random() * 400);
      }
    }
  }

  /** Clacson: chi è vicino sobbalza e si gira verso il rumore. */
  startle(x, z, radius = 22) {
    for (const n of this.pedestrians) {
      if (n.fleeT > 0 || n.inConversation) continue;
      if (Math.hypot(n.pos.x - x, n.pos.z - z) > radius) continue;
      n.reactT = 1.3;
      n.reactPose = 'startle';
      n.reactLook = { x, z };
    }
  }

  /** Abbaglianti puntati addosso: si coprono gli occhi. */
  dazzle(x, z, heading, range = 45) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const n of this.pedestrians) {
      if (n.fleeT > 0 || n.reactT > 0) continue;
      const dx = n.pos.x - x, dz = n.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 2) continue;
      if ((dx * fx + dz * fz) / d < 0.95) continue;
      n.reactT = 2.2;
      n.reactPose = 'shield';
      n.reactLook = { x, z };
    }
  }

  update(dt, playerFeet) {
    if (!this.visible) return;
    for (const n of this.pedestrians) {
      const d = n.pos.distanceTo(playerFeet);
      if (n.fleeT > 0) {
        n.fleeT -= dt;
        if (n.fleeT <= 0 && n.path) n.walkSpeed = n.baseSpeed; // si calma e torna a camminare
      }
      if (n.reactT > 0) n.reactT -= dt;
      const reacting = n.reactT > 0 && n.fleeT <= 0;
      // Si ferma se il giocatore gli è proprio davanti (o reagisce a clacson/fari), poi riprende
      if ((d < 1.4 && !(n.fleeT > 0)) || n.inConversation || reacting) {
        if (n.path) { n.savedPath = { path: n.path, idx: n.pathIdx, cb: n.onArrive }; n.path = null; }
        n.lookTarget = reacting && n.reactLook ? n.reactLook : playerFeet;
      } else if (!n.path && n.savedPath) {
        n.path = n.savedPath.path; n.pathIdx = n.savedPath.idx; n.onArrive = n.savedPath.cb; n.savedPath = null;
        n.lookTarget = null;
      }
      const near = d < 75;
      n.mesh.visible = near;
      if (near) n.update(dt);
      else {
        // fuori vista: si muove lo stesso, senza animare
        n.update(dt, false);
      }
    }
    for (const h of this.homeless) {
      const d = h.pos.distanceTo(playerFeet);
      h.lookTarget = d < 6 ? playerFeet : null;
      if (d < 120) h.update(dt);
    }
  }

  /** NPC interagibile più vicino. */
  nearest(x, z, maxDist = 2.0) {
    let best = null, bestD = maxDist;
    for (const n of [...this.homeless, ...this.pedestrians]) {
      const d = Math.hypot(n.pos.x - x, n.pos.z - z);
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  talkLine(aura) {
    const pool = aura >= 65 ? [...TALK_GOOD, ...TALK_NEUTRAL] : aura <= 25 ? [...TALK_BAD, ...TALK_NEUTRAL] : TALK_NEUTRAL;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  thanksLine() {
    return HOMELESS_THANKS[Math.floor(Math.random() * HOMELESS_THANKS.length)];
  }

  /** Posizioni per la mappa grande. */
  mapDots() {
    return [
      ...this.pedestrians.map((n) => ({ x: n.pos.x, z: n.pos.z, kind: 'pedestrian' })),
      ...this.homeless.map((n) => ({ x: n.pos.x, z: n.pos.z, kind: 'homeless' })),
    ];
  }

  dispose() {
    for (const n of [...this.pedestrians, ...this.homeless]) {
      n.dispose();
      if (n.props) { this.scene.remove(n.props); disposeObject3D(n.props); }
      if (n.giftGroup) { this.scene.remove(n.giftGroup); disposeObject3D(n.giftGroup); }
    }
    this.pedestrians = [];
    this.homeless = [];
  }
}

/** Sceglie dove far sedere i barboni (lontano dalle porte), in centro e periferia. */
export function pickHomelessSpots(world, rng, count = 5) {
  const spots = [];
  const featureKeys = new Set(Object.keys(world.features));
  const candidates = [];
  for (let r = 2; r < GRID; r++) for (let c = 0; c < GRID; c++) {
    if (featureKeys.has(`${r},${c}`)) continue;
    const dist = districtForRow(r);
    if (dist.id === 'rich') continue;
    candidates.push([r, c]);
  }
  for (let i = 0; i < count && candidates.length; i++) {
    const [r, c] = candidates.splice(Math.floor(rng() * candidates.length), 1)[0];
    const cx = blockCenter(c), cz = blockCenter(r);
    const south = rng() < 0.5;
    const off = BLOCK / 2 - 3.6;
    spots.push({ x: cx + (rng() < 0.5 ? -12 : 12), z: south ? cz + off : cz - off, facing: south ? 0 : Math.PI });
  }
  return spots;
}
