// HUD di gioco: nome, luogo, soldi, età, orologio, statistiche e minimappa.
import { $ } from './ui.js';
import { formatMoney } from './birthdata.js';
import { HALF, ROAD } from './world.js';

const MAP_PPM = 2; // pixel per metro nell'immagine di sfondo
const EXT = HALF + ROAD / 2 + 30;

const DISTRICT_COLORS = {
  rich: '#8b93a3',
  middle: '#9a9080',
  worker: '#7f8487',
  poor: '#8a7466',
  car: '#5a5f66',
};

export class HUD {
  constructor(world) {
    this.world = world;
    this.root = $('hud');
    this.el = {
      name: $('hud-name'), city: $('hud-city'), district: $('hud-district'),
      money: $('hud-money'), age: $('hud-age'), day: $('hud-day'), clock: $('hud-clock'),
      res: $('hud-res'), car: $('hud-car'), rif: $('hud-rif'), save: $('hud-save'),
    };
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
    g.fillStyle = '#23262b';
    g.fillRect(0, 0, size, size);
    for (const b of this.world.mapData.blocks) {
      g.fillStyle = b.park ? '#3f5f35' : '#4a4d52';
      g.fillRect(tx(b.x - b.size / 2), tx(b.z - b.size / 2), b.size * MAP_PPM, b.size * MAP_PPM);
    }
    for (const b of this.world.mapData.buildings) {
      g.fillStyle = DISTRICT_COLORS[b.district] || '#888';
      g.fillRect(tx(b.x - b.w / 2), tx(b.z - b.d / 2), b.w * MAP_PPM, b.d * MAP_PPM);
    }
    const hosp = this.world.mapData.hospital;
    if (hosp) {
      g.fillStyle = '#e23b3b';
      g.fillRect(tx(hosp.x) - 10, tx(hosp.z) - 3, 20, 6);
      g.fillRect(tx(hosp.x) - 3, tx(hosp.z) - 10, 6, 20);
    }
    const doorColors = { hospital: '#ff5a5a', market: '#7dff9a', bank: '#f0c860', bar: '#ff6fae', garage: '#8fd0ff' };
    for (const d of this.world.mapData.doors) {
      if (d.type === 'home') continue;
      g.fillStyle = doorColors[d.type] || '#ffffff';
      g.beginPath();
      g.arc(tx(d.x), tx(d.z + 2), 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 2;
      g.stroke();
    }
    const home = this.world.mapData.home;
    if (home) {
      g.fillStyle = '#f0b43c';
      g.beginPath();
      g.moveTo(tx(home.x), tx(home.z) - 12);
      g.lineTo(tx(home.x) + 10, tx(home.z) - 2);
      g.lineTo(tx(home.x) - 10, tx(home.z) - 2);
      g.closePath();
      g.fill();
      g.fillRect(tx(home.x) - 7, tx(home.z) - 2, 14, 10);
    }
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

  /* ---------- Prompt interazione [E] ---------- */
  showPrompt(text) {
    const el = $('interact-prompt');
    if (this.promptText !== text) {
      this.promptText = text;
      $('interact-text').textContent = text;
    }
    el.classList.remove('hidden');
  }

  hidePrompt() {
    this.promptText = null;
    $('interact-prompt').classList.add('hidden');
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

  renderCard({ money = 0, age = 18 } = {}) {
    const c = this.character;
    if (!c) return;
    const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
    const bday = c.birthday ? `${c.birthday.day} ${MONTHS[c.birthday.month]} ${c.birthYear}` : String(c.birthYear);
    const pathLabel = { studio: 'Studio', lavoro: 'Lavoro', strada: 'Strada' }[c.path] || '—';
    $('cc-name').textContent = `${c.name} ${c.surname}`;
    $('cc-sub').textContent = `${age} anni · nat${c.sex === 'f' ? 'a' : 'o'} il ${bday}`;
    const item = (k, v) => `<div class="cc-item"><span>${k}</span><b>${v}</b></div>`;
    $('cc-grid').innerHTML =
      item('Paese', this.city.country) +
      item('Città', this.city.city) +
      item('Famiglia', this.family.label) +
      item('Strada scelta', pathLabel) +
      item('Soldi a 18 anni', c.startMoney != null ? formatMoney(c.startMoney) : '—') +
      item('Soldi attuali', formatMoney(money));
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
    $('cc-tags').innerHTML = tags.map((t) => `<span>${t.replace(/</g, '&lt;')}</span>`).join('');
  }

  setStats(stats) {
    this.el.res.style.width = stats.resistenza + '%';
    this.el.car.style.width = stats.carisma + '%';
    this.el.rif.style.width = stats.riflessi + '%';
  }

  show() { this.root.classList.remove('hidden'); }
  hide() {
    this.root.classList.add('hidden');
    this.hidePrompt();
    $('char-card').classList.add('hidden');
  }

  flashSave(ok) {
    this.el.save.textContent = ok ? 'Salvataggio automatico ✓' : 'Salvataggio non riuscito';
    this.el.save.classList.add('show');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.el.save.classList.remove('show'), 1800);
  }

  setText(key, value) {
    if (this.last[key] !== value) {
      this.last[key] = value;
      this.el[key].textContent = value;
    }
  }

  update(dt, { money, age, day, hour, district, x, z, facing, camYaw }) {
    this.cardState = { money, age };
    this.textTimer -= dt;
    if (this.textTimer <= 0) {
      this.textTimer = 0.2;
      if (this.isCardOpen()) this.renderCard(this.cardState);
      this.setText('money', formatMoney(money));
      this.setText('age', `${age} anni`);
      this.setText('day', `Giorno ${day}`);
      const hh = Math.floor(hour);
      const mm = Math.floor((hour - hh) * 60);
      this.setText('clock', `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
      this.setText('district', district);
    }
    this.drawMinimap(x, z, facing, camYaw);
  }

  drawMinimap(x, z, facing, camYaw) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const scale = 0.42; // pixel canvas per pixel immagine
    ctx.save();
    ctx.fillStyle = '#1b1d21';
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(camYaw); // la direzione della camera punta verso l'alto
    ctx.save();
    ctx.scale(scale, scale);
    ctx.drawImage(this.mapImage, -(x + EXT) * MAP_PPM, -(z + EXT) * MAP_PPM);
    ctx.restore();
    // Freccia del giocatore
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
    // Nord
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
