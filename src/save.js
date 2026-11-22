// Salvataggio su localStorage + autosalvataggio periodico.

const KEY = 'sfp_save_v1';
const VERSION = 1;

export const SaveSystem = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== VERSION || !data.character || !data.player) return null;
      return data;
    } catch (e) {
      return null;
    }
  },

  has() {
    return this.load() !== null;
  },

  save(data) {
    try {
      const payload = { ...data, version: VERSION, savedAt: Date.now() };
      localStorage.setItem(KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[SaveSystem] salvataggio non riuscito', e);
      return false;
    }
  },

  clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage non disponibile */ }
  },
};

export class AutoSaver {
  /**
   * @param {() => object|null} getData  produce i dati da salvare
   * @param {number} interval            secondi tra due salvataggi
   * @param {(ok:boolean) => void} onSaved
   */
  constructor(getData, interval = 30, onSaved = null) {
    this.getData = getData;
    this.interval = interval;
    this.onSaved = onSaved;
    this.timer = 0;
  }

  update(dt) {
    this.timer += dt;
    if (this.timer >= this.interval) {
      this.timer = 0;
      this.saveNow();
    }
  }

  saveNow() {
    const data = this.getData();
    if (!data) return false;
    const ok = SaveSystem.save(data);
    if (this.onSaved) this.onSaved(ok);
    return ok;
  }
}
