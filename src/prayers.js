// Preghiere recitate: testo completo a schermo del Padre Nostro e dell'Ave Maria, letti in italiano
// con la sintesi vocale del browser (Web Speech API): voce maschile per il Padre Nostro, femminile per l'Ave Maria.
// Se la sintesi vocale non c'è (o non ha voci italiane) il testo scorre riga per riga a tempo: nessun errore.
import { audio } from './audio.js';

export const PRAYERS = {
  padreNostro: {
    title: 'Padre Nostro',
    voice: 'm',
    lines: [
      'Padre nostro, che sei nei cieli,',
      'sia santificato il tuo nome,',
      'venga il tuo regno,',
      'sia fatta la tua volontà,',
      'come in cielo così in terra.',
      'Dacci oggi il nostro pane quotidiano,',
      'e rimetti a noi i nostri debiti',
      'come anche noi li rimettiamo ai nostri debitori,',
      'e non abbandonarci alla tentazione,',
      'ma liberaci dal male.',
      'Amen.',
    ],
  },
  aveMaria: {
    title: 'Ave Maria',
    voice: 'f',
    lines: [
      'Ave, o Maria, piena di grazia,',
      'il Signore è con te.',
      'Tu sei benedetta fra le donne',
      'e benedetto è il frutto del tuo seno, Gesù.',
      'Santa Maria, Madre di Dio,',
      'prega per noi peccatori,',
      'adesso e nell\'ora della nostra morte.',
      'Amen.',
    ],
  },
};

const MALE_HINTS = /(male|uomo|diego|cosimo|luca|giorgio|paolo|roberto|marco|andrea|riccardo|giuseppe|matteo|pietro|daniele)/i;
const FEMALE_HINTS = /(female|donna|elsa|alice|federica|paola|isabella|carla|silvia|giulia|chiara|francesca|lucia|bianca|sara|anna|valentina)/i;

/** Sceglie una voce italiana del sesso richiesto (se possibile). */
function pickVoice(sex) {
  const synth = window.speechSynthesis;
  if (!synth) return null;
  const voices = synth.getVoices().filter((v) => /^it/i.test(v.lang));
  if (!voices.length) return null;
  const want = sex === 'f' ? FEMALE_HINTS : MALE_HINTS;
  const avoid = sex === 'f' ? MALE_HINTS : FEMALE_HINTS;
  return voices.find((v) => want.test(v.name)) || voices.find((v) => !avoid.test(v.name)) || voices[0];
}

/** Le voci del browser arrivano in modo asincrono: si attende al massimo un attimo. */
function voicesReady() {
  const synth = window.speechSynthesis;
  if (!synth) return Promise.resolve(false);
  if (synth.getVoices().length) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => { synth.removeEventListener?.('voiceschanged', done); resolve(synth.getVoices().length > 0); };
    synth.addEventListener?.('voiceschanged', done);
    setTimeout(done, 1200);
  });
}

export class PrayerReader {
  /** @param {object} game  usa openUi/closeUi (finestra bloccante), settings (volume) */
  constructor(game) {
    this.game = game;
    this.root = null;
    this.active = null;
  }

  /**
   * Recita in sequenza le preghiere indicate (chiavi di PRAYERS). Ritorna una Promise:
   * true se arrivate fino all'Amen, false se interrotte (Esc / pulsante Interrompi).
   */
  async recite(keys, { heading = 'Preghiera' } = {}) {
    if (this.active) return false;
    const g = this.game;
    this.build(heading);
    g.openUi('prayer');
    this.active = { cancelled: false };
    const state = this.active;
    const hasVoice = await voicesReady();
    let completed = true;
    for (const key of keys) {
      if (state.cancelled) { completed = false; break; }
      const ok = await this.readOne(PRAYERS[key], hasVoice, state);
      if (!ok) { completed = false; break; }
      if (!state.cancelled) await new Promise((r) => setTimeout(r, 700));
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this.close();
    g.closeUi('prayer');
    this.active = null;
    return completed && !state.cancelled;
  }

  build(heading) {
    this.close();
    const root = document.createElement('div');
    root.id = 'prayer-overlay';
    root.innerHTML = `<div class="pr-box">
      <div class="pr-kicker">${heading}</div>
      <div class="pr-title" id="pr-title"></div>
      <div class="pr-text" id="pr-text" data-notr></div>
      <div class="pr-foot"><span class="pr-hint" id="pr-hint"></span><button class="btn-ghost small" type="button" id="pr-stop">Interrompi [Esc]</button></div>
    </div>`;
    document.body.appendChild(root);
    this.root = root;
    root.querySelector('#pr-stop').addEventListener('click', () => this.cancel());
    this._onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancel(); } };
    window.addEventListener('keydown', this._onKey, true);
  }

  cancel() {
    if (this.active) this.active.cancelled = true;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  close() {
    if (this._onKey) window.removeEventListener('keydown', this._onKey, true);
    this._onKey = null;
    if (this.root) this.root.remove();
    this.root = null;
  }

  /** Mostra il testo completo; evidenzia la riga recitata. Con la voce segue l'audio, senza voce va a tempo. */
  readOne(prayer, hasVoice, state) {
    const title = this.root.querySelector('#pr-title');
    const text = this.root.querySelector('#pr-text');
    const hint = this.root.querySelector('#pr-hint');
    title.textContent = prayer.title;
    text.innerHTML = prayer.lines.map((l, i) => `<p data-i="${i}">${l}</p>`).join('');
    const mark = (i) => text.querySelectorAll('p').forEach((p, k) => { p.classList.toggle('on', k === i); p.classList.toggle('done', k < i); });
    const voice = hasVoice ? pickVoice(prayer.voice) : null;
    const settings = this.game.settings || {};
    // Volume della voce: generale × effetti, con un minimo udibile
    const vol = Math.max(0.15, Math.min(1, (settings.masterVolume ?? 0.8) * Math.max(0.5, settings.sfxVolume ?? 0.8) * 1.25));
    hint.textContent = voice ? (prayer.voice === 'f' ? 'Voce femminile' : 'Voce maschile') : 'Lettura silenziosa (sintesi vocale non disponibile)';
    audio.choir(prayer.lines.length * 1.2);
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (state.cancelled) { resolve(false); return; }
        if (i >= prayer.lines.length) { mark(prayer.lines.length); resolve(true); return; }
        mark(i);
        const line = prayer.lines[i];
        i++;
        if (voice) {
          const u = new SpeechSynthesisUtterance(line);
          u.lang = 'it-IT';
          u.voice = voice;
          // Timbro: più grave per il Padre Nostro, più acuto per l'Ave Maria (anche se la voce scelta è generica)
          u.pitch = prayer.voice === 'f' ? 1.2 : 0.75;
          u.rate = 0.88;
          u.volume = vol;
          let finished = false;
          const go = () => { if (finished) return; finished = true; clearTimeout(guard); next(); };
          u.onend = go;
          u.onerror = go;
          // Riserva: se il browser non segnala la fine, si prosegue comunque
          const guard = setTimeout(go, 1200 + line.length * 140);
          window.speechSynthesis.speak(u);
        } else {
          setTimeout(next, 900 + line.length * 70);
        }
      };
      next();
    });
  }

  dispose() {
    this.cancel();
    this.close();
  }
}
