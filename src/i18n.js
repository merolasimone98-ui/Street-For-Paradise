// Lingue del gioco (Italiano / English / Deutsch / Русский).
// Il codice scrive i testi in italiano; con un'altra lingua un MutationObserver traduce al volo
// tutto il testo dell'interfaccia (menu, HUD, dialoghi, negozi, telefono, notifiche, conversazioni).
// I dizionari (src/lang-en.js, lang-de.js, lang-ru.js) contengono frasi esatte e modelli con segnaposto {*}
// per i testi dinamici (nomi, prezzi, numeri), che vengono a loro volta tradotti. Tedesco e russo cercano
// prima nel proprio dizionario e, se una frase manca, usano l'inglese (mai l'italiano a metà).
// Le insegne 3D usano tr() al momento della creazione.
import { EN } from './lang-en.js';
import { DE } from './lang-de.js';
import { RU } from './lang-ru.js';
import { loadSettings, onSettingsChange } from './settings.js';

/** Bandiere in SVG (le emoji delle bandiere non si vedono su Windows). */
const FLAG_IT = '<svg viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ce2b37"/></svg>';
const FLAG_DE = '<svg viewBox="0 0 5 3" aria-hidden="true"><rect width="5" height="1" fill="#000"/><rect y="1" width="5" height="1" fill="#dd0000"/><rect y="2" width="5" height="1" fill="#ffce00"/></svg>';
const FLAG_RU = '<svg viewBox="0 0 9 6" aria-hidden="true"><rect width="9" height="2" fill="#fff"/><rect y="2" width="9" height="2" fill="#0039a6"/><rect y="4" width="9" height="2" fill="#d52b1e"/></svg>';
const FLAG_EN = '<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="uk-c"><path d="M0,0 v30 h60 v-30 z"/></clipPath><clipPath id="uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z"/></clipPath><g clip-path="url(#uk-c)"><path d="M0,0 v30 h60 v-30 z" fill="#012169"/><path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#uk-t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0 v30 M0,15 h60" stroke="#fff" stroke-width="10"/><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6"/></g></svg>';

export const LANGUAGES = {
  it: { flag: FLAG_IT, label: 'ITALIANO', locale: 'it-IT' },
  en: { flag: FLAG_EN, label: 'ENGLISH', locale: 'en-GB' },
  de: { flag: FLAG_DE, label: 'DEUTSCH', locale: 'de-DE' },
  ru: { flag: FLAG_RU, label: 'РУССКИЙ', locale: 'ru-RU' },
};

let lang = 'it';
const cache = new Map();
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Compila un dizionario: chiavi esatte e modelli con {*} (i più specifici vengono provati per primi). */
function compile(dict) {
  const exact = new Map();
  const lowerExact = new Map();
  const patterns = [];
  for (const [k, v] of Object.entries(dict)) {
    const key = norm(k);
    if (key.includes('{*}')) {
      const parts = key.split('{*}');
      const re = new RegExp('^' + parts.map(escapeRe).join('(.+?)') + '$');
      patterns.push({ re, out: v, literal: parts.join('').length, holes: parts.length - 1 });
    } else {
      exact.set(key, v);
      lowerExact.set(key.toLowerCase(), v);
    }
  }
  patterns.sort((a, b) => b.literal - a.literal || a.holes - b.holes);
  return { exact, lowerExact, patterns };
}
const COMPILED = { en: compile(EN), de: compile(DE), ru: compile(RU) };
/** Dizionari consultati per la lingua attiva: prima il suo, poi l'inglese come riserva. */
const chain = () => (lang === 'en' ? [COMPILED.en] : [COMPILED[lang], COMPILED.en].filter(Boolean));

export function getLanguage() {
  return lang;
}

export function getLocale() {
  return (LANGUAGES[lang] || LANGUAGES.it).locale;
}

/** Sostituisce {*} (in ordine) o {1},{2}… (per riordinare) con i valori catturati. */
function fill(out, caps) {
  if (/\{\d\}/.test(out)) return out.replace(/\{(\d)\}/g, (_, n) => caps[Number(n) - 1] ?? '');
  let i = 0;
  return out.replace(/\{\*\}/g, () => caps[i++] ?? '');
}

const matchCase = (src, out) => (src && src[0] === src[0].toUpperCase() && src[0] !== src[0].toLowerCase() ? out.charAt(0).toUpperCase() + out.slice(1) : out);

function lookupIn(D, k) {
  if (D.exact.has(k)) return D.exact.get(k);
  const lo = D.lowerExact.get(k.toLowerCase());
  if (lo !== undefined) {
    if (k === k.toUpperCase() && /[A-ZÀ-Ý]/.test(k)) return lo.toUpperCase();
    return matchCase(k, lo);
  }
  return undefined;
}

function lookup(k) {
  for (const D of chain()) {
    const hit = lookupIn(D, k);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/* Date del calendario: "Dom 3 mag", "Domenica 3 maggio 2026", "3 mag 2008" */
const IT_DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const IT_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DAYS = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  ru: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
};
const DAYS_SHORT = { en: null, de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'], ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] };
const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
};
const MONTHS_SHORT = { en: null, de: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'], ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] };
const dayIdx = (s) => IT_DAYS.findIndex((d) => d.startsWith(s.toLowerCase().slice(0, 3)));
const monIdx = (s) => IT_MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)));
function translateDate(k) {
  const L = DAYS[lang] ? lang : 'en';
  const dShort = (i) => (DAYS_SHORT[L] ? DAYS_SHORT[L][i] : DAYS[L][i].slice(0, 3));
  const mShort = (i) => (MONTHS_SHORT[L] ? MONTHS_SHORT[L][i] : MONTHS[L][i].slice(0, 3));
  // Tedesco: "Mo 3. Mai"; russo: "Пн 3 мая"; inglese: "Mon 3 May"
  const dot = L === 'de' ? '.' : '';
  let m = k.match(/^([A-Za-zì]{3})\s(\d{1,2})\s([A-Za-z]{3})$/);
  if (m && dayIdx(m[1]) >= 0 && monIdx(m[3]) >= 0) return `${dShort(dayIdx(m[1]))} ${m[2]}${dot} ${mShort(monIdx(m[3]))}`;
  m = k.match(/^([A-Za-zì]+)\s(\d{1,2})\s([A-Za-z]+)\s(\d{4})$/);
  if (m && dayIdx(m[1]) >= 0 && monIdx(m[3]) >= 0 && IT_DAYS.includes(m[1].toLowerCase())) return `${DAYS[L][dayIdx(m[1])]} ${m[2]}${dot} ${MONTHS[L][monIdx(m[3])]} ${m[4]}`;
  m = k.match(/^(\d{1,2})\s([A-Za-z]{3,})\s(\d{4})$/);
  if (m && monIdx(m[2]) >= 0) return `${m[1]}${dot} ${mShort(monIdx(m[2]))} ${m[3]}`;
  return null;
}

const SPLITTERS = [/(\s·\s)/, /(\s—\s|\s–\s)/, /(\n)/, /(?<=[.!?…»])(\s+)(?=[«A-ZÀ-Ý0-9(])/, /(:\s)/, /(\s\(|\)\s?)/, /(,\s)/];

function translateCore(text, depth) {
  const k = norm(text);
  if (!k || !/[A-Za-zÀ-ÿ]/.test(k)) return text;
  const hit = lookup(k);
  if (hit !== undefined) return hit;
  const date = translateDate(k);
  if (date) return date;
  // Testi composti con " · ": se ogni pezzo con lettere si traduce, si uniscono i pezzi tradotti
  if (depth < 4 && k.includes(' · ')) {
    const parts = k.split(' · ');
    const out = parts.map((p) => (/[A-Za-zÀ-ÿ]{2,}/.test(p) ? translateCore(p, depth + 1) : p));
    if (out.every((t, i) => t !== parts[i] || !/[A-Za-zÀ-ÿ]{2,}/.test(parts[i]))) return out.join(' · ');
  }
  // Punteggiatura finale separata (es. "Fondi insufficienti." → chiave senza punto)
  const pm = k.match(/^(.*?)([.!?:…]+)$/);
  if (pm && pm[1]) {
    const h2 = lookup(pm[1]);
    if (h2 !== undefined) return h2 + pm[2];
  }
  for (const D of chain()) {
    for (const p of D.patterns) {
      const m = p.re.exec(k);
      if (m) return fill(p.out, m.slice(1).map((c) => (depth < 4 ? translateCore(c, depth + 1) : c)));
    }
  }
  // Frasi composte: si traducono i pezzi separatamente
  if (depth < 4) {
    for (const sp of SPLITTERS) {
      const parts = k.split(sp);
      if (parts.length < 3) continue;
      let changed = false;
      const out = parts.map((p, i) => {
        if (i % 2 === 1) return p; // separatore
        const t = translateCore(p, depth + 1);
        if (t !== p) changed = true;
        return t;
      });
      if (changed) return out.join('');
    }
  }
  return text;
}

/** Traduce un testo italiano nella lingua attiva (identità in italiano). */
export function tr(text) {
  if (lang === 'it' || text == null) return text;
  const s = String(text);
  const cached = cache.get(s);
  if (cached !== undefined) return cached;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2];
  const out = core ? m[1] + translateCore(core, 0) + m[3] : s;
  if (cache.size > 6000) cache.clear();
  cache.set(s, out);
  return out;
}

/* ---------- Traduzione automatica del DOM ---------- */
const ORIG = new WeakMap(); // nodo di testo → testo italiano originale
const WROTE = new WeakMap(); // nodo di testo → ultimo testo scritto dal traduttore
const ATTRS = ['placeholder', 'title', 'aria-label'];
const ORIG_ATTR = new WeakMap();
const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'TEXTAREA', 'NOSCRIPT']);
let observer = null;
let applying = false;

function skipNode(n) {
  const p = n.parentElement;
  return !p || SKIP.has(p.tagName) || p.closest('[data-notr]');
}

function translateText(n) {
  if (skipNode(n)) return;
  const cur = n.data;
  let orig = ORIG.get(n);
  if (orig === undefined || cur !== WROTE.get(n)) {
    orig = cur; // il gioco ha scritto un nuovo testo (in italiano)
    ORIG.set(n, orig);
  }
  const out = lang === 'it' ? orig : tr(orig);
  WROTE.set(n, out);
  if (out !== cur) n.data = out;
}

function translateAttrs(el) {
  if (!el.getAttribute || el.closest('[data-notr]')) return;
  let store = ORIG_ATTR.get(el);
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    if (!store) { store = {}; ORIG_ATTR.set(el, store); }
    if (store[a] === undefined || (store['_' + a] !== v)) store[a] = v;
    const out = lang === 'it' ? store[a] : tr(store[a]);
    store['_' + a] = out;
    if (out !== v) el.setAttribute(a, out);
  }
}

function walk(root) {
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1) {
    if (SKIP.has(root.tagName)) return;
    translateAttrs(root);
  }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n = tw.nextNode();
  while (n) {
    if (n.nodeType === 3) translateText(n);
    else translateAttrs(n);
    n = tw.nextNode();
  }
}

function onMutations(list) {
  if (applying) return;
  applying = true;
  try {
    for (const m of list) {
      if (m.type === 'characterData') translateText(m.target);
      else if (m.type === 'attributes') translateAttrs(m.target);
      else for (const n of m.addedNodes) walk(n);
    }
  } finally {
    applying = false;
  }
}

/** Cambia lingua e ritraduce tutta la pagina. */
export function setLanguage(code) {
  const next = LANGUAGES[code] ? code : 'it';
  if (next === lang && observer) return;
  lang = next;
  cache.clear();
  document.documentElement.lang = next; // il CSS adatta spaziature e caratteri per tedesco e cirillico
  applying = true;
  try { walk(document.body); } finally { applying = false; }
}

/** Avvia la traduzione automatica (una sola volta, all'avvio). */
export function initI18n() {
  lang = 'it';
  setLanguage(loadSettings().lang || 'it');
  if (!observer) {
    observer = new MutationObserver(onMutations);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  onSettingsChange((s) => { if ((s.lang || 'it') !== lang) setLanguage(s.lang); });
}
