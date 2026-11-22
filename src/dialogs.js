// Finestre di dialogo del gameplay: negozi, concessionario, banca, ATM, menù ristorante, scontrino, donazioni, guardaroba.
import { ITEMS, CLOTHES, CLOTH_SLOTS, VEHICLE_MODELS, MENUS, SHOP_STOCK, DRINKS, itemInfo } from './items.js';
import { calendarHtml, dayInfo, formatDate, MONTHS_IT } from './calendar.js';
import { formatMoney } from './birthdata.js';
import { $ } from './ui.js';
import { audio, bindUiSounds } from './audio.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class Dialogs {
  /**
   * @param {object} game  espone: state, ui (openUi/closeUi), toast(text), onPurchaseVehicle(model,color,delivery),
   *                       refreshOutfit(), applyAura(delta, reason), onDonate(npc, gift)
   */
  constructor(game) {
    this.game = game;
    this.root = $('dialog');
    this.box = $('dialog-box');
    this.openFlag = false;
    this.onClose = null;
    this.payMethod = 'cash';
    this._onKey = (e) => {
      if (!this.openFlag) return;
      if (e.code === 'Escape' && !this.locked) { e.preventDefault(); this.close(); }
      if (this.keyHandler) this.keyHandler(e);
    };
    window.addEventListener('keydown', this._onKey);
    bindUiSounds(this.root);
    this.root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn && this.handlers && this.handlers[btn.dataset.act]) this.handlers[btn.dataset.act](btn.dataset, btn);
    });
  }

  get isOpen() {
    return this.openFlag;
  }

  /** Apre la finestra: title, subtitle, html del corpo, handlers per i data-act. */
  show({ title, subtitle = '', body, handlers = {}, locked = false, wide = false, onClose = null, keyHandler = null }) {
    this.handlers = { close: () => this.close(), ...handlers };
    this.locked = locked;
    this.onClose = onClose;
    this.keyHandler = keyHandler;
    this.box.classList.toggle('wide', wide);
    this.box.innerHTML = `
      <div class="dlg-head">
        <div><div class="dlg-title">${esc(title)}</div>${subtitle ? `<div class="dlg-sub">${subtitle}</div>` : ''}</div>
        <div class="dlg-wallet">${this.walletHtml()}</div>
      </div>
      <div class="dlg-body">${body}</div>
      ${locked ? '' : '<div class="dlg-foot"><button class="btn-ghost" data-act="close">Chiudi [Esc]</button></div>'}`;
    if (!this.openFlag) {
      this.openFlag = true;
      this.root.classList.remove('hidden');
      this.game.openUi('dialog');
    }
  }

  refreshWallet() {
    const w = this.box.querySelector('.dlg-wallet');
    if (w) w.innerHTML = this.walletHtml();
  }

  walletHtml() {
    const s = this.game.state;
    return `<span>Contanti <b>${formatMoney(s.cash)}</b></span>${s.bank.account ? `<span>Conto <b>${formatMoney(s.bank.balance)}</b></span>` : ''}`;
  }

  close() {
    if (!this.openFlag) return;
    this.openFlag = false;
    this.root.classList.add('hidden');
    this.box.innerHTML = '';
    this.keyHandler = null;
    const cb = this.onClose;
    this.onClose = null;
    this.game.closeUi('dialog');
    if (cb) cb();
  }

  payToggleHtml() {
    const s = this.game.state;
    if (!(s.bank.account && s.has('carta_credito'))) { this.payMethod = 'cash'; return ''; }
    return `<div class="pay-toggle">Paga con:
      <button class="chip ${this.payMethod === 'cash' ? 'on' : ''}" data-act="pay" data-m="cash">Contanti</button>
      <button class="chip ${this.payMethod === 'card' ? 'on' : ''}" data-act="pay" data-m="card">Carta</button></div>`;
  }

  /* ---------- Negozi generici ---------- */
  shop(shopId) {
    if (shopId === 'clothing') return this.clothingShop();
    const titles = { market: 'Minimarket', pharmacy: 'Farmacia', weapons: 'Armeria', bar: 'Locale "Paradise"' };
    const subs = {
      market: 'Alimentari, bevande e articoli vari.',
      pharmacy: 'I medicinali ripristinano la salute in 3 secondi quando li usi dall\'inventario [TAB].',
      weapons: 'Il <b>cacciavite speciale</b> si trova nell\'armadietto attrezzi: serve per forzare i veicoli non tuoi.',
      bar: 'Qualcosa da bere o da mangiare al volo.',
    };
    const render = () => {
      const list = SHOP_STOCK[shopId].map((id) => {
        const it = ITEMS[id];
        const owned = this.game.state.count(id);
        return `<div class="shop-row">
          <div class="shop-icon">${it.icon}</div>
          <div class="shop-info"><b>${esc(it.name)}</b><span>${esc(it.desc)}${it.heal ? ` · +${it.heal} salute` : ''}${it.stamina ? ` · +${it.stamina} stamina` : ''}</span></div>
          <div class="shop-owned">${owned ? `x${owned}` : ''}</div>
          <button class="btn-solid small" data-act="buy" data-id="${id}">${formatMoney(it.price)}</button>
        </div>`;
      }).join('');
      this.show({
        title: titles[shopId], subtitle: subs[shopId],
        body: this.payToggleHtml() + `<div class="shop-list">${list}</div>`,
        handlers: {
          pay: (d) => { this.payMethod = d.m; render(); },
          buy: (d) => {
            const it = ITEMS[d.id];
            if (!this.game.state.payWith(it.price, this.payMethod)) {
              this.game.toast(this.payMethod === 'card' ? 'Saldo del conto insufficiente.' : 'Non hai abbastanza contanti.');
              return;
            }
            this.game.state.addItem(d.id, 1);
            audio.cash();
            this.game.toast(`Acquistato: ${it.name}`);
            render();
          },
        },
      });
    };
    render();
  }

  clothingShop() {
    const render = () => {
      const s = this.game.state;
      const bySlot = {};
      for (const [id, c] of Object.entries(CLOTHES)) (bySlot[c.slot] ||= []).push([id, c]);
      const sections = Object.entries(bySlot).map(([slot, list]) => `
        <div class="shop-section">${esc(CLOTH_SLOTS[slot])}</div>
        ${list.map(([id, c]) => {
          const owned = s.wardrobe.includes(id);
          const worn = s.outfit[slot] === id;
          return `<div class="shop-row">
            <div class="swatch" style="background:${hex(c.color)}"></div>
            <div class="shop-info"><b>${esc(c.name)}</b><span>${owned ? (worn ? 'Indossato' : 'Nel guardaroba') : 'Nuovo'}</span></div>
            ${owned
              ? `<button class="btn-ghost small" data-act="wear" data-id="${id}" ${worn ? 'disabled' : ''}>${worn ? 'Indossato' : 'Indossa'}</button>`
              : `<button class="btn-solid small" data-act="buy" data-id="${id}">${formatMoney(c.price)}</button>`}
          </div>`;
        }).join('')}`).join('');
      this.show({
        title: 'Boutique abbigliamento', subtitle: 'Maglie, pantaloni, scarpe, berretti, bracciali, anelli e occhiali. I capi acquistati vengono indossati subito.',
        wide: true,
        body: this.payToggleHtml() + `<div class="shop-list">${sections}</div>`,
        handlers: {
          pay: (d) => { this.payMethod = d.m; render(); },
          buy: (d) => {
            const c = CLOTHES[d.id];
            if (!s.payWith(c.price, this.payMethod)) { this.game.toast('Fondi insufficienti.'); return; }
            s.addItem(d.id);
            audio.cash();
            s.outfit[c.slot] = d.id;
            this.game.refreshOutfit();
            this.game.toast(`Hai comprato: ${c.name}`);
            render();
          },
          wear: (d) => {
            s.outfit[CLOTHES[d.id].slot] = d.id;
            this.game.refreshOutfit();
            render();
          },
        },
      });
    };
    render();
  }

  /** Guardaroba: indossa/togli i vestiti posseduti. */
  wardrobe() {
    const render = () => {
      const s = this.game.state;
      const rows = Object.entries(CLOTH_SLOTS).map(([slot, label]) => {
        const owned = s.wardrobe.filter((id) => CLOTHES[id] && CLOTHES[id].slot === slot);
        const optional = !['shirt', 'pants', 'shoes'].includes(slot);
        return `<div class="shop-section">${esc(label)}</div><div class="chips">
          ${optional ? `<button class="chip ${!s.outfit[slot] ? 'on' : ''}" data-act="set" data-slot="${slot}" data-id="">Nessuno</button>` : ''}
          ${owned.map((id) => `<button class="chip ${s.outfit[slot] === id ? 'on' : ''}" data-act="set" data-slot="${slot}" data-id="${id}"><i style="background:${hex(CLOTHES[id].color)}"></i>${esc(CLOTHES[id].name)}</button>`).join('') || '<span class="muted">Niente in questa categoria</span>'}
        </div>`;
      }).join('');
      this.show({
        title: 'Guardaroba', subtitle: 'Scegli cosa indossare.', body: rows, wide: true,
        handlers: {
          set: (d) => {
            s.outfit[d.slot] = d.id || null;
            this.game.refreshOutfit();
            render();
          },
        },
      });
    };
    render();
  }

  /* ---------- Concessionario ---------- */
  dealer(delivery = false) {
    const fee = delivery ? 150 : 0;
    const render = (selected = {}) => {
      const rows = Object.entries(VEHICLE_MODELS).filter(([, m]) => !m.hidden).map(([id, m]) => {
        const color = selected[id] ?? m.colors[0];
        return `<div class="shop-row">
          <div class="shop-icon">${{ bike: '🚲', scooter: '🛵', moto: '🏍️' }[m.kind] || '🚗'}</div>
          <div class="shop-info"><b>${esc(m.name)}</b><span class="chips inline">${m.colors.map((c) => `<button class="dot ${c === color ? 'on' : ''}" style="background:${hex(c)}" data-act="color" data-id="${id}" data-c="${c}"></button>`).join('')}</span></div>
          <button class="btn-solid small" data-act="buy" data-id="${id}" data-c="${color}">${formatMoney(m.price + fee)}</button>
        </div>`;
      }).join('');
      this.show({
        title: delivery ? 'Concessionario · ordine telefonico' : 'Concessionario',
        subtitle: delivery ? 'Consegna a domicilio vicino a te (+€ 150).' : 'Auto, moto, motorini e bici. Il veicolo ti aspetta in strada davanti al salone.',
        wide: true,
        body: this.payToggleHtml() + `<div class="shop-list">${rows}</div>`,
        handlers: {
          pay: (d) => { this.payMethod = d.m; render(selected); },
          color: (d) => { selected[d.id] = Number(d.c); render(selected); },
          buy: (d) => {
            const m = VEHICLE_MODELS[d.id];
            if (!this.game.state.payWith(m.price + fee, this.payMethod)) { this.game.toast('Fondi insufficienti per questo veicolo.'); return; }
            audio.cash();
            this.close();
            this.game.onPurchaseVehicle(d.id, Number(d.c), delivery);
          },
        },
      });
    };
    render();
  }

  /* ---------- Concessionario: ritiro dell'usato ---------- */
  sellVehicle() {
    const g = this.game;
    const render = (msg = '') => {
      const list = g.vehicles.list.filter((v) => v.owner === 'player' || v.owner === 'stolen');
      const rows = list.map((v) => {
        const offer = g.vehicleSellPrice(v);
        const stolen = v.owner === 'stolen';
        return `<div class="shop-row">
          <div class="shop-icon">${{ bike: '🚲', scooter: '🛵', moto: '🏍️' }[v.kind] || '🚗'}</div>
          <div class="shop-info"><b>${esc(v.name)}</b><span>Condizioni: <b class="${v.health < 40 ? 'warn' : ''}">${Math.round(v.health)}%</b> · a ${Math.round(Math.hypot(v.body.position.x - g.mapPosition().x, v.body.position.z - g.mapPosition().z))} m${stolen ? ' · <span class="warn">rubato</span>' : ''}</span></div>
          ${stolen ? '<span class="muted">Senza documenti</span>' : `<button class="btn-solid small" data-act="sell" data-uid="${v.uid}">Vendi · ${formatMoney(offer)}</button>`}
        </div>`;
      }).join('') || '<p class="muted">Non possiedi veicoli da vendere.</p>';
      this.show({
        title: 'Ritiro usato · valutazione',
        subtitle: 'Offerta in base al listino (55%) e allo stato del mezzo. I veicoli rubati non si possono vendere.',
        wide: true,
        body: `${msg}<div class="shop-list">${rows}</div>`,
        handlers: {
          sell: (d) => {
            const v = g.vehicles.list.find((x) => x.uid === d.uid);
            if (!v) return;
            const offer = g.vehicleSellPrice(v);
            g.sellVehicle(v);
            audio.cash();
            render(`<p class="ok">Venduto: ${esc(v.name)} per ${formatMoney(offer)}.</p>`);
            this.refreshWallet();
          },
        },
      });
    };
    render();
  }

  /** Officina (fuori turno): il meccanico ripara i tuoi veicoli a pagamento. */
  repairShop() {
    const g = this.game;
    const render = (msg = '') => {
      const list = g.vehicles.list.filter((v) => (v.owner === 'player' || v.owner === 'stolen') && v.health < 99.5);
      const rows = list.map((v) => {
        const cost = g.repairCost(v);
        return `<div class="shop-row">
          <div class="shop-icon">${{ bike: '🚲', scooter: '🛵', moto: '🏍️' }[v.kind] || '🚗'}</div>
          <div class="shop-info"><b>${esc(v.name)}</b><span>Salute del veicolo: <b class="${v.health < 40 ? 'warn' : ''}">${Math.round(v.health)}%</b>${v.broken ? ' · <span class="warn">in panne</span>' : ''}</span></div>
          <button class="btn-solid small" data-act="fix" data-uid="${v.uid}">Ripara · ${formatMoney(cost)}</button>
        </div>`;
      }).join('') || '<p class="muted">Tutti i tuoi veicoli sono in perfette condizioni.</p>';
      this.show({
        title: 'Officina · accettazione',
        subtitle: 'Il meccanico ripara carrozzeria e motore: il veicolo torna come nuovo ovunque sia parcheggiato.',
        body: this.payToggleHtml() + msg + `<div class="shop-list">${rows}</div>`,
        handlers: {
          pay: (d) => { this.payMethod = d.m; render(); },
          fix: (d) => {
            const v = g.vehicles.list.find((x) => x.uid === d.uid);
            if (!v) return;
            const cost = g.repairCost(v);
            if (!g.state.payWith(cost, this.payMethod)) { render('<p class="warn">Fondi insufficienti.</p>'); return; }
            v.repair();
            audio.cash();
            audio.screwdriver();
            render(`<p class="ok">${esc(v.name)} riparato!</p>`);
            this.refreshWallet();
          },
        },
      });
    };
    render();
  }

  /* ---------- Banca (sportello) ---------- */
  bank() {
    const s = this.game.state;
    const render = (msg = '') => {
      if (!s.bank.account) {
        this.show({
          title: 'Banca · sportello', subtitle: 'Apri un conto corrente e ritira la tua carta di credito.',
          body: `${msg}<p>Aprire un conto è gratuito. Riceverai una <b>carta di credito</b> con un <b>PIN casuale a 4 cifre</b>: memorizzalo, ti servirà agli ATM.</p>
            <button class="btn-solid" data-act="open">Apri il conto e ritira la carta</button>`,
          handlers: {
            open: () => {
              s.bank.account = true;
              s.bank.pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
              s.addItem('carta_credito', 1);
              this.game.toast('Conto aperto: hai ricevuto la carta di credito.');
              render(`<div class="pin-reveal">Il tuo PIN è <b>${s.bank.pin}</b><span>Lo trovi anche nelle Note del telefono [TAB].</span></div>`);
            },
          },
        });
        return;
      }
      const amounts = [20, 50, 100, 500, 1000];
      this.show({
        title: 'Banca · sportello', subtitle: `Conto corrente intestato a te · Carta ${s.has('carta_credito') ? 'attiva' : 'non presente'}`,
        body: `${msg}
          <div class="shop-section">Deposita contanti</div>
          <div class="chips">${amounts.map((a) => `<button class="chip" data-act="dep" data-a="${a}">${formatMoney(a)}</button>`).join('')}<button class="chip" data-act="dep" data-a="all">Tutto</button></div>
          <div class="shop-section">Preleva</div>
          <div class="chips">${amounts.map((a) => `<button class="chip" data-act="wd" data-a="${a}">${formatMoney(a)}</button>`).join('')}</div>
          ${s.has('carta_credito') ? '' : '<div class="shop-section">Carta</div><button class="btn-solid" data-act="newcard">Richiedi una nuova carta (nuovo PIN)</button>'}`,
        handlers: {
          dep: (d) => {
            const a = d.a === 'all' ? s.cash : Number(d.a);
            if (a <= 0 || s.cash < a) { render('<p class="warn">Contanti insufficienti.</p>'); return; }
            s.cash -= a; s.bank.balance += a; render(`<p class="ok">Depositati ${formatMoney(a)}.</p>`);
          },
          wd: (d) => {
            const a = Number(d.a);
            if (s.bank.balance < a) { render('<p class="warn">Saldo insufficiente.</p>'); return; }
            s.bank.balance -= a; s.cash += a; render(`<p class="ok">Prelevati ${formatMoney(a)}.</p>`);
          },
          newcard: () => {
            s.bank.pin = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
            s.addItem('carta_credito', 1);
            render(`<div class="pin-reveal">Nuovo PIN: <b>${s.bank.pin}</b></div>`);
          },
        },
      });
    };
    render();
  }

  /* ---------- ATM con PIN a 4 cifre ---------- */
  atm() {
    const s = this.game.state;
    if (!s.bank.account || !s.has('carta_credito')) {
      this.message('Bancomat', 'Ti serve una carta di credito: apri un conto allo sportello della banca.');
      return;
    }
    let pin = '';
    let tries = 0;
    const keypad = (msg) => {
      this.show({
        title: 'Bancomat', subtitle: 'Inserisci il PIN della carta (tastiera numerica o mouse).',
        body: `${msg || ''}<div class="pin-display">${'●'.repeat(pin.length)}${'○'.repeat(4 - pin.length)}</div>
          <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-act="k" data-n="${n}">${n}</button>`).join('')}
          <button data-act="del">⌫</button><button data-act="k" data-n="0">0</button><button data-act="ok" class="ok">OK</button></div>`,
        handlers: {
          k: (d) => { if (pin.length < 4) { pin += d.n; keypad(msg); } },
          del: () => { pin = pin.slice(0, -1); keypad(msg); },
          ok: () => check(),
        },
        keyHandler: (e) => {
          const m = /^(Digit|Numpad)(\d)$/.exec(e.code);
          if (m && pin.length < 4) { pin += m[2]; keypad(msg); }
          else if (e.code === 'Backspace') { pin = pin.slice(0, -1); keypad(msg); }
          else if (e.code === 'Enter' || e.code === 'NumpadEnter') check();
        },
      });
    };
    const check = () => {
      if (pin.length < 4) return;
      if (pin === s.bank.pin) { menu(); return; }
      tries++;
      pin = '';
      if (tries >= 3) { this.message('Bancomat', 'PIN errato per 3 volte: operazione annullata. Il PIN è nelle Note del telefono [TAB].'); return; }
      keypad(`<p class="warn">PIN errato (${tries}/3).</p>`);
    };
    const menu = (msg = '') => {
      const amounts = [20, 50, 100, 200, 500];
      this.show({
        title: 'Bancomat', subtitle: `Saldo disponibile: <b>${formatMoney(s.bank.balance)}</b>`,
        body: `${msg}<div class="shop-section">Preleva</div>
          <div class="chips">${amounts.map((a) => `<button class="chip" data-act="wd" data-a="${a}">${formatMoney(a)}</button>`).join('')}</div>
          <div class="shop-section">Deposita</div>
          <div class="chips">${amounts.map((a) => `<button class="chip" data-act="dep" data-a="${a}">${formatMoney(a)}</button>`).join('')}<button class="chip" data-act="dep" data-a="all">Tutti i contanti</button></div>`,
        handlers: {
          wd: (d) => {
            const a = Number(d.a);
            if (s.bank.balance < a) { menu('<p class="warn">Saldo insufficiente.</p>'); return; }
            s.bank.balance -= a; s.cash += a; menu(`<p class="ok">Prelevati ${formatMoney(a)}.</p>`);
          },
          dep: (d) => {
            const a = d.a === 'all' ? s.cash : Number(d.a);
            if (a <= 0 || s.cash < a) { menu('<p class="warn">Contanti insufficienti.</p>'); return; }
            s.cash -= a; s.bank.balance += a; menu(`<p class="ok">Depositati ${formatMoney(a)}.</p>`);
          },
        },
      });
    };
    keypad();
  }

  /* ---------- Ristorante: menù e scontrino ---------- */
  restaurantMenu(menuKey, onOrder, onCancel) {
    const menu = MENUS[menuKey];
    const qty = {};
    const render = () => {
      const cats = [...new Set(menu.items.map((i) => i.cat))];
      const total = menu.items.reduce((t, i) => t + (qty[i.id] || 0) * i.price, 0);
      const body = cats.map((c) => `<div class="shop-section">${esc(c)}</div>${menu.items.filter((i) => i.cat === c).map((i) => `
        <div class="shop-row menu-row">
          <div class="shop-info"><b>${esc(i.name)}</b><span>+${i.heal} salute</span></div>
          <div class="price">${formatMoney(i.price)}</div>
          <div class="stepper"><button data-act="minus" data-id="${i.id}">−</button><b>${qty[i.id] || 0}</b><button data-act="plus" data-id="${i.id}">+</button></div>
        </div>`).join('')}`).join('');
      this.show({
        title: menu.title, subtitle: 'Il cameriere aspetta la tua ordinazione. Il conto arriva a fine pasto.',
        wide: true,
        body: `<div class="shop-list">${body}</div><div class="order-bar"><span>Totale ordine <b>${formatMoney(total)}</b></span>
          <button class="btn-ghost" data-act="cancel">Non ordino</button>
          <button class="btn-solid" data-act="order" ${total ? '' : 'disabled'}>Ordina</button></div>`,
        handlers: {
          plus: (d) => { qty[d.id] = Math.min(5, (qty[d.id] || 0) + 1); render(); },
          minus: (d) => { qty[d.id] = Math.max(0, (qty[d.id] || 0) - 1); render(); },
          cancel: () => { this.onClose = null; this.close(); onCancel(); },
          order: () => {
            const items = menu.items.filter((i) => qty[i.id]).map((i) => ({ ...i, qty: qty[i.id] }));
            this.onClose = null;
            this.close();
            onOrder(items);
          },
        },
        onClose: () => onCancel(),
      });
    };
    render();
  }

  /** Scontrino con tasto Paga (scala dal portafoglio, cioè dai contanti). */
  receipt(title, items, onPaid, onCannotPay) {
    const total = items.reduce((t, i) => t + i.price * i.qty, 0);
    const now = new Date();
    const lines = items.map((i) => `<div class="rc-line"><span>${i.qty} × ${esc(i.name)}</span><span>${formatMoney(i.price * i.qty)}</span></div>`).join('');
    this.show({
      title: 'Il conto', subtitle: 'Il cameriere ti porta lo scontrino.',
      locked: true,
      body: `<div class="receipt">
          <div class="rc-head">${esc(title)}<span>Scontrino n. ${Math.floor(1000 + Math.random() * 9000)} · ${now.toLocaleDateString('it-IT')} ${now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span></div>
          ${lines}
          <div class="rc-line tot"><span>TOTALE</span><span>${formatMoney(total)}</span></div>
          <div class="rc-foot">Grazie e arrivederci!</div>
        </div>
        <p class="muted">Contanti nel portafoglio: <b>${formatMoney(this.game.state.cash)}</b></p>
        <button class="btn-solid wide" data-act="pay">Paga ${formatMoney(total)}</button>`,
      handlers: {
        pay: () => {
          if (this.game.state.pay(total)) {
            this.close();
            onPaid(total);
          } else {
            this.close();
            onCannotPay(total);
          }
        },
      },
    });
  }

  /* ---------- Donazioni ai barboni (o a chi ne ha bisogno) ---------- */
  donate(npc) {
    const s = this.game.state;
    const render = (msg = '') => {
      const giftable = s.inventory.filter((i) => ['cibo', 'medicinali', 'varie'].includes(itemInfo(i.id).cat));
      const clothes = s.wardrobe.filter((id) => !Object.values(s.outfit).includes(id));
      const vehicles = this.game.ownedVehicles();
      this.show({
        title: `Aiuta ${npc.name}`, subtitle: 'Ogni dono fatto con il cuore fa crescere la tua Aura.',
        wide: true,
        body: `${msg}
          <div class="shop-section">Soldi</div>
          <div class="chips">${[2, 5, 10, 20, 50, 100].map((a) => `<button class="chip" data-act="money" data-a="${a}" ${s.cash < a ? 'disabled' : ''}>${formatMoney(a)}</button>`).join('')}</div>
          <div class="shop-section">Cibo, medicinali e oggetti (sacco a pelo, tenda, coperta…)</div>
          <div class="chips">${giftable.map((i) => { const info = itemInfo(i.id); return `<button class="chip" data-act="item" data-id="${i.id}">${info.icon} ${esc(info.name)} <small>x${i.qty}</small></button>`; }).join('') || '<span class="muted">Niente da donare nell\'inventario.</span>'}</div>
          <div class="shop-section">Vestiti non indossati</div>
          <div class="chips">${clothes.map((id) => `<button class="chip" data-act="cloth" data-id="${id}"><i style="background:${hex(CLOTHES[id].color)}"></i>${esc(CLOTHES[id].name)}</button>`).join('') || '<span class="muted">Nessun vestito libero.</span>'}</div>
          <div class="shop-section">Veicoli</div>
          <div class="chips">${vehicles.map((v) => `<button class="chip" data-act="veh" data-uid="${v.uid}">${esc(v.name)}</button>`).join('') || '<span class="muted">Non possiedi veicoli.</span>'}</div>`,
        handlers: {
          money: (d) => {
            const a = Number(d.a);
            if (!s.pay(a)) return;
            this.game.onDonate(npc, { kind: 'money', amount: a });
            render(`<p class="ok">"${esc(this.game.thanks())}"</p>`);
          },
          item: (d) => {
            if (!s.removeItem(d.id, 1)) return;
            this.game.onDonate(npc, { kind: 'item', id: d.id });
            render(`<p class="ok">"${esc(this.game.thanks())}"</p>`);
          },
          cloth: (d) => {
            s.removeItem(d.id);
            this.game.onDonate(npc, { kind: 'cloth', id: d.id });
            render(`<p class="ok">"${esc(this.game.thanks())}"</p>`);
          },
          veh: (d) => {
            this.game.onDonate(npc, { kind: 'vehicle', uid: d.uid });
            render(`<p class="ok">"Un veicolo? Non ci posso credere… grazie!"</p>`);
          },
        },
      });
    };
    render();
  }

  /* ---------- Bar "Paradise": bevande consumate sul momento ---------- */
  barMenu(onDrink) {
    const s = this.game.state;
    const render = () => {
      const cats = ['Analcolici', 'Alcolici'];
      const body = cats.map((c) => `<div class="shop-section">${c}</div>${DRINKS.filter((d) => d.cat === c).map((d) => `
        <div class="shop-row">
          <div class="swatch" style="background:#${d.color}"></div>
          <div class="shop-info"><b>${esc(d.name)}</b><span>${d.alcohol ? `Alcol: +${d.alcohol}% ubriachezza` : 'Senza alcol'}${d.stamina ? ` · +${d.stamina} stamina` : ''}</span></div>
          <div class="shop-owned"></div>
          <button class="btn-solid small" data-act="drink" data-id="${d.id}">${formatMoney(d.price)}</button>
        </div>`).join('')}`).join('');
      this.show({
        title: 'Locale "Paradise" · bancone',
        subtitle: `Il barista prepara il drink e lo bevi subito.${s.drunk > 0 ? ` Ubriachezza attuale: <b>${Math.round(s.drunk)}%</b> (oltre il 50% svieni).` : ''}`,
        body: this.payToggleHtml() + `<div class="shop-list">${body}</div>`,
        handlers: {
          pay: (d) => { this.payMethod = d.m; render(); },
          drink: (d) => {
            const drink = DRINKS.find((x) => x.id === d.id);
            if (!s.payWith(drink.price, this.payMethod)) { this.game.toast('Fondi insufficienti.'); return; }
            audio.cash();
            this.close();
            onDrink(drink);
          },
        },
      });
    };
    render();
  }

  /* ---------- Calendario liturgico sfogliabile ---------- */
  calendar(today) {
    let y = today.getFullYear(), m = today.getMonth();
    const render = () => {
      const info = dayInfo(today);
      this.show({
        title: `${MONTHS_IT[m]} ${y}`,
        subtitle: `Oggi: <b>${formatDate(today, true)}</b>${info.feast ? ` · <span class="red">${esc(info.feast)}</span>` : info.sunday ? ' · <span class="red">Domenica</span>' : ''}`,
        wide: true,
        body: `<div class="cal-nav"><button class="btn-ghost small" data-act="prev">‹ Mese precedente</button><button class="btn-ghost small" data-act="today">Oggi</button><button class="btn-ghost small" data-act="next">Mese successivo ›</button></div>${calendarHtml(y, m, today)}`,
        handlers: {
          prev: () => { m--; if (m < 0) { m = 11; y--; } render(); },
          next: () => { m++; if (m > 11) { m = 0; y++; } render(); },
          today: () => { y = today.getFullYear(); m = today.getMonth(); render(); },
        },
      });
    };
    render();
  }

  /* ---------- Case in vendita ---------- */
  houseForSale(door, { onBuy, onVisit }) {
    const h = door.house;
    const s = this.game.state;
    const owned = s.houses.includes(h.id);
    const render = (msg = '') => {
      this.show({
        title: owned ? 'La tua casa' : (h.kind === 'villetta' ? 'Villetta in vendita' : 'Casa in vendita'),
        subtitle: owned ? 'È tua: puoi entrare, dormire e consultare il calendario.' : `${h.kind === 'villetta' ? 'Villetta indipendente con giardino' : 'Casa a due piani'} · Quartiere residenziale`,
        body: `${msg}<div class="house-card"><div class="house-ico">${h.kind === 'villetta' ? '🏡' : '🏠'}</div>
          <div><div class="house-price">${formatMoney(h.price)}</div><div class="muted">Pagamento in contanti o con carta (dal conto)</div></div></div>
          ${this.payToggleHtml()}
          <div class="dlg-buttons">
            <button class="btn-ghost" data-act="visit">${owned ? 'Entra' : 'Visita la casa'}</button>
            ${owned ? '' : `<button class="btn-solid" data-act="buy">Compra per ${formatMoney(h.price)}</button>`}
          </div>`,
        handlers: {
          pay: (d) => { this.payMethod = d.m; render(); },
          visit: () => { this.close(); onVisit(); },
          buy: () => {
            if (!s.payWith(h.price, this.payMethod)) { render('<p class="warn">Fondi insufficienti per questa casa.</p>'); return; }
            audio.cash();
            this.close();
            onBuy();
          },
        },
      });
    };
    render();
  }

  /** Messaggio semplice con pulsanti. */
  message(title, text, buttons = null) {
    const handlers = {};
    const btns = (buttons || [{ label: 'OK', primary: true }]).map((b, i) => {
      handlers['b' + i] = () => { this.close(); if (b.onClick) b.onClick(); };
      return `<button class="${b.primary ? 'btn-solid' : 'btn-ghost'}" data-act="b${i}">${esc(b.label)}</button>`;
    }).join('');
    this.show({ title, body: `<p>${text}</p><div class="dlg-buttons">${btns}</div>`, handlers });
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.openFlag = false;
    this.root.classList.add('hidden');
    this.box.innerHTML = '';
  }
}
