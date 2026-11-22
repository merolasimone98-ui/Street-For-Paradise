// Monumenti e skyline ispirati alla città di nascita, visibili all'orizzonte.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

export const CITY_STYLE = {
  napoli: { landmark: 'volcano', warm: true, sea: true, label: 'Vesuvio' },
  newyork: { landmark: 'spire', warm: false, taxi: 0xf2c200, label: 'Grattacielo Art Déco' },
  tokyo: { landmark: 'redtower', warm: false, neon: true, label: 'Torre rossa' },
  rio: { landmark: 'statue', warm: true, sea: true, label: 'Statua sul Corcovado' },
  berlino: { landmark: 'tvtower', warm: false, label: 'Torre della TV' },
  lagos: { landmark: 'spire', warm: true, sea: true, label: 'Skyline sulla laguna' },
  mumbai: { landmark: 'arch', warm: true, sea: true, label: 'Arco monumentale' },
  cdmx: { landmark: 'column', warm: true, label: 'Colonna dell\'Angelo' },
  mosca: { landmark: 'domes', warm: false, label: 'Cupole a cipolla' },
  sydney: { landmark: 'shells', warm: true, sea: true, label: 'Teatro a vele' },
  cairo: { landmark: 'pyramids', warm: true, label: 'Piramidi' },
  londra: { landmark: 'clocktower', warm: false, label: 'Torre dell\'orologio' },
  seoul: { landmark: 'tvtower', warm: false, neon: true, label: 'Torre sulla collina' },
  buenosaires: { landmark: 'obelisk', warm: true, label: 'Obelisco' },
  parigi: { landmark: 'lattice', warm: false, label: 'Torre di ferro' },
  istanbul: { landmark: 'mosque', warm: true, sea: true, label: 'Moschea con minareti' },
  losangeles: { landmark: 'hills', warm: true, label: 'Colline' },
  johannesburg: { landmark: 'tvtower', warm: true, label: 'Torre delle telecomunicazioni' },
};

function lattice(g, height, baseW, mat) {
  // Torre a traliccio con 4 montanti e crociere
  const levels = 14;
  for (let i = 0; i < levels; i++) {
    const y0 = (i / levels) * height, y1 = ((i + 1) / levels) * height;
    const w0 = baseW * Math.pow(1 - i / levels, 1.6) + 2, w1 = baseW * Math.pow(1 - (i + 1) / levels, 1.6) + 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = new THREE.Vector3(sx * w0 / 2, y0, sz * w0 / 2), b = new THREE.Vector3(sx * w1 / 2, y1, sz * w1 / 2);
      const dir = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, dir.length(), 6), mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      g.add(m);
    }
    if (i % 3 === 0) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(w0 + 2, 1.2, w0 + 2), mat);
      plat.position.y = y0;
      g.add(plat);
    }
  }
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, height * 0.12, 8), mat);
  tip.position.y = height * 1.06;
  g.add(tip);
}

export function buildLandmark(cityId, HALF) {
  const style = CITY_STYLE[cityId] || CITY_STYLE.newyork;
  const g = new THREE.Group();
  const stone = std(0xb9ad97);
  const concrete = std(0xa9adb2);
  const z = -HALF - 190;

  switch (style.landmark) {
    case 'volcano': {
      const m = new THREE.Mesh(new THREE.ConeGeometry(300, 170, 48, 6, true), std(0x5d5a52, { flatShading: true }));
      m.position.set(-80, 70, z - 220);
      const top = new THREE.Mesh(new THREE.ConeGeometry(120, 60, 32, 1, true), std(0x4a4842, { flatShading: true }));
      top.position.set(-80, 170, z - 220);
      g.add(m, top);
      break;
    }
    case 'spire': {
      const body = new THREE.Mesh(new THREE.BoxGeometry(40, 260, 40), std(0x8d8f93, { metalness: 0.3, roughness: 0.5 }));
      body.position.set(30, 130, z);
      const step1 = new THREE.Mesh(new THREE.BoxGeometry(28, 50, 28), std(0x9a9ca0));
      step1.position.set(30, 285, z);
      const step2 = new THREE.Mesh(new THREE.BoxGeometry(16, 30, 16), std(0xa5a7ab));
      step2.position.set(30, 325, z);
      const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3, 60, 8), std(0xc8cbd0, { metalness: 0.8, roughness: 0.3 }));
      needle.position.set(30, 370, z);
      g.add(body, step1, step2, needle);
      for (let i = 0; i < 10; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(30, 80 + Math.random() * 140, 30), std(0x7d8086));
        t.position.set(-260 + i * 60, t.geometry.parameters.height / 2, z - 60 - Math.random() * 80);
        g.add(t);
      }
      break;
    }
    case 'redtower': {
      const mat = std(0xd8452b, { roughness: 0.6 });
      const tg = new THREE.Group();
      lattice(tg, 260, 90, mat);
      for (let i = 0; i < 5; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 12), std(i % 2 ? 0xf2f2f2 : 0xd8452b));
        band.position.y = 160 + i * 18;
        tg.add(band);
      }
      tg.position.set(40, 0, z);
      g.add(tg);
      break;
    }
    case 'lattice': {
      const tg = new THREE.Group();
      lattice(tg, 300, 120, std(0x6b5a46, { roughness: 0.7 }));
      tg.position.set(0, 0, z);
      g.add(tg);
      break;
    }
    case 'statue': {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(220, 230, 40, 4), std(0x3f6b3a, { flatShading: true }));
      hill.position.set(60, 100, z - 120);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 7, 30, 12), std(0xe8e4dc));
      body.position.set(60, 230, z - 120);
      const arms = new THREE.Mesh(new THREE.BoxGeometry(56, 5, 5), std(0xe8e4dc));
      arms.position.set(60, 240, z - 120);
      const head = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 10), std(0xe8e4dc));
      head.position.set(60, 249, z - 120);
      const sugar = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), std(0x4d6b44, { flatShading: true }));
      sugar.scale.set(0.7, 1.4, 0.7);
      sugar.position.set(-220, 40, z - 40);
      g.add(hill, body, arms, head, sugar);
      break;
    }
    case 'tvtower': {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 9, 220, 16), concrete);
      shaft.position.set(-30, 110, z);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(22, 24, 18), std(0x9aa3ad, { metalness: 0.7, roughness: 0.35 }));
      ball.position.set(-30, 215, z);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(1, 2.5, 70, 8), std(0xd94a3a));
      ant.position.set(-30, 270, z);
      g.add(shaft, ball, ant);
      break;
    }
    case 'arch': {
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(18, 60, 18), stone);
        p.position.set(sx * 22, 30, z + 60);
        g.add(p);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(64, 18, 20), stone);
      top.position.set(0, 66, z + 60);
      const arch = new THREE.Mesh(new THREE.TorusGeometry(14, 4, 8, 20, Math.PI), stone);
      arch.position.set(0, 50, z + 60);
      g.add(top, arch);
      for (const sx of [-1, 1]) {
        const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone);
        dome.position.set(sx * 22, 75, z + 60);
        g.add(dome);
      }
      break;
    }
    case 'column': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 12, 16), stone);
      base.position.set(0, 6, z + 80);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.6, 70, 16), stone);
      col.position.set(0, 47, z + 80);
      const angel = new THREE.Mesh(new THREE.ConeGeometry(3, 9, 8), std(0xd6a73a, { metalness: 0.9, roughness: 0.3 }));
      angel.position.set(0, 87, z + 80);
      g.add(base, col, angel);
      break;
    }
    case 'domes': {
      const colors = [0xd23b2b, 0x2f8f5a, 0xe0b23a, 0x2f6fb0, 0xd23b2b];
      colors.forEach((c, i) => {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 40 + i * 8, 12), std(0xc9a27b));
        tower.position.set(-60 + i * 30, (40 + i * 8) / 2, z);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(11, 16, 12), std(c, { roughness: 0.4 }));
        dome.scale.y = 1.3;
        dome.position.set(-60 + i * 30, 40 + i * 8 + 10, z);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 10), std(c));
        tip.position.set(-60 + i * 30, 40 + i * 8 + 28, z);
        g.add(tower, dome, tip);
      });
      break;
    }
    case 'shells': {
      const white = std(0xf4f2ec, { roughness: 0.35 });
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(40 - i * 4, 24, 16, 0, Math.PI, 0, Math.PI / 2), white);
        s.rotation.set(-0.4, Math.PI / 2, 0);
        s.position.set(-60 + i * 30, 10, z + 40);
        g.add(s);
      }
      const base = new THREE.Mesh(new THREE.BoxGeometry(180, 10, 70), std(0xb38a6a));
      base.position.set(0, 5, z + 40);
      g.add(base);
      break;
    }
    case 'pyramids': {
      const sand = std(0xd2b47c, { flatShading: true });
      [[0, 140], [-180, 110], [170, 80]].forEach(([x, h]) => {
        const p = new THREE.Mesh(new THREE.ConeGeometry(h * 1.1, h, 4), sand);
        p.rotation.y = Math.PI / 4;
        p.position.set(x, h / 2, z - 120);
        g.add(p);
      });
      break;
    }
    case 'clocktower': {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(16, 90, 16), std(0xc3a873));
      tower.position.set(20, 45, z + 60);
      const clockBox = new THREE.Mesh(new THREE.BoxGeometry(19, 20, 19), std(0xb09560));
      clockBox.position.set(20, 100, z + 60);
      const face = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshStandardMaterial({ color: 0xf6f0d8, emissive: 0xffe9a8, emissiveIntensity: 0.4 }));
      face.position.set(20, 100, z + 69.6);
      const spire = new THREE.Mesh(new THREE.ConeGeometry(11, 34, 4), std(0x4a4a4a));
      spire.rotation.y = Math.PI / 4;
      spire.position.set(20, 127, z + 60);
      const hall = new THREE.Mesh(new THREE.BoxGeometry(180, 30, 26), std(0xc3a873));
      hall.position.set(-80, 15, z + 60);
      g.add(tower, clockBox, face, spire, hall);
      break;
    }
    case 'obelisk': {
      const ob = new THREE.Mesh(new THREE.CylinderGeometry(2, 6, 68, 4), std(0xeeeae0));
      ob.rotation.y = Math.PI / 4;
      ob.position.set(0, 34, z + 80);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.8, 6, 4), std(0xeeeae0));
      tip.rotation.y = Math.PI / 4;
      tip.position.set(0, 71, z + 80);
      g.add(ob, tip);
      break;
    }
    case 'mosque': {
      const main = new THREE.Mesh(new THREE.SphereGeometry(38, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8e9aa3));
      main.position.set(0, 40, z);
      const base = new THREE.Mesh(new THREE.BoxGeometry(110, 40, 90), std(0xd9d0bf));
      base.position.set(0, 20, z);
      g.add(main, base);
      for (const [x, zz] of [[-60, -50], [60, -50], [-60, 50], [60, 50]]) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.5, 90, 12), std(0xe8e2d4));
        m.position.set(x, 45, z + zz);
        const c = new THREE.Mesh(new THREE.ConeGeometry(4, 16, 12), std(0x7d8a94));
        c.position.set(x, 98, z + zz);
        g.add(m, c);
      }
      break;
    }
    default: {
      for (let i = 0; i < 5; i++) {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(160 + i * 20, 110 + (i % 2) * 40, 24, 3), std(0x7d7350, { flatShading: true }));
        hill.position.set(-300 + i * 150, 45, z - 160);
        g.add(hill);
      }
    }
  }
  // Mare all'orizzonte per le città costiere
  if (style.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(3000, 900), new THREE.MeshStandardMaterial({ color: 0x24506e, roughness: 0.15, metalness: 0.2 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.05, HALF + 700);
    g.add(sea);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return { group: g, style };
}
