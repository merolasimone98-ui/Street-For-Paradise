// Personaggi umani procedurali con anatomia curata (busto modellato, articolazioni, mani con dita) + animatore.
import * as THREE from 'three';

const BASE_HEIGHT = 1.79; // altezza del modello prima della scala
const HIP_Y = 0.95;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

// Geometrie condivise tra tutti i personaggi (molti in scena)
const GEO = {};
function geo(key, make) {
  if (!GEO[key]) {
    GEO[key] = make();
    GEO[key].userData.shared = true;
  }
  return GEO[key];
}

/** Solido di rotazione da un profilo [raggio, y] (y crescente). */
function lathe(profile, seg = 18) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** Segmento di arto affusolato (cilindro con raggi diversi) lungo -Y dal pivot, con giuntura sferica. */
function taperedLimb(parent, rTop, rBottom, length, material, key, joint = true) {
  const m = new THREE.Mesh(geo(key, () => {
    const g = new THREE.CylinderGeometry(rTop, rBottom, length, 12, 1);
    g.translate(0, -length / 2, 0);
    return g;
  }), material);
  m.castShadow = true;
  parent.add(m);
  if (joint) {
    const j = new THREE.Mesh(geo(key + 'J', () => new THREE.SphereGeometry(rTop * 1.02, 12, 10)), material);
    j.castShadow = true;
    parent.add(j);
  }
  return m;
}

/**
 * Crea una persona con i piedi a y = 0, rivolta verso +Z.
 * Opzioni: height, skin, hair, hairStyle ('short'|'long'|'buzz'|'bun'|'curly'|'bald'), shirt, pants, shoes,
 * sex, child, sleeves ('short'|'long'), cap, bracelet, ring, glasses, beard, uniform ('police'|'waiter'|null)
 */
export function makePerson(opts = {}) {
  const {
    height = 1.75, skin = 0xd29f78, hair = 0x2e1f15, shirt = 0x3a5a8a, pants = 0x2b2b33, shoes = 0x1b1b1d,
    sex = 'm', child = false, sleeves = 'short', cap = null, bracelet = null, ring = null, glasses = null,
    beard = false, uniform = null,
  } = opts;
  const hairStyle = opts.hairStyle || (sex === 'f' ? 'long' : 'short');
  const f = sex === 'f';

  // Pelle: leggero "sheen" rossastro che imita la luce diffusa sotto la superficie (meno effetto plastica)
  const mSkin = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.55, metalness: 0, sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xff9a7a) });
  const mShirt = mat(shirt, { roughness: 0.92 });
  const mPants = mat(pants, { roughness: 0.88 });
  const mShoe = mat(shoes, { roughness: 0.5 });
  const mSole = mat(0x2a2522, { roughness: 0.9 });
  const mHair = mat(hair, { roughness: 0.72 });
  const mIris = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 0.15 });
  const mPupil = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.1 });
  const mWhite = mat(0xf4f1ea, { roughness: 0.35 });
  const mLip = mat(new THREE.Color(skin).multiplyScalar(0.74).getHex(), { roughness: 0.5 });
  const mBelt = mat(0x1d1712, { roughness: 0.5 });

  const g = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  g.add(hips);

  // Bacino (pantaloni): profilo arrotondato, più largo nelle donne
  const pelvis = new THREE.Mesh(geo('pelvis' + sex, () => lathe(f
    ? [[0.0, -0.11], [0.12, -0.1], [0.17, -0.04], [0.175, 0.02], [0.155, 0.08], [0.0, 0.09]]
    : [[0.0, -0.1], [0.12, -0.09], [0.155, -0.03], [0.16, 0.03], [0.15, 0.08], [0.0, 0.09]])), mPants);
  pelvis.scale.z = 0.7;
  pelvis.castShadow = true;
  hips.add(pelvis);
  const belt = new THREE.Mesh(geo('belt' + sex, () => new THREE.CylinderGeometry(f ? 0.158 : 0.153, f ? 0.158 : 0.153, 0.035, 18, 1, true)), uniform === 'police' ? mat(0x111111) : mBelt);
  belt.scale.z = 0.72;
  belt.position.y = 0.075;
  hips.add(belt);

  // Busto: vita stretta, torace pieno, spalle
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  const torso = new THREE.Mesh(geo('torso' + sex, () => lathe(f
    ? [[0.0, -0.02], [0.145, -0.01], [0.125, 0.1], [0.13, 0.18], [0.15, 0.26], [0.152, 0.31], [0.145, 0.37], [0.12, 0.43], [0.07, 0.46], [0.0, 0.465]]
    : [[0.0, -0.02], [0.148, -0.01], [0.14, 0.1], [0.155, 0.2], [0.17, 0.3], [0.17, 0.37], [0.15, 0.43], [0.08, 0.465], [0.0, 0.47]])), mShirt);
  torso.scale.z = f ? 0.66 : 0.62;
  torso.castShadow = true;
  spine.add(torso);
  for (const sx of [-1, 1]) {
    const delt = new THREE.Mesh(geo('delt', () => new THREE.SphereGeometry(0.068, 14, 10)), mShirt);
    delt.scale.set(1, 0.85, 0.95);
    delt.position.set(sx * (f ? 0.17 : 0.195), 0.41, 0);
    delt.castShadow = true;
    spine.add(delt);
  }
  // Colletto
  const collar = new THREE.Mesh(geo('collar', () => new THREE.TorusGeometry(0.058, 0.014, 6, 16)), mShirt);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.46;
  spine.add(collar);
  if (uniform === 'police') {
    const badge = new THREE.Mesh(geo('badge', () => new THREE.BoxGeometry(0.05, 0.06, 0.01)), mat(0xd6a73a, { metalness: 0.9, roughness: 0.25 }));
    badge.position.set(-0.08, 0.33, 0.105);
    spine.add(badge);
  }
  if (uniform === 'waiter') {
    const apron = new THREE.Mesh(geo('apron', () => new THREE.BoxGeometry(0.3, 0.5, 0.02)), mat(0xf4f4f2, { roughness: 1 }));
    apron.position.set(0, -0.12, 0.115);
    spine.add(apron);
  }
  if (uniform === 'mechanic') {
    // Tuta da meccanico: taschino, toppa dell'officina e bande riflettenti
    const patch = new THREE.Mesh(geo('mechPatch', () => new THREE.BoxGeometry(0.09, 0.05, 0.01)), mat(0xf0b43c, { roughness: 0.6 }));
    patch.position.set(0.075, 0.33, 0.106);
    const pocket = new THREE.Mesh(geo('mechPocket', () => new THREE.BoxGeometry(0.08, 0.07, 0.01)), mat(0x1f3550, { roughness: 0.9 }));
    pocket.position.set(-0.075, 0.3, 0.106);
    const stripe = new THREE.Mesh(geo('mechStripe', () => new THREE.CylinderGeometry(0.158, 0.158, 0.025, 18, 1, true)), mat(0xd8dde2, { metalness: 0.6, roughness: 0.3 }));
    stripe.position.y = 0.18;
    spine.add(patch, pocket, stripe);
  }

  // Collo e testa
  const neck = new THREE.Mesh(geo('neck', () => new THREE.CylinderGeometry(0.044, 0.054, 0.1, 12)), mSkin);
  neck.position.y = 0.5;
  spine.add(neck);
  const head = new THREE.Group();
  head.position.y = 0.55;
  spine.add(head);
  const skull = new THREE.Mesh(geo('skull', () => new THREE.SphereGeometry(0.1, 28, 20)), mSkin);
  skull.scale.set(0.88, 1.1, 1.0);
  skull.position.y = 0.115;
  skull.castShadow = true;
  head.add(skull);
  const jaw = new THREE.Mesh(geo('jaw' + sex, () => new THREE.SphereGeometry(f ? 0.064 : 0.07, 18, 14)), mSkin);
  jaw.scale.set(1.0, 0.78, 1.0);
  jaw.position.set(0, 0.048, 0.024);
  head.add(jaw);
  for (const sx of [-1, 1]) {
    const cheek = new THREE.Mesh(geo('cheek', () => new THREE.SphereGeometry(0.03, 10, 8)), mSkin);
    cheek.position.set(sx * 0.045, 0.085, 0.07);
    head.add(cheek);
  }
  const nose = new THREE.Mesh(geo('nose', () => {
    const n = new THREE.ConeGeometry(0.017, 0.05, 10);
    n.rotateX(Math.PI / 2);
    return n;
  }), mSkin);
  nose.position.set(0, 0.098, 0.106);
  head.add(nose);
  const nostrils = new THREE.Mesh(geo('nostrils', () => new THREE.SphereGeometry(0.014, 10, 8)), mSkin);
  nostrils.scale.set(1.5, 0.7, 0.9);
  nostrils.position.set(0, 0.082, 0.112);
  head.add(nostrils);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(geo('ear', () => new THREE.SphereGeometry(0.024, 10, 8)), mSkin);
    ear.scale.set(0.45, 1, 0.8);
    ear.position.set(sx * 0.088, 0.11, -0.005);
    head.add(ear);
    const white = new THREE.Mesh(geo('eyeW', () => new THREE.SphereGeometry(0.0145, 12, 10)), mWhite);
    white.position.set(sx * 0.033, 0.126, 0.082);
    white.scale.z = 0.6;
    head.add(white);
    const iris = new THREE.Mesh(geo('iris', () => new THREE.CircleGeometry(0.0072, 14)), mIris);
    iris.position.set(sx * 0.033, 0.126, 0.0915);
    head.add(iris);
    const pupil = new THREE.Mesh(geo('pupil', () => new THREE.CircleGeometry(0.0033, 10)), mPupil);
    pupil.position.set(sx * 0.033, 0.126, 0.092);
    head.add(pupil);
    const lid = new THREE.Mesh(geo('lid', () => new THREE.SphereGeometry(0.0155, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.35)), mSkin);
    lid.position.set(sx * 0.033, 0.128, 0.081);
    lid.rotation.x = 0.35;
    head.add(lid);
    const brow = new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.032, 0.006, 0.012)), mHair);
    brow.position.set(sx * 0.034, 0.15, 0.09);
    brow.rotation.z = sx * -0.14;
    head.add(brow);
  }
  const upperLip = new THREE.Mesh(geo('lipU', () => new THREE.CapsuleGeometry(0.0045, 0.026, 2, 6)), mLip);
  upperLip.rotation.z = Math.PI / 2;
  upperLip.position.set(0, 0.06, 0.088);
  head.add(upperLip);
  const lowerLip = new THREE.Mesh(geo('lipL', () => new THREE.CapsuleGeometry(0.0055, 0.022, 2, 6)), mLip);
  lowerLip.rotation.z = Math.PI / 2;
  lowerLip.position.set(0, 0.051, 0.085);
  head.add(lowerLip);

  // Capelli
  if (hairStyle !== 'bald') {
    const top = new THREE.Mesh(geo('hairTop', () => new THREE.SphereGeometry(0.106, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55)), mHair);
    top.scale.set(0.93, hairStyle === 'buzz' ? 1.0 : 1.12, 1.05);
    top.position.set(0, 0.128, -0.008);
    top.rotation.x = -0.2;
    head.add(top);
    if (hairStyle !== 'buzz') {
      const back = new THREE.Mesh(geo('hairBack', () => new THREE.SphereGeometry(0.1, 16, 12, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.35)), mHair);
      back.scale.set(0.94, 1.05, 1.0);
      back.position.set(0, 0.11, -0.012);
      head.add(back);
    }
    if (hairStyle === 'long') {
      const long = new THREE.Mesh(geo('hairLong', () => new THREE.CapsuleGeometry(0.09, 0.2, 4, 12)), mHair);
      long.scale.set(1.04, 1, 0.5);
      long.position.set(0, -0.01, -0.062);
      head.add(long);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(geo('hairSide', () => new THREE.CapsuleGeometry(0.03, 0.16, 3, 8)), mHair);
        side.position.set(sx * 0.082, 0.02, 0.0);
        head.add(side);
      }
    } else if (hairStyle === 'bun') {
      const bun = new THREE.Mesh(geo('bun', () => new THREE.SphereGeometry(0.046, 14, 10)), mHair);
      bun.position.set(0, 0.21, -0.075);
      head.add(bun);
    } else if (hairStyle === 'curly') {
      for (let i = 0; i < 9; i++) {
        const c = new THREE.Mesh(geo('curl', () => new THREE.SphereGeometry(0.038, 10, 8)), mHair);
        const a = (i / 9) * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.072, 0.195 + Math.sin(a * 3) * 0.012, Math.sin(a) * 0.072 - 0.015);
        head.add(c);
      }
    }
  }
  if (beard) {
    const b = new THREE.Mesh(geo('beard', () => new THREE.SphereGeometry(0.074, 16, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55)), mHair);
    b.position.set(0, 0.075, 0.018);
    head.add(b);
    const mustache = new THREE.Mesh(geo('mustache', () => new THREE.CapsuleGeometry(0.007, 0.034, 2, 6)), mHair);
    mustache.rotation.z = Math.PI / 2;
    mustache.position.set(0, 0.07, 0.093);
    head.add(mustache);
  }
  if (cap || uniform === 'police') {
    const capMat = mat(uniform === 'police' ? 0x1b2a4a : cap, { roughness: 0.7 });
    const dome = new THREE.Mesh(geo('capDome', () => new THREE.SphereGeometry(0.112, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5)), capMat);
    dome.scale.set(0.95, 0.85, 1.05);
    dome.position.y = 0.155;
    head.add(dome);
    const visor = new THREE.Mesh(geo('capVisor', () => new THREE.CylinderGeometry(0.09, 0.09, 0.012, 20, 1, false, -Math.PI / 2, Math.PI)), capMat);
    visor.position.set(0, 0.155, 0.06);
    visor.rotation.x = 0.12;
    head.add(visor);
  }
  if (glasses) {
    const gm = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.15 });
    for (const sx of [-1, 1]) {
      const lens = new THREE.Mesh(geo('lens', () => new THREE.CylinderGeometry(0.022, 0.022, 0.006, 16)), gm);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(sx * 0.034, 0.127, 0.1);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(geo('bridge', () => new THREE.BoxGeometry(0.11, 0.006, 0.006)), gm);
    bridge.position.set(0, 0.131, 0.1);
    head.add(bridge);
  }

  // Braccia: spalla -> gomito -> polso -> mano con dita
  const arms = {};
  const longSleeve = sleeves === 'long';
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const upper = new THREE.Group();
    upper.position.set(sx * (f ? 0.185 : 0.21), 0.405, 0);
    spine.add(upper);
    taperedLimb(upper, f ? 0.044 : 0.05, f ? 0.037 : 0.042, 0.28, mShirt, 'upperArm' + sex);
    if (!longSleeve) {
      // Manica corta: il braccio nudo esce dalla manica
      const bare = new THREE.Mesh(geo('bareArm' + sex, () => {
        const c = new THREE.CylinderGeometry(f ? 0.036 : 0.041, f ? 0.034 : 0.039, 0.13, 10);
        c.translate(0, -0.215, 0);
        return c;
      }), mSkin);
      upper.add(bare);
    }
    const fore = new THREE.Group();
    fore.position.y = -0.29;
    upper.add(fore);
    taperedLimb(fore, f ? 0.036 : 0.04, f ? 0.027 : 0.031, 0.25, longSleeve ? mShirt : mSkin, 'foreArm' + sex);
    const hand = new THREE.Group();
    hand.position.y = -0.26;
    fore.add(hand);
    const palm = new THREE.Mesh(geo('palm', () => new THREE.BoxGeometry(0.062, 0.075, 0.028)), mSkin);
    palm.position.y = -0.04;
    palm.castShadow = true;
    hand.add(palm);
    const fingers = new THREE.Mesh(geo('fingers', () => {
      const fg = new THREE.CapsuleGeometry(0.014, 0.05, 2, 8);
      return fg;
    }), mSkin);
    fingers.scale.set(2.0, 1, 0.95);
    fingers.position.set(0, -0.098, 0.006);
    fingers.rotation.x = 0.25;
    hand.add(fingers);
    const thumb = new THREE.Mesh(geo('thumb', () => new THREE.CapsuleGeometry(0.0115, 0.032, 2, 6)), mSkin);
    thumb.position.set(-sx * 0.036, -0.045, 0.014);
    thumb.rotation.z = sx * 0.55;
    hand.add(thumb);
    if (side === 'L' && bracelet) {
      const b = new THREE.Mesh(geo('bracelet', () => new THREE.TorusGeometry(0.034, 0.007, 8, 18)), mat(bracelet.color, { metalness: bracelet.metal ? 0.95 : 0, roughness: bracelet.metal ? 0.2 : 0.7 }));
      b.rotation.x = Math.PI / 2;
      b.position.y = -0.235;
      fore.add(b);
    }
    if (side === 'R' && ring) {
      const r = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(0.011, 0.0035, 6, 12)), mat(ring.color, { metalness: ring.metal ? 0.95 : 0, roughness: 0.2 }));
      r.rotation.x = Math.PI / 2;
      r.position.set(0.016, -0.088, 0.006);
      hand.add(r);
    }
    const hold = new THREE.Group();
    hold.position.set(0, -0.08, 0.02);
    hand.add(hold);
    arms[side] = { upper, fore, hand, hold };
  }

  // Gambe: anca -> ginocchio -> caviglia, coscia e polpaccio modellati
  const legs = {};
  for (const [side, sx] of [['L', -1], ['R', 1]]) {
    const thigh = new THREE.Group();
    thigh.position.set(sx * (f ? 0.088 : 0.09), -0.02, 0);
    hips.add(thigh);
    taperedLimb(thigh, f ? 0.082 : 0.08, f ? 0.056 : 0.058, 0.45, mPants, 'thigh' + sex);
    const shin = new THREE.Group();
    shin.position.y = -0.45;
    thigh.add(shin);
    const calf = new THREE.Mesh(geo('calf' + sex, () => {
      const l = lathe([[0.05, -0.43], [0.052, -0.36], [0.06, -0.22], [0.064, -0.13], [0.058, -0.04], [0.056, 0.0]], 12);
      return l;
    }), mPants);
    calf.castShadow = true;
    shin.add(calf);
    const knee = new THREE.Mesh(geo('knee' + sex, () => new THREE.SphereGeometry(0.058, 12, 10)), mPants);
    shin.add(knee);
    const foot = new THREE.Group();
    foot.position.y = -0.41; // anca 0.95 = 0.02 + 0.45 + 0.41 + suola: piedi esattamente a terra
    shin.add(foot);
    const shoe = new THREE.Mesh(geo('shoe', () => new THREE.CapsuleGeometry(0.048, 0.15, 4, 10)), mShoe);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.05, 1, 0.72);
    shoe.position.set(0, -0.03, 0.05);
    shoe.castShadow = true;
    foot.add(shoe);
    const sole = new THREE.Mesh(geo('sole', () => new THREE.BoxGeometry(0.1, 0.018, 0.26)), mSole);
    sole.position.set(0, -0.063, 0.05);
    foot.add(sole);
    legs[side] = { thigh, shin, foot };
  }

  const scale = height / (child ? BASE_HEIGHT * 0.94 : BASE_HEIGHT);
  if (child) head.scale.setScalar(1.22);
  g.scale.setScalar(scale);
  g.userData = {
    hips, spine, head, torso: spine, pelvis,
    armL: arms.L.upper, armR: arms.R.upper, foreArmL: arms.L.fore, foreArmR: arms.R.fore,
    handL: arms.L.hand, handR: arms.R.hand, holdR: arms.R.hold,
    legL: legs.L.thigh, legR: legs.R.thigh, shinL: legs.L.shin, shinR: legs.R.shin,
    footL: legs.L.foot, footR: legs.R.foot,
    hipHeight: HIP_Y * scale, scale, female: f,
  };
  return g;
}

/** Oggetto da tenere in mano (cacciavite, telefono, bicchiere, ecc.). */
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
  } else if (kind === 'chainsaw') {
    add(new THREE.BoxGeometry(0.12, 0.16, 0.3), mat(0xe8641e, { roughness: 0.5 }), 0, -0.03, 0.05);
    add(new THREE.BoxGeometry(0.03, 0.08, 0.5), metal, 0, -0.05, 0.42);
    add(new THREE.BoxGeometry(0.1, 0.03, 0.16), mat(0x1a1a1a), 0, 0.07, 0.0);
  } else if (kind === 'keys') {
    // Mazzo di chiavi con portachiavi
    add(new THREE.TorusGeometry(0.018, 0.003, 6, 16), metal, 0, -0.02, 0.03);
    add(new THREE.BoxGeometry(0.012, 0.004, 0.06), metal, 0.01, -0.02, 0.07);
    add(new THREE.BoxGeometry(0.03, 0.045, 0.012), mat(0x1a1a1a, { roughness: 0.4 }), -0.01, -0.03, 0.045);
  } else if (kind === 'wrench') {
    add(new THREE.BoxGeometry(0.018, 0.008, 0.2), metal, 0, -0.02, 0.08);
    add(new THREE.TorusGeometry(0.02, 0.007, 6, 12, Math.PI * 1.5), metal, 0, -0.02, 0.19, Math.PI / 2);
  } else if (kind === 'cash') {
    add(new THREE.BoxGeometry(0.07, 0.012, 0.14), mat(0x7fb07a, { roughness: 0.9 }), 0, -0.02, 0.05);
  } else if (kind === 'flashlight') {
    add(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 12), mat(0x2a2b2e, { metalness: 0.6 }), 0, -0.02, 0.05, Math.PI / 2);
    add(new THREE.CircleGeometry(0.02, 12), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), 0, -0.02, 0.131);
  } else if (kind && kind.startsWith('glass')) {
    // Bicchiere con bevanda, ghiaccio e cannuccia (colore dal suffisso: glass:#rrggbb)
    const color = kind.includes(':') ? Number('0x' + kind.split(':')[1]) : 0xffb347;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
    cup.position.set(0, 0.0, 0.03);
    g.add(cup);
    // Il liquido ha l'origine sul fondo: scalandolo in altezza il livello cala sorso dopo sorso
    const drinkGeo = new THREE.CylinderGeometry(0.031, 0.028, 0.085, 18);
    drinkGeo.translate(0, 0.0425, 0);
    const drink = new THREE.Mesh(drinkGeo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, transparent: true, opacity: 0.75 }));
    drink.name = 'liquid';
    drink.position.set(0, -0.0575, 0.03);
    g.add(drink);
    for (let i = 0; i < 3; i++) {
      const ice = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.05, transparent: true, opacity: 0.7 }));
      ice.position.set((i - 1) * 0.015, 0.025 - i * 0.008, 0.03 + (i % 2 ? 0.01 : -0.01));
      ice.rotation.set(i, i * 0.7, 0.3);
      g.add(ice);
    }
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.18, 6), mat(0xe83d6f, { roughness: 0.4 }));
    straw.position.set(0.012, 0.06, 0.03);
    straw.rotation.z = -0.25;
    g.add(straw);
    const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.004, 14), mat(0xf6e05a, { roughness: 0.6 }));
    lemon.position.set(-0.03, 0.058, 0.03);
    lemon.rotation.z = Math.PI / 2;
    g.add(lemon);
  }
  return g;
}

/* =====================================================================
   Animatore: idle (spostamento del peso), camminata, corsa, salto, seduto, sdraiato, telefono, bere, in sella
   ===================================================================== */
const POSE_KEYS = ['hipsY', 'hipsYaw', 'hipsRoll', 'spineX', 'spineY', 'spineZ', 'headX', 'headY', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR',
  'armLx', 'armRx', 'armLz', 'armRz', 'foreL', 'foreR', 'handL', 'handR'];

export class HumanAnimator {
  constructor(person) {
    this.p = person;
    this.u = person.userData;
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.cur = {};
    this.tgt = {};
    this.vel = {};
    for (const k of POSE_KEYS) { this.cur[k] = 0; this.tgt[k] = 0; this.vel[k] = 0; }
    this.cur.hipsY = this.tgt.hipsY = 0.95;
    this.female = !!person.userData.female;
    this.sSpeed = 0; // velocità filtrata: passaggi fluidi tra fermo, camminata e corsa
    this.airT = 0;
  }

  /**
   * @param {number} dt
   * @param {{ speed?: number, grounded?: boolean, state?: string, look?: number, drinkT?: number }} s
   *   state: 'auto' (idle/walk/run in base alla velocità) | 'sit' | 'lie' | 'phone' | 'ride' | 'jump' | 'drink'
   */
  update(dt, { speed = 0, grounded = true, state = 'auto', look = 0, drinkT = 0, lean = 0, pedal = null } = {}) {
    this.time += dt;
    // Velocità filtrata (niente scatti quando un NPC si ferma o riparte) e tempo in aria (salti brevi più morbidi)
    this.sSpeed += (speed - this.sSpeed) * (1 - Math.exp(-9 * dt));
    speed = this.sSpeed;
    this.airT = grounded ? 0 : this.airT + dt;
    if (!grounded && this.airT < 0.12 && state === 'auto') grounded = true;
    const t = this.tgt;
    for (const k of POSE_KEYS) t[k] = 0;
    t.hipsY = 0.95;
    t.armLz = -0.07;
    t.armRz = 0.07;
    t.foreL = t.foreR = -0.14;
    t.handL = t.handR = 0.05;
    t.headY = look;
    let rate = 12;

    if (state === 'sit') {
      t.thighL = t.thighR = -1.5;
      t.shinL = t.shinR = 1.45;
      t.armLx = t.armRx = -0.45;
      t.foreL = t.foreR = -0.9;
      t.spineX = 0.05;
      t.headX = 0.12 + Math.sin(this.time * 0.6) * 0.04;
      t.headY += Math.sin(this.time * 0.25) * 0.15;
    } else if (state === 'lie') {
      t.armLz = -0.12; t.armRz = 0.12;
      t.headY = 0.2;
      rate = 5;
    } else if (state === 'ride') {
      t.thighL = t.thighR = -1.25;
      t.shinL = t.shinR = 1.35;
      t.armLx = t.armRx = -1.05;
      t.foreL = t.foreR = -0.35;
      t.spineX = 0.35 + Math.abs(lean) * 0.35;
      t.headX = -0.25 - Math.abs(lean) * 0.2;
      t.armLz = -0.12; t.armRz = 0.12;
      // Piega stile MotoGP: il busto si sporge verso l'interno della curva, mani salde sul manubrio
      t.hipsRoll = lean * 0.35;
      t.spineZ = lean * 0.55;
      t.foreL = -0.35 - Math.max(0, -lean) * 0.4;
      t.foreR = -0.35 - Math.max(0, lean) * 0.4;
      rate = 10;
      if (pedal !== null) {
        // Bicicletta: le gambe spingono sui pedali (pedivelle opposte, piedi che seguono il pedale)
        const a = pedal;
        t.thighL = -0.95 + Math.sin(a) * 0.42;
        t.thighR = -0.95 + Math.sin(a + Math.PI) * 0.42;
        t.shinL = 1.05 + Math.cos(a) * 0.42 + 0.1;
        t.shinR = 1.05 + Math.cos(a + Math.PI) * 0.42 + 0.1;
        t.footL = -0.25 + Math.sin(a + 0.6) * 0.22;
        t.footR = -0.25 + Math.sin(a + Math.PI + 0.6) * 0.22;
        t.hipsRoll += Math.sin(a) * 0.04;
        t.spineX = 0.42 + Math.abs(lean) * 0.2;
        rate = 26; // segue la pedalata senza ritardo
      }
    } else if (state === 'under') {
      // Sdraiato sotto l'auto (la posa 'lie' ruota il corpo a pancia in su): braccia alzate che lavorano
      t.armLx = -1.45 + Math.sin(this.time * 9) * 0.12;
      t.armRx = -1.55 + Math.sin(this.time * 13) * 0.2;
      t.foreL = -0.5; t.foreR = -0.35 + Math.sin(this.time * 11) * 0.25;
      t.armLz = 0.15; t.armRz = -0.15;
      t.thighL = -0.5; t.shinL = 0.9;
      rate = 8;
    } else if (state === 'tinker' || state === 'hood') {
      // Accovacciato alla portiera (scasso) o chino sul cofano/bagagliaio: mani che armeggiano
      const hood = state === 'hood';
      t.hipsY = hood ? 0.93 : 0.66;
      t.thighL = t.thighR = hood ? -0.12 : -1.15;
      t.shinL = t.shinR = hood ? 0.12 : 1.75;
      t.footL = t.footR = hood ? 0 : -0.55;
      t.spineX = hood ? 0.85 : 0.35;
      t.headX = hood ? 0.1 : 0.05;
      t.armLx = -1.15 + Math.sin(this.time * 7) * 0.08;
      t.armRx = -1.05 + Math.sin(this.time * 12) * 0.16;
      t.foreL = -0.55;
      t.foreR = -0.7 + Math.sin(this.time * 15) * 0.3;
      t.handR = Math.sin(this.time * 18) * 0.35;
      t.armLz = 0.25; t.armRz = -0.2;
      rate = 10;
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
      this.phase += dt * (speed * (2.3 - runK * 0.55) + (speed > 0.05 ? 1.1 : 0));
      const p = this.phase;
      const A = (0.44 + runK * 0.45) * walkK;
      const K = (0.6 + runK * 0.85) * walkK;
      t.thighL = -Math.sin(p) * A - runK * 0.12;
      t.thighR = Math.sin(p) * A - runK * 0.12;
      // Ginocchio: si piega nella fase di volo e assorbe l'appoggio
      t.shinL = Math.max(0, Math.cos(p)) * K + Math.max(0, Math.sin(p - 0.4)) * 0.12 * walkK + 0.06 * walkK + runK * 0.25;
      t.shinR = Math.max(0, -Math.cos(p)) * K + Math.max(0, -Math.sin(p - 0.4)) * 0.12 * walkK + 0.06 * walkK + runK * 0.25;
      // Piede: rullata tallone-punta
      t.footL = -t.thighL * 0.3 - Math.max(0, Math.cos(p + 0.6)) * 0.25 * walkK;
      t.footR = -t.thighR * 0.3 - Math.max(0, -Math.cos(p + 0.6)) * 0.25 * walkK;
      // Braccia opposte alle gambe, con avambraccio in ritardo
      t.armLx = Math.sin(p) * A * 0.85;
      t.armRx = -Math.sin(p) * A * 0.85;
      t.foreL = -0.22 - runK * 1.15 - Math.max(0, -Math.sin(p - 0.5)) * 0.3 * walkK;
      t.foreR = -0.22 - runK * 1.15 - Math.max(0, Math.sin(p - 0.5)) * 0.3 * walkK;
      t.armLz = -0.08 - runK * 0.08;
      t.armRz = 0.08 + runK * 0.08;
      // Bacino e spalle ruotano in senso opposto; il bacino oscilla di lato (più marcato nelle donne)
      t.hipsYaw = Math.sin(p) * (this.female ? 0.13 : 0.09) * walkK;
      t.hipsRoll = Math.cos(p) * (this.female ? 0.06 : 0.035) * walkK;
      t.spineY = -t.hipsYaw * 1.6;
      t.spineZ = -t.hipsRoll * 0.6;
      t.spineX = 0.03 + runK * 0.22;
      t.headY += t.hipsYaw * 0.5; // la testa resta stabile
      t.hipsY = 0.95 - Math.abs(Math.cos(p)) * (0.022 + runK * 0.035) * walkK - runK * 0.03;
      // Da fermo: respiro e spostamento del peso
      const idle = 1 - walkK;
      const shift = Math.sin(this.time * 0.45);
      t.hipsRoll += shift * 0.035 * idle;
      t.spineZ -= shift * 0.025 * idle;
      t.thighL += shift * 0.03 * idle;
      t.thighR -= shift * 0.03 * idle;
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
    if (state === 'aim') {
      // Pistola puntata a due mani all'altezza degli occhi
      t.armRx = -1.52; t.armRz = -0.05; t.foreR = -0.08; t.handR = 0.05;
      t.armLx = -1.38; t.armLz = 0.55; t.foreL = -0.42;
      t.spineY = 0.12; t.headY = -0.1; t.headX = 0.02;
      rate = 18;
    }
    if (state === 'shield') {
      // Abbagliato dai fari: si copre gli occhi con il braccio e gira la testa
      t.armRx = -1.75; t.armRz = 0.35; t.foreR = -1.5; t.handR = 0.3;
      t.headX = 0.25; t.headY = 0.45;
      rate = 14;
    }
    if (state === 'startle') {
      // Spaventato dal clacson: sobbalzo, braccia aperte, sguardo verso il rumore
      t.armLz = -0.55; t.armRz = 0.55; t.armLx = -0.4; t.armRx = -0.4;
      t.foreL = t.foreR = -0.8;
      t.spineX = -0.12; t.hipsY = 0.97;
      rate = 18;
    }
    if (state === 'give') {
      // Porge le chiavi / i soldi
      t.armRx = -1.15; t.armRz = 0.1; t.foreR = -0.25; t.handR = 0.2;
      t.headX = 0.15;
    }
    if (state === 'drink') {
      // Porta il bicchiere alla bocca, sorseggia, abbassa
      const k = Math.sin(Math.min(1, drinkT) * Math.PI);
      t.armRx = -0.5 - k * 1.45;
      t.armRz = 0.18 + k * 0.25;
      t.foreR = -0.9 - k * 1.25;
      t.headX = -k * 0.35;
      t.handR = k * 0.4;
      rate = 10;
    }

    // Molla smorzata criticamente: le pose si raggiungono con accelerazione e frenata naturali
    // (nessuno scatto quando cambia lo stato), stabile anche con dt variabile.
    const w = rate * 1.6; // abbastanza rigida da non smorzare l'ampiezza della corsa
    const steps = Math.max(1, Math.ceil((dt * w) / 0.7));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      for (const key of POSE_KEYS) {
        const x = this.cur[key] - t[key];
        const v = this.vel[key];
        const a = -w * w * x - 2 * w * v;
        const nv = v + a * h;
        this.vel[key] = nv;
        this.cur[key] += nv * h;
      }
    }
    this.apply();
  }

  apply() {
    const c = this.cur, u = this.u;
    u.hips.position.y = c.hipsY;
    u.hips.rotation.y = c.hipsYaw;
    u.hips.rotation.z = c.hipsRoll;
    u.spine.rotation.x = c.spineX;
    u.spine.rotation.y = c.spineY;
    u.spine.rotation.z = c.spineZ;
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
    u.handL.rotation.x = c.handL;
    u.handR.rotation.x = c.handR;
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
