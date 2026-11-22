// Piatti 3D realistici per ristorante e pizzeria (procedurali): ogni portata ha forma e ingredienti propri.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
const glossy = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.4, ...o });

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let pizzaTex = null;
function pizzaTopping() {
  if (pizzaTex) return pizzaTex;
  pizzaTex = canvasTex(256, (g, S) => {
    g.fillStyle = '#b8261b';
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${150 + Math.random() * 60},${20 + Math.random() * 30},20,0.4)`; g.fillRect(Math.random() * S, Math.random() * S, 3, 3); }
    // Mozzarella fusa
    for (let i = 0; i < 14; i++) {
      const x = S / 2 + (Math.random() - 0.5) * S * 0.7, y = S / 2 + (Math.random() - 0.5) * S * 0.7;
      const r = 14 + Math.random() * 20;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, '#fffaf0'); grd.addColorStop(0.7, '#f6ecd4'); grd.addColorStop(1, 'rgba(246,236,212,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // Leggera bruciatura
    for (let i = 0; i < 30; i++) { g.fillStyle = 'rgba(60,30,10,0.25)'; g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 2 + Math.random() * 4, 0, Math.PI * 2); g.fill(); }
  });
  return pizzaTex;
}

let grillTex = null;
function grillMarks() {
  if (grillTex) return grillTex;
  grillTex = canvasTex(128, (g, S) => {
    g.fillStyle = '#7b3f2a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${90 + Math.random() * 60},${40 + Math.random() * 20},25,0.5)`; g.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    g.strokeStyle = 'rgba(30,15,8,0.85)'; g.lineWidth = 7;
    for (let i = -S; i < S * 2; i += 26) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); }
  });
  return grillTex;
}

function plate(radius = 0.15) {
  const g = new THREE.Group();
  const p = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.72, 0.018, 32), glossy(0xfdfdfb, { roughness: 0.15 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, 0.006, 8, 40), glossy(0xf4f2ee));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.01;
  g.add(p, rim);
  return g;
}

function basil(g, x, z, y) {
  const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), std(0x2f7d32, { roughness: 0.5 }));
  leaf.scale.set(1, 0.25, 1.7);
  leaf.position.set(x, y, z);
  leaf.rotation.y = Math.random() * Math.PI;
  g.add(leaf);
}

/** Ritorna un gruppo con piatto e cibo; userData.food = parte che "si consuma". */
export function makeDish(id, fallbackColor = 0xc0392b) {
  const g = new THREE.Group();
  const food = new THREE.Group();
  let p;
  switch (id) {
    case 'margherita': case 'marinara': case 'diavola': case 'capricciosa': case 'quattro_formaggi': {
      p = plate(0.17);
      const crust = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 10, 36), std(0xc98a3e, { roughness: 0.8 }));
      crust.rotation.x = Math.PI / 2;
      crust.position.y = 0.026;
      const base = new THREE.Mesh(new THREE.CircleGeometry(0.135, 36), std(0xffffff, { map: pizzaTopping(), roughness: 0.55 }));
      base.rotation.x = -Math.PI / 2;
      base.position.y = 0.024;
      food.add(crust, base);
      if (id === 'quattro_formaggi') base.material.color.set(0xfff2c8);
      if (id === 'marinara') { base.material.color.set(0xd04a3a); for (let i = 0; i < 10; i++) { const garlic = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), std(0xf6efd8)); garlic.position.set((Math.random() - 0.5) * 0.2, 0.028, (Math.random() - 0.5) * 0.2); food.add(garlic); } }
      if (id === 'diavola') for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 14), std(0xa8231c, { roughness: 0.4 })); s.position.set((Math.random() - 0.5) * 0.18, 0.028, (Math.random() - 0.5) * 0.18); food.add(s); }
      if (id === 'capricciosa') for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), std(i % 2 ? 0x6b5a4a : 0x1a1a1a)); m.scale.y = 0.5; m.position.set((Math.random() - 0.5) * 0.18, 0.03, (Math.random() - 0.5) * 0.18); food.add(m); }
      for (let i = 0; i < 5; i++) basil(food, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16, 0.03);
      break;
    }
    case 'calzone': {
      p = plate(0.16);
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 12, 0, Math.PI), std(0xd19a52, { roughness: 0.75 }));
      c.rotation.set(-Math.PI / 2, 0, 0);
      c.scale.set(1, 1, 0.45);
      c.position.y = 0.012;
      food.add(c);
      break;
    }
    case 'carbonara': case 'risotto': {
      p = plate(0.15);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(id === 'carbonara' ? 0xf0cf6a : 0xd8c49a, { roughness: 0.55 }));
      bowl.scale.y = 0.45;
      bowl.position.y = 0.01;
      food.add(bowl);
      if (id === 'carbonara') {
        // Nido di spaghetti: anelli intrecciati + guanciale e pepe
        for (let i = 0; i < 7; i++) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.006, 0.0035, 6, 28), std(0xf3d57a, { roughness: 0.45 }));
          ring.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.5, 0, Math.random());
          ring.position.y = 0.03 + i * 0.002;
          food.add(ring);
        }
        for (let i = 0; i < 8; i++) { const gu = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.008, 0.012), std(0xb4583c)); gu.position.set((Math.random() - 0.5) * 0.08, 0.045, (Math.random() - 0.5) * 0.08); food.add(gu); }
      } else {
        for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), std(0x6b4a2a)); m.scale.y = 0.5; m.position.set((Math.random() - 0.5) * 0.08, 0.04, (Math.random() - 0.5) * 0.08); food.add(m); }
      }
      break;
    }
    case 'lasagna': {
      p = plate(0.15);
      const layers = [0xe6c27a, 0xb33a26, 0xf3e6c8, 0xe6c27a, 0xb33a26, 0xc9772e];
      layers.forEach((c, i) => {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.011, 0.085), std(c, { roughness: 0.6 }));
        l.position.y = 0.017 + i * 0.011;
        food.add(l);
      });
      break;
    }
    case 'bistecca': {
      p = plate(0.16);
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.1), [std(0xc0473b), std(0xc0473b), std(0xffffff, { map: grillMarks() }), std(0x7b3f2a), std(0xc0473b), std(0xc0473b)]);
        s.position.set(-0.06 + i * 0.032, 0.022, 0);
        s.rotation.y = 0.15;
        food.add(s);
      }
      for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 5), std(0x3f7d2f)); r.position.set(0.07 + Math.random() * 0.03, 0.025, (Math.random() - 0.5) * 0.1); r.rotation.z = Math.PI / 2; food.add(r); }
      break;
    }
    case 'branzino': {
      p = plate(0.17);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 18, 12), glossy(0xbfc5c9, { metalness: 0.4, roughness: 0.3 }));
      body.scale.set(2.4, 0.55, 0.9);
      body.position.y = 0.035;
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 4), std(0xa9b0b5));
      tail.rotation.z = -Math.PI / 2;
      tail.scale.z = 0.25;
      tail.position.set(-0.14, 0.035, 0);
      const lemon = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.006, 16), std(0xf6e05a));
      lemon.position.set(0.09, 0.03, 0.05);
      lemon.rotation.x = 0.5;
      food.add(body, tail, lemon);
      break;
    }
    case 'cotoletta': {
      p = plate(0.16);
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.014, 20), std(0xc9892e, { roughness: 0.85 }));
      c.scale.z = 0.7;
      c.position.set(-0.03, 0.02, 0);
      food.add(c);
      for (let i = 0; i < 12; i++) { const fr = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.06), std(0xe8b84a)); fr.position.set(0.07 + (Math.random() - 0.5) * 0.04, 0.02 + Math.random() * 0.01, (Math.random() - 0.5) * 0.06); fr.rotation.y = Math.random(); food.add(fr); }
      break;
    }
    case 'tiramisu': {
      p = plate(0.11);
      const layers = [0x8b6b4a, 0xf3ead8, 0x8b6b4a, 0xf3ead8];
      layers.forEach((c, i) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.014, 0.07), std(c)); l.position.y = 0.017 + i * 0.014; food.add(l); });
      const cocoa = new THREE.Mesh(new THREE.BoxGeometry(0.071, 0.003, 0.071), std(0x4a2a16, { roughness: 1 }));
      cocoa.position.y = 0.073;
      food.add(cocoa);
      break;
    }
    case 'pannacotta': {
      p = plate(0.1);
      const pc = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.05, 20), glossy(0xfbf6ea, { roughness: 0.2 }));
      pc.position.y = 0.035;
      food.add(pc);
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), glossy(i % 2 ? 0x8b1a3a : 0x3a1a5a)); b.position.set((Math.random() - 0.5) * 0.04, 0.063, (Math.random() - 0.5) * 0.04); food.add(b); }
      break;
    }
    case 'cannolo': case 'sfogliatella': case 'babà': {
      p = plate(0.1);
      if (id === 'cannolo') {
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 14), std(0xc98a3e, { roughness: 0.8 }));
        shell.rotation.z = Math.PI / 2;
        shell.position.y = 0.03;
        food.add(shell);
        for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), std(0xf6efe0)); r.position.set(sx * 0.05, 0.03, 0); food.add(r); }
      } else if (id === 'sfogliatella') {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.06, 16), std(0xe3b26a, { roughness: 0.8 }));
        s.rotation.z = Math.PI / 2;
        s.scale.y = 1.3;
        s.position.y = 0.03;
        food.add(s);
      } else {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.06, 16), glossy(0xc07a1e));
        b.position.y = 0.04;
        const top = new THREE.Mesh(new THREE.SphereGeometry(0.03, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), glossy(0xc07a1e));
        top.position.y = 0.07;
        food.add(b, top);
      }
      break;
    }
    case 'bruschetta': case 'tagliere': case 'frittatina': case 'supplì': {
      p = plate(0.15);
      const n = id === 'tagliere' ? 8 : 3;
      for (let i = 0; i < n; i++) {
        const color = id === 'bruschetta' ? 0xd39a52 : id === 'tagliere' ? [0xd98880, 0xf2e2b0, 0xc0392b, 0xe8c27a][i % 4] : 0xc98a3e;
        const it = new THREE.Mesh(id === 'tagliere' ? new THREE.CylinderGeometry(0.025, 0.025, 0.008, 14) : new THREE.SphereGeometry(0.028, 12, 8), std(color, { roughness: 0.7 }));
        if (id !== 'tagliere') it.scale.set(1.3, 0.7, 1);
        it.position.set(Math.cos(i * 1.3) * 0.06, 0.02 + (i % 2) * 0.006, Math.sin(i * 1.3) * 0.06);
        food.add(it);
        if (id === 'bruschetta') for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.008, 0.01), std(0xc0392b)); t.position.set(it.position.x + (Math.random() - 0.5) * 0.03, 0.04, it.position.z + (Math.random() - 0.5) * 0.02); food.add(t); }
      }
      break;
    }
    default: {
      // Bevande: bicchiere con liquido e, se freddo, ghiaccio
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
      glass.position.y = 0.06;
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.028, 0.09, 18), new THREE.MeshPhysicalMaterial({ color: fallbackColor, roughness: 0.1, transparent: true, opacity: 0.8 }));
      liquid.position.y = 0.05;
      food.add(liquid, glass);
      if (id !== 'espresso') for (let i = 0; i < 2; i++) { const ice = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.018), new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.7, roughness: 0.05 })); ice.position.set((i - 0.5) * 0.02, 0.09, 0); ice.rotation.set(i, 0.4, 0); food.add(ice); }
      g.add(food);
      g.userData.food = food;
      g.userData.drink = true;
      return g;
    }
  }
  g.add(p, food);
  g.userData.food = food;
  return g;
}
