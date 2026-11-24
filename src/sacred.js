// Arte sacra e arredo urbano procedurali: crocifisso, statua della Madonna, edicole votive illuminate,
// fontane con acqua animata e affreschi per i soffitti delle chiese. Nessun file esterno, solo Three.js.
// Le luci delle edicole sono finte (materiali emissivi e coni additivi): nessuna luce aggiunta alla scena.
import * as THREE from 'three';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

/**
 * Crocifisso: croce di legno con il Cristo (corpo, braccia aperte, perizoma, corona di spine) e targa INRI.
 * Origine alla base della croce; altezza totale ≈ h metri.
 */
export function makeCrucifix(h = 2.4, { wood = 0x5a3a22, body = 0xe8d6bc } = {}) {
  const g = new THREE.Group();
  g.name = 'crucifix';
  const woodMat = std(wood, { roughness: 0.7 });
  const skin = std(body, { roughness: 0.45, metalness: 0.05 });
  const cloth = std(0xf4efe4, { roughness: 0.8 });
  const thorn = std(0x3a2a18, { roughness: 0.9 });
  const k = h / 2.4;
  const beamW = 0.14 * k;
  const post = new THREE.Mesh(new THREE.BoxGeometry(beamW, h, beamW * 0.8), woodMat);
  post.position.y = h / 2;
  const armY = h * 0.74;
  const cross = new THREE.Mesh(new THREE.BoxGeometry(h * 0.62, beamW, beamW * 0.8), woodMat);
  cross.position.y = armY;
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.28 * k, 0.12 * k, 0.03 * k), std(0xe9dcb8, { roughness: 0.5 }));
  plaque.position.set(0, h * 0.93, beamW * 0.45);
  g.add(post, cross, plaque);
  // Corpo del Cristo davanti alla croce
  const zf = beamW * 0.55;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.1 * k, 0.32 * k, 6, 12), skin);
  torso.scale.set(1, 1, 0.7);
  torso.position.set(0, armY - 0.27 * k, zf);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075 * k, 16, 12), skin);
  head.position.set(0.03 * k, armY + 0.03 * k, zf + 0.03 * k);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.08 * k, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), thorn);
  hair.position.copy(head.position).add(new THREE.Vector3(0, 0.01 * k, -0.01 * k));
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.08 * k, 0.012 * k, 6, 16), thorn);
  crown.rotation.x = Math.PI / 2 - 0.3;
  crown.position.copy(head.position).add(new THREE.Vector3(0, 0.045 * k, 0));
  g.add(torso, head, hair, crown);
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 * k, 0.5 * k, 4, 8), skin);
    arm.rotation.z = sx * (Math.PI / 2 - 0.22);
    arm.position.set(sx * 0.3 * k, armY - 0.04 * k, zf);
    g.add(arm);
  }
  const loin = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * k, 0.13 * k, 0.16 * k, 12), cloth);
  loin.position.set(0, armY - 0.56 * k, zf);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.06 * k, 0.5 * k, 4, 10), skin);
  legs.scale.set(1.3, 1, 0.8);
  legs.position.set(0.02 * k, armY - 0.9 * k, zf);
  legs.rotation.z = 0.06;
  g.add(loin, legs);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/**
 * Statua della Madonna: veste bianca, manto azzurro, velo, mani giunte e aureola dorata con dodici stelle.
 * Origine ai piedi; altezza ≈ h metri. glow (0..1) controlla l'emissione dell'aureola (vedi setStatueGlow).
 */
export function makeMadonna(h = 1.7) {
  const g = new THREE.Group();
  g.name = 'madonna';
  const k = h / 1.7;
  const white = std(0xf4f1ea, { roughness: 0.45 });
  const blue = std(0x3d6fb6, { roughness: 0.5 });
  const skin = std(0xf0d8c0, { roughness: 0.45 });
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xe9c25a, emissive: 0xffd36a, emissiveIntensity: 0.6, metalness: 0.8, roughness: 0.25 });
  // Veste (svasata verso il basso) e manto aperto sul davanti
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * k, 0.3 * k, 1.25 * k, 24), white);
  robe.position.y = 0.625 * k;
  const mantle = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * k, 0.34 * k, 1.3 * k, 24, 1, true, Math.PI * 0.18, Math.PI * 1.64), blue);
  mantle.material.side = THREE.DoubleSide;
  mantle.position.y = 0.66 * k;
  mantle.rotation.y = Math.PI;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.17 * k, 0.012 * k, 6, 20), blue);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.98 * k;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17 * k, 18, 12), white);
  chest.scale.set(1, 0.9, 0.75);
  chest.position.y = 1.2 * k;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * k, 0.05 * k, 0.08 * k, 10), skin);
  neck.position.y = 1.36 * k;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09 * k, 18, 14), skin);
  head.scale.set(0.9, 1.1, 0.95);
  head.position.set(0, 1.47 * k, 0.01 * k);
  const veil = new THREE.Mesh(new THREE.SphereGeometry(0.115 * k, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.68), blue);
  veil.position.set(0, 1.48 * k, -0.015 * k);
  veil.scale.set(1, 1.15, 1.05);
  const veilBack = new THREE.Mesh(new THREE.ConeGeometry(0.16 * k, 0.4 * k, 18, 1, true), blue);
  veilBack.material.side = THREE.DoubleSide;
  veilBack.position.set(0, 1.28 * k, -0.06 * k);
  g.add(robe, mantle, belt, chest, neck, head, veil, veilBack);
  // Mani giunte in preghiera
  for (const sx of [-1, 1]) {
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.035 * k, 0.2 * k, 4, 8), white);
    fore.rotation.set(-1.0, 0, sx * 0.9);
    fore.position.set(sx * 0.08 * k, 1.14 * k, 0.12 * k);
    g.add(fore);
  }
  const hands = new THREE.Mesh(new THREE.BoxGeometry(0.05 * k, 0.11 * k, 0.04 * k), skin);
  hands.position.set(0, 1.2 * k, 0.2 * k);
  hands.rotation.x = -0.3;
  g.add(hands);
  // Aureola con dodici stelle
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.17 * k, 0.01 * k, 8, 36), goldMat);
  halo.position.set(0, 1.56 * k, -0.08 * k);
  g.add(halo);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.022 * k, 0), goldMat);
    star.position.set(Math.cos(a) * 0.17 * k, 1.56 * k + Math.sin(a) * 0.17 * k, -0.08 * k);
    g.add(star);
  }
  g.userData.glowMat = goldMat;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/**
 * Edicola votiva in città: basamento in pietra, statua (Madonna o crocifisso), fiori, lumini e un fascio
 * di luce finto (cono additivo + alone a terra) che si accende di più di notte.
 * Ritorna { group, setGlow(n) } con origine al livello del suolo.
 */
export function makeShrine(kind = 'madonna') {
  const g = new THREE.Group();
  const stone = std(0xcfc6b4, { roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), stone);
  base.position.y = 0.175;
  const ped = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.9), stone);
  ped.position.y = 0.35 + 0.55;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 1.05), stone);
  cap.position.y = 1.51;
  g.add(base, ped, cap);
  const statue = kind === 'madonna' ? makeMadonna(1.75) : makeCrucifix(2.6);
  statue.position.y = 1.57;
  g.add(statue);
  // Fiori e lumini sul gradino
  const flowerCols = [0xd64a6a, 0xf2d24a, 0xf4f1ea, 0x9b59d0];
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + (i / 5) * 1.8;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 8), std(0x9b5a3a));
    pot.position.set(Math.sin(a) * 0.62, 0.4, 0.62);
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), std(flowerCols[i % flowerCols.length], { roughness: 0.8 }));
    bloom.position.set(pot.position.x, 0.5, pot.position.z);
    g.add(pot, bloom);
  }
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xff9a30, emissiveIntensity: 2.0 });
  const flames = [];
  for (let i = 0; i < 4; i++) {
    const x = -0.45 + i * 0.3;
    const lum = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0xb3122a, roughness: 0.3, transparent: true, opacity: 0.85 }));
    lum.position.set(x, 0.39, 0.5);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 6), flameMat);
    f.position.set(x, 0.45, 0.5);
    flames.push(f);
    g.add(lum, f);
  }
  // Fascio di luce (cono additivo dal basso verso la statua) e alone a terra
  const beamMat = new THREE.MeshBasicMaterial({ color: kind === 'madonna' ? 0xbfd8ff : 0xffe2b0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.1, 3.2, 24, 1, true), beamMat);
  beam.position.y = 2.6;
  beam.renderOrder = 3;
  const poolMat = new THREE.MeshBasicMaterial({ color: kind === 'madonna' ? 0x9fc4ff : 0xffd49a, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.02;
  pool.renderOrder = 2;
  g.add(beam, pool);
  // Faretti incassati nel basamento
  const spotMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 2.5 });
  for (const [x, z] of [[0.55, 0.76], [-0.55, 0.76]]) {
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), spotMat);
    s.position.set(x, 0.2, z);
    g.add(s);
  }
  g.traverse((o) => { if (o.isMesh && o !== beam && o !== pool) { o.castShadow = true; o.receiveShadow = true; } });
  const glowMat = statue.userData.glowMat || null;
  // Faretti finti: i materiali della statua emettono una luce calda propria (più forte di notte)
  const lit = [];
  statue.traverse((o) => {
    if (!o.isMesh || o.material === glowMat || lit.includes(o.material)) return;
    o.material.emissive = o.material.color.clone().lerp(new THREE.Color(0xfff2dc), 0.12);
    lit.push(o.material);
  });
  return {
    group: g,
    statue,
    /** night 0..1: di notte fascio, alone, statua e aureola più intensi; t: secondi (lumini tremolanti). */
    update(t, night) {
      beamMat.opacity = 0.03 + night * 0.08;
      poolMat.opacity = 0.1 + night * 0.25;
      for (const m of lit) m.emissiveIntensity = 0.05 + night * 0.3;
      if (glowMat) glowMat.emissiveIntensity = 0.5 + night * 1.6;
      flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 13 + i * 1.7) * 0.25; });
    },
  };
}

/**
 * Fontana in pietra: vasca circolare con bordo, acqua che riflette il cielo, colonna centrale con due catini
 * e zampilli animati. Ritorna { group, radius, update(t) }.
 */
export function makeFountain(radius = 3.2) {
  const g = new THREE.Group();
  const stone = std(0xd9d1bf, { roughness: 0.8 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.28, 10, 48), stone);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.55;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.05, radius + 0.2, 0.55, 48, 1, true), stone);
  wall.position.y = 0.275;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), std(0x6f8a92, { roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.05;
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x4f9fbf, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4 });
  const water = new THREE.Mesh(new THREE.CircleGeometry(radius - 0.05, 48), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.42;
  g.add(rim, wall, floor, water);
  // Colonna centrale con due catini
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.6, 16), stone);
  column.position.y = 0.8;
  const bowl1 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.35, 0.3, 32), stone);
  bowl1.position.y = 1.55;
  const w1 = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), waterMat);
  w1.rotation.x = -Math.PI / 2;
  w1.position.y = 1.69;
  const col2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.8, 12), stone);
  col2.position.y = 2.05;
  const bowl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.2, 0.22, 24), stone);
  bowl2.position.y = 2.5;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), stone);
  finial.position.y = 2.72;
  g.add(column, bowl1, w1, col2, bowl2, finial);
  // Zampilli: getto centrale e cortine d'acqua che cadono dai catini (coni trasparenti animati)
  const sprayMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.9, 10, 1, true), sprayMat);
  jet.position.y = 3.15;
  const curtain1 = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.45, 1.1, 32, 1, true), sprayMat);
  curtain1.position.y = 1.0;
  const curtain2 = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.75, 0.75, 24, 1, true), sprayMat);
  curtain2.position.y = 2.1;
  g.add(jet, curtain1, curtain2);
  // Piccole gocce attorno al getto
  const drops = [];
  const dropGeo = new THREE.SphereGeometry(0.035, 6, 4);
  for (let i = 0; i < 14; i++) {
    const d = new THREE.Mesh(dropGeo, sprayMat);
    d.userData.a = (i / 14) * Math.PI * 2;
    d.userData.o = i * 0.37;
    drops.push(d);
    g.add(d);
  }
  g.traverse((o) => { if (o.isMesh && o.material === stone) { o.castShadow = true; o.receiveShadow = true; } });
  return {
    group: g,
    radius: radius + 0.3,
    update(t) {
      jet.scale.y = 0.85 + Math.sin(t * 7) * 0.15;
      sprayMat.opacity = 0.38 + Math.sin(t * 5) * 0.06;
      curtain1.rotation.y = t * 0.3;
      curtain2.rotation.y = -t * 0.4;
      waterMat.color.setHSL(0.54, 0.45, 0.5 + Math.sin(t * 1.3) * 0.03);
      for (const d of drops) {
        const k = (t * 0.9 + d.userData.o) % 1;
        const r = 0.15 + k * 1.0;
        d.position.set(Math.cos(d.userData.a) * r, 3.5 + k * 0.5 - k * k * 2.2, Math.sin(d.userData.a) * r);
      }
    },
  };
}

/**
 * Affresco per il soffitto: cielo con nuvole, cornice dorata e una scena (Cristo in gloria, Madonna con
 * angeli, colomba dello Spirito Santo, Creazione) dipinta a mano libera sul canvas. Ritorna una CanvasTexture sRGB.
 */
export function frescoTexture(scene = 0, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size;
  // Cielo sfumato con nuvole morbide
  const sky = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.7);
  sky.addColorStop(0, '#fff3c8');
  sky.addColorStop(0.35, '#a9c9e8');
  sky.addColorStop(1, '#5f86b8');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);
  let seed = 1234 + scene * 97;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 70;
    const cl = g.createRadialGradient(x, y, 2, x, y, r);
    cl.addColorStop(0, 'rgba(255,250,240,0.85)');
    cl.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = cl;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Raggi di luce dal centro
  g.save();
  g.translate(S / 2, S / 2);
  for (let i = 0; i < 24; i++) {
    g.rotate((Math.PI * 2) / 24);
    g.fillStyle = 'rgba(255,236,170,0.12)';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-12, -S * 0.55); g.lineTo(12, -S * 0.55); g.closePath(); g.fill();
  }
  g.restore();
  const figure = (x, y, s, robe, mantle, halo = true) => {
    // Figura stilizzata: aureola, testa, veste lunga e manto
    if (halo) {
      g.fillStyle = 'rgba(255,214,90,0.95)';
      g.beginPath(); g.arc(x, y - s * 0.62, s * 0.16, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f0d2b4';
    g.beginPath(); g.arc(x, y - s * 0.62, s * 0.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = robe;
    g.beginPath(); g.moveTo(x - s * 0.12, y - s * 0.5); g.lineTo(x + s * 0.12, y - s * 0.5); g.lineTo(x + s * 0.24, y + s * 0.45); g.lineTo(x - s * 0.24, y + s * 0.45); g.closePath(); g.fill();
    g.fillStyle = mantle;
    g.beginPath(); g.moveTo(x - s * 0.14, y - s * 0.48); g.quadraticCurveTo(x - s * 0.4, y, x - s * 0.26, y + s * 0.46); g.lineTo(x - s * 0.1, y + s * 0.46); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x + s * 0.14, y - s * 0.48); g.quadraticCurveTo(x + s * 0.4, y, x + s * 0.26, y + s * 0.46); g.lineTo(x + s * 0.1, y + s * 0.46); g.closePath(); g.fill();
  };
  const angel = (x, y, s, flip) => {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    g.beginPath(); g.ellipse(x + (flip ? -s * 0.25 : s * 0.25), y - s * 0.2, s * 0.32, s * 0.14, flip ? 0.5 : -0.5, 0, Math.PI * 2); g.fill();
    figure(x, y, s, '#f6efe2', '#e8b4c4');
  };
  const kind = scene % 4;
  if (kind === 0) {
    // Cristo in gloria tra gli angeli
    figure(S / 2, S / 2 + 20, 150, '#f8f3e6', '#c0392b');
    angel(S * 0.22, S * 0.42, 70, false);
    angel(S * 0.78, S * 0.42, 70, true);
    angel(S * 0.3, S * 0.75, 60, false);
    angel(S * 0.7, S * 0.75, 60, true);
  } else if (kind === 1) {
    // Madonna con il manto azzurro, incoronata di stelle
    figure(S / 2, S / 2 + 20, 150, '#f8f3e6', '#3d6fb6');
    g.fillStyle = '#ffe27a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.arc(S / 2 + Math.cos(a) * 42, S / 2 - 73 + Math.sin(a) * 42, 5, 0, Math.PI * 2); g.fill();
    }
    angel(S * 0.25, S * 0.68, 64, false);
    angel(S * 0.75, S * 0.68, 64, true);
  } else if (kind === 2) {
    // Colomba dello Spirito Santo
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(S / 2, S / 2, 60, 22, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(S / 2 - 50, S / 2 - 30, 70, 18, -0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(S / 2 + 50, S / 2 - 30, 70, 18, 0.6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(S / 2 + 58, S / 2 - 4, 14, 0, Math.PI * 2); g.fill();
    angel(S * 0.2, S * 0.3, 60, false);
    angel(S * 0.8, S * 0.3, 60, true);
    angel(S * 0.5, S * 0.82, 64, false);
  } else {
    // Creazione: due mani che quasi si toccano
    g.fillStyle = '#f0d2b4';
    g.beginPath(); g.ellipse(S * 0.36, S / 2, 90, 16, 0.1, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(S * 0.64, S / 2, 90, 16, -0.1, 0, Math.PI * 2); g.fill();
    figure(S * 0.86, S * 0.42, 110, '#f6efe2', '#8e44ad');
    figure(S * 0.14, S * 0.6, 90, '#e8d5b8', '#2e8b57', false);
  }
  // Cornice dorata con decori agli angoli
  g.lineWidth = 18;
  g.strokeStyle = '#c9a646';
  g.strokeRect(9, 9, S - 18, S - 18);
  g.lineWidth = 4;
  g.strokeStyle = '#7a5a1a';
  g.strokeRect(24, 24, S - 48, S - 48);
  g.fillStyle = '#e2c26a';
  for (const [x, y] of [[24, 24], [S - 24, 24], [24, S - 24], [S - 24, S - 24]]) { g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill(); }
  // Patina dell'intonaco antico
  g.globalAlpha = 0.07;
  for (let i = 0; i < 400; i++) { g.fillStyle = rnd() < 0.5 ? '#5a4630' : '#ffffff'; g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 3, 2 + rnd() * 3); }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
