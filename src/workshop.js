// Lavoro da meccanico in officina: quiz di assunzione, turno con la tuta, clienti NPC con auto guaste,
// collega che ripara al posto tuo, chiavi e soldi consegnati a mano, lavoro sotto l'auto / nel cofano /
// nel bagagliaio con minigiochi (cavi, bulloni, calibrazione) e computer per richiamare i clienti.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Npc } from './npcs.js';
import { buildVehicleMesh, SPECS } from './vehicle.js';
import { randomLook } from './characters.js';
import { GROUPS } from './playerstate.js';
import { formatMoney } from './birthdata.js';
import { audio } from './audio.js';
import { disposeObject3D } from './ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const ZONE_LABEL = { hood: 'nel vano motore (cofano)', under: 'sotto l\'auto', trunk: 'nel bagagliaio' };
const GAME_LABEL = { wires: 'Collega i cavi nel giusto ordine', bolts: 'Stringi i bulloni alla coppia giusta', calib: 'Calibra i sensori' };

/** Guasti possibili: zona di lavoro (animazione) e minigioco da risolvere. */
const FAULTS = [
  { zone: 'hood', game: 'wires', pay: 180, desc: 'La macchina non parte: giro la chiave, sento solo un clic e il cruscotto si spegne.', diag: 'Cablaggio batteria e motorino d\'avviamento' },
  { zone: 'hood', game: 'calib', pay: 220, desc: 'Si è accesa la spia motore e il minimo sale e scende da solo.', diag: 'Sensori di aspirazione da calibrare' },
  { zone: 'hood', game: 'bolts', pay: 200, desc: 'Esce vapore dal cofano e la temperatura va subito in rosso.', diag: 'Manicotto e fascette del radiatore da serrare' },
  { zone: 'under', game: 'bolts', pay: 160, desc: 'Sento un rumore metallico da sotto ogni volta che passo su un dosso.', diag: 'Staffe della marmitta allentate' },
  { zone: 'under', game: 'bolts', pay: 240, desc: 'Quando freno fischia tutto e la macchina tira a destra.', diag: 'Pinza del freno anteriore da fissare' },
  { zone: 'under', game: 'calib', pay: 260, desc: 'L\'auto è tutta storta, il volante non è dritto e in curva sbanda.', diag: 'Convergenza e assetto da calibrare' },
  { zone: 'trunk', game: 'wires', pay: 140, desc: 'Le luci posteriori non funzionano e il portellone non si apre più.', diag: 'Cablaggio dei fanali posteriori' },
  { zone: 'trunk', game: 'calib', pay: 200, desc: 'Il motore si spegne quando la benzina scende sotto metà serbatoio.', diag: 'Pompa del carburante (sotto il bagagliaio) da tarare' },
];

const CARS = [
  { kind: 'car_small', colors: [0xe9e9e6, 0x9b2c2c, 0x2c7a7b, 0x4a5568] },
  { kind: 'car', colors: [0x1a202c, 0x718096, 0x2a4365, 0xe2e8f0] },
  { kind: 'suv', colors: [0x1a1a1c, 0xe9e9e6, 0x4a5240] },
];

const QUIZ = [
  { q: 'A motore spento, una batteria auto carica misura circa…', a: ['12,6 V', '9 V', '24 V', '220 V'], ok: 0 },
  { q: 'Cosa indica una spia rossa a forma di oliatore?', a: ['Bassa pressione dell\'olio', 'Freno a mano tirato', 'Gomme sgonfie', 'Serbatoio vuoto'], ok: 0 },
  { q: 'Con quale attrezzo si serrano i bulloni delle ruote alla coppia corretta?', a: ['Chiave dinamometrica', 'Pinza', 'Cacciavite a croce', 'Martello'], ok: 0 },
  { q: 'Le pastiglie dei freni vanno sostituite quando…', a: ['Lo spessore è sotto i 3 mm circa', 'L\'auto è nuova', 'Piove', 'Il serbatoio è pieno'], ok: 0 },
  { q: 'Il liquido di raffreddamento serve a…', a: ['Tenere il motore alla giusta temperatura', 'Lubrificare il cambio', 'Pulire il parabrezza', 'Gonfiare le gomme'], ok: 0 },
  { q: 'Prima di lavorare sull\'impianto elettrico bisogna…', a: ['Scollegare il polo negativo della batteria', 'Accendere il motore', 'Riempire il serbatoio', 'Aprire i finestrini'], ok: 0 },
  { q: 'Cosa regola la convergenza?', a: ['L\'angolo delle ruote rispetto alla direzione di marcia', 'Il volume dell\'autoradio', 'La pressione dell\'olio', 'La luce dei fari'], ok: 0 },
  { q: 'Il filtro dell\'aria sporco provoca…', a: ['Più consumi e meno potenza', 'Freni più efficaci', 'Fari più luminosi', 'Nessun effetto'], ok: 0 },
];

export class Workshop {
  constructor(game, interior) {
    this.game = game;
    this.interior = interior;
    this.onShift = false;
    this.jobs = [];
    this.nextCustomer = 6;
    this.npcs = [];
    this.timers = [];
    this.uid = 1;
    this.halfD = interior.size.d / 2;
    this.shutterState = interior.shutters.map(() => ({ open: 0, target: 0 }));
  }

  get player() {
    return this.game.player;
  }

  later(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  /* =====================================================================
     Turno e assunzione
     ===================================================================== */
  manager() {
    const g = this.game;
    const st = g.state;
    if (!st.jobs.mechanic) {
      g.dialogs.message('Capofficina', 'Cerchiamo un meccanico! Per essere assunto devi superare un breve test tecnico: 5 domande, servono almeno 4 risposte giuste.', [
        { label: 'Fai il test', primary: true, onClick: () => this.quiz() },
        { label: 'Più tardi' },
      ]);
      return;
    }
    if (!this.onShift) {
      g.dialogs.message('Capofficina', `Bentornato! Riparazioni fatte finora: <b>${st.jobs.repairs}</b> · guadagni: <b>${formatMoney(st.jobs.earned)}</b>. Vuoi iniziare il turno? Indosserai la tuta e arriveranno i clienti. Uscendo dall'officina il turno finisce.`, [
        { label: 'Inizia il turno', primary: true, onClick: () => this.startShift() },
        { label: 'Non ora' },
      ]);
    } else {
      g.dialogs.message('Capofficina', 'Ottimo lavoro oggi. Vuoi chiudere il turno?', [
        { label: 'Termina il turno', primary: true, onClick: () => this.endShift() },
        { label: 'Continuo a lavorare' },
      ]);
    }
  }

  quiz() {
    const g = this.game;
    const qs = shuffle(QUIZ).slice(0, 5).map((x) => {
      const order = shuffle(x.a.map((_, i) => i));
      return { q: x.q, a: order.map((i) => x.a[i]), ok: order.indexOf(x.ok) };
    });
    let i = 0, score = 0;
    const render = (feedback = '') => {
      const cur = qs[i];
      g.dialogs.show({
        title: `Test tecnico · domanda ${i + 1} di ${qs.length}`,
        subtitle: `Risposte corrette: ${score}`,
        body: `${feedback}<p class="quiz-q">${esc(cur.q)}</p><div class="quiz-opts">${cur.a.map((a, k) => `<button class="btn-ghost" data-act="ans" data-k="${k}">${String.fromCharCode(65 + k)}. ${esc(a)}</button>`).join('')}</div>`,
        handlers: {
          ans: (d) => {
            const right = Number(d.k) === cur.ok;
            if (right) { score++; audio.confirm(); } else audio.error();
            const fb = right ? '<p class="ok">✓ Esatto!</p>' : `<p class="warn">✗ Sbagliato: era «${esc(cur.a[cur.ok])}».</p>`;
            i++;
            if (i < qs.length) { render(fb); return; }
            const passed = score >= 4;
            if (passed) {
              g.state.jobs.mechanic = true;
              g.autosaver.saveNow();
            }
            g.dialogs.message(passed ? 'Assunto!' : 'Test non superato', passed
              ? `${fb}Hai risposto bene a ${score} domande su 5. Benvenuto in officina! Ora puoi iniziare il turno.`
              : `${fb}Hai risposto bene a ${score} domande su 5 (ne servono 4). Studia un po' e riprova quando vuoi.`,
            passed ? [{ label: 'Inizia il turno', primary: true, onClick: () => this.startShift() }, { label: 'Più tardi' }] : null);
          },
        },
      });
    };
    render();
  }

  startShift() {
    if (this.onShift) return;
    this.onShift = true;
    this.player.setUniform('mechanic');
    this.player.updateHeld(this.game.state.equipped);
    this.nextCustomer = 5;
    audio.confirm();
    this.game.toast('Turno iniziato: hai indossato la tuta. Tra poco arriva il primo cliente.', 3200);
  }

  /** Fine turno (anche uscendo dall'officina). */
  endShift(leaving = false) {
    if (!this.onShift) return;
    this.onShift = false;
    this.player.setUniform(null);
    this.player.updateHeld(this.game.state.equipped);
    const unfinished = this.jobs.filter((j) => j.state === 'accepted');
    if (unfinished.length) {
      this.game.state.changeAura(-1 * unfinished.length, 'Hai lasciato a metà un lavoro già pagato');
      this.game.toast(`Turno terminato con ${unfinished.length} lavoro/i a metà: un collega li finirà (−${unfinished.length} Aura).`, 3600);
    } else if (!leaving) this.game.toast('Turno terminato. Ti sei tolto la tuta.', 2400);
    // Le auto in attesa vengono prese in carico dai colleghi
    if (!leaving) for (const j of this.jobs) if (j.state === 'waiting' || j.state === 'accepted') this.colleagueRepair(j, true);
  }

  /* =====================================================================
     Clienti e auto
     ===================================================================== */
  freeBay() {
    const used = new Set(this.jobs.map((j) => j.bayIndex));
    for (let i = 0; i < this.interior.bays.length; i++) if (!used.has(i)) return i;
    return -1;
  }

  spawnJob(bayIndex) {
    const I = this.interior;
    const bay = I.bays[bayIndex];
    const model = pick(CARS);
    const spec = SPECS[model.kind];
    const built = buildVehicleMesh(model.kind, pick(model.colors));
    const mesh = built.group;
    const from = new THREE.Vector3(bay.x, 0, I.toWorld(0, 0, -this.halfD - spec.len / 2 - 0.6).z);
    const to = new THREE.Vector3(bay.x, 0, bay.z);
    mesh.position.copy(from);
    this.game.scene.add(mesh);
    // Corpo fisico cinematico che segue esattamente il modello dell'auto
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
    body.addShape(new CANNON.Box(new CANNON.Vec3(spec.wid / 2, spec.h / 2, spec.len / 2)), new CANNON.Vec3(0, spec.h / 2, 0));
    body.collisionFilterGroup = GROUPS.WORLD;
    body.collisionFilterMask = GROUPS.PLAYER | GROUPS.NPC;
    body.position.set(from.x, 0, from.z);
    this.game.physics.addBody(body);
    const fault = pick(FAULTS);
    const job = {
      id: this.uid++, bayIndex, bay, spec, mesh, wheels: built.wheels, body, from, to, fault,
      pay: fault.pay + Math.round(Math.random() * 6) * 10, state: 'arriving', t: 0, customer: null, look: randomLook(),
      name: pick(['Sig. Rossi', 'Sig.ra Bianchi', 'Sig. Esposito', 'Sig.ra Ferrari', 'Sig. Romano', 'Sig.ra Colombo', 'Sig. Ricci', 'Sig.ra Greco']),
    };
    this.jobs.push(job);
    this.shutterState[bayIndex].target = 1;
    audio.door();
    audio.engineIgnition(model.kind);
  }

  /** Percorso a piedi dall'auto al bancone (evita le scrivanie). */
  pathToCounter(job, fromPos) {
    const I = this.interior;
    const spot = I.toWorld(5.2 + job.bayIndex * 1.4, 0, 7.6);
    const side = new THREE.Vector3(job.bay.x + job.spec.wid / 2 + 0.9, 0, job.bay.z);
    const p0 = fromPos || side;
    return [new THREE.Vector3(p0.x, 0, I.toWorld(0, 0, 2.4).z), new THREE.Vector3(spot.x, 0, I.toWorld(0, 0, 2.4).z), spot];
  }

  pathToCar(job, fromPos) {
    const I = this.interior;
    const side = new THREE.Vector3(job.bay.x + job.spec.wid / 2 + 0.9, 0, job.bay.z + 0.6);
    return [new THREE.Vector3(fromPos.x, 0, I.toWorld(0, 0, 2.4).z), new THREE.Vector3(side.x, 0, I.toWorld(0, 0, 2.4).z), side];
  }

  pathToDoor(fromPos) {
    const I = this.interior;
    return [new THREE.Vector3(fromPos.x, 0, I.toWorld(0, 0, 2.4).z), I.toWorld(0, 0, 3.0), I.toWorld(0, 0, this.halfD - 0.8)];
  }

  makeNpc(look, pos, name) {
    const n = new Npc(this.game.scene, this.game.physics, look, { x: pos.x, y: 0, z: pos.z, facing: Math.PI, name });
    this.npcs.push(n);
    return n;
  }

  removeNpc(n) {
    if (!n) return;
    n.dispose();
    this.npcs = this.npcs.filter((x) => x !== n);
  }

  addInteract(job, kind, x, z, label, radius = 1.7) {
    this.removeInteract(job);
    job.interact = { x, z, label, action: 'ws', data: { jobId: job.id, kind }, radius };
    this.interior.interactables.push(job.interact);
  }

  removeInteract(job) {
    if (!job.interact) return;
    const it = job.interact;
    this.interior.interactables = this.interior.interactables.filter((x) => x !== it);
    job.interact = null;
  }

  /** L'auto esce in retromarcia dalla serranda e il lavoro si chiude. */
  carLeaves(job) {
    job.state = 'leaving';
    job.t = 0;
    this.removeInteract(job);
    this.shutterState[job.bayIndex].target = 1;
    audio.engineIgnition('car');
  }

  /* =====================================================================
     Interazioni [E]
     ===================================================================== */
  interact(it) {
    const job = this.jobs.find((j) => j.id === it.data.jobId);
    if (!job) return;
    if (it.data.kind === 'customer') this.talkCustomer(job);
    else if (it.data.kind === 'car') this.startWork(job);
    else if (it.data.kind === 'pickup') this.handOver(job);
  }

  talkCustomer(job) {
    const g = this.game;
    audio.voice(job.look.sex === 'f', 12);
    g.dialogs.show({
      title: `Cliente · ${job.name}`,
      subtitle: `Auto in baia ${job.bayIndex + 1}`,
      body: `<p class="quiz-q">«${esc(job.fault.desc)} Riesci a ripararla?»</p>
        <div class="house-card"><div class="house-ico">🔧</div><div><div class="muted">Probabile guasto: ${esc(job.fault.diag)} · lavoro ${esc(ZONE_LABEL[job.fault.zone])}</div><div class="house-price">${formatMoney(job.pay)}</div></div></div>
        <div class="dlg-buttons">
          <button class="btn-ghost" data-act="no">No, mi dispiace</button>
          <button class="btn-ghost" data-act="mate">Chiedi ad un altro collega</button>
          <button class="btn-solid" data-act="yes">Sì, la riparo io</button>
        </div>`,
      handlers: {
        yes: () => { g.dialogs.close(); this.acceptJob(job); },
        mate: () => { g.dialogs.close(); this.colleagueRepair(job); },
        no: () => {
          g.dialogs.close();
          g.toast(`${job.name}: «Va bene, proverò da un'altra parte.»`, 2600);
          this.removeInteract(job);
          job.state = 'refused';
          job.customer.walkTo(this.pathToCar(job, job.customer.pos), 1.3, () => { this.removeNpc(job.customer); job.customer = null; this.carLeaves(job); });
        },
      },
    });
  }

  /** Il cliente ti consegna chiavi e soldi (animazione), poi se ne va a piedi. */
  acceptJob(job) {
    const g = this.game;
    const c = job.customer;
    this.removeInteract(job);
    job.state = 'handing';
    c.pose = 'give';
    c.lookTarget = this.player.feet;
    const hold = c.mesh.userData.holdR;
    const keys = makeKeysMesh();
    hold.add(keys);
    this.player.facing = Math.atan2(c.pos.x - this.player.feet.x, c.pos.z - this.player.feet.z);
    this.player.workState = 'give';
    this.player.setHeld('cash');
    audio.voice(job.look.sex === 'f', 8);
    this.later(1.3, () => {
      hold.remove(keys);
      disposeObject3D(keys);
      this.player.setHeld('keys');
      g.state.cash += job.pay;
      g.state.jobs.earned += job.pay;
      audio.cash();
      g.toast(`${job.name} ti consegna le chiavi e ${formatMoney(job.pay)}. Ripara l'auto ${ZONE_LABEL[job.fault.zone]}!`, 3600);
    });
    this.later(2.4, () => {
      this.player.workState = null;
      this.player.updateHeld(g.state.equipped);
      c.pose = 'auto';
      c.lookTarget = null;
      job.state = 'accepted';
      c.walkTo(this.pathToDoor(c.pos), 1.4, () => { this.removeNpc(c); if (job.customer === c) job.customer = null; });
      const spot = this.workSpot(job);
      this.addInteract(job, 'car', spot.x, spot.z, `riparare l'auto (${GAME_LABEL[job.fault.game].toLowerCase()})`, 1.6);
    });
  }

  /** Un collega NPC arriva e ripara l'auto al posto tuo. */
  colleagueRepair(job, silent = false) {
    const g = this.game;
    this.removeInteract(job);
    job.state = 'colleague';
    if (!silent) g.toast('«Ci penso io!» Un collega prende in carico l\'auto.', 2600);
    const look = { ...randomLook(), shirt: 0x2b4f7e, pants: 0x2b4f7e, sleeves: 'long', uniform: 'mechanic', cap: null };
    const mate = this.makeNpc(look, this.interior.backSpot, 'Collega');
    const spot = this.workSpot(job);
    mate.walkTo([new THREE.Vector3(spot.x, 0, this.interior.backSpot.z), spot], 1.6, () => {
      mate.pose = job.fault.zone === 'under' ? 'tinker' : 'hood';
      mate.lookTarget = new THREE.Vector3(job.bay.x, 0, job.bay.z);
      audio.screwdriver();
      this.later(9, () => {
        mate.pose = 'auto';
        mate.lookTarget = null;
        mate.walkTo([new THREE.Vector3(spot.x, 0, this.interior.backSpot.z), this.interior.backSpot], 1.5, () => this.removeNpc(mate));
        const c = job.customer;
        if (c) {
          // Il cliente ritira l'auto e se ne va
          c.walkTo(this.pathToCar(job, c.pos), 1.4, () => { this.removeNpc(c); job.customer = null; this.carLeaves(job); });
        } else this.carLeaves(job);
      });
    });
  }

  workSpot(job) {
    const b = job.bay, s = job.spec;
    if (job.fault.zone === 'hood') return { x: b.x, z: b.z + s.len / 2 + 0.75, facing: Math.PI };
    if (job.fault.zone === 'trunk') return { x: b.x, z: b.z - s.len / 2 - 0.75, facing: 0 };
    return { x: b.x + s.wid / 2 + 1.1, z: b.z + 0.2, facing: Math.PI / 2 };
  }

  /** Animazione di lavoro (sotto l'auto, nel cofano o nel bagagliaio) e poi il minigioco. */
  startWork(job) {
    const g = this.game;
    if (this.working) return;
    this.working = job;
    const p = this.player;
    const spot = this.workSpot(job);
    p.setHeld('wrench');
    if (job.fault.zone === 'under') {
      p.setPhysicsEnabled(false);
      p.setPose('lie', new THREE.Vector3(spot.x, 0.14, spot.z), spot.facing);
      p.workState = 'under';
    } else {
      p.setPosition(spot.x, 0, spot.z, spot.facing);
      p.workState = 'hood';
    }
    audio.screwdriver();
    g.toast(`Lavori ${ZONE_LABEL[job.fault.zone]}: ${job.fault.diag.toLowerCase()}.`, 2200);
    this.later(1.1, () => this.runMinigame(job.fault.game, (ok) => this.finishWork(job, ok)));
  }

  finishWork(job, ok) {
    const g = this.game;
    const p = this.player;
    this.working = null;
    const spot = this.workSpot(job);
    if (p.pose === 'lie') {
      p.setPose('auto');
      p.setPhysicsEnabled(true);
      p.setPosition(spot.x + 0.4, 0, spot.z, spot.facing);
    }
    p.workState = null;
    p.updateHeld(g.state.equipped);
    if (ok) {
      job.state = 'repaired';
      this.removeInteract(job);
      audio.confirm();
      g.toast('Riparazione completata! Usa il computer dell\'officina per chiamare il cliente.', 3600);
    } else {
      audio.error();
      g.toast('Riparazione non riuscita: riprova quando vuoi (premi E vicino all\'auto).', 3000);
    }
  }

  /** Il cliente richiamato arriva al bancone: consegna delle chiavi, ringraziamento e +1 Aura. */
  handOver(job) {
    const g = this.game;
    const c = job.customer;
    if (!c) return;
    this.removeInteract(job);
    job.state = 'handover';
    p_face(this.player, c.pos);
    this.player.workState = 'give';
    this.player.setHeld('keys');
    c.pose = 'give';
    c.lookTarget = this.player.feet;
    audio.voice(job.look.sex === 'f', 10);
    this.later(1.4, () => {
      this.player.workState = null;
      this.player.updateHeld(g.state.equipped);
      c.pose = 'auto';
      g.state.jobs.repairs++;
      g.state.changeAura(1, `Hai riparato l'auto di ${job.name}`);
      audio.confirm();
      g.toast(`${job.name}: «Grazie mille, va come nuova!» (+1 Aura) · Riparazioni: ${g.state.jobs.repairs}`, 3600);
      g.autosaver.saveNow();
      c.walkTo(this.pathToCar(job, c.pos), 1.4, () => { this.removeNpc(c); job.customer = null; this.carLeaves(job); });
    });
  }

  /* =====================================================================
     Computer dell'officina
     ===================================================================== */
  computer() {
    const g = this.game;
    if (!this.onShift) {
      g.dialogs.message('Computer dell\'officina', 'Accesso riservato al personale in turno. Parla con il capofficina per iniziare il turno.');
      return;
    }
    const label = {
      arriving: 'In arrivo', waiting: 'Cliente al bancone', handing: 'Consegna chiavi', accepted: 'Da riparare',
      colleague: 'Affidata a un collega', repaired: 'Riparata ✓', calling: 'Cliente in arrivo', pickup: 'Cliente al bancone',
      handover: 'Consegna', leaving: 'In uscita', refused: 'Rifiutata',
    };
    const render = () => {
      const rows = this.jobs.map((j) => `<div class="shop-row">
        <div class="shop-icon">🚗</div>
        <div class="shop-info"><b>Baia ${j.bayIndex + 1} · ${esc(j.name)}</b><span>${esc(j.fault.diag)} · ${label[j.state] || j.state}</span></div>
        ${j.state === 'repaired' ? `<button class="btn-solid small" data-act="call" data-id="${j.id}">📞 Chiama il cliente</button>` : '<span class="muted">—</span>'}
      </div>`).join('') || '<p class="muted">Nessuna auto in officina. I clienti arrivano durante il turno.</p>';
      g.dialogs.show({
        title: 'Gestionale officina',
        subtitle: `Riparazioni completate: <b>${g.state.jobs.repairs}</b> · incassi totali: <b>${formatMoney(g.state.jobs.earned)}</b>`,
        wide: true,
        body: `<div class="shop-list">${rows}</div>`,
        handlers: {
          call: (d) => {
            const j = this.jobs.find((x) => x.id === Number(d.id));
            if (!j || j.state !== 'repaired') return;
            this.callCustomer(j);
            audio.phoneRing();
            render();
          },
        },
      });
    };
    render();
  }

  callCustomer(job) {
    job.state = 'calling';
    const start = this.interior.toWorld(0, 0, this.halfD - 1.2);
    const c = this.makeNpc(job.look, start, job.name);
    job.customer = c;
    this.game.toast(`Hai chiamato ${job.name}: sta arrivando a ritirare l'auto.`, 2600);
    this.later(3, () => {
      const spot = this.interior.toWorld(5.2 + job.bayIndex * 1.4, 0, 7.6);
      c.walkTo([this.interior.toWorld(0, 0, 7.6), spot], 1.4, () => {
        job.state = 'pickup';
        c.lookTarget = this.player.feet;
        audio.voice(job.look.sex === 'f', 6);
        this.addInteract(job, 'pickup', c.pos.x, c.pos.z, `consegnare le chiavi a ${job.name}`, 1.8);
      });
    });
  }

  /* =====================================================================
     Minigiochi
     ===================================================================== */
  runMinigame(type, done) {
    let finished = false;
    const end = (ok) => {
      if (finished) return;
      finished = true;
      cleanup();
      this.game.dialogs.close();
      done(ok);
    };
    let cleanup = () => {};
    const setCleanup = (fn) => { cleanup = fn; };
    const onClose = () => { if (!finished) { finished = true; cleanup(); done(false); } };
    if (type === 'wires') this.gameWires(end, setCleanup, onClose);
    else if (type === 'bolts') this.gameBolts(end, setCleanup, onClose);
    else this.gameCalib(end, setCleanup, onClose);
  }

  /** Cavi: collega ogni filo al morsetto giusto (secondo lo schema) e nell'ordine indicato. */
  gameWires(end, setCleanup, onClose) {
    const g = this.game;
    const WIRES = [['Rosso', '#e53935'], ['Blu', '#1e88e5'], ['Giallo', '#fdd835'], ['Verde', '#43a047'], ['Arancio', '#fb8c00']];
    const codes = shuffle(['B+', 'GND', 'IGN', 'ACC', 'STA']);
    const map = {};
    WIRES.forEach(([n], i) => { map[n] = codes[i]; });
    const order = shuffle(WIRES.map((w) => w[0]));
    const terminals = shuffle(codes);
    const done = {};
    let step = 0, sel = null, errors = 0, time = 50;
    const ROW = 46;
    const render = (msg = '') => {
      const lines = Object.entries(done).map(([wire, code]) => {
        const i = WIRES.findIndex((w) => w[0] === wire), j = terminals.indexOf(code);
        return `<line x1="0" y1="${i * ROW + 20}" x2="100%" y2="${j * ROW + 20}" stroke="${WIRES[i][1]}" stroke-width="6" stroke-linecap="round"/>`;
      }).join('');
      g.dialogs.show({
        title: 'Minigioco · Cablaggio',
        subtitle: 'Seleziona il filo giusto (nell\'ordine), poi il morsetto indicato dallo schema. 3 errori o tempo scaduto = riparazione fallita.',
        wide: true,
        onClose,
        body: `<div class="mg-top"><span>Ordine: ${order.map((o, k) => `<b class="${k < step ? 'ok' : k === step ? 'cur' : ''}">${k + 1}. ${o}</b>`).join(' ')}</span><span class="mg-timer" id="mg-timer">${Math.ceil(time)} s</span><span>Errori: <b class="${errors ? 'warn' : ''}">${errors}/3</b></span></div>
          <div class="mg-legend">Schema: ${WIRES.map(([n, c]) => `<span><i style="background:${c}"></i>${n} → <b>${map[n]}</b></span>`).join('')}</div>
          <div class="wires">
            <div class="w-col">${WIRES.map(([n, c]) => `<button class="w-btn ${sel === n ? 'on' : ''} ${done[n] ? 'done' : ''}" data-act="wire" data-w="${n}" style="--c:${c}"><i></i>${n}</button>`).join('')}</div>
            <svg class="w-svg" height="${WIRES.length * ROW}" preserveAspectRatio="none">${lines}</svg>
            <div class="w-col">${terminals.map((t) => `<button class="w-btn term ${Object.values(done).includes(t) ? 'done' : ''}" data-act="term" data-t="${t}">${t}<i></i></button>`).join('')}</div>
          </div>${msg}`,
        handlers: {
          wire: (d) => {
            if (done[d.w]) return;
            if (d.w !== order[step]) { errors++; audio.error(); if (errors >= 3) { end(false); return; } render(`<p class="warn">Ordine sbagliato: ora va collegato il ${order[step]}.</p>`); return; }
            sel = d.w; audio.click(); render();
          },
          term: (d) => {
            if (!sel) { render('<p class="warn">Prima scegli un filo.</p>'); return; }
            if (map[sel] !== d.t) { errors++; audio.error(); sel = null; if (errors >= 3) { end(false); return; } render(`<p class="warn">Scintille! Morsetto sbagliato (${d.t}).</p>`); return; }
            done[sel] = d.t; sel = null; step++; audio.screwdriver();
            if (step >= WIRES.length) { end(true); return; }
            render();
          },
        },
      });
    };
    render();
    const iv = setInterval(() => {
      time -= 0.1;
      const el = document.getElementById('mg-timer');
      if (el) el.textContent = `${Math.ceil(Math.max(0, time))} s`;
      if (time <= 0) end(false);
    }, 100);
    setCleanup(() => clearInterval(iv));
  }

  /** Bulloni: premi SPAZIO quando la lancetta della chiave dinamometrica è nella zona verde (2 passate per bullone). */
  gameBolts(end, setCleanup, onClose) {
    const g = this.game;
    const N = 5;
    let bolt = 0, pass = 0, misses = 0, value = 0, dir = 1, zone = 0, width = 14, speed = 70;
    const newZone = () => {
      width = pass === 0 ? 14 - bolt : 9 - bolt * 0.8;
      zone = 18 + Math.random() * (78 - width);
      speed = 70 + bolt * 16 + pass * 22;
    };
    newZone();
    const press = () => {
      if (value >= zone && value <= zone + width) {
        audio.screwdriver();
        pass++;
        if (pass >= 2) { pass = 0; bolt++; }
        if (bolt >= N) { end(true); return; }
        newZone();
        draw();
      } else {
        misses++;
        audio.error();
        if (misses >= 3) { end(false); return; }
        draw('<p class="warn">Coppia sbagliata! Il bullone slitta.</p>');
      }
    };
    const draw = (msg = '') => {
      g.dialogs.show({
        title: 'Minigioco · Serraggio bulloni',
        subtitle: 'Premi SPAZIO (o il pulsante) quando la lancetta è nella zona verde. Ogni bullone va stretto due volte: accostaggio e coppia finale.',
        wide: true,
        onClose,
        keyHandler: (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) press(); } },
        body: `<div class="mg-top"><span>Bullone <b>${Math.min(N, bolt + 1)}</b> di ${N} · ${pass === 0 ? 'accostaggio' : 'coppia finale'}</span><span>Errori: <b class="${misses ? 'warn' : ''}">${misses}/3</b></span></div>
          <div class="bolts">${Array.from({ length: N }, (_, i) => `<span class="bolt ${i < bolt ? 'done' : i === bolt ? 'cur' : ''}">⬢</span>`).join('')}</div>
          <div class="torque"><div class="tq-zone" style="left:${zone}%;width:${width}%"></div><div class="tq-needle" id="tq-needle"></div></div>
          <div class="dlg-buttons"><button class="btn-solid" data-act="press">Stringi [Spazio]</button></div>${msg}`,
        handlers: { press: () => press() },
      });
    };
    draw();
    let last = performance.now();
    let raf = 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      value += dir * speed * dt;
      if (value >= 100) { value = 100; dir = -1; }
      if (value <= 0) { value = 0; dir = 1; }
      const n = document.getElementById('tq-needle');
      if (n) n.style.left = `${value}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    setCleanup(() => cancelAnimationFrame(raf));
  }

  /** Calibrazione: tre regolazioni accoppiate da portare tutte nella tolleranza, poi conferma. */
  gameCalib(end, setCleanup, onClose) {
    const g = this.game;
    const sol = [0, 1, 2].map(() => 15 + Math.random() * 70);
    const f = (s) => [s[0] * 0.75 + s[1] * 0.25, s[1] * 0.7 + s[2] * 0.3, s[2] * 0.8 + s[0] * 0.2];
    const target = f(sol);
    const TOL = 1.6;
    const cur = [50, 50, 50];
    let time = 55, attempts = 0;
    const names = ['Pressione', 'Flusso', 'Anticipo'];
    g.dialogs.show({
      title: 'Minigioco · Calibrazione sensori',
      subtitle: 'Le tre regolazioni influenzano più letture insieme: porta tutte le lancette sul segno giallo (tolleranza ±1,6) e premi Conferma.',
      wide: true,
      onClose,
      body: `<div class="mg-top"><span>Tentativi errati: <b id="cal-att">0</b>/2</span><span class="mg-timer" id="mg-timer">${time} s</span></div>
        ${names.map((n, i) => `<div class="cal-row"><span>${n}</span><div class="cal-gauge"><u style="left:${target[i]}%"></u><i id="cal-i${i}"></i></div><b id="cal-v${i}">—</b></div>`).join('')}
        <div class="cal-sliders">${['Regolazione A', 'Regolazione B', 'Regolazione C'].map((n, i) => `<label>${n}<input type="range" min="0" max="100" step="0.1" value="50" data-k="${i}"></label>`).join('')}</div>
        <div class="dlg-buttons"><button class="btn-solid" data-act="confirm">Conferma calibrazione</button></div><p id="cal-msg"></p>`,
      handlers: {
        confirm: () => {
          const r = f(cur);
          if (r.every((v, i) => Math.abs(v - target[i]) <= TOL)) { end(true); return; }
          attempts++;
          audio.error();
          const el = document.getElementById('cal-att');
          if (el) el.textContent = attempts;
          const m = document.getElementById('cal-msg');
          if (m) m.innerHTML = '<span class="warn">Valori fuori tolleranza!</span>';
          if (attempts >= 2) end(false);
        },
      },
    });
    const update = () => {
      const r = f(cur);
      r.forEach((v, i) => {
        const jitter = (Math.random() - 0.5) * 0.5;
        const ok = Math.abs(v - target[i]) <= TOL;
        const bar = document.getElementById(`cal-i${i}`);
        const val = document.getElementById(`cal-v${i}`);
        if (bar) { bar.style.left = `${THREE.MathUtils.clamp(v + jitter, 0, 100)}%`; bar.classList.toggle('ok', ok); }
        if (val) { val.textContent = (v + jitter).toFixed(1); val.className = ok ? 'ok' : ''; }
      });
    };
    const box = g.dialogs.box;
    const onInput = (e) => {
      const k = e.target && e.target.dataset ? e.target.dataset.k : undefined;
      if (k === undefined) return;
      cur[Number(k)] = Number(e.target.value);
      update();
    };
    box.addEventListener('input', onInput);
    update();
    const iv = setInterval(() => {
      time -= 0.2;
      update();
      const el = document.getElementById('mg-timer');
      if (el) el.textContent = `${Math.ceil(Math.max(0, time))} s`;
      if (time <= 0) end(false);
    }, 200);
    setCleanup(() => { clearInterval(iv); box.removeEventListener('input', onInput); });
  }

  /* =====================================================================
     Aggiornamento
     ===================================================================== */
  update(dt) {
    // Timer interni (animazioni di consegna, colleghi…)
    for (const t of this.timers) t.t -= dt;
    const due = this.timers.filter((t) => t.t <= 0);
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();

    if (this.onShift) {
      this.nextCustomer -= dt;
      const bay = this.freeBay();
      if (this.nextCustomer <= 0 && bay >= 0) {
        this.spawnJob(bay);
        this.nextCustomer = 35 + Math.random() * 20;
      }
    }

    for (const j of [...this.jobs]) {
      if (j.state === 'arriving' || j.state === 'leaving') {
        j.t += dt / 4;
        const k = Math.min(1, j.t);
        const e = k * k * (3 - 2 * k);
        const a = j.state === 'arriving' ? j.from : j.to;
        const b = j.state === 'arriving' ? j.to : j.from;
        j.mesh.position.lerpVectors(a, b, e);
        const spin = (j.state === 'arriving' ? 1 : -1) * 6 * Math.sin(k * Math.PI) * dt * 3;
        for (const w of j.wheels) w.node.rotation.x += spin;
        if (k >= 1) {
          if (j.state === 'arriving') {
            j.state = 'parked';
            this.shutterState[j.bayIndex].target = 0;
            // Il cliente scende e va al bancone
            const side = new THREE.Vector3(j.bay.x + j.spec.wid / 2 + 0.9, 0, j.bay.z);
            const c = this.makeNpc(j.look, side, j.name);
            j.customer = c;
            c.walkTo(this.pathToCounter(j, side), 1.35, () => {
              j.state = 'waiting';
              c.lookTarget = this.player.feet;
              audio.voice(j.look.sex === 'f', 5);
              this.addInteract(j, 'customer', c.pos.x, c.pos.z, `parlare con il cliente (${j.name})`, 1.8);
              if (!this.onShift) this.colleagueRepair(j, true);
            });
          } else {
            this.shutterState[j.bayIndex].target = 0;
            this.disposeJob(j);
            continue;
          }
        }
      }
      j.body.position.set(j.mesh.position.x, 0, j.mesh.position.z);
      if (j.interact && j.customer && (j.interact.data.kind === 'customer' || j.interact.data.kind === 'pickup')) {
        j.interact.x = j.customer.pos.x;
        j.interact.z = j.customer.pos.z;
      }
    }
    for (const n of this.npcs) n.update(dt);
    // Serrande che si alzano/abbassano
    this.interior.shutters.forEach((sh, i) => {
      const s = this.shutterState[i];
      s.open += (s.target - s.open) * Math.min(1, dt * 3);
      sh.scale.y = Math.max(0.06, 1 - s.open * 0.94);
      sh.position.y = 2.1 + s.open * 2.0;
    });
  }

  disposeJob(j) {
    this.removeInteract(j);
    if (j.customer) this.removeNpc(j.customer);
    this.game.physics.removeBody(j.body);
    this.game.scene.remove(j.mesh);
    disposeObject3D(j.mesh);
    this.jobs = this.jobs.filter((x) => x !== j);
  }

  /** Uscita dall'officina: il turno finisce e tutto viene smontato. */
  dispose() {
    if (this.working) {
      const p = this.player;
      if (p.pose === 'lie') { p.setPose('auto'); p.setPhysicsEnabled(true); }
      p.workState = null;
      this.working = null;
    }
    this.endShift(true);
    for (const j of [...this.jobs]) this.disposeJob(j);
    for (const n of [...this.npcs]) this.removeNpc(n);
    this.timers = [];
  }
}

function p_face(player, pos) {
  const f = player.feet;
  player.facing = Math.atan2(pos.x - f.x, pos.z - f.z);
}

/** Chiavi con portachiavi (in mano al cliente durante la consegna). */
function makeKeysMesh() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.95, roughness: 0.25 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.003, 6, 16), metal);
  ring.position.set(0, -0.02, 0.03);
  const key = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.06), metal);
  key.position.set(0.01, -0.02, 0.07);
  const fob = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.012), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 }));
  fob.position.set(-0.01, -0.03, 0.045);
  g.add(ring, key, fob);
  return g;
}
