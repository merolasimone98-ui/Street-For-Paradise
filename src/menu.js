// Menu principale: GIOCA -> (NEW GAME -> scelta Uomo/Donna) / CONTINUA GAME, e IMPOSTAZIONI (volumi e FOV).
import { SaveSystem } from './save.js';
import { getCity, formatMoney } from './birthdata.js';
import { settingsFormHtml, bindSettingsForm, loadSettings, setSetting, onSettingsChange } from './settings.js';
import { audio, bindUiSounds } from './audio.js';
import { $, confirmDialog, isModalOpen } from './ui.js';
import { LANGUAGES, getLanguage } from './i18n.js';

export class Menu {
  /**
   * @param {{ onNewGame: (sex: 'm'|'f') => void, onContinue: (save: object) => void }} handlers
   */
  constructor({ onNewGame, onContinue }) {
    this.onNewGame = onNewGame;
    this.onContinue = onContinue;

    this.root = $('menu');
    this.btnPlay = $('btn-play');
    this.btnSettings = $('btn-settings');
    this.options = $('play-options');
    this.btnNew = $('btn-new');
    this.btnContinue = $('btn-continue');
    this.continueSub = $('continue-sub');
    this.settingsPanel = $('menu-settings');
    this.creditsPanel = $('menu-credits');
    this.btnCredits = $('btn-credits');
    this.btnLang = $('btn-lang');
    this.gender = $('gender-screen');

    this.active = false;
    this.busy = false;
    this.expanded = false;

    bindUiSounds(this.root);
    bindUiSounds(this.settingsPanel);
    bindUiSounds(this.creditsPanel);
    bindUiSounds(this.gender);
    this.btnPlay.addEventListener('click', () => this.toggleOptions());
    this.btnSettings.addEventListener('click', () => this.openSettings());
    this.btnCredits.addEventListener('click', () => this.openCredits());
    this.creditsPanel.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === this.creditsPanel) this.closeCredits(); });
    // Lingua: il pulsante in alto a destra passa da Italiano a Inglese e viceversa (tutto il gioco si traduce subito)
    this.btnLang.addEventListener('click', () => {
      const codes = Object.keys(LANGUAGES);
      const next = codes[(codes.indexOf(getLanguage()) + 1) % codes.length];
      setSetting('lang', next);
      audio.click();
    });
    this.updateLangButton();
    onSettingsChange(() => { this.updateLangButton(); if (this.active) this.refresh(); });
    this.btnNew.addEventListener('click', () => this.handleNew());
    this.btnContinue.addEventListener('click', () => this.handleContinue());
    this.settingsPanel.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === this.settingsPanel) this.closeSettings(); });
    this.gender.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sex]');
      if (b) this.chooseSex(b.dataset.sex);
      else if (e.target.closest('[data-gback]')) this.closeGender();
    });
    this._onKey = (e) => this.onKey(e);
    window.addEventListener('keydown', this._onKey);
  }

  updateLangButton() {
    const l = LANGUAGES[getLanguage()] || LANGUAGES.it;
    $('lang-flag').innerHTML = l.flag;
    $('lang-name').textContent = l.label;
  }

  openCredits() {
    this.creditsPanel.classList.remove('hidden');
  }

  closeCredits() {
    this.creditsPanel.classList.add('hidden');
  }

  onKey(e) {
    if (!this.active || this.busy || isModalOpen()) return;
    if (!this.settingsPanel.classList.contains('hidden')) {
      if (e.code === 'Escape') this.closeSettings();
      return;
    }
    if (!this.creditsPanel.classList.contains('hidden')) {
      if (e.code === 'Escape') this.closeCredits();
      return;
    }
    if (!this.gender.classList.contains('hidden')) {
      if (e.code === 'Escape') this.closeGender();
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
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
      const loc = getLanguage() === 'en' ? 'en-GB' : 'it-IT';
      const when = date.toLocaleDateString(loc, { day: '2-digit', month: 'short' }) + ' ' +
        date.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
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
    const tab = this.expanded ? 0 : -1;
    this.btnNew.tabIndex = tab;
    this.btnContinue.tabIndex = tab;
    if (this.expanded) this.refresh();
  }

  /* ---------- Impostazioni dal menu principale ---------- */
  openSettings() {
    this.settingsPanel.querySelector('#menu-settings-form').innerHTML = settingsFormHtml(loadSettings(), { full: true });
    this.unbindSettings = bindSettingsForm(this.settingsPanel.querySelector('#menu-settings-form'));
    this.settingsPanel.classList.remove('hidden');
  }

  closeSettings() {
    if (this.unbindSettings) { this.unbindSettings(); this.unbindSettings = null; }
    this.settingsPanel.classList.add('hidden');
  }

  /* ---------- Nuova vita: prima si sceglie il sesso ---------- */
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
    this.gender.classList.remove('hidden');
    requestAnimationFrame(() => this.gender.classList.add('visible'));
  }

  closeGender() {
    this.gender.classList.remove('visible');
    setTimeout(() => this.gender.classList.add('hidden'), 400);
  }

  async chooseSex(sex) {
    if (this.busy) return;
    this.busy = true;
    audio.confirm();
    this.gender.classList.add('chosen-' + sex);
    await new Promise((r) => setTimeout(r, 650));
    this.gender.classList.remove('visible');
    await this.hide();
    this.gender.classList.add('hidden');
    this.gender.classList.remove('chosen-m', 'chosen-f');
    this.onNewGame(sex);
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
    if (document.pointerLockElement) document.exitPointerLock();
    this.busy = false;
    this.active = true;
    this.toggleOptions(false);
    this.refresh();
    this.root.classList.remove('hidden');
    this.root.querySelectorAll('.menu-kicker, .t-line, .title-rule, .menu-buttons, .menu-footer').forEach((el) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
    requestAnimationFrame(() => this.root.classList.add('visible'));
    setTimeout(() => { if (this.active) this.btnPlay.focus({ preventScroll: true }); }, 1300);
    audio.playMusic('menu');
  }

  hide() {
    this.active = false;
    this.root.classList.remove('visible');
    this.closeSettings();
    this.closeCredits();
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    return new Promise((resolve) => {
      setTimeout(() => {
        this.root.classList.add('hidden');
        resolve();
      }, 900);
    });
  }
}
