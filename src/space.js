// Scena spaziale condivisa: sfondo del menu + zoom universo -> Terra dell'intro.
import * as THREE from 'three';
import { tweens, Ease, lerp } from './tween.js';
import { seededRandom } from './birthdata.js';

const TEX_BASE = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/textures/planets/';

/** Lat/Lon -> vettore sulla sfera (stessa convenzione UV di SphereGeometry). */
export function latLonToVec3(lat, lon, r = 1) {
  const phi = THREE.MathUtils.degToRad(lon + 180);
  const theta = THREE.MathUtils.degToRad(90 - lat);
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
    r * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)'));
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- Texture procedurali di riserva (se il CDN non risponde) ---------- */
function makeNoise3(seed) {
  const rng = seededRandom(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) vals[i] = rng();
  const fade = (t) => t * t * (3 - 2 * t);
  const v = (X, Y, Z) => vals[perm[perm[perm[X & 255] + (Y & 255)] + (Z & 255)]];
  return (x, y, z) => {
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const xf = x - X, yf = y - Y, zf = z - Z;
    const u = fade(xf), w = fade(yf), s = fade(zf);
    const a = lerp(v(X, Y, Z), v(X + 1, Y, Z), u);
    const b = lerp(v(X, Y + 1, Z), v(X + 1, Y + 1, Z), u);
    const c = lerp(v(X, Y, Z + 1), v(X + 1, Y, Z + 1), u);
    const d = lerp(v(X, Y + 1, Z + 1), v(X + 1, Y + 1, Z + 1), u);
    return lerp(lerp(a, b, w), lerp(c, d, w), s);
  };
}

function fbm(noise, x, y, z, oct) {
  let sum = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += noise(x * f, y * f, z * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

function makeProceduralEarth() {
  const W = 1024, H = 512;
  const noise = makeNoise3(1337);
  const cloudNoise = makeNoise3(4242);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const colorC = mk(W, H), specC = mk(W, H), lightC = mk(W, H), cloudC = mk(W / 2, H / 2);
  const col = colorC.getContext('2d').createImageData(W, H);
  const spec = specC.getContext('2d').createImageData(W, H);
  const lights = lightC.getContext('2d').createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const lat = 90 - (y / H) * 180;
    const theta = THREE.MathUtils.degToRad(90 - lat);
    for (let x = 0; x < W; x++) {
      const phi = (x / W) * Math.PI * 2;
      const px = -Math.cos(phi) * Math.sin(theta), py = Math.cos(theta), pz = Math.sin(phi) * Math.sin(theta);
      const e = fbm(noise, px * 1.7 + 5, py * 1.7 + 5, pz * 1.7 + 5, 5);
      const m = fbm(noise, px * 3 + 20, py * 3 + 20, pz * 3 + 20, 3);
      const i = (y * W + x) * 4;
      let r, g, b, sp = 0, li = 0;
      const absLat = Math.abs(lat);
      if (e < 0.53) {
        const depth = (0.53 - e) / 0.53;
        r = lerp(32, 6, depth); g = lerp(88, 26, depth); b = lerp(140, 70, depth);
        sp = 255;
      } else {
        const h = (e - 0.53) / 0.47;
        const dry = Math.abs(absLat - 25) < 12 && m < 0.52;
        if (dry) { r = 196 - h * 50; g = 168 - h * 50; b = 110 - h * 40; }
        else { r = 52 + h * 90 + m * 30; g = 92 + h * 50; b = 42 + h * 30; }
        if (h > 0.45) { r = 120 + h * 80; g = 108 + h * 70; b = 96 + h * 70; }
        if (m > 0.55 && h < 0.4 && !dry) li = (fbm(noise, px * 40, py * 40, pz * 40, 2) > 0.6) ? 255 : 0;
      }
      if (absLat > 72 || (absLat > 62 && e > 0.5)) { r = 236; g = 240; b = 245; sp = 60; li = 0; }
      col.data[i] = r; col.data[i + 1] = g; col.data[i + 2] = b; col.data[i + 3] = 255;
      spec.data[i] = spec.data[i + 1] = spec.data[i + 2] = sp; spec.data[i + 3] = 255;
      lights.data[i] = li; lights.data[i + 1] = li * 0.8; lights.data[i + 2] = li * 0.5; lights.data[i + 3] = 255;
    }
  }
  colorC.getContext('2d').putImageData(col, 0, 0);
  specC.getContext('2d').putImageData(spec, 0, 0);
  lightC.getContext('2d').putImageData(lights, 0, 0);

  const cw = W / 2, ch = H / 2;
  const cl = cloudC.getContext('2d').createImageData(cw, ch);
  for (let y = 0; y < ch; y++) {
    const theta = (y / ch) * Math.PI;
    for (let x = 0; x < cw; x++) {
      const phi = (x / cw) * Math.PI * 2;
      const px = -Math.cos(phi) * Math.sin(theta), py = Math.cos(theta), pz = Math.sin(phi) * Math.sin(theta);
      const n = fbm(cloudNoise, px * 3 + 9, py * 6 + 9, pz * 3 + 9, 5);
      const a = THREE.MathUtils.smoothstep(n, 0.5, 0.72) * 255;
      const i = (y * cw + x) * 4;
      cl.data[i] = cl.data[i + 1] = cl.data[i + 2] = 255; cl.data[i + 3] = a;
    }
  }
  cloudC.getContext('2d').putImageData(cl, 0, 0);

  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(colorC, true), specular: tex(specC, false), lights: tex(lightC, true), clouds: tex(cloudC, true) };
}

function loadTexture(loader, url, srgb) {
  return new Promise((resolve, reject) => {
    loader.load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; resolve(t); }, undefined, reject);
  });
}

/* =========================================================== */

export class SpaceScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x010103);
    this.camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.02, 6000);
    this.time = 0;
    this.mode = 'menu';
    this.autoSpin = true;
    this.lookTarget = new THREE.Vector3();
    this.sunDir = new THREE.Vector3(-0.75, 0.32, 0.58).normalize();
    this._tmpV = new THREE.Vector3();

    this.buildStars();
    this.buildSun();
    this.buildEarth();
    this.ready = this.loadEarthTextures();
    this.setMenuMode();
  }

  /* ---------- Costruzione ---------- */
  buildStars() {
    const rng = seededRandom(777);
    const dot = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    this.dotTex = dot;
    const makeLayer = (count, size, spread, bandWeight) => {
      const pos = new Float32Array(count * 3);
      const col = new Float32Array(count * 3);
      const c = new THREE.Color();
      // Piano della Via Lattea inclinato
      const bandNormal = new THREE.Vector3(0.3, 1, 0.45).normalize();
      const v = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).normalize();
        if (rng() < bandWeight) {
          // Proietta verso il piano della galassia
          const d = v.dot(bandNormal);
          v.addScaledVector(bandNormal, -d * (0.85 + rng() * 0.15)).normalize();
        }
        const r = spread[0] + rng() * (spread[1] - spread[0]);
        pos[i * 3] = v.x * r; pos[i * 3 + 1] = v.y * r; pos[i * 3 + 2] = v.z * r;
        const t = rng();
        if (t < 0.15) c.setHSL(0.6, 0.6, 0.75 + rng() * 0.2);
        else if (t < 0.28) c.setHSL(0.08, 0.7, 0.75 + rng() * 0.2);
        else c.setHSL(0, 0, 0.7 + rng() * 0.3);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mat = new THREE.PointsMaterial({
        size, sizeAttenuation: false, map: dot, vertexColors: true,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      return pts;
    };
    this.stars = new THREE.Group();
    this.stars.add(makeLayer(9000, 1.6, [900, 2400], 0.55));
    this.stars.add(makeLayer(1400, 3.2, [900, 2400], 0.25));
    this.stars.add(makeLayer(160, 5.5, [900, 2400], 0.1));

    // Nebulose morbide
    const neb = [
      ['rgba(120,80,200,0.55)', new THREE.Vector3(-900, 300, -1400), 1400],
      ['rgba(60,120,220,0.45)', new THREE.Vector3(1200, -200, -1300), 1600],
      ['rgba(220,110,80,0.35)', new THREE.Vector3(200, 900, -1600), 1200],
      ['rgba(90,160,200,0.3)', new THREE.Vector3(-1500, -700, 600), 1500],
    ];
    for (const [color, p, s] of neb) {
      const mat = new THREE.SpriteMaterial({
        map: makeGlowTexture(color, 'rgba(0,0,0,0)', 256), transparent: true,
        depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
      });
      const spr = new THREE.Sprite(mat);
      spr.position.copy(p);
      spr.scale.setScalar(s);
      this.stars.add(spr);
    }
    this.scene.add(this.stars);
  }

  buildSun() {
    const sunMat = new THREE.SpriteMaterial({
      map: makeGlowTexture('rgba(255,240,210,1)', 'rgba(255,200,120,0)', 256),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sunSprite = new THREE.Sprite(sunMat);
    this.sunSprite.position.copy(this.sunDir).multiplyScalar(1600);
    this.sunSprite.scale.setScalar(260);
    this.scene.add(this.sunSprite);

    this.sunLight = new THREE.DirectionalLight(0xfff3e2, 3.0);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(10);
    this.scene.add(this.sunLight);
    this.scene.add(new THREE.AmbientLight(0x223355, 0.12));
  }

  buildEarth() {
    this.earthRoot = new THREE.Group();
    this.pivot = new THREE.Group();
    this.spin = new THREE.Group();
    this.earthRoot.add(this.pivot);
    this.pivot.add(this.spin);
    this.scene.add(this.earthRoot);

    this.sunViewUniform = { value: new THREE.Vector3(0, 0, 1) };

    this.earthMat = new THREE.MeshPhongMaterial({
      color: 0x1b3a66,
      specular: new THREE.Color(0x2a3c50),
      shininess: 42,
      emissive: new THREE.Color(0xffd9a0),
      emissiveIntensity: 0,
    });
    // Luci delle città visibili solo sul lato notturno.
    this.earthMat.onBeforeCompile = (shader) => {
      shader.uniforms.uSunView = this.sunViewUniform;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uSunView;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\n totalEmissiveRadiance *= smoothstep(0.12, -0.28, dot(normal, uSunView));',
        );
    };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), this.earthMat);
    this.spin.add(this.earth);

    this.cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.012, 96, 64), this.cloudMat);
    this.spin.add(this.clouds);

    // Alone atmosferico (lato posteriore, additivo)
    this.atmoMat = new THREE.ShaderMaterial({
      uniforms: { uSunView: this.sunViewUniform, uColor: { value: new THREE.Color(0x4f9dff) } },
      vertexShader: `
        varying vec3 vN; varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uSunView; uniform vec3 uColor;
        varying vec3 vN; varying vec3 vP;
        void main() {
          // d = 0 sul bordo esterno dell'alone, ~ -0.42 dove il raggio sfiora il pianeta
          float d = dot(vN, normalize(-vP));
          float intensity = pow(clamp(-d / 0.42, 0.0, 1.0), 3.0);
          float lit = 0.12 + 0.88 * smoothstep(-0.35, 0.45, dot(vN, uSunView));
          gl_FragColor = vec4(uColor * intensity * lit * 0.85, 1.0);
        }`,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), this.atmoMat);
    this.earthRoot.add(this.atmosphere);

    // Foschia frontale sul bordo del pianeta
    this.hazeMat = new THREE.ShaderMaterial({
      uniforms: { uSunView: this.sunViewUniform },
      vertexShader: `
        varying vec3 vN; varying vec3 vP;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vP = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uSunView;
        varying vec3 vN; varying vec3 vP;
        void main() {
          float f = pow(1.0 - max(dot(vN, normalize(-vP)), 0.0), 3.0);
          float lit = smoothstep(-0.25, 0.5, dot(vN, uSunView));
          gl_FragColor = vec4(vec3(0.35, 0.62, 1.0) * f * lit * 0.55, 1.0);
        }`,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    this.haze = new THREE.Mesh(new THREE.SphereGeometry(1.015, 64, 48), this.hazeMat);
    this.earthRoot.add(this.haze);

    // Marker di nascita
    this.marker = new THREE.Group();
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf0b43c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.markerRing = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.032, 48), ringMat);
    this.markerRing2 = new THREE.Mesh(new THREE.RingGeometry(0.024, 0.028, 48), ringMat.clone());
    const dotMat = new THREE.SpriteMaterial({ map: makeGlowTexture('rgba(255,200,90,1)', 'rgba(255,160,40,0)', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.markerDot = new THREE.Sprite(dotMat);
    this.markerDot.scale.setScalar(0.05);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    this.markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.004, 0.16, 8, 1, true), beamMat);
    this.markerBeam.rotation.x = Math.PI / 2;
    this.markerBeam.position.z = 0.08;
    this.marker.add(this.markerRing, this.markerRing2, this.markerDot, this.markerBeam);
    this.marker.visible = false;
    this.spin.add(this.marker);
  }

  async loadEarthTextures() {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000));
    try {
      const [map, spec, lights, clouds] = await Promise.race([
        Promise.all([
          loadTexture(loader, TEX_BASE + 'earth_atmos_2048.jpg', true),
          loadTexture(loader, TEX_BASE + 'earth_specular_2048.jpg', false),
          loadTexture(loader, TEX_BASE + 'earth_lights_2048.png', true),
          loadTexture(loader, TEX_BASE + 'earth_clouds_1024.png', true),
        ]),
        timeout,
      ]);
      this.applyEarthTextures(map, spec, lights, clouds);
    } catch (e) {
      console.warn('[SpaceScene] texture remote non disponibili, uso texture procedurali', e);
      const p = makeProceduralEarth();
      this.applyEarthTextures(p.map, p.specular, p.lights, p.clouds);
    }
  }

  applyEarthTextures(map, spec, lights, clouds) {
    const aniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    map.anisotropy = aniso;
    this.earthMat.map = map;
    this.earthMat.color.set(0xffffff);
    this.earthMat.specularMap = spec;
    this.earthMat.emissiveMap = lights;
    this.earthMat.emissiveIntensity = 1.3;
    this.earthMat.needsUpdate = true;
    this.cloudMat.map = clouds;
    this.cloudMat.alphaMap = null;
    this.cloudMat.opacity = 0.85;
    this.cloudMat.needsUpdate = true;
  }

  /* ---------- Modalità ---------- */
  setMenuMode() {
    tweens.cancelGroup('space');
    this.mode = 'menu';
    this.autoSpin = true;
    this.marker.visible = false;
    this.pivot.rotation.set(0.32, 0, 0);
    this.layoutMenu();
    this.camera.position.set(0, 0.1, 4.4);
    this.lookTarget.set(0, 0, 0);
    this.camera.up.set(0, 1, 0);
  }

  layoutMenu() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect > 1.1) this.earthRoot.position.set(1.45, -0.75, 0);
    else this.earthRoot.position.set(0.35, -1.25, 0);
  }

  /** Camera lontanissima: la Terra è un puntino tra le stelle. */
  setIntroStart() {
    tweens.cancelGroup('space');
    this.mode = 'intro';
    this.autoSpin = true;
    this.earthRoot.position.set(0, 0, 0);
    this.pivot.rotation.set(0.25, 0, 0);
    this.camera.position.set(40, 18, 320);
    this.lookTarget.set(0, 0, 0);
  }

  /** Zoom progressivo (logaritmico) dallo spazio profondo fino all'atmosfera. */
  zoomIn(duration = 8.5) {
    const start = this.camera.position.clone();
    const end = new THREE.Vector3(0, 0.05, 3.1);
    const ls = Math.log(start.length());
    const le = Math.log(end.length());
    const dirS = start.clone().normalize();
    const dirE = end.clone().normalize();
    const dir = new THREE.Vector3();
    return tweens.to({
      duration,
      ease: Ease.inOutCubic,
      group: 'space',
      update: (e) => {
        const r = Math.exp(lerp(ls, le, e));
        dir.copy(dirS).lerp(dirE, Ease.inOutSine(e)).normalize();
        this.camera.position.copy(dir).multiplyScalar(r);
        this.camera.up.set(Math.sin((1 - e) * 0.35), Math.cos((1 - e) * 0.35), 0);
      },
    });
  }

  /** Sposta la Terra a sinistra per far spazio al pannello di nascita. */
  toSelectLayout(duration = 1.4) {
    const fromPos = this.earthRoot.position.clone();
    const toPos = this.selectOffset();
    const camFrom = this.camera.position.clone();
    const wide = window.innerWidth / window.innerHeight > 1.15;
    const camTo = new THREE.Vector3(0, 0, wide ? 2.75 : 4.2);
    return tweens.to({
      duration,
      group: 'space',
      update: (e) => {
        this.earthRoot.position.lerpVectors(fromPos, toPos, e);
        this.camera.position.lerpVectors(camFrom, camTo, e);
        this.camera.up.set(0, 1, 0);
      },
    });
  }

  selectOffset() {
    const aspect = window.innerWidth / window.innerHeight;
    if (aspect > 1.15) return new THREE.Vector3(-0.62, 0, 0);
    // Schermi stretti: pianeta in alto, pannello in basso.
    return new THREE.Vector3(0, 0.95, 0);
  }

  /** Ruota il pianeta per portare la città scelta davanti alla camera. */
  focusOn(lat, lon, duration = 1.6) {
    this.autoSpin = false;
    const p = latLonToVec3(lat, lon, 1);
    const targetSpin = -Math.atan2(p.x, p.z);
    const curSpin = this.spin.rotation.y;
    let delta = (targetSpin - curSpin) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    // Almeno un piccolo giro per dare la sensazione di "ricerca".
    if (Math.abs(delta) < 0.6) delta += delta >= 0 ? Math.PI * 2 : -Math.PI * 2;
    const fromX = this.pivot.rotation.x;
    const toX = THREE.MathUtils.degToRad(lat);

    // Marker
    this.marker.visible = false;
    const mp = latLonToVec3(lat, lon, 1.004);
    this.marker.position.copy(mp);
    // Orienta l'asse +Z locale del marker lungo la normale della superficie (spazio locale di "spin").
    this.marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), mp.clone().normalize());

    return tweens.to({
      duration,
      ease: Ease.inOutCubic,
      group: 'space',
      update: (e) => {
        this.spin.rotation.y = curSpin + delta * e;
        this.pivot.rotation.x = lerp(fromX, toX, e);
        if (e > 0.85) this.marker.visible = true;
      },
    });
  }

  /** Tuffo verso la città: la camera attraversa l'atmosfera. */
  dive(duration = 2.4) {
    const fromPos = this.earthRoot.position.clone();
    const camFrom = this.camera.position.clone();
    const camTo = new THREE.Vector3(0, 0, 1.06);
    return tweens.to({
      duration,
      ease: Ease.inCubic,
      group: 'space',
      update: (e) => {
        this.earthRoot.position.lerpVectors(fromPos, new THREE.Vector3(0, 0, 0), Math.min(1, e * 1.6));
        this.camera.position.lerpVectors(camFrom, camTo, e);
      },
    });
  }

  /* ---------- Loop ---------- */
  update(dt) {
    this.time += dt;
    if (this.autoSpin) this.spin.rotation.y += dt * (this.mode === 'menu' ? 0.035 : 0.06);
    this.clouds.rotation.y += dt * 0.008;
    this.stars.rotation.y += dt * 0.002;

    if (this.mode === 'menu') {
      // Lenta deriva cinematografica
      const t = this.time;
      this.camera.position.set(Math.sin(t * 0.05) * 0.25, 0.1 + Math.sin(t * 0.07) * 0.12, 4.4 + Math.sin(t * 0.04) * 0.15);
      this.lookTarget.set(Math.sin(t * 0.05) * 0.1, 0, 0);
    }

    // Pulsazione del marker
    if (this.marker.visible) {
      const k = (this.time * 0.8) % 1;
      this.markerRing2.scale.setScalar(1 + k * 2.2);
      this.markerRing2.material.opacity = 0.8 * (1 - k);
      this.markerDot.scale.setScalar(0.07 + Math.sin(this.time * 5) * 0.008);
    }

    this.camera.lookAt(this.lookTarget);
    this.camera.updateMatrixWorld();
    this.sunViewUniform.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.mode === 'menu') this.layoutMenu();
  }
}
