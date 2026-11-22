// Visualizzazione 3D stilizzata della placenta (mini renderer dentro il pannello di nascita).
import * as THREE from 'three';
import { tweens, Ease } from './tween.js';
import { seededRandom } from './birthdata.js';
import { disposeObject3D } from './ui.js';

export class PlacentaView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
    this.camera.position.set(0, 1.75, 5.2);
    this.camera.lookAt(0, 0.82, 0);

    this.scene.add(new THREE.HemisphereLight(0xffe4e4, 0x3a0c14, 0.9));
    const key = new THREE.DirectionalLight(0xfff0e6, 2.4);
    key.position.set(1.5, 3, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fb2ff, 1.6);
    rim.position.set(-2.5, 1.5, -2);
    this.scene.add(rim);

    this.root = new THREE.Group();
    this.content = new THREE.Group();
    this.root.add(this.content);
    this.scene.add(this.root);

    this.time = 0;
    this.beatHz = 1.2;
    this.embryo = null;
    this.embryoLight = null;
    this.sac = null;
    this.disposed = false;
    this.resize();
  }

  /** Ricostruisce il modello per una nuova nascita con transizione. */
  async regenerate(birth, animate = true) {
    if (animate && this.content.children.length) {
      await tweens.to({ duration: 0.3, ease: Ease.inCubic, update: (e) => this.root.scale.setScalar(Math.max(0.001, 1 - e)) });
    }
    if (this.disposed) return;
    this.build(birth);
    this.root.scale.setScalar(0.001);
    await tweens.to({ duration: 0.7, ease: Ease.outBack, update: (e) => this.root.scale.setScalar(Math.max(0.001, e)) });
  }

  build(birth) {
    disposeObject3D(this.content);
    this.content.clear();
    const rng = seededRandom(birth.seed);
    const g = birth.genetics;

    // Rumore economico a somma di sinusoidi (deterministico per seed)
    const waves = Array.from({ length: 7 }, () => ({
      k: new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize().multiplyScalar(2 + rng() * 6),
      p: rng() * Math.PI * 2,
      a: 0.3 + rng() * 0.7,
    }));
    const noise = (v) => {
      let s = 0, n = 0;
      for (const w of waves) { s += Math.sin(v.dot(w.k) + w.p) * w.a; n += w.a; }
      return s / n; // circa [-1, 1]
    };

    /* --- Disco placentare --- */
    const lobes = 5 + Math.floor(rng() * 4);
    const geo = new THREE.SphereGeometry(1, 96, 48);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    const cDeep = new THREE.Color(0.42, 0.04, 0.07);
    const cLight = new THREE.Color(0.78, 0.2, 0.24);
    const cMemb = new THREE.Color(0.86, 0.6, 0.6);
    const tmp = new THREE.Color();
    const saturation = 0.75 + (g.resistenza / 100) * 0.5;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ang = Math.atan2(v.z, v.x);
      const n = noise(v);
      const lobe = Math.abs(Math.sin(ang * lobes * 0.5 + n)) * 0.05;
      const r = 1 + n * 0.06 + lobe;
      const x = v.x * r * 1.25;
      const y = v.y * r * 0.3;
      const z = v.z * r * 1.25;
      pos.setXYZ(i, x, y, z);
      if (v.y >= 0) {
        tmp.copy(cDeep).lerp(cLight, THREE.MathUtils.clamp(0.5 + n * 0.6 + lobe * 4, 0, 1));
        tmp.r = Math.min(1, tmp.r * saturation);
      } else {
        tmp.copy(cMemb).lerp(cDeep, 0.25 + n * 0.15);
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const discMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.22,
      sheen: 0.6, sheenColor: new THREE.Color(0xff8c99), sheenRoughness: 0.5,
    });
    const disc = new THREE.Mesh(geo, discMat);
    this.content.add(disc);

    /* --- Vasi sanguigni sulla superficie --- */
    const surfaceY = (rr) => {
      const u = Math.min(0.999, rr / 1.25);
      return Math.sqrt(1 - u * u) * 0.3 + 0.03;
    };
    const arteryMat = new THREE.MeshStandardMaterial({ color: 0xa3122a, roughness: 0.3, emissive: 0x3a0008, emissiveIntensity: 0.6 });
    const veinMat = new THREE.MeshStandardMaterial({ color: 0x3b2b80, roughness: 0.3, emissive: 0x0d0830, emissiveIntensity: 0.6 });
    const mainCount = 5 + Math.round(g.resistenza / 18);
    const thick = 0.012 + (g.resistenza / 100) * 0.016;
    const addVessel = (startAng, startR, endR, radius, mat, depth) => {
      const pts = [];
      let ang = startAng;
      const steps = 7;
      for (let s = 0; s <= steps; s++) {
        const rr = startR + (endR - startR) * (s / steps);
        ang += (rng() - 0.5) * 0.25;
        pts.push(new THREE.Vector3(Math.cos(ang) * rr, surfaceY(rr), Math.sin(ang) * rr));
        if (depth < 1 && s === 3 && rng() < 0.85) {
          addVessel(ang + (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.3), rr, Math.min(1.12, endR * (0.85 + rng() * 0.2)), radius * 0.6, mat, depth + 1);
        }
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      this.content.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, radius, 6, false), mat));
    };
    for (let i = 0; i < mainCount; i++) {
      const a = (i / mainCount) * Math.PI * 2 + rng() * 0.4;
      addVessel(a, 0.08, 1.02 + rng() * 0.1, thick, i % 2 === 0 ? arteryMat : veinMat, 0);
    }

    /* --- Cordone ombelicale (tre vasi intrecciati in una guaina) --- */
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(0.2, 0.6, 0.12),
      new THREE.Vector3(-0.12, 0.92, 0.06),
      new THREE.Vector3(0.06, 1.2, -0.02),
      new THREE.Vector3(0, 1.38, 0),
    ]);
    const sheathMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0dde2, roughness: 0.18, clearcoat: 1, transparent: true, opacity: 0.5, depthWrite: false,
    });
    this.content.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 64, 0.058, 12, false), sheathMat));
    const N = 90;
    const frames = cordCurve.computeFrenetFrames(N, false);
    const turns = 4 + rng() * 2;
    for (let sIdx = 0; sIdx < 3; sIdx++) {
      const pts = [];
      const phase = (sIdx / 3) * Math.PI * 2;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const p = cordCurve.getPointAt(t);
        const a = t * turns * Math.PI * 2 + phase;
        p.addScaledVector(frames.normals[i], Math.cos(a) * 0.031);
        p.addScaledVector(frames.binormals[i], Math.sin(a) * 0.031);
        pts.push(p);
      }
      const strand = new THREE.CatmullRomCurve3(pts);
      this.content.add(new THREE.Mesh(new THREE.TubeGeometry(strand, 120, 0.016, 6, false), sIdx === 2 ? veinMat : arteryMat));
    }

    /* --- Sacco amniotico + embrione --- */
    const sacMat = new THREE.MeshPhysicalMaterial({
      color: 0xffe4da, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.2,
      depthWrite: false, side: THREE.DoubleSide,
    });
    this.sac = new THREE.Mesh(new THREE.SphereGeometry(0.36, 48, 32), sacMat);
    this.sac.position.set(0, 1.62, 0);
    this.content.add(this.sac);

    const glowHue = THREE.MathUtils.lerp(0.98, 1.12, g.carisma / 100) % 1;
    const glow = new THREE.Color().setHSL(glowHue, 0.85, 0.6);
    const embMat = new THREE.MeshStandardMaterial({ color: 0xffb8ad, roughness: 0.5, emissive: glow, emissiveIntensity: 0.35 });
    this.embryo = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), embMat);
    head.position.set(0.05, 0.07, 0);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), embMat);
    body.scale.set(0.085, 0.14, 0.08);
    body.position.set(-0.03, -0.05, 0);
    body.rotation.z = 0.5;
    this.embryo.add(head, body);
    this.embryo.position.copy(this.sac.position);
    this.embryo.rotation.y = rng() * Math.PI * 2;
    this.content.add(this.embryo);
    this.embryoMat = embMat;

    this.embryoLight = new THREE.PointLight(glow, 1.2 + (g.carisma / 100) * 2.5, 2.2, 2);
    this.embryoLight.position.copy(this.sac.position);
    this.content.add(this.embryoLight);

    this.beatHz = birth.bpm / 60 / 2; // rallentato per leggibilità
  }

  update(dt) {
    if (this.disposed) return;
    this.time += dt;
    this.root.rotation.y += dt * 0.25;
    if (this.embryo) {
      const beat = Math.pow(0.5 + 0.5 * Math.sin(this.time * this.beatHz * Math.PI * 2), 6);
      const s = 1 + beat * 0.06;
      this.embryo.scale.setScalar(s);
      this.sac.scale.setScalar(1 + beat * 0.025);
      this.embryoMat.emissiveIntensity = 0.3 + beat * 0.6;
      this.embryoLight.intensity = (this.embryoLight.userData.base ??= this.embryoLight.intensity) * (0.7 + beat * 0.6);
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    disposeObject3D(this.scene);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    // Un canvas con contesto perso non è riutilizzabile: lo sostituiamo con uno nuovo.
    const fresh = this.canvas.cloneNode(false);
    this.canvas.replaceWith(fresh);
  }
}
