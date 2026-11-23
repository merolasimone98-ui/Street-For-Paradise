// Modelli glTF/GLB opzionali (Three.js r160 via CDN, niente bundler).
// Il gioco genera tutto via codice; se in assets/models/manifest.json sono elencati dei file .glb,
// questi sostituiscono la carrozzeria dei veicoli corrispondenti. Se un file manca o non si carica,
// resta il modello procedurale: il gioco non si blocca mai per un asset.
//
// Formato del manifest (vedi README.md):
// {
//   "vehicles": {
//     "berlina": { "file": "berlina.glb", "rotateY": 180, "paint": ["Paint", "Body"], "wheels": "model" }
//   }
// }
// - chiave: nome del modello (VEHICLE_MODELS in items.js) oppure tipo (car, car_small, suv, sport, moto, scooter, bike)
// - rotateY: gradi per far guardare il muso verso +Z (default 0)
// - paint: nomi dei materiali da colorare con la tinta del veicolo (default nessuno)
// - wheels: "model" = usa le ruote del file (nodi con "wheel" nel nome), "procedural" = ruote del gioco (default)
// - fit: "length" (default) scala il modello alla lunghezza del corpo fisico
import * as THREE from 'three';

const THREE_CDN = 'https://unpkg.com/three@0.160.0/examples/jsm/';
const BASE = 'assets/models/';

class ModelLibrary {
  constructor() {
    this.entries = new Map(); // chiave -> { template, cfg, clips }
    this.mixers = new Set();
    this.loader = null;
    this.SkeletonUtils = null;
    this.ready = Promise.resolve();
  }

  /** Legge il manifest (se esiste) e carica i modelli elencati. Non lancia mai eccezioni. */
  load(renderer, manifestUrl = BASE + 'manifest.json') {
    this.ready = (async () => {
      let manifest = null;
      try {
        const res = await fetch(manifestUrl, { cache: 'no-cache' });
        if (res.ok) manifest = await res.json();
      } catch (e) {
        console.info('[modelli] nessun manifest: uso i modelli procedurali.');
      }
      if (manifest) await this.loadFromManifest(renderer, manifest, new URL(manifestUrl, location.href).href);
    })().catch((e) => console.warn('[modelli] caricamento interrotto:', e));
    return this.ready;
  }

  /** Carica tutti i veicoli di un manifest già letto. `baseUrl` serve a risolvere i percorsi dei file. */
  async loadFromManifest(renderer, manifest, baseUrl = location.href) {
    const vehicles = manifest && manifest.vehicles ? Object.entries(manifest.vehicles) : [];
    if (!vehicles.length) return;
    await this.initLoader(renderer);
    if (!this.loader) return;
    await Promise.all(vehicles.map(async ([key, cfg]) => {
      if (!cfg || !cfg.file) return;
      try {
        const gltf = await this.loader.loadAsync(new URL(cfg.file, baseUrl).href);
        this.register(key, gltf, cfg);
      } catch (e) {
        console.warn(`[modelli] "${key}" (${cfg.file}) non caricato, resta il modello procedurale:`, e.message || e);
      }
    }));
  }

  /** Un solo GLTFLoader condiviso, con decoder DRACO, KTX2 e Meshopt della stessa release r160. */
  async initLoader(renderer) {
    if (this.loader) return;
    try {
      const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }, SkeletonUtils] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/loaders/DRACOLoader.js'),
        import('three/addons/loaders/KTX2Loader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
        import('three/addons/utils/SkeletonUtils.js'),
      ]);
      const draco = new DRACOLoader().setDecoderPath(THREE_CDN + 'libs/draco/gltf/');
      const ktx2 = new KTX2Loader().setTranscoderPath(THREE_CDN + 'libs/basis/');
      if (renderer) ktx2.detectSupport(renderer);
      this.loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
      this.SkeletonUtils = SkeletonUtils;
    } catch (e) {
      console.warn('[modelli] loader glTF non disponibile, resto sui modelli procedurali:', e);
      this.loader = null;
    }
  }

  /** Prepara il modello: orientamento, ombre, materiali condivisi marcati (non vanno liberati dai cloni). */
  register(key, gltf, cfg) {
    const template = gltf.scene;
    template.rotation.y = THREE.MathUtils.degToRad(cfg.rotateY || 0);
    template.updateMatrixWorld(true);
    template.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.userData.sharedAsset = true; // geometria/texture del file: condivise fra tutti i cloni
      for (const m of [].concat(o.material)) {
        if (!m) continue;
        m.userData.sharedAsset = true;
        for (const v of Object.values(m)) if (v && v.isTexture) v.userData.sharedAsset = true;
      }
    });
    const size = new THREE.Box3().setFromObject(template).getSize(new THREE.Vector3());
    console.info(`[modelli] "${key}" caricato: ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)} m, clip: [${gltf.animations.map((c) => c.name).join(', ')}]`);
    this.entries.set(key, { template, cfg, clips: gltf.animations });
  }

  /** Modello per un veicolo: prima per nome (es. "berlina"), poi per tipo (es. "car"). */
  vehicleEntry(model, kind) {
    return this.entries.get(model) || this.entries.get(kind) || null;
  }

  /**
   * Crea una copia del modello scalata e centrata sul corpo fisico del veicolo.
   * Ritorna { root, wheels: [{ node, front }], steerNodes, paintMats, mixer } oppure null.
   */
  createVehicle(model, kind, spec, color) {
    const entry = this.vehicleEntry(model, kind);
    if (!entry) return null;
    const { template, cfg, clips } = entry;
    // SkeletonUtils.clone: ogni copia ha il proprio scheletro (un .clone() normale lo condividerebbe)
    const inner = this.SkeletonUtils ? this.SkeletonUtils.clone(template) : template.clone(true);
    const root = new THREE.Group();
    root.add(inner);
    root.updateMatrixWorld(true);

    // Scala uniforme sulla lunghezza del corpo fisico, base a terra, centrato in X/Z
    const box = new THREE.Box3().setFromObject(inner);
    const size = box.getSize(new THREE.Vector3());
    const k = size.z > 1e-4 ? spec.len / size.z : 1;
    inner.scale.multiplyScalar(k);
    root.updateMatrixWorld(true);
    box.setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.x -= c.x;
    inner.position.z -= c.z;
    inner.position.y -= box.min.y;
    root.updateMatrixWorld(true);
    const wid = box.max.x - box.min.x;
    if (Math.abs(wid - spec.wid) / spec.wid > 0.2) {
      console.warn(`[modelli] "${model}": larghezza ${wid.toFixed(2)} m diversa dal corpo fisico (${spec.wid} m).`);
    }

    // Vernice: i materiali indicati si clonano per copia e prendono il colore del veicolo
    const paintNames = new Set([].concat(cfg.paint || []).map((n) => String(n).toLowerCase()));
    const paintMats = [];
    if (paintNames.size) {
      const cloned = new Map();
      inner.traverse((o) => {
        if (!o.isMesh) return;
        const swap = (m) => {
          if (!m || !paintNames.has((m.name || '').toLowerCase())) return m;
          if (!cloned.has(m)) {
            const p = m.clone();
            p.userData.sharedAsset = false;
            p.color.setHex(color);
            if (p.isMeshPhysicalMaterial) { p.clearcoat = Math.max(p.clearcoat, 1); p.clearcoatRoughness = Math.min(p.clearcoatRoughness, 0.05); }
            cloned.set(m, p);
            paintMats.push(p);
          }
          return cloned.get(m);
        };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      });
    }

    // Ruote del file: ogni ruota va sotto un perno centrato (rotazione pulita) e, davanti, sotto un perno di sterzo
    const wheels = [];
    const steerNodes = [];
    if (cfg.wheels === 'model') {
      const found = [];
      inner.traverse((o) => {
        if (/wheel|ruota/i.test(o.name) && !found.some((f) => isAncestor(f, o))) found.push(o);
      });
      for (const w of found) {
        const wb = new THREE.Box3().setFromObject(w);
        const center = wb.getCenter(new THREE.Vector3());
        const local = root.worldToLocal(center.clone());
        const steer = new THREE.Object3D();
        steer.position.copy(local);
        root.add(steer);
        const spin = new THREE.Object3D();
        steer.add(spin);
        root.updateMatrixWorld(true);
        spin.attach(w); // conserva la posa del mondo
        const front = local.z > 0;
        wheels.push({ node: spin, front });
        if (front) steerNodes.push(steer);
      }
    }

    // Animazioni del file (es. luci, antenne): un mixer per copia, aggiornato da models.update(dt)
    let mixer = null;
    if (clips && clips.length) {
      mixer = new THREE.AnimationMixer(inner);
      const idle = THREE.AnimationClip.findByName(clips, cfg.clip || 'Idle') || clips[0];
      mixer.clipAction(idle).play();
      this.mixers.add(mixer);
    }
    return { root, wheels, steerNodes, paintMats, mixer, scale: k, replacesWheels: cfg.wheels === 'model' };
  }

  releaseMixer(mixer) {
    if (mixer) { mixer.stopAllAction(); this.mixers.delete(mixer); }
  }

  /** Avanza le animazioni dei modelli (delta in secondi). */
  update(dt) {
    for (const m of this.mixers) m.update(dt);
  }
}

function isAncestor(a, b) {
  for (let p = b.parent; p; p = p.parent) if (p === a) return true;
  return false;
}

export const models = new ModelLibrary();
