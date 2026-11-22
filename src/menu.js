// Menu principale: GIOCA -> NEW GAME / CONTINUA GAME.
import { SaveSystem } from './save.js';
import { getCity, formatMoney } from './birthdata.js';
import { $, confirmDialog, isModalOpen } from './ui.js';

export class Menu {
  /**
   * @param {{ onNewGame: () => void, onContinue: (save: object) => void }} handlers
   */
  constructor({ onNewGame, onContinue }) {
    this.onNewGame = onNewGame;
    this.onContinue = onContinue;

    this.root = $('menu');
    this.btnPlay = $('btn-play');
    this.options = $('play-options');
    this.btnNew = $('btn-new');
    this.btnContinue = $('btn-continue');
    this.continueSub = $('continue-sub');

    this.active = false;
    this.busy = false;
    this.expanded = false;

    this.btnPlay.addEventListener('click', () => this.toggleOptions());
    this.btnNew.addEventListener('click', () => this.handleNew());
    this.btnContinue.addEventListener('click', () => this.handleContinue());
    this._onKey = (e) => this.onKey(e);
    window.addEventListener('keydown', this._onKey);
  }

  onKey(e) {
    if (!this.active || this.busy || isModalOpen()) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      // Se il focus è già su un pulsante lascia che sia il browser a "cliccarlo".
      if (document.activeElement && document.activeElement.tagName === 'BUTTON' && this.root.contains(document.activeElement)) return;
      e.preventDefault();
      if (!this.expanded) this.toggleOptions(true);
      else this.btnNew.focus();
    } else if (e.code === 'Escape' && this.expanded) {
      this.toggleOptions(false);
    }
  }

  refresh() {
    const save = SaveSystem.load();
    this.btnContinue.disabled = !save;
    this.btnContinue.setAttribute('aria-disabled', String(!save));
    if (save) {
      const c = save.character;
      const city = getCity(c.cityId);
      const date = new Date(save.savedAt || Date.now());
      const when = date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' }) + ' ' +
        date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
      this.continueSub.textContent = `${c.name} ${c.surname} · ${save.age} anni · ${city.city} · ${formatMoney(save.money)} · ${when}`;
    } else {
      this.continueSub.textContent = 'Nessun salvataggio trovato';
    }
  }

  toggleOptions(force) {
    if (this.busy) return;
    this.expanded = typeof force === 'boolean' ? force : !this.expanded;
    this.options.classList.toggle('open', this.expanded);
    this.btnPlay.classList.toggle('open', this.expanded);
    this.options.setAttribute('aria-hidden', String(!this.expanded));
    const tab = this.expanded ? '0' : '-1';
    this.btnNew.tabIndex = Number(tab);
    this.btnContinue.tabIndex = Number(tab);
    if (this.expanded) this.refresh();
  }

  async handleNew() {
    if (this.busy || !this.expanded) return;
    if (SaveSystem.has()) {
      const ok = await confirmDialog({
        title: 'Nuova vita',
        text: 'Esiste già una vita salvata. Iniziando una nuova partita il salvataggio precedente verrà sovrascritto al compimento dei 18 anni. Continuare?',
        ok: 'Sì, nuova vita',
        cancel: 'Annulla',
      });
      if (!ok) return;
    }
    this.busy = true;
    await this.hide();
    this.onNewGame();
  }

  async handleContinue() {
    if (this.busy || !this.expanded) return;
    const save = SaveSystem.load();
    if (!save) {
      this.refresh();
      return;
    }
    this.busy = true;
    await this.hide();
    this.onContinue(save);
  }

  show() {
    // Il menu non deve mai convivere con il Pointer Lock.
    if (document.pointerLockElement) document.exitPointerLock();
    this.busy = false;
    this.active = true;
    this.toggleOptions(false);
    this.refresh();
    this.root.classList.remove('hidden');
    // Riavvia le animazioni CSS d'ingresso.
    this.root.querySelectorAll('.menu-kicker, .t-line, .title-rule, .menu-buttons, .menu-footer').forEach((el) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
    requestAnimationFrame(() => this.root.classList.add('visible'));
    setTimeout(() => { if (this.active) this.btnPlay.focus({ preventScroll: true }); }, 1300);
  }

  hide() {
    this.active = false;
    this.root.classList.remove('visible');
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    return new Promise((resolve) => {
      setTimeout(() => {
        this.root.classList.add('hidden');
        resolve();
      }, 900);
    });
  }
}
