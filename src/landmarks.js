// Monumenti ispirati alla città di nascita.
// - Il monumento tipico sta al centro della "Piazza del Monumento", a nord della città, raggiungibile
//   da una strada dedicata: è solido (collisioni Cannon-es generate dalle sue parti principali)
//   e non invade più case e strade dei quartieri.
// - Gli elementi naturali (vulcano, colline, mare, skyline) restano come sfondo oltre il confine giocabile.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });

export const CITY_STYLE = {
  napoli: { landmark: 'castle', scenery: 'volcano', warm: true, sea: true, label: 'Castello sul porto' },
  newyork: { landmark: 'spire', scenery: 'skyline', warm: false, taxi: 0xf2c200, label: 'Grattacielo Art Déco' },
  tokyo: { landmark: 'redtower', warm: false, neon: true, label: 'Torre rossa' },
  rio: { landmark: 'statue', scenery: 'sugarloaf', warm: true, sea: true, label: 'Statua del Redentore' },
  berlino: { landmark: 'tvtower', warm: false, label: 'Torre della TV' },
  lagos: { landmark: 'spire', scenery: 'skyline', warm: true, sea: true, label: 'Torre sulla laguna' },
  mumbai: { landmark: 'arch', warm: true, sea: true, label: 'Arco monumentale' },
  cdmx: { landmark: 'column', warm: true, label: 'Colonna dell\'Angelo' },
  mosca: { landmark: 'domes', warm: false, label: 'Cupole a cipolla' },
  sydney: { landmark: 'shells', warm: true, sea: true, label: 'Teatro a vele' },
  cairo: { landmark: 'pyramids', warm: true, label: 'Piramidi' },
  londra: { landmark: 'clocktower', warm: false, label: 'Torre dell\'orologio' },
  seoul: { landmark: 'tvtower', scenery: 'hills', warm: false, neon: true, label: 'Torre sulla collina' },
  buenosaires: { landmark: 'obelisk', warm: true, label: 'Obelisco' },
  parigi: { landmark: 'lattice', warm: false, label: 'Torre di ferro' },
  istanbul: { landmark: 'mosque', warm: true, sea: true, label: 'Moschea con minareti' },
  losangeles: { landmark: 'observatory', scenery: 'hills', warm: true, label: 'Osservatorio sulle colline' },
  johannesburg: { landmark: 'tvtower', warm: true, label: 'Torre delle telecomunicazioni' },
};

/** Mesh con collisione (le sue dimensioni diventano un box statico). */
function solid(m) {
  m.userData.solid = true;
  return m;
}

function cyl(rt, rb, h, seg, mat) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
}

/** Torre a traliccio con 4 montanti e piattaforme; solo i piedi dei montanti sono solidi. */
function lattice(g, height, baseW, mat, legR = 1.1) {
  const levels = 14;
  for (let i = 0; i < levels; i++) {
    const y0 = (i / levels) * height, y1 = ((i + 1) / levels) * height;
    const w0 = baseW * Math.pow(1 - i / levels, 1.6) + 2, w1 = baseW * Math.pow(1 - (i + 1) / levels, 1.6) + 2;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const a = new THREE.Vector3(sx * w0 / 2, y0, sz * w0 / 2), b = new THREE.Vector3(sx * w1 / 2, y1, sz * w1 / 2);
      const dir = new THREE.Vector3().subVectors(b, a);
      const r = legR * (1.6 - i / levels);
      const m = cyl(r * 0.85, r, dir.length(), 8, mat);
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      if (i === 0) solid(m);
      g.add(m);
      // Crociere tra i montanti
      if (i < levels - 2) {
        const cross = new THREE.Mesh(new THREE.BoxGeometry(w0, 0.5, 0.5), mat);
        cross.position.set(0, y0 + (y1 - y0) * 0.5, sz * (w0 + w1) / 4);
        if (sx < 0) g.add(cross);
      }
    }
    if (i > 0 && i % 3 === 0) {
      const plat = new THREE.Mesh(new THREE.BoxGeometry(w0 + 3, 1.4, w0 + 3), mat);
      plat.position.y = y0;
      g.add(plat);
    }
  }
  // Arcate tra i piedi
  for (let k = 0; k < 4; k++) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(baseW * 0.32, legR * 0.7, 6, 24, Math.PI), mat);
    arch.position.y = 0;
    arch.rotation.y = (k * Math.PI) / 2;
    const off = baseW * 0.47;
    arch.position.x = k === 1 ? off : k === 3 ? -off : 0;
    arch.position.z = k === 0 ? off : k === 2 ? -off : 0;
    arch.scale.y = 1.15;
    g.add(arch);
  }
  const tip = cyl(0.4, 1.4, height * 0.12, 8, mat);
  tip.position.y = height * 1.06;
  g.add(tip);
}

/** Monumento al centro della piazza (coordinate locali: piazza centrata in 0,0). */
function buildMonument(style) {
  const g = new THREE.Group();
  const stone = std(0xc9bda6, { roughness: 0.9 });
  const concrete = std(0xa9adb2);
  switch (style.landmark) {
    case 'spire': {
      const base = solid(new THREE.Mesh(new THREE.BoxGeometry(34, 160, 34), std(0x8d8f93, { metalness: 0.3, roughness: 0.5 })));
      base.position.y = 80;
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(26, 40, 26), std(0x9a9ca0));
      s1.position.y = 180;
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(16, 26, 16), std(0xa5a7ab));
      s2.position.y = 213;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(9, 22, 4), std(0xc8cbd0, { metalness: 0.8, roughness: 0.3 }));
      crown.rotation.y = Math.PI / 4;
      crown.position.y = 237;
      const needle = cyl(0.5, 2.2, 45, 8, std(0xc8cbd0, { metalness: 0.8, roughness: 0.3 }));
      needle.position.y = 270;
      const lobby = solid(new THREE.Mesh(new THREE.BoxGeometry(44, 12, 44), std(0x6f7176, { roughness: 0.6 })));
      lobby.position.y = 6;
      g.add(base, s1, s2, crown, needle, lobby);
      break;
    }
    case 'redtower': {
      const mat = std(0xd8452b, { roughness: 0.6 });
      lattice(g, 220, 70, mat, 1.0);
      for (let i = 0; i < 5; i++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 11), std(i % 2 ? 0xf2f2f2 : 0xd8452b));
        band.position.y = 130 + i * 15;
        g.add(band);
      }
      break;
    }
    case 'lattice': {
      lattice(g, 300, 118, std(0x6b5a46, { roughness: 0.7, metalness: 0.2 }), 1.5);
      break;
    }
    case 'statue': {
      const ped = solid(new THREE.Mesh(new THREE.BoxGeometry(14, 10, 14), stone));
      ped.position.y = 5;
      const white = std(0xe8e4dc, { roughness: 0.7 });
      const body = solid(cyl(2.2, 3.4, 22, 14, white));
      body.position.y = 21;
      const arms = new THREE.Mesh(new THREE.BoxGeometry(26, 2.6, 2.6), white);
      arms.position.y = 29;
      const head = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 10), white);
      head.position.y = 34;
      const steps = solid(new THREE.Mesh(new THREE.CylinderGeometry(14, 16, 1.5, 32), stone));
      steps.position.y = 0.75;
      g.add(steps, ped, body, arms, head);
      break;
    }
    case 'castle': {
      const tuff = std(0x8f877a, { roughness: 1 });
      for (const [x, z] of [[-26, -18], [26, -18], [-26, 18], [26, 18]]) {
        const t = solid(cyl(8, 9, 30, 20, tuff));
        t.position.set(x, 15, z);
        const crown = new THREE.Mesh(new THREE.CylinderGeometry(9.4, 8.5, 3, 20), tuff);
        crown.position.set(x, 31.5, z);
        g.add(t, crown);
      }
      for (const [w, d, x, z] of [[52, 4, 0, -20], [4, 36, -28, 0], [4, 36, 28, 0], [18, 4, -17, 20], [18, 4, 17, 20]]) {
        const wall = solid(new THREE.Mesh(new THREE.BoxGeometry(w, 22, d), tuff));
        wall.position.set(x, 11, z);
        g.add(wall);
      }
      const arch = new THREE.Mesh(new THREE.BoxGeometry(16, 26, 4.5), std(0xe9e4d8, { roughness: 0.7 }));
      arch.position.set(0, 18, 20);
      const gate = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.8, 8, 18, Math.PI), std(0xd8d0c0));
      gate.position.set(0, 9, 22.4);
      g.add(arch, gate);
      break;
    }
    case 'tvtower': {
      const shaft = solid(cyl(4.5, 8, 200, 16, concrete));
      shaft.position.y = 100;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 18), std(0x9aa3ad, { metalness: 0.7, roughness: 0.35 }));
      ball.position.y = 200;
      const ant = cyl(0.9, 2.2, 60, 8, std(0xd94a3a));
      ant.position.y = 248;
      const foot = solid(new THREE.Mesh(new THREE.CylinderGeometry(18, 22, 8, 6), std(0x7d8187)));
      foot.position.y = 4;
      g.add(shaft, ball, ant, foot);
      break;
    }
    case 'arch': {
      for (const sx of [-1, 1]) {
        const p = solid(new THREE.Mesh(new THREE.BoxGeometry(14, 40, 14), stone));
        p.position.set(sx * 17, 20, 0);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone);
        dome.position.set(sx * 17, 52, 0);
        g.add(p, dome);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(48, 12, 15), stone);
      top.position.y = 46;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(10, 3, 8, 20, Math.PI), stone);
      arch.position.y = 34;
      g.add(top, arch);
      break;
    }
    case 'column': {
      const base = solid(cyl(12, 14, 10, 16, stone));
      base.position.y = 5;
      const col = solid(cyl(2.6, 3.2, 60, 16, stone));
      col.position.y = 40;
      const angel = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8, 8), std(0xd6a73a, { metalness: 0.9, roughness: 0.3 }));
      angel.position.y = 74;
      g.add(base, col, angel);
      break;
    }
    case 'domes': {
      const colors = [0xd23b2b, 0x2f8f5a, 0xe0b23a, 0x2f6fb0, 0xd23b2b];
      const hall = solid(new THREE.Mesh(new THREE.BoxGeometry(110, 16, 26), std(0xc9a27b)));
      hall.position.y = 8;
      g.add(hall);
      colors.forEach((c, i) => {
        const x = -48 + i * 24;
        const tower = solid(cyl(7, 8, 34 + i * 6, 12, std(0xc9a27b)));
        tower.position.set(x, (34 + i * 6) / 2, 0);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(9.5, 16, 12), std(c, { roughness: 0.4 }));
        dome.scale.y = 1.3;
        dome.position.set(x, 34 + i * 6 + 8, 0);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(3.5, 12, 10), std(c));
        tip.position.set(x, 34 + i * 6 + 24, 0);
        g.add(tower, dome, tip);
      });
      break;
    }
    case 'shells': {
      const white = std(0xf4f2ec, { roughness: 0.35 });
      const base = solid(new THREE.Mesh(new THREE.BoxGeometry(120, 8, 56), std(0xb38a6a)));
      base.position.y = 4;
      g.add(base);
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(28 - i * 3, 24, 16, 0, Math.PI, 0, Math.PI / 2), white);
        s.rotation.set(-0.4, Math.PI / 2, 0);
        s.position.set(-44 + i * 22, 8, 0);
        g.add(s);
      }
      break;
    }
    case 'pyramids': {
      const sand = std(0xd2b47c, { flatShading: true });
      [[0, -22, 50], [-48, 34, 34], [44, 38, 26]].forEach(([x, z, h]) => {
        const p = solid(new THREE.Mesh(new THREE.ConeGeometry(h * 0.8, h, 4), sand));
        p.rotation.y = Math.PI / 4;
        p.position.set(x, h / 2, z);
        g.add(p);
      });
      break;
    }
    case 'clocktower': {
      const sandstone = std(0xc3a873);
      const tower = solid(new THREE.Mesh(new THREE.BoxGeometry(14, 80, 14), sandstone));
      tower.position.set(30, 40, 0);
      const clockBox = new THREE.Mesh(new THREE.BoxGeometry(17, 18, 17), std(0xb09560));
      clockBox.position.set(30, 89, 0);
      for (const [rx, z, x] of [[0, 8.6, 0], [Math.PI, -8.6, 0]]) {
        const face = new THREE.Mesh(new THREE.CircleGeometry(6.4, 24), new THREE.MeshStandardMaterial({ color: 0xf6f0d8, emissive: 0xffe9a8, emissiveIntensity: 0.4 }));
        face.position.set(30 + x, 89, z);
        face.rotation.y = rx;
        g.add(face);
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(10, 30, 4), std(0x4a4a4a));
      spire.rotation.y = Math.PI / 4;
      spire.position.set(30, 113, 0);
      const hall = solid(new THREE.Mesh(new THREE.BoxGeometry(80, 26, 24), sandstone));
      hall.position.set(-18, 13, 0);
      g.add(tower, clockBox, spire, hall);
      break;
    }
    case 'obelisk': {
      const ob = solid(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 5, 64, 4), std(0xeeeae0)));
      ob.rotation.y = Math.PI / 4;
      ob.position.y = 34;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(2.5, 6, 4), std(0xeeeae0));
      tip.rotation.y = Math.PI / 4;
      tip.position.y = 69;
      const base = solid(new THREE.Mesh(new THREE.BoxGeometry(12, 2, 12), stone));
      base.position.y = 1;
      g.add(base, ob, tip);
      break;
    }
    case 'mosque': {
      const base = solid(new THREE.Mesh(new THREE.BoxGeometry(80, 30, 64), std(0xd9d0bf)));
      base.position.y = 15;
      const main = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), std(0x8e9aa3));
      main.position.y = 30;
      g.add(base, main);
      for (const [x, z] of [[-48, -40], [48, -40], [-48, 40], [48, 40]]) {
        const m = solid(cyl(2.6, 3, 70, 12, std(0xe8e2d4)));
        m.position.set(x, 35, z);
        const c = new THREE.Mesh(new THREE.ConeGeometry(3.4, 13, 12), std(0x7d8a94));
        c.position.set(x, 76, z);
        g.add(m, c);
      }
      break;
    }
    case 'observatory': {
      const white = std(0xefece4, { roughness: 0.6 });
      const hall = solid(new THREE.Mesh(new THREE.BoxGeometry(60, 14, 22), white));
      hall.position.y = 7;
      g.add(hall);
      for (const x of [-26, 0, 26]) {
        const drum = solid(cyl(x === 0 ? 11 : 7, x === 0 ? 11 : 7, 8, 24, white));
        drum.position.set(x, 18, 0);
        const dome = new THREE.Mesh(new THREE.SphereGeometry(x === 0 ? 11.5 : 7.4, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x3e4a4f, { metalness: 0.7, roughness: 0.35 }));
        dome.position.set(x, 22, 0);
        g.add(drum, dome);
      }
      break;
    }
    default: {
      const ob = solid(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 5, 50, 4), stone));
      ob.position.y = 25;
      g.add(ob);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** Sfondo naturale oltre il confine (nessuna collisione: non è raggiungibile). */
function buildScenery(style, edge) {
  const g = new THREE.Group();
  const z = -edge - 420;
  switch (style.scenery) {
    case 'volcano': {
      const m = new THREE.Mesh(new THREE.ConeGeometry(320, 190, 48, 6, true), std(0x5d5a52, { flatShading: true }));
      m.position.set(-120, 80, z - 200);
      const top = new THREE.Mesh(new THREE.ConeGeometry(130, 60, 32, 1, true), std(0x4a4842, { flatShading: true }));
      top.position.set(-120, 190, z - 200);
      g.add(m, top);
      break;
    }
    case 'sugarloaf': {
      const hill = new THREE.Mesh(new THREE.ConeGeometry(240, 260, 40, 4), std(0x3f6b3a, { flatShading: true }));
      hill.position.set(160, 110, z - 160);
      const sugar = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 16), std(0x4d6b44, { flatShading: true }));
      sugar.scale.set(0.7, 1.5, 0.7);
      sugar.position.set(-260, 60, z - 40);
      g.add(hill, sugar);
      break;
    }
    case 'skyline': {
      for (let i = 0; i < 14; i++) {
        const hgt = 90 + ((i * 53) % 150);
        const t = new THREE.Mesh(new THREE.BoxGeometry(34, hgt, 34), std(0x7d8086, { roughness: 0.6, metalness: 0.2 }));
        t.position.set(-420 + i * 64, hgt / 2, z - 40 - ((i * 37) % 90));
        g.add(t);
      }
      break;
    }
    case 'hills': {
      for (let i = 0; i < 6; i++) {
        const hill = new THREE.Mesh(new THREE.ConeGeometry(180 + i * 22, 130 + (i % 2) * 50, 24, 3), std(0x7d7350, { flatShading: true }));
        hill.position.set(-420 + i * 170, 50, z - 140);
        g.add(hill);
      }
      break;
    }
    default: break;
  }
  if (style.sea) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(3400, 900), new THREE.MeshStandardMaterial({ color: 0x24506e, roughness: 0.15, metalness: 0.2 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.6, edge + 520);
    g.add(sea);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return g;
}

/**
 * @param {string} cityId
 * @param {{ x: number, z: number, half: number, edge: number }} plaza  centro e metà lato della piazza; confine giocabile
 * @returns {{ group: THREE.Group, style: object, colliders: Array<{x:number,y:number,z:number,hx:number,hy:number,hz:number}>, solids: THREE.Mesh[] }}
 */
export function buildLandmark(cityId, plaza) {
  const style = CITY_STYLE[cityId] || CITY_STYLE.newyork;
  const group = new THREE.Group();
  const monument = buildMonument(style);
  monument.position.set(plaza.x, 0.05, plaza.z);
  group.add(monument, buildScenery(style, plaza.edge));
  group.updateMatrixWorld(true);
  // Collisioni: un box statico per ogni parte principale del monumento (AABB in coordinate mondo)
  const colliders = [];
  const solids = [];
  const box = new THREE.Box3();
  const c = new THREE.Vector3(), s = new THREE.Vector3();
  monument.traverse((o) => {
    if (!o.isMesh || !o.userData.solid) return;
    box.setFromObject(o, true); // precisa: usa i vertici reali (piramidi e montanti ruotati non "gonfiano" il box)
    box.getCenter(c);
    box.getSize(s);
    colliders.push({ x: c.x, y: c.y, z: c.z, hx: s.x / 2, hy: s.y / 2, hz: s.z / 2 });
    solids.push(o);
  });
  return { group, style, colliders, solids };
}
