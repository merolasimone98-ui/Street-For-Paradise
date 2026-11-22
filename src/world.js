import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ---------------------------------------------------------------------------
// Costanti condivise
// ---------------------------------------------------------------------------
export const GROUP = {
  STATIC: 1,
  PLAYER: 2,
};

export const CITY = {
  ROAD_W: 16,        // larghezza carreggiata (m)
  BLOCK: 60,         // lato di un isolato, marciapiede incluso (m)
  SIDEWALK_W: 5,     // larghezza marciapiede (m)
  CURB_H: 0.15,      // altezza del cordolo (m)
  GRID: 4,           // isolati per lato (4x4 = 16 isolati)
};

const PITCH = CITY.BLOCK + CITY.ROAD_W;
const HALF_CITY = (CITY.GRID * PITCH) / 2;
const OUTER_EDGE = HALF_CITY + CITY.ROAD_W / 2;   // bordo esterno delle strade perimetrali
const OUTER_WALK = 6;                              // marciapiede perimetrale
const WALL_T = 1;                                  // spessore muro di cinta

const FACADE_COLS = 8;
const FACADE_ROWS = 8;

function roadCenter(i) {
  return -HALF_CITY + i * PITCH;
}

function blockCenter(i) {
  return -HALF_CITY + PITCH / 2 + i * PITCH;
}

// ---------------------------------------------------------------------------
// Stili architettonici
// ---------------------------------------------------------------------------
const STYLES = {
  brick: {
    kind: 'brick',
    wall: '#6b3a2c',
    trim: '#b3a088',
    floorH: 3.4,
    colW: 3.0,
    lit: 0.28,
    floors: [4, 8],
    cornice: true,
    waterTower: 0.5,
  },
  brownstone: {
    kind: 'brownstone',
    wall: '#5a3f31',
    trim: '#82654f',
    floorH: 3.6,
    colW: 3.4,
    lit: 0.34,
    floors: [3, 5],
    cornice: true,
    waterTower: 0.35,
  },
  concrete: {
    kind: 'concrete',
    wall: '#7b7973',
    trim: '#98958d',
    floorH: 3.5,
    colW: 3.2,
    lit: 0.22,
    floors: [6, 14],
    cornice: false,
    waterTower: 0,
  },
  glass: {
    kind: 'glass',
    wall: '#1c2935',
    trim: '#4a5866',
    floorH: 3.8,
    colW: 3.0,
    lit: 0.36,
    floors: [14, 26],
    cornice: false,
    waterTower: 0,
  },
  deco: {
    kind: 'deco',
    wall: '#a6987e',
    trim: '#cbbd9f',
    floorH: 3.6,
    colW: 2.8,
    lit: 0.3,
    floors: [12, 22],
    cornice: false,
    tiered: true,
    waterTower: 0,
  },
};

// ---------------------------------------------------------------------------
// Utilità
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function addNoise(ctx, size, rng, amount) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

/** Moltiplica le UV di ogni faccia di una BoxGeometry (ordine: +x, -x, +y, -y, +z, -z). */
function scaleBoxUVs(geometry, faceScales) {
  const uv = geometry.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * faceScales[f][0], uv.getY(i) * faceScales[f][1]);
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Box con texture ripetuta ogni `meters` metri su tutte le facce. */
function tiledBoxGeometry(w, h, d, meters) {
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleBoxUVs(g, [
    [d / meters, h / meters],
    [d / meters, h / meters],
    [w / meters, d / meters],
    [w / meters, d / meters],
    [w / meters, h / meters],
    [w / meters, h / meters],
  ]);
}

/** Box di facciata: le finestre cadono su un numero intero di colonne e di piani. */
function facadeBoxGeometry(w, h, d, style) {
  const cols = (len) => Math.max(1, Math.round(len / style.colW)) / FACADE_COLS;
  const rows = h / style.floorH / FACADE_ROWS;
  const roofTile = 8;
  const g = new THREE.BoxGeometry(w, h, d);
  return scaleBoxUVs(g, [
    [cols(d), rows],
    [cols(d), rows],
    [w / roofTile, d / roofTile],
    [w / roofTile, d / roofTile],
    [cols(w), rows],
    [cols(w), rows],
  ]);
}

// ---------------------------------------------------------------------------
// Texture procedurali
// ---------------------------------------------------------------------------
function makeAsphaltCanvas(rng) {
  const S = 512;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2c2c2e';
  ctx.fillRect(0, 0, S, S);
  addNoise(ctx, S, rng, 34);

  // rattoppi
  for (let i = 0; i < 16; i++) {
    const v = 28 + Math.floor(rng() * 26);
    ctx.fillStyle = `rgba(${v},${v},${v + 3},0.35)`;
    ctx.beginPath();
    ctx.ellipse(rng() * S, rng() * S, 20 + rng() * 70, 12 + rng() * 40, rng() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // crepe
  ctx.strokeStyle = 'rgba(12,12,12,0.55)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) {
    let x = rng() * S;
    let y = rng() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rng() - 0.5) * 40;
      y += (rng() - 0.5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // macchie d'olio
  for (let i = 0; i < 10; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(8,8,10,0.45)');
    g.addColorStop(1, 'rgba(8,8,10,0)');
    ctx.save();
    ctx.translate(rng() * S, rng() * S);
    ctx.scale(10 + rng() * 25, 10 + rng() * 25);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return c;
}

function makeSidewalkCanvas(rng) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8b8882';
  ctx.fillRect(0, 0, S, S);
  addNoise(ctx, S, rng, 26);
  // lastre 2x2 m (la texture copre 4x4 m)
  ctx.strokeStyle = '#5f5c57';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * 128);
    ctx.lineTo(S, i * 128);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `rgba(40,36,32,${0.08 + rng() * 0.12})`;
    ctx.beginPath();
    ctx.arc(rng() * S, rng() * S, 4 + rng() * 14, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

function makeRoofCanvas(rng) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4744';
  ctx.fillRect(0, 0, S, S);
  addNoise(ctx, S, rng, 40);
  ctx.strokeStyle = 'rgba(20,20,20,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(0, i * 64 + 32);
    ctx.lineTo(S, i * 64 + 32);
    ctx.stroke();
  }
  return c;
}

function makeConcreteCanvas(rng) {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a968d';
  ctx.fillRect(0, 0, S, S);
  addNoise(ctx, S, rng, 30);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = `rgba(30,28,25,${0.05 + rng() * 0.08})`;
    ctx.fillRect(rng() * S, rng() * S * 0.6 + S * 0.4, 2 + rng() * 6, 20 + rng() * 60);
  }
  return c;
}

function makeGlowCanvas() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

const LIT_COLORS = ['#ffcf86', '#ffe0a6', '#f7b768', '#ffd9a0', '#c4d6ff'];

function makeFacadeCanvases(style, rng) {
  const S = 512;
  const cw = S / FACADE_COLS;
  const rh = S / FACADE_ROWS;

  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const e = makeCanvas(S, S);
  const ex = e.getContext('2d');

  ex.fillStyle = '#000000';
  ex.fillRect(0, 0, S, S);

  ctx.fillStyle = style.wall;
  ctx.fillRect(0, 0, S, S);
  addNoise(ctx, S, rng, 22);

  if (style.kind === 'brick' || style.kind === 'brownstone') {
    // corsi di mattoni / conci
    const course = style.kind === 'brick' ? 6 : 16;
    const brickW = style.kind === 'brick' ? 14 : 40;
    ctx.strokeStyle = style.kind === 'brick' ? 'rgba(35,18,12,0.35)' : 'rgba(30,20,15,0.25)';
    ctx.lineWidth = 1;
    for (let y = 0, row = 0; y < S; y += course, row++) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(S, y + 0.5);
      ctx.stroke();
      const off = row % 2 === 0 ? 0 : brickW / 2;
      for (let x = off; x < S; x += brickW) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, y);
        ctx.lineTo(x + 0.5, y + course);
        ctx.stroke();
      }
    }
  }

  if (style.kind === 'glass') {
    for (let row = 0; row < FACADE_ROWS; row++) {
      for (let col = 0; col < FACADE_COLS; col++) {
        const x = col * cw;
        const y = row * rh;
        const lit = rng() < style.lit;
        if (lit) {
          const lc = pick(rng, LIT_COLORS);
          ctx.fillStyle = lc;
          ctx.fillRect(x + 2, y + 2, cw - 4, rh - 12);
          ex.fillStyle = lc;
          ex.fillRect(x + 2, y + 2, cw - 4, rh - 12);
        } else {
          const g = ctx.createLinearGradient(x, y, x + cw, y + rh);
          g.addColorStop(0, '#1e2b37');
          g.addColorStop(0.55, '#3b5064');
          g.addColorStop(1, '#223140');
          ctx.fillStyle = g;
          ctx.fillRect(x + 2, y + 2, cw - 4, rh - 12);
        }
        // marcapiano e montanti
        ctx.fillStyle = '#141b22';
        ctx.fillRect(x, y + rh - 10, cw, 10);
        ctx.fillStyle = style.trim;
        ctx.fillRect(x, y, 2, rh);
      }
    }
  } else {
    for (let row = 0; row < FACADE_ROWS; row++) {
      for (let col = 0; col < FACADE_COLS; col++) {
        const x = col * cw;
        const y = row * rh;
        const wx = x + cw * 0.22;
        const ww = cw * 0.56;
        const wy = y + rh * 0.2;
        const wh = rh * 0.56;

        // davanzale e architrave
        ctx.fillStyle = style.trim;
        ctx.fillRect(wx - 3, wy + wh, ww + 6, 4);
        ctx.fillRect(wx - 2, wy - 5, ww + 4, 5);

        const lit = rng() < style.lit;
        if (lit) {
          const lc = pick(rng, LIT_COLORS);
          ctx.fillStyle = lc;
          ctx.fillRect(wx, wy, ww, wh);
          ex.fillStyle = lc;
          ex.fillRect(wx, wy, ww, wh);
          // tende
          if (rng() < 0.5) {
            const cwid = ww * (0.25 + rng() * 0.3);
            ctx.fillStyle = 'rgba(70,40,20,0.45)';
            ctx.fillRect(wx, wy, cwid, wh);
            ex.fillStyle = 'rgba(0,0,0,0.6)';
            ex.fillRect(wx, wy, cwid, wh);
          }
        } else {
          const g = ctx.createLinearGradient(wx, wy, wx, wy + wh);
          g.addColorStop(0, '#3a4550');
          g.addColorStop(1, '#161c22');
          ctx.fillStyle = g;
          ctx.fillRect(wx, wy, ww, wh);
          ctx.fillStyle = 'rgba(255,255,255,0.07)';
          ctx.beginPath();
          ctx.moveTo(wx, wy + wh * 0.6);
          ctx.lineTo(wx + ww * 0.5, wy);
          ctx.lineTo(wx + ww * 0.7, wy);
          ctx.lineTo(wx, wy + wh * 0.9);
          ctx.closePath();
          ctx.fill();
        }
        // telaio a croce
        ctx.fillStyle = 'rgba(22,20,18,0.85)';
        ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        ctx.fillRect(wx, wy + wh * 0.42, ww, 2);
        ex.fillStyle = '#000000';
        ex.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        ex.fillRect(wx, wy + wh * 0.42, ww, 2);
      }
      if (style.kind === 'concrete' || style.kind === 'deco') {
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fillRect(0, row * rh + rh - 4, S, 4);
      }
    }
    if (style.kind === 'deco') {
      // lesene verticali tipiche dell'art déco
      ctx.fillStyle = 'rgba(255,245,220,0.12)';
      for (let col = 0; col < FACADE_COLS; col++) {
        ctx.fillRect(col * cw, 0, 5, S);
      }
    }
  }

  // colature di sporco
  for (let i = 0; i < 45; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.04 + rng() * 0.05})`;
    ctx.fillRect(rng() * S, rng() * S, 2 + rng() * 4, 30 + rng() * 120);
  }

  return { color: c, emissive: e };
}

// ---------------------------------------------------------------------------
// Shader del cielo (tramonto nuvoloso)
// ---------------------------------------------------------------------------
const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;

    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    col = mix(col, uTop, smoothstep(0.18, 0.85, h));

    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(sd, 6.0) * 0.45 + pow(sd, 64.0) * 0.6);

    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.012, uTime * 0.005);
      float cl = fbm(uv * 1.4);
      cl = smoothstep(0.38, 0.75, cl);
      float rim = pow(sd, 3.0);
      vec3 cloudDark = vec3(0.16, 0.15, 0.17);
      vec3 cloudCol = mix(cloudDark, uSunColor * 0.85, rim * 0.85 + 0.12);
      col = mix(col, cloudCol, cl * smoothstep(0.0, 0.1, h) * 0.88);
    }

    col = mix(col, uHorizon, 1.0 - smoothstep(-0.08, 0.02, h));

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------
export class World {
  constructor(scene, physicsWorld, staticMaterial, options = {}) {
    this.scene = scene;
    this.physicsWorld = physicsWorld;
    this.staticMaterial = staticMaterial;
    this.maxAnisotropy = options.maxAnisotropy || 8;
    this.rng = mulberry32(1987);
    this.time = 0;
    this.buildingCount = 0;

    // Il giocatore nasce al centro di una strada, guardando verso un incrocio.
    this.spawnPoint = { x: roadCenter(2), y: 0.3, z: blockCenter(2), yaw: 0 };

    this._createMaterials();
    this._createAtmosphere();
    this._createGround();
    this._createBlocks();
    this._createRoadMarkings();
    this._createStreetLamps();
    this._createPerimeter();
    this._createSkyline();
  }

  // -------------------------------------------------------------------------
  // Materiali
  // -------------------------------------------------------------------------
  _texture(canvas, srgb = true) {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = this.maxAnisotropy;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  }

  _createMaterials() {
    const rng = this.rng;

    const asphaltMap = this._texture(makeAsphaltCanvas(rng));
    asphaltMap.repeat.set(1400 / 10, 1400 / 10);

    this.mat = {
      asphalt: new THREE.MeshStandardMaterial({ map: asphaltMap, roughness: 0.92, metalness: 0 }),
      sidewalk: new THREE.MeshStandardMaterial({ map: this._texture(makeSidewalkCanvas(rng)), roughness: 0.9 }),
      concrete: new THREE.MeshStandardMaterial({ map: this._texture(makeConcreteCanvas(rng)), roughness: 0.88 }),
      roof: new THREE.MeshStandardMaterial({ map: this._texture(makeRoofCanvas(rng)), roughness: 0.95 }),
      metal: new THREE.MeshStandardMaterial({ color: '#7f8386', roughness: 0.45, metalness: 0.5 }),
      darkMetal: new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.5, metalness: 0.6 }),
      wood: new THREE.MeshStandardMaterial({ color: '#5a3f2d', roughness: 0.85 }),
      lampHead: new THREE.MeshStandardMaterial({
        color: '#2a2a2a',
        emissive: '#ffc982',
        emissiveIntensity: 2.4,
        roughness: 0.5,
      }),
      lampGlow: new THREE.MeshBasicMaterial({
        map: this._texture(makeGlowCanvas()),
        color: '#ffae5c',
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
      paintWhite: new THREE.MeshStandardMaterial({
        color: '#d8d4c8',
        roughness: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
      paintYellow: new THREE.MeshStandardMaterial({
        color: '#c9a128',
        roughness: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    };

    // Materiali di facciata per ogni stile: [+x, -x, +y(tetto), -y, +z, -z]
    this.buildingMaterials = {};
    this.trimMaterials = {};
    for (const [key, style] of Object.entries(STYLES)) {
      const canv = makeFacadeCanvases(style, rng);
      const facade = new THREE.MeshStandardMaterial({
        map: this._texture(canv.color),
        emissive: '#ffffff',
        emissiveMap: this._texture(canv.emissive),
        emissiveIntensity: 0.95,
        roughness: style.kind === 'glass' ? 0.3 : 0.85,
        metalness: style.kind === 'glass' ? 0.25 : 0,
      });
      this.buildingMaterials[key] = [facade, facade, this.mat.roof, this.mat.roof, facade, facade];
      this.trimMaterials[key] = new THREE.MeshStandardMaterial({ color: style.trim, roughness: 0.8 });
    }
  }

  // -------------------------------------------------------------------------
  // Fisica: helper per corpi statici
  // -------------------------------------------------------------------------
  _newStaticBody() {
    return new CANNON.Body({
      mass: 0,
      type: CANNON.Body.STATIC,
      material: this.staticMaterial,
      collisionFilterGroup: GROUP.STATIC,
      collisionFilterMask: -1,
    });
  }

  /** Crea una mesh box e il corpo fisico Box identico, nella stessa posizione. */
  _addStaticBox(w, h, d, x, y, z, material, opts = {}) {
    const geometry = opts.geometry || new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = opts.receiveShadow !== false;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);

    const body = this._newStaticBody();
    body.addShape(new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)));
    body.position.set(x, y, z);
    this.physicsWorld.addBody(body);
    return { mesh, body };
  }

  /** Gruppo di mesh + corpo composto con shape identiche agli stessi offset. */
  _addStaticCompound(x, y, z, parts) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const body = this._newStaticBody();
    body.position.set(x, y, z);

    for (const p of parts) {
      let geometry;
      let shape;
      if (p.type === 'box') {
        geometry = new THREE.BoxGeometry(p.w, p.h, p.d);
        shape = new CANNON.Box(new CANNON.Vec3(p.w / 2, p.h / 2, p.d / 2));
      } else {
        const seg = p.segments || 12;
        geometry = new THREE.CylinderGeometry(p.rt, p.rb, p.h, seg);
        shape = new CANNON.Cylinder(p.rt, p.rb, p.h, seg);
      }
      const ox = p.ox || 0;
      const oy = p.oy || 0;
      const oz = p.oz || 0;
      const mesh = new THREE.Mesh(geometry, p.material);
      mesh.position.set(ox, oy, oz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      body.addShape(shape, new CANNON.Vec3(ox, oy, oz));
    }

    this.scene.add(group);
    this.physicsWorld.addBody(body);
    return { group, body };
  }

  // -------------------------------------------------------------------------
  // Atmosfera: luci, nebbia, cielo
  // -------------------------------------------------------------------------
  _createAtmosphere() {
    const fogColor = new THREE.Color('#6d605c');
    this.scene.background = fogColor.clone();
    this.scene.fog = new THREE.FogExp2(fogColor, 0.0042);

    const hemi = new THREE.HemisphereLight('#94a0b8', '#3a3029', 0.85);
    this.scene.add(hemi);

    this.sunDir = new THREE.Vector3(-0.62, 0.3, -0.5).normalize();
    this.sun = new THREE.DirectionalLight('#ffb27a', 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70;
    sc.right = 70;
    sc.top = 70;
    sc.bottom = -70;
    sc.near = 1;
    sc.far = 320;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.position.copy(this.sunDir).multiplyScalar(120);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uTop: { value: new THREE.Color('#262d3d') },
        uMid: { value: new THREE.Color('#6a6371') },
        uHorizon: { value: fogColor.clone() },
        uSunColor: { value: new THREE.Color('#ff9a55') },
        uSunDir: { value: this.sunDir.clone() },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  // -------------------------------------------------------------------------
  // Suolo
  // -------------------------------------------------------------------------
  _createGround() {
    const size = 1400;
    const geometry = new THREE.PlaneGeometry(size, size);
    geometry.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(geometry, this.mat.asphalt);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const body = this._newStaticBody();
    body.addShape(new CANNON.Plane());
    body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.physicsWorld.addBody(body);
  }

  // -------------------------------------------------------------------------
  // Isolati: marciapiedi + edifici
  // -------------------------------------------------------------------------
  _createBlocks() {
    const { BLOCK, CURB_H, GRID } = CITY;
    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = blockCenter(gx);
        const cz = blockCenter(gz);
        this._addStaticBox(BLOCK, CURB_H, BLOCK, cx, CURB_H / 2, cz, this.mat.sidewalk, {
          geometry: tiledBoxGeometry(BLOCK, CURB_H, BLOCK, 4),
          castShadow: false,
        });
        this._populateBlock(cx, cz);
      }
    }
  }

  _populateBlock(cx, cz) {
    const rng = this.rng;
    const inner = CITY.BLOCK - CITY.SIDEWALK_W * 2;
    const gap = 2;
    const lots = [];
    const r = rng();

    if (r < 0.18) {
      lots.push({ x: cx, z: cz, w: inner, d: inner, size: 'big' });
    } else if (r < 0.44) {
      const half = (inner - gap) / 2;
      const alongX = rng() < 0.5;
      for (const s of [-1, 1]) {
        const off = s * (half / 2 + gap / 2);
        if (alongX) lots.push({ x: cx + off, z: cz, w: half, d: inner, size: 'half' });
        else lots.push({ x: cx, z: cz + off, w: inner, d: half, size: 'half' });
      }
    } else if (r < 0.74) {
      const q = (inner - gap) / 2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          lots.push({ x: cx + sx * (q / 2 + gap / 2), z: cz + sz * (q / 2 + gap / 2), w: q, d: q, size: 'quarter' });
        }
      }
    } else {
      // file di case a schiera: 2 file da 3 lotti
      const alongX = rng() < 0.5;
      const rowDepth = (inner - gap) / 2;
      const lotW = (inner - gap * 2) / 3;
      for (const s of [-1, 1]) {
        for (let i = -1; i <= 1; i++) {
          const a = i * (lotW + gap);
          const b = s * (rowDepth / 2 + gap / 2);
          if (alongX) lots.push({ x: cx + a, z: cz + b, w: lotW, d: rowDepth, size: 'small' });
          else lots.push({ x: cx + b, z: cz + a, w: rowDepth, d: lotW, size: 'small' });
        }
      }
    }

    const choices = {
      big: ['glass', 'deco', 'concrete', 'glass'],
      half: ['concrete', 'deco', 'brick', 'glass'],
      quarter: ['brick', 'concrete', 'brownstone', 'glass', 'brick'],
      small: ['brownstone', 'brick', 'brownstone'],
    };

    for (const lot of lots) {
      const style = pick(rng, choices[lot.size]);
      const inset = lot.size === 'small' ? 0.3 : 0.4 + rng() * 1.6;
      this._createBuilding(lot.x, lot.z, lot.w - inset * 2, lot.d - inset * 2, style, CITY.CURB_H, true);
    }
  }

  _createBuilding(x, z, w, d, styleKey, baseY, details) {
    const rng = this.rng;
    const style = STYLES[styleKey];
    const mats = this.buildingMaterials[styleKey];
    const trim = this.trimMaterials[styleKey];
    const floors = style.floors[0] + Math.floor(rng() * (style.floors[1] - style.floors[0] + 1));

    let y = baseY;
    let topW = w;
    let topD = d;

    if (style.tiered) {
      const f0 = Math.max(4, Math.round(floors * 0.55));
      const f1 = Math.max(3, Math.round(floors * 0.28));
      const f2 = Math.max(2, floors - f0 - f1);
      const tiers = [
        { f: f0, k: 1 },
        { f: f1, k: 0.74 },
        { f: f2, k: 0.5 },
      ];
      for (const t of tiers) {
        const tw = w * t.k;
        const td = d * t.k;
        const th = t.f * style.floorH;
        this._addStaticBox(tw, th, td, x, y + th / 2, z, mats, {
          geometry: facadeBoxGeometry(tw, th, td, style),
        });
        y += th;
        this._addStaticBox(tw + 0.5, 0.4, td + 0.5, x, y + 0.2, z, trim);
        y += 0.4;
        topW = tw;
        topD = td;
      }
      if (details) {
        // pinnacolo
        this._addStaticBox(0.9, 7, 0.9, x, y + 3.5, z, this.mat.darkMetal);
      }
    } else {
      const h = floors * style.floorH;
      this._addStaticBox(w, h, d, x, y + h / 2, z, mats, {
        geometry: facadeBoxGeometry(w, h, d, style),
      });
      y += h;
      if (style.cornice) {
        this._addStaticBox(w + 0.6, 0.6, d + 0.6, x, y + 0.3, z, trim);
        y += 0.6;
      }
    }

    if (details) {
      // unità di condizionamento sul tetto
      const acCount = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < acCount; i++) {
        const aw = 1.6 + rng() * 1.2;
        const ah = 1 + rng() * 0.6;
        const ad = 1.2 + rng() * 1;
        const ax = x + (rng() - 0.5) * Math.max(0, topW - aw - 2);
        const az = z + (rng() - 0.5) * Math.max(0, topD - ad - 2);
        this._addStaticBox(aw, ah, ad, ax, y + ah / 2, az, this.mat.metal);
      }
      // serbatoio dell'acqua in stile New York
      if (style.waterTower > 0 && rng() < style.waterTower && topW > 9 && topD > 9) {
        const tx = x + (rng() - 0.5) * (topW - 6);
        const tz = z + (rng() - 0.5) * (topD - 6);
        const legH = 2.2;
        const tankH = 2.8;
        this._addStaticCompound(tx, y, tz, [
          { type: 'box', w: 0.2, h: legH, d: 0.2, ox: -1, oy: legH / 2, oz: -1, material: this.mat.darkMetal },
          { type: 'box', w: 0.2, h: legH, d: 0.2, ox: 1, oy: legH / 2, oz: -1, material: this.mat.darkMetal },
          { type: 'box', w: 0.2, h: legH, d: 0.2, ox: -1, oy: legH / 2, oz: 1, material: this.mat.darkMetal },
          { type: 'box', w: 0.2, h: legH, d: 0.2, ox: 1, oy: legH / 2, oz: 1, material: this.mat.darkMetal },
          { type: 'cyl', rt: 1.45, rb: 1.45, h: tankH, oy: legH + tankH / 2, segments: 14, material: this.mat.wood },
          { type: 'cyl', rt: 0.25, rb: 1.6, h: 0.9, oy: legH + tankH + 0.45, segments: 14, material: this.mat.darkMetal },
        ]);
      }
    }

    this.buildingCount++;
  }

  // -------------------------------------------------------------------------
  // Segnaletica orizzontale (InstancedMesh, decalcomanie piatte sull'asfalto)
  // -------------------------------------------------------------------------
  _createRoadMarkings() {
    const { BLOCK, ROAD_W, GRID } = CITY;
    const white = [];
    const yellow = [];
    const halfSeg = BLOCK / 2;

    const addSegment = (alongZ, roadC, segC) => {
      // u = coordinata trasversale alla strada, v = coordinata lungo la strada
      const push = (arr, u, v, su, sv) => {
        if (alongZ) arr.push([roadC + u, segC + v, su, sv]);
        else arr.push([segC + v, roadC + u, sv, su]);
      };

      // doppia linea gialla centrale
      const lineLen = BLOCK - 2 * 5.2;
      push(yellow, -0.18, 0, 0.14, lineLen);
      push(yellow, 0.18, 0, 0.14, lineLen);

      // linee tratteggiate di corsia
      for (let v = -halfSeg + 7; v <= halfSeg - 10; v += 7) {
        push(white, -ROAD_W / 4, v + 1.5, 0.14, 3);
        push(white, ROAD_W / 4, v + 1.5, 0.14, 3);
      }

      for (const sgn of [-1, 1]) {
        // strisce pedonali
        const vc = sgn * (halfSeg - 2.0);
        const n = 12;
        const step = 1.2;
        for (let k = 0; k < n; k++) {
          const u = -((n - 1) * step) / 2 + k * step;
          push(white, u, vc, 0.55, 3);
        }
        // linea di arresto (guida a destra)
        const uSide = alongZ ? -sgn : sgn;
        push(white, (uSide * ROAD_W) / 4, sgn * (halfSeg - 4.4), ROAD_W / 2 - 0.4, 0.45);
      }
    };

    for (let i = 0; i <= GRID; i++) {
      const rc = roadCenter(i);
      for (let j = 0; j < GRID; j++) {
        const sc = blockCenter(j);
        addSegment(true, rc, sc);
        addSegment(false, rc, sc);
      }
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    const m4 = new THREE.Matrix4();

    const build = (arr, material) => {
      const im = new THREE.InstancedMesh(geometry, material, arr.length);
      arr.forEach(([x, z, sx, sz], i) => {
        m4.makeScale(sx, 1, sz);
        m4.setPosition(x, 0.012, z);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.scene.add(im);
    };

    build(white, this.mat.paintWhite);
    build(yellow, this.mat.paintYellow);
  }

  // -------------------------------------------------------------------------
  // Lampioni (InstancedMesh + un corpo composto per lampione)
  // -------------------------------------------------------------------------
  _createStreetLamps() {
    const { BLOCK, CURB_H, GRID } = CITY;
    const POLE_H = 6.2;
    const ARM_L = 2.2;
    const lamps = [];

    for (let gx = 0; gx < GRID; gx++) {
      for (let gz = 0; gz < GRID; gz++) {
        const cx = blockCenter(gx);
        const cz = blockCenter(gz);
        for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const tx = Math.abs(nz);
          const tz = Math.abs(nx);
          for (const t of [-15, 15]) {
            lamps.push({
              x: cx + nx * (BLOCK / 2 - 0.7) + tx * t,
              z: cz + nz * (BLOCK / 2 - 0.7) + tz * t,
              nx,
              nz,
            });
          }
        }
      }
    }

    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, POLE_H, 10);
    const armGeo = new THREE.BoxGeometry(ARM_L, 0.12, 0.12);
    const headGeo = new THREE.BoxGeometry(0.9, 0.2, 0.42);
    const glowGeo = new THREE.PlaneGeometry(11, 11);
    glowGeo.rotateX(-Math.PI / 2);

    const count = lamps.length;
    const poles = new THREE.InstancedMesh(poleGeo, this.mat.darkMetal, count);
    const arms = new THREE.InstancedMesh(armGeo, this.mat.darkMetal, count);
    const heads = new THREE.InstancedMesh(headGeo, this.mat.lampHead, count);
    const glows = new THREE.InstancedMesh(glowGeo, this.mat.lampGlow, count);

    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);

    lamps.forEach((l, i) => {
      const rotated = l.nz !== 0;
      q.setFromAxisAngle(yAxis, rotated ? Math.PI / 2 : 0);

      // palo
      pos.set(l.x, CURB_H + POLE_H / 2, l.z);
      m4.compose(pos, new THREE.Quaternion(), one);
      poles.setMatrixAt(i, m4);

      // braccio
      const armOff = new THREE.Vector3(l.nx * (ARM_L / 2), POLE_H - 0.15, l.nz * (ARM_L / 2));
      pos.set(l.x + armOff.x, CURB_H + armOff.y, l.z + armOff.z);
      m4.compose(pos, q, one);
      arms.setMatrixAt(i, m4);

      // testa luminosa
      const headOff = new THREE.Vector3(l.nx * (ARM_L - 0.1), POLE_H - 0.32, l.nz * (ARM_L - 0.1));
      pos.set(l.x + headOff.x, CURB_H + headOff.y, l.z + headOff.z);
      m4.compose(pos, q, one);
      heads.setMatrixAt(i, m4);

      // alone di luce sull'asfalto
      pos.set(l.x + l.nx * (ARM_L + 0.6), 0.02, l.z + l.nz * (ARM_L + 0.6));
      m4.compose(pos, new THREE.Quaternion(), one);
      glows.setMatrixAt(i, m4);

      // corpo fisico composto, identico alle mesh
      const body = this._newStaticBody();
      body.position.set(l.x, CURB_H, l.z);
      body.addShape(new CANNON.Cylinder(0.09, 0.13, POLE_H, 10), new CANNON.Vec3(0, POLE_H / 2, 0));
      body.addShape(
        new CANNON.Box(rotated ? new CANNON.Vec3(0.06, 0.06, ARM_L / 2) : new CANNON.Vec3(ARM_L / 2, 0.06, 0.06)),
        new CANNON.Vec3(armOff.x, armOff.y, armOff.z)
      );
      body.addShape(
        new CANNON.Box(rotated ? new CANNON.Vec3(0.21, 0.1, 0.45) : new CANNON.Vec3(0.45, 0.1, 0.21)),
        new CANNON.Vec3(headOff.x, headOff.y, headOff.z)
      );
      this.physicsWorld.addBody(body);
    });

    for (const im of [poles, arms, heads]) {
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = false;
      this.scene.add(im);
    }
    glows.instanceMatrix.needsUpdate = true;
    glows.frustumCulled = false;
    glows.renderOrder = 1;
    this.scene.add(glows);
  }

  // -------------------------------------------------------------------------
  // Perimetro: marciapiede esterno + muro di cinta
  // -------------------------------------------------------------------------
  _createPerimeter() {
    const { CURB_H } = CITY;
    const walkC = OUTER_EDGE + OUTER_WALK / 2;
    const outer = OUTER_EDGE + OUTER_WALK;

    // marciapiede esterno (nord/sud coprono gli angoli)
    for (const s of [-1, 1]) {
      const lenNS = outer * 2;
      this._addStaticBox(lenNS, CURB_H, OUTER_WALK, 0, CURB_H / 2, s * walkC, this.mat.sidewalk, {
        geometry: tiledBoxGeometry(lenNS, CURB_H, OUTER_WALK, 4),
        castShadow: false,
      });
      const lenEW = OUTER_EDGE * 2;
      this._addStaticBox(OUTER_WALK, CURB_H, lenEW, s * walkC, CURB_H / 2, 0, this.mat.sidewalk, {
        geometry: tiledBoxGeometry(OUTER_WALK, CURB_H, lenEW, 4),
        castShadow: false,
      });
    }

    // muro di cinta
    const wallH = 1.3;
    const wallC = outer + WALL_T / 2;
    for (const s of [-1, 1]) {
      const lenNS = (outer + WALL_T) * 2;
      this._addStaticBox(lenNS, wallH, WALL_T, 0, wallH / 2, s * wallC, this.mat.concrete, {
        geometry: tiledBoxGeometry(lenNS, wallH, WALL_T, 3),
      });
      const lenEW = outer * 2;
      this._addStaticBox(WALL_T, wallH, lenEW, s * wallC, wallH / 2, 0, this.mat.concrete, {
        geometry: tiledBoxGeometry(WALL_T, wallH, lenEW, 3),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Skyline lontano oltre il muro (con collider come ogni altra mesh)
  // -------------------------------------------------------------------------
  _createSkyline() {
    const rng = this.rng;
    const styles = ['concrete', 'brick', 'glass', 'deco', 'concrete', 'glass'];
    const limit = 200;
    for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let t = -limit; t <= limit; t += 30) {
        const w = 14 + rng() * 10;
        const d = 14 + rng() * 10;
        const dist = 190 + rng() * 60;
        const along = t + (rng() - 0.5) * 6;
        const x = ax !== 0 ? ax * dist : along;
        const z = az !== 0 ? az * dist : along;
        this._createBuilding(x, z, w, d, pick(rng, styles), 0, false);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Aggiornamento per frame
  // -------------------------------------------------------------------------
  update(dt, camera, focus) {
    this.time += dt;
    this.sky.material.uniforms.uTime.value = this.time;
    this.sky.position.copy(camera.position);

    // La luce solare segue il giocatore: ombre nitide ovunque nella città.
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
  }
}
