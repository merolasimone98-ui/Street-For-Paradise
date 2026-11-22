// Interni 3D accessibili (casa, ospedale, minimarket, officina, banca, locale) con collider Cannon-es.
// Ogni interno viene costruito al momento dell'ingresso in una zona remota della mappa e distrutto all'uscita.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { makePerson, HumanAnimator, randomLook } from './characters.js';
import { disposeObject3D } from './ui.js';
import { seededRandom } from './birthdata.js';

export const INTERIOR_ORIGIN = new THREE.Vector3(4000, 0, 4000);
const DOOR_W = 1.8;
const DOOR_H = 2.6;

/* =====================================================================
   Texture procedurali (usate sia come map sia come bumpMap per un look PBR)
   ===================================================================== */
function canvasTex(size, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

const shade = (hex, l) => new THREE.Color(hex).offsetHSL(0, 0, l).getStyle();

function noiseFill(g, size, base, amount, rng) {
  g.fillStyle = new THREE.Color(base).getStyle();
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

const TEX = {
  wood(base, rng, rx, ry) {
    return canvasTex(512, (g, S) => {
      const rows = 8;
      const h = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rng() * 200;
        while (x < S) {
          const len = 160 + rng() * 220;
          g.fillStyle = shade(base, (rng() - 0.5) * 0.12);
          g.fillRect(x, r * h, len, h);
          g.strokeStyle = 'rgba(0,0,0,0.08)';
          for (let k = 0; k < 6; k++) {
            g.beginPath();
            const y = r * h + rng() * h;
            g.moveTo(x, y);
            g.bezierCurveTo(x + len * 0.3, y + 3, x + len * 0.6, y - 3, x + len, y);
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x, r * h, 2, h);
          x += len;
        }
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.fillRect(0, r * h, S, 2);
      }
    }, rx, ry);
  },
  tiles(base, grout, rng, n, rx, ry) {
    return canvasTex(512, (g, S) => {
      g.fillStyle = grout;
      g.fillRect(0, 0, S, S);
      const t = S / n;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        g.fillStyle = shade(typeof base === 'function' ? base(x, y) : base, (rng() - 0.5) * 0.05);
        g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      }
    }, rx, ry);
  },
  marble(rng, rx, ry) {
    return canvasTex(512, (g, S) => {
      noiseFill(g, S, 0xeae6df, 10, rng);
      for (let k = 0; k < 18; k++) {
        g.strokeStyle = `rgba(120,115,110,${0.08 + rng() * 0.15})`;
        g.lineWidth = 1 + rng() * 2;
        g.beginPath();
        let x = rng() * S, y = 0;
        g.moveTo(x, y);
        while (y < S) { x += (rng() - 0.5) * 60; y += 20 + rng() * 30; g.lineTo(x, y); }
        g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.15)';
      g.strokeRect(0, 0, S, S);
    }, rx, ry);
  },
  concrete(base, rng, rx, ry, stains = 0) {
    return canvasTex(512, (g, S) => {
      noiseFill(g, S, base, 22, rng);
      for (let i = 0; i < stains; i++) {
        const r = 20 + rng() * 70;
        const x = rng() * S, y = rng() * S;
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, 'rgba(20,18,15,0.45)');
        grd.addColorStop(1, 'rgba(20,18,15,0)');
        g.fillStyle = grd;
        g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.strokeStyle = 'rgba(0,0,0,0.12)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, S, S);
    }, rx, ry);
  },
  plaster(base, rng, rx = 2, ry = 1) {
    return canvasTex(256, (g, S) => noiseFill(g, S, base, 9, rng), rx, ry);
  },
  brick(rng, rx, ry) {
    return canvasTex(512, (g, S) => {
      g.fillStyle = '#5b4a40';
      g.fillRect(0, 0, S, S);
      const bh = 32, bw = 96;
      for (let y = 0; y < S; y += bh) {
        for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < S; x += bw) {
          g.fillStyle = shade(0x8a4a36, (rng() - 0.5) * 0.12);
          g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
        }
      }
    }, rx, ry);
  },
};

function signTexture(text, color, bg = 'rgba(8,8,12,0.92)', w = 1024, h = 256) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.shadowColor = color;
  g.shadowBlur = 24;
  g.font = `600 ${Math.floor(h * 0.5)}px "Oswald", "Impact", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts });

/* =====================================================================
   Interior
   ===================================================================== */
export class Interior {
  /**
   * @param {{ scene: THREE.Scene, physics: CANNON.World, staticMaterial: CANNON.Material,
   *           door: object, ctx: { familyId: string, city: object, seed: number } }} opts
   */
  constructor({ scene, physics, staticMaterial, door, ctx }) {
    this.scene = scene;
    this.physics = physics;
    this.staticMaterial = staticMaterial;
    this.door = door;
    this.ctx = ctx;
    this.rng = seededRandom((ctx.seed ^ door.type.length * 7919) >>> 0);
    this.group = new THREE.Group();
    this.group.position.copy(INTERIOR_ORIGIN);
    this.bodies = [];
    this.collidables = [];
    this.animators = [];
    this.interactables = [];
    this.seats = [];
    this.kitchen = null;
    this.time = 0;

    const builder = BUILDERS[door.type] || BUILDERS.home;
    this.size = builder(this, ctx);
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
  }

  /** Punto di comparsa (coordinate mondo) rivolto verso l'interno. */
  get spawn() {
    return { x: INTERIOR_ORIGIN.x, z: INTERIOR_ORIGIN.z + this.size.d / 2 - 3.2, facing: Math.PI };
  }

  /** Punto della porta d'uscita (coordinate mondo). */
  get exitPoint() {
    return { x: INTERIOR_ORIGIN.x, z: INTERIOR_ORIGIN.z + this.size.d / 2 - 0.6 };
  }

  /** Converte coordinate locali dell'interno in coordinate mondo. */
  toWorld(x, y, z) {
    return new THREE.Vector3(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.y + y, INTERIOR_ORIGIN.z + z);
  }

  /** Punto di interazione [E] in coordinate locali. */
  interact(x, z, label, action, data = {}, radius = 1.7) {
    this.interactables.push({ x: INTERIOR_ORIGIN.x + x, z: INTERIOR_ORIGIN.z + z, label, action, data, radius });
  }

  /* ---------- Helper di costruzione (coordinate locali) ---------- */
  addBody(w, h, d, x, y, z, rotY = 0) {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC, material: this.staticMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(INTERIOR_ORIGIN.x + x, INTERIOR_ORIGIN.y + y, INTERIOR_ORIGIN.z + z);
    if (rotY) body.quaternion.setFromEuler(0, rotY, 0);
    this.physics.addBody(body);
    this.bodies.push(body);
    return body;
  }

  /** Box visivo; solid = collider fisico; wall = blocca anche la camera. */
  box(w, h, d, mat, x, y, z, { rotY = 0, solid = false, wall = false, shadow = false } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof mat === 'number' ? std(mat) : mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.group.add(m);
    if (solid || wall) this.addBody(w, h, d, x, y, z, rotY);
    if (wall) this.collidables.push(m);
    return m;
  }

  mesh(geo, mat, x, y, z, rotY = 0) {
    const m = new THREE.Mesh(geo, typeof mat === 'number' ? std(mat) : mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  ambient(sky, ground, intensity) {
    this.group.add(new THREE.HemisphereLight(sky, ground, intensity));
  }

  light(x, y, z, color, intensity, { fixture = 'panel', distance = 0, shadow = false } = {}) {
    const l = new THREE.PointLight(color, intensity, distance, 2);
    l.position.set(x, y, z);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.002;
      l.shadow.radius = 4;
    }
    this.group.add(l);
    const emi = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 1.6 });
    if (fixture === 'panel') this.box(1.4, 0.05, 0.45, emi, x, y + 0.17, z);
    else if (fixture === 'bulb') {
      this.mesh(new THREE.SphereGeometry(0.08, 12, 8), emi, x, y, z);
      this.box(0.015, 0.4, 0.015, 0x222222, x, y + 0.24, z);
    } else if (fixture === 'pendant') {
      const shadeMesh = this.mesh(new THREE.ConeGeometry(0.3, 0.3, 20, 1, true), std(0x1d1d1f, { side: THREE.DoubleSide, metalness: 0.5, roughness: 0.4 }), x, y + 0.1, z);
      shadeMesh.castShadow = false;
      this.mesh(new THREE.SphereGeometry(0.07, 12, 8), emi, x, y - 0.02, z);
      this.box(0.015, 0.6, 0.015, 0x222222, x, y + 0.55, z);
    }
    return l;
  }

  sign(text, color, w, h, x, y, z, rotY = 0, bg) {
    const mat = new THREE.MeshBasicMaterial({ map: signTexture(text, color, bg), toneMapped: false });
    return this.mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, rotY);
  }

  npc(opts, x, z, rotY = 0) {
    const base = randomLook(this.rng);
    const p = makePerson({ ...base, height: 1.66 + this.rng() * 0.18, ...opts });
    p.position.set(x, 0, z);
    p.rotation.y = rotY;
    p.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.group.add(p);
    this.addBody(0.6, 1.8, 0.6, x, 0.9, z);
    const anim = new HumanAnimator(p);
    const phase = this.rng() * 10;
    this.animators.push((t, dt) => anim.update(dt, { speed: 0, look: Math.sin(t * 0.4 + phase) * 0.4 }));
    return p;
  }

  randomSkin() {
    return [0xf3d3b8, 0xe7bc98, 0xd29f78, 0xb7835b, 0x8d5a3b, 0x6b4129][Math.floor(this.rng() * 6)];
  }

  /** Stanza chiusa con apertura d'uscita sul lato +Z (x = 0). */
  room({ w, d, h, floorMat, wallMat, ceilMat = std(0xf2f0ea, { roughness: 1 }), trim = 0x3a3733 }) {
    const T = 0.3;
    const floor = this.mesh(new THREE.PlaneGeometry(w, d), floorMat, 0, 0.01, 0);
    floor.rotation.x = -Math.PI / 2;
    this.box(w + T * 2, h, T, wallMat, 0, h / 2, -d / 2 - T / 2, { wall: true });
    this.box(T, h, d, wallMat, -w / 2 - T / 2, h / 2, 0, { wall: true });
    this.box(T, h, d, wallMat, w / 2 + T / 2, h / 2, 0, { wall: true });
    const segW = (w - DOOR_W) / 2;
    this.box(segW, h, T, wallMat, -(DOOR_W / 2 + segW / 2), h / 2, d / 2 + T / 2, { wall: true });
    this.box(segW, h, T, wallMat, DOOR_W / 2 + segW / 2, h / 2, d / 2 + T / 2, { wall: true });
    this.box(DOOR_W, h - DOOR_H, T, wallMat, 0, DOOR_H + (h - DOOR_H) / 2, d / 2 + T / 2, { wall: true });
    // Porta d'uscita (chiusa: il collider impedisce di uscire nel vuoto)
    const doorMat = std(0x4a3324, { roughness: 0.55 });
    this.box(DOOR_W - 0.1, DOOR_H - 0.05, 0.08, doorMat, 0, DOOR_H / 2, d / 2 + 0.02, { solid: true });
    this.box(0.08, 0.04, 0.12, std(0xc9b27a, { metalness: 0.9, roughness: 0.25 }), 0.6, 1.1, d / 2 - 0.05);
    const frame = std(trim, { roughness: 0.5 });
    this.box(0.1, DOOR_H, 0.12, frame, -DOOR_W / 2, DOOR_H / 2, d / 2 - 0.02);
    this.box(0.1, DOOR_H, 0.12, frame, DOOR_W / 2, DOOR_H / 2, d / 2 - 0.02);
    this.box(DOOR_W + 0.1, 0.1, 0.12, frame, 0, DOOR_H, d / 2 - 0.02);
    // Soffitto e battiscopa
    this.box(w, 0.1, d, ceilMat, 0, h + 0.05, 0, { wall: true });
    const base = std(trim, { roughness: 0.6 });
    this.box(w, 0.12, 0.02, base, 0, 0.06, -d / 2 + 0.01);
    this.box(0.02, 0.12, d, base, -w / 2 + 0.01, 0.06, 0);
    this.box(0.02, 0.12, d, base, w / 2 - 0.01, 0.06, 0);
    // Indicatore luminoso d'uscita
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0b43c, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    const ring = this.mesh(new THREE.RingGeometry(0.45, 0.6, 40), ringMat, 0, 0.03, d / 2 - 0.9);
    ring.rotation.x = -Math.PI / 2;
    this.animators.push((t) => { ringMat.opacity = 0.35 + Math.sin(t * 3) * 0.2; });
    this.sign('USCITA', '#7dff9a', 0.9, 0.25, 0, DOOR_H + 0.3, d / 2 - 0.01, Math.PI);
  }

  window(x, y, z, w, h, rotY, sky = 0xcfe2f2) {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: sky, toneMapped: false }));
    g.add(glass);
    const fm = std(0xf3f3ef, { roughness: 0.4 });
    for (const [bw, bh, bx, by] of [[w + 0.16, 0.08, 0, h / 2 + 0.04], [w + 0.16, 0.08, 0, -h / 2 - 0.04], [0.08, h, -w / 2 - 0.04, 0], [0.08, h, w / 2 + 0.04, 0], [0.04, h, 0, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.08), fm);
      b.position.set(bx, by, 0.02);
      g.add(b);
    }
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.group.add(g);
  }

  sofa(x, z, rotY, color, len = 2.2) {
    const m = std(color, { roughness: 0.95 });
    const g = new THREE.Group();
    const parts = [[len, 0.42, 0.9, 0, 0.21, 0], [len, 0.5, 0.22, 0, 0.62, -0.34], [0.2, 0.3, 0.9, -len / 2 + 0.1, 0.55, 0], [0.2, 0.3, 0.9, len / 2 - 0.1, 0.55, 0]];
    for (const [w, h, d, px, py, pz] of parts) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py, pz);
      b.castShadow = true;
      g.add(b);
    }
    for (let i = 0; i < 2; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(len / 2 - 0.25, 0.12, 0.7), std(new THREE.Color(color).offsetHSL(0, 0, 0.06).getHex(), { roughness: 1 }));
      c.position.set((i - 0.5) * (len / 2 - 0.15), 0.48, 0.05);
      g.add(c);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.group.add(g);
    const sw = Math.abs(Math.sin(rotY)) > 0.5;
    this.addBody(sw ? 0.9 : len, 0.9, sw ? len : 0.9, x, 0.45, z);
  }

  table(x, z, w, d, mat, h = 0.76, solid = true) {
    const m = typeof mat === 'number' ? std(mat, { roughness: 0.5 }) : mat;
    this.box(w, 0.05, d, m, x, h, z, { shadow: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(0.05, h, 0.05, m, x + sx * (w / 2 - 0.07), h / 2, z + sz * (d / 2 - 0.07));
    if (solid) this.addBody(w, h, d, x, h / 2, z);
  }

  chair(x, z, rotY, color) {
    const m = std(color, { roughness: 0.7 });
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.45), m);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.05), m);
    back.position.set(0, 0.7, -0.2);
    g.add(seat, back);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.04), m);
      leg.position.set(sx * 0.19, 0.23, sz * 0.19);
      g.add(leg);
    }
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.group.add(g);
    this.addBody(0.45, 0.9, 0.45, x, 0.45, z);
  }

  plant(x, z, s = 1) {
    this.box(0.4 * s, 0.45 * s, 0.4 * s, std(0x7a4b32, { roughness: 0.9 }), x, 0.225 * s, z, { solid: true });
    const leaves = this.mesh(new THREE.IcosahedronGeometry(0.45 * s, 1), std(0x3e7a3a, { flatShading: true, roughness: 0.9 }), x, 0.9 * s, z);
    leaves.castShadow = true;
  }

  car(x, z, rotY, color, y = 0) {
    const g = new THREE.Group();
    const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.4), paint);
    body.position.y = 0.72;
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.12, 1.3), paint);
    hood.position.set(0, 1.1, 1.45);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.62, 2.1), new THREE.MeshPhysicalMaterial({ color: 0x18212b, metalness: 0.3, roughness: 0.05, clearcoat: 1 }));
    cabin.position.set(0, 1.38, -0.25);
    g.add(body, hood, cabin);
    const tire = std(0x111111, { roughness: 0.9 });
    const rim = std(0xbfc4c9, { metalness: 0.9, roughness: 0.25 });
    for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18), tire);
      t.rotation.z = Math.PI / 2;
      t.position.set(wx, 0.36, wz);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 12), rim);
      r.rotation.z = Math.PI / 2;
      r.position.copy(t.position);
      g.add(t, r);
    }
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4d8, emissiveIntensity: 1.2 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.8 });
    for (const sx of [-0.65, 0.65]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), headMat);
      hl.position.set(sx, 0.86, 2.21);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), tailMat);
      tl.position.set(sx, 0.86, -2.21);
      g.add(hl, tl);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.group.add(g);
    this.addBody(1.95, 1.7, 4.45, x, y + 0.85, z, rotY);
    return g;
  }

  update(dt) {
    this.time += dt;
    for (const a of this.animators) a(this.time, dt);
  }

  dispose() {
    for (const b of this.bodies) this.physics.removeBody(b);
    this.bodies.length = 0;
    this.scene.remove(this.group);
    disposeObject3D(this.group);
  }
}

/* =====================================================================
   Costruttori dei singoli interni
   ===================================================================== */
const BUILDERS = {
  /* ---------------- CASA / APPARTAMENTO ---------------- */
  home(I, ctx) {
    const tier = ctx.familyId;
    const rng = I.rng;
    const w = tier === 'rich' ? 12 : 10, d = tier === 'rich' ? 11 : 9, h = tier === 'rich' ? 3.3 : 2.9;
    const wallColor = { rich: 0xefe9dd, middle: 0xe7dcc6, worker: 0xd6c7a7, poor: 0x9b917c }[tier] || 0xe7dcc6;
    let floorMat;
    if (tier === 'rich') floorMat = std(0xffffff, { map: TEX.wood(0xb88a5c, rng, 2, 2), roughness: 0.45 });
    else if (tier === 'middle') floorMat = std(0xffffff, { map: TEX.wood(0x9c7650, rng, 2, 2), roughness: 0.6 });
    else if (tier === 'worker') floorMat = std(0xffffff, { map: TEX.tiles(0xcbbf9f, '#8d8470', rng, 8, 2, 2), roughness: 0.5 });
    else floorMat = std(0xffffff, { map: TEX.concrete(0x77716a, rng, 2, 2, 10), roughness: 0.95 });
    floorMat.bumpMap = floorMat.map;
    floorMat.bumpScale = 0.6;
    const wallTex = TEX.plaster(wallColor, rng, 3, 1);
    const wallMat = std(0xffffff, { map: wallTex, bumpMap: wallTex, bumpScale: 0.4, roughness: 0.95 });
    I.room({ w, d, h, floorMat, wallMat });

    const warm = 0xffe2b8;
    I.ambient(0xfff4e6, 0x6b5a48, tier === 'poor' ? 0.25 : 0.45);
    if (tier === 'poor') {
      const bulb = I.light(-1, h - 0.45, 0, 0xffd08a, 9, { fixture: 'bulb', shadow: true });
      I.animators.push((t) => { bulb.intensity = Math.sin(t * 13) > 0.97 ? 3 : 9; });
    } else {
      I.light(-w / 4, h - 0.6, 0, warm, tier === 'rich' ? 18 : 13, { fixture: 'pendant', shadow: true });
      I.light(w / 4, h - 0.6, -d / 4, warm, tier === 'rich' ? 14 : 10, { fixture: 'pendant' });
    }

    // Finestre
    const sky = 0xcfe2f2;
    I.window(w / 2 - 0.02, 1.6, -1.5, tier === 'rich' ? 2.6 : 1.3, 1.3, -Math.PI / 2, sky);
    if (tier !== 'poor') I.window(-w / 2 + 0.02, 1.6, -d / 4, 1.3, 1.3, Math.PI / 2, sky);

    // Soggiorno: divano rivolto verso la TV sulla parete sinistra
    const sofaColor = { rich: 0xd8c8ad, middle: 0x5e7189, worker: 0x7a5d48, poor: 0x4d4436 }[tier] || 0x5e7189;
    if (tier !== 'poor') {
      I.sofa(-w / 2 + 3.4, 0.6, -Math.PI / 2, sofaColor, tier === 'rich' ? 2.8 : 2.2);
      I.table(-w / 2 + 2.1, 0.6, 0.6, 1.1, 0x5a3e2b, 0.42);
      const rug = I.mesh(new THREE.PlaneGeometry(2.6, 2.0), std(tier === 'rich' ? 0x8a3b3b : 0x5d6e52, { roughness: 1 }), -w / 2 + 2.3, 0.015, 0.6);
      rug.rotation.x = -Math.PI / 2;
    } else {
      I.box(1.5, 0.2, 2.0, std(0x8c8270, { roughness: 1 }), -w / 2 + 1.2, 0.1, 1.2, { solid: true });
      I.box(1.3, 0.12, 0.5, std(0xb7ad98, { roughness: 1 }), -w / 2 + 1.2, 0.26, 0.4);
    }
    // TV
    I.box(0.45, 0.55, 1.8, std(0x2b2522, { roughness: 0.5 }), -w / 2 + 0.3, 0.275, 0.6, { solid: true });
    const tvMat = new THREE.MeshStandardMaterial({ color: 0x050608, emissive: 0x6fa8ff, emissiveIntensity: 0.6, roughness: 0.2 });
    const tv = I.box(0.06, 0.75, 1.3, tvMat, -w / 2 + 0.3, 0.98, 0.6);
    I.animators.push((t) => {
      tvMat.emissive.setHSL((t * 0.05) % 1, 0.5, 0.5);
      tvMat.emissiveIntensity = 0.45 + Math.sin(t * 9) * 0.08;
    });
    tv.castShadow = false;

    // Cucina lungo la parete di fondo
    const counterMat = std(tier === 'rich' ? 0xf4f2ee : tier === 'poor' ? 0x8a8170 : 0xd9d2c3, { roughness: 0.35 });
    const topMat = tier === 'rich' ? std(0xffffff, { map: TEX.marble(rng, 1, 1), roughness: 0.15 }) : std(0x4a4540, { roughness: 0.4 });
    I.box(3.6, 0.88, 0.65, counterMat, -w / 2 + 2.1, 0.44, -d / 2 + 0.33, { solid: true, shadow: true });
    I.box(3.66, 0.05, 0.7, topMat, -w / 2 + 2.1, 0.905, -d / 2 + 0.35);
    I.box(3.6, 0.7, 0.35, counterMat, -w / 2 + 2.1, 1.95, -d / 2 + 0.18);
    I.box(0.6, 0.02, 0.4, std(0x9aa3aa, { metalness: 0.9, roughness: 0.2 }), -w / 2 + 1.4, 0.935, -d / 2 + 0.35);
    I.box(0.85, 1.9, 0.7, std(0xe6e8ea, { metalness: 0.4, roughness: 0.3 }), -w / 2 + 4.4, 0.95, -d / 2 + 0.36, { solid: true, shadow: true });

    // Zona notte
    if (tier !== 'poor') {
      const bx = w / 2 - 1.4, bz = -d / 2 + 1.25;
      I.box(1.6, 0.4, 2.1, std(0x6b4a32, { roughness: 0.6 }), bx, 0.2, bz, { solid: true });
      I.box(1.55, 0.2, 2.0, std(0xf1eee6, { roughness: 1 }), bx, 0.5, bz);
      I.box(1.56, 0.12, 1.3, std(tier === 'rich' ? 0x2f4a6b : 0x8d6a4f, { roughness: 1 }), bx, 0.62, bz + 0.35);
      I.box(1.6, 0.9, 0.1, std(0x5a3e2b), bx, 0.65, -d / 2 + 0.1);
      I.box(0.5, 0.5, 0.45, std(0x5a3e2b), bx - 1.15, 0.25, -d / 2 + 0.35, { solid: true });
      I.light(bx - 1.15, 0.75, -d / 2 + 0.35, 0xffd39a, 2.5, { fixture: 'bulb' });
      I.interact(bx - 1.25, bz + 0.5, 'dormire fino al mattino', 'sleep', { lie: I.toWorld(bx, 0.74, bz + 0.98), facing: 0 }, 1.6);
    } else {
      I.interact(-w / 2 + 2.3, 1.2, 'dormire fino al mattino', 'sleep', { lie: I.toWorld(-w / 2 + 1.2, 0.34, 2.15), facing: 0 }, 1.6);
    }
    // Tavolo da pranzo
    I.table(w / 2 - 2.2, d / 2 - 3.0, 1.4, 0.9, tier === 'poor' ? 0x6e5c47 : 0x8a6a4c);
    I.chair(w / 2 - 2.7, d / 2 - 2.25, Math.PI, 0x5a3e2b);
    I.chair(w / 2 - 1.7, d / 2 - 2.25, Math.PI, 0x5a3e2b);
    if (tier === 'rich') {
      I.plant(w / 2 - 0.5, d / 2 - 0.6, 1.3);
      I.plant(-w / 2 + 0.5, d / 2 - 0.6, 1.1);
      I.box(0.4, 2.2, 1.8, std(0x4e3626), w / 2 - 0.25, 1.1, 0.6, { solid: true });
    }
    if (tier === 'poor') {
      for (let i = 0; i < 6; i++) {
        const stain = I.mesh(new THREE.CircleGeometry(0.2 + rng() * 0.5, 16), new THREE.MeshBasicMaterial({ color: 0x3e392f, transparent: true, opacity: 0.35 }), -w / 2 + 0.6 + rng() * (w - 1.2), 0.6 + rng() * 1.8, -d / 2 + 0.012);
        stain.castShadow = false;
      }
    }
    return { w, d, h };
  },

  /* ---------------- OSPEDALE ---------------- */
  hospital(I, ctx) {
    const rng = I.rng;
    const w = 18, d = 14, h = 4.2;
    const floorTex = TEX.tiles(0xe8ecea, '#b9c0bd', rng, 6, 4, 3);
    const floorMat = std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.5, roughness: 0.18, metalness: 0.05 });
    const wallTex = TEX.plaster(0xe3ece8, rng, 3, 1);
    const wallMat = std(0xffffff, { map: wallTex, roughness: 0.9 });
    I.room({ w, d, h, floorMat, wallMat, trim: 0x6a8f86 });
    I.ambient(0xf3fbff, 0x9aa5a0, 0.55);
    for (const [x, z] of [[-5, -2], [0, -3], [5, -2], [0, 2.5]]) I.light(x, h - 0.25, z, 0xf2f8ff, 16, { fixture: 'panel', shadow: x === 0 && z === -3 });

    // Fascia colorata sulle pareti
    I.box(w, 0.25, 0.02, std(0x3f8f80), 0, 1.0, -d / 2 + 0.012);
    // Accettazione
    const deskMat = std(0xf5f5f2, { roughness: 0.3 });
    I.box(6, 1.1, 0.8, deskMat, 0, 0.55, -3, { solid: true, shadow: true });
    I.box(0.8, 1.1, 2.4, deskMat, 3.4, 0.55, -3.8, { solid: true, shadow: true });
    I.box(6.1, 0.05, 0.95, std(0x3f8f80, { roughness: 0.3 }), 0, 1.13, -3);
    I.box(0.5, 0.35, 0.05, std(0x111111), -1.2, 1.35, -3.3);
    I.npc({ skin: I.randomSkin(), shirt: 0xe6f0ee, pants: 0xe6f0ee, hair: 0x2a2018, sex: 'f' }, -0.5, -4.2, 0);
    I.interact(-0.5, -2.1, 'farti visitare (cure complete $150)', 'hospital', {}, 1.8);
    I.npc({ skin: I.randomSkin(), shirt: 0x3f8f80, pants: 0x3f8f80, hair: 0x1a1410, sex: 'm' }, 1.6, -4.4, -0.3);
    I.sign('ACCETTAZIONE', '#9df5dc', 4, 0.6, 0, 3.2, -d / 2 + 0.02, 0);
    I.sign('PRONTO SOCCORSO  →', '#ff6b6b', 3.6, 0.5, w / 2 - 0.02, 2.8, -3, -Math.PI / 2);
    // Porta interna verso i reparti
    I.box(2.4, 2.6, 0.1, std(0xc9d6d2, { metalness: 0.3, roughness: 0.3 }), -6, 1.3, -d / 2 + 0.05);
    I.box(0.6, 0.6, 0.02, new THREE.MeshBasicMaterial({ color: 0xbfe8ff }), -6.6, 1.8, -d / 2 + 0.11);
    I.box(0.6, 0.6, 0.02, new THREE.MeshBasicMaterial({ color: 0xbfe8ff }), -5.4, 1.8, -d / 2 + 0.11);

    // Sala d'attesa: file di sedie blu
    const seatMat = std(0x2f5d8a, { roughness: 0.5 });
    const frame = std(0x9aa1a6, { metalness: 0.8, roughness: 0.3 });
    for (let r = 0; r < 3; r++) {
      const z = 0 + r * 1.6;
      const x0 = -w / 2 + 2.2;
      I.box(4.2, 0.06, 0.08, frame, x0 + 2, 0.4, z);
      for (let i = 0; i < 6; i++) {
        I.box(0.55, 0.06, 0.5, seatMat, x0 + i * 0.7 + 0.25, 0.46, z);
        I.box(0.55, 0.5, 0.06, seatMat, x0 + i * 0.7 + 0.25, 0.72, z - 0.25);
      }
      I.addBody(4.3, 0.95, 0.6, x0 + 2, 0.47, z);
    }
    I.npc({ skin: I.randomSkin(), shirt: 0x9a5a3a, pants: 0x2b2b33, hair: 0x2a2018, sex: 'm' }, -w / 2 + 5.5, 4.6, Math.PI);
    // Distributore, piante, barella
    I.box(0.9, 1.9, 0.8, std(0x2a2d31), w / 2 - 0.8, 0.95, 2.5, { solid: true, shadow: true });
    I.box(0.05, 1.3, 0.6, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x9fd8ff, emissiveIntensity: 1.1 }), w / 2 - 1.27, 1.15, 2.5);
    I.plant(w / 2 - 0.7, -d / 2 + 0.7, 1.3);
    I.plant(-w / 2 + 0.7, -d / 2 + 0.7, 1.3);
    I.box(0.8, 0.08, 2.0, std(0xf2f2f2), 5.5, 0.8, 2.2, { solid: true });
    I.box(0.05, 0.8, 0.05, frame, 5.2, 0.4, 1.4);
    I.box(0.05, 0.8, 0.05, frame, 5.8, 0.4, 3.0);
    I.box(0.6, 0.12, 0.35, std(0xffffff), 5.5, 0.9, 1.5);
    return { w, d, h };
  },

  /* ---------------- MINIMARKET ---------------- */
  market(I, ctx) {
    const rng = I.rng;
    const w = 14, d = 13, h = 3.6;
    const floorTex = TEX.tiles((x, y) => ((x + y) % 2 ? 0xe8e4dc : 0xb9b3a8), '#8f8a80', rng, 8, 3, 3);
    const floorMat = std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.4, roughness: 0.3 });
    const wallMat = std(0xffffff, { map: TEX.plaster(0xeef0ea, rng, 3, 1), roughness: 0.9 });
    I.room({ w, d, h, floorMat, wallMat, trim: 0x2e7d4f });
    I.ambient(0xf6fff8, 0x8a9088, 0.55);
    for (const x of [-4, 0, 4]) for (const z of [-3, 1.5]) I.light(x, h - 0.2, z, 0xf4fbff, 9, { fixture: 'panel', shadow: x === 0 && z === -3 });
    I.box(w, 0.6, 0.02, std(0x2e7d4f), 0, h - 0.3, -d / 2 + 0.012);
    I.sign('MINIMARKET · APERTO 24H', '#7dff9a', 5, 0.5, 0, h - 0.3, -d / 2 + 0.03, 0, 'rgba(20,60,40,0.95)');

    // Scaffali con prodotti
    const shelfMat = std(0xdcdcd8, { metalness: 0.5, roughness: 0.4 });
    const shelfXs = [-4.6, -1.6, 1.4];
    const len = 6;
    const z0 = -4.2, z1 = z0 + len;
    const prodColors = [0xd62828, 0xf77f00, 0xfcbf49, 0x2a9d8f, 0x264653, 0xe9c46a, 0x8ecae6, 0x6a4c93, 0xffffff, 0x3a86ff];
    const items = [];
    for (const sx of shelfXs) {
      I.box(0.9, 1.9, len, shelfMat, sx, 0.95, (z0 + z1) / 2, { solid: true, shadow: true });
      for (let lvl = 0; lvl < 4; lvl++) {
        const y = 0.25 + lvl * 0.45;
        I.box(1.2, 0.03, len, shelfMat, sx, y, (z0 + z1) / 2);
        for (const side of [-1, 1]) {
          let z = z0 + 0.15;
          while (z < z1 - 0.15) {
            const bw = 0.12 + rng() * 0.12;
            const bh = 0.15 + rng() * 0.2;
            items.push([sx + side * 0.48, y + 0.015 + bh / 2, z + bw / 2, bw, bh, prodColors[Math.floor(rng() * prodColors.length)]]);
            z += bw + 0.03;
          }
        }
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const inst = new THREE.InstancedMesh(geo, std(0xffffff, { roughness: 0.5 }), items.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    items.forEach(([x, y, z, bw, bh, c], i) => {
      m4.makeScale(0.2, bh, bw).setPosition(x, y, z);
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.set(c));
    });
    I.group.add(inst);

    // Frigoriferi sul fondo
    I.box(w - 2, 2.2, 0.8, std(0x2c3238, { metalness: 0.5, roughness: 0.4 }), 0, 1.1, -d / 2 + 0.45, { solid: true });
    const fridgeGlass = new THREE.MeshStandardMaterial({ color: 0x0b1620, emissive: 0xbfe6ff, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.2 });
    for (let i = 0; i < 6; i++) I.box(1.8, 1.8, 0.02, fridgeGlass, -5 + i * 2, 1.15, -d / 2 + 0.86);
    // Cassa
    I.box(2.6, 1.0, 0.8, std(0x2e7d4f, { roughness: 0.4 }), 4.6, 0.5, 2.6, { solid: true, shadow: true });
    I.box(2.7, 0.05, 0.9, std(0x1f1f22, { roughness: 0.3 }), 4.6, 1.03, 2.6);
    I.box(0.4, 0.3, 0.35, std(0x1f1f22), 4.2, 1.2, 2.6);
    I.box(0.35, 0.22, 0.02, new THREE.MeshBasicMaterial({ color: 0x7dff9a }), 4.2, 1.27, 2.79);
    I.npc({ skin: I.randomSkin(), shirt: 0x2e7d4f, pants: 0x22262e, hair: 0x1b1410, sex: rng() < 0.5 ? 'm' : 'f' }, 4.6, 1.6, 0);
    I.interact(4.6, 3.6, 'fare acquisti alla cassa', 'shop', { shop: 'market' }, 1.8);
    // Cestini
    for (let i = 0; i < 3; i++) I.box(0.5, 0.35, 0.35, std(0xd62828, { roughness: 0.6 }), 6.2, 0.18 + i * 0.3, 4.6, { solid: i === 0 });
    return { w, d, h };
  },

  /* ---------------- OFFICINA / CONCESSIONARIA ---------------- */
  garage(I, ctx) {
    const rng = I.rng;
    const w = 22, d = 17, h = 6;
    const floorTex = TEX.concrete(0x8d8a84, rng, 3, 3, 16);
    const floorMat = std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.8, roughness: 0.75 });
    const wallTex = TEX.concrete(0xb8b5ae, rng, 4, 1, 3);
    const wallMat = std(0xffffff, { map: wallTex, bumpMap: wallTex, bumpScale: 0.5, roughness: 0.9 });
    I.room({ w, d, h, floorMat, wallMat, ceilMat: std(0x55595e, { roughness: 1 }), trim: 0x2b3a4a });
    I.ambient(0xe9f2ff, 0x5a5650, 0.45);
    for (const x of [-6, 0, 6]) I.light(x, h - 0.6, -1, 0xf0f6ff, 30, { fixture: 'pendant', shadow: x === 0 });
    I.sign('OFFICINA & CONCESSIONARIA', '#8fd0ff', 8, 0.9, 0, h - 1.2, -d / 2 + 0.02, 0);
    // Pedana espositiva
    const podium = std(0xf2f2f2, { roughness: 0.25 });
    I.box(16, 0.15, 6.5, podium, 0, 0.075, -4.4, { solid: true });
    const colors = [0xb3121d, 0x1d3f8f, 0xf2f2f2, 0x1a1a1a];
    I.car(-5.5, -4.4, 0.35, colors[Math.floor(rng() * colors.length)], 0.15);
    I.car(0, -4.4, 0, colors[Math.floor(rng() * colors.length)], 0.15);
    I.car(5.5, -4.4, -0.35, colors[Math.floor(rng() * colors.length)], 0.15);
    for (let i = 0; i < 3; i++) {
      const price = 8000 + Math.floor(rng() * 40) * 1000;
      I.sign(`$${price.toLocaleString('it-IT')}`, '#f0b43c', 1.4, 0.35, -5.5 + i * 5.5, 0.6, -0.9, 0);
    }
    // Ponte sollevatore con auto
    const liftMat = std(0xd9a62b, { metalness: 0.5, roughness: 0.4 });
    for (const sx of [-1.4, 1.4]) I.box(0.3, 2.6, 0.3, liftMat, 6.5 + sx, 1.3, 3.2, { solid: true });
    I.box(3.2, 0.12, 4.6, liftMat, 6.5, 1.55, 3.2);
    I.car(6.5, 3.2, 0, 0x6b7076, 1.62);
    // Banco attrezzi, pneumatici
    I.box(4, 0.9, 0.8, std(0x8a2b2b, { metalness: 0.4, roughness: 0.5 }), -w / 2 + 2.5, 0.45, 2.5, { solid: true, shadow: true });
    I.box(4, 1.6, 0.06, std(0x3a3d40, { metalness: 0.5 }), -w / 2 + 2.5, 1.9, 2.1);
    for (let i = 0; i < 8; i++) I.box(0.05, 0.3, 0.04, std(0xbfc4c9, { metalness: 0.9, roughness: 0.2 }), -w / 2 + 1 + i * 0.4, 1.9, 2.15);
    const tire = std(0x151515, { roughness: 0.9 });
    for (let s = 0; s < 2; s++) for (let i = 0; i < 4; i++) {
      I.mesh(new THREE.TorusGeometry(0.3, 0.13, 10, 20), tire, -w / 2 + 1 + s * 0.9, 0.13 + i * 0.26, 5.5).rotation.x = Math.PI / 2;
    }
    I.addBody(1.8, 1.1, 0.8, -w / 2 + 1.45, 0.55, 5.5);
    I.npc({ skin: I.randomSkin(), shirt: 0x2b4a6e, pants: 0x2b4a6e, hair: 0x1b1410, sex: 'm' }, 3.8, 3.4, -1.2);
    I.npc({ skin: I.randomSkin(), shirt: 0xf2f2f2, pants: 0x22262e, hair: 0x2a2018, sex: rng() < 0.5 ? 'm' : 'f', sleeves: 'long' }, -2.5, -0.2, 0.4);
    I.interact(-2.5, 1.0, 'parlare con il venditore', 'dealer', {}, 1.9);
    return { w, d, h };
  },

  /* ---------------- BANCA ---------------- */
  bank(I, ctx) {
    const rng = I.rng;
    const w = 16, d = 14, h = 5;
    const floorTex = TEX.marble(rng, 4, 4);
    const floorMat = std(0xffffff, { map: floorTex, roughness: 0.12, metalness: 0.05 });
    const wallMat = std(0xffffff, { map: TEX.plaster(0xdccfb8, rng, 3, 1), roughness: 0.85 });
    I.room({ w, d, h, floorMat, wallMat, ceilMat: std(0xf4efe4, { roughness: 1 }), trim: 0x6b5232 });
    I.ambient(0xfff6e6, 0x7a6a52, 0.5);
    for (const [x, z] of [[-4, -1], [4, -1], [0, 3]]) I.light(x, h - 0.9, z, 0xffe2b0, 22, { fixture: 'pendant', shadow: x === -4 });
    // Colonne
    const colMat = std(0xffffff, { map: TEX.marble(rng, 1, 2), roughness: 0.2 });
    for (const [x, z] of [[-5, 1], [5, 1], [-5, 4.5], [5, 4.5]]) {
      I.mesh(new THREE.CylinderGeometry(0.35, 0.4, h, 20), colMat, x, h / 2, z).castShadow = true;
      I.addBody(0.8, h, 0.8, x, h / 2, z);
    }
    // Bancone con vetri
    const woodMat = std(0xffffff, { map: TEX.wood(0x5a3a24, rng, 2, 1), roughness: 0.4 });
    I.box(11, 1.15, 0.8, woodMat, 0, 0.575, -2.6, { solid: true, shadow: true });
    I.box(11.1, 0.05, 0.9, std(0x1f1a16, { roughness: 0.2 }), 0, 1.17, -2.6);
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfefff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false });
    I.box(11, 1.1, 0.03, glass, 0, 1.75, -2.6, { solid: true });
    for (let i = -2; i <= 2; i++) I.box(0.05, 1.1, 0.06, std(0xc9a35a, { metalness: 0.9, roughness: 0.25 }), i * 2.6, 1.75, -2.6);
    for (const x of [-3.6, 0, 3.6]) I.npc({ skin: I.randomSkin(), shirt: 0x26303d, pants: 0x1e232b, hair: 0x2a2018, sex: rng() < 0.5 ? 'm' : 'f' }, x, -3.5, 0);
    // Caveau
    const steel = std(0xb9bec4, { metalness: 0.95, roughness: 0.25 });
    const vault = I.mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.35, 40), steel, 0, 2.0, -d / 2 + 0.2);
    vault.rotation.x = Math.PI / 2;
    const wheel = I.mesh(new THREE.TorusGeometry(0.45, 0.06, 10, 30), steel, 0, 2.0, -d / 2 + 0.42);
    I.animators.push((t) => { wheel.rotation.z = Math.sin(t * 0.3) * 0.2; });
    I.sign(`BANCA CENTRALE DI ${ctx.city.city.toUpperCase()}`, '#f0c860', 6, 0.55, 0, h - 0.7, -d / 2 + 0.03, 0, 'rgba(30,22,12,0.95)');
    // Attesa
    I.sofa(-5.5, 3, Math.PI / 2, 0x4a2f2a, 2.4);
    I.sofa(5.5, 3, -Math.PI / 2, 0x4a2f2a, 2.4);
    I.plant(-w / 2 + 0.7, -d / 2 + 0.7, 1.4);
    I.plant(w / 2 - 0.7, -d / 2 + 0.7, 1.4);
    I.box(1.2, 1.1, 0.6, std(0x2a2d31, { metalness: 0.5 }), w / 2 - 0.5, 0.55, -0.5, { solid: true, rotY: -Math.PI / 2 });
    I.box(0.02, 0.4, 0.5, new THREE.MeshBasicMaterial({ color: 0x7fd0ff }), w / 2 - 0.82, 0.85, -0.5);
    I.interact(0, -1.6, 'andare allo sportello', 'bank', {}, 1.8);
    I.interact(w / 2 - 1.5, -0.5, 'usare il bancomat', 'atm', {}, 1.3);
    return { w, d, h };
  },

  /* ---------------- LOCALE / BAR ---------------- */
  bar(I, ctx) {
    const rng = I.rng;
    const w = 13, d = 11, h = 3.4;
    const floorTex = TEX.wood(0x4a3020, rng, 2, 2);
    const floorMat = std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.6, roughness: 0.55 });
    const brick = TEX.brick(rng, 4, 1.5);
    const wallMat = std(0xffffff, { map: brick, bumpMap: brick, bumpScale: 1.2, roughness: 0.95 });
    I.room({ w, d, h, floorMat, wallMat, ceilMat: std(0x1d1a18, { roughness: 1 }), trim: 0x1d1a18 });
    I.ambient(0xffd8b0, 0x2a1a14, 0.25);
    for (const x of [-3.5, 0, 3.5]) I.light(x, h - 0.7, -2.2, 0xffc27a, 7, { fixture: 'pendant', shadow: x === 0 });
    const neonLight = I.light(w / 2 - 0.6, 2.4, 1, 0xff4fa0, 10, { fixture: 'none' });
    I.light(-w / 2 + 0.8, 2.2, 3, 0x4fd8ff, 6, { fixture: 'none' });
    const neon = I.sign('PARADISE', '#ff6fae', 3.2, 0.8, w / 2 - 0.03, 2.3, 1, -Math.PI / 2, 'rgba(0,0,0,0)');
    neon.material.transparent = true;
    I.animators.push((t) => {
      const flick = Math.sin(t * 17) > 0.96 ? 0.3 : 1;
      neonLight.intensity = 10 * flick;
      neon.material.opacity = flick;
    });
    // Bancone
    const wood = std(0xffffff, { map: TEX.wood(0x3a2418, rng, 2, 1), roughness: 0.35 });
    I.box(7, 1.1, 0.7, wood, -1.5, 0.55, -2.8, { solid: true, shadow: true });
    I.box(7.1, 0.06, 0.85, std(0x1a120c, { roughness: 0.15 }), -1.5, 1.13, -2.8);
    // Scaffale bottiglie retroilluminato
    I.box(7, 2, 0.35, std(0x1a120c), -1.5, 1.9, -d / 2 + 0.2);
    I.box(7, 1.8, 0.02, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 0.6 }), -1.5, 1.9, -d / 2 + 0.38);
    const bottleColors = [0x2e7d32, 0x8d6e63, 0xffc107, 0x80deea, 0xc62828, 0xeeeeee];
    for (let lvl = 0; lvl < 3; lvl++) {
      I.box(7, 0.03, 0.35, std(0x2a1d14), -1.5, 1.2 + lvl * 0.6, -d / 2 + 0.55);
      for (let i = 0; i < 22; i++) {
        const b = I.mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.32, 10), new THREE.MeshPhysicalMaterial({ color: bottleColors[Math.floor(rng() * bottleColors.length)], roughness: 0.08, transmission: 0, transparent: true, opacity: 0.85 }), -4.7 + i * 0.3, 1.38 + lvl * 0.6, -d / 2 + 0.55);
        b.castShadow = false;
      }
    }
    // Sgabelli
    const chrome = std(0xc9ced3, { metalness: 0.9, roughness: 0.2 });
    for (let i = 0; i < 6; i++) {
      const x = -4.5 + i * 1.1;
      I.mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), chrome, x, 0.375, -2.1);
      I.mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.08, 16), std(0x8a1c2b, { roughness: 0.5 }), x, 0.78, -2.1);
      I.addBody(0.45, 0.82, 0.45, x, 0.41, -2.1);
    }
    // Tavolini
    for (const [x, z] of [[-4.2, 1.6], [-2.2, 3.6], [2.4, 2.2], [4.8, -1.2]]) {
      I.mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 24), std(0x1d1410, { roughness: 0.3 }), x, 0.74, z);
      I.mesh(new THREE.CylinderGeometry(0.06, 0.25, 0.72, 10), chrome, x, 0.36, z);
      I.addBody(1, 0.78, 1, x, 0.39, z);
      I.chair(x - 0.8, z, Math.PI / 2, 0x3a2418);
      I.chair(x + 0.8, z, -Math.PI / 2, 0x3a2418);
      const candle = new THREE.PointLight(0xffa040, 1.2, 3, 2);
      candle.position.set(x, 0.9, z);
      I.group.add(candle);
      I.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffa040, emissiveIntensity: 2 }), x, 0.82, z);
    }
    // Jukebox
    I.box(1, 1.7, 0.7, std(0x6a1b2a, { roughness: 0.3, metalness: 0.4 }), -w / 2 + 0.6, 0.85, 4.2, { solid: true });
    const juke = I.box(0.02, 0.9, 0.5, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffb347, emissiveIntensity: 1.2 }), -w / 2 + 1.11, 1.1, 4.2);
    I.animators.push((t) => { juke.material.emissive.setHSL((t * 0.1) % 1, 0.9, 0.55); });
    I.npc({ skin: I.randomSkin(), shirt: 0x111111, pants: 0x1a1a1a, hair: 0x1b1410, sex: rng() < 0.5 ? 'm' : 'f' }, -1.5, -3.7, 0);
    I.interact(1.6, -1.8, 'ordinare al bancone', 'shop', { shop: 'bar' }, 1.6);
    I.npc({ skin: I.randomSkin(), shirt: 0x5a2d82, pants: 0x22262e, hair: 0x2a2018, sex: 'f' }, -2.6, -1.6, Math.PI);
    I.npc({ skin: I.randomSkin(), shirt: 0x2d6a4f, pants: 0x22262e, hair: 0x1b1410, sex: 'm' }, 2.2, 1.4, 0.4);
    return { w, d, h };
  },

  /* ---------------- RISTORANTE / TRATTORIA ---------------- */
  restaurant(I, ctx) {
    return buildDiner(I, ctx, 'restaurant');
  },

  /* ---------------- PIZZERIA ---------------- */
  pizzeria(I, ctx) {
    return buildDiner(I, ctx, 'pizzeria');
  },

  /* ---------------- FARMACIA ---------------- */
  pharmacy(I) {
    const rng = I.rng;
    const w = 12, d = 11, h = 3.4;
    const floorTex = TEX.tiles(0xf2f4f3, '#c9d0cc', rng, 8, 3, 3);
    I.room({ w, d, h, floorMat: std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.4, roughness: 0.15 }), wallMat: std(0xffffff, { map: TEX.plaster(0xf4f8f5, rng, 3, 1), roughness: 0.9 }), trim: 0x2e8b57 });
    I.ambient(0xf4fff8, 0x9aa5a0, 0.55);
    for (const [x, z] of [[-3, -1.5], [3, -1.5], [0, 2.5]]) I.light(x, h - 0.2, z, 0xf6fff9, 11, { fixture: 'panel', shadow: x === 0 });
    // Scaffali a parete con confezioni colorate
    const shelfMat = std(0xffffff, { roughness: 0.4 });
    const items = [];
    for (const side of [-1, 1]) {
      I.box(0.5, 2.3, 7, shelfMat, side * (w / 2 - 0.25), 1.15, -0.5, { solid: true, shadow: true });
      for (let lvl = 0; lvl < 5; lvl++) {
        for (let z = -3.8; z < 2.8; z += 0.22) {
          if (rng() < 0.15) continue;
          items.push([side * (w / 2 - 0.55), 0.35 + lvl * 0.42, z, [0x2e8b57, 0xffffff, 0x3a7bd5, 0xe74c3c, 0xf1c40f, 0x9b59b6][Math.floor(rng() * 6)]]);
        }
      }
    }
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.2, 0.16), std(0xffffff, { roughness: 0.5 }), items.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    items.forEach(([x, y, z, c], i) => { m4.makeTranslation(x, y, z); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.set(c)); });
    I.group.add(inst);
    // Banco con farmacista
    I.box(6, 1.05, 0.8, std(0x2e8b57, { roughness: 0.35 }), 0, 0.525, -2.6, { solid: true, shadow: true });
    I.box(6.1, 0.05, 0.9, std(0xf4f4f4, { roughness: 0.2 }), 0, 1.07, -2.6);
    I.box(0.4, 0.3, 0.3, std(0x1f1f22), -1.5, 1.25, -2.6);
    I.npc({ shirt: 0xf8f8f8, pants: 0x2b2f38, sleeves: 'long', glasses: true }, 0.4, -3.5, 0);
    I.sign('✚ FARMACIA', '#5dff8a', 3.2, 0.7, 0, h - 0.6, -d / 2 + 0.03, 0, 'rgba(6,30,14,0.95)');
    I.plant(w / 2 - 0.9, d / 2 - 0.9, 1.1);
    I.interact(0.4, -1.4, 'parlare con il farmacista', 'shop', { shop: 'pharmacy' }, 1.8);
    return { w, d, h };
  },

  /* ---------------- ARMERIA ---------------- */
  weapons(I) {
    const rng = I.rng;
    const w = 12, d = 10, h = 3.4;
    const floorTex = TEX.wood(0x3d2a1e, rng, 2, 2);
    const wallTex = TEX.concrete(0x6f6a62, rng, 3, 1, 4);
    I.room({ w, d, h, floorMat: std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.6, roughness: 0.6 }), wallMat: std(0xffffff, { map: wallTex, bumpMap: wallTex, bumpScale: 0.6, roughness: 0.9 }), ceilMat: std(0x2a2826), trim: 0x1d1b19 });
    I.ambient(0xffe6c8, 0x2a2420, 0.3);
    for (const x of [-3, 0, 3]) I.light(x, h - 0.6, -1.5, 0xffe2b8, 9, { fixture: 'pendant', shadow: x === 0 });
    // Bancone vetrina
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfefff, roughness: 0.05, transparent: true, opacity: 0.25, depthWrite: false });
    I.box(7, 0.7, 0.8, std(0x2a2522, { roughness: 0.4 }), 0, 0.35, -2.2, { solid: true, shadow: true });
    I.box(7, 0.35, 0.8, glass, 0, 0.88, -2.2, { solid: true });
    for (let i = 0; i < 6; i++) I.box(0.5, 0.05, 0.18, std(0x1c1d20, { metalness: 0.7, roughness: 0.35 }), -2.8 + i * 1.1, 0.75, -2.2);
    // Rastrelliera a parete (sagome)
    const steel = std(0x1c1d20, { metalness: 0.75, roughness: 0.35 });
    const woodStock = std(0x6b4423, { roughness: 0.5 });
    I.box(8, 2, 0.08, std(0x3a2f26), 0, 1.9, -d / 2 + 0.05);
    for (let i = 0; i < 7; i++) {
      I.box(1.2, 0.07, 0.05, steel, -3.2 + i * 1.05, 2.4, -d / 2 + 0.12).rotation.z = 0.08;
      I.box(0.35, 0.12, 0.05, woodStock, -3.7 + i * 1.05, 2.36, -d / 2 + 0.12);
      I.box(0.5, 0.05, 0.05, steel, -3.2 + i * 1.05, 1.6, -d / 2 + 0.12);
    }
    // Armadietto attrezzi aperto con il cacciavite speciale
    I.box(1.2, 2, 0.6, std(0x55606b, { metalness: 0.6, roughness: 0.4 }), w / 2 - 0.7, 1, 1.5, { solid: true, shadow: true });
    const doorL = I.box(0.04, 1.9, 0.6, std(0x5f6b77, { metalness: 0.6, roughness: 0.4 }), w / 2 - 1.35, 1, 1.9);
    doorL.rotation.y = -0.9;
    I.box(0.25, 0.04, 0.04, std(0xd69e2e), w / 2 - 0.75, 1.2, 1.25);
    I.box(0.12, 0.012, 0.012, std(0xc9ced3, { metalness: 0.95 }), w / 2 - 0.56, 1.2, 1.25);
    I.npc({ shirt: 0x4b5a35, pants: 0x2b2b2e, beard: true, sex: 'm', sleeves: 'long' }, 0.5, -3.1, 0);
    I.sign('ARMERIA · PORTO D\'ARMI OBBLIGATORIO', '#ff9a4a', 4.6, 0.45, 0, h - 0.4, -d / 2 + 0.03, 0, 'rgba(24,14,8,0.95)');
    I.interact(0.5, -1.2, 'parlare con l\'armaiolo', 'shop', { shop: 'weapons' }, 1.8);
    I.interact(w / 2 - 1.6, 1.5, 'aprire l\'armadietto attrezzi', 'shop', { shop: 'weapons' }, 1.4);
    return { w, d, h };
  },

  /* ---------------- BOUTIQUE ABBIGLIAMENTO ---------------- */
  clothing(I) {
    const rng = I.rng;
    const w = 16, d = 12, h = 3.6;
    const floorTex = TEX.wood(0xc9a77c, rng, 3, 2);
    I.room({ w, d, h, floorMat: std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.5, roughness: 0.35 }), wallMat: std(0xffffff, { map: TEX.plaster(0xf3eee8, rng, 3, 1), roughness: 0.9 }), trim: 0xb89870 });
    I.ambient(0xfff6ee, 0x8a7a6a, 0.5);
    for (const x of [-5, 0, 5]) for (const z of [-2.5, 1.5]) I.light(x, h - 0.2, z, 0xfff3e2, 6, { fixture: 'panel', shadow: x === 0 && z === -2.5 });
    const chrome = std(0xd0d4d8, { metalness: 0.95, roughness: 0.2 });
    const colors = [0xeeeeea, 0x1d1e22, 0x9a2224, 0x1f2f55, 0x9cc3e6, 0x4b5a35, 0x2a1c16, 0xd97a2b];
    // Stender con capi appesi
    for (const [rx, rz] of [[-5, -2], [-5, 1.5], [5, -2], [5, 1.5]]) {
      I.box(2.4, 0.04, 0.04, chrome, rx, 1.65, rz);
      I.box(0.04, 1.65, 0.04, chrome, rx - 1.2, 0.825, rz);
      I.box(0.04, 1.65, 0.04, chrome, rx + 1.2, 0.825, rz);
      for (let i = 0; i < 9; i++) {
        const shirt = I.box(0.05, 0.75, 0.55, std(colors[Math.floor(rng() * colors.length)], { roughness: 1 }), rx - 1.0 + i * 0.25, 1.25, rz);
        shirt.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.2;
      }
      I.addBody(2.5, 1.8, 0.7, rx, 0.9, rz);
    }
    // Scaffale scarpe e accessori
    I.box(4, 1.8, 0.45, std(0xb89870, { roughness: 0.5 }), 0, 0.9, -d / 2 + 0.25, { solid: true });
    for (let lvl = 0; lvl < 3; lvl++) for (let i = 0; i < 8; i++) {
      I.box(0.3, 0.12, 0.25, std([0xf0f0ee, 0x1a1a1c, 0x4a2f1c, 0x5a3a24][(i + lvl) % 4], { roughness: 0.5 }), -1.75 + i * 0.5, 0.5 + lvl * 0.55, -d / 2 + 0.35);
    }
    // Manichini
    for (const [mx, mz, c] of [[-2, -3.5, 0x2a1c16], [2, -3.5, 0x9cc3e6]]) {
      const m = makePerson({ height: 1.8, skin: 0xe9e5df, hair: 0xe9e5df, hairStyle: 'bald', shirt: c, sleeves: 'long', pants: 0x1c1d22, shoes: 0x1a1a1c });
      m.position.set(mx, 0.1, mz);
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      I.group.add(m);
      I.box(0.6, 0.1, 0.6, std(0xd0d4d8, { metalness: 0.8 }), mx, 0.05, mz, { solid: true });
    }
    // Specchio e camerino
    const mirror = I.box(1.2, 2.2, 0.04, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.02 }), -w / 2 + 0.05, 1.3, 3.2);
    mirror.rotation.y = Math.PI / 2;
    I.box(0.08, 2.4, 1.5, std(0x8a3b5a, { roughness: 1 }), -w / 2 + 1.6, 1.2, 4.3);
    // Cassa
    I.box(2.4, 1.0, 0.8, std(0xf3eee8, { roughness: 0.3 }), w / 2 - 2, 0.5, 3.6, { solid: true, shadow: true });
    I.npc({ shirt: 0x1d1e22, pants: 0x1d1e22, sex: 'f', hairStyle: 'bun', sleeves: 'long' }, w / 2 - 2, 4.4, Math.PI);
    I.sign('BOUTIQUE · NUOVA COLLEZIONE', '#3a2a4a', 4.4, 0.5, 0, h - 0.4, -d / 2 + 0.03, 0, 'rgba(250,246,240,0.95)');
    I.interact(w / 2 - 2, 2.6, 'comprare vestiti e accessori', 'shop', { shop: 'clothing' }, 1.8);
    I.interact(-w / 2 + 1.0, 3.2, 'cambiarti allo specchio', 'wardrobe', {}, 1.5);
    return { w, d, h };
  },

  /* ---------------- CHIESA ---------------- */
  church(I) {
    const rng = I.rng;
    const w = 16, d = 24, h = 9;
    const floorTex = TEX.marble(rng, 4, 6);
    const stoneTex = TEX.concrete(0xd9cfbd, rng, 4, 2, 2);
    I.room({ w, d, h, floorMat: std(0xffffff, { map: floorTex, roughness: 0.2 }), wallMat: std(0xffffff, { map: stoneTex, bumpMap: stoneTex, bumpScale: 0.8, roughness: 0.9 }), ceilMat: std(0x3a2e26, { roughness: 1 }), trim: 0x6b5232 });
    I.ambient(0xfff0d8, 0x5a4a3a, 0.35);
    for (const z of [-8, -1, 6]) I.light(0, h - 1.5, z, 0xffdcae, 26, { fixture: 'pendant', shadow: z === -8 });
    // Vetrate colorate
    const stainColors = [0x3a5bd9, 0xd93a5b, 0xd9b23a, 0x3ad98f, 0x9b3ad9];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        const c = stainColors[(i + (side > 0 ? 2 : 0)) % stainColors.length];
        const win = I.mesh(new THREE.PlaneGeometry(1.4, 3.6), new THREE.MeshBasicMaterial({ color: c, toneMapped: false }), side * (w / 2 - 0.02), 4.8, -8 + i * 5);
        win.rotation.y = -side * Math.PI / 2;
      }
    }
    // Panche
    const pewMat = std(0x5a3a24, { roughness: 0.55 });
    for (let r = 0; r < 6; r++) {
      for (const sx of [-1, 1]) {
        const x = sx * 3.6, z = -4 + r * 2;
        I.box(4.6, 0.08, 0.5, pewMat, x, 0.46, z);
        I.box(4.6, 0.6, 0.08, pewMat, x, 0.8, z + 0.25);
        I.box(0.08, 0.46, 0.5, pewMat, x - 2.25, 0.23, z);
        I.box(0.08, 0.46, 0.5, pewMat, x + 2.25, 0.23, z);
        I.addBody(4.6, 1.1, 0.6, x, 0.55, z + 0.05);
      }
    }
    // Presbiterio, altare e croce
    I.box(10, 0.4, 4, std(0xe8e0d0, { roughness: 0.3 }), 0, 0.2, -d / 2 + 2.2, { solid: true });
    I.box(2.6, 1.0, 1.0, std(0xf4efe4, { roughness: 0.3 }), 0, 0.9, -d / 2 + 2.4, { solid: true, shadow: true });
    I.box(2.8, 0.05, 1.1, std(0xffffff, { roughness: 0.9 }), 0, 1.42, -d / 2 + 2.4);
    const gold = std(0xd6a73a, { metalness: 0.95, roughness: 0.25 });
    I.box(0.25, 3.2, 0.2, gold, 0, 5.2, -d / 2 + 0.2);
    I.box(1.7, 0.25, 0.2, gold, 0, 6.0, -d / 2 + 0.2);
    // Candelabro votivo con candele tremolanti
    const flames = [];
    I.box(1.4, 0.9, 0.5, std(0x3a2e26), 4.5, 0.45, -d / 2 + 4.2, { solid: true });
    const flameMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa040, emissiveIntensity: 2.2 });
    for (let i = 0; i < 9; i++) {
      const cx = 3.95 + (i % 5) * 0.27, cz = -d / 2 + 4.05 + Math.floor(i / 5) * 0.25;
      I.mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 8), std(0xf8f4e8), cx, 0.97, cz);
      flames.push(I.mesh(new THREE.ConeGeometry(0.018, 0.05, 6), flameMat, cx, 1.07, cz));
    }
    const candleLight = new THREE.PointLight(0xffa040, 3, 6, 2);
    candleLight.position.set(4.5, 1.3, -d / 2 + 4.2);
    I.group.add(candleLight);
    I.animators.push((t) => {
      candleLight.intensity = 2.6 + Math.sin(t * 13) * 0.4 + Math.sin(t * 7.3) * 0.3;
      flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 15 + i) * 0.2; });
    });
    I.npc({ shirt: 0x111111, pants: 0x111111, sleeves: 'long', sex: 'm', hair: 0x9a9a9a }, -1.6, -d / 2 + 3.4, 0.3);
    I.interact(0, -d / 2 + 4.6, 'pregare davanti all\'altare', 'pray', {}, 2.0);
    I.interact(4.5, -d / 2 + 5.2, 'accendere una candela (offerta $2)', 'candle', {}, 1.5);
    return { w, d, h };
  },

  /* ---------------- STAZIONE DI POLIZIA ---------------- */
  police(I) {
    const rng = I.rng;
    const w = 16, d = 12, h = 3.4;
    const floorTex = TEX.tiles(0xb9bcc0, '#8a8d91', rng, 8, 3, 3);
    I.room({ w, d, h, floorMat: std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.4, roughness: 0.4 }), wallMat: std(0xffffff, { map: TEX.plaster(0xd6dde6, rng, 3, 1), roughness: 0.9 }), trim: 0x1b2a4a });
    I.ambient(0xeef4ff, 0x7a808a, 0.5);
    for (const x of [-4, 0, 4]) I.light(x, h - 0.2, -1, 0xeef6ff, 10, { fixture: 'panel', shadow: x === 0 });
    I.box(5, 1.15, 0.9, std(0x1b2a4a, { roughness: 0.4 }), 0, 0.575, -2, { solid: true, shadow: true });
    I.box(5.1, 0.05, 1.0, std(0xe9e9e9, { roughness: 0.3 }), 0, 1.17, -2);
    I.npc({ uniform: 'police', shirt: 0x2c4a7a, pants: 0x1b2a4a, sleeves: 'long' }, 0.3, -3, 0);
    I.sign('POLIZIA · ACCETTAZIONE DENUNCE', '#8fc0ff', 4.2, 0.45, 0, h - 0.4, -d / 2 + 0.03, 0, 'rgba(10,20,50,0.95)');
    // Celle
    const bars = std(0x4a4f57, { metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < 14; i++) I.box(0.05, h, 0.05, bars, -w / 2 + 0.4 + i * 0.3, h / 2, -d / 2 + 3.2);
    I.addBody(4.4, h, 0.2, -w / 2 + 2.35, h / 2, -d / 2 + 3.2);
    I.box(1.9, 0.4, 0.8, std(0x6b6f75), -w / 2 + 1.2, 0.2, -d / 2 + 1, { solid: true });
    // Panche d'attesa e bacheca
    for (const x of [3.5, 5.5]) {
      I.box(1.8, 0.08, 0.5, std(0x5a6270, { metalness: 0.5 }), x, 0.46, 3.5);
      I.addBody(1.8, 0.9, 0.5, x, 0.45, 3.5);
    }
    const posters = I.mesh(new THREE.PlaneGeometry(2.4, 1.2), std(0xf1ead8, { roughness: 1 }), w / 2 - 0.02, 1.7, 0);
    posters.rotation.y = -Math.PI / 2;
    I.interact(0.3, -1.0, 'parlare con l\'agente', 'police', {}, 1.8);
    return { w, d, h };
  },
};

/** Ristorante/pizzeria: tavoli con sedie (posti a sedere interattivi), cucina e decorazioni. */
function buildDiner(I, ctx, kind) {
  const rng = I.rng;
  const pizza = kind === 'pizzeria';
  const w = 16, d = 14, h = 3.6;
  const floorTex = pizza ? TEX.tiles((x, y) => ((x + y) % 2 ? 0xd9cdb4 : 0x9b3b2b), '#6b5a48', rng, 10, 3, 3) : TEX.wood(0x6b4a30, rng, 3, 2);
  const wallTex = pizza ? TEX.brick(rng, 4, 1.5) : TEX.plaster(0xead9bd, rng, 3, 1);
  I.room({
    w, d, h,
    floorMat: std(0xffffff, { map: floorTex, bumpMap: floorTex, bumpScale: 0.5, roughness: pizza ? 0.4 : 0.5 }),
    wallMat: std(0xffffff, { map: wallTex, bumpMap: pizza ? wallTex : null, bumpScale: 1, roughness: 0.9 }),
    ceilMat: std(pizza ? 0x2b231d : 0x4a3a2c, { roughness: 1 }),
    trim: 0x3a2618,
  });
  I.ambient(0xffe6c8, 0x3a2a1e, 0.35);
  // Boiserie
  if (!pizza) for (const side of [-1, 1]) I.box(0.04, 1.0, d, std(0x5a3a24, { roughness: 0.5 }), side * (w / 2 - 0.02), 0.5, 0);
  // Cucina sul fondo: passe con luce calda
  I.box(6, 1.1, 0.7, std(0x3a2618, { roughness: 0.4 }), -3.5, 0.55, -d / 2 + 0.6, { solid: true });
  I.box(6, 1.1, 0.04, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc078, emissiveIntensity: 0.5 }), -3.5, 2.0, -d / 2 + 0.05);
  I.box(1.2, 2.3, 0.08, std(0x8a6a4a), 2.2, 1.15, -d / 2 + 0.06);
  I.sign(pizza ? 'PIZZERIA VESUVIO · FORNO A LEGNA' : 'TRATTORIA DEL PORTO · CUCINA CASALINGA', '#ffd27a', 4.6, 0.5, 4.5, h - 0.5, -d / 2 + 0.03, 0, 'rgba(30,14,8,0.95)');
  I.kitchen = I.toWorld(2.2, 0, -d / 2 + 0.8);
  if (pizza) {
    // Forno a legna con brace
    const oven = I.mesh(new THREE.SphereGeometry(1.3, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8a4a2a, { roughness: 0.9 }), w / 2 - 2, 1.1, -d / 2 + 1.6);
    oven.castShadow = true;
    I.box(2.8, 1.1, 2.8, std(0x7a6a5a, { roughness: 1 }), w / 2 - 2, 0.55, -d / 2 + 1.6, { solid: true });
    const mouth = I.mesh(new THREE.CircleGeometry(0.42, 20, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false }), w / 2 - 2, 1.12, -d / 2 + 2.92);
    const fire = new THREE.PointLight(0xff7a2a, 9, 8, 2);
    fire.position.set(w / 2 - 2, 1.4, -d / 2 + 3.3);
    I.group.add(fire);
    I.animators.push((t) => {
      fire.intensity = 8 + Math.sin(t * 9) * 1.5 + Math.sin(t * 23) * 0.8;
      mouth.material.color.setHSL(0.07 + Math.sin(t * 6) * 0.01, 1, 0.5);
    });
    I.npc({ shirt: 0xf6f6f2, pants: 0x2b2b2e, sex: 'm', uniform: 'waiter' }, w / 2 - 2, -d / 2 + 3.6, Math.PI * 0.95);
  } else {
    // Bancone bar con macchina del caffè e bottiglie
    I.box(0.7, 1.1, 3.4, std(0x3a2618, { roughness: 0.35 }), w / 2 - 0.9, 0.55, -2.5, { solid: true, shadow: true });
    I.box(0.4, 0.45, 0.5, std(0xc9ced3, { metalness: 0.95, roughness: 0.2 }), w / 2 - 0.9, 1.33, -3.4);
    for (let i = 0; i < 10; i++) I.mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.32, 8), std([0x2e7d32, 0x7b241c, 0xf4d03f][i % 3], { roughness: 0.1 }), w / 2 - 0.25, 1.9 + (i % 2) * 0.45, -3.8 + Math.floor(i / 2) * 0.35);
  }
  for (const [x, z] of [[-5, -2.5], [0, -2.5], [5, -2.5], [-5, 1], [0, 1], [5, 1]]) I.light(x, h - 0.65, z, 0xffd6a0, pizza ? 5 : 6, { fixture: 'pendant', shadow: x === 0 && z === 1 });

  // Tavoli: il giocatore si siede sul lato +Z (guardando verso il fondo)
  const clothMat = pizza
    ? std(0xffffff, { map: TEX.tiles((x, y) => ((x + y) % 2 ? 0xffffff : 0xc0392b), '#ffffff', rng, 8, 1, 1), roughness: 1 })
    : std(0xf6f2ea, { roughness: 1 });
  const tables = [[-4.6, -2.6], [-4.6, 0.6], [-4.6, 3.6], [4.6, -2.0], [4.6, 1.0], [4.6, 4.0]];
  tables.forEach(([tx, tz], idx) => {
    I.table(tx, tz, 1.1, 1.1, 0x4a3020, 0.76);
    I.box(1.2, 0.02, 1.2, clothMat, tx, 0.79, tz);
    I.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8), std(0xe8e8e8, { roughness: 0.1 }), tx + 0.3, 0.88, tz - 0.3);
    I.chair(tx, tz + 0.8, Math.PI, 0x5a3a24);
    I.chair(tx, tz - 0.8, 0, 0x5a3a24);
    // Alcuni tavoli sono occupati da clienti NPC
    if (idx % 3 === 1) {
      const diner = makePerson({ ...randomLook(rng) });
      diner.position.set(tx, 0.5 - diner.userData.hipHeight, tz - 0.8);
      diner.rotation.y = 0;
      diner.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      I.group.add(diner);
      const anim = new HumanAnimator(diner);
      const ph = rng() * 10;
      I.animators.push((t, dt) => anim.update(dt, { state: 'sit', look: Math.sin(t * 0.3 + ph) * 0.3 }));
      const plate = I.mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.02, 20), std(0xffffff, { roughness: 0.2 }), tx, 0.81, tz - 0.35);
      plate.castShadow = false;
    } else {
      const seatIndex = I.seats.length;
      I.seats.push({
        seat: I.toWorld(tx, 0.5, tz + 0.8),
        facing: Math.PI,
        table: I.toWorld(tx, 0.8, tz),
        plate: I.toWorld(tx, 0.81, tz + 0.32),
        waiterSpot: I.toWorld(tx + (tx < 0 ? 1.1 : -1.1), 0, tz + 0.6),
      });
      I.interact(tx, tz + 1.5, 'sederti al tavolo', 'seat', { index: seatIndex }, 1.1);
    }
  });
  I.plant(-w / 2 + 0.7, d / 2 - 0.8, 1.2);
  I.plant(w / 2 - 0.7, d / 2 - 0.8, 1.2);
  return { w, d, h };
}
