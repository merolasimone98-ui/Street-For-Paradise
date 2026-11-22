// Paradiso: incontro con Gesù e ricordi d'infanzia con mamma e papà (struttura narrativa e scene 3D).
import * as THREE from 'three';
import { makePerson, HumanAnimator } from './characters.js';
import { disposeObject3D, $ } from './ui.js';
import { audio, bindUiSounds } from './audio.js';
import { Ease, lerp, clamp } from './tween.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });

export const MEMORIES = [
  { id: 'nascita', title: 'La nascita', icon: '👶', text: 'Il giorno in cui sei venuto al mondo. Papà non riusciva a smettere di piangere di gioia.' },
  { id: 'sguardo', title: 'Il primo sguardo con la mamma', icon: '🤱', text: 'I suoi occhi nei tuoi, per la prima volta. In quel momento lei ha capito che la sua vita era cambiata per sempre.' },
  { id: 'bagnetto', title: 'Il primo bagnetto', icon: '🛁', text: 'Acqua tiepida, bolle di sapone e le risate di mamma e papà.' },
  { id: 'passi', title: 'I primi passi', icon: '🚶', text: 'Dalle braccia di papà a quelle della mamma: tre passi incerti, poi un abbraccio enorme.' },
  { id: 'bici', title: 'Il primo giro in bici col papà', icon: '🚲', text: 'Lui teneva il sellino e correva accanto a te. Poi, senza che tu lo sapessi, ha lasciato la presa.' },
  { id: 'scuola', title: 'Il primo giorno di scuola', icon: '🎒', text: 'Lo zaino più grande di te e la mano della mamma che non voleva lasciarti andare.' },
  { id: 'comunione', title: 'La prima comunione', icon: '🕊️', text: 'Vestito di bianco, emozionato. Mamma e papà in prima fila, con gli occhi lucidi.' },
  { id: 'parco', title: 'Al parco giochi', icon: '🎠', text: 'L\'altalena sempre più in alto e poi l\'autoscontro: papà fingeva di perdere ogni volta.' },
];

const JESUS_LINES = [
  'Benvenuto, figlio mio. Hai scelto il bene anche quando era difficile.',
  'Qui il tempo non esiste. I tuoi genitori sono sempre stati accanto a te.',
  'Scegli un ricordo: te lo mostrerò come lo hanno vissuto loro.',
];

/* ---------- Helper scenici ---------- */
function cloudPuff(parent, x, y, z, s, mat) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
    m.scale.setScalar(s * (0.6 + Math.random() * 0.6));
    m.position.set((Math.random() - 0.5) * s * 2.2, (Math.random() - 0.3) * s * 0.6, (Math.random() - 0.5) * s * 1.2);
    g.add(m);
  }
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

function skyDome(top, bottom) {
  const geo = new THREE.SphereGeometry(300, 32, 16);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) / 300 + 0.1) / 0.8, 0, 1);
    c.copy(cb).lerp(ct, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false }));
}

function makeBaby(skin) {
  const g = new THREE.Group();
  const blanket = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.2, 6, 12), std(0xf8f2e8, { roughness: 1 }));
  blanket.rotation.x = Math.PI / 2;
  g.add(blanket);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), std(skin, { roughness: 0.6 }));
  head.position.set(0, 0.02, -0.19);
  g.add(head);
  g.userData.blanket = blanket;
  return g;
}

function addBox(parent, w, h, d, color, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'number' ? std(color, o) : color);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Posa "in ginocchio" con braccia aperte (accoglienza). */
function kneel(p, armsOpen = 0.6) {
  const u = p.userData;
  u.legL.rotation.x = -0.2; u.legR.rotation.x = -1.5;
  u.shinL.rotation.x = 1.75; u.shinR.rotation.x = 1.5;
  u.hips.position.y = 0.95 - 0.42;
  u.armL.rotation.x = -1.2; u.armR.rotation.x = -1.2;
  u.armL.rotation.z = -armsOpen; u.armR.rotation.z = armsOpen;
  u.foreArmL.rotation.x = -0.3; u.foreArmR.rotation.x = -0.3;
}

/** Braccia che cullano un neonato davanti al petto. */
function cradle(p) {
  const u = p.userData;
  u.armL.rotation.x = -0.9; u.armR.rotation.x = -0.9;
  u.armL.rotation.z = 0.25; u.armR.rotation.z = -0.25;
  u.foreArmL.rotation.x = -1.3; u.foreArmR.rotation.x = -1.3;
  u.head.rotation.x = 0.45;
}

function sit(p) {
  const u = p.userData;
  u.legL.rotation.x = u.legR.rotation.x = -1.5;
  u.shinL.rotation.x = u.shinR.rotation.x = 1.45;
}

/* =====================================================================
   Paradiso
   ===================================================================== */
export class Paradise {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, character: object, onExit: () => void }} o
   */
  constructor({ renderer, character, onExit }) {
    this.renderer = renderer;
    this.character = character;
    this.onExit = onExit;
    this.time = 0;
    this.mode = 'hub';
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 800);
    this.hub = new THREE.Scene();
    this.memScene = null;
    this.buildHub();
    this.ui = $('paradise-ui');
    this.ui.classList.remove('hidden');
    bindUiSounds(this.ui);
    this._onClick = (e) => {
      const t = e.target.closest('[data-pd]');
      if (!t) return;
      if (t.dataset.pd === 'mem') this.playMemory(Number(t.dataset.i));
      else if (t.dataset.pd === 'back') this.backToHub();
      else if (t.dataset.pd === 'exit') this.onExit();
    };
    this.ui.addEventListener('click', this._onClick);
    this.lineIdx = 0;
    this.lineTimer = 0;
    this.renderHubUi();
    audio.playMusic('paradise');
    audio.setWind(0.8);
  }

  get scene() {
    return this.mode === 'memory' && this.memScene ? this.memScene : this.hub;
  }

  /* ---------- Hub: nuvole, cancello, Gesù, ricordi luminosi ---------- */
  buildHub() {
    const s = this.hub;
    s.add(skyDome(0xffe9b8, 0xfff8ee));
    s.fog = new THREE.Fog(0xfff6e6, 30, 160);
    s.add(new THREE.HemisphereLight(0xfffaf0, 0xf0d8b0, 1.4));
    const sun = new THREE.DirectionalLight(0xfff0c8, 2.2);
    sun.position.set(-10, 30, 10);
    s.add(sun);
    const cloudMat = std(0xffffff, { roughness: 1, emissive: 0xfff3dd, emissiveIntensity: 0.25 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(120, 64), std(0xfdfbf6, { roughness: 1, emissive: 0xfff6e8, emissiveIntensity: 0.3 }));
    floor.rotation.x = -Math.PI / 2;
    s.add(floor);
    // Nuvole basse attorno, lasciando libero il corridoio tra la camera, Gesù e il cancello
    let placed = 0;
    while (placed < 60) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 90;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 10;
      if (Math.abs(x) < 14 && z > -30) continue;
      cloudPuff(s, x, -0.6 + Math.random() * 1.0, z, 1.2 + Math.random() * 2.8, cloudMat);
      placed++;
    }
    // Soffici nuvole basse ai piedi, sotto la linea degli occhi
    for (let i = 0; i < 14; i++) {
      const side = i % 2 ? 1 : -1;
      cloudPuff(s, side * (6 + Math.random() * 6), -0.9, -2 - Math.random() * 16, 0.9 + Math.random() * 0.8, cloudMat);
    }
    this.highClouds = [];
    for (let i = 0; i < 18; i++) this.highClouds.push(cloudPuff(s, (Math.random() - 0.5) * 200, 25 + Math.random() * 30, -40 - Math.random() * 120, 6 + Math.random() * 8, cloudMat));
    // Raggi di luce
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    for (let i = 0; i < 7; i++) {
      const ray = new THREE.Mesh(new THREE.ConeGeometry(4 + Math.random() * 3, 80, 24, 1, true), rayMat);
      ray.position.set(-20 + i * 7, 40, -30 - Math.random() * 10);
      ray.rotation.z = 0.25;
      s.add(ray);
    }
    // Cancello perlaceo
    const pearl = std(0xf6f1e6, { roughness: 0.25, metalness: 0.2, emissive: 0xfff4dc, emissiveIntensity: 0.25 });
    const gold = std(0xe2b34a, { metalness: 0.9, roughness: 0.25, emissive: 0x8a6420, emissiveIntensity: 0.3 });
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 10, 24), pearl);
      col.position.set(sx * 5, 5, -14);
      s.add(col);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14), gold);
      cap.position.set(sx * 5, 10.4, -14);
      s.add(cap);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(5, 0.45, 12, 48, Math.PI), gold);
    arch.position.set(0, 10, -14);
    s.add(arch);
    for (let i = -4; i <= 4; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 9, 8), gold);
      bar.position.set(i * 1.05, 4.5, -14.3);
      s.add(bar);
    }
    const glow = new THREE.PointLight(0xfff0c0, 40, 40, 2);
    glow.position.set(0, 6, -12);
    s.add(glow);

    // Gesù: tunica bianca, mantello, capelli lunghi, barba, aureola luminosa
    const j = makePerson({ height: 1.8, skin: 0xc99a74, hair: 0x4a2f1d, hairStyle: 'long', beard: true, shirt: 0xfbf8f2, sleeves: 'long', pants: 0xfbf8f2, shoes: 0x8a6a4a, sex: 'm' });
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.42, 1.0, 24, 1, true), std(0xfbf8f2, { side: THREE.DoubleSide, roughness: 0.9 }));
    robe.position.y = 0.5;
    j.add(robe);
    const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.46, 1.25, 24, 1, true, Math.PI * 0.15, Math.PI * 1.7), std(0xb0262e, { side: THREE.DoubleSide, roughness: 0.85 }));
    mantle.position.set(0, 0.85, -0.02);
    // L'apertura del mantello (theta = 0) resta sul davanti: la tunica bianca è visibile
    j.add(mantle);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 40), new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false }));
    halo.position.set(0, 0.22, -0.12);
    j.userData.head.add(halo);
    j.position.set(0, 0, -8);
    j.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    s.add(j);
    this.jesus = j;
    const jl = new THREE.PointLight(0xfff2cc, 6, 8, 2);
    jl.position.set(0, 2.2, -7);
    s.add(jl);

    // Sfere dei ricordi disposte a semicerchio
    this.orbs = MEMORIES.map((m, i) => {
      const a = -Math.PI * 0.42 + (i / (MEMORIES.length - 1)) * Math.PI * 0.84;
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.1 + i * 0.07, 0.8, 0.75), transparent: true, opacity: 0.9, toneMapped: false }));
      orb.position.set(Math.sin(a) * 5.5, 1.6, -8 + Math.cos(a) * 5.5 - 5.5);
      s.add(orb);
      return orb;
    });
    this.camera.position.set(0, 1.7, -2.6);
    this.camera.lookAt(0, 1.4, -8);
  }

  renderHubUi() {
    this.ui.innerHTML = `
      <div class="pd-top"><div class="pd-kicker">PARADISO</div><div class="pd-title">Il Regno dei Cieli</div></div>
      <div class="pd-dialog"><div class="pd-name">Gesù</div><div class="pd-text" id="pd-text">${JESUS_LINES[0]}</div></div>
      <div class="pd-memories">${MEMORIES.map((m, i) => `<button data-pd="mem" data-i="${i}"><span>${m.icon}</span>${m.title}</button>`).join('')}</div>
      <div class="pd-actions"><button class="btn-ghost" data-pd="exit">Torna sulla Terra</button></div>`;
    this.lineIdx = 0;
    this.lineTimer = 5;
  }

  /* ---------- Ricordi ---------- */
  playMemory(i) {
    const mem = MEMORIES[i];
    if (!mem) return;
    if (this.memScene) { disposeObject3D(this.memScene); this.memScene = null; }
    this.memScene = new THREE.Scene();
    this.memT = 0;
    this.memView = this.buildMemory(mem.id, this.memScene);
    this.mode = 'memory';
    this.ui.innerHTML = `
      <div class="pd-top"><div class="pd-kicker">RICORDO</div><div class="pd-title">${mem.title}</div></div>
      <div class="pd-caption" id="pd-caption">${mem.text}</div>
      <div class="pd-actions"><button class="btn-ghost" data-pd="back">Torna da Gesù</button></div>
      <div class="pd-vignette"></div>`;
    audio.confirm();
  }

  backToHub() {
    if (this.memScene) { disposeObject3D(this.memScene); this.memScene = null; }
    this.mode = 'hub';
    this.renderHubUi();
    this.camera.position.set(0, 1.7, -2.6);
    this.camera.lookAt(0, 1.4, -8);
  }

  /** Costruisce la scena del ricordo. Ritorna { cam: [from, to, lookFrom, lookTo], dur, animate(t) }. */
  buildMemory(id, s) {
    const c = this.character;
    const par = c.parents || {};
    const mom = { skin: par.mother ? par.mother.skin : c.skin, hair: par.mother ? par.mother.hair : c.hair, hairStyle: par.mother ? par.mother.hairStyle : 'long', height: par.mother ? par.mother.height : 1.65 };
    const dad = { skin: par.father ? par.father.skin : c.skin, hair: par.father ? par.father.hair : c.hair, hairStyle: par.father ? par.father.hairStyle : 'short', height: par.father ? par.father.height : 1.78 };
    const kidSkin = c.skin;
    const mother = (shirt = 0xc0607a) => makePerson({ ...mom, sex: 'f', shirt, pants: 0x2c2c38, sleeves: 'long' });
    const father = (shirt = 0x3f6b8c) => makePerson({ ...dad, sex: 'm', shirt, pants: 0x34343c });
    const kid = (h, shirt = 0xf2c14e) => makePerson({ height: h, skin: kidSkin, hair: c.hair, hairStyle: c.sex === 'f' ? 'long' : 'short', sex: c.sex, shirt, pants: 0x3f6fb5, child: true });
    const warmLights = (amb = 1.0) => {
      s.add(new THREE.HemisphereLight(0xfff2dc, 0x6a5a4a, amb));
      const d = new THREE.DirectionalLight(0xffe2b0, 1.6);
      d.position.set(4, 8, 5);
      s.add(d);
    };
    // Atmosfera di sogno: nebbia calda ai bordi
    s.fog = new THREE.Fog(0xfff3e0, 8, 26);
    s.background = new THREE.Color(0xfff3e0);
    const room = (w, d, h, wall, floor) => {
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, d), std(floor));
      fl.rotation.x = -Math.PI / 2;
      s.add(fl);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), std(wall));
      back.position.set(0, h / 2, -d / 2);
      s.add(back);
      for (const sx of [-1, 1]) {
        const side = new THREE.Mesh(new THREE.PlaneGeometry(d, h), std(wall));
        side.rotation.y = -sx * Math.PI / 2;
        side.position.set(sx * w / 2, h / 2, 0);
        s.add(side);
      }
    };
    const anims = [];
    let cam = [[2, 1.6, 3.5], [0.8, 1.3, 1.6], [0, 1, 0], [0, 0.9, -0.3]];
    let dur = 14;

    switch (id) {
      case 'nascita': {
        room(6, 6, 3, 0xe7f0f4, 0xc9cfd3);
        warmLights(1.1);
        addBox(s, 1, 0.5, 2, 0xe8e8e8, -1.2, 0.3, -1.6);
        addBox(s, 0.95, 0.15, 1.9, 0xffffff, -1.2, 0.62, -1.6);
        const m = mother(0xbfd8e6);
        m.rotation.set(-Math.PI / 2 + 0.5, 0, 0, 'YXZ');
        m.position.set(-1.2, 0.75, -0.75);
        s.add(m);
        const baby = makeBaby(kidSkin);
        baby.position.set(-1.05, 1.02, -1.45);
        baby.rotation.y = 0.4;
        s.add(baby);
        const f = father();
        f.position.set(0.2, 0, -1.2);
        f.rotation.y = -1.2;
        s.add(f);
        f.userData.armR.rotation.x = -0.5;
        f.userData.foreArmR.rotation.x = -1.2;
        anims.push((t) => { baby.userData.blanket.scale.setScalar(1 + Math.sin(t * 3) * 0.03); f.userData.head.rotation.x = 0.3 + Math.sin(t) * 0.05; });
        cam = [[1.8, 1.7, 1.8], [0.4, 1.3, 0.2], [-1, 0.9, -1.4], [-1.1, 1.0, -1.45]];
        break;
      }
      case 'sguardo': {
        room(5, 5, 3, 0xf4e6d6, 0xc8a882);
        warmLights(1.0);
        addBox(s, 1.2, 0.45, 2, 0xd8c8b0, 0, 0.225, -1.3);
        const m = mother(0xf0d6e0);
        sit(m);
        m.position.set(0, 0.5 - m.userData.hipHeight, -0.6);
        cradle(m);
        s.add(m);
        const baby = makeBaby(kidSkin);
        baby.position.set(0.02, 1.08, -0.3);
        baby.rotation.set(0.2, Math.PI / 2 + 0.2, 0);
        s.add(baby);
        anims.push((t) => {
          m.userData.head.rotation.z = Math.sin(t * 0.8) * 0.08;
          baby.rotation.z = Math.sin(t * 1.3) * 0.05;
        });
        cam = [[1.2, 1.5, 1.4], [0.35, 1.25, 0.45], [0, 1.1, -0.4], [0, 1.12, -0.32]];
        break;
      }
      case 'bagnetto': {
        room(4, 4, 2.8, 0xbfe3ef, 0xe8eef0);
        warmLights(1.1);
        const tub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.38, 0.35, 32, 1, true), std(0xfdfdfd, { side: THREE.DoubleSide, roughness: 0.2 }));
        tub.position.set(0, 0.62, -0.5);
        s.add(tub);
        addBox(s, 1.2, 0.45, 0.8, 0xdcdcdc, 0, 0.225, -0.5);
        const water = new THREE.Mesh(new THREE.CircleGeometry(0.43, 32), new THREE.MeshStandardMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.7, roughness: 0.05 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(0, 0.74, -0.5);
        s.add(water);
        const bab = kid(0.62, 0xf3d3b8);
        bab.userData.legL.rotation.x = bab.userData.legR.rotation.x = -1.5;
        bab.position.set(0, 0.62 - bab.userData.hipHeight * 0.3, -0.5);
        s.add(bab);
        const m = mother();
        kneel(m, 0.1);
        m.position.set(-0.75, 0, -0.1);
        m.rotation.y = 1.0;
        s.add(m);
        const f = father();
        kneel(f, 0.1);
        f.position.set(0.8, 0, 0.0);
        f.rotation.y = -1.1;
        s.add(f);
        const bubbles = [];
        const bm = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, roughness: 0, metalness: 0.2 });
        for (let i = 0; i < 26; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.02 + Math.random() * 0.03, 10, 8), bm);
          b.userData.phase = Math.random() * 3;
          b.userData.x = (Math.random() - 0.5) * 0.7;
          b.userData.z = -0.5 + (Math.random() - 0.5) * 0.7;
          s.add(b);
          bubbles.push(b);
        }
        anims.push((t) => {
          for (const b of bubbles) {
            const k = (t * 0.25 + b.userData.phase) % 1;
            b.position.set(b.userData.x + Math.sin(t + b.userData.phase) * 0.05, 0.76 + k * 1.2, b.userData.z);
            b.scale.setScalar(1 - k * 0.5);
          }
          bab.userData.armL.rotation.x = -1 + Math.sin(t * 4) * 0.6;
          bab.userData.armR.rotation.x = -1 + Math.cos(t * 4) * 0.6;
        });
        cam = [[1.6, 1.6, 1.6], [0.6, 1.2, 0.7], [0, 0.8, -0.5], [0, 0.75, -0.5]];
        break;
      }
      case 'passi': {
        room(7, 6, 3, 0xeadfc8, 0xa98256);
        warmLights(1.05);
        const rug = new THREE.Mesh(new THREE.PlaneGeometry(3, 2), std(0x8c3b3b));
        rug.rotation.x = -Math.PI / 2;
        rug.position.y = 0.01;
        s.add(rug);
        const f = father();
        kneel(f, 0.6);
        f.position.set(-1.6, 0, 0);
        f.rotation.y = Math.PI / 2;
        s.add(f);
        const m = mother();
        kneel(m, 0.6);
        m.position.set(1.6, 0, 0);
        m.rotation.y = -Math.PI / 2;
        s.add(m);
        const k = kid(0.82);
        const ka = new HumanAnimator(k);
        k.rotation.y = Math.PI / 2;
        s.add(k);
        anims.push((t, dt) => {
          const p = clamp(t / 9, 0, 1);
          k.position.set(lerp(-1.1, 1.05, Ease.inOutSine(p)), 0, 0);
          ka.update(dt, { speed: p < 1 ? 0.5 : 0 });
          if (p < 1) k.rotation.z = Math.sin(t * 6) * 0.06;
          else k.rotation.z = 0;
        });
        cam = [[0, 1.4, 3.6], [0.4, 1.0, 2.2], [0, 0.6, 0], [0.6, 0.6, 0]];
        break;
      }
      case 'bici': {
        s.background = new THREE.Color(0xcfe8ff);
        s.fog = new THREE.Fog(0xcfe8ff, 15, 50);
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), std(0x6aa84f));
        grass.rotation.x = -Math.PI / 2;
        s.add(grass);
        const path = new THREE.Mesh(new THREE.PlaneGeometry(3, 80), std(0xd9c7a0));
        path.rotation.x = -Math.PI / 2;
        path.position.y = 0.01;
        s.add(path);
        warmLights(1.2);
        for (let i = 0; i < 16; i++) {
          const side = i % 2 ? 1 : -1;
          const tr = new THREE.Group();
          addBox(tr, 0.3, 2.4, 0.3, 0x6b4a32, 0, 1.2, 0);
          const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), std(0x3f7a3a, { flatShading: true }));
          crown.position.y = 3.2;
          tr.add(crown);
          tr.position.set(side * (3 + Math.random() * 2), 0, -30 + i * 4);
          s.add(tr);
        }
        const bike = new THREE.Group();
        const wheelMat = std(0x111111);
        for (const z of [-0.35, 0.35]) {
          const w = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), wheelMat);
          w.rotation.y = Math.PI / 2;
          w.position.set(0, 0.22, z);
          bike.add(w);
        }
        addBox(bike, 0.04, 0.04, 0.7, 0xd94a4a, 0, 0.42, 0);
        addBox(bike, 0.04, 0.4, 0.04, 0xd94a4a, 0, 0.42, -0.15);
        addBox(bike, 0.3, 0.03, 0.03, 0x222222, 0, 0.62, 0.32);
        s.add(bike);
        const k = kid(1.05, 0x4fa3d9);
        sit(k);
        k.userData.armL.rotation.x = k.userData.armR.rotation.x = -1.2;
        bike.add(k);
        k.position.set(0, 0.62 - k.userData.hipHeight, -0.15);
        const f = father();
        const fa = new HumanAnimator(f);
        s.add(f);
        anims.push((t, dt) => {
          const z = 8 - t * 1.8;
          bike.position.set(0, 0, z);
          bike.rotation.y = Math.PI + Math.sin(t * 2) * 0.05;
          const let_go = t > 6;
          f.position.set(0.55, 0, z + (let_go ? (t - 6) * 0.9 : 0.15));
          f.rotation.y = Math.PI;
          fa.update(dt, { speed: let_go ? Math.max(0, 1.8 - (t - 6)) : 1.8 });
          if (!let_go) { f.userData.armL.rotation.x = -0.8; f.userData.foreArmL.rotation.x = -0.4; }
          else { f.userData.armR.rotation.x = -2.6; }
          k.userData.legL.rotation.x = -1.5 + Math.sin(t * 6) * 0.35;
          k.userData.legR.rotation.x = -1.5 - Math.sin(t * 6) * 0.35;
        });
        cam = [[2.6, 1.8, 10], [2.2, 1.6, -10], [0, 1, 6], [0, 0.8, -14]];
        dur = 13;
        break;
      }
      case 'scuola': {
        s.background = new THREE.Color(0xdbeeff);
        s.fog = new THREE.Fog(0xdbeeff, 15, 45);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), std(0xb5b0a6));
        ground.rotation.x = -Math.PI / 2;
        s.add(ground);
        warmLights(1.1);
        addBox(s, 18, 7, 6, 0xe3c9a0, 0, 3.5, -8);
        for (let i = 0; i < 6; i++) addBox(s, 1.4, 1.2, 0.05, new THREE.MeshBasicMaterial({ color: 0x9ecbea }), -6 + i * 2.4, 4.5, -4.97);
        addBox(s, 2.4, 2.6, 0.1, 0x7a4a2a, 0, 1.3, -4.95);
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.7), std(0x2e5c8a));
        sign.position.set(0, 6.2, -4.94);
        s.add(sign);
        const m = mother(0xd98aa0);
        m.position.set(-0.8, 0, -1);
        m.rotation.y = 0.5;
        s.add(m);
        const k = kid(1.15, 0xffffff);
        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.18), std(0xd94a4a));
        pack.position.set(0, 1.15, -0.2);
        k.add(pack);
        k.position.set(0.4, 0, -2.2);
        k.rotation.y = Math.PI * 0.85;
        s.add(k);
        for (let i = 0; i < 4; i++) {
          const o = kid(1.1 + Math.random() * 0.1, [0x44bba4, 0xf6c445, 0x3f88c5, 0xe94f37][i]);
          o.position.set(-3 + i * 2, 0, -4 + Math.random());
          o.rotation.y = Math.PI;
          s.add(o);
        }
        anims.push((t) => {
          m.userData.armR.rotation.x = -2.6;
          m.userData.armR.rotation.z = 0.3 + Math.sin(t * 5) * 0.25;
          k.userData.armL.rotation.x = -2.4;
          k.userData.armL.rotation.z = -0.3 - Math.sin(t * 5 + 1) * 0.25;
          k.position.z = -2.2 - Math.min(t, 8) * 0.12;
        });
        cam = [[2.5, 1.6, 3], [1.2, 1.3, 1.2], [0, 1, -2], [0, 1.2, -3]];
        break;
      }
      case 'comunione': {
        room(12, 16, 7, 0xe9dfcc, 0xd9d2c4);
        s.add(new THREE.HemisphereLight(0xfff0d8, 0x5a4a3a, 0.8));
        const pl = new THREE.PointLight(0xffd9a0, 30, 20, 2);
        pl.position.set(0, 5, -5);
        s.add(pl);
        addBox(s, 3, 1, 1.2, 0xf4efe4, 0, 0.5, -6.5);
        const gold = std(0xd6a73a, { metalness: 0.9, roughness: 0.25 });
        addBox(s, 0.2, 2.8, 0.15, gold, 0, 4, -7.9);
        addBox(s, 1.4, 0.2, 0.15, gold, 0, 4.7, -7.9);
        for (let i = 0; i < 4; i++) {
          const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3), new THREE.MeshBasicMaterial({ color: [0x3a5bd9, 0xd93a5b, 0xd9b23a, 0x3ad98f][i] }));
          w.position.set(i < 2 ? -5.98 : 5.98, 4, -4 + (i % 2) * 4);
          w.rotation.y = i < 2 ? Math.PI / 2 : -Math.PI / 2;
          s.add(w);
        }
        const k = makePerson({ height: 1.3, skin: kidSkin, hair: c.hair, hairStyle: c.sex === 'f' ? 'long' : 'short', sex: c.sex, shirt: 0xffffff, pants: 0xffffff, shoes: 0xffffff, sleeves: 'long', child: true });
        k.position.set(0, 0, -4.8);
        k.rotation.y = Math.PI;
        k.userData.armL.rotation.x = k.userData.armR.rotation.x = -0.9;
        k.userData.foreArmL.rotation.x = k.userData.foreArmR.rotation.x = -1.4;
        k.userData.armL.rotation.z = 0.35; k.userData.armR.rotation.z = -0.35;
        s.add(k);
        const flames = [];
        for (let i = 0; i < 6; i++) {
          addBox(s, 0.06, 0.5, 0.06, 0xf8f4e8, -1.2 + i * 0.48, 1.25, -6.6);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.08, 8), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
          fl.position.set(-1.2 + i * 0.48, 1.55, -6.6);
          s.add(fl);
          flames.push(fl);
        }
        for (const [sx, who] of [[-0.6, mother(0x2c3e50)], [0.6, father(0x2c2c30)]]) {
          sit(who);
          who.position.set(sx, 0.5 - who.userData.hipHeight, -1.8);
          who.rotation.y = Math.PI;
          s.add(who);
        }
        addBox(s, 3, 0.08, 0.5, 0x5a3a24, 0, 0.46, -1.8);
        anims.push((t) => { flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 14 + i) * 0.25; }); });
        cam = [[0, 1.6, 2.5], [0.4, 1.5, -2.4], [0, 1.1, -5], [0, 1.0, -5]];
        break;
      }
      default: { // parco giochi: altalena + autoscontro
        s.background = new THREE.Color(0xcfe8ff);
        s.fog = new THREE.Fog(0xcfe8ff, 18, 55);
        const grass = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), std(0x75b356));
        grass.rotation.x = -Math.PI / 2;
        s.add(grass);
        warmLights(1.2);
        // Altalena
        const frame = std(0xd94a4a, { metalness: 0.4 });
        for (const sx of [-1.2, 1.2]) {
          for (const sz of [-0.6, 0.6]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), frame);
            leg.position.set(sx, 1.35, sz * 0.6);
            leg.rotation.x = sz * 0.35;
            s.add(leg);
          }
        }
        addBox(s, 2.6, 0.08, 0.08, frame, 0, 2.65, 0);
        const swing = new THREE.Group();
        swing.position.set(0, 2.62, 0);
        s.add(swing);
        for (const sx of [-0.25, 0.25]) addBox(swing, 0.02, 2.1, 0.02, 0x888888, sx, -1.05, 0);
        addBox(swing, 0.6, 0.05, 0.3, 0x5a3a24, 0, -2.1, 0);
        const k = kid(1.15, 0xf6c445);
        sit(k);
        k.userData.armL.rotation.x = k.userData.armR.rotation.x = -2.6;
        k.position.set(0, -2.1 - k.userData.hipHeight + 0.05, 0);
        swing.add(k);
        const f = father();
        f.position.set(0, 0, 1.4);
        f.rotation.y = Math.PI;
        s.add(f);
        // Autoscontro
        const arena = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.2, 48), std(0x3a3d4a, { metalness: 0.3, roughness: 0.4 }));
        arena.position.set(-10, 0.1, -6);
        s.add(arena);
        const lightsMat = new THREE.MeshBasicMaterial({ color: 0xffe08a });
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), lightsMat);
          bulb.position.set(-10 + Math.cos(a) * 6, 2.5, -6 + Math.sin(a) * 6);
          s.add(bulb);
        }
        const cars = [];
        [0xe94f37, 0x3f88c5, 0x44bba4, 0xf6c445].forEach((col, i) => {
          const car = new THREE.Group();
          addBox(car, 1.2, 0.5, 1.6, col, 0, 0.45, 0, { metalness: 0.3, roughness: 0.3 });
          const bumper = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 8, 24), std(0x111111));
          bumper.rotation.x = Math.PI / 2;
          bumper.scale.set(0.8, 1, 1);
          bumper.position.y = 0.3;
          car.add(bumper);
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2, 6), std(0x888888));
          pole.position.set(0, 1.5, -0.6);
          car.add(pole);
          if (i === 0) {
            const mm = mother(0xc0607a);
            sit(mm);
            mm.scale.multiplyScalar(0.9);
            mm.position.set(0.25, 0.6 - mm.userData.hipHeight * 0.9, 0.1);
            car.add(mm);
            const kk = kid(1.0, 0xf6c445);
            sit(kk);
            kk.position.set(-0.3, 0.6 - kk.userData.hipHeight, 0.1);
            car.add(kk);
          } else if (i === 1) {
            const ff = father();
            sit(ff);
            ff.scale.multiplyScalar(0.9);
            ff.position.set(0, 0.6 - ff.userData.hipHeight * 0.9, 0.1);
            car.add(ff);
          }
          car.userData.phase = (i / 4) * Math.PI * 2;
          car.userData.r = 2.5 + (i % 2) * 1.6;
          s.add(car);
          cars.push(car);
        });
        anims.push((t, dt) => {
          const a = Math.sin(t * 1.6) * 0.75;
          swing.rotation.x = a;
          f.userData.armL.rotation.x = f.userData.armR.rotation.x = -1.2 - Math.max(0, -a) * 0.6;
          for (const car of cars) {
            const ph = car.userData.phase + t * (0.6 + car.userData.r * 0.05);
            car.position.set(-10 + Math.cos(ph) * car.userData.r, 0.2, -6 + Math.sin(ph) * car.userData.r);
            car.rotation.y = -ph + Math.sin(t * 3 + car.userData.phase) * 0.4;
          }
          lightsMat.color.setHSL((t * 0.2) % 1, 0.7, 0.7);
        });
        cam = [[4, 2.2, 4], [-2, 3, 6], [0, 1.2, 0], [-8, 0.8, -6]];
        dur = 16;
        break;
      }
    }
    s.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; } });
    return { cam, dur, animate: (t, dt) => anims.forEach((a) => a(t, dt)) };
  }

  update(dt) {
    this.time += dt;
    if (this.mode === 'hub') {
      for (const [i, orb] of this.orbs.entries()) {
        orb.position.y = 1.6 + Math.sin(this.time * 1.2 + i) * 0.15;
        orb.material.opacity = 0.75 + Math.sin(this.time * 2 + i) * 0.2;
      }
      for (const c of this.highClouds) c.position.x += dt * 0.6;
      const u = this.jesus.userData;
      const open = 0.35 + Math.sin(this.time * 0.6) * 0.08;
      u.armL.rotation.z = -open; u.armR.rotation.z = open;
      u.armL.rotation.x = u.armR.rotation.x = -0.35;
      u.head.rotation.y = Math.sin(this.time * 0.3) * 0.15;
      // Leggera oscillazione della camera
      this.camera.position.set(Math.sin(this.time * 0.15) * 0.4, 1.7 + Math.sin(this.time * 0.3) * 0.05, -2.6);
      this.camera.lookAt(0, 1.4, -8);
      // Dialogo di Gesù
      this.lineTimer -= dt;
      if (this.lineTimer <= 0 && this.lineIdx < JESUS_LINES.length - 1) {
        this.lineIdx++;
        this.lineTimer = 5;
        const el = $('pd-text');
        if (el) el.textContent = JESUS_LINES[this.lineIdx];
        audio.voice(false, 9);
      }
    } else if (this.memView) {
      this.memT += dt;
      const v = this.memView;
      const k = Ease.inOutSine(clamp(this.memT / v.dur, 0, 1));
      const [a, b, la, lb] = v.cam;
      this.camera.position.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
      this.camera.lookAt(lerp(la[0], lb[0], k), lerp(la[1], lb[1], k), lerp(la[2], lb[2], k));
      v.animate(this.memT, dt);
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.ui.removeEventListener('click', this._onClick);
    this.ui.classList.add('hidden');
    this.ui.innerHTML = '';
    disposeObject3D(this.hub);
    if (this.memScene) disposeObject3D(this.memScene);
    audio.playMusic(null);
    audio.setWind(0);
  }
}
