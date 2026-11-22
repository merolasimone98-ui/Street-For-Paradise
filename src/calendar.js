// Calendario di gioco e calendario liturgico cattolico (feste fisse e mobili, calcolo della Pasqua).

export const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
export const DAYS_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

/** Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher, calendario gregoriano). */
export function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const key = (d) => `${d.getMonth() + 1}-${d.getDate()}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const cache = new Map();

/** Mappa "M-G" -> nome della festività per l'anno dato. */
export function feastsOfYear(year) {
  if (cache.has(year)) return cache.get(year);
  const f = new Map();
  const fixed = [
    [1, 1, 'Maria Santissima Madre di Dio'], [1, 6, 'Epifania del Signore'], [2, 2, 'Presentazione del Signore'],
    [3, 19, 'San Giuseppe'], [3, 25, 'Annunciazione del Signore'], [6, 24, 'Natività di San Giovanni Battista'],
    [6, 29, 'Santi Pietro e Paolo'], [8, 6, 'Trasfigurazione del Signore'], [8, 15, 'Assunzione di Maria'],
    [9, 8, 'Natività della Beata Vergine Maria'], [9, 29, 'Santi Arcangeli Michele, Gabriele e Raffaele'],
    [10, 4, 'San Francesco d\'Assisi'], [11, 1, 'Ognissanti'], [11, 2, 'Commemorazione dei Defunti'],
    [12, 8, 'Immacolata Concezione'], [12, 24, 'Vigilia di Natale'], [12, 25, 'Natale del Signore'], [12, 26, 'Santo Stefano'],
  ];
  for (const [m, d, n] of fixed) f.set(`${m}-${d}`, n);
  const easter = easterDate(year);
  const mobile = [
    [-46, 'Mercoledì delle Ceneri'], [-7, 'Domenica delle Palme'], [-3, 'Giovedì Santo'], [-2, 'Venerdì Santo'],
    [-1, 'Sabato Santo'], [0, 'Pasqua di Risurrezione'], [1, 'Lunedì dell\'Angelo'], [7, 'Domenica della Divina Misericordia'],
    [39, 'Ascensione del Signore'], [49, 'Pentecoste'], [56, 'Santissima Trinità'], [60, 'Corpus Domini'], [68, 'Sacro Cuore di Gesù'],
  ];
  for (const [off, n] of mobile) f.set(key(addDays(easter, off)), n);
  // Prima domenica di Avvento: quarta domenica prima di Natale; Cristo Re: domenica precedente
  const christmas = new Date(year, 11, 25);
  const advent = addDays(christmas, -((christmas.getDay() || 7) + 21));
  f.set(key(advent), 'Prima Domenica di Avvento');
  f.set(key(addDays(advent, -7)), 'Cristo Re dell\'Universo');
  cache.set(year, f);
  return f;
}

/** Informazioni liturgiche sul giorno: festa, domenica, "giorno in rosso". */
export function dayInfo(date) {
  const feast = feastsOfYear(date.getFullYear()).get(key(date)) || null;
  const sunday = date.getDay() === 0;
  return { feast, sunday, red: !!feast || sunday };
}

/** Prossima festività cristiana (esclude le semplici domeniche) a partire da `date` (incluso). */
export function nextFeast(date) {
  for (let i = 0; i < 400; i++) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + i);
    const feast = feastsOfYear(d.getFullYear()).get(key(d));
    if (feast) return { date: d, feast, inDays: i };
  }
  return null;
}

/** Data reale corrispondente al giorno di gioco (giorno 1 = compleanno dei 18 anni). */
export function gameDate(character, day) {
  const bd = character.birthday || { day: 1, month: 0 };
  const y = (character.birthYear || new Date().getFullYear() - 18) + 18;
  return new Date(y, bd.month, bd.day + (day - 1));
}

export function formatDate(d, long = false) {
  const wd = DAYS_IT[d.getDay()];
  return long
    ? `${wd} ${d.getDate()} ${MONTHS_IT[d.getMonth()].toLowerCase()} ${d.getFullYear()}`
    : `${wd.slice(0, 3)} ${d.getDate()} ${MONTHS_IT[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

/** HTML della griglia mensile (lunedì come primo giorno). */
export function calendarHtml(year, month, today) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const feasts = feastsOfYear(year);
  let cells = DAYS_SHORT.map((d, i) => `<div class="cal-h ${i === 6 ? 'red' : ''}">${d}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += '<div class="cal-d empty"></div>';
  const list = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    const feast = feasts.get(`${month + 1}-${d}`);
    const sunday = date.getDay() === 0;
    const isToday = today && today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;
    if (feast) list.push(`<li><b>${d}</b> ${feast}</li>`);
    cells += `<div class="cal-d ${feast ? 'feast' : ''} ${sunday ? 'sun' : ''} ${isToday ? 'today' : ''}" title="${feast || (sunday ? 'Domenica' : '')}">${d}${feast ? '<i></i>' : ''}</div>`;
  }
  return `<div class="cal-grid">${cells}</div>
    <ul class="cal-feasts">${list.join('') || '<li class="muted">Nessuna solennità particolare questo mese: le domeniche sono comunque giorni del Signore.</li>'}</ul>
    <p class="muted">In rosso: domeniche e festività cristiane. Andare a Messa in un giorno rosso dà +5 Aura extra.</p>`;
}
