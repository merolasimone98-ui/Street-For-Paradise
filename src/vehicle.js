// Veicoli guidabili (bici, motorini, moto, auto): modelli 3D, fisica Cannon-es arcade, gestione parco veicoli.
// Tasto F: sali/scendi (o forza la serratura con il cacciavite speciale se il veicolo non è tuo).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GROUPS } from './playerstate.js';
import { VEHICLE_MODELS, ENGINE_STAGES } from './items.js';
import { disposeObject3D } from './ui.js';
import { models } from './models.js';

export const SPECS = {
  bike: { len: 1.75, wid: 0.6, h: 1.05, mass: 90, maxSpeed: 9, accel: 3.2, brake: 8, reverseAccel: 1.2, reverseMax: 1.5, steer: 2.4, ride: true, seatY: 0.92, seatZ: -0.2, wheelR: 0.34, wheelBase: 1.05 },
  scooter: { len: 1.8, wid: 0.66, h: 1.15, mass: 110, maxSpeed: 15, accel: 4.5, brake: 9, reverseAccel: 1.2, reverseMax: 1.5, steer: 2.2, ride: true, seatY: 0.76, seatZ: -0.25, wheelR: 0.26, wheelBase: 1.25 },
  moto: { len: 2.1, wid: 0.72, h: 1.15, mass: 200, maxSpeed: 38, accel: 9, brake: 12, reverseAccel: 1.5, reverseMax: 2, steer: 2.0, ride: true, seatY: 0.84, seatZ: -0.3, wheelR: 0.32, wheelBase: 1.45 },
  car_small: { len: 3.7, wid: 1.68, h: 1.45, mass: 950, maxSpeed: 30, accel: 6.5, brake: 12, reverseAccel: 4, reverseMax: 6, steer: 1.6, wheelR: 0.3 },
  car: { len: 4.6, wid: 1.84, h: 1.45, mass: 1350, maxSpeed: 40, accel: 8, brake: 13, reverseAccel: 4, reverseMax: 7, steer: 1.45, wheelR: 0.33 },
  suv: { len: 4.8, wid: 1.95, h: 1.8, mass: 1900, maxSpeed: 36, accel: 7, brake: 12, reverseAccel: 4, reverseMax: 7, steer: 1.35, wheelR: 0.38 },
  sport: { len: 4.4, wid: 1.95, h: 1.22, mass: 1300, maxSpeed: 55, accel: 13, brake: 16, reverseAccel: 5, reverseMax: 7, steer: 1.6, wheelR: 0.34 },
};

export const KIND_LABEL = { bike: 'bici', scooter: 'motorino', moto: 'moto', car_small: 'auto', car: 'auto', suv: 'auto', sport: 'auto' };

/** Marce per tipo di veicolo (0 = senza cambio: bici e motorini a variatore). */
export const GEARS = { bike: 0, scooter: 0, moto: 6, car_small: 5, car: 5, suv: 5, sport: 6 };
/** Velocità massima di ogni marcia come frazione della velocità massima del mezzo. */
const gearTop = (gear, n) => (n ? Math.pow(gear / n, 0.85) : 1);

/** Modifiche dell'officina di casa (garage): estetiche e meccaniche. */
export const DEFAULT_TUNE = { rims: null, lowered: false, engine: 0, brakes: false, neon: null, tint: false };

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });

function tube(parent, a, b, r, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}

function extrudeProfile(points, depth, bevel) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4,
  });
  geo.rotateY(-Math.PI / 2); // lunghezza della sagoma lungo +Z
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.translate(-(bb.min.x + bb.max.x) / 2, 0, 0);
  geo.computeVertexNormals();
  return geo;
}

function wheel(r, width, kind) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, width, 22), std(0x141414, { roughness: 0.9 }));
  tire.rotation.z = Math.PI / 2;
  const rimMat = std(kind === 'sport' ? 0x2b2b2e : 0xc4c8cc, { metalness: 0.9, roughness: 0.28 });
  rimMat.userData.rim = true; // tuning: colore dei cerchi
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, width + 0.01, 14), rimMat);
  rim.rotation.z = Math.PI / 2;
  g.add(tire, rim);
  const spokeMat = std(0x9aa0a6, { metalness: 0.9, roughness: 0.3 });
  spokeMat.userData.rim = true;
  for (let i = 0; i < 5; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.035, r * 1.1), spokeMat);
    sp.rotation.x = (i / 5) * Math.PI;
    g.add(sp);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function twoWheel(r, tubeR) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(r, tubeR, 10, 30), std(0x151515, { roughness: 0.9 }));
  tire.rotation.y = Math.PI / 2;
  g.add(tire);
  const hubMat = std(0xbfc4c9, { metalness: 0.9, roughness: 0.3 });
  hubMat.userData.rim = true;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10), hubMat);
  hub.rotation.z = Math.PI / 2;
  g.add(hub);
  const spokeMat = std(0xc9ced3, { metalness: 0.9 });
  spokeMat.userData.rim = true;
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.008, r * 2 - tubeR, 0.008), spokeMat);
    sp.rotation.x = (i / 8) * Math.PI;
    g.add(sp);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

/**
 * Dettagli piccoli raggruppati per materiale: tante parti (passaruota, minigonne, montanti, frecce…)
 * diventano UNA mesh per materiale, così i dettagli non moltiplicano le draw call dei veicoli parcheggiati.
 */
class DetailBatch {
  constructor() {
    this.buckets = new Map();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
  }

  add(material, geo, x, y, z, rx = 0, ry = 0, rz = 0) {
    this._e.set(rx, ry, rz);
    this._q.setFromEuler(this._e);
    this._p.set(x, y, z);
    this._m.compose(this._p, this._q, this._s);
    geo.applyMatrix4(this._m);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(geo);
  }

  /** Unisce le geometrie di ogni materiale e aggiunge le mesh risultanti al gruppo. */
  build(group) {
    for (const [material, geos] of this.buckets) {
      let vCount = 0, iCount = 0;
      for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index ? g.index.count : g.attributes.position.count; }
      const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), idx = new Uint32Array(iCount);
      let vo = 0, io = 0;
      for (const g of geos) {
        const p = g.attributes.position, n = g.attributes.normal;
        pos.set(p.array.subarray(0, p.count * 3), vo * 3);
        nor.set(n.array.subarray(0, n.count * 3), vo * 3);
        if (g.index) { for (let k = 0; k < g.index.count; k++) idx[io + k] = g.index.array[k] + vo; io += g.index.count; }
        else { for (let k = 0; k < p.count; k++) idx[io + k] = vo + k; io += p.count; }
        vo += p.count;
        g.dispose();
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      const mesh = new THREE.Mesh(out, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }
}

/** Testo della radio sul display del cruscotto. */
function radioCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#04131a'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#5fe3ff'; g.font = '600 26px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  return c;
}

/**
 * Abitacolo per la prima persona: cruscotto, volante (ruota con lo sterzo), contachilometri con lancetta,
 * display della radio, sedili, cielo e pannelli porta. Coordinate locali dell'auto (muso verso +Z, guida a sinistra = +X).
 */
function buildCockpit(L, W, k, gFront, gRear, roofY) {
  const g = new THREE.Group();
  g.name = 'cockpit';
  const dashMat = std(0x1b1c1f, { roughness: 0.65 });
  const trim = std(0x2c2e33, { roughness: 0.5, metalness: 0.2 });
  const seatMat = std(0x232428, { roughness: 0.9 });
  const driverX = W / 2 - 0.5;
  const dashZ = gFront - 0.32;
  const dashY = 0.97 * k;
  const dash = new THREE.Mesh(new THREE.BoxGeometry(W - 0.22, 0.3, 0.6), dashMat);
  dash.position.set(0, dashY, dashZ);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.22), dashMat);
  hood.position.set(driverX, dashY + 0.14, dashZ - 0.12);
  g.add(dash, hood);
  // Quadro strumenti con lancetta del tachimetro
  const dialMat = new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: 0x2a4a66, emissiveIntensity: 0.6, roughness: 0.4 });
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), dialMat);
  dial.position.set(driverX, dashY + 0.12, dashZ - 0.235);
  dial.rotation.y = Math.PI;
  const needlePivot = new THREE.Group();
  needlePivot.position.copy(dial.position).add(new THREE.Vector3(0, 0, -0.004));
  needlePivot.rotation.y = Math.PI;
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.065, 0.003), new THREE.MeshBasicMaterial({ color: 0xff5a3a }));
  needle.position.y = 0.03;
  needlePivot.add(needle);
  g.add(dial, needlePivot);
  // Display della radio al centro
  const radioTex = new THREE.CanvasTexture(radioCanvas('RADIO OFF'));
  radioTex.colorSpace = THREE.SRGBColorSpace;
  const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.055), new THREE.MeshBasicMaterial({ map: radioTex, toneMapped: false }));
  radio.position.set(0, dashY + 0.02, dashZ - 0.28);
  radio.rotation.y = Math.PI;
  radio.rotation.x = 0.25;
  g.add(radio);
  // Volante (corona, razze, piantone) che gira con lo sterzo
  const wheelPivot = new THREE.Group();
  wheelPivot.position.set(driverX, dashY + 0.02, dashZ - 0.42);
  wheelPivot.rotation.x = -0.42;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 10, 32), trim);
  const spin = new THREE.Group();
  spin.add(ring);
  for (const a of [0, Math.PI * 0.75, Math.PI * 1.25]) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.012), trim);
    spoke.position.set(Math.sin(a) * 0.075, Math.cos(a) * -0.075, 0);
    spoke.rotation.z = -a;
    spin.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), dashMat);
  hub.rotation.x = Math.PI / 2;
  spin.add(hub);
  wheelPivot.add(spin);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.3, 10), dashMat);
  column.rotation.x = Math.PI / 2;
  column.position.z = 0.15;
  wheelPivot.add(column);
  g.add(wheelPivot);
  // Sedili, tunnel centrale con leva del cambio
  for (const sx of [driverX, -driverX]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.52), seatMat);
    base.position.set(sx, 0.5 * k, dashZ - 1.2);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.12), seatMat);
    back.position.set(sx, 0.85 * k, dashZ - 1.5);
    back.rotation.x = -0.18;
    g.add(base, back);
  }
  const tunnel = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.9), dashMat);
  tunnel.position.set(0, 0.5 * k, dashZ - 0.8);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 8), trim);
  lever.position.set(0, 0.67 * k, dashZ - 0.75);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), trim);
  knob.position.set(0, 0.75 * k, dashZ - 0.75);
  g.add(tunnel, lever, knob);
  // Cielo dell'abitacolo e pannelli interni delle porte (visibili solo dall'interno)
  const liner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.32, Math.max(0.6, gFront - gRear)), std(0x9a968e, { roughness: 1, side: THREE.DoubleSide }));
  liner.rotation.x = Math.PI / 2;
  liner.position.set(0, roofY - 0.07, (gFront + gRear) / 2);
  g.add(liner);
  for (const sx of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.6, gFront - gRear + 0.4), 0.5 * k), std(0x2a2b30, { roughness: 0.85, side: THREE.DoubleSide }));
    panel.rotation.y = Math.PI / 2;
    panel.position.set(sx * (W / 2 - 0.1), 0.68 * k, (gFront + gRear) / 2);
    g.add(panel);
  }
  const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: 0x9fb0bf, metalness: 0.9, roughness: 0.05 }));
  mirror.position.set(0, roofY - 0.16, gFront - 0.35);
  g.add(mirror);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  g.visible = false;
  return {
    group: g, wheel: spin, needle: needlePivot, radioTex, radioCanvasText: 'RADIO OFF',
    eye: new THREE.Vector3(driverX, 1.2 * k, dashZ - 0.98),
  };
}

/** Vespa: scocca a "goccia" con cofani laterali, scudo, faro tondo sul manubrio e parafango anteriore. */
function buildVespa(group, s, paint, black, chrome, headMat, tailMat, wheels, steerNodes) {
  const r = s.wheelR;
  const fw = twoWheel(r, 0.07);
  const rw = twoWheel(r, 0.08);
  const fHolder = new THREE.Group();
  fHolder.position.set(0, r, s.wheelBase / 2);
  fHolder.add(fw);
  rw.position.set(0, r, -s.wheelBase / 2);
  group.add(fHolder, rw);
  wheels.push({ node: fw, front: true }, { node: rw, front: false });
  steerNodes.push(fHolder);
  const parts = [];
  // Pedana e scudo anteriore curvo
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.55), paint);
  floor.position.set(0, 0.3, 0.08);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.78, 20, 1, true, -Math.PI * 0.45, Math.PI * 0.9), paint);
  shield.material = paint;
  shield.position.set(0, 0.68, 0.3);
  shield.rotation.x = -0.18;
  // Scocca posteriore con i due cofani laterali bombati
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), paint);
  body.scale.set(0.95, 0.7, 1.45);
  body.position.set(0, 0.52, -0.38);
  for (const sx of [-1, 1]) {
    const cowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), paint);
    cowl.scale.set(0.7, 0.8, 1.5);
    cowl.position.set(sx * 0.17, 0.46, -0.42);
    parts.push(cowl);
  }
  // Parafango anteriore sopra la ruota (gira con lo sterzo)
  const fender = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint);
  fender.scale.set(0.7, 0.6, 1.2);
  fender.position.set(0, 0.07, 0);
  fHolder.add(fender);
  // Sella lunga biposto e portapacchi cromato
  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 6, 12), black);
  seat.rotation.x = Math.PI / 2;
  seat.scale.set(1, 1, 0.55);
  seat.position.set(0, 0.79, -0.32);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.02, 0.22), chrome);
  rack.position.set(0, 0.76, -0.75);
  parts.push(floor, shield, body, seat, rack);
  parts.forEach((m) => { m.castShadow = true; group.add(m); });
  // Sterzo: piantone, manubrio con faro tondo (gira con il manubrio, come sulle Vespa vere)
  const col = new THREE.Group();
  fHolder.add(col);
  tube(col, new THREE.Vector3(0, 0.05, -0.02), new THREE.Vector3(0, 0.78, -0.16), 0.032, paint);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.09), paint);
  bar.position.set(0, 0.8, -0.17);
  col.add(bar);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20), headMat);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, 0.8, -0.1);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.01, 8, 20), chrome);
  rim.position.set(0, 0.8, -0.075);
  col.add(lamp, rim);
  for (const sx of [-0.27, 0.27]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.1, 10), black);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(sx, 0.8, -0.17);
    col.add(grip);
  }
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.03), tailMat);
  tl.position.set(0, 0.62, -0.83);
  group.add(tl);
  // Specchietti tondi cromati, cresta sul parafango, targa e marmitta
  for (const sx of [-1, 1]) {
    tube(col, new THREE.Vector3(sx * 0.22, 0.8, -0.17), new THREE.Vector3(sx * 0.27, 1.0, -0.2), 0.006, chrome);
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 16), chrome);
    mirror.rotation.x = Math.PI / 2;
    mirror.position.set(sx * 0.28, 1.02, -0.2);
    col.add(mirror);
  }
  const crest = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.2), chrome);
  crest.position.set(0, 0.17, 0.02);
  fHolder.add(crest);
  const D = new DetailBatch();
  D.add(std(0xf2f2ee), new THREE.BoxGeometry(0.15, 0.1, 0.01), 0, 0.52, -0.85, -0.3, 0, 0);
  D.add(chrome, new THREE.CylinderGeometry(0.038, 0.045, 0.36, 12), -0.2, 0.3, -0.42, Math.PI / 2 - 0.15, 0, 0);
  D.add(chrome, new THREE.BoxGeometry(0.34, 0.015, 0.015), 0, 0.33, 0.35);
  D.build(group);
}

/**
 * Moto carenata: sportiva 1000 ("sport") oppure hypersport con compressore e alette ("hyper", Ninja H2R):
 * cupolino con doppio faro, plexiglass fumé, fianchetti, codone rialzato, telaio a traliccio verde (hyper),
 * forcella a steli dorati, semimanubri, dischi freno, forcellone e scarico laterale.
 */
function buildSportBike(group, s, paint, black, chrome, headMat, tailMat, wheels, steerNodes, hyper) {
  const r = s.wheelR;
  const fw = twoWheel(r, 0.07);
  const rw = twoWheel(r, hyper ? 0.095 : 0.085);
  const fHolder = new THREE.Group();
  fHolder.position.set(0, r, s.wheelBase / 2);
  fHolder.add(fw);
  rw.position.set(0, r, -s.wheelBase / 2);
  group.add(fHolder, rw);
  wheels.push({ node: fw, front: true }, { node: rw, front: false });
  steerNodes.push(fHolder);
  const smoke = new THREE.MeshPhysicalMaterial({ color: 0x10161d, roughness: 0.03, transparent: true, opacity: 0.55, clearcoat: 1 });
  const frameMat = std(hyper ? 0x3fbf3f : 0x2b2d31, { metalness: 0.6, roughness: 0.35 });
  const carbon = std(0x18191c, { metalness: 0.3, roughness: 0.3 });
  const gold = std(0xd6a73a, { metalness: 0.9, roughness: 0.25 });
  const parts = [];
  const add = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parts.push(m); return m; };
  // Cupolino e plexiglass
  const nose = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 22, 14), paint), 0, 0.8, 0.5);
  nose.scale.set(0.72, 0.78, 1.45);
  const screen = add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), smoke), 0, 0.95, 0.42, -1.0, 0, 0);
  screen.scale.set(0.68, 0.6, 1.1);
  // Fianchetti, pancia, serbatoio, sella, codone
  for (const sx of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.78), paint), sx * 0.19, 0.62, 0.18, 0, sx * 0.08, sx * -0.1);
    if (hyper) add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.1), carbon), sx * 0.25, 0.86, 0.5, 0, 0, sx * 0.25); // alette
    add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.02), black), sx * 0.24, 0.96, 0.43); // specchietti
  }
  add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.62), carbon), 0, 0.36, 0.05);
  const tank = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.26, 6, 12), paint), 0, 0.9, 0.12, Math.PI / 2 - 0.25, 0, 0);
  tank.scale.set(1, 1, 0.85);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.36), black), 0, 0.87, -0.28, 0.1, 0, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.55), paint), 0, 0.96, -0.62, -0.32, 0, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.42), std(0x2a2c30, { metalness: 0.7, roughness: 0.35 })), 0, 0.5, 0.05);
  // Fari: due proiettori nel cupolino; fanale e targa
  for (const sx of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.03), headMat), sx * 0.07, 0.79, 0.8, 0.25, 0, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.035, 0.03), tailMat), 0, 1.0, -0.9, -0.3, 0, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.11, 0.01), std(0xf2f2ee)), 0, 0.72, -0.98, -0.6, 0, 0);
  // Scarico: laterale e massiccio sulla H2R, corto sotto il codone sulla 1000
  if (hyper) add(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.55, 16), chrome), 0.2, 0.52, -0.42, Math.PI / 2 - 0.35, 0, 0);
  else add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.35, 14), black), 0.16, 0.42, -0.5, Math.PI / 2 - 0.15, 0, 0);
  parts.forEach((m) => { m.castShadow = true; group.add(m); });
  // Telaio a traliccio (verde Kawasaki sulla H2R) e forcellone
  for (const sx of [-1, 1]) {
    tube(group, new THREE.Vector3(sx * 0.15, 0.82, 0.42), new THREE.Vector3(sx * 0.16, 0.5, -0.18), 0.018, frameMat);
    tube(group, new THREE.Vector3(sx * 0.15, 0.82, 0.42), new THREE.Vector3(sx * 0.17, 0.82, -0.15), 0.016, frameMat);
    tube(group, new THREE.Vector3(sx * 0.17, 0.82, -0.15), new THREE.Vector3(sx * 0.16, 0.5, -0.18), 0.014, frameMat);
    tube(group, new THREE.Vector3(sx * 0.12, 0.45, -0.12), new THREE.Vector3(sx * 0.1, r, -s.wheelBase / 2), 0.026, hyper ? carbon : black);
  }
  // Sterzo: steli della forcella dorati, semimanubri e dischi freno (girano con il manubrio)
  const fork = new THREE.Group();
  fHolder.add(fork);
  for (const sx of [-1, 1]) {
    tube(fork, new THREE.Vector3(sx * 0.08, 0, 0), new THREE.Vector3(sx * 0.08, 0.55, -0.2), 0.024, gold);
    tube(fork, new THREE.Vector3(sx * 0.08, 0.53, -0.21), new THREE.Vector3(sx * 0.24, 0.5, -0.3), 0.014, black);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.008, 26), chrome);
    disc.rotation.z = Math.PI / 2;
    disc.position.x = sx * 0.075;
    fHolder.add(disc);
  }
}

/**
 * Costruisce il modello 3D.
 * Ritorna { group, wheels: [{ node, front }], steerNodes: [], lights: { head, tail }, crank, cockpit }
 */
export function buildVehicleMesh(kind, color, style = null) {
  const s = SPECS[kind];
  const group = new THREE.Group();
  const wheels = [];
  const steerNodes = [];
  let crank = null;
  let cockpit = null;
  // Vernice a due strati: base metallizzata + trasparente lucido (clearcoat) che riflette cielo e città
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25 });
  const black = std(0x16171a, { roughness: 0.5 });
  const chrome = std(0xd0d4d8, { metalness: 0.95, roughness: 0.2 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x141d28, metalness: 0, roughness: 0.02, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6, transparent: true, opacity: 0.86 });
  paint.userData.paint = true; // tuning: colore della carrozzeria
  glass.userData.glass = true; // tuning: vetri oscurati
  // Fari e fanali: sempre visibili (lente bianca / rossa); si "accendono" alzando l'emissione (vedi Vehicle.setLights)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xeef2f6, emissive: 0xfff2d6, emissiveIntensity: 0.05, roughness: 0.08, metalness: 0.2 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0606, emissive: 0xff1a1a, emissiveIntensity: 0.06, roughness: 0.15 });

  if (!s.ride) {
    const L = s.len, W = s.wid, k = s.h / 1.45;
    const rear = -L / 2, front = L / 2;
    const bodyPts = [
      [rear, 0.26], [rear, 0.74 * k], [rear + 0.22, 0.9 * k], [rear + (kind === 'suv' ? 0.4 : 0.9), 0.95 * k],
      [front - (kind === 'sport' ? 1.55 : 1.25), 0.95 * k], [front - 0.25, 0.8 * k], [front, 0.66 * k], [front, 0.26],
    ];
    const body = new THREE.Mesh(extrudeProfile(bodyPts, W - 0.12, 0.06), paint);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    const gRear = rear + (kind === 'suv' ? 0.4 : 0.9);
    const gFront = front - (kind === 'sport' ? 1.55 : 1.25);
    const roofY = s.h;
    const glassPts = [
      [gRear, 0.94 * k], [gRear + (kind === 'suv' ? 0.15 : 0.5), roofY - 0.05], [gFront - (kind === 'sport' ? 0.85 : 0.6), roofY - 0.04], [gFront, 0.94 * k],
    ];
    const cabin = new THREE.Mesh(extrudeProfile(glassPts, W - 0.34, 0.04), glass);
    group.add(cabin);
    const roofLen = (gFront - (kind === 'sport' ? 0.85 : 0.6)) - (gRear + (kind === 'suv' ? 0.15 : 0.5));
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.05, roofLen + 0.04), paint);
    roof.position.set(0, roofY - 0.01, (gRear + (kind === 'suv' ? 0.15 : 0.5) + gFront - (kind === 'sport' ? 0.85 : 0.6)) / 2);
    roof.castShadow = true;
    group.add(roof);
    cockpit = buildCockpit(L, W, k, gFront, gRear, roofY);
    // Paraurti, griglia, luci, targa, specchietti
    for (const z of [front + 0.04, rear - 0.04]) {
      const bump = new THREE.Mesh(new THREE.BoxGeometry(W - 0.02, 0.16, 0.12), black);
      bump.position.set(0, 0.34, z);
      group.add(bump);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(W * 0.45, 0.14, 0.02), black);
    grille.position.set(0, 0.55 * k, front + 0.07);
    group.add(grille);
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.04), headMat);
      // Oltre lo smusso della carrozzeria (bevel 6 cm), così fari e fanali sono sempre visibili
      hl.position.set(sx * (W / 2 - 0.3), 0.62 * k, front + 0.075);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.04), tailMat);
      tl.position.set(sx * (W / 2 - 0.28), 0.7 * k, rear - 0.075);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.07), paint);
      mirror.position.set(sx * (W / 2 + 0.04), 0.98 * k, gFront - 0.15);
      group.add(hl, tl, mirror);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.14), chrome);
      handle.position.set(sx * (W / 2 - 0.02), 0.82 * k, 0.1);
      group.add(handle);
    }
    for (const z of [front + 0.105, rear - 0.105]) {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.01), std(0xf2f2ee));
      plate.position.set(0, 0.36, z);
      group.add(plate);
    }
    const wb = L / 2 - 0.72;
    for (const [sx, sz, isFront] of [[-1, wb, true], [1, wb, true], [-1, -wb, false], [1, -wb, false]]) {
      const holder = new THREE.Group();
      holder.position.set(sx * (W / 2 - 0.13), s.wheelR, sz);
      const w = wheel(s.wheelR, 0.24, kind);
      holder.add(w);
      group.add(holder);
      wheels.push({ node: w, front: isFront });
      if (isFront) steerNodes.push(holder);
    }
    // ---- Dettagli carrozzeria (uniti per materiale) ----
    const D = new DetailBatch();
    const plastic = std(0x111214, { roughness: 0.75 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffa21f, emissive: 0xff7a00, emissiveIntensity: 0.25, roughness: 0.2 });
    const r = s.wheelR;
    const midZ = (gFront + gRear) / 2;
    const doors4 = kind === 'car' || kind === 'suv';
    for (const sx of [-1, 1]) {
      // Passaruota in plastica sopra ogni ruota
      for (const sz of [wb, -wb]) D.add(plastic, new THREE.TorusGeometry(r + 0.075, 0.045, 6, 18, Math.PI), sx * (W / 2 - 0.02), r, sz, 0, Math.PI / 2, 0);
      // Minigonne tra i passaruota
      D.add(plastic, new THREE.BoxGeometry(0.06, 0.1, Math.max(0.4, 2 * wb - 2 * (r + 0.16))), sx * (W / 2 - 0.005), 0.3, 0);
      // Montante centrale nero tra i finestrini
      D.add(plastic, new THREE.BoxGeometry(0.035, Math.max(0.2, roofY - 0.94 * k - 0.06), 0.11), sx * (W / 2 - 0.125), (0.94 * k + roofY) / 2, midZ + (kind === 'suv' ? -0.2 : 0.05));
      // Modanatura cromata sotto i finestrini
      D.add(chrome, new THREE.BoxGeometry(0.02, 0.022, Math.max(0.5, gFront - gRear)), sx * (W / 2 + 0.006), 0.93 * k, midZ);
      // Linee delle portiere
      const doorLines = doors4 ? [gFront - 0.05, midZ + 0.05, gRear + 0.2] : [gFront - 0.05, gRear + 0.35];
      for (const z of doorLines) D.add(plastic, new THREE.BoxGeometry(0.012, 0.52 * k, 0.014), sx * (W / 2 + 0.004), 0.62 * k, z);
      // Frecce anteriori e ripetitori laterali
      D.add(amber, new THREE.BoxGeometry(0.09, 0.05, 0.03), sx * (W / 2 - 0.09), 0.6 * k, front + 0.075);
      D.add(amber, new THREE.BoxGeometry(0.02, 0.03, 0.08), sx * (W / 2 + 0.008), 0.76 * k, front - 0.62);
      // Fendinebbia nel paraurti (si accendono con i fari)
      D.add(headMat, new THREE.CylinderGeometry(0.045, 0.045, 0.03, 14), sx * (W / 2 - 0.32), 0.33, front + 0.105, Math.PI / 2, 0, 0);
      // Spazzole tergicristallo
      D.add(plastic, new THREE.BoxGeometry(0.48, 0.014, 0.02), sx * 0.27, 0.955 * k, gFront - 0.06, 0, 0, sx * 0.08);
    }
    // Scarico (doppio sulle sportive), antenna, estrattore posteriore e barre sul tetto del SUV
    const pipes = kind === 'sport' ? [-0.35, -0.22, 0.22, 0.35] : [W / 2 - 0.4];
    for (const x of pipes) D.add(chrome, new THREE.CylinderGeometry(0.042, 0.048, 0.16, 12), x, 0.26, rear - 0.1, Math.PI / 2, 0, 0);
    D.add(plastic, new THREE.CylinderGeometry(0.006, 0.01, 0.32, 6), 0, roofY + 0.15, gRear + 0.45, -0.35, 0, 0);
    if (kind === 'sport') D.add(plastic, new THREE.BoxGeometry(W * 0.8, 0.06, 0.2), 0, 0.22, rear - 0.05, -0.25, 0, 0);
    if (kind === 'suv') for (const sx of [-1, 1]) D.add(chrome, new THREE.BoxGeometry(0.04, 0.05, roofLen * 0.95), sx * (W / 2 - 0.25), roofY + 0.04, roof.position.z);
    if (kind === 'sport') D.add(paint, new THREE.BoxGeometry(W * 0.75, 0.03, 0.22), 0, 0.97 * k + 0.08, rear + 0.12, 0.12, 0, 0); // spoiler
    D.build(group);
  } else if (kind === 'moto' && (style === 'sport' || style === 'hyper')) {
    buildSportBike(group, s, paint, black, chrome, headMat, tailMat, wheels, steerNodes, style === 'hyper');
  } else if (kind === 'moto') {
    const r = s.wheelR;
    const fw = twoWheel(r, 0.065);
    const rw = twoWheel(r, 0.075);
    const fHolder = new THREE.Group();
    fHolder.position.set(0, r, s.wheelBase / 2);
    fHolder.add(fw);
    rw.position.set(0, r, -s.wheelBase / 2);
    group.add(fHolder, rw);
    wheels.push({ node: fw, front: true }, { node: rw, front: false });
    steerNodes.push(fHolder);
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 6, 12), paint);
    tank.rotation.x = Math.PI / 2 - 0.15;
    tank.scale.set(1, 1, 0.85);
    tank.position.set(0, 0.86, 0.22);
    tank.castShadow = true;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.62), black);
    seat.position.set(0, 0.82, -0.3);
    seat.rotation.x = 0.08;
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.4), std(0x3a3d42, { metalness: 0.7, roughness: 0.35 }));
    engine.position.set(0, 0.48, 0.05);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.4), paint);
    tail.position.set(0, 0.86, -0.7);
    tail.rotation.x = -0.25;
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 12), chrome);
    exhaust.rotation.x = Math.PI / 2 - 0.2;
    exhaust.position.set(0.18, 0.42, -0.45);
    group.add(tank, seat, engine, tail, exhaust);
    const fork = new THREE.Group();
    fHolder.add(fork);
    for (const sx of [-0.08, 0.08]) tube(fork, new THREE.Vector3(sx, 0, 0), new THREE.Vector3(sx, 0.62, -0.22), 0.022, chrome);
    tube(fork, new THREE.Vector3(-0.32, 0.72, -0.27), new THREE.Vector3(0.32, 0.72, -0.27), 0.016, black);
    const light = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 16), headMat);
    light.rotation.x = Math.PI / 2;
    light.position.set(0, 0.55, -0.1);
    fork.add(light);
    tube(group, new THREE.Vector3(0, 0.75, 0.45), new THREE.Vector3(0, r, -s.wheelBase / 2), 0.035, black);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.03), tailMat);
    tl.position.set(0, 0.84, -0.92);
    group.add(tl);
    // Dettagli: radiatore, pedane, catena, forcellone, targa, specchietti e dischi freno
    const D = new DetailBatch();
    D.add(std(0x1c1d20, { metalness: 0.5, roughness: 0.45 }), new THREE.BoxGeometry(0.34, 0.26, 0.05), 0, 0.62, 0.36, -0.2, 0, 0);
    for (const sx of [-1, 1]) {
      D.add(black, new THREE.BoxGeometry(0.12, 0.025, 0.04), sx * 0.2, 0.36, -0.2);
      D.add(black, new THREE.BoxGeometry(0.03, 0.05, 0.75), sx * 0.11, r + 0.02, -0.36, 0.08, 0, 0);
    }
    D.add(std(0x2b2b2e, { metalness: 0.7, roughness: 0.4 }), new THREE.BoxGeometry(0.02, 0.05, 0.8), 0.15, r + 0.04, -0.34);
    D.add(std(0xf2f2ee), new THREE.BoxGeometry(0.18, 0.12, 0.01), 0, 0.7, -0.96, -0.5, 0, 0);
    D.build(group);
    for (const sx of [-1, 1]) {
      tube(fork, new THREE.Vector3(sx * 0.3, 0.73, -0.27), new THREE.Vector3(sx * 0.33, 0.9, -0.3), 0.007, black);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), black);
      mirror.position.set(sx * 0.34, 0.92, -0.31);
      fork.add(mirror);
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.008, 24), chrome);
      disc.rotation.z = Math.PI / 2;
      disc.position.x = sx * 0.075;
      fHolder.add(disc);
    }
  } else if (kind === 'scooter' && style === 'vespa') {
    buildVespa(group, s, paint, black, chrome, headMat, tailMat, wheels, steerNodes);
  } else if (kind === 'scooter') {
    const r = s.wheelR;
    const fw = twoWheel(r, 0.07);
    const rw = twoWheel(r, 0.08);
    const fHolder = new THREE.Group();
    fHolder.position.set(0, r, s.wheelBase / 2);
    fHolder.add(fw);
    rw.position.set(0, r, -s.wheelBase / 2);
    group.add(fHolder, rw);
    wheels.push({ node: fw, front: true }, { node: rw, front: false });
    steerNodes.push(fHolder);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.6), paint);
    floor.position.set(0, 0.32, 0.05);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.1), paint);
    shield.position.set(0, 0.68, 0.42);
    shield.rotation.x = -0.25;
    const rearBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.42, 6, 12), paint);
    rearBody.rotation.x = Math.PI / 2;
    rearBody.scale.set(1, 1, 0.8);
    rearBody.position.set(0, 0.55, -0.42);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.6), black);
    seat.position.set(0, 0.76, -0.32);
    [floor, shield, rearBody, seat].forEach((m) => { m.castShadow = true; group.add(m); });
    const col = new THREE.Group();
    fHolder.add(col);
    tube(col, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.75, -0.12), 0.03, black);
    tube(col, new THREE.Vector3(-0.3, 0.8, -0.14), new THREE.Vector3(0.3, 0.8, -0.14), 0.016, black);
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), headMat);
    light.position.set(0, 0.72, -0.08);
    col.add(light);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.03), tailMat);
    tl.position.set(0, 0.6, -0.86);
    group.add(tl);
    // Specchietti sul manubrio, marmitta, targa e bauletto sotto sella
    for (const sx of [-1, 1]) {
      tube(col, new THREE.Vector3(sx * 0.26, 0.8, -0.14), new THREE.Vector3(sx * 0.3, 0.98, -0.16), 0.007, black);
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.02), black);
      mirror.position.set(sx * 0.31, 1.0, -0.16);
      col.add(mirror);
    }
    const D = new DetailBatch();
    D.add(chrome, new THREE.CylinderGeometry(0.04, 0.05, 0.42, 12), 0.17, 0.3, -0.5, Math.PI / 2 - 0.1, 0, 0);
    D.add(std(0xf2f2ee), new THREE.BoxGeometry(0.16, 0.1, 0.01), 0, 0.5, -0.9, -0.4, 0, 0);
    D.add(black, new THREE.BoxGeometry(0.3, 0.025, 0.5), 0, 0.71, -0.32);
    D.build(group);
  } else {
    // bicicletta
    const r = s.wheelR;
    const fw = twoWheel(r, 0.022);
    const rw = twoWheel(r, 0.022);
    const fHolder = new THREE.Group();
    fHolder.position.set(0, r, s.wheelBase / 2);
    fHolder.add(fw);
    rw.position.set(0, r, -s.wheelBase / 2);
    group.add(fHolder, rw);
    wheels.push({ node: fw, front: true }, { node: rw, front: false });
    steerNodes.push(fHolder);
    const frame = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1 });
    frame.userData.paint = true;
    const bb = new THREE.Vector3(0, r, 0.0);
    const seatTop = new THREE.Vector3(0, 0.88, -0.22);
    const head = new THREE.Vector3(0, 0.86, 0.38);
    const rearAx = new THREE.Vector3(0, r, -s.wheelBase / 2);
    tube(group, bb, seatTop, 0.02, frame);
    tube(group, bb, head, 0.022, frame);
    tube(group, seatTop, head, 0.02, frame);
    tube(group, bb, rearAx, 0.014, frame);
    tube(group, seatTop, rearAx, 0.014, frame);
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.25), black);
    saddle.position.set(0, 0.93, -0.24);
    group.add(saddle);
    const fork = new THREE.Group();
    fHolder.add(fork);
    tube(fork, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.6, -0.12), 0.016, chrome);
    tube(fork, new THREE.Vector3(-0.28, 0.66, -0.15), new THREE.Vector3(0.28, 0.66, -0.15), 0.014, black);
    // Guarnitura che gira con la pedalata: corona, pedivelle opposte e pedali
    crank = new THREE.Group();
    crank.position.copy(bb);
    const ringGear = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 16), chrome);
    ringGear.rotation.z = Math.PI / 2;
    ringGear.position.x = 0.04;
    crank.add(ringGear);
    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.03), chrome);
      arm.position.set(side * 0.07, -side * 0.085, 0);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), black);
      pedal.position.set(side * 0.12, -side * 0.17, 0);
      crank.add(arm, pedal);
    }
    group.add(crank);
    // Fanalino anteriore sul manubrio e catarifrangente/luce posteriore sotto la sella
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), headMat);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(0, 0.6, -0.05);
    fork.add(lamp);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), tailMat);
    rear.position.set(0, 0.8, -0.38);
    group.add(rear);
    // Parafanghi, catena e campanello
    const D = new DetailBatch();
    D.add(black, new THREE.TorusGeometry(r + 0.04, 0.012, 4, 16, Math.PI * 0.55), 0, r, -s.wheelBase / 2, 0, Math.PI / 2, Math.PI * 0.25);
    D.add(std(0x3a3c40, { metalness: 0.7, roughness: 0.4 }), new THREE.BoxGeometry(0.012, 0.03, s.wheelBase / 2), 0.05, r, -s.wheelBase / 4);
    D.build(group);
    const fender = new THREE.Mesh(new THREE.TorusGeometry(r + 0.04, 0.012, 4, 16, Math.PI * 0.5), black);
    fender.rotation.set(0, Math.PI / 2, Math.PI * 0.3);
    fHolder.add(fender);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), chrome);
    bell.position.set(-0.2, 0.68, -0.15);
    fork.add(bell);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (cockpit) group.add(cockpit.group);
  return { group, wheels, steerNodes, lights: { head: headMat, tail: tailMat }, crank, cockpit };
}

let UID = 1;

export class Vehicle {
  /**
   * @param {{ model: string, color?: number, x: number, z: number, heading?: number, owner?: 'player'|'npc'|'stolen', uid?: string }} o
   */
  constructor(scene, physics, o) {
    this.scene = scene;
    this.physics = physics;
    this.model = o.model;
    const def = VEHICLE_MODELS[o.model] || VEHICLE_MODELS.berlina;
    this.name = def.name;
    this.kind = def.kind;
    // Copia per veicolo (con le eventuali caratteristiche del modello, es. Vespa 50): il tuning modifica solo questo mezzo
    this.def = def;
    this.baseSpec = { ...SPECS[this.kind], ...(def.spec || {}) };
    this.spec = { ...this.baseSpec };
    this.color = o.color ?? def.colors[0];
    this.owner = o.owner || 'npc';
    this.uid = o.uid || `v${Date.now().toString(36)}${(UID++).toString(36)}`;
    const built = buildVehicleMesh(this.kind, this.color, def.style || null);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.steerNodes = built.steerNodes;
    this.lightMats = built.lights;
    this.crank = built.crank;
    this.cockpit = built.cockpit;
    this.lightLevel = -1;
    this.pedalPhase = 0;
    this.stoppie = 0;
    this.wheelieVel = 0;
    this.stoppieVel = 0;
    this.crash = null; // 'wheelie' | 'stoppie' quando il mezzo si ribalta
    this.fallen = false; // moto/motorino a terra dopo una caduta
    this.setLights(0, false);
    // Modello .glb opzionale (assets/models/manifest.json): sostituisce la carrozzeria procedurale
    this.glb = models.createVehicle(this.model, this.kind, this.spec, this.color);
    if (this.glb) {
      const keep = this.glb.replacesWheels ? [] : [...this.wheels.map((w) => w.node), ...this.steerNodes];
      for (const child of [...this.mesh.children]) {
        if (keep.some((n) => n === child || isDescendant(n, child))) continue;
        this.mesh.remove(child);
        disposeObject3D(child);
      }
      this.mesh.add(this.glb.root);
      if (this.glb.replacesWheels) {
        this.wheels = this.glb.wheels;
        this.steerNodes = this.glb.steerNodes;
      }
    }
    this.mesh.userData.vehicle = this; // per il raycast dei proiettili
    this.police = !!o.police;
    if (this.police) this.addPoliceLivery();
    scene.add(this.mesh);
    // Parti deformabili (carrozzeria, paraurti, luci): si piegano/spostano con gli urti
    // Per i .glb le parti sono dentro un nodo scalato: gli spostamenti vanno divisi per la scala (k)
    const parts = [];
    if (this.glb) {
      this.glb.root.traverse((o) => { if (o.isMesh && !this.wheels.some((w) => isDescendant(w.node, o))) parts.push(o); });
    } else {
      for (const c of this.mesh.children) if (c.isMesh && !this.wheels.some((w) => w.node === c)) parts.push(c);
    }
    const dk = this.glb ? 1 / this.glb.scale : 1;
    this.deformables = parts.map((m) => ({
      m, k: dk, pos: m.position.clone(), rot: m.rotation.clone(), off: new THREE.Vector3(), tilt: new THREE.Vector3(),
    }));
    this.health = THREE.MathUtils.clamp(o.health ?? 100, 0, 100);
    this.broken = this.health <= 0;
    this.wheelie = 0;
    this.looted = false;
    if (this.health < 100) this.applyDeformation(100 - this.health, true);

    const s = this.spec;
    this.body = new CANNON.Body({ mass: s.mass, allowSleep: false, linearDamping: 0.02, angularDamping: 0.6 });
    const sphereR = s.ride ? 0.28 : 0.32;
    if (s.ride) {
      this.body.addShape(new CANNON.Box(new CANNON.Vec3(0.2, (s.h - 0.45) / 2, s.len / 2 - 0.15)), new CANNON.Vec3(0, 0.45 + (s.h - 0.45) / 2, 0));
      for (const z of [s.wheelBase / 2, -s.wheelBase / 2]) this.body.addShape(new CANNON.Sphere(sphereR), new CANNON.Vec3(0, sphereR, z));
    } else {
      const chassisH = s.h - 0.32;
      this.body.addShape(new CANNON.Box(new CANNON.Vec3(s.wid / 2, chassisH / 2, s.len / 2)), new CANNON.Vec3(0, 0.32 + chassisH / 2, 0));
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        this.body.addShape(new CANNON.Sphere(sphereR), new CANNON.Vec3(sx * (s.wid / 2 - 0.3), sphereR, sz * (s.len / 2 - 0.7)));
      }
    }
    this.body.angularFactor.set(0, 1, 0);
    this.body.collisionFilterGroup = GROUPS.VEHICLE;
    this.body.collisionFilterMask = GROUPS.WORLD | GROUPS.PLAYER | GROUPS.NPC | GROUPS.VEHICLE;
    this.body.position.set(o.x, 0.25, o.z);
    this.body.quaternion.setFromEuler(0, o.heading || 0, 0);
    physics.addBody(this.body);

    this.speed = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.occupied = false;
    this.impact = 0;
    this.lean = 0;
    this.isStatic = false;
    this.settle = 0; // tempo per appoggiarsi al suolo prima di diventare statico
    // Cambio: automatico o manuale (impostazione), marcia e regime (0..1) per HUD e suono del motore
    this.gear = 1;
    this.rpm = 0;
    this.manual = false;
    // Garage di casa: il veicolo è custodito al chiuso (fuori dalla fisica finché non entri nel garage)
    this.inGarage = false;
    this.bay = Number.isInteger(o.bay) ? o.bay : -1;
    this.bayActive = false;
    this.bodyInWorld = true;
    this.tune = { ...DEFAULT_TUNE, ...(o.tune || {}) };
    this.dropApplied = 0;
    this.applyTune();
    if (o.inGarage) this.stash();
  }

  get gears() {
    return this.def.gears ?? (GEARS[this.kind] || 0);
  }

  /** Moto e motorini (impennata con equilibrio, stoppie, cadute). */
  get motorTwoWheel() {
    return this.kind === 'moto' || this.kind === 'scooter';
  }

  /**
   * Fari e fanali. level: 0 spenti (lenti visibili), 1 anabbaglianti, 2 abbaglianti; brake: luci di stop.
   * Cambia solo l'emissione dei materiali: nessuna luce aggiunta o tolta dalla scena.
   */
  setLights(level, brake = false) {
    const key = level * 2 + (brake ? 1 : 0);
    if (key === this.lightLevel || !this.lightMats) return;
    this.lightLevel = key;
    this.lightMats.head.emissiveIntensity = [0.05, 2.0, 4.2][level] || 0.05;
    this.lightMats.tail.emissiveIntensity = brake ? 3.2 : level > 0 ? 1.1 : 0.06;
  }

  /** Display della radio nell'abitacolo. */
  setRadioText(text) {
    const c = this.cockpit;
    if (!c || c.radioCanvasText === text) return;
    c.radioCanvasText = text;
    const canvas = c.radioTex.image;
    const g = canvas.getContext('2d');
    const src = radioCanvas(text);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(src, 0, 0);
    c.radioTex.needsUpdate = true;
  }

  /** Volante e tachimetro dell'abitacolo (prima persona). */
  updateCockpit(visible) {
    const c = this.cockpit;
    if (!c) return;
    c.group.visible = visible;
    if (!visible) return;
    c.wheel.rotation.z = -this.steer * 2.4;
    c.needle.rotation.z = Math.PI * 0.75 - Math.min(1, Math.abs(this.speed) / 70) * Math.PI * 1.5;
  }

  /** Traffico: corpo cinematico mosso dal gestore del traffico (spinge il giocatore, non viene spinto). */
  setKinematic() {
    const b = this.body;
    b.type = CANNON.Body.KINEMATIC;
    b.mass = 0;
    b.updateMassProperties();
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    this.isStatic = false;
    this.kinematic = true;
  }

  /** Etichetta della marcia per il tachimetro ('' se il mezzo non ha il cambio). */
  get gearLabel() {
    if (!this.gears) return '';
    if (this.speed < -0.3) return 'R';
    return String(this.gear);
  }

  /** Applica tuning: vernice, cerchi, vetri, assetto, neon, motore e freni. */
  applyTune() {
    const t = this.tune;
    const base = this.baseSpec;
    const eng = Math.max(0, Math.min(ENGINE_STAGES.length, t.engine || 0));
    const stage = eng ? ENGINE_STAGES[eng - 1] : { speed: 1, accel: 1 };
    this.spec.maxSpeed = base.maxSpeed * stage.speed;
    this.spec.accel = base.accel * stage.accel;
    this.spec.brake = base.brake * (t.brakes ? 1.22 : 1);
    this.spec.steer = base.steer * (t.lowered ? 1.08 : 1);
    this.mesh.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || !m.userData || m.userData.sharedAsset) continue;
        if (m.userData.paint) m.color.setHex(this.color);
        if (m.userData.rim) {
          if (m.userData.baseColor === undefined) m.userData.baseColor = m.color.getHex();
          m.color.setHex(t.rims ?? m.userData.baseColor);
        }
        if (m.userData.glass) {
          m.color.setHex(t.tint ? 0x05070a : 0x141d28);
          m.opacity = t.tint ? 0.96 : 0.86;
        }
      }
    });
    // Assetto ribassato: la carrozzeria scende di 4,5 cm (le ruote restano sul corpo fisico)
    const drop = t.lowered && !this.spec.ride ? 0.045 : 0;
    if (drop !== this.dropApplied && this.deformables) {
      for (const d of this.deformables) {
        d.pos.y -= (drop - this.dropApplied) * d.k;
        d.m.position.copy(d.pos).addScaledVector(d.off, d.k);
      }
      this.dropApplied = drop;
    }
    // Neon sottoscocca (solo auto): una superficie luminosa, nessuna luce aggiunta alla scena
    if (t.neon != null && !this.spec.ride) {
      if (!this.neonMesh) {
        const geo = new THREE.PlaneGeometry(this.spec.wid + 0.5, this.spec.len * 0.95);
        geo.rotateX(-Math.PI / 2);
        this.neonMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: t.neon, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        this.neonMesh.position.y = 0.05;
        this.neonMesh.renderOrder = 3;
        this.mesh.add(this.neonMesh);
      }
      this.neonMesh.material.color.setHex(t.neon);
      this.neonMesh.visible = true;
    } else if (this.neonMesh) {
      this.neonMesh.visible = false;
    }
  }

  /** Custodito in garage: niente corpo fisico né mesh in città. */
  stash() {
    this.inGarage = true;
    this.bayActive = false;
    this.occupied = false;
    this.speed = 0;
    if (this.bodyInWorld) {
      this.physics.removeBody(this.body);
      this.bodyInWorld = false;
    }
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.set(-9000, -50, -9000);
    this.mesh.visible = false;
  }

  /** Posteggiato in un box del garage (coordinate mondo dell'interno). */
  placeInBay(x, z, heading) {
    this.inGarage = true;
    this.bayActive = true;
    this.speed = 0;
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.position.set(x, 0, z); // ruote appoggiate al pavimento del box (statico subito)
    this.body.quaternion.setFromEuler(0, heading, 0);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.interpolatedQuaternion.copy(this.body.quaternion);
    if (!this.bodyInWorld) {
      this.physics.addBody(this.body);
      this.bodyInWorld = true;
    }
    this.isStatic = false;
    this.makeStatic();
    this.mesh.visible = true;
  }

  /** Esce dal garage: torna un veicolo normale in città (il corpo resta nella fisica). */
  leaveGarage() {
    this.inGarage = false;
    this.bayActive = false;
    this.bay = -1;
    if (!this.bodyInWorld) {
      this.physics.addBody(this.body);
      this.bodyInWorld = true;
    }
    this.mesh.visible = true;
  }

  /** Sposta il veicolo (fermo) in un punto della mappa. */
  teleport(x, z, heading, speed = 0) {
    const b = this.body;
    b.position.set(x, 0.25, z);
    b.quaternion.setFromEuler(0, heading, 0);
    b.velocity.set(Math.sin(heading) * speed, 0, Math.cos(heading) * speed);
    b.angularVelocity.set(0, 0, 0);
    b.previousPosition.copy(b.position);
    b.interpolatedPosition.copy(b.position);
    b.interpolatedQuaternion.copy(b.quaternion);
    this.speed = speed;
  }

  /** Il veicolo partecipa alla simulazione (non è custodito fuori scena). */
  get active() {
    return !this.inGarage || this.bayActive;
  }

  /** Volante della polizia: bande blu, scritta POLIZIA e lampeggianti sul tetto. */
  addPoliceLivery() {
    const s = this.spec;
    const k = s.h / 1.45;
    const blue = new THREE.MeshStandardMaterial({ color: 0x1d3f8f, roughness: 0.4, metalness: 0.3 });
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#1d3f8f'; g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#ffffff'; g.font = '700 64px Oswald, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('POLIZIA', 256, 52);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const textMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    for (const sx of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, s.len * 0.82), blue);
      stripe.position.set(sx * (s.wid / 2 + 0.005), 0.5 * k, 0);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.28), textMat);
      label.position.set(sx * (s.wid / 2 + 0.02), 0.72 * k, -0.2);
      label.rotation.y = sx * Math.PI / 2;
      this.mesh.add(stripe, label);
    }
    this.sirenRed = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff2020, emissiveIntensity: 0.2 });
    this.sirenBlue = new THREE.MeshStandardMaterial({ color: 0x000a40, emissive: 0x2a5bff, emissiveIntensity: 0.2 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    base.position.set(0, s.h + 0.04, -0.1);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), this.sirenRed);
    red.position.set(-0.28, s.h + 0.12, -0.1);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.26), this.sirenBlue);
    bl.position.set(0.28, s.h + 0.12, -0.1);
    this.mesh.add(base, red, bl);
    this.sirenOn = false;
    this.sirenT = 0;
  }

  /**
   * Danni da urto: la salute scende e la carrozzeria si deforma progressivamente.
   * @returns {number} danno effettivo
   */
  applyDamage(amount) {
    if (amount <= 0 || this.health <= 0) return 0;
    const before = this.health;
    this.health = Math.max(0, this.health - amount);
    this.applyDeformation(before - this.health);
    if (this.health <= 0) {
      this.broken = true;
      this.speed = 0;
    }
    return before - this.health;
  }

  /** Sposta e inclina in modo casuale alcune parti della carrozzeria (ammaccature). */
  applyDeformation(amount, silent = false) {
    const n = Math.max(1, Math.round(amount / 8));
    for (let i = 0; i < n && this.deformables.length; i++) {
      const d = this.deformables[Math.floor(Math.random() * this.deformables.length)];
      const k = Math.min(1, amount / 30) * (silent ? 0.6 : 1);
      d.off.x = THREE.MathUtils.clamp(d.off.x + (Math.random() - 0.5) * 0.05 * k, -0.08, 0.08);
      d.off.y = THREE.MathUtils.clamp(d.off.y - Math.random() * 0.04 * k, -0.08, 0.02);
      d.off.z = THREE.MathUtils.clamp(d.off.z + (Math.random() - 0.5) * 0.06 * k, -0.1, 0.1);
      d.tilt.x = THREE.MathUtils.clamp(d.tilt.x + (Math.random() - 0.5) * 0.12 * k, -0.18, 0.18);
      d.tilt.z = THREE.MathUtils.clamp(d.tilt.z + (Math.random() - 0.5) * 0.12 * k, -0.18, 0.18);
      d.m.position.copy(d.pos).addScaledVector(d.off, d.k);
      d.m.rotation.set(d.rot.x + d.tilt.x, d.rot.y, d.rot.z + d.tilt.z);
    }
  }

  /** Riparazione completa (officina). */
  repair() {
    this.health = 100;
    this.broken = false;
    for (const d of this.deformables) {
      d.off.set(0, 0, 0);
      d.tilt.set(0, 0, 0);
      d.m.position.copy(d.pos);
      d.m.rotation.copy(d.rot);
    }
  }

  /** Punto del motore (locale) da cui esce il fumo. */
  smokePoint() {
    const s = this.spec;
    return s.ride ? new THREE.Vector3(0, 0.55, 0.1) : new THREE.Vector3(0, s.h * 0.62, s.len / 2 - 0.7);
  }

  /** Parcheggiato: corpo statico (massa infinita), il giocatore non lo spinge più. */
  makeStatic() {
    if (this.isStatic) return;
    const b = this.body;
    b.velocity.set(0, 0, 0);
    b.angularVelocity.set(0, 0, 0);
    b.type = CANNON.Body.STATIC;
    b.mass = 0;
    b.updateMassProperties();
    b.aabbNeedsUpdate = true;
    this.isStatic = true;
    this.speed = 0;
  }

  /** Alla guida: corpo dinamico con la sua massa reale. */
  makeDynamic() {
    if (!this.isStatic) return;
    const b = this.body;
    b.type = CANNON.Body.DYNAMIC;
    b.mass = this.spec.mass;
    b.updateMassProperties();
    b.wakeUp();
    this.isStatic = false;
    this.settle = 0;
  }

  get heading() {
    const q = this.body.quaternion;
    return Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
  }

  get position() {
    return this.body.interpolatedPosition;
  }

  get locked() {
    return this.owner === 'npc';
  }

  /** Punto di discesa sul lato sinistro (lato guida). */
  exitPoint() {
    const h = this.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const lx = fz, lz = -fx;
    const d = this.spec.wid / 2 + 0.75;
    const p = this.body.position;
    return { x: p.x + lx * d, z: p.z + lz * d, facing: h };
  }

  /** Punto della sella in coordinate mondo (dove vanno appoggiate le anche del pilota). */
  seatPosition() {
    const h = this.heading;
    const p = this.position;
    const s = this.spec;
    return new THREE.Vector3(p.x + Math.sin(h) * s.seatZ, p.y + s.seatY, p.z + Math.cos(h) * s.seatZ);
  }

  /**
   * @param {number} dt
   * @param {{ throttle: boolean, brake: boolean, steer: number, handbrake: boolean } | null} ctl
   */
  update(dt, ctl) {
    if (ctl || this.occupied) this.makeDynamic();
    if (this.isStatic) return;
    if (!ctl && !this.occupied) {
      // Appena lasciato (o appena comparso): si ferma, si appoggia a terra e poi diventa statico
      this.settle += dt;
      if (this.settle > 0.8 && Math.abs(this.speed) < 0.15 && Math.abs(this.body.velocity.y) < 0.2) {
        this.makeStatic();
        return;
      }
    } else {
      this.settle = 0;
    }
    const s = this.spec;
    const h = this.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const v = this.body.velocity;
    const measured = v.x * fx + v.z * fz;
    const lost = Math.abs(this.speed) - Math.abs(measured);
    this.impact = (this.occupied || ctl) && lost > 6 ? lost : 0;
    // Danni progressivi in base alla forza dell'urto
    if (this.impact > 0) this.applyDamage((this.impact - 4) * (s.ride ? 3.2 : 2.4));
    let speed = measured;
    // Motore danneggiato: meno potenza e velocità; in panne non accelera più
    const power = this.broken ? 0 : this.health < 50 ? 0.45 + this.health / 100 : 1;
    const vmax = s.maxSpeed * (this.health < 50 ? 0.55 + this.health / 110 : 1);

    if (ctl) {
      // Impennata (Shift) su moto, motorini e bici: si alza la ruota anteriore
      if (this.motorTwoWheel) {
        // Impennata con equilibrio: tenendo SHIFT + gas il muso sale sempre più in fretta (instabile).
        // Va dosata a colpi di SHIFT: oltre l'angolo limite il mezzo si ribalta all'indietro ("ti schieni").
        const push = ctl.wheelie && ctl.throttle && speed > 3 && !this.broken && this.stoppie < 0.02;
        if (push) this.wheelieVel += (1.25 + this.wheelie * 2.4) * dt * (this.kind === 'moto' ? 1.15 : 1);
        else if (this.wheelie > 0) this.wheelieVel -= (1.9 + this.wheelie * 1.4) * dt; // la ruota torna giù gradualmente
        if (ctl.brake && this.wheelie > 0) this.wheelieVel -= 3.5 * dt; // freno posteriore: muso giù
        this.wheelieVel *= 1 - Math.min(1, dt * 1.6);
        this.wheelie += this.wheelieVel * dt;
        if (this.wheelie <= 0) { this.wheelie = 0; this.wheelieVel = Math.max(0, this.wheelieVel); }
        if (this.wheelie > (this.kind === 'moto' ? 1.12 : 0.98)) this.crash = 'wheelie';
        // Stoppie: CTRL + freno a velocità sostenuta solleva la ruota posteriore (anche qui serve equilibrio)
        const lift = ctl.stoppie && ctl.brake && speed > 4 && this.wheelie < 0.02;
        if (lift) this.stoppieVel += (2.4 + this.stoppie * 2.8) * dt * Math.min(1.5, speed / 7);
        else if (this.stoppie > 0) this.stoppieVel -= (2.6 + this.stoppie * 1.5) * dt;
        this.stoppieVel *= 1 - Math.min(1, dt * 1.8);
        this.stoppie += this.stoppieVel * dt;
        if (this.stoppie <= 0) { this.stoppie = 0; this.stoppieVel = Math.max(0, this.stoppieVel); }
        if (this.stoppie > 0.82) this.crash = 'stoppie';
        if (this.stoppie > 0.02) speed -= Math.sign(speed) * Math.min(Math.abs(speed), s.brake * 0.6 * dt);
      } else {
        // Bici: impennata semplice e sicura
        const wantWheelie = s.ride && ctl.wheelie && speed > 2.5;
        this.wheelie += ((wantWheelie ? 0.45 : 0) - this.wheelie) * Math.min(1, dt * (wantWheelie ? 2.6 : 4.5));
      }
      const steerIn = ctl.steer * (1 - Math.min(0.7, this.wheelie + this.stoppie));
      this.steer += (steerIn - this.steer) * Math.min(1, dt * (s.ride ? 9 : 6));
      // Cambio: in manuale E/Q cambiano marcia; in automatico la marcia segue la velocità
      const n = this.gears;
      if (n) {
        if (this.manual) {
          if (ctl.gearUp) this.gear = Math.min(n, this.gear + 1);
          if (ctl.gearDown) this.gear = Math.max(1, this.gear - 1);
        } else {
          let g = 1;
          while (g < n && speed > gearTop(g, n) * vmax * 0.92) g++;
          this.gear = g;
        }
      }
      const gTop = n ? gearTop(this.gear, n) * vmax : vmax;
      const gLow = n && this.gear > 1 ? gearTop(this.gear - 1, n) * vmax : 0;
      this.rpm = n ? THREE.MathUtils.clamp(Math.abs(speed) / Math.max(1, gTop), 0, 1) : Math.min(1, Math.abs(speed) / vmax);
      if (ctl.throttle && power > 0) {
        if (speed < -0.4) speed += s.brake * dt;
        else if (n && this.manual) {
          // Marcia troppo alta da fermo: il motore "strappa" e spinge poco; oltre il limite della marcia c'è il limitatore
          const lug = speed < gLow * 0.55 ? 0.35 : 1;
          const boost = 1.35 - 0.09 * (this.gear - 1);
          if (speed < gTop) speed = Math.min(gTop, speed + s.accel * power * dt * boost * lug * Math.max(0.2, 1 - speed / vmax));
          else speed -= 1.5 * dt;
        } else speed += s.accel * power * dt * Math.max(0.15, 1 - speed / vmax);
      } else if (n && this.manual && speed > gTop + 0.5 && !ctl.brake) {
        // Scalata con il mezzo veloce: freno motore
        speed -= 3.5 * dt;
      } else if (ctl.brake) {
        if (speed > 0.4) speed -= s.brake * dt;
        else speed -= s.reverseAccel * dt;
      } else {
        speed -= Math.sign(speed) * Math.min(Math.abs(speed), (1.2 + Math.abs(speed) * 0.06) * dt);
      }
      if (ctl.handbrake) speed -= Math.sign(speed) * Math.min(Math.abs(speed), s.brake * 1.4 * dt);
    } else {
      this.steer += (0 - this.steer) * Math.min(1, dt * 4);
      this.wheelie += (0 - this.wheelie) * Math.min(1, dt * 4);
      this.stoppie += (0 - this.stoppie) * Math.min(1, dt * 4);
      this.wheelieVel = this.stoppieVel = 0;
      speed -= Math.sign(speed) * Math.min(Math.abs(speed), 7 * dt);
    }
    speed = THREE.MathUtils.clamp(speed, -s.reverseMax, Math.max(vmax, Math.min(speed, s.maxSpeed)));
    // Moto e motorini sterzano di più alle alte velocità (piega): curva più reattiva e fluida
    const speedDamp = this.motorTwoWheel ? 1 + Math.abs(speed) / 50 : 1 + Math.abs(speed) / 30;
    const yawRate = this.steer * s.steer * (this.motorTwoWheel ? 1.18 : 1) * THREE.MathUtils.clamp(speed / 5, -1, 1) / speedDamp;
    v.x = fx * speed;
    v.z = fz * speed;
    if (v.y > 2) v.y = 2; // niente "salti" sui cordoli
    this.body.angularVelocity.set(0, Math.abs(speed) < 0.05 ? 0 : yawRate, 0);
    if (!ctl && Math.abs(speed) < 0.05) { v.x = 0; v.z = 0; }
    this.speed = speed;
    this.yawRate = yawRate;
  }

  sync(dt) {
    const p = this.body.interpolatedPosition;
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(this.body.interpolatedQuaternion.x, this.body.interpolatedQuaternion.y, this.body.interpolatedQuaternion.z, this.body.interpolatedQuaternion.w);
    if (this.spec.ride) {
      if (this.fallen) {
        // A terra su un fianco dopo una caduta (finché non lo rialzi con F)
        this.mesh.rotateZ(1.32);
        this.mesh.position.y += 0.05;
      } else {
        // Piega in curva stile MotoGP: molto marcata su moto e motorini, leggera sulla bici
        const maxLean = this.kind === 'moto' ? 0.88 : this.kind === 'scooter' ? 0.66 : 0.42;
        const leanK = this.motorTwoWheel ? 0.09 : 0.06;
        const targetLean = this.isStatic ? 0 : THREE.MathUtils.clamp(-(this.yawRate || 0) * this.speed * leanK, -maxLean, maxLean);
        this.lean += (targetLean - this.lean) * Math.min(1, dt * (this.motorTwoWheel ? 7.5 : 5));
        this.mesh.rotateZ(this.lean);
        const half = this.spec.wheelBase / 2;
        if (this.wheelie > 0.005) {
          // Impennata attorno all'asse posteriore
          this.mesh.translateZ(-half);
          this.mesh.rotateX(-this.wheelie);
          this.mesh.translateZ(half);
        } else if (this.stoppie > 0.005) {
          // Stoppie attorno all'asse anteriore
          this.mesh.translateZ(half);
          this.mesh.rotateX(this.stoppie);
          this.mesh.translateZ(-half);
        }
      }
      // Pedalata: la guarnitura gira con la velocità (rapporto ~1:2 rispetto alla ruota)
      if (this.crank) {
        this.pedalPhase += (Math.max(0, this.speed) / this.spec.wheelR) * dt * 0.5;
        this.crank.rotation.x = this.pedalPhase;
      }
    }
    this.wheelSpin += (this.speed / this.spec.wheelR) * dt;
    for (const w of this.wheels) w.node.rotation.x = this.wheelSpin;
    for (const n of this.steerNodes) n.rotation.y = this.steer * 0.45;
    if (this.police) {
      this.sirenT += dt;
      const on = this.sirenOn;
      const phase = Math.floor(this.sirenT * 6) % 2;
      this.sirenRed.emissiveIntensity = on ? (phase ? 3 : 0.2) : 0.2;
      this.sirenBlue.emissiveIntensity = on ? (phase ? 0.2 : 3) : 0.2;
    }
  }

  dispose() {
    if (this.bodyInWorld) this.physics.removeBody(this.body);
    this.bodyInWorld = false;
    this.scene.remove(this.mesh);
    if (this.glb) models.releaseMixer(this.glb.mixer);
    disposeObject3D(this.mesh); // salta geometrie/texture condivise dei .glb (userData.sharedAsset)
  }
}

/** true se `node` sta dentro `ancestor` nella gerarchia. */
function isDescendant(node, ancestor) {
  for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/** Fumo (grigio → nero) e fiammelle dai motori danneggiati: pool di sprite riutilizzati. */
export class SmokeFX {
  constructor(scene, count = 140) {
    this.scene = scene;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace; // texture di colore: sRGB
    this.group = new THREE.Group();
    scene.add(this.group);
    this.parts = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 }));
      s.visible = false;
      this.group.add(s);
      this.parts.push({ s, life: 0, max: 1, vel: new THREE.Vector3(), size: 1, fire: false });
    }
    this.next = 0;
  }

  emit(pos, damage, fire = false) {
    const p = this.parts[this.next];
    this.next = (this.next + 1) % this.parts.length;
    p.s.position.copy(pos);
    p.vel.set((Math.random() - 0.5) * 0.4, (fire ? 1.6 : 1.1) + Math.random() * 0.6, (Math.random() - 0.5) * 0.4);
    p.max = p.life = fire ? 0.45 : 1.8 + damage * 1.5;
    p.size = fire ? 0.35 : 0.5 + damage * 0.6;
    p.fire = fire;
    const shade = fire ? 1 : 0.75 - damage * 0.62;
    p.s.material.color.setRGB(fire ? 1 : shade, fire ? 0.55 : shade, fire ? 0.15 : shade);
    p.s.material.blending = fire ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.visible = true;
  }

  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.x += 0.25 * dt; // un filo di vento
      const sc = p.size * (1 + k * (p.fire ? 0.2 : 2.4));
      p.s.scale.set(sc, sc, sc);
      p.s.material.opacity = (p.fire ? 0.9 : 0.55) * (1 - k);
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const p of this.parts) p.s.material.dispose();
    this.tex.dispose();
  }
}

/** Gestisce tutti i veicoli: parcheggiati (non tuoi), acquistati, rubati. */
export class VehicleManager {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.list = [];
    this.smoke = new SmokeFX(scene);
    this._p = new THREE.Vector3();
  }

  /** Emette fumo/fuoco dai veicoli danneggiati vicini al punto di vista. */
  updateSmoke(dt, near, extra = []) {
    for (const v of [...this.list, ...extra]) {
      if (v.health >= 55 || !v.mesh.visible) continue;
      const p = v.body.position;
      if (near && Math.abs(p.x - near.x) + Math.abs(p.z - near.z) > 140) continue;
      const dmg = 1 - v.health / 55;
      v.smokeT = (v.smokeT || 0) - dt;
      if (v.smokeT <= 0) {
        v.smokeT = 0.32 - dmg * 0.22;
        this._p.copy(v.smokePoint());
        v.mesh.localToWorld(this._p);
        this.smoke.emit(this._p, dmg);
        if (v.health < 15) this.smoke.emit(this._p, dmg, true);
      }
    }
    this.smoke.update(dt);
  }

  add(opts) {
    const v = new Vehicle(this.scene, this.physics, opts);
    this.list.push(v);
    return v;
  }

  remove(v) {
    v.dispose();
    this.list = this.list.filter((x) => x !== v);
  }

  spawnParked(spots, rng) {
    const models = ['utilitaria', 'utilitaria', 'berlina', 'berlina', 'suv', 'sportiva', 'motorino', 'moto_naked', 'bici', 'vespa_primavera'];
    for (const [x, z, heading] of spots) {
      const model = models[Math.floor(rng() * models.length)];
      const colors = VEHICLE_MODELS[model].colors;
      this.add({ model, color: colors[Math.floor(rng() * colors.length)], x, z, heading, owner: 'npc' });
    }
  }

  spawnSaved(saved) {
    for (const s of saved) this.add({ ...s, owner: s.owner === 'stolen' ? 'stolen' : 'player' });
  }

  /** Veicolo più vicino entro maxDist dal bordo. */
  nearest(x, z, maxDist = 1.6) {
    let best = null;
    let bestD = Infinity;
    for (const v of this.list) {
      if (v.occupied || !v.active) continue;
      const p = v.body.position;
      const d = Math.hypot(p.x - x, p.z - z) - Math.max(v.spec.wid, v.spec.len * 0.5) * 0.5;
      if (d < maxDist && d < bestD) { bestD = d; best = v; }
    }
    return best;
  }

  update(dt, driven, ctl) {
    for (const v of this.list) if (v.active) v.update(dt, v === driven ? ctl : null);
  }

  sync(dt) {
    for (const v of this.list) if (v.active) v.sync(dt);
  }

  /** Veicoli custoditi nel garage di casa. */
  garaged() {
    return this.list.filter((v) => v.inGarage && (v.owner === 'player' || v.owner === 'stolen'));
  }

  serializeOwned() {
    return this.list
      .filter((v) => v.owner === 'player' || v.owner === 'stolen')
      .map((v) => ({
        uid: v.uid, model: v.model, color: v.color, owner: v.owner, health: Math.round(v.health),
        x: +v.body.position.x.toFixed(2), z: +v.body.position.z.toFixed(2), heading: +v.heading.toFixed(3),
        inGarage: v.inGarage, bay: v.bay, tune: { ...v.tune },
      }));
  }

  dispose() {
    for (const v of this.list) v.dispose();
    this.list = [];
    this.smoke.dispose();
  }
}
