// Modelli umanoidi stilizzati condivisi da panoramica 0-18 e gameplay.
import * as THREE from 'three';

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

/**
 * Crea una persona con i piedi a y = 0, rivolta verso +Z.
 * userData espone i pivot di braccia, gambe e testa per le animazioni.
 */
export function makePerson({ height = 1.75, skin = 0xd29f78, hair = 0x2e1f15, shirt = 0x3a5a8a, pants = 0x2b2b33, sex = 'm', child = false }) {
  const g = new THREE.Group();
  const mSkin = mat(skin, { roughness: 0.65 });
  const mShirt = mat(shirt, { roughness: 0.9 });
  const mPants = mat(pants, { roughness: 0.9 });
  const mHair = mat(hair, { roughness: 0.8 });
  const mShoe = mat(0x1b1b1d, { roughness: 0.6 });

  const mkLimb = (w, len, d, material, px, py, shoe) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, d), material);
    m.position.y = -len / 2;
    pivot.add(m);
    if (shoe) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, 0.08, d * 1.5), mShoe);
      s.position.set(0, -len + 0.04, d * 0.2);
      pivot.add(s);
    }
    g.add(pivot);
    return pivot;
  };
  const legL = mkLimb(0.14, 0.82, 0.16, mPants, -0.09, 0.84, true);
  const legR = mkLimb(0.14, 0.82, 0.16, mPants, 0.09, 0.84, true);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.6, 0.25), mShirt);
  torso.position.y = 1.13;
  g.add(torso);
  const armL = mkLimb(0.1, 0.6, 0.11, mShirt, -0.28, 1.4, false);
  const armR = mkLimb(0.1, 0.6, 0.11, mShirt, 0.28, 1.4, false);
  for (const a of [armL, armR]) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.1), mSkin);
    hand.position.y = -0.64;
    a.add(hand);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), mSkin);
  neck.position.y = 1.47;
  g.add(neck);
  const headR = child ? 0.15 : 0.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 14), mSkin);
  head.position.y = 1.5 + headR;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mHair);
  cap.position.y = 0.01;
  cap.rotation.x = -0.25;
  head.add(cap);
  if (sex === 'f') {
    const long = new THREE.Mesh(new THREE.BoxGeometry(headR * 1.9, headR * 2.2, 0.06), mHair);
    long.position.set(0, -headR * 0.6, -headR * 0.75);
    head.add(long);
  }
  const base = child ? 1.8 : 1.75;
  g.scale.setScalar(height / base);
  g.userData = { armL, armR, legL, legR, head, torso };
  return g;
}
