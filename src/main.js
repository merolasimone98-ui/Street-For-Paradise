import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { World } from './world.js';
import { Player } from './player.js';

// ---------------------------------------------------------------------------
// Elementi DOM
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const startHint = document.getElementById('start-hint');
const hud = document.getElementById('hud');

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------------------
// Scena e telecamera
// ---------------------------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 2500);

// ---------------------------------------------------------------------------
// Mondo fisico (Cannon-es)
// ---------------------------------------------------------------------------
const physicsWorld = new CANNON.World({
  gravity: new CANNON.Vec3(0, -22, 0),
});
physicsWorld.broadphase = new CANNON.SAPBroadphase(physicsWorld);
physicsWorld.allowSleep = false;
physicsWorld.solver.iterations = 10;
physicsWorld.defaultContactMaterial.friction = 0.3;
physicsWorld.defaultContactMaterial.restitution = 0;

const staticMaterial = new CANNON.Material('static');
const playerMaterial = new CANNON.Material('player');
physicsWorld.addContactMaterial(
  new CANNON.ContactMaterial(staticMaterial, playerMaterial, {
    friction: 0,
    restitution: 0,
    contactEquationStiffness: 1e8,
    contactEquationRelaxation: 3,
  })
);

// ---------------------------------------------------------------------------
// Moduli di gioco
// ---------------------------------------------------------------------------
const world = new World(scene, physicsWorld, staticMaterial, {
  maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
});

const player = new Player({
  scene,
  physicsWorld,
  camera,
  material: playerMaterial,
  spawn: world.spawnPoint,
});

// ---------------------------------------------------------------------------
// Pointer Lock e schermata iniziale / pausa
// ---------------------------------------------------------------------------
function requestLock() {
  if (document.pointerLockElement === canvas) return;
  canvas.focus();
  const result = canvas.requestPointerLock();
  // Nei browser moderni requestPointerLock restituisce una Promise: gestiamo il rifiuto
  // (es. click troppo ravvicinato dopo Esc) senza generare errori in console.
  if (result && typeof result.catch === 'function') {
    result.catch(() => {
      startHint.textContent = 'Clicca di nuovo per riprendere';
    });
  }
}

startScreen.addEventListener('click', requestLock);
canvas.addEventListener('click', requestLock);

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  player.setActive(locked);
  if (locked) {
    startScreen.classList.add('hidden');
    hud.classList.add('visible');
  } else {
    startHint.textContent = 'Pausa — Clicca per riprendere';
    startScreen.classList.remove('hidden');
  }
});

document.addEventListener('pointerlockerror', () => {
  startHint.textContent = 'Pointer Lock non disponibile — clicca di nuovo';
});

// ---------------------------------------------------------------------------
// Ridimensionamento
// ---------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------------------
// Loop principale
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
const FIXED_STEP = 1 / 60;
const MAX_SUB_STEPS = 5;

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.1);

  player.preStep(dt);
  physicsWorld.step(FIXED_STEP, dt, MAX_SUB_STEPS);
  player.postStep(dt);
  world.update(dt, camera, player.position);

  renderer.render(scene, camera);
}

animate();
