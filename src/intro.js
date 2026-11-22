// Intro: universo -> Terra -> scelta casuale della nascita -> ospedale -> panoramica 0-18.
import { tweens } from './tween.js';
import { $, fadeTo } from './ui.js';
import { generateBirth, formatMoney, formatCoords } from './birthdata.js';
import { PlacentaView } from './placenta.js';
import { LifeStory } from './lifestory.js';

const SKIP_HOLD_SECONDS = 1.5;
const RING_LENGTH = 2 * Math.PI * 16; // circonferenza del cerchio SVG (r = 16)

const CAPTIONS = [
  { at: 0.5, kicker: 'Universo osservabile', title: '93 miliardi di anni luce' },
  { at: 2.6, kicker: 'Via Lattea', title: '200 miliardi di stelle' },
  { at: 2.3, kicker: 'Sistema solare', title: 'Terzo pianeta dal Sole' },
  { at: 2.2, kicker: 'Terra', title: '8 miliardi di vite. Ora tocca alla tua.' },
];

export class Intro {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, space: import('./space.js').SpaceScene, onComplete: (character: object) => void }} opts
   */
  constructor({ renderer, space, onComplete }) {
    this.renderer = renderer;
    this.space = space;
    this.onComplete = onComplete;
    this.phase = 'idle';
    this.story = null;
    this.placenta = null;
    this.birth = null;
    this.busy = false;
    this.disposed = false;
    this.vHeld = false;
    this.skipProgress = 0;

    this.el = {
      bars: $('cinema-bars'),
      caption: $('intro-caption'),
      kicker: $('ic-kicker'),
      title: $('ic-title'),
      panel: $('birth-panel'),
      body: $('bp-body'),
      attempt: $('bp-attempt'),
      coords: $('bp-coords'),
      city: $('bp-city'),
      code: $('bp-code'),
      country: $('bp-country'),
      traits: $('bp-traits'),
      family: $('bp-family'),
      familyDesc: $('bp-family-desc'),
      money: $('bp-money'),
      meta: $('bp-meta'),
      geneRes: $('gene-res'), geneResV: $('gene-res-v'),
      geneCar: $('gene-car'), geneCarV: $('gene-car-v'),
      geneRif: $('gene-rif'), geneRifV: $('gene-rif-v'),
      btnConfirm: $('btn-confirm-birth'),
      btnReroll: $('btn-reroll'),
      skip: $('skip'),
      skipFill: $('skip-fill'),
    };

    this._onConfirm = () => this.confirm();
    this._onReroll = () => this.reroll(false);
    this._onKeyDown = (e) => {
      if (e.code === 'KeyV' && this.phase === 'story') { this.vHeld = true; e.preventDefault(); }
    };
    this._onKeyUp = (e) => { if (e.code === 'KeyV') this.vHeld = false; };
    this._onBlur = () => { this.vHeld = false; };
  }

  get scene() {
    return this.story ? this.story.scene : this.space.scene;
  }

  get camera() {
    return this.story ? this.story.camera : this.space.camera;
  }

  attach() {
    this.el.btnConfirm.addEventListener('click', this._onConfirm);
    this.el.btnReroll.addEventListener('click', this._onReroll);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
  }

  detach() {
    this.el.btnConfirm.removeEventListener('click', this._onConfirm);
    this.el.btnReroll.removeEventListener('click', this._onReroll);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  /* ---------- Fase 1: zoom dallo spazio ---------- */
  async start() {
    this.attach();
    this.phase = 'zoom';
    this.attempt = 0;
    this.prevCityId = null;
    this.skipProgress = 0;
    this.vHeld = false;

    await fadeTo(1, 0.6, '#000');
    this.space.setIntroStart();
    this.el.bars.classList.add('on');
    fadeTo(0, 1.6);
    this.runCaptions();
    await this.space.zoomIn(9.5);
    if (this.disposed) return;

    this.hideCaption();
    this.phase = 'select';
    await this.space.toSelectLayout(1.3);
    if (this.disposed) return;
    this.openPanel();
  }

  async runCaptions() {
    for (const c of CAPTIONS) {
      await tweens.wait(c.at, 'intro');
      if (this.phase !== 'zoom') return;
      this.el.caption.classList.remove('hidden');
      this.el.caption.classList.remove('show');
      await tweens.wait(0.45, 'intro');
      if (this.phase !== 'zoom') return;
      this.el.kicker.textContent = c.kicker;
      this.el.title.textContent = c.title;
      this.el.caption.classList.add('show');
    }
  }

  hideCaption() {
    this.el.caption.classList.remove('show');
    setTimeout(() => { if (this.phase !== 'zoom') this.el.caption.classList.add('hidden'); }, 900);
  }

  /* ---------- Fase 2: scelta della nascita ---------- */
  openPanel() {
    this.el.panel.classList.remove('hidden');
    requestAnimationFrame(() => this.el.panel.classList.add('visible'));
    this.placenta = new PlacentaView($('placenta-canvas'));
    this.placenta.resize();
    this.reroll(true);
  }

  setButtons(enabled) {
    this.el.btnConfirm.disabled = !enabled;
    this.el.btnReroll.disabled = !enabled;
  }

  async reroll(first = false) {
    if (this.busy || this.phase !== 'select') return;
    this.busy = true;
    this.setButtons(false);
    this.attempt++;

    const birth = generateBirth(this.prevCityId);
    this.prevCityId = birth.cityId;
    this.birth = birth;

    if (!first) this.el.body.classList.add('switching');
    const focus = this.space.focusOn(birth.city.lat, birth.city.lon, first ? 1.8 : 1.5);
    const placentaDone = this.placenta.regenerate(birth, !first);
    await tweens.wait(first ? 0.05 : 0.38, 'intro');
    this.fillPanel(birth);
    this.el.body.classList.remove('switching');
    await Promise.all([focus, placentaDone]);

    this.busy = false;
    if (this.phase === 'select') this.setButtons(true);
  }

  fillPanel(b) {
    const e = this.el;
    e.attempt.textContent = String(this.attempt);
    e.coords.textContent = formatCoords(b.city.lat, b.city.lon);
    e.city.textContent = b.city.city;
    e.code.textContent = b.city.code;
    e.country.textContent = `${b.city.country} · nasce ${b.sex === 'f' ? 'una bambina' : 'un bambino'}: ${b.name} ${b.surname}`;
    e.traits.innerHTML = '';
    for (const t of b.city.bonus) {
      const li = document.createElement('li');
      li.className = 'plus';
      li.textContent = t;
      e.traits.appendChild(li);
    }
    for (const t of b.city.malus) {
      const li = document.createElement('li');
      li.className = 'minus';
      li.textContent = t;
      e.traits.appendChild(li);
    }
    e.family.textContent = b.family.label;
    e.familyDesc.textContent = b.family.desc;
    e.money.textContent = `${formatMoney(b.moneyRange[0])} – ${formatMoney(b.moneyRange[1])}`;
    e.meta.innerHTML = `Peso previsto ${b.weightKg.toFixed(2).replace('.', ',')} kg<br>Gruppo ${b.blood} · Battito ${b.bpm} bpm`;
    const g = b.genetics;
    e.geneRes.style.width = g.resistenza + '%';
    e.geneCar.style.width = g.carisma + '%';
    e.geneRif.style.width = g.riflessi + '%';
    e.geneResV.textContent = g.resistenza;
    e.geneCarV.textContent = g.carisma;
    e.geneRifV.textContent = g.riflessi;
  }

  /* ---------- Fase 3: tuffo e nascita ---------- */
  async confirm() {
    if (this.busy || this.phase !== 'select' || !this.birth) return;
    this.busy = true;
    this.setButtons(false);
    this.phase = 'dive';
    this.el.panel.classList.remove('visible');

    const dive = this.space.dive(2.6);
    await tweens.wait(1.6, 'intro');
    await fadeTo(1, 1.0, '#fff');
    await dive;
    if (this.disposed) return;

    this.el.panel.classList.add('hidden');
    if (this.placenta) {
      this.placenta.dispose();
      this.placenta = null;
    }
    this.story = new LifeStory({
      renderer: this.renderer,
      birth: this.birth,
      onFinish: (character) => this.finish(character),
    });
    this.story.resize(window.innerWidth, window.innerHeight);
    this.phase = 'story';
    this.skipProgress = 0;
    this.el.skip.classList.remove('hidden');
    this.busy = false;
    await fadeTo(0, 1.3);
  }

  /* ---------- Fase 4: 18 anni -> gameplay ---------- */
  async finish(character) {
    if (this.phase === 'ending' || this.phase === 'done') return;
    this.phase = 'ending';
    this.vHeld = false;
    this.el.skip.classList.add('hidden');
    this.el.skip.classList.remove('active');
    await fadeTo(1, 1.1, '#fff');
    if (this.story) {
      this.story.dispose();
      this.story = null;
    }
    this.el.bars.classList.remove('on');
    this.detach();
    this.phase = 'done';
    this.onComplete(character);
  }

  update(dt) {
    if (this.phase === 'zoom' || this.phase === 'select' || this.phase === 'dive') {
      this.space.update(dt);
      if (this.placenta) this.placenta.update(dt);
    }
    if (this.story) this.story.update(dt);

    if (this.phase === 'story') {
      if (this.vHeld) this.skipProgress = Math.min(1, this.skipProgress + dt / SKIP_HOLD_SECONDS);
      else this.skipProgress = Math.max(0, this.skipProgress - dt * 1.5);
      this.el.skipFill.style.strokeDashoffset = String(RING_LENGTH * (1 - this.skipProgress));
      this.el.skip.classList.toggle('active', this.vHeld);
      if (this.skipProgress >= 1 && this.story) {
        this.skipProgress = 0;
        this.story.skip(); // chiama onFinish -> finish()
      }
    }
  }

  resize(w, h) {
    this.space.resize(w, h);
    if (this.story) this.story.resize(w, h);
    if (this.placenta) this.placenta.resize();
  }

  dispose() {
    this.disposed = true;
    tweens.cancelGroup('intro');
    this.detach();
    if (this.placenta) { this.placenta.dispose(); this.placenta = null; }
    if (this.story) { this.story.dispose(); this.story = null; }
    this.el.panel.classList.add('hidden');
    this.el.caption.classList.add('hidden');
    this.el.skip.classList.add('hidden');
    this.el.bars.classList.remove('on');
  }
}
