// Personaggi umani procedurali (proporzioni realistiche, articolazioni a due segmenti) + animatore.
import * as THREE from 'three';

const BASE_HEIGHT = 1.79; // altezza del modello prima della scala
const HIP_Y = 0.95;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

// Geometrie condivise (create una volta sola: molti personaggi in scena)
const GEO = {};
function geo(key, make) {
  if (!GEO[key]) {
    GEO[key] = make();
    GEO[key].userData.shared = true;
  }
  return GEO[key];
}

/** Segmento capsulare orientato lungo -Y a partire dal pivot. */
function limb(parent, radius, length, material, key) {
  const m = new THREE.Mesh(geo(key, () => new THREE.CapsuleGeometry(radius, length, 4, 10)), material);
  m.position.y = -(length / 2 + radius * 0.6);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * Crea una persona con i piedi a y = 0, rivolta verso +Z.
 * Opzioni: height, skin, hair, hairStyle ('short'|'long'|'buzz'|'bun'|'curly'), shirt, pants, shoes,
 * sex, child, sleeves ('short'|'long'), cap, bracelet, ring, glasses, beard, uniform ('police'|'waiter'|null)
 */
export function makePerson(opts = {}) {
  const {
    height = 1.75, skin = 0xd29f78, hair = 0x2e1f15, shirt = 0x3a5a8a, pants = 0x2b2b33, shoes = 0x1b1b1d,
    sex = 'm', child = false, sleeves = 'short', cap = null, bracelet = null, ring = null, glasses = null,
    beard = false, uniform = null,
  } = opts;
  const hairStyle = opts.hairStyle || (sex === 'f' ? 'long' : 'short');

  const mSkin = mat(skin, { roughness: 0.62 });
  const mShirt = mat(shirt, { roughness: 0.92 });
  const mPants = mat(pants, { roughness: 0.9 });
  const mShoe = mat(shoes, { roughness: 0.55 });
  const mHair = mat(hair, { roughness: 0.75 });
  const mEye = new THREE.MeshStandardMaterial({ color: 0x1b120d, roughness: 0.2 });
  const mWhite = mat(0xf4f1ea, { roughness: 0.4 });
  const mLip = mat(new THREE.Color(skin).multiplyScalar(0.78).getHex(), { roughness: 0.6 });

  const g = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  g.add(hips);

  // Bacino
  const pelvis = new THREE.Mesh(geo('pelvis', () => new THREE.SphereGeometry(1, 16, 12)), mPants);
  pelvis.scale.set(sex === 'f' ? 0.175 : 0.165, 0.12, 0.115);
  pelvis.position.y = 0.02;
  pelvis.castShadow = true;
  hips.add(pelvis);

  // Busto (spina dorsale)
  const spine = new THREE.Group();
  spine.position.y = 0.06;
  hips.add(spine);
  const torso = new THREE.Mesh(geo('torso', () => new THREE.CapsuleGeometry(0.15, 0.3, 6, 14)), mShirt);
  torso.scale.set(sex === 'f' ? 1.02 : 1.18, 1, 0.66);
  torso.position.y = 0.24;
  torso.castShadow = true;
  spine.add(torso);
  const shoulders = new THREE.Mesh(geo('shoulders' + sex, () => new THREE.CapsuleGeometry(0.075, sex === 'f' ? 0.24 : 0.28, 4, 10)), mShirt);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.y = 0.43;
  shoulders.scale.z = 0.85;
  shoulders.castShadow = true;
  spine.add(shoulders);
  if (uniform === 'police') {
    const belt = new THREE.Mesh(geo('belt', () => new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16)), mat(0x111111, { roughness: 0.4 }));
    belt.scale.z = 0.7;
    belt.position.y = 0.02;
    spine.add(belt);
    const badge = new THREE.Mesh(geo('badge', () => new THREE.BoxGeometry(0.05, 0.06, 0.01)), mat(0xd6a73a, { metalness: 0.9, roughness: 0.25 }));
    badge.position.set(-0.08, 0.36, 0.1);
    spine.add(badge);
  }
  if (uniform === 'waiter') {
    const apron = new THREE.Mesh(geo('apron', () => new THREE.BoxGeometry(0.3, 0.5, 0.02)), mat(0xf4f4f2, { roughness: 1 }));
    apron.position.set(0, -0.1, 0.12);
    spine.add(apron);
  }

  // Collo e testa
  const neck = new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.048, 0.055, 0.1, 10)), mSkin);
  neck.position.y = 0.52;
  spine.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.56;
  spine.add(head);
  const skull = new THREE.Mesh(geo('skull', () => new THREE.SphereGeometry(0.1, 24, 18)), mSkin);
  skull.scale.set(0.9, 1.12, 1.0);
  skull.position.y = 0.11;
  skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(geo('jaw', () => new THREE.SphereGeometry(0.07, 16, 12)), mSkin);
  jaw.scale.set(1.0, 0.75, 1.0);
  jaw.position.set(0, 0.045, 0.022);
  head.add(jaw);
  const nose = new THREE.Mesh(geo('nose', () => new THREE.ConeGeometry(0.016, 0.045, 8)), mSkin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.1, 0.104);
  head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.022, 8, 8)), mSkin);
    ear.scale.set(0.5, 1, 0.8);
    ear.position.set(sx * 0.09, 0.11, 0);
    head.add(ear);
    const white = new THREE.Mesh(geo('eyeW', () => new THREE.SphereGeometry(0.014, 10, 8)), mWhite);
    white.position.set(sx * 0.034, 0.128, 0.084);
    white.scale.z = 0.6;
    head.add(white);
    const eye = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.008, 8, 6)), mEye);
    eye.position.set(sx * 0.034, 0.128, 0.092);
    head.add(eye);
    const brow = new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.03, 0.006, 0.01)), mHair);
    brow.position.set(sx * 0.034, 0.152, 0.091);
    brow.rotation.z = sx * -0.12;
    head.add(brow);
  }
  const mouth = new THREE.Mesh(geo('mouth', () => new THREE.BoxGeometry(0.036, 0.007, 0.01)), mLip);
  mouth.position.set(0, 0.06, 0.088);
  head.add(mouth);

  // Capelli
  if (hairStyle !== 'bald') {
    const top = new THREE.Mesh(geo('hairTop', () => new THREE.SphereGeometry(0.106, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.52)), mHair);
    top.scale.set(0.92, hairStyle === 'buzz' ? 1.02 : 1.12, 1.04);
    top.position.set(0, 0.125, -0.006);
    top.rotation.x = -0.18;
    head.add(top);
    if (hairStyle === 'long') {
      const back = new THREE.Mesh(geo('hairLong', () => new THREE.CapsuleGeometry(0.085, 0.18, 4, 10)), mHair);
      back.scale.set(1.05, 1, 0.55);
      back.position.set(0, 0.0, -0.06);
      head.add(back);
    } else if (hairStyle === 'bun') {
      const bun = new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.045, 12, 10)), mHair);
      bun.position.set(0, 0.2, -0.08);
      head.add(bun);
    } else if (hairStyle === 'curly') {
      for (let i = 0; i < 7; i++) {
        const c = new THREE.Mesh(geo('curl', () => new THREE.SphereGeometry(0.04, 8, 6)), mHair);
        const a = (i / 7) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.07, 0.2 + Math.sin(a * 2) * 0.01, Math.sin(a) * 0.07 - 0.01);
        head.add(c);
      }
    }
  }
  if (beard) {
    const b = new THREE.Mesh(geo('beard', () => new THREE.SphereGeometry(0.072, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)), mHair);
    b.position.set(0, 0.075, 0.015);
    head.add(b);
  }
  if (cap || uniform === 'police') {
    const capMat = mat(uniform === 'police' ? 0x1b2a4a : cap, { roughness: 0.7 });
    const dome = new THREE.Mesh(geo('capDome', () => new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), capMat);
    dome.scale.set(0.95, 0.85, 1.05);
    dome.position.y = 0.15;
    head.add(dome);
    const visor = new THREE.Mesh(geo('capVisor', () => new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20, 1, false, -Math.PI / 2, Math.PI)), capMat);
    visor.position.set(0, 0.15, 0.06);
    visor.rotation.x = 0.12;
    head.add(visor);
  }
  if (glasses) {
    const gm = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.15 });
    for (const sx of [-1, 1]) {
      const lens = new THREE.Mesh(geo('lens', () => new THREE.CylinderGeometry(0.022, 0.022, 0.006, 16)), gm);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(sx * 0.035, 0.128, 0.1);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(geo('bridge', () => new THREE.BoxGeometry(0.11, 0.006, 0.006)), gm);
    bridge.position.set(0, 0.132, 0.1);
    head.add(bridge);
  }

  // Braccia: spalla -> gomito -> polso
  const arms = {};
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const upper = new THREE.Group();
    upper.position.set(sx * (sex === 'f' ? 0.19 : 0.215), 0.43, 0);
    spine.add(upper);
    limb(upper, 0.046, 0.2, mShirt, 'upperArm');
    const fore = new THREE.Group();
    fore.position.y = -0.3;
    upper.add(fore);
    limb(fore, 0.04, 0.19, sleeves === 'long' ? mShirt : mSkin, 'foreArm');
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    fore.add(hand);
    const palm = new THREE.Mesh(geo('palm', () => new THREE.BoxGeometry(0.06, 0.09, 0.03)), mSkin);
    palm.position.y = -0.04;
    palm.castShadow = true;
    hand.add(palm);
    const thumb = new THREE.Mesh(geo('thumb', () => new THREE.CapsuleGeometry(0.011, 0.03, 2, 6)), mSkin);
    thumb.position.set(-sx * 0.035, -0.03, 0.012);
    thumb.rotation.z = sx * 0.5;
    hand.add(thumb);
    if (side === 'L' && bracelet) {
      const b = new THREE.Mesh(geo('bracelet', () => new THREE.TorusGeometry(0.043, 0.008, 8, 18)), mat(bracelet.color, { metalness: bracelet.metal ? 0.95 : 0, roughness: bracelet.metal ? 0.2 : 0.7 }));
      b.rotation.x = Math.PI / 2;
      b.position.y = -0.24;
      fore.add(b);
    }
    if (side === 'R' && ring) {
      const r = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(0.012, 0.004, 6, 12)), mat(ring.color, { metalness: ring.metal ? 0.95 : 0, roughness: 0.2 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(0.018, -0.085, 0);
      hand.add(r);
    }
    const hold = new THREE.Group();
    hold.position.set(0, -0.08, 0.02);
    hand.add(hold);
    arms[side] = { upper, fore, hand, hold };
  }

  // Gambe: anca -> ginocchio -> caviglia
  const legs = {};
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const thigh = new THREE.Group();
    thigh.position.set(sx * 0.092, 0, 0);
    hips.add(thigh);
    limb(thigh, 0.072, 0.3, mPants, 'thigh');
    const shin = new THREE.Group();
    shin.position.y = -0.45;
    thigh.add(shin);
    limb(shin, 0.056, 0.3, mPants, 'shin');
    const foot = new THREE.Group();
    foot.position.y = -0.44;
    shin.add(foot);
    const shoe = new THREE.Mesh(geo('shoe', () => new THREE.CapsuleGeometry(0.05, 0.14, 4, 8)), mShoe);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1, 1, 0.75);
    shoe.position.set(0, -0.02, 0.05);
    shoe.castShadow = true;
    foot.add(shoe);
    legs[side] = { thigh, shin, foot };
  }

  const scale = height / (child ? BASE_HEIGHT * 0.94 : BASE_HEIGHT);
  if (child) head.scale.setScalar(1.22);
  g.scale.setScalar(scale);
  g.userData = {
    hips, spine, head, torso: spine,
    armL: arms.L.upper, armR: arms.R.upper, foreArmL: arms.L.fore, foreArmR: arms.R.fore,
    handL: arms.L.hand, handR: arms.R.hand, holdR: arms.R.hold,
    legL: legs.L.thigh, legR: legs.R.thigh, shinL: legs.L.shin, shinR: legs.R.shin,
    footL: legs.L.foot, footR: legs.R.foot,
    hipHeight: HIP_Y * scale, scale,
  };
  return g;
}

/** Oggetto da tenere in mano (cacciavite, telefono, ecc.). */
export function makeHeldItem(kind) {
  const g = new THREE.Group();
  const add = (geom, m, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geom, m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  const metal = mat(0xc9ced3, { metalness: 0.95, roughness: 0.25 });
  if (kind === 'phone') {
    add(new THREE.BoxGeometry(0.07, 0.14, 0.009), mat(0x111214, { roughness: 0.3, metalness: 0.5 }), 0, -0.02, 0.02);
    add(new THREE.PlaneGeometry(0.062, 0.128), new THREE.MeshBasicMaterial({ color: 0x5fb3ff }), 0, -0.02, 0.0256);
  } else if (kind === 'screwdriver') {
    add(new THREE.CylinderGeometry(0.016, 0.018, 0.1, 10), mat(0xd69e2e, { roughness: 0.5 }), 0, -0.02, 0.02, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), metal, 0, -0.02, 0.13, Math.PI / 2);
  } else if (kind === 'knife') {
    add(new THREE.BoxGeometry(0.025, 0.02, 0.1), mat(0x1a1a1a), 0, -0.02, 0.02);
    add(new THREE.BoxGeometry(0.006, 0.03, 0.16), metal, 0, -0.02, 0.15);
  } else if (kind === 'bat') {
    add(new THREE.CylinderGeometry(0.035, 0.016, 0.8, 12), mat(0xb68a52, { roughness: 0.6 }), 0, 0.3, 0.02);
  } else if (kind === 'pistol') {
    add(new THREE.BoxGeometry(0.03, 0.035, 0.17), mat(0x1c1d20, { metalness: 0.7, roughness: 0.35 }), 0, 0.0, 0.07);
    add(new THREE.BoxGeometry(0.028, 0.1, 0.04), mat(0x1c1d20, { metalness: 0.5, roughness: 0.5 }), 0, -0.05, 0.0, 0.25);
  } else if (kind === 'flashlight') {
    add(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 12), mat(0x2a2b2e, { metalness: 0.6 }), 0, -0.02, 0.05, Math.PI / 2);
    add(new THREE.CircleGeometry(0.02, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), 0, -0.02, 0.131);
  }
  return g;
}

/* =====================================================================
   Animatore: idle, camminata, corsa, salto, seduto, sdraiato, telefono, in sella
   ===================================================================== */
const POSE_KEYS = ['hipsY', 'spineX', 'spineY', 'headX', 'headY', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  'armLx', 'armRx', 'armLz', 'armRz', 'foreL', 'foreR'];

export class HumanAnimator {
  constructor(person) {
    this.p = person;
    this.u = person.userData;
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.cur = {};
    this.tgt = {};
    for (const k of POSE_KEYS) { this.cur[k] = 0; this.tgt[k] = 0; }
    this.cur.hipsY = this.tgt.hipsY = 0.95;
  }

  /**
   * @param {number} dt
   * @param {{ speed?: number, grounded?: boolean, state?: string, look?: number }} s
   *   state: 'auto' (idle/walk/run in base alla velocità) | 'sit' | 'lie' | 'phone' | 'ride' | 'jump'
   */
  update(dt, { speed = 0, grounded = true, state = 'auto', look = 0 } = {}) {
    this.time += dt;
    const t = this.tgt;
    for (const k of POSE_KEYS) t[k] = 0;
    t.hipsY = 0.95;
    t.armLz = -0.07;
    t.armRz = 0.07;
    t.foreL = t.foreR = -0.12;
    t.headY = look;
    let rate = 12;

    if (state === 'sit') {
      t.hipsY = 0.95;
      t.thighL = t.thighR = -1.5;
      t.shinL = t.shinR = 1.45;
      t.armLx = t.armRx = -0.45;
      t.foreL = t.foreR = -0.9;
      t.spineX = 0.05;
      t.headX = 0.12 + Math.sin(this.time * 0.6) * 0.04;
    } else if (state === 'lie') {
      t.armLz = -0.12; t.armRz = 0.12;
      t.headY = 0.2;
      rate = 5;
    } else if (state === 'ride') {
      t.thighL = t.thighR = -1.25;
      t.shinL = t.shinR = 1.35;
      t.armLx = t.armRx = -1.05;
      t.foreL = t.foreR = -0.35;
      t.spineX = 0.35;
      t.headX = -0.25;
      t.armLz = -0.12; t.armRz = 0.12;
    } else if (!grounded || state === 'jump') {
      t.thighL = -0.95; t.thighR = -0.25;
      t.shinL = 1.25; t.shinR = 0.55;
      t.armLx = -0.5; t.armRx = 0.35;
      t.armLz = -0.35; t.armRz = 0.35;
      t.foreL = t.foreR = -0.6;
      t.spineX = 0.1;
      rate = 9;
    } else {
      // Locomozione: blend continuo idle -> camminata -> corsa
      const walkK = Math.min(1, speed / 1.2);
      const runK = THREE.MathUtils.clamp((speed - 3.6) / 3, 0, 1);
      this.phase += dt * (speed * (2.35 - runK * 0.55) + (speed > 0.05 ? 1.2 : 0));
      const p = this.phase;
      const A = (0.42 + runK * 0.45) * walkK;
      const K = (0.55 + runK * 0.85) * walkK;
      t.thighL = -Math.sin(p) * A - runK * 0.12;
      t.thighR = Math.sin(p) * A - runK * 0.12;
      t.shinL = Math.max(0, Math.cos(p)) * K + 0.08 * walkK + runK * 0.25;
      t.shinR = Math.max(0, -Math.cos(p)) * K + 0.08 * walkK + runK * 0.25;
      t.footL = -t.thighL * 0.25 - 0.05;
      t.footR = -t.thighR * 0.25 - 0.05;
      t.armLx = Math.sin(p) * A * 0.85;
      t.armRx = -Math.sin(p) * A * 0.85;
      t.foreL = -0.2 - runK * 1.15 - Math.max(0, -Math.sin(p)) * 0.25 * walkK;
      t.foreR = -0.2 - runK * 1.15 - Math.max(0, Math.sin(p)) * 0.25 * walkK;
      t.spineX = 0.03 + runK * 0.2;
      t.spineY = Math.sin(p) * 0.09 * walkK;
      t.hipsY = 0.95 - Math.abs(Math.cos(p)) * (0.018 + runK * 0.03) * walkK - runK * 0.03;
      // Respiro e piccolo ondeggiamento da fermo
      const idle = 1 - walkK;
      t.spineX += Math.sin(this.time * 1.7) * 0.015 * idle;
      t.armLz -= Math.sin(this.time * 1.7) * 0.02 * idle;
      t.armRz += Math.sin(this.time * 1.7) * 0.02 * idle;
      t.headY += Math.sin(this.time * 0.35) * 0.25 * idle;
      t.headX = Math.sin(this.time * 0.5) * 0.04 * idle;
      rate = 16;
    }
    if (state === 'phone') {
      t.armRx = -1.15;
      t.armRz = 0.25;
      t.foreR = -1.35;
      t.headX = 0.35;
      t.headY = 0;
    }

    const k = 1 - Math.exp(-rate * dt);
    for (const key of POSE_KEYS) this.cur[key] += (t[key] - this.cur[key]) * k;
    this.apply();
  }

  apply() {
    const c = this.cur, u = this.u;
    u.hips.position.y = c.hipsY;
    u.spine.rotation.x = c.spineX;
    u.spine.rotation.y = c.spineY;
    u.head.rotation.x = c.headX;
    u.head.rotation.y = c.headY;
    u.legL.rotation.x = c.thighL;
    u.legR.rotation.x = c.thighR;
    u.shinL.rotation.x = c.shinL;
    u.shinR.rotation.x = c.shinR;
    u.footL.rotation.x = c.footL;
    u.footR.rotation.x = c.footR;
    u.armL.rotation.x = c.armLx;
    u.armR.rotation.x = c.armRx;
    u.armL.rotation.z = c.armLz;
    u.armR.rotation.z = c.armRz;
    u.foreArmL.rotation.x = c.foreL;
    u.foreArmR.rotation.x = c.foreR;
  }
}

/** Aspetto casuale per gli NPC. */
export function randomLook(rng = Math.random) {
  const skins = [0xf3d3b8, 0xe7bc98, 0xd29f78, 0xb7835b, 0x8d5a3b, 0x6b4129, 0x4a2c1c];
  const hairs = [0x1b1410, 0x2e1f15, 0x4a2f1d, 0x6b4a2b, 0xa8763e, 0xd8b27a, 0x9a9a9a, 0x2a2a2a];
  const shirts = [0xeeeeea, 0x1d1e22, 0x7b7f86, 0x1f2f55, 0x9cc3e6, 0x9a2224, 0x4b5a35, 0xc9a26b, 0x6b3f75, 0x2f6f6a, 0xd97a2b];
  const pants = [0x2d3d5c, 0x1c1d22, 0x9c8a66, 0x6c6f75, 0x55593e, 0x3a2f28];
  const shoes = [0xf0f0ee, 0x1a1a1c, 0x4a2f1c, 0x5a3a24];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const sex = rng() < 0.5 ? 'm' : 'f';
  const styles = sex === 'f' ? ['long', 'long', 'bun', 'curly', 'short'] : ['short', 'short', 'buzz', 'curly', 'bald'];
  return {
    sex,
    skin: pick(skins),
    hair: pick(hairs),
    hairStyle: pick(styles),
    shirt: pick(shirts),
    pants: pick(pants),
    shoes: pick(shoes),
    sleeves: rng() < 0.5 ? 'long' : 'short',
    height: sex === 'f' ? 1.58 + rng() * 0.16 : 1.68 + rng() * 0.18,
    beard: sex === 'm' && rng() < 0.3,
    cap: rng() < 0.15 ? pick(shirts) : null,
    glasses: rng() < 0.15,
  };
}
