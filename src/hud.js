// HUD di gioco: identità, soldi, orologio, salute/stamina, tachimetro, prompt [E]/[F], azioni in corso, minimappa.
import { $ } from './ui.js';
import { formatMoney } from './birthdata.js';
import { MAP_ICONS, WORLD_EXT, URBAN_HALF } from './world.js';

const MAP_PPM = 1.2; // pixel per metro nell'immagine di sfondo
const EXT = WORLD_EXT;

const DISTRICT_COLORS = {
  rich: '#8b93a3', middle: '#9a9080', worker: '#7f8487', poor: '#8a7466', car: '#5a5f66', church: '#cfc3a8', suburb: '#c9a98a', villas: '#d8b894',
};

export class HUD {
  constructor(world) {
    this.world = world;
    this.root = $('hud');
    this.el = {
      name: $('hud-name'), city: $('hud-city'), district: $('hud-district'),
      money: $('hud-money'), age: $('hud-age'), day: $('hud-day'), clock: $('hud-clock'),
      res: $('hud-res'), car: $('hud-car'), rif: $('hud-rif'), save: $('hud-save'),
      health: $('vital-health'), healthV: $('vital-health-v'), stamina: $('vital-stamina'), staminaV: $('vital-stamina-v'),
      speed: $('hud-speed'), speedV: $('hud-speed-v'), speedName: $('hud-speed-name'),
      progress: $('action-progress'), progressBar: $('action-progress-bar'), progressText: $('action-progress-text'),
      prompt: $('interact-prompt'), promptE: $('prompt-e'), promptEText: $('prompt-e-text'), promptF: $('prompt-f'), promptFText: $('prompt-f-text'),
      minimap: $('minimap-wrap'), aura: $('hud-aura-v'), auraBar: $('hud-aura-bar'), level: $('hud-level'),
      levelBox: $('hud-aura-box'), drunkBox: $('hud-drunk'), drunkBar: $('hud-drunk-bar'), drunkV: $('hud-drunk-v'),
      date: $('hud-date'),
      wanted: $('hud-wanted'), crosshair: $('crosshair'), vehBar: $('hud-veh-bar'), vehV: $('hud-veh-v'),
    };
    this.wantedKey = '';
    this.levelTimer = null;
    this.canvas = $('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.last = {};
    this.textTimer = 0;
    this.saveTimer = null;
    this.buildMapImage();
  }

  buildMapImage() {
    const size = Math.ceil(EXT * 2 * MAP_PPM);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const tx = (v) => (v + EXT) * MAP_PPM;
    g.fillStyle = '#34502c';
    g.fillRect(0, 0, size, size);
    g.fillStyle = '#23262b';
    g.fillRect(tx(-URBAN_HALF - 8), tx(-URBAN_HALF - 8), (URBAN_HALF + 8) * 2 * MAP_PPM, (URBAN_HALF + 8) * 2 * MAP_PPM);
    const lake = this.world.mapData.lake;
    if (lake) { g.fillStyle = '#2f6f8f'; g.beginPath(); g.arc(tx(lake.x), tx(lake.z), lake.r * MAP_PPM, 0, Math.PI * 2); g.fill(); }
    for (const b of this.world.mapData.blocks) {
      g.fillStyle = b.park ? '#3f5f35' : '#4a4d52';
      g.fillRect(tx(b.x - b.size / 2), tx(b.z - b.size / 2), b.size * MAP_PPM, b.size * MAP_PPM);
    }
    for (const b of this.world.mapData.buildings) {
      g.fillStyle = DISTRICT_COLORS[b.district] || '#888';
      g.fillRect(tx(b.x - b.w / 2), tx(b.z - b.d / 2), b.w * MAP_PPM, b.d * MAP_PPM);
    }
    const icon = (x, z, type, r = 9) => {
      const ic = MAP_ICONS[type];
      if (!ic) return;
      g.fillStyle = ic.color;
      g.beginPath();
      g.arc(tx(x), tx(z), r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#111';
      g.font = `700 ${r + 2}px Inter, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ic.letter, tx(x), tx(z) + 1);
    };
    for (const a of this.world.atms) icon(a.mx, a.mz, 'atm', 6);
    for (const d of this.world.mapData.doors) icon(d.x, d.z + d.nz * 3, d.type, d.type === 'home' ? 11 : 9);
    this.mapImage = c;
  }

  setCharacter(character, city, family) {
    this.character = character;
    this.city = city;
    this.family = family;
    this.el.name.textContent = `${character.name} ${character.surname}`;
    this.el.city.textContent = `${city.city}, ${city.country}`;
    $('hud-family').textContent = family.label;
    this.setStats(character.stats);
  }

  setStats(stats) {
    this.el.res.style.width = stats.resistenza + '%';
    this.el.car.style.width = stats.carisma + '%';
    this.el.rif.style.width = stats.riflessi + '%';
  }

  setMinimapVisible(v) {
    this.el.minimap.classList.toggle('hidden', !v);
  }

  show() { this.root.classList.remove('hidden'); }
  hide() {
    this.root.classList.add('hidden');
    this.hidePrompt();
    this.setProgress(null);
    $('char-card').classList.add('hidden');
  }

  flashSave(ok) {
    this.el.save.textContent = ok ? 'Salvataggio automatico ✓' : 'Salvataggio non riuscito';
    this.el.save.classList.add('show');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.el.save.classList.remove('show'), 1800);
  }

  /** Animazione "livello raggiunto" sul riquadro Aura. */
  flashLevel(level) {
    this.el.level.textContent = String(level);
    this.el.levelBox.classList.remove('levelup');
    void this.el.levelBox.offsetWidth;
    this.el.levelBox.classList.add('levelup');
    clearTimeout(this.levelTimer);
    this.levelTimer = setTimeout(() => this.el.levelBox.classList.remove('levelup'), 2600);
  }

  /* ---------- Prompt [E] / [F] ---------- */
  setPrompts(eText, fText) {
    const key = `${eText}|${fText}`;
    if (this.promptKey === key) return;
    this.promptKey = key;
    this.el.promptE.classList.toggle('hidden', !eText);
    this.el.promptF.classList.toggle('hidden', !fText);
    if (eText) this.el.promptEText.textContent = eText;
    if (fText) this.el.promptFText.textContent = fText;
    this.el.prompt.classList.toggle('hidden', !eText && !fText);
  }

  /** Compatibilità: prompt solo [E]. */
  showPrompt(text) { this.setPrompts(text, null); }

  hidePrompt() { this.setPrompts(null, null); }

  /* ---------- Barra di avanzamento delle azioni (cure, scasso, pasto) ---------- */
  setProgress(k, text = '') {
    if (k === null || k === undefined) {
      this.el.progress.classList.add('hidden');
      return;
    }
    this.el.progress.classList.remove('hidden');
    this.el.progressBar.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
    if (this.last.progressText !== text) {
      this.last.progressText = text;
      this.el.progressText.textContent = text;
    }
  }

  /* ---------- Scheda personaggio [C] ---------- */
  toggleCard(force) {
    const card = $('char-card');
    const open = typeof force === 'boolean' ? force : card.classList.contains('hidden');
    if (open) this.renderCard(this.cardState || {});
    card.classList.toggle('hidden', !open);
    return open;
  }

  isCardOpen() {
    return !$('char-card').classList.contains('hidden');
  }

  renderCard({ money = 0, age = 18, aura = 50 } = {}) {
    const c = this.character;
    if (!c) return;
    const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const bday = c.birthday ? `${c.birthday.day} ${MONTHS[c.birthday.month]} ${c.birthYear}` : String(c.birthYear);
    const pathLabel = { studio: 'Studio', lavoro: 'Lavoro', strada: 'Strada' }[c.path] || '—';
    $('cc-name').textContent = `${c.name} ${c.surname}`;
    $('cc-sub').textContent = `${age} anni · nat${c.sex === 'f' ? 'a' : 'o'} il ${bday} · Aura ${Math.round(aura)}%`;
    const item = (k, v) => `<div class="cc-item"><span>${k}</span><b>${v}</b></div>`;
    $('cc-grid').innerHTML =
      item('Paese', this.city.country) +
      item('Città', this.city.city) +
      item('Famiglia', this.family.label) +
      item('Strada scelta', pathLabel) +
      item('Soldi a 18 anni', c.startMoney != null ? formatMoney(c.startMoney) : '—') +
      item('Contanti attuali', formatMoney(money));
    const b = c.birth;
    $('cc-birth').innerHTML = b
      ? item('Peso alla nascita', `${b.weightKg.toFixed(2).replace('.', ',')} kg`) +
        item('Gruppo sanguigno', b.blood) +
        item('Battito fetale', `${b.bpm} bpm`) +
        item('Genetica media', Math.round((b.genetics.resistenza + b.genetics.carisma + b.genetics.riflessi) / 3))
      : item('Dati di nascita', 'non disponibili');
    const rows = [['Resistenza', 'resistenza'], ['Carisma', 'carisma'], ['Riflessi', 'riflessi']];
    $('cc-stats').innerHTML = rows.map(([label, k]) => {
      const now = c.stats[k];
      const born = b ? b.genetics[k] : now;
      return `<div class="cc-stat"><span>${label}</span><div class="bar"><i style="width:${now}%"></i><u style="left:${born}%"></u></div><b>${born} → ${now}</b></div>`;
    }).join('');
    const tags = c.background && c.background.length ? c.background : ['Nessun evento particolare'];
    $('cc-tags').innerHTML = tags.map((t) => `<span>${String(t).replace(/</g, '&lt;')}</span>`).join('');
  }

  setText(key, value) {
    if (this.last[key] !== value) {
      this.last[key] = value;
      this.el[key].textContent = value;
    }
  }

  update(dt, s) {
    this.cardState = { money: s.money, age: s.age, aura: s.aura };
    // Salute e stamina (ogni frame: le barre devono essere fluide)
    const hp = s.health / s.maxHealth;
    this.el.health.style.transform = `scaleX(${hp})`;
    this.el.health.classList.toggle('low', hp < 0.3);
    this.el.stamina.style.transform = `scaleX(${s.stamina / s.maxStamina})`;
    this.el.stamina.classList.toggle('low', s.exhausted);
    // Aura (in alto a sinistra) e ubriachezza
    this.el.auraBar.style.transform = `scaleX(${Math.max(0, Math.min(1, s.aura / 100))})`;
    const drunk = s.drunk || 0;
    this.el.drunkBox.classList.toggle('hidden', drunk < 0.5);
    if (drunk >= 0.5) {
      this.el.drunkBar.style.transform = `scaleX(${Math.min(1, drunk / 50)})`;
      this.el.drunkBox.classList.toggle('danger', drunk > 35);
    }
    // Stelle della polizia (lampeggiano quando ti stanno perdendo di vista) e mirino
    const wkey = `${s.stars || 0}|${!!s.starsBlink}`;
    if (wkey !== this.wantedKey) {
      this.wantedKey = wkey;
      this.el.wanted.classList.toggle('hidden', !s.stars);
      this.el.wanted.classList.toggle('blink', !!s.starsBlink);
      [...this.el.wanted.children].forEach((c, i) => c.classList.toggle('on', i < (s.stars || 0)));
    }
    this.el.crosshair.classList.toggle('hidden', !s.crosshair);
    // Tachimetro e salute del veicolo
    if (s.vehicle) {
      this.el.speed.classList.remove('hidden');
      this.setText('speedV', String(Math.round(Math.abs(s.vehicle.speed) * 3.6)));
      this.setText('speedName', s.vehicle.name);
      const vh = s.vehicleHealth ?? 100;
      this.el.vehBar.style.transform = `scaleX(${Math.max(0, vh / 100)})`;
      this.el.vehBar.className = vh < 25 ? 'crit' : vh < 55 ? 'low' : '';
      this.setText('vehV', vh <= 0 ? 'GUASTO' : `${Math.round(vh)}%`);
    } else {
      this.el.speed.classList.add('hidden');
    }
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.2;
      if (this.isCardOpen()) this.renderCard(this.cardState);
      this.setText('money', formatMoney(s.money));
      this.setText('age', `${s.age} anni`);
      this.setText('day', `Giorno ${s.day}`);
      const hh = Math.floor(s.hour);
      const mm = Math.floor((s.hour - hh) * 60);
      this.setText('clock', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
      this.setText('district', s.district);
      this.setText('healthV', String(Math.round(s.health)));
      this.setText('staminaV', String(Math.round(s.stamina)));
      this.setText('aura', `${Math.round(s.aura)}%`);
      this.setText('level', String(s.auraLevel || 0));
      this.setText('drunkV', `${Math.round(s.drunk || 0)}%`);
      if (s.date) {
        this.setText('date', s.date);
        this.el.date.classList.toggle('red', !!s.redDay);
      }
    }
    this.drawMinimap(s.x, s.z, s.facing, s.camYaw, s.police || []);
  }

  drawMinimap(x, z, facing, camYaw, police = []) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const scale = 0.84 * (2 / MAP_PPM) / 2;
    ctx.save();
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(camYaw);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(this.mapImage, -(x + EXT) * MAP_PPM, -(z + EXT) * MAP_PPM);
    // Volanti della polizia: punti rossi/blu lampeggianti
    const blink = Math.floor(performance.now() / 250) % 2;
    for (const p of police) {
      ctx.fillStyle = blink ? '#ff3b3b' : '#3b7bff';
      ctx.beginPath();
      ctx.arc((p.x - x) * MAP_PPM, (p.z - z) * MAP_PPM, 6 / scale, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.rotate(Math.PI - facing);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(camYaw);
    ctx.translate(0, -(H / 2 - 12));
    ctx.rotate(-camYaw);
    ctx.fillStyle = '#f0b43c';
    ctx.font = '600 12px Oswald, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', 0, 0);
    ctx.restore();
  }
}
