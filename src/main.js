// Entry point: renderer condiviso, macchina a stati (menu -> intro -> gioco) e game loop.
import * as THREE from 'three';
import { SpaceScene } from './space.js';
import { Menu } from './menu.js';
import { Intro } from './intro.js';
import { Game } from './game.js';
import { tweens } from './tween.js';
import { $, fadeTo, setFade } from './ui.js';
import { audio } from './audio.js';
import { loadSettings, pixelRatioFor } from './settings.js';
import { models } from './models.js';

window.__SFP_BOOTED = true;

// Errori asincroni non gestiti: li registriamo senza bloccare il gioco.
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Street for Paradise] errore asincrono:', e.reason);
});

// Il gioco non deve mai restare con il mouse catturato fuori dal gameplay.
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement && app.state !== 'game') document.exitPointerLock();
});

function showBootError(message) {
  $('loading').style.display = 'none';
  $('boot-error-text').textContent = message;
  $('boot-error').classList.remove('hidden');
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('game-canvas'), antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  showBootError('WebGL non è disponibile su questo browser o dispositivo.');
  throw e;
}
renderer.setPixelRatio(pixelRatioFor(loadSettings().quality));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0; // il gioco la regola in base all'ora (DayCycle.exposure)
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const space = new SpaceScene(renderer);

/** Stati: 'loading' | 'menu' | 'intro' | 'transition' | 'game' */
const app = { state: 'loading', intro: null, game: null };

// Aggancio di debug (solo aprendo la pagina con #debug nell'URL)
if (location.hash === '#debug') { window.sfp = app; window.renderer = renderer; window.models = models; }

const menu = new Menu({
  onNewGame: (sex) => startNewGame(sex),
  onContinue: (save) => continueGame(save),
});

function startNewGame(sex) {
  app.intro = new Intro({
    renderer,
    space,
    onComplete: (character) => enterGame({ character, save: null }),
  });
  app.state = 'intro';
  app.intro.start(sex);
}

async function continueGame(save) {
  app.state = 'transition';
  await fadeTo(1, 0.5, '#000');
  enterGame({ character: null, save });
}

/** Da chiamare con lo schermo già coperto dal fade. */
async function enterGame({ character, save }) {
  if (app.intro) {
    app.intro.dispose();
    app.intro = null;
  }
  try {
    app.game = new Game({ renderer, character, save, onExitToMenu: () => backToMenu() });
  } catch (e) {
    console.error(e);
    app.game = null;
    space.setMenuMode();
    app.state = 'menu';
    menu.show();
    await fadeTo(0, 0.6);
    return;
  }
  app.game.resize(window.innerWidth, window.innerHeight);
  app.state = 'game';
  await fadeTo(0, 1.3);
}

async function backToMenu() {
  await fadeTo(1, 0.6, '#000');
  audio.stopAllLoops();
  if (app.game) {
    app.game.dispose();
    app.game = null;
  }
  space.setMenuMode();
  space.resize(window.innerWidth, window.innerHeight);
  app.state = 'menu';
  menu.show();
  await fadeTo(0, 0.9);
}

/* ---------- Resize ---------- */
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  space.resize(w, h);
  if (app.intro) app.intro.resize(w, h);
  if (app.game) app.game.resize(w, h);
}
window.addEventListener('resize', onResize);

/* ---------- Contesto WebGL perso (GPU resettata, troppe schede) ---------- */
// Three.js ricostruisce da solo il proprio stato al ripristino; noi saltiamo i fotogrammi nel frattempo.
let contextLost = false;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  console.warn('[Street for Paradise] contesto WebGL perso: in attesa del ripristino…');
}, false);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  last = performance.now();
  console.info('[Street for Paradise] contesto WebGL ripristinato.');
}, false);

/* ---------- Game loop (un solo loop: renderer.setAnimationLoop) ---------- */
let last = performance.now();
function frame() {
  const now = performance.now();
  // Delta in secondi, limitato: niente valori negativi né salti enormi dopo una scheda nascosta
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  if (contextLost) return;
  tweens.update(dt);

  switch (app.state) {
    case 'intro':
      if (app.intro) {
        app.intro.update(dt);
        renderer.render(app.intro.scene, app.intro.camera);
      }
      break;
    case 'game':
      if (app.game) {
        app.game.update(dt);
        models.update(dt); // animazioni dei modelli .glb (secondi)
        app.game.render();
      }
      break;
    default:
      space.update(dt);
      renderer.render(space.scene, space.camera);
  }
}
renderer.setAnimationLoop(frame);
// Ripresa dopo una scheda nascosta: il prossimo delta parte da adesso
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') last = performance.now(); });

/* ---------- Avvio ---------- */
(async function boot() {
  setFade(1, '#000');
  const loadingText = $('loading-text');
  const timer = setTimeout(() => { loadingText.textContent = 'Generazione del pianeta…'; }, 2500);
  try {
    // Pianeta del menu e modelli .glb opzionali (assets/models/manifest.json) in parallelo
    await Promise.all([space.ready, models.load(renderer)]);
  } catch (e) {
    console.warn(e);
  }
  clearTimeout(timer);
  // Precompila gli shader della scena spaziale per evitare scatti all'ingresso nel menu.
  renderer.compile(space.scene, space.camera);
  $('loading').classList.add('done');
  setTimeout(() => { $('loading').style.display = 'none'; }, 900);
  app.state = 'menu';
  menu.show();
  await fadeTo(0, 1.4);
})();
