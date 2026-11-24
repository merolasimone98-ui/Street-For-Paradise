// Motore audio procedurale (Web Audio API): tutti i suoni sono sintetizzati, nessun file esterno.
// Bus: master -> compressore -> uscita; musica e SFX hanno volumi separati collegati alle Impostazioni.
import { loadSettings, onSettingsChange } from './settings.js';

const rand = (a, b) => a + Math.random() * (b - a);

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.engines = new Map();
    this.loops = {};
    this.musicTimer = null;
    this.musicMode = null;
    this.birdTimer = 0;
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    onSettingsChange(() => this.applyVolumes());
  }

  /* ---------- Inizializzazione (serve un gesto dell'utente) ---------- */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(c.destination);
      this.musicBus = c.createGain();
      this.sfxBus = c.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      // Riverbero sintetico (risposta all'impulso generata)
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.6, 2.2);
      this.reverbSend = c.createGain();
      this.reverbSend.gain.value = 0.35;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.noiseBuf = this.makeNoise(2, 'white');
      this.brownBuf = this.makeNoise(3, 'brown');
      this.ready = true;
      this.applyVolumes();
      if (this.pendingMusic) { const m = this.pendingMusic; this.pendingMusic = null; this.playMusic(m); }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ready) return;
    const s = loadSettings();
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.masterVolume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVolume * 0.6, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVolume, t, 0.05);
  }

  makeNoise(seconds, kind) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  makeImpulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  get t() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /* ---------- Mattoni di base ---------- */
  tone({ type = 'sine', freq = 440, freqEnd = null, start = 0, dur = 0.2, gain = 0.3, attack = 0.005, release = null, dest = null, detune = 0, reverb = 0, pan = 0 }) {
    if (!this.ready) return null;
    const c = this.ctx;
    const t0 = this.t + start;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (release ?? dur));
    let node = o.connect(g);
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(dest || this.sfxBus);
    if (reverb) { const s = c.createGain(); s.gain.value = reverb; node.connect(s).connect(this.reverbSend); }
    o.start(t0);
    o.stop(t0 + (release ?? dur) + 0.05);
    return o;
  }

  burst({ start = 0, dur = 0.1, gain = 0.3, type = 'lowpass', freq = 2000, freqEnd = null, q = 0.8, attack = 0.002, brown = false, dest = null, reverb = 0 }) {
    if (!this.ready) return;
    const c = this.ctx;
    const t0 = this.t + start;
    const src = c.createBufferSource();
    src.buffer = brown ? this.brownBuf : this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(dest || this.sfxBus);
    if (reverb) { const s = c.createGain(); s.gain.value = reverb; g.connect(s).connect(this.reverbSend); }
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  distortion(amount) {
    const ws = this.ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * 2 - 1;
      curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
    }
    ws.curve = curve;
    return ws;
  }

  /* ---------- Interfaccia ---------- */
  hover() { this.tone({ type: 'sine', freq: 1500, freqEnd: 1700, dur: 0.05, gain: 0.04 }); }
  click() {
    this.tone({ type: 'triangle', freq: 880, freqEnd: 660, dur: 0.09, gain: 0.12 });
    this.burst({ dur: 0.03, gain: 0.05, type: 'highpass', freq: 3500 });
  }
  confirm() {
    this.tone({ type: 'sine', freq: 660, dur: 0.12, gain: 0.12 });
    this.tone({ type: 'sine', freq: 990, start: 0.08, dur: 0.18, gain: 0.12, reverb: 0.2 });
  }
  back() { this.tone({ type: 'sine', freq: 600, freqEnd: 380, dur: 0.12, gain: 0.1 }); }
  /** Errore (minigiochi, scelte sbagliate). */
  error() {
    this.tone({ type: 'square', freq: 220, dur: 0.12, gain: 0.07 });
    this.tone({ type: 'square', freq: 165, start: 0.12, dur: 0.18, gain: 0.07 });
    this.burst({ dur: 0.06, gain: 0.08, type: 'highpass', freq: 4500 });
  }
  /** Lamiera che si piega / vetri (urti dei veicoli). */
  crash(intensity = 1) {
    const k = Math.min(1.6, intensity);
    this.burst({ dur: 0.45, gain: 0.22 * k, type: 'lowpass', freq: 2600, freqEnd: 300, brown: true, reverb: 0.2 });
    this.tone({ type: 'sine', freq: 70, freqEnd: 35, dur: 0.3, gain: 0.3 * k });
    for (let i = 0; i < 5; i++) this.tone({ type: 'triangle', freq: rand(2500, 5200), start: 0.03 + i * 0.04, dur: 0.12, gain: 0.03 * k });
  }
  /** Proiettile che colpisce lamiera o muro. */
  ricochet() {
    this.tone({ type: 'sine', freq: rand(2400, 3200), freqEnd: rand(900, 1300), dur: 0.22, gain: 0.07 });
    this.burst({ dur: 0.05, gain: 0.12, type: 'highpass', freq: 3000 });
  }
  /** Taglio del metallo (motosega sul bancomat): scintille stridenti. */
  grind() {
    for (let i = 0; i < 6; i++) this.burst({ start: i * 0.12, dur: 0.1, gain: 0.07, type: 'bandpass', freq: rand(5000, 7500), q: 6 });
  }
  /** Motore che si rompe: colpi secchi e sbuffo. */
  engineDie() {
    for (let i = 0; i < 3; i++) this.tone({ type: 'square', freq: rand(55, 80), start: i * 0.18, dur: 0.1, gain: 0.12 });
    this.burst({ start: 0.5, dur: 0.8, gain: 0.08, type: 'lowpass', freq: 900, freqEnd: 200, brown: true });
  }
  cash() {
    this.burst({ dur: 0.05, gain: 0.12, type: 'bandpass', freq: 5000, q: 2 });
    this.tone({ type: 'sine', freq: 1760, start: 0.03, dur: 0.25, gain: 0.08, reverb: 0.3 });
    this.tone({ type: 'sine', freq: 2637, start: 0.08, dur: 0.3, gain: 0.06, reverb: 0.3 });
  }
  phoneNotify() {
    this.tone({ type: 'sine', freq: 1318.5, dur: 0.18, gain: 0.14, reverb: 0.25 });
    this.tone({ type: 'sine', freq: 1760, start: 0.14, dur: 0.32, gain: 0.14, reverb: 0.25 });
    this.tone({ type: 'sine', freq: 2637, start: 0.14, dur: 0.2, gain: 0.03 });
  }
  phoneRing() {
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'sine', freq: 425, start: i * 0.5, dur: 0.35, gain: 0.08 });
    }
  }
  door() {
    this.burst({ dur: 0.25, gain: 0.12, type: 'lowpass', freq: 700, freqEnd: 300, brown: true });
    this.tone({ type: 'sine', freq: 110, freqEnd: 70, start: 0.18, dur: 0.12, gain: 0.18 });
  }

  /** Serranda del garage: sferragliare metallico che si arrotola, poi il colpo di fine corsa. */
  shutter() {
    for (let i = 0; i < 14; i++) this.burst({ start: i * 0.07, dur: 0.06, gain: 0.07, type: 'bandpass', freq: rand(900, 1600), q: 3 });
    this.burst({ dur: 1.0, gain: 0.06, type: 'lowpass', freq: 500, freqEnd: 250, brown: true });
    this.tone({ type: 'sine', freq: 90, freqEnd: 60, start: 1.0, dur: 0.15, gain: 0.16 });
  }

  /** Tuning: avvitatore pneumatico. */
  impactWrench() {
    for (let i = 0; i < 3; i++) this.burst({ start: i * 0.28, dur: 0.18, gain: 0.08, type: 'bandpass', freq: rand(1800, 2600), q: 6 });
  }

  /* ---------- Corpo ---------- */
  /**
   * Passi: tallone + punta (due colpi ravvicinati), timbro e coda diversi per superficie:
   * asfalto ruvido, marciapiede, legno che risuona, piastrelle secche, erba frusciante, marmo con eco.
   */
  footstep(surface = 'asphalt', running = false) {
    const S = {
      asphalt: { f: 1500, q: 0.6, grit: 0.35, ring: 0, rev: 0 },
      sidewalk: { f: 2200, q: 0.7, grit: 0.25, ring: 0, rev: 0 },
      wood: { f: 900, q: 1.2, grit: 0.05, ring: 210, rev: 0.15 },
      tile: { f: 3000, q: 1.5, grit: 0.05, ring: 1800, rev: 0.2 },
      grass: { f: 700, q: 0.4, grit: 0.7, ring: 0, rev: 0 },
      marble: { f: 3400, q: 1.8, grit: 0.02, ring: 2400, rev: 0.45 },
    }[surface] || { f: 1500, q: 0.6, grit: 0.3, ring: 0, rev: 0 };
    const g = running ? 0.16 : 0.09;
    const f = S.f * rand(0.85, 1.15);
    // Tallone
    this.burst({ dur: running ? 0.08 : 0.06, gain: g, type: 'lowpass', freq: f, q: S.q, reverb: S.rev });
    this.tone({ type: 'sine', freq: rand(70, 95), freqEnd: 45, dur: 0.06, gain: g * 0.9 });
    // Punta (un attimo dopo, più leggera)
    this.burst({ start: running ? 0.03 : 0.05, dur: 0.04, gain: g * 0.55, type: 'bandpass', freq: f * 1.3, q: S.q, reverb: S.rev });
    // Granelli / fruscio (asfalto ed erba)
    if (S.grit > 0.1) this.burst({ start: 0.01, dur: 0.09, gain: g * S.grit * 0.5, type: 'highpass', freq: surface === 'grass' ? 2500 : 4500 });
    // Risonanza del materiale (legno, piastrelle, marmo)
    if (S.ring) this.tone({ type: 'triangle', freq: S.ring * rand(0.95, 1.05), dur: surface === 'wood' ? 0.06 : 0.035, gain: g * 0.25, reverb: S.rev });
  }
  jump() { this.burst({ dur: 0.22, gain: 0.07, type: 'bandpass', freq: 600, freqEnd: 1800, q: 1.2 }); }
  land(intensity = 1) {
    this.burst({ dur: 0.14, gain: Math.min(0.3, 0.12 * intensity), type: 'lowpass', freq: 900, brown: true });
    this.tone({ type: 'sine', freq: 85, freqEnd: 40, dur: 0.15, gain: Math.min(0.35, 0.15 * intensity) });
  }
  hurt() {
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 140, dur: 0.25, gain: 0.06 });
    this.burst({ dur: 0.2, gain: 0.15, type: 'lowpass', freq: 500, brown: true });
  }
  eat() {
    for (let i = 0; i < 4; i++) this.burst({ start: i * 0.16 + rand(0, 0.04), dur: 0.06, gain: 0.12, type: 'bandpass', freq: rand(2200, 3800), q: 1.5 });
  }
  drink() {
    for (let i = 0; i < 3; i++) {
      this.tone({ type: 'sine', freq: rand(190, 230), freqEnd: rand(110, 140), start: i * 0.32, dur: 0.16, gain: 0.14 });
      this.burst({ start: i * 0.32 + 0.05, dur: 0.08, gain: 0.03, type: 'bandpass', freq: 900, q: 3 });
    }
  }
  pills() {
    for (let i = 0; i < 3; i++) this.tone({ type: 'triangle', freq: rand(2500, 3500), start: i * 0.07, dur: 0.04, gain: 0.05 });
    this.drink();
  }

  /* ---------- Armi e attrezzi ---------- */
  gunshot() {
    this.burst({ dur: 0.35, gain: 0.55, type: 'lowpass', freq: 7000, freqEnd: 300, reverb: 0.5 });
    this.tone({ type: 'sine', freq: 140, freqEnd: 38, dur: 0.25, gain: 0.5 });
    this.burst({ start: 0.0, dur: 0.02, gain: 0.4, type: 'highpass', freq: 4000 });
  }
  screwdriver() {
    for (let i = 0; i < 6; i++) this.burst({ start: i * 0.4 + rand(0, 0.1), dur: 0.08, gain: 0.08, type: 'bandpass', freq: rand(3000, 5000), q: 4 });
  }

  /** Motosega: suono continuo, start/stop. */
  chainsaw(on) {
    if (!this.ready) return;
    if (on && !this.loops.chainsaw) {
      const c = this.ctx;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 95;
      const lfo = c.createOscillator();
      lfo.frequency.value = 11;
      const lfoG = c.createGain();
      lfoG.gain.value = 18;
      lfo.connect(lfoG).connect(o.frequency);
      const dist = this.distortion(30);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2600;
      const g = c.createGain();
      g.gain.value = 0.0001;
      g.gain.setTargetAtTime(0.18, this.t, 0.05);
      o.connect(dist).connect(f).connect(g).connect(this.sfxBus);
      o.start(); lfo.start();
      this.loops.chainsaw = { o, lfo, g };
    } else if (!on && this.loops.chainsaw) {
      const l = this.loops.chainsaw;
      l.g.gain.setTargetAtTime(0.0001, this.t, 0.08);
      l.o.stop(this.t + 0.4); l.lfo.stop(this.t + 0.4);
      this.loops.chainsaw = null;
    }
  }

  /* ---------- Sirene e allarmi ---------- */
  carAlarm(seconds = 6) {
    if (!this.ready) return;
    const n = Math.floor(seconds / 0.5);
    for (let i = 0; i < n; i++) {
      this.tone({ type: 'square', freq: i % 2 ? 1250 : 850, start: i * 0.5, dur: 0.45, gain: 0.07, attack: 0.01 });
    }
  }

  siren(seconds = 8) {
    if (!this.ready) return;
    const c = this.ctx;
    const t0 = this.t;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1800;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.3);
    g.gain.setValueAtTime(0.09, t0 + seconds - 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    for (let k = 0; k < seconds / 1.4; k++) {
      o.frequency.setValueAtTime(650, t0 + k * 1.4);
      o.frequency.linearRampToValueAtTime(1350, t0 + k * 1.4 + 0.7);
      o.frequency.linearRampToValueAtTime(650, t0 + k * 1.4 + 1.4);
    }
    o.connect(f).connect(g).connect(this.sfxBus);
    const s = c.createGain(); s.gain.value = 0.4; g.connect(s).connect(this.reverbSend);
    o.start(t0);
    o.stop(t0 + seconds + 0.1);
  }

  /* ---------- Voci e folla ---------- */
  /** Voce "simlish": sillabe con due formanti vocaliche casuali. */
  voice(female = false, syllables = 8) {
    if (!this.ready) return;
    const c = this.ctx;
    const vowels = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [300, 870], [440, 1020]];
    const base = female ? rand(190, 240) : rand(100, 140);
    let t = 0;
    for (let i = 0; i < syllables; i++) {
      const d = rand(0.09, 0.2);
      const t0 = this.t + t;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * rand(0.9, 1.15), t0);
      o.frequency.linearRampToValueAtTime(base * rand(0.85, 1.1), t0 + d);
      const [f1, f2] = vowels[Math.floor(Math.random() * vowels.length)];
      const b1 = c.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = f1; b1.Q.value = 6;
      const b2 = c.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = f2; b2.Q.value = 8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(b1).connect(g);
      o.connect(b2).connect(g);
      g.connect(this.sfxBus);
      o.start(t0);
      o.stop(t0 + d + 0.02);
      if (Math.random() < 0.4) this.burst({ start: t + d * 0.8, dur: 0.04, gain: 0.02, type: 'highpass', freq: 4500 });
      t += d + rand(0.01, 0.06) + (i % 4 === 3 ? 0.15 : 0);
    }
  }

  /** Brusio di folla/città continuo (level 0..1). */
  setCrowd(level) {
    this.setLoopLevel('crowd', level, () => {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 500; f1.Q.value = 1.5;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1400; f2.Q.value = 2.5;
      const lfo = c.createOscillator(); lfo.frequency.value = 3.3;
      const lfoG = c.createGain(); lfoG.gain.value = 250;
      lfo.connect(lfoG).connect(f1.frequency);
      const lfo2 = c.createOscillator(); lfo2.frequency.value = 4.7;
      const lfoG2 = c.createGain(); lfoG2.gain.value = 500;
      lfo2.connect(lfoG2).connect(f2.frequency);
      const g = c.createGain();
      src.connect(f1).connect(g);
      src.connect(f2).connect(g);
      src.start(); lfo.start(); lfo2.start();
      return { nodes: [src, lfo, lfo2], gain: g, max: 0.06 };
    });
  }

  /** Rumore di fondo urbano (traffico lontano). */
  setCity(level) {
    this.setLoopLevel('city', level, () => {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.brownBuf;
      src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = c.createGain();
      src.connect(f).connect(g);
      src.start();
      return { nodes: [src], gain: g, max: 0.12 };
    });
  }

  /** Vento leggero (Paradiso, spazio). */
  setWind(level) {
    this.setLoopLevel('wind', level, () => {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.7;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.13;
      const lfoG = c.createGain(); lfoG.gain.value = 400;
      lfo.connect(lfoG).connect(f.frequency);
      const g = c.createGain();
      src.connect(f).connect(g);
      src.start(); lfo.start();
      return { nodes: [src, lfo], gain: g, max: 0.05 };
    });
  }

  setLoopLevel(name, level, create) {
    if (!this.ready) return;
    let l = this.loops[name];
    if (!l && level > 0.001) {
      l = this.loops[name] = create();
      l.gain.gain.value = 0;
      l.gain.connect(this.sfxBus);
    }
    if (l) l.gain.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * l.max, this.t, 0.4);
  }

  /** Uccellini: chiamare ogni frame; i cinguettii sono casuali (solo di giorno all'aperto). */
  birds(dt, active) {
    if (!this.ready || !active) return;
    this.birdTimer -= dt;
    if (this.birdTimer > 0) return;
    this.birdTimer = rand(1.5, 6);
    const pan = rand(-0.8, 0.8);
    const base = rand(2600, 4200);
    const notes = Math.floor(rand(2, 7));
    for (let i = 0; i < notes; i++) {
      const f = base * rand(0.85, 1.25);
      this.tone({ type: 'sine', freq: f, freqEnd: f * rand(0.7, 1.4), start: i * rand(0.07, 0.13), dur: rand(0.05, 0.1), gain: 0.025, pan, reverb: 0.2 });
    }
  }

  /* ---------- Motori ---------- */
  /** Avvia il suono del motore per il veicolo id (kind: car_small/car/suv/sport/moto/scooter/bike). */
  engineStart(id, kind) {
    if (!this.ready || this.engines.has(id)) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.connect(this.sfxBus);
    const e = { kind, out, nodes: [], last: 0 };
    if (kind === 'bike') {
      // Bici: rotolamento delle gomme + ticchettio della ruota libera
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
      src.connect(f).connect(out);
      src.start();
      e.nodes.push(src);
      e.tire = f;
      e.tick = 0;
    } else {
      const o1 = c.createOscillator();
      const o2 = c.createOscillator();
      const sub = c.createOscillator();
      o1.type = kind === 'scooter' ? 'square' : 'sawtooth';
      o2.type = 'sawtooth';
      sub.type = 'sine';
      o2.detune.value = kind === 'moto' ? 9 : 14;
      const dist = this.distortion(kind === 'moto' ? 18 : kind === 'scooter' ? 25 : kind === 'sport' ? 12 : 6);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = kind === 'scooter' ? 2200 : 900;
      f.Q.value = 2;
      const mix = c.createGain(); mix.gain.value = 0.5;
      o1.connect(mix); o2.connect(mix);
      mix.connect(dist).connect(f).connect(out);
      const subG = c.createGain(); subG.gain.value = kind === 'scooter' ? 0.1 : 0.45;
      sub.connect(subG).connect(out);
      // Scoppiettio del motore (modulazione d'ampiezza)
      const am = c.createOscillator(); am.type = 'square';
      const amG = c.createGain(); amG.gain.value = kind === 'moto' || kind === 'scooter' ? 0.35 : 0.15;
      const amBias = c.createGain(); amBias.gain.value = 1;
      am.connect(amG).connect(mix.gain);
      // Armonico superiore (ronzio meccanico ai giri alti) e aspirazione/scarico (rumore filtrato che segue i giri)
      const o3 = c.createOscillator(); o3.type = 'triangle';
      const o3g = c.createGain(); o3g.gain.value = 0.0001;
      o3.connect(o3g).connect(out);
      const intake = c.createBufferSource(); intake.buffer = this.noiseBuf; intake.loop = true;
      const inF = c.createBiquadFilter(); inF.type = 'bandpass'; inF.frequency.value = 400; inF.Q.value = 1.4;
      const inG = c.createGain(); inG.gain.value = 0.0001;
      intake.connect(inF).connect(inG).connect(out);
      [o1, o2, sub, am, o3, intake].forEach((n) => n.start());
      e.nodes.push(o1, o2, sub, am, o3, intake);
      Object.assign(e, { o1, o2, sub, am, filter: f, o3, o3g, inF, inG, lastRpm: 0 });
      void amBias;
    }
    this.engines.set(id, e);
  }

  /** speedRatio 0..1, throttle bool */
  engineUpdate(id, speed, maxSpeed, throttle, rpmOverride = null, level = 1) {
    const e = this.engines.get(id);
    if (!e) return;
    const t = this.t;
    const ratio = Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed));
    if (e.kind === 'bike') {
      e.out.gain.setTargetAtTime(Math.min(0.12, ratio * 0.2) * level, t, 0.1);
      e.tire.frequency.setTargetAtTime(500 + ratio * 1600, t, 0.1);
      if (!throttle && ratio > 0.05) {
        e.tick -= 1 / 60;
        if (e.tick <= 0) {
          e.tick = 0.09 - ratio * 0.05;
          this.tone({ type: 'triangle', freq: 4200, dur: 0.015, gain: 0.03 });
        }
      }
      return;
    }
    // Cambio automatico simulato: il regime sale e scende a ogni marcia
    const gears = e.kind === 'scooter' ? 1 : e.kind === 'moto' ? 6 : 5;
    const g = Math.min(gears - 1, Math.floor(ratio * gears));
    const inGear = rpmOverride != null ? Math.max(0, Math.min(1, rpmOverride)) : gears === 1 ? ratio : ratio * gears - g;
    const rpm = 0.18 + inGear * 0.75 + (throttle ? 0.07 : 0);
    const base = { car_small: 34, car: 30, suv: 26, sport: 40, moto: 46, scooter: 70 }[e.kind] || 30;
    const span = { car_small: 95, car: 90, suv: 70, sport: 150, moto: 170, scooter: 210 }[e.kind] || 90;
    const f = base + rpm * span;
    e.o1.frequency.setTargetAtTime(f, t, 0.06);
    e.o2.frequency.setTargetAtTime(f * 1.005, t, 0.06);
    e.sub.frequency.setTargetAtTime(f / 2, t, 0.06);
    e.am.frequency.setTargetAtTime(f / (e.kind === 'moto' ? 2 : 4), t, 0.06);
    e.filter.frequency.setTargetAtTime((e.kind === 'scooter' ? 1500 : 500) + rpm * (throttle ? 2200 : 1100), t, 0.08);
    const vol = (e.kind === 'scooter' ? 0.07 : e.kind === 'moto' ? 0.12 : 0.1) * (0.55 + rpm * 0.6 + (throttle ? 0.25 : 0));
    e.out.gain.setTargetAtTime(vol * level, t, 0.08);
    // Armonico e aspirazione: crescono con i giri e con il gas
    e.o3.frequency.setTargetAtTime(f * 2.02, t, 0.06);
    e.o3g.gain.setTargetAtTime((0.02 + rpm * 0.08) * (e.kind === 'sport' || e.kind === 'moto' ? 1.4 : 1), t, 0.08);
    e.inF.frequency.setTargetAtTime(300 + rpm * (e.kind === 'scooter' ? 2600 : 1800), t, 0.08);
    e.inG.gain.setTargetAtTime((throttle ? 0.18 : 0.06) * (0.3 + rpm), t, 0.1);
    // Cambiata: il regime crolla di colpo → breve "sbuffo" dello scarico
    if (e.lastRpm - inGear > 0.35 && level > 0.5) this.burst({ dur: 0.12, gain: 0.05, type: 'lowpass', freq: 700, brown: true });
    e.lastRpm = inGear;
  }

  engineStop(id, silent = false) {
    const e = this.engines.get(id);
    if (!e) return;
    const t = this.t;
    e.out.gain.setTargetAtTime(0.0001, t, 0.15);
    for (const n of e.nodes) { try { n.stop(t + 0.8); } catch (err) { /* già fermo */ } }
    this.engines.delete(id);
    if (e.kind !== 'bike' && !silent) this.burst({ dur: 0.4, gain: 0.05, type: 'lowpass', freq: 400, brown: true });
  }

  engineIgnition(kind) {
    if (kind === 'bike') { this.tone({ type: 'triangle', freq: 3800, dur: 0.05, gain: 0.04 }); return; }
    for (let i = 0; i < 5; i++) this.burst({ start: i * 0.09, dur: 0.07, gain: 0.08, type: 'lowpass', freq: 600, brown: true });
    this.tone({ type: 'sawtooth', freq: 40, freqEnd: 90, start: 0.4, dur: 0.5, gain: 0.08 });
  }

  stopAllLoops() {
    for (const id of [...this.engines.keys()]) this.engineStop(id);
    this.chainsaw(false);
    this.hornStop();
    this.radioStop();
    this.heartMonitor(false);
    if (this.fountainGain) this.fountainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    for (const name of ['crowd', 'city', 'wind']) this.setLoopLevel(name, 0, () => null);
  }

  /* ---------- Musica ---------- */
  /** mode: 'menu' (ambient rilassante), 'paradise' (celeste), null = silenzio */
  playMusic(mode) {
    if (!this.ready) { this.pendingMusic = mode; return; }
    if (this.musicMode === mode) return;
    this.stopMusic();
    if (!mode) return;
    this.musicMode = mode;
    const c = this.ctx;
    this.musicGain = c.createGain();
    this.musicGain.gain.value = 0.0001;
    this.musicGain.gain.setTargetAtTime(1, this.t, 1.5);
    this.musicGain.connect(this.musicBus);
    const send = c.createGain(); send.gain.value = 0.6;
    this.musicGain.connect(send).connect(this.reverbSend);
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const prog = mode === 'paradise'
      ? [[60, 64, 67, 71], [65, 69, 72, 76], [57, 60, 64, 67], [62, 65, 69, 72]]
      : [[57, 60, 64, 67], [53, 57, 60, 64], [48, 55, 60, 64], [55, 59, 62, 67]];
    const chordLen = mode === 'paradise' ? 6 : 5;
    let step = 0;
    let nextTime = this.t + 0.1;
    const schedule = () => {
      if (!this.musicMode) return;
      while (nextTime < this.t + 2) {
        const chord = prog[step % prog.length];
        // Pad: note lunghe, attacco e rilascio morbidi, leggero detune
        for (const n of chord) {
          for (const det of [-7, 6]) {
            const o = c.createOscillator();
            o.type = mode === 'paradise' ? 'sine' : 'triangle';
            o.frequency.value = midi(n);
            o.detune.value = det;
            const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = mode === 'paradise' ? 2400 : 1200;
            const g = c.createGain();
            g.gain.setValueAtTime(0.0001, nextTime);
            g.gain.linearRampToValueAtTime(0.035, nextTime + chordLen * 0.35);
            g.gain.linearRampToValueAtTime(0.0001, nextTime + chordLen + 1.2);
            o.connect(f).connect(g).connect(this.musicGain);
            o.start(nextTime);
            o.stop(nextTime + chordLen + 1.4);
          }
        }
        // Basso
        const b = c.createOscillator(); b.type = 'sine'; b.frequency.value = midi(chord[0] - 12);
        const bg = c.createGain();
        bg.gain.setValueAtTime(0.0001, nextTime);
        bg.gain.linearRampToValueAtTime(0.06, nextTime + 0.8);
        bg.gain.linearRampToValueAtTime(0.0001, nextTime + chordLen);
        b.connect(bg).connect(this.musicGain);
        b.start(nextTime); b.stop(nextTime + chordLen + 0.1);
        // Arpeggio delicato (stile carillon)
        const arp = [0, 1, 2, 3, 2, 1, 3, 2];
        const stepLen = chordLen / arp.length;
        arp.forEach((idx, k) => {
          if (Math.random() < 0.25) return;
          const tt = nextTime + k * stepLen;
          const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = midi(chord[idx] + 12);
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(mode === 'paradise' ? 0.05 : 0.035, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.2);
          o.connect(g).connect(this.musicGain);
          o.start(tt); o.stop(tt + 1.3);
        });
        nextTime += chordLen;
        step++;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 500);
  }

  /* ---------- Clacson (tenuto premuto = suono prolungato) ---------- */
  /** kind: 'bike' (campanello), 'scooter'/'moto' (bip), auto (clacson pieno). */
  hornStart(kind) {
    if (!this.ready || this.horn) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.connect(this.sfxBus);
    const h = { out, nodes: [], timer: null, kind };
    if (kind === 'bike') {
      // Campanello: "drin drin" ripetuto finché tieni premuto
      const ring = () => {
        for (let i = 0; i < 2; i++) {
          this.tone({ type: 'triangle', freq: 2350, start: i * 0.11, dur: 0.5, gain: 0.12, attack: 0.002 });
          this.tone({ type: 'sine', freq: 3520, start: i * 0.11, dur: 0.35, gain: 0.05, attack: 0.002 });
        }
      };
      ring();
      h.timer = setInterval(ring, 420);
      out.gain.value = 1;
    } else {
      const moto = kind === 'scooter' || kind === 'moto';
      const freqs = moto ? [520, 650] : [392, 494];
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = moto ? 2600 : 1800;
      f.connect(out);
      for (const fr of freqs) {
        const o = c.createOscillator();
        o.type = moto ? 'square' : 'sawtooth';
        o.frequency.value = fr;
        const g = c.createGain();
        g.gain.value = moto ? 0.05 : 0.09;
        o.connect(g).connect(f);
        o.start();
        h.nodes.push(o);
      }
      out.gain.setTargetAtTime(1, this.t, 0.01);
    }
    this.horn = h;
    this.hornT0 = this.t;
  }

  hornStop() {
    const h = this.horn;
    if (!h) return;
    this.horn = null;
    if (h.timer) clearInterval(h.timer);
    // Tocco rapido: almeno un "bip" corto e udibile
    const minEnd = Math.max(this.t, this.hornT0 + 0.16);
    h.out.gain.setTargetAtTime(0.0001, minEnd, 0.025);
    for (const o of h.nodes) o.stop(minEnd + 0.2);
    setTimeout(() => { try { h.out.disconnect(); } catch (e) { /* già scollegato */ } }, 600);
  }

  /* ---------- Ospedale ---------- */
  /** Barella: ruote che sferragliano sul pavimento, cigolii e passi dei paramedici. */
  stretcher(seconds = 6) {
    if (!this.ready) return;
    const steps = Math.floor(seconds / 0.13);
    for (let i = 0; i < steps; i++) {
      const t = i * 0.13 + rand(0, 0.03);
      this.burst({ start: t, dur: 0.05, gain: 0.035, type: 'bandpass', freq: rand(2200, 3400), q: 5 });
      if (i % 4 === 0) this.burst({ start: t, dur: 0.08, gain: 0.05, type: 'lowpass', freq: 600, brown: true });
      if (i % 9 === 0) this.tone({ type: 'triangle', freq: rand(1100, 1400), freqEnd: rand(900, 1000), start: t, dur: 0.18, gain: 0.012 });
    }
  }

  /** Monitor cardiaco: bip regolari finché è acceso. */
  heartMonitor(on) {
    if (this.monitorTimer) { clearInterval(this.monitorTimer); this.monitorTimer = null; }
    if (!on || !this.ready) return;
    const beep = () => this.tone({ type: 'sine', freq: 1046, dur: 0.12, gain: 0.05, attack: 0.004 });
    beep();
    this.monitorTimer = setInterval(beep, 850);
  }

  /* ---------- Chiesa ---------- */
  /** Campane: rintocchi con armonici inarmonici (come una campana vera) e lunga coda. */
  churchBells(rings = 4) {
    if (!this.ready) return;
    const base = [392, 330];
    for (let i = 0; i < rings; i++) {
      const f = base[i % 2];
      const t = i * 1.1;
      for (const [mul, g, d] of [[0.5, 0.05, 4], [1, 0.07, 3.5], [1.2, 0.03, 2.5], [1.5, 0.025, 2], [2, 0.03, 1.8], [2.76, 0.015, 1.2]]) {
        this.tone({ type: 'sine', freq: f * mul, start: t, dur: d, gain: g, attack: 0.003, reverb: 0.6 });
      }
    }
  }

  /** Coro: vocali "aah" con formanti (filtri) e leggero vibrato, accordi lenti. */
  choir(seconds = 6) {
    if (!this.ready) return;
    const c = this.ctx;
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const chords = [[57, 61, 64, 69], [55, 59, 62, 67], [57, 60, 64, 69]];
    const len = seconds / chords.length;
    chords.forEach((ch, k) => {
      const t0 = this.t + k * len;
      for (const n of ch) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        const vib = c.createOscillator(); vib.frequency.value = 5 + Math.random();
        const vg = c.createGain(); vg.gain.value = 3;
        vib.connect(vg).connect(o.detune);
        const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 6;
        const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 8;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(0.03, t0 + len * 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t0 + len + 0.6);
        o.connect(f1).connect(g);
        o.connect(f2).connect(g);
        g.connect(this.sfxBus);
        const send = c.createGain(); send.gain.value = 0.8;
        g.connect(send).connect(this.reverbSend);
        o.start(t0); vib.start(t0);
        o.stop(t0 + len + 0.8); vib.stop(t0 + len + 0.8);
      }
    });
  }

  /** Accendino e fiammella della candela. */
  candle() {
    this.burst({ dur: 0.06, gain: 0.08, type: 'highpass', freq: 5000 });
    this.burst({ start: 0.08, dur: 0.5, gain: 0.04, type: 'bandpass', freq: 1200, q: 0.7 });
  }

  /** Scatto della telecamera del semaforo (T-red): clic dell'otturatore e fischio del flash che si ricarica. */
  cameraFlash() {
    if (!this.ready) return;
    this.burst({ dur: 0.025, gain: 0.12, type: 'highpass', freq: 3500 });
    this.burst({ start: 0.06, dur: 0.03, gain: 0.08, type: 'highpass', freq: 2800 });
    this.tone({ type: 'sine', freq: 2400, freqEnd: 5200, start: 0.1, dur: 0.6, gain: 0.025 });
  }

  /** Fontana: scroscio d'acqua continuo (volume 0 = spento). Chiamato ogni fotogramma con la distanza. */
  fountain(volume) {
    if (!this.ready) return;
    if (!this.fountainSrc) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.5;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfxBus);
      src.start();
      this.fountainSrc = src;
      this.fountainGain = g;
    }
    this.fountainGain.gain.setTargetAtTime(Math.max(0, Math.min(0.12, volume * 0.12)), this.ctx.currentTime, 0.2);
  }

  /* ---------- Barbiere ---------- */
  /** Forbici: coppie di "snip" metallici a ritmo irregolare. */
  scissors(seconds = 4) {
    if (!this.ready) return;
    let t = 0;
    while (t < seconds) {
      this.burst({ start: t, dur: 0.03, gain: 0.07, type: 'highpass', freq: 6000 });
      this.tone({ type: 'triangle', freq: rand(4200, 5200), start: t, dur: 0.04, gain: 0.02 });
      this.burst({ start: t + 0.09, dur: 0.03, gain: 0.06, type: 'highpass', freq: 6500 });
      t += rand(0.22, 0.5);
    }
  }

  /** Rasoio elettrico / tosatrice: ronzio a 120 Hz con armonici. */
  clipper(seconds = 3) {
    if (!this.ready) return;
    this.tone({ type: 'sawtooth', freq: 118, dur: seconds, gain: 0.035, attack: 0.05, release: seconds });
    this.tone({ type: 'square', freq: 236, dur: seconds, gain: 0.012, attack: 0.05, release: seconds });
    this.burst({ dur: seconds, gain: 0.02, type: 'bandpass', freq: 3800, q: 2 });
  }

  /* ---------- Varie ---------- */
  /** Sostanze: risucchio distorto e battito accelerato. */
  drugs() {
    if (!this.ready) return;
    this.tone({ type: 'sine', freq: 90, freqEnd: 900, dur: 1.4, gain: 0.05, reverb: 0.7 });
    this.tone({ type: 'triangle', freq: 1200, freqEnd: 140, start: 0.3, dur: 1.6, gain: 0.03, reverb: 0.7 });
    for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 60, start: 0.6 + i * 0.32, dur: 0.12, gain: 0.08 });
  }

  /**
   * Ambiente cittadino: eventi lontani e casuali sopra il brusio continuo (clacson in lontananza,
   * una sirena, un cane che abbaia, un motorino che passa, campane a mezzogiorno).
   */
  cityEvents(dt, active, hour = 12) {
    if (!this.ready || !active) return;
    this.cityT = (this.cityT ?? 6) - dt;
    if (this.cityT > 0) return;
    this.cityT = rand(5, 14);
    const r = Math.random();
    const night = hour < 6 || hour > 21;
    if (r < 0.3) this.npcHorn(Math.random() < 0.5 ? 'car' : 'scooter', rand(40, 65));
    else if (r < 0.42) {
      // Sirena lontana che sale e scende
      for (let i = 0; i < 3; i++) this.tone({ type: 'triangle', freq: 700, freqEnd: 1000, start: i * 0.9, dur: 0.85, gain: 0.012, reverb: 0.5 });
    } else if (r < 0.62) {
      // Cane che abbaia
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        this.tone({ type: 'sawtooth', freq: rand(320, 420), freqEnd: 180, start: i * 0.35, dur: 0.14, gain: 0.02, reverb: 0.3 });
        this.burst({ start: i * 0.35, dur: 0.1, gain: 0.015, type: 'bandpass', freq: 900, q: 2 });
      }
    } else if (r < 0.85 && !night) {
      // Motorino che passa in lontananza (effetto Doppler)
      this.tone({ type: 'square', freq: 190, freqEnd: 140, dur: 2.2, gain: 0.012, attack: 0.8, release: 2.2 });
    } else if (Math.abs(hour - 12) < 0.25) this.churchBells(3);
  }

  /** Esultanza (dono generoso). */
  cheer() {
    if (!this.ready) return;
    this.voice(false, 6);
    for (let i = 0; i < 3; i++) this.burst({ start: 0.2 + i * 0.12, dur: 0.05, gain: 0.05, type: 'bandpass', freq: 2500, q: 1 });
  }

  /** Clacson di un automobilista NPC (doppio colpo, volume in base alla distanza). */
  npcHorn(kind, distance = 10) {
    if (!this.ready) return;
    const k = Math.max(0.05, 1 - distance / 70);
    const moto = kind === 'scooter' || kind === 'moto';
    for (let i = 0; i < 2; i++) {
      for (const f of moto ? [520, 650] : [370, 466]) {
        this.tone({ type: moto ? 'square' : 'sawtooth', freq: f, start: i * 0.26, dur: 0.2, gain: (moto ? 0.03 : 0.05) * k, attack: 0.01 });
      }
    }
  }

  /** Urlo di paura (passanti in fuga). */
  scream(female = false) {
    if (!this.ready) return;
    const f0 = female ? 880 : 520;
    this.tone({ type: 'sawtooth', freq: f0, freqEnd: f0 * 1.35, dur: 0.55, gain: 0.04, attack: 0.03 });
    this.tone({ type: 'sine', freq: f0 * 2, freqEnd: f0 * 2.5, dur: 0.5, gain: 0.02, attack: 0.03 });
  }

  /* ---------- Radio di bordo: 4 stazioni procedurali ---------- */
  radioStart(index) {
    if (!this.ready) return;
    this.radioStop();
    const st = RADIO_STATIONS[index];
    if (!st) return;
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0.0001;
    out.gain.setTargetAtTime(0.9, this.t, 0.3);
    // "Altoparlanti dell'auto": un po' di filtro passa-banda
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = st.lofi ? 3200 : 9000;
    out.connect(hp).connect(lp).connect(this.musicBus);
    const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
    const env = (node, t, a, peak, dur) => {
      node.gain.setValueAtTime(0.0001, t);
      node.gain.exponentialRampToValueAtTime(peak, t + a);
      node.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    };
    const osc = (type, freq, t, dur, peak, a = 0.005, dest = out, detune = 0) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const g = c.createGain(); env(g, t, a, peak, dur);
      o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
    };
    const noise = (t, dur, peak, type, freq) => {
      const s = c.createBufferSource(); s.buffer = this.noiseBuf || (this.noiseBuf = this.makeNoise(1, 'white'));
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const g = c.createGain(); env(g, t, 0.002, peak, dur);
      s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    };
    const kick = (t) => {
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      const g = c.createGain(); env(g, t, 0.003, 0.5, 0.22);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    };
    const snare = (t, k = 1) => { noise(t, 0.16, 0.18 * k, 'bandpass', 1900); osc('triangle', 190, t, 0.08, 0.08 * k); };
    const hat = (t, open = false) => noise(t, open ? 0.2 : 0.04, 0.05, 'highpass', 7000);
    const step = 60 / st.bpm / 4; // sedicesimi
    let n = 0;
    let next = this.t + 0.12;
    const tick = () => {
      if (this.radio !== r) return;
      while (next < this.t + 0.35) {
        const bar = Math.floor(n / 16), s = n % 16;
        const chord = st.prog[bar % st.prog.length];
        const sw = st.swing && s % 2 === 1 ? step * 0.33 : 0;
        const t = next + sw;
        st.play({ t, s, bar, chord, midi, osc, kick, snare, hat, noise, step });
        next += step;
        n++;
      }
    };
    const r = { out, timer: null, index };
    this.radio = r;
    tick();
    r.timer = setInterval(tick, 90);
  }

  radioStop() {
    const r = this.radio;
    if (!r) return;
    this.radio = null;
    clearInterval(r.timer);
    r.out.gain.setTargetAtTime(0.0001, this.t, 0.15);
    setTimeout(() => { try { r.out.disconnect(); } catch (e) { /* già scollegato */ } }, 1200);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.musicMode = null;
    if (this.musicGain) {
      const g = this.musicGain;
      g.gain.setTargetAtTime(0.0001, this.t, 0.6);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* già scollegato */ } }, 4000);
      this.musicGain = null;
    }
  }
}

/**
 * Stazioni radio: ogni stazione suona in loop un brano procedurale (batteria, basso, accordi, melodia).
 * play() viene chiamata a ogni sedicesimo con il tempo di attacco t e la posizione s (0-15) nella battuta.
 */
export const RADIO_STATIONS = [
  {
    name: 'Paradise FM · Pop', bpm: 112,
    prog: [[60, 64, 67], [67, 71, 74], [57, 60, 64], [65, 69, 72]],
    play({ t, s, chord, midi, osc, kick, snare, hat, step }) {
      if (s % 4 === 0) kick(t);
      if (s === 4 || s === 12) snare(t);
      if (s % 2 === 0) hat(t, s === 14);
      if (s % 4 === 0 || s === 10) osc('triangle', midi(chord[0] - 24), t, step * 3.5, 0.16, 0.01);
      if (s === 0 || s === 8) for (const nn of chord) { osc('sawtooth', midi(nn), t, step * 7, 0.018, 0.03); osc('sawtooth', midi(nn), t, step * 7, 0.014, 0.03, undefined, 9); }
      const mel = [0, 2, 1, 2, 0, 1, 2, 1];
      if (s % 2 === 0 && Math.random() < 0.7) osc('square', midi(chord[mel[s / 2]] + 12), t, step * 1.6, 0.025);
    },
  },
  {
    name: 'Jazz Notturno', bpm: 96, swing: true,
    prog: [[62, 65, 69, 72], [67, 71, 74, 77], [60, 64, 67, 71], [57, 61, 64, 67]],
    play({ t, s, chord, midi, osc, kick, hat, noise, step }) {
      if (s % 4 === 0) osc('sine', midi(chord[(s / 4) % chord.length] - 24), t, step * 3.6, 0.2, 0.01);
      if (s % 4 === 0 || s % 4 === 3) noise(t, 0.25, 0.03, 'highpass', 6000);
      if (s === 0) kick(t);
      if (s === 2 || s === 10) for (const nn of chord) { osc('sine', midi(nn), t, step * 5, 0.03, 0.01); osc('triangle', midi(nn + 12), t, step * 2, 0.008, 0.005); }
      if (s % 2 === 1 && Math.random() < 0.45) osc('triangle', midi(chord[Math.floor(Math.random() * 4)] + 12), t, step * 1.8, 0.04, 0.01);
      if (s === 8 && Math.random() < 0.5) hat(t, true);
    },
  },
  {
    name: 'Lo-Fi Strada', bpm: 78, lofi: true,
    prog: [[57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62]],
    play({ t, s, chord, midi, osc, kick, snare, hat, noise, step }) {
      if (s === 0 || s === 7 || s === 10) kick(t);
      if (s === 4 || s === 12) snare(t, 0.7);
      if (s % 2 === 0) hat(t);
      if (s % 4 === 0) noise(t, step * 4, 0.006, 'bandpass', 3000); // fruscio del vinile
      if (s === 0) for (const nn of chord) osc('triangle', midi(nn), t, step * 15, 0.03, 0.08);
      if (s % 8 === 0) osc('sine', midi(chord[0] - 24), t, step * 7, 0.18, 0.02);
      if (s === 6 || s === 14) osc('sine', midi(chord[2] + 12), t, step * 3, 0.03, 0.02);
    },
  },
  {
    name: 'Rock Corsia', bpm: 138,
    prog: [[52, 59, 64], [55, 62, 67], [57, 64, 69], [50, 57, 62]],
    play({ t, s, chord, midi, osc, kick, snare, hat, step }) {
      if (s === 0 || s === 6 || s === 8 || s === 11) kick(t);
      if (s === 4 || s === 12) snare(t, 1.3);
      if (s % 2 === 0) hat(t, s === 6);
      if (s % 2 === 0) for (const nn of chord.slice(0, 2)) { osc('sawtooth', midi(nn - 12), t, step * 1.8, 0.035, 0.004); osc('square', midi(nn - 12), t, step * 1.8, 0.02, 0.004, undefined, 12); }
      if (s % 2 === 0) osc('triangle', midi(chord[0] - 24), t, step * 1.8, 0.14);
      if (s === 14 && Math.random() < 0.5) osc('sawtooth', midi(chord[2] + 12), t, step * 4, 0.03, 0.01);
    },
  },
];

export const audio = new AudioEngine();

/** Aggiunge suoni di hover/click a tutti i pulsanti dentro root. */
export function bindUiSounds(root) {
  if (!root || root.__uiSounds) return;
  root.__uiSounds = true;
  root.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled && !b.contains(e.relatedTarget)) audio.hover();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && !b.disabled) audio.click();
  });
}
