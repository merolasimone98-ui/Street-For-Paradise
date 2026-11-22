// Conversazioni con i passanti in stile GTA V: box pulito in basso, risposte numerate [1]-[4],
// battute contestuali (quartiere, ora del giorno, Aura, festività, indicazioni stradali).
// Il mouse resta catturato: la telecamera si muove, il personaggio resta fermo finché si parla.
import { $ } from './ui.js';
import { audio } from './audio.js';
import { BUILDING_TYPES } from './world.js';
import { gameDate, nextFeast, dayInfo, formatDate } from './calendar.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
const NUMPAD = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'];
const MAX_DIST = 4;

const DISTRICT_LINES = {
  rich: ['Qui in centro gli affitti sono alle stelle, ma che vista!', 'Hai visto le vetrine delle boutique? Prezzi da capogiro.'],
  middle: ['Quartiere tranquillo, gente per bene. Mi trovo bene qui.', 'La pizzeria all\'angolo è la migliore della zona.'],
  worker: ['Turno di dodici ore in fabbrica… sono distrutto.', 'Qui si lavora sodo, ma ci si aiuta tra vicini.'],
  poor: ['Questa zona è dura. Stai attento la sera.', 'Ci sono tante persone che dormono per strada qui. Fa male al cuore.'],
  suburb: ['Che pace qui nel quartiere residenziale, si sentono gli uccellini.', 'Ci sono delle case in vendita qui intorno, hai visto i cartelli?'],
  villas: ['Le villette con giardino qui sono un sogno, ma costano parecchio.', 'Di domenica qui si sente solo il profumo di barbecue.'],
  country: ['Dalle colline si vede tutta la città. Spettacolo.', 'Hai visto il lago? Al tramonto è magnifico.'],
};

const PLACES = [
  { id: 'church', types: ['church', 'cathedral', 'chapel'], label: 'Una chiesa' },
  { id: 'hospital', types: ['hospital'], label: 'L\'ospedale' },
  { id: 'food', types: ['restaurant', 'pizzeria'], label: 'Dove si mangia' },
  { id: 'bar', types: ['bar'], label: 'Il locale "Paradise"' },
];

/** Direzione cardinale (N = -z sulla mappa) da (x0,z0) verso (x1,z1). */
function cardinal(x0, z0, x1, z1) {
  const a = Math.atan2(x1 - x0, -(z1 - z0)); // 0 = nord, +π/2 = est
  const dirs = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ovest', 'ovest', 'nord-ovest'];
  return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

export class Conversation {
  constructor(game) {
    this.game = game;
    this.root = $('convo');
    this.npc = null;
    this.options = [];
    this.closeTimer = 0;
  }

  get isOpen() {
    return !!this.npc;
  }

  open(npc) {
    if (this.npc) this.close();
    this.npc = npc;
    npc.inConversation = true;
    npc.lookTarget = this.game.player.feet;
    this.game.player.facing = Math.atan2(npc.pos.x - this.game.player.feet.x, npc.pos.z - this.game.player.feet.z);
    this.closeTimer = 0;
    this.say(this.greeting(), this.rootOptions());
  }

  close() {
    if (!this.npc) return;
    this.npc.inConversation = false;
    this.npc.lookTarget = null;
    this.npc = null;
    this.options = [];
    this.root.classList.add('hidden');
  }

  /** Mostra la battuta dell'NPC e le possibili risposte. */
  say(text, options) {
    const npc = this.npc;
    this.options = options;
    this.closeTimer = options.length ? 0 : 3.2;
    const female = npc.look && npc.look.sex === 'f';
    audio.voice(female, 5 + Math.min(14, Math.floor(text.length / 9)));
    this.root.innerHTML = `
      <div class="cv-name">${esc(npc.name)}</div>
      <div class="cv-line">«${esc(text)}»</div>
      ${options.length ? `<div class="cv-opts">${options.map((o, i) => `<div class="cv-opt ${o.tone || ''}"><kbd>${i + 1}</kbd><span>${esc(o.label)}</span></div>`).join('')}</div>` : ''}
      <div class="cv-foot"><kbd>E</kbd> ${options.length ? 'Saluta e vai' : 'Chiudi'}</div>`;
    this.root.classList.remove('hidden');
  }

  greeting() {
    const g = this.game;
    const st = g.state;
    const h = g.hour;
    const hello = h < 12.5 ? 'Buongiorno!' : h < 18 ? 'Buon pomeriggio!' : 'Buonasera!';
    const district = g.world.getDistrictAt(this.npc.pos.x, this.npc.pos.z);
    const local = DISTRICT_LINES[district.id] ? pick(DISTRICT_LINES[district.id]) : 'Questa città non dorme mai.';
    if (st.drunk > 25) return `${hello} Mamma mia, sei ubriaco fradicio… ${pick(['Vai a casa a riposare.', 'Bevi un po\' d\'acqua!'])}`;
    if (st.aura <= 25) return pick(['Ho sentito parlare di te… cosa vuoi?', 'Mmh. Non ho molto tempo per te.']);
    if (st.auraLevel >= 10 || st.aura >= 80) return `${hello} Sei quello che aiuta sempre tutti, vero? ${local}`;
    if (h >= 22 || h < 5) return `${pick(['È tardi, eh?', 'A quest\'ora in giro?'])} ${local}`;
    return `${hello} ${local}`;
  }

  rootOptions() {
    const npcDay = this.npc.helpedDay === this.game.day;
    return [
      { label: 'Mi sai indicare un posto?', act: () => this.directionsMenu() },
      { label: 'Che giorno è oggi? Ci sono feste in arrivo?', act: () => this.feastTalk() },
      { label: npcDay ? 'Ti serve ancora una mano?' : 'Hai bisogno di una mano?', tone: 'good', act: () => this.offerHelp() },
      { label: 'Levati di mezzo.', tone: 'bad', act: () => this.rude() },
    ];
  }

  directionsMenu() {
    this.say('Certo, dove devi andare?', PLACES.map((p) => ({ label: p.label, act: () => this.directions(p) })));
  }

  directions(place) {
    const g = this.game;
    const f = g.player.feet;
    let best = null, bestD = Infinity;
    for (const d of g.world.doors) {
      if (!place.types.includes(d.type)) continue;
      const dist = Math.hypot(d.x - f.x, d.z - f.z);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    if (!best) { this.say('Mi dispiace, non saprei proprio. Prova a guardare la mappa (ESC).', this.backOption()); return; }
    const m = Math.round(bestD / 10) * 10;
    const dir = cardinal(f.x, f.z, best.x, best.z);
    const name = best.name || (BUILDING_TYPES[best.type] && BUILDING_TYPES[best.type].name) || 'Ci siamo';
    const how = m < 60 ? 'È proprio qui vicino' : m < 250 ? 'Non è lontano' : 'È un po\' lontano, ti conviene un mezzo o un taxi';
    this.say(`${name}? ${how}, circa ${m} metri verso ${dir}. Sulla mappa la trovi subito.`, this.backOption());
  }

  feastTalk() {
    const g = this.game;
    const today = gameDate(g.character, g.day);
    const info = dayInfo(today);
    const nf = nextFeast(new Date(today.getFullYear(), today.getMonth(), today.getDate() + (info.feast ? 1 : 0)));
    let txt = `Oggi è ${formatDate(today, true)}.`;
    if (info.feast) txt += ` È ${info.feast}: oggi la messa vale doppio!`;
    else if (info.sunday) txt += ' È domenica, giorno del Signore: c\'è la Santa Messa.';
    if (nf) txt += ` La prossima festa è ${nf.feast}, ${formatDate(nf.date, true)}${nf.inDays <= 1 ? ', domani!' : ` (tra ${nf.inDays + (info.feast ? 1 : 0)} giorni)`}.`;
    const since = g.day - g.state.lastChurchDay;
    if (since >= 5) txt += ' E… da quanto non vai in chiesa? Don Michele ti aspetta.';
    this.say(txt, this.backOption());
  }

  offerHelp() {
    const g = this.game;
    const npc = this.npc;
    if (npc.helpedDay === g.day) {
      this.say('No, grazie, hai già fatto tanto oggi. Che Dio ti benedica!', []);
      return;
    }
    npc.helpedDay = g.day;
    const tasks = [
      ['Mi porteresti queste borse fino all\'angolo? Grazie infinite!', 1.5],
      ['Sto cercando il mio cane… ah eccolo! Grazie per esserti fermato.', 1],
      ['Mi presti il telefono per una chiamata? Grazie, sei gentilissimo.', 1],
      ['No, grazie, ma è raro trovare qualcuno così gentile.', 0.6],
    ];
    const [line, aura] = pick(tasks);
    g.state.changeAura(aura, `Hai offerto aiuto a ${npc.name}`);
    audio.confirm();
    this.say(`${line} (+${aura} Aura)`, []);
  }

  rude() {
    const g = this.game;
    const npc = this.npc;
    g.state.changeAura(-2, `Sei stato scortese con ${npc.name}`);
    audio.hurt();
    this.say(pick(['Ma come ti permetti? Maleducato!', 'Che caratteraccio… vergognati.', 'Ma va\' a quel paese!']) + ' (−2 Aura)', []);
  }

  backOption() {
    return [{ label: 'Grazie! Un\'altra cosa…', act: () => this.say('Dimmi pure.', this.rootOptions()) }];
  }

  /** Da chiamare ogni frame con l'input di gioco. Restituisce true se la conversazione è aperta. */
  update(dt, input) {
    if (!this.npc) return false;
    const g = this.game;
    const f = g.player.feet;
    if (Math.hypot(this.npc.pos.x - f.x, this.npc.pos.z - f.z) > MAX_DIST || g.interior || g.driving) {
      this.close();
      return false;
    }
    if (input.consumePressed('KeyE')) {
      if (this.options.length) audio.voice(this.npc.look && this.npc.look.sex === 'f', 3);
      this.close();
      return false;
    }
    for (let i = 0; i < this.options.length; i++) {
      if (input.consumePressed(KEYS[i]) || input.consumePressed(NUMPAD[i])) {
        audio.click();
        this.options[i].act();
        break;
      }
    }
    if (this.closeTimer > 0) {
      this.closeTimer -= dt;
      if (this.closeTimer <= 0) this.close();
    }
    return !!this.npc;
  }
}
