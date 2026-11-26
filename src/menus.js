// ESC: mappa a schermo intero (il gioco continua) con pulsante PAUSA (impostazioni, statistiche, torna al menù).
// TAB: inventario compatto al centro (stile GTA V) + telefono piccolo in basso a sinistra.
import { itemInfo, CATEGORY_LABELS, ITEMS } from './items.js';
import { formatMoney } from './birthdata.js';
import { MAP_ICONS, WORLD_EXT, URBAN_HALF, BUILDING_TYPES } from './world.js';
import { settingsFormHtml, bindSettingsForm, loadSettings } from './settings.js';
import { audio, bindUiSounds } from './audio.js';
import { $, confirmDialog } from './ui.js';
import { rewardFor, levelTitle, MAX_AURA_LEVEL, PARADISE_LEVEL, PARADISE_PREVIEW_LEVEL } from './aura.js';
import { tr } from './i18n.js';
import { saintForLevel, saintFallbackImage, fetchSaintImage } from './saints.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EXT = WORLD_EXT;

/* =====================================================================
   ESC: Mappa (live) · Statistiche · PAUSA
   ===================================================================== */
export class EscMenu {
  constructor(game) {
    this.game = game;
    this.root = $('esc-menu');
    this.view = 'map'; // 'map' | 'stats' | 'pause'
    this.redraw = 0;
    bindUiSounds(this.root);
    this._onClick = (e) => {
      const t = e.target.closest('[data-esc]');
      if (!t) return;
      const a = t.dataset.esc;
      if (a === 'view') this.setView(t.dataset.view);
      else if (a === 'pause') this.setView('pause');
      else if (a === 'resume') this.game.resume();
      else if (a === 'save') this.game.manualSave();
      else if (a === 'menu') this.askMainMenu();
    };
    this.root.addEventListener('click', this._onClick);
  }

  /** Smonta i listener (gli elementi HTML restano: li riusa la prossima partita). */
  dispose() {
    this.root.removeEventListener('click', this._onClick);
    this.root.classList.add('hidden');
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(view = 'map') {
    this.root.classList.remove('hidden');
    this.setView(view);
  }

  close() {
    this.root.classList.add('hidden');
    if (this.unbindSettings) { this.unbindSettings(); this.unbindSettings = null; }
    this.game.setPaused(false);
  }

  setView(view) {
    this.view = view;
    // Solo la vista PAUSA ferma davvero il gioco
    this.game.setPaused(view === 'pause');
    this.render();
  }

  async askMainMenu() {
    const ok = await confirmDialog({
      title: 'Torna al menù principale',
      text: 'Sei sicuro di voler tornare al menù principale? I progressi vengono salvati automaticamente.',
      ok: 'Sì, torna al menù',
      cancel: 'Annulla',
    });
    if (ok) this.game.exitToMenu();
  }

  render() {
    if (this.unbindSettings) { this.unbindSettings(); this.unbindSettings = null; }
    const v = this.view;
    this.root.innerHTML = `
      <div class="menu-shell">
        <div class="menu-tabs">
          <div class="menu-brand">STREET <em>for</em> PARADISE</div>
          <button class="menu-tab ${v === 'map' ? 'on' : ''}" data-esc="view" data-view="map">Mappa</button>
          <button class="menu-tab ${v === 'stats' ? 'on' : ''}" data-esc="view" data-view="stats">Statistiche</button>
          <div class="menu-spacer"></div>
          ${v === 'pause' ? '<span class="paused-badge">IN PAUSA</span>' : '<span class="live-badge">● Il gioco continua</span>'}
          <button class="btn-pausa ${v === 'pause' ? 'on' : ''}" data-esc="pause">❚❚ PAUSA</button>
          <button class="btn-solid" data-esc="resume">Torna al gioco [Esc]</button>
        </div>
        <div class="menu-page" id="esc-page"></div>
      </div>`;
    const page = $('esc-page');
    if (v === 'map') this.renderMap(page);
    else if (v === 'stats') this.renderStats(page);
    else this.renderPause(page);
  }

  /** Chiamato ogni frame dal gioco: la mappa è "live". */
  update(dt) {
    if (!this.isOpen || this.view !== 'map') return;
    this.redraw -= dt;
    if (this.redraw <= 0) {
      this.redraw = 0.25;
      const c = $('big-map');
      if (c) this.drawMap(c);
    }
  }

  renderMap(page) {
    page.innerHTML = `<div class="map-wrap"><canvas id="big-map" width="900" height="900"></canvas>
      <div class="map-legend">${Object.entries(MAP_ICONS).map(([k, v]) => `<span><i style="background:${v.color}">${esc(v.letter)}</i>${esc(k === 'atm' ? 'Bancomat' : k === 'monument' ? 'Piazza del Monumento' : (BUILDING_TYPES[k] ? BUILDING_TYPES[k].name : k))}</span>`).join('')}
      <span><i style="background:#ffffff;border-radius:50%"></i>Persone</span><span><i style="background:#c9a77a;border-radius:50%"></i>Senzatetto</span><span><i style="background:#4fd1c5"></i>Tuoi veicoli</span></div></div>`;
    this.drawMap($('big-map'));
  }

  drawMap(canvas) {
    const g = canvas.getContext('2d');
    const S = canvas.width;
    const k = S / (EXT * 2);
    const tx = (v) => (v + EXT) * k;
    const md = this.game.world.mapData;
    g.fillStyle = '#34502c';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#1c1f24';
    g.fillRect(tx(-URBAN_HALF - 8), tx(-URBAN_HALF - 8), (URBAN_HALF + 8) * 2 * k, (URBAN_HALF + 8) * 2 * k);
    if (md.lake) { g.fillStyle = '#2f6f8f'; g.beginPath(); g.arc(tx(md.lake.x), tx(md.lake.z), md.lake.r * k, 0, Math.PI * 2); g.fill(); }
    for (const b of md.blocks) {
      g.fillStyle = b.park ? '#3f5f35' : '#3a3d42';
      g.fillRect(tx(b.x - b.size / 2), tx(b.z - b.size / 2), b.size * k, b.size * k);
    }
    for (const b of md.buildings) {
      g.fillStyle = b.district === 'car' ? '#50555c' : b.district === 'church' ? '#cfc3a8' : b.district === 'suburb' ? '#b09075' : '#6f7378';
      g.fillRect(tx(b.x - b.w / 2), tx(b.z - b.d / 2), b.w * k, b.d * k);
    }
    if (md.plaza) {
      const p = md.plaza;
      g.fillStyle = '#1c1f24';
      g.fillRect(tx(p.x - 7), tx(p.z + p.half), 14 * k, (p.roadZ0 - p.z - p.half) * k);
      g.fillStyle = '#b9ad97';
      g.fillRect(tx(p.x - p.half), tx(p.z - p.half), p.half * 2 * k, p.half * 2 * k);
    }
    for (const d of this.game.npcs.mapDots()) {
      g.fillStyle = d.kind === 'homeless' ? '#c9a77a' : 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(tx(d.x), tx(d.z), d.kind === 'homeless' ? 4 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    for (const v of this.game.ownedVehicles()) {
      g.fillStyle = '#4fd1c5';
      g.fillRect(tx(v.x) - 4, tx(v.z) - 4, 8, 8);
    }
    const icon = (x, z, type) => {
      const ic = MAP_ICONS[type];
      if (!ic) return;
      g.fillStyle = ic.color;
      g.beginPath();
      g.arc(tx(x), tx(z), 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = '700 12px Inter, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ic.letter, tx(x), tx(z) + 1);
    };
    for (const a of this.game.world.atms) icon(a.mx, a.mz, 'atm');
    for (const d of md.doors) icon(d.x, d.z + d.nz * 3, d.type);
    for (const l of md.landmarks || []) icon(l.x, l.z, l.type);
    const p = this.game.mapPosition();
    g.save();
    g.translate(tx(p.x), tx(p.z));
    g.rotate(Math.PI - (this.game.driving ? this.game.driving.heading : this.game.player.facing));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -13); g.lineTo(9, 10); g.lineTo(0, 5); g.lineTo(-9, 10); g.closePath();
    g.stroke(); g.fill();
    g.restore();
    g.fillStyle = '#f0b43c';
    g.font = '600 13px Inter, sans-serif';
    g.textAlign = 'left';
    g.fillText(tr(`${this.game.city.city} · ${this.game.currentPlaceName()} · ${this.game.clockText()}`), 14, 22);
  }

  renderPause(page) {
    page.innerHTML = `<div class="pause-grid">
      <div class="pause-col">
        <div class="pause-title">Pausa</div>
        <p class="muted">Il tempo di gioco è fermo. Premi «Torna al gioco» o Esc per riprendere.</p>
        <button class="btn-pause" data-esc="resume">Riprendi</button>
        <button class="btn-pause" data-esc="save">Salva partita</button>
        <button class="btn-pause" data-esc="view" data-view="stats">Statistiche</button>
        <button class="btn-pause danger" data-esc="menu">Torna al menù principale</button>
      </div>
      <div class="pause-col"><div class="pause-title small">Impostazioni</div><div id="pause-settings">${settingsFormHtml(loadSettings())}</div></div>
    </div>`;
    this.unbindSettings = bindSettingsForm($('pause-settings'));
  }

  renderStats(page) {
    const st = this.game.state;
    const c = this.game.character;
    const aura = Math.round(st.aura);
    const log = st.auraLog.map((l) => `<li class="${l.delta >= 0 ? 'plus' : 'minus'}"><b>${l.delta >= 0 ? '+' : ''}${l.delta}</b> ${esc(l.reason)}</li>`).join('') || '<li class="muted">Nessuna azione rilevante finora.</li>';
    const row = (k, v) => `<div class="cc-item"><span>${k}</span><b>${v}</b></div>`;
    page.innerHTML = `<div class="stats-page">
      <div class="aura-card">
        <div class="aura-head"><span>AURA · LIVELLO ${st.auraLevel} / ${MAX_AURA_LEVEL}</span><b>${aura}%</b></div>
        <div class="aura-bar"><i style="width:${aura}%"></i></div>
        <div class="aura-title">${esc(levelTitle(st.auraLevel))} · ${esc(st.auraTitle())}</div>
        <p class="muted">L'Aura sale con le opere buone (carità, onestà, preghiera, Messa, confessione) e scende con i peccati (furto, inganno, violenza, ubriachezza), secondo i Dieci Comandamenti. Ogni volta che la barra arriva al 100% sali di un Livello Aura: riscatta le ricompense nell'app «Livelli» del telefono. Dal livello ${PARADISE_PREVIEW_LEVEL} intravedi il Paradiso in chiesa, al livello ${PARADISE_LEVEL} incontri Gesù e i tuoi genitori. Se non vai in chiesa per 7 giorni perdi Aura; la Messa nei giorni in rosso del calendario vale +5 Aura extra.</p>
        <ul class="aura-log">${log}</ul>
      </div>
      <div class="stats-grid">
        ${row('Età', `${this.game.age} anni`)}${row('Giorno', this.game.day)}
        ${row('Salute', `${Math.round(st.health)} / ${st.maxHealth}`)}${row('Stamina', `${Math.round(st.stamina)} / ${st.maxStamina}`)}
        ${row('Contanti', formatMoney(st.cash))}${row('Conto in banca', st.bank.account ? formatMoney(st.bank.balance) : 'Nessun conto')}
        ${row('Resistenza', c.stats.resistenza)}${row('Carisma', c.stats.carisma)}
        ${row('Riflessi', c.stats.riflessi)}${row('Veicoli posseduti', this.game.ownedVehicles().length)}
        ${row('Buone azioni', st.stats.goodDeeds)}${row('Cattive azioni', st.stats.badDeeds)}
        ${row('Donazioni', `${st.stats.donations} (${formatMoney(st.stats.donatedMoney)})`)}${row('Pasti al ristorante', st.stats.meals)}
        ${row('Veicoli rubati', st.stats.stolenVehicles)}${row('Notti in prigione', st.stats.arrests)}
        ${row('Preghiere e Messe', st.stats.prayers)}${row('Notti dormite', st.stats.nightsSlept)}
        ${row('Ultima visita in chiesa', this.game.day - st.lastChurchDay === 0 ? 'Oggi' : `${this.game.day - st.lastChurchDay} giorni fa`)}${row('Case di proprietà', st.houses.length)}
        ${row('Meccanico', st.jobs.mechanic ? `Assunto · ${st.jobs.repairs} riparazioni` : 'Non assunto')}${row('Guadagni in officina', formatMoney(st.jobs.earned))}
        ${row('Rapine e scassi', st.stats.robberies)}${row('Colpi sparati', st.stats.shots)}
        ${row('Debito', st.cash < 0 ? formatMoney(-st.cash) : 'Nessuno')}${row('Penalità Aura a zero', st.stats.debtPenalties || 0)}
        ${row('Felicità', `${st.happinessIcon()} ${Math.round(st.happiness)}% · ${esc(st.happinessTitle())}`)}${row('Veicoli in garage', `${this.game.garage.vehicles().length} / ${this.game.garage.capacity}`)}
      </div>
    </div>`;
  }
}

/* =====================================================================
   TAB: inventario compatto (stile GTA V) + portafoglio.
   Il telefono è un oggetto dell'inventario: si apre solo cliccandolo.
   ===================================================================== */
const CATS = [['all', 'Tutto'], ['cibo', 'Cibo'], ['medicinali', 'Medicine'], ['attrezzi', 'Attrezzi'], ['armi', 'Armi'], ['vestiti', 'Vestiti'], ['varie', 'Varie'], ['illegali', 'Illegali'], ['documenti', 'Documenti']];

/** App del telefono (schermata Home), in ordine di griglia. */
const PHONE_APPS = [
  ['contacts', '📞', 'Telefono', '#2f9e5b'],
  ['map', '🗺️', 'Mappa', '#2b6cb0'],
  ['garage', '🚗', 'Garage', '#d69e2e'],
  ['dealer', '🏬', 'Auto & Moto', '#4a5568'],
  ['wallet', '💳', 'Wallet', '#1a202c'],
  ['taxi', '🚕', 'Taxi', '#f2c200'],
  ['aura', '✨', 'Aura', '#6b46c1'],
  ['levels', '🏆', 'Livelli', '#c05621'],
  ['mood', '😊', 'Umore', '#d53f8c'],
  ['memories', '🖼️', 'Ricordi', '#2c7a7b'],
  ['notes', '📝', 'Note', '#b7791f'],
];
const PHONE_TITLES = {
  contacts: 'Telefono', garage: 'Garage', wallet: 'Wallet', taxi: 'Radio Taxi', aura: 'Aura', levels: 'Livelli Aura',
  mood: 'Umore', memories: 'Ricordi', notes: 'Note', call: 'Chiamata in corso', saint: 'Santo del livello',
};

export class TabMenu {
  constructor(game) {
    this.game = game;
    this.root = $('tab-menu');
    this.phoneRoot = $('phone-dock');
    this.cat = 'all';
    this.selected = null;
    this.phoneScreen = 'home';
    this.phoneStack = [];
    this.phoneOpen = false;
    bindUiSounds(this.root);
    bindUiSounds(this.phoneRoot);
    this._onClick = (e) => {
      const t = e.target.closest('[data-tb]');
      if (t) this.onAction(t.dataset.tb, t.dataset);
    };
    this.root.addEventListener('click', this._onClick);
    this.phoneRoot.addEventListener('click', this._onClick);
    // Navigazione da tastiera nel telefono: Backspace = indietro (H resta il clacson)
    this._onKey = (e) => {
      if (!this.phoneOpen || this.game.blockingUis()) return;
      if (e.code === 'Backspace') { e.preventDefault(); this.phoneBack(); }
    };
    window.addEventListener('keydown', this._onKey);
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  /** Smonta i listener: una nuova partita crea il proprio menu sugli stessi elementi HTML. */
  dispose() {
    this.root.removeEventListener('click', this._onClick);
    this.phoneRoot.removeEventListener('click', this._onClick);
    window.removeEventListener('keydown', this._onKey);
    this.root.classList.add('hidden');
    this.phoneRoot.classList.add('hidden');
    this.phoneOpen = false;
  }

  /** TAB: solo l'inventario (se avevi il telefono in mano, lo riponi). */
  open() {
    this.root.classList.remove('hidden');
    this.closePhone(true);
    this.render();
  }

  /** Chiude l'inventario: il telefono, se in mano, resta aperto in basso a sinistra. */
  close() {
    this.root.classList.add('hidden');
  }

  /**
   * Impugna e apre il telefono (clic sull'oggetto Telefono): l'inventario si chiude da solo e il telefono resta
   * in basso a sinistra; si continua a camminare, guidare e interagire (il mouse resta libero per toccarlo).
   */
  openPhone() {
    if (this.phoneOpen) return;
    this.phoneOpen = true;
    this.phoneScreen = 'home';
    this.phoneStack = [];
    this.phoneRoot.classList.remove('hidden');
    this.game.openUi('phone');
    this.game.player.phone = true;
    this.game.player.updateHeld(this.game.state.equipped);
    this.renderPhone();
    if (this.isOpen) this.game.closeTabMenu();
    audio.phoneNotify();
  }

  /** Ripone il telefono in tasca. */
  closePhone(silent = false) {
    const was = this.phoneOpen;
    this.phoneOpen = false;
    this.phoneRoot.classList.add('hidden');
    this.game.player.phone = false;
    if (!was) return;
    this.game.player.updateHeld(this.game.state.equipped);
    if (!silent && this.isOpen) this.render();
    this.game.closeUi('phone');
  }

  phoneGo(screen, reset = false) {
    if (reset) this.phoneStack = [];
    else if (screen !== this.phoneScreen) this.phoneStack.push(this.phoneScreen);
    this.phoneScreen = screen;
    this.renderPhone();
  }

  phoneBack() {
    this.phoneScreen = this.phoneStack.pop() || 'home';
    this.renderPhone();
  }

  render() {
    const st = this.game.state;
    const groups = st.groupedInventory();
    let items = [];
    for (const [cat, list] of Object.entries(groups)) for (const it of list) items.push({ ...it, cat });
    if (this.cat !== 'all') items = items.filter((i) => i.cat === this.cat);
    const sel = this.selected ? items.find((i) => i.id === this.selected) : null;
    const near = this.game.nearestNpcForGift();
    this.root.innerHTML = `
      <div class="inv-panel">
        <div class="inv-head">
          <div><div class="inv-title">Inventario</div><div class="muted">Clicca un oggetto per usarlo · 📱 Telefono per aprirlo · TAB per chiudere</div></div>
          <div class="inv-wallet"><span>Portafoglio</span><b>${formatMoney(st.cash)}</b>${st.bank.account ? `<small>Conto ${formatMoney(st.bank.balance)}</small>` : ''}</div>
        </div>
        <div class="inv-cats">${CATS.map(([id, l]) => `<button class="${this.cat === id ? 'on' : ''}" data-tb="cat" data-cat="${id}">${l}</button>`).join('')}</div>
        <div class="inv-tiles">${items.map((it) => (it.id === 'telefono' ? `
          <button class="inv-tile phone-tile ${this.phoneOpen ? 'on worn' : ''}" data-tb="phone" title="Clicca per aprire o riporre il telefono">
            <span class="t-ico">📱</span><span class="t-name">${esc(it.name)}</span><span class="t-qty">${this.phoneOpen ? 'In mano' : 'Apri'}</span>
          </button>` : `
          <button class="inv-tile ${this.selected === it.id ? 'on' : ''} ${it.worn || st.equipped === it.id ? 'worn' : ''}" data-tb="sel" data-id="${it.id}">
            <span class="t-ico">${it.icon || '📦'}</span><span class="t-name">${esc(it.name)}</span>${it.cat !== 'vestiti' ? `<span class="t-qty">x${it.qty}</span>` : ''}
          </button>`)).join('') || '<p class="muted">Nessun oggetto in questa categoria.</p>'}</div>
        <div class="inv-detail">${sel ? this.detailHtml(sel) : '<span class="muted" style="grid-column: 1 / -1">Seleziona un oggetto per usarlo, impugnarlo o indossarlo.</span>'}</div>
        <div class="inv-give">
          ${near
            ? `<span>Vicino a te: <b>${esc(near.name)}</b>${near.kind === 'homeless' ? ' (senzatetto)' : ''}</span>
               <div class="chips">${[2, 5, 10, 20, 50].map((a) => `<button class="chip" data-tb="give" data-a="${a}" ${st.cash < a ? 'disabled' : ''}>Dona ${formatMoney(a)}</button>`).join('')}
               ${near.kind === 'homeless' ? '<button class="chip" data-tb="donatemore">Altri doni…</button>' : ''}</div>`
            : '<span class="muted">Avvicinati a una persona per cederle denaro.</span>'}
        </div>
        <p class="inv-msg" id="inv-msg"></p>
      </div>`;
  }

  detailHtml(it) {
    const st = this.game.state;
    let actions = '';
    if (it.cat === 'cibo') actions = `<button class="btn-solid small" data-tb="use" data-id="${it.id}">Mangia / Bevi</button>`;
    else if (it.cat === 'medicinali') actions = `<button class="btn-solid small" data-tb="use" data-id="${it.id}">Usa</button>`;
    else if (it.cat === 'illegali') actions = `<button class="btn-solid small danger" data-tb="use" data-id="${it.id}">Assumi</button>`;
    else if (ITEMS[it.id] && ITEMS[it.id].helmet) actions = `<button class="btn-solid small" data-tb="helmet" data-id="${it.id}">${st.helmet === it.id ? 'Non usarlo più' : 'Usa in moto'}</button>`;
    else if (ITEMS[it.id] && ITEMS[it.id].hold) actions = `<button class="btn-solid small" data-tb="equip" data-id="${it.id}">${st.equipped === it.id ? 'Riponi' : 'Impugna'}</button>`;
    else if (it.cat === 'vestiti') actions = `<button class="btn-solid small" data-tb="wear" data-id="${it.id}" ${it.worn ? 'disabled' : ''}>${it.worn ? 'Indossato' : 'Indossa'}</button>`;
    else if (it.id === 'carta_credito') actions = '<button class="btn-ghost small" data-tb="pin">Mostra PIN</button>';
    return `<div class="det-ico">${it.icon || '📦'}</div><div class="det-info"><b>${esc(it.name)}</b><span>${esc(it.desc || '')}${it.heal ? ` · +${it.heal} salute` : ''}</span></div>${actions}`;
  }

  renderPhone() {
    if (!this.phoneOpen) return;
    const st = this.game.state;
    const g = this.game;
    const groups = [
      ['Persone', [['priest', '⛪', 'Don Michele', 'Parroco · conforto e preghiera']]],
      ['Servizi', [
        ['dealer', '🚗', 'Concessionario', 'Ordina un veicolo: arriva nel garage'],
        ['bank', '🏦', 'Banca', 'Saldo e informazioni'],
        ['taxi', '🚕', 'Radio Taxi', 'Portami a…'],
        ['pizza', '🍕', 'Pizzeria Vesuvio', 'Consegna a domicilio'],
      ]],
      ['Emergenze', [
        ['police', '🚓', 'Polizia 112', 'Emergenze'],
        ['ambulance', '🚑', 'Ambulanza 118', 'Soccorso sanitario'],
      ]],
    ];
    const section = (title, inner) => `<div class="ph-sec">${esc(title)}</div>${inner}`;
    const row = (attrs, icon, title, sub, right = '') => `<button class="ph-row" ${attrs}><span class="ph-ri">${icon}</span><span class="ph-rt"><b>${esc(title)}</b>${sub ? `<small>${sub}</small>` : ''}</span>${right ? `<em>${right}</em>` : '<em>›</em>'}</button>`;
    let screen = '';
    if (this.phoneScreen === 'home') {
      const badge = { levels: this.game.pendingRewards().length > 0, garage: false };
      screen = `<div class="ph-clock">${g.clockText()}<small>${esc(g.currentPlaceName())}</small></div>
        <div class="ph-apps">${PHONE_APPS.map(([id, ic, label, color]) => `<button data-tb="app" data-s="${id}" class="${badge[id] ? 'badge' : ''}"><span style="background:${color}">${ic}</span>${esc(label)}</button>`).join('')}</div>`;
    } else if (this.phoneScreen === 'levels') {
      const lvl = st.auraLevel;
      const upTo = Math.min(MAX_AURA_LEVEL, Math.max(lvl + 5, 10));
      const rows = [];
      for (let l = 1; l <= upTo; l++) {
        const r = rewardFor(l);
        const claimed = st.rewardsClaimed.includes(l);
        const status = claimed
          ? '<em class="lv-done">✓ Riscattata</em>'
          : l <= lvl ? `<span class="chip lv-claim" data-tb="claim" data-l="${l}">Riscatta</span>` : '<em class="lv-lock">🔒</em>';
        const saint = saintForLevel(l);
        rows.push(`<div class="lv-row ${l <= lvl ? 'on' : ''}"><b>${l}</b><span>${esc(r.label)}${saint ? `<button class="lv-saint" data-tb="saint" data-l="${l}">✝ ${esc(saint.name)}</button>` : ''}</span>${status}</div>`);
      }
      if (upTo < MAX_AURA_LEVEL) {
        const r = rewardFor(MAX_AURA_LEVEL);
        rows.push(`<div class="lv-row final"><b>${MAX_AURA_LEVEL}</b><span>${esc(r.label)}</span><em class="lv-lock">🔒</em></div>`);
      }
      screen = `<div class="ph-note lv-head"><b>Livello Aura ${lvl} / ${MAX_AURA_LEVEL}</b><small>${esc(levelTitle(lvl))} · barra ${Math.round(st.aura)}%</small>
        <div class="aura-bar"><i style="width:${Math.round(st.aura)}%"></i></div></div>
        <div class="lv-list">${rows.join('')}</div><p class="lv-msg" id="lv-msg">${esc(this.levelMsg || '')}</p>`;
    } else if (this.phoneScreen === 'contacts') {
      screen = groups.map(([title, list]) => section(title, `<div class="ph-list">${list.map(([id, ic, name, sub]) => row(`data-tb="call" data-id="${id}"`, ic, name, esc(sub), '📞')).join('')}</div>`)).join('');
    } else if (this.phoneScreen === 'garage') {
      const owned = g.ownedVehicles();
      const garaged = owned.filter((v) => v.inGarage);
      const outside = owned.filter((v) => !v.inGarage);
      const icon = (k) => ({ bike: '🚲', scooter: '🛵', moto: '🏍️' }[k] || '🚗');
      const f = g.mapPosition();
      screen = `<div class="ph-card"><b>Garage di casa</b><small>Box occupati ${garaged.length}/${g.garage.capacity} · G sulla mappa</small></div>
        ${section('Nel garage', `<div class="ph-list">${garaged.map((v) => row('data-tb="noop"', icon(v.kind), v.name, `Condizioni ${Math.round(v.health)}%`, '🅿️')).join('') || '<p class="ph-empty">Nessun veicolo nei box.</p>'}</div>`)}
        ${section('In città', `<div class="ph-list">${outside.map((v) => row('data-tb="noop"', icon(v.kind), v.name, `a ${Math.round(Math.hypot(v.x - f.x, v.z - f.z))} m · ${Math.round(v.health)}%`, '📍')).join('') || '<p class="ph-empty">Nessun veicolo parcheggiato fuori.</p>'}</div>`)}
        <button class="ph-btn" data-tb="app" data-s="dealer">Ordina un veicolo (consegna in garage)</button>`;
    } else if (this.phoneScreen === 'notes') {
      screen = `<div class="ph-card"><b>Note</b>
        <p>${st.bank.pin ? `PIN carta: <b>${st.bank.pin}</b>` : 'Apri un conto in banca per ricevere la carta.'}</p>
        <p>Casa: ${esc(g.homeDistrictName())} · Garage accanto alla porta di casa.</p>
        <p>Comandi: E interagisci · F veicolo · Q/E marce (cambio manuale) · TAB inventario · ESC mappa.</p></div>`;
    } else if (this.phoneScreen === 'memories') {
      screen = `<div class="ph-card"><b>Ricordi</b><p>Mamma e papà ti guardano da lassù. Al Livello Aura ${PARADISE_LEVEL} potrai incontrare Gesù e rivivere i ricordi d'infanzia in Paradiso, dalla chiesa.</p><p>Livello attuale: ${st.auraLevel} · Aura ${Math.round(st.aura)}%</p></div>`;
    } else if (this.phoneScreen === 'aura') {
      const since = g.day - st.lastChurchDay;
      screen = `<div class="ph-card"><b>Aura ${Math.round(st.aura)}% · Liv. ${st.auraLevel}</b><div class="aura-bar"><i style="width:${Math.round(st.aura)}%"></i></div><p>${esc(st.auraTitle())}</p>
        <p>Ultima volta in chiesa: ${since === 0 ? 'oggi' : `${since} giorni fa`}${since >= 5 ? ' — torna presto o perderai Aura!' : ''}</p></div>
        ${section('Ultime azioni', `<ul class="ph-log">${st.auraLog.slice(0, 6).map((l) => `<li class="${l.delta >= 0 ? 'plus' : 'minus'}"><b>${l.delta >= 0 ? '+' : ''}${l.delta}</b> ${esc(l.reason)}</li>`).join('') || '<li class="ph-empty">Nessuna azione rilevante finora.</li>'}</ul>`)}`;
    } else if (this.phoneScreen === 'mood') {
      const h = Math.round(st.happiness);
      screen = `<div class="ph-card"><b>${st.happinessIcon()} Felicità ${h}%</b><div class="aura-bar happy"><i style="width:${h}%"></i></div><p>${esc(st.happinessTitle())}</p>
        <p class="ph-tip">Sale con cibo buono, pasti al ristorante, sonno, Messa, opere di bene, acquisti e tuning. Scende con incidenti, ferite, arresti e svenimenti.</p></div>
        ${section('Ultimi momenti', `<ul class="ph-log">${st.happyLog.slice(0, 6).map((l) => `<li class="${l.delta >= 0 ? 'plus' : 'minus'}"><b>${l.delta >= 0 ? '+' : ''}${l.delta}</b> ${esc(l.reason)}</li>`).join('') || '<li class="ph-empty">Niente di particolare.</li>'}</ul>`)}`;
    } else if (this.phoneScreen === 'wallet') {
      screen = `<div class="ph-card wallet"><small>Contanti</small><b>${formatMoney(st.cash)}</b></div>
        <div class="ph-card wallet"><small>Conto corrente</small><b>${st.bank.account ? formatMoney(st.bank.balance) : '—'}</b>${st.bank.account ? '' : '<p>Nessun conto: aprilo in banca per avere la carta.</p>'}</div>
        ${section('Patrimonio', `<div class="ph-list">${row('data-tb="noop"', '🏠', 'Case di proprietà', '', String(st.houses.length))}${row('data-tb="app" data-s="garage"', '🚗', 'Veicoli', '', String(g.ownedVehicles().length))}</div>`)}`;
    } else if (this.phoneScreen === 'taxi') {
      // Taxi giallo: arriva sulla strada davanti a te; sali dietro con F e scegli la destinazione a bordo
      const t = g.taxi;
      const status = { idle: 'Nessun taxi in arrivo.', arriving: 'Il taxi giallo sta arrivando…', waiting: 'Il taxi ti aspetta: sali dietro con F.', boarded: 'Sei a bordo.', riding: `In viaggio · tassametro ${formatMoney(t.fareFor(t.meter))}`, leaving: 'Il taxi sta ripartendo.' }[t.state] || '';
      screen = `<div class="ph-card"><b>🚕 Radio Taxi</b><small>${esc(status)}</small>
          <p class="ph-tip">Corsa da € 10 a € 200 in base alla strada percorsa. Durante il viaggio: E salta il viaggio, F scendi.</p></div>
        <button class="ph-btn" data-tb="calltaxi" ${t.state === 'idle' ? '' : 'disabled'}>Chiama un taxi giallo</button>`;
    } else if (this.phoneScreen === 'saint') {
      // Scheda del Santo del livello: immagine dal web (Wikipedia) con ritratto di ripiego sempre disponibile
      const l = this.saintLevel || 1;
      const s = saintForLevel(l);
      const reached = st.auraLevel >= l;
      const fallback = saintFallbackImage(s, l);
      screen = `<div class="saint-card">
          <div class="saint-img"><img id="saint-img" alt="" src="${fallback}" data-l="${l}"></div>
          <div class="saint-level">Livello ${l}${reached ? ' · raggiunto' : ' · da raggiungere'}</div>
          <b class="saint-name">${esc(s.name)}</b>
          <small class="saint-feast">Festa: ${esc(s.feast)} · ${esc(s.patron)}</small>
          <p class="saint-bio">${esc(s.bio)}</p>
          <div class="saint-nav"><button data-tb="saint" data-l="${Math.max(1, l - 1)}" ${l <= 1 ? 'disabled' : ''}>‹ Precedente</button><button data-tb="saint" data-l="${Math.min(99, l + 1)}" ${l >= 99 ? 'disabled' : ''}>Successivo ›</button></div>
        </div>`;
    } else if (this.phoneScreen === 'call') {
      screen = `<div class="ph-call"><div class="ph-avatar">${this.callIcon}</div><b>${esc(this.callName)}</b><p>${this.callText}</p><button class="ph-btn end" data-tb="hangup">Riaggancia</button></div>`;
    }
    const title = this.phoneScreen === 'home' ? '' : `<div class="ph-head"><button data-tb="back" aria-label="Indietro">‹</button><span>${esc(PHONE_TITLES[this.phoneScreen] || '')}</span><button data-tb="home" aria-label="Home">⌂</button></div>`;
    this.phoneRoot.innerHTML = `<div class="phone small">
      <div class="ph-status"><span>${g.clockText()}</span><span>📶 5G 🔋</span></div>
      ${title}
      <div class="ph-screen ${this.phoneScreen === 'home' ? 'home' : ''}">${screen}</div>
      <div class="ph-nav"><button data-tb="back" title="Indietro (Backspace)">‹</button><button data-tb="home" title="Home">◯</button><button data-tb="phoneclose" title="Riponi il telefono">✕</button></div>
    </div>`;
    // Immagine del Santo: si carica dal web e sostituisce il ritratto di ripiego solo se arriva davvero
    if (this.phoneScreen === 'saint') {
      const l = this.saintLevel || 1;
      fetchSaintImage(saintForLevel(l)).then((src) => {
        const img = this.phoneRoot.querySelector('#saint-img');
        if (!src || !img || Number(img.dataset.l) !== l) return;
        const probe = new Image();
        probe.referrerPolicy = 'no-referrer';
        probe.onload = () => { if (img.isConnected) img.src = src; };
        probe.src = src;
      });
    }
  }

  /** Mostra una "chiamata" sul telefono (lo apre se era in tasca). */
  call(icon, name, text) {
    if (!this.phoneOpen) this.openPhone();
    this.callIcon = icon;
    this.callName = name;
    this.callText = text;
    this.phoneGo('call');
    audio.phoneRing();
    setTimeout(() => audio.voice(Math.random() < 0.5, 10), 1200);
  }

  onAction(a, d) {
    const g = this.game;
    const st = g.state;
    const msg = (t) => { const el = $('inv-msg'); if (el) el.textContent = t; };
    switch (a) {
      case 'cat': this.cat = d.cat; this.selected = null; this.render(); break;
      case 'sel': this.selected = d.id; this.render(); break;
      case 'use': { const r = g.useItem(d.id); this.render(); msg(r); break; }
      case 'equip':
        st.equipped = st.equipped === d.id ? null : d.id;
        g.player.updateHeld(st.equipped);
        this.render();
        break;
      case 'wear': {
        const info = itemInfo(d.id);
        st.outfit[info.slot] = d.id;
        g.refreshOutfit();
        g.player.phone = this.phoneOpen;
        g.player.updateHeld(st.equipped);
        this.render();
        break;
      }
      case 'helmet':
        st.helmet = st.helmet === d.id ? null : d.id;
        this.render();
        msg(st.helmet ? `${itemInfo(d.id).name}: lo indosserai ogni volta che sali in sella.` : 'Niente casco: attento alle cadute!');
        break;
      case 'pin': msg(st.bank.pin ? `PIN della carta: ${st.bank.pin}` : 'Nessun PIN.'); break;
      case 'give': {
        const npc = g.nearestNpcForGift();
        const amount = Number(d.a);
        if (npc && st.pay(amount)) {
          g.onDonate(npc, { kind: 'money', amount });
          audio.cash();
          this.render();
          msg(`Hai dato ${formatMoney(amount)} a ${npc.name}.`);
        }
        break;
      }
      case 'donatemore': {
        const npc = g.nearestNpcForGift();
        g.closeTabMenu();
        if (npc) g.dialogs.donate(npc);
        break;
      }
      case 'phone':
        if (this.phoneOpen) this.closePhone(); else this.openPhone();
        break;
      case 'phoneclose': this.closePhone(); break;
      case 'home': this.phoneGo('home', true); break;
      case 'back': this.phoneBack(); break;
      case 'hangup': this.phoneBack(); break;
      case 'app':
        if (d.s === 'map') { g.closeTabMenu(); g.openMap(); }
        else if (d.s === 'dealer') { g.closeTabMenu(); g.dialogs.dealer(true); }
        else this.phoneGo(d.s);
        break;
      case 'saint':
        this.saintLevel = Number(d.l);
        if (this.phoneScreen === 'saint') this.renderPhone(); else this.phoneGo('saint');
        break;
      case 'claim':
        this.levelMsg = g.claimReward(Number(d.l));
        if (this.isOpen) { this.render(); this.renderPhone(); }
        break;
      case 'call': g.phoneCall(d.id, this); break;
      case 'calltaxi': g.taxi.call(); this.renderPhone(); break;
      default: break;
    }
  }
}
