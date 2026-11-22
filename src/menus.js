// Menu ESC (Mappa · Impostazioni · Statistiche/Aura) e menu TAB (Inventario · Portafoglio · Telefono).
import { itemInfo, CATEGORY_LABELS, ITEMS } from './items.js';
import { formatMoney } from './birthdata.js';
import { MAP_ICONS, HALF, ROAD, BUILDING_TYPES } from './world.js';
import { $ } from './ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EXT = HALF + ROAD / 2 + 30;

/* =====================================================================
   ESC: mappa grande, impostazioni, statistiche
   ===================================================================== */
export class EscMenu {
  constructor(game) {
    this.game = game;
    this.root = $('esc-menu');
    this.tab = 'map';
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-esc]');
      if (!t) return;
      const a = t.dataset.esc;
      if (a === 'tab') { this.tab = t.dataset.tab; this.render(); }
      else if (a === 'resume') this.game.resume();
      else if (a === 'save') this.game.manualSave();
      else if (a === 'menu') this.game.exitToMenu();
    });
    this.root.addEventListener('input', (e) => this.onSetting(e));
    this.root.addEventListener('change', (e) => this.onSetting(e));
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(tab) {
    if (tab) this.tab = tab;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.root.classList.add('hidden');
  }

  render() {
    const tabs = [['map', 'Mappa'], ['settings', 'Impostazioni'], ['stats', 'Statistiche']];
    this.root.innerHTML = `
      <div class="menu-shell">
        <div class="menu-tabs">
          <div class="menu-brand">STREET <em>for</em> PARADISE</div>
          ${tabs.map(([id, l]) => `<button class="menu-tab ${this.tab === id ? 'on' : ''}" data-esc="tab" data-tab="${id}">${l}</button>`).join('')}
          <div class="menu-spacer"></div>
          <button class="btn-ghost" data-esc="save">Salva</button>
          <button class="btn-ghost" data-esc="menu">Menu principale</button>
          <button class="btn-solid" data-esc="resume">Riprendi</button>
        </div>
        <div class="menu-page" id="esc-page"></div>
      </div>`;
    const page = $('esc-page');
    if (this.tab === 'map') this.renderMap(page);
    else if (this.tab === 'settings') this.renderSettings(page);
    else this.renderStats(page);
  }

  renderMap(page) {
    page.innerHTML = `<div class="map-wrap"><canvas id="big-map" width="900" height="900"></canvas>
      <div class="map-legend">${Object.entries(MAP_ICONS).map(([k, v]) => `<span><i style="background:${v.color}">${esc(v.letter)}</i>${esc(k === 'atm' ? 'Bancomat' : (BUILDING_TYPES[k] ? BUILDING_TYPES[k].name : k))}</span>`).join('')}
      <span><i style="background:#ffffff;border-radius:50%"></i>Persone</span><span><i style="background:#c9a77a;border-radius:50%"></i>Senzatetto</span><span><i style="background:#4fd1c5"></i>Tuoi veicoli</span></div></div>`;
    this.drawMap($('big-map'));
  }

  drawMap(canvas) {
    const g = canvas.getContext('2d');
    const S = canvas.width;
    const k = S / (EXT * 2);
    const tx = (v) => (v + EXT) * k;
    const md = this.game.world.mapData;
    g.fillStyle = '#1c1f24';
    g.fillRect(0, 0, S, S);
    for (const b of md.blocks) {
      g.fillStyle = b.park ? '#3f5f35' : '#3a3d42';
      g.fillRect(tx(b.x - b.size / 2), tx(b.z - b.size / 2), b.size * k, b.size * k);
    }
    for (const b of md.buildings) {
      g.fillStyle = b.district === 'car' ? '#50555c' : b.district === 'church' ? '#cfc3a8' : '#6f7378';
      g.fillRect(tx(b.x - b.w / 2), tx(b.z - b.d / 2), b.w * k, b.d * k);
    }
    // Persone e senzatetto
    for (const d of this.game.npcs.mapDots()) {
      g.fillStyle = d.kind === 'homeless' ? '#c9a77a' : 'rgba(255,255,255,0.75)';
      g.beginPath();
      g.arc(tx(d.x), tx(d.z), d.kind === 'homeless' ? 4 : 2.5, 0, Math.PI * 2);
      g.fill();
    }
    // Veicoli del giocatore
    for (const v of this.game.ownedVehicles()) {
      g.fillStyle = '#4fd1c5';
      g.fillRect(tx(v.x) - 4, tx(v.z) - 4, 8, 8);
    }
    // Edifici utili e bancomat
    const icon = (x, z, type) => {
      const ic = MAP_ICONS[type];
      if (!ic) return;
      g.fillStyle = ic.color;
      g.beginPath();
      g.arc(tx(x), tx(z), 11, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111';
      g.font = '700 12px Inter, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(ic.letter, tx(x), tx(z) + 1);
    };
    for (const a of this.game.world.atms) icon(a.mx, a.mz, 'atm');
    for (const d of md.doors) icon(d.x, d.z + d.nz * 3, d.type);
    // Giocatore
    const p = this.game.mapPosition();
    g.save();
    g.translate(tx(p.x), tx(p.z));
    g.rotate(Math.PI - this.game.player.facing);
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
    g.fillText(`${this.game.city.city} · ${this.game.currentPlaceName()}`, 14, 22);
  }

  renderSettings(page) {
    const s = this.game.settings;
    page.innerHTML = `<div class="settings">
      <label>Sensibilità del mouse <input type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}" data-set="sensitivity"><b>${s.sensitivity.toFixed(2)}×</b></label>
      <label>Inverti asse Y <input type="checkbox" ${s.invertY ? 'checked' : ''} data-set="invertY"></label>
      <label>Campo visivo (FOV) <input type="range" min="50" max="90" step="1" value="${s.fov}" data-set="fov"><b>${s.fov}°</b></label>
      <label>Ombre <select data-set="shadows">${[['high', 'Alte'], ['low', 'Basse'], ['off', 'Disattivate']].map(([v, l]) => `<option value="${v}" ${s.shadows === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Qualità grafica <select data-set="quality">${[['high', 'Alta'], ['medium', 'Media'], ['low', 'Bassa']].map(([v, l]) => `<option value="${v}" ${s.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Minimappa <input type="checkbox" ${s.showMinimap ? 'checked' : ''} data-set="showMinimap"></label>
      <p class="muted">Le impostazioni vengono salvate automaticamente su questo browser.</p>
    </div>`;
  }

  onSetting(e) {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'range') value = Number(el.value);
    else value = el.value;
    this.game.applySetting(key, value);
    const b = el.parentElement.querySelector('b');
    if (b && key === 'sensitivity') b.textContent = value.toFixed(2) + '×';
    if (b && key === 'fov') b.textContent = value + '°';
  }

  renderStats(page) {
    const st = this.game.state;
    const c = this.game.character;
    const aura = Math.round(st.aura);
    const log = st.auraLog.map((l) => `<li class="${l.delta >= 0 ? 'plus' : 'minus'}"><b>${l.delta >= 0 ? '+' : ''}${l.delta}</b> ${esc(l.reason)}</li>`).join('') || '<li class="muted">Nessuna azione rilevante finora.</li>';
    const row = (k, v) => `<div class="cc-item"><span>${k}</span><b>${v}</b></div>`;
    page.innerHTML = `<div class="stats-page">
      <div class="aura-card">
        <div class="aura-head"><span>AURA</span><b>${aura}%</b></div>
        <div class="aura-bar"><i style="width:${aura}%"></i></div>
        <div class="aura-title">${esc(st.auraTitle())}</div>
        <p class="muted">L'Aura sale con le opere buone (carità, onestà, preghiera, onorare i genitori) e scende con i peccati (furto, inganno, violenza), secondo i Dieci Comandamenti e la dottrina cattolica.</p>
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
        ${row('Preghiere', st.stats.prayers)}${row('Notti dormite', st.stats.nightsSlept)}
      </div>
    </div>`;
  }
}

/* =====================================================================
   TAB: inventario, portafoglio, telefono
   ===================================================================== */
export class TabMenu {
  constructor(game) {
    this.game = game;
    this.root = $('tab-menu');
    this.tab = 'inventory';
    this.phoneScreen = 'home';
    this.root.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tb]');
      if (t) this.onAction(t.dataset.tb, t.dataset);
    });
  }

  get isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open(tab) {
    if (tab) this.tab = tab;
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.root.classList.add('hidden');
    this.game.player.phone = false;
  }

  render() {
    const st = this.game.state;
    const tabs = [['inventory', 'Inventario'], ['wallet', 'Portafoglio'], ['phone', 'Telefono']];
    // Con la scheda Telefono aperta il personaggio tiene lo smartphone in mano (posa + oggetto)
    this.game.player.phone = this.tab === 'phone';
    this.game.player.updateHeld(this.game.state.equipped);
    this.root.innerHTML = `
      <div class="tab-shell">
        <div class="tab-head">
          ${tabs.map(([id, l]) => `<button class="menu-tab ${this.tab === id ? 'on' : ''}" data-tb="tab" data-tab="${id}">${l}</button>`).join('')}
          <div class="menu-spacer"></div>
          <div class="tab-money">${formatMoney(st.cash)}</div>
          <button class="btn-ghost" data-tb="close">Chiudi [TAB]</button>
        </div>
        <div class="tab-page" id="tab-page"></div>
      </div>`;
    const page = $('tab-page');
    if (this.tab === 'inventory') this.renderInventory(page);
    else if (this.tab === 'wallet') this.renderWallet(page);
    else this.renderPhone(page);
  }

  renderInventory(page) {
    const st = this.game.state;
    const groups = st.groupedInventory();
    const order = ['cibo', 'medicinali', 'attrezzi', 'armi', 'varie', 'documenti', 'vestiti'];
    page.innerHTML = `<div class="inv-grid">${order.filter((k) => groups[k] && groups[k].length).map((k) => `
      <div class="inv-group"><div class="shop-section">${esc(CATEGORY_LABELS[k])}</div>
        ${groups[k].map((it) => {
          let actions = '';
          if (k === 'cibo') actions = `<button class="btn-solid small" data-tb="use" data-id="${it.id}">Mangia/Bevi</button>`;
          else if (k === 'medicinali') actions = `<button class="btn-solid small" data-tb="use" data-id="${it.id}">Usa</button>`;
          else if (ITEMS[it.id] && ITEMS[it.id].hold) actions = `<button class="btn-ghost small" data-tb="equip" data-id="${it.id}">${st.equipped === it.id ? 'Riponi' : 'Impugna'}</button>`;
          else if (k === 'vestiti') actions = `<button class="btn-ghost small" data-tb="wear" data-id="${it.id}" ${it.worn ? 'disabled' : ''}>${it.worn ? 'Indossato' : 'Indossa'}</button>`;
          else if (it.id === 'carta_credito') actions = `<button class="btn-ghost small" data-tb="pin">Mostra PIN</button>`;
          return `<div class="inv-row"><span class="inv-icon">${it.icon || '📦'}</span><div class="shop-info"><b>${esc(it.name)}</b><span>${esc(it.desc || '')}</span></div><span class="shop-owned">${k === 'vestiti' ? '' : 'x' + it.qty}</span>${actions}</div>`;
        }).join('')}</div>`).join('') || '<p class="muted">Inventario vuoto. Fai acquisti nei negozi della città.</p>'}</div>
      <p class="muted" id="inv-msg"></p>`;
  }

  renderWallet(page) {
    const st = this.game.state;
    const near = this.game.nearestNpcForGift();
    page.innerHTML = `<div class="wallet">
      <div class="wallet-cash"><span>Contanti nel portafoglio</span><b>${formatMoney(st.cash)}</b></div>
      <div class="wallet-cards">
        <div class="credit-card ${st.bank.account && st.has('carta_credito') ? '' : 'off'}">
          <div class="cc-chip"></div><div class="cc-num">•••• •••• •••• 7312</div>
          <div class="cc-owner">${esc(this.game.character.name)} ${esc(this.game.character.surname)}</div>
          <div class="cc-bal">${st.bank.account ? 'Saldo conto ' + formatMoney(st.bank.balance) : 'Nessun conto: vai in banca'}</div>
        </div>
      </div>
      <div class="shop-section">Cedi / dona soldi</div>
      ${near
        ? `<p>Vicino a te: <b>${esc(near.name)}</b>${near.kind === 'homeless' ? ' (senzatetto)' : ''}.</p><div class="chips">${[2, 5, 10, 20, 50, 100].map((a) => `<button class="chip" data-tb="give" data-a="${a}" ${st.cash < a ? 'disabled' : ''}>${formatMoney(a)}</button>`).join('')}</div>
           ${near.kind === 'homeless' ? '<button class="btn-ghost" data-tb="donatemore">Dona cibo, vestiti, oggetti o veicoli…</button>' : ''}`
        : '<p class="muted">Avvicinati a una persona (entro 3 metri) per cederle del denaro.</p>'}
      <p class="muted" id="inv-msg"></p>
    </div>`;
  }

  renderPhone(page) {
    const st = this.game.state;
    const contacts = [
      ['mom', '👩', 'Mamma', 'Chiama casa'],
      ['dealer', '🚗', 'Concessionario', 'Ordina un veicolo con consegna'],
      ['bank', '🏦', 'Banca', 'Saldo e informazioni'],
      ['taxi', '🚕', 'Radio Taxi', 'Portami a…'],
      ['pizza', '🍕', 'Pizzeria Vesuvio', 'Consegna a domicilio'],
      ['police', '🚓', 'Polizia 112', 'Emergenze'],
      ['ambulance', '🚑', 'Ambulanza 118', 'Soccorso sanitario'],
    ];
    let screen = '';
    if (this.phoneScreen === 'home') {
      screen = `<div class="ph-apps">
        <button data-tb="ph" data-s="contacts"><span>📞</span>Contatti</button>
        <button data-tb="ph" data-s="notes"><span>📝</span>Note</button>
        <button data-tb="ph" data-s="map"><span>🗺️</span>Mappa</button>
        <button data-tb="ph" data-s="aura"><span>✨</span>Aura</button></div>`;
    } else if (this.phoneScreen === 'contacts') {
      screen = `<div class="ph-list">${contacts.map(([id, ic, name, sub]) => `<button data-tb="call" data-id="${id}"><span>${ic}</span><b>${name}</b><small>${sub}</small></button>`).join('')}</div>`;
    } else if (this.phoneScreen === 'notes') {
      screen = `<div class="ph-note"><b>Note</b><p>${st.bank.pin ? `PIN carta di credito: <b>${st.bank.pin}</b>` : 'Nessuna nota. Apri un conto in banca per ricevere la carta.'}</p><p>Casa: quartiere ${esc(this.game.homeDistrictName())}.</p></div>`;
    } else if (this.phoneScreen === 'aura') {
      screen = `<div class="ph-note"><b>Aura ${Math.round(st.aura)}%</b><div class="aura-bar"><i style="width:${Math.round(st.aura)}%"></i></div><p>${esc(st.auraTitle())}</p></div>`;
    } else if (this.phoneScreen === 'taxi') {
      screen = `<div class="ph-list">${this.game.world.doors.map((d, i) => `<button data-tb="taxi" data-i="${i}"><span>📍</span><b>${esc(d.name)}</b><small>${formatMoney(this.game.taxiFare(d))}</small></button>`).join('')}</div>`;
    } else if (this.phoneScreen === 'call') {
      screen = `<div class="ph-call"><div class="ph-avatar">${this.callIcon}</div><b>${esc(this.callName)}</b><p>${this.callText}</p></div>`;
    } else if (this.phoneScreen === 'map') {
      screen = `<div class="ph-note"><b>Mappa</b><p>La mappa grande è nel menu <b>ESC → Mappa</b>.</p><p>Ti trovi a: ${esc(this.game.currentPlaceName())}</p></div>`;
    }
    page.innerHTML = `<div class="phone-wrap"><div class="phone">
      <div class="ph-status"><span>${this.game.clockText()}</span><span>📶 🔋</span></div>
      <div class="ph-screen">${screen}</div>
      <div class="ph-nav"><button data-tb="ph" data-s="home">◯</button>${this.phoneScreen !== 'home' ? '<button data-tb="ph" data-s="back">‹ Indietro</button>' : ''}</div>
    </div><p class="muted">Il personaggio tiene il telefono in mano mentre è aperto.</p></div>`;
  }

  /** Mostra una "chiamata" sul telefono. */
  call(icon, name, text) {
    this.callIcon = icon;
    this.callName = name;
    this.callText = text;
    this.phoneScreen = 'call';
    this.render();
  }

  onAction(a, d) {
    const g = this.game;
    const st = g.state;
    const msg = (t) => { const el = $('inv-msg'); if (el) el.textContent = t; };
    switch (a) {
      case 'tab': this.tab = d.tab; this.phoneScreen = 'home'; this.render(); break;
      case 'close': g.closeTabMenu(); break;
      case 'use': {
        const r = g.useItem(d.id);
        this.render();
        msg(r);
        break;
      }
      case 'equip':
        st.equipped = st.equipped === d.id ? null : d.id;
        g.player.updateHeld(st.equipped);
        this.render();
        break;
      case 'wear': {
        const info = itemInfo(d.id);
        st.outfit[info.slot] = d.id;
        g.refreshOutfit();
        this.render();
        break;
      }
      case 'pin':
        msg(st.bank.pin ? `PIN della carta: ${st.bank.pin}` : 'Nessun PIN.');
        break;
      case 'give': {
        const npc = g.nearestNpcForGift();
        const amount = Number(d.a);
        if (npc && st.pay(amount)) {
          g.onDonate(npc, { kind: 'money', amount });
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
      case 'ph':
        this.phoneScreen = d.s === 'back' ? (this.phoneScreen === 'taxi' || this.phoneScreen === 'call' ? 'contacts' : 'home') : d.s;
        this.render();
        break;
      case 'call': g.phoneCall(d.id, this); break;
      case 'taxi': g.taxiTo(g.world.doors[Number(d.i)]); break;
      default: break;
    }
  }
}
