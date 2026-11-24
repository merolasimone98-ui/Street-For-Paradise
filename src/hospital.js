// Ospedale: ricovero in barella (paramedici che spingono la barella fino alla stanza), medico che ti visita,
// ringraziamento ai medici e conto da pagare all'accettazione prima di poter uscire.
// Se non puoi pagare interviene la polizia: una notte in prigione, −10 Aura e multa di € 900 (debito).
import * as THREE from 'three';
import { makePerson, HumanAnimator, randomLook } from './characters.js';
import { INTERIOR_ORIGIN } from './interiors.js';
import { SERVICE_PRICES } from './items.js';
import { formatMoney } from './birthdata.js';
import { audio } from './audio.js';
import { fadeTo, disposeObject3D } from './ui.js';

const lerp = THREE.MathUtils.lerp;

export class HospitalCare {
  constructor(game) {
    this.game = game;
    this.scene = null; // oggetti temporanei della sequenza (barella, paramedici, medico)
    this.seq = null;
  }

  get door() {
    return this.game.world.doors.find((d) => d.type === 'hospital') || null;
  }

  get inside() {
    const g = this.game;
    return !!(g.interior && g.currentDoor && g.currentDoor.type === 'hospital');
  }

  /** Barella con materasso, lenzuolo e ruote. */
  makeStretcher() {
    const grp = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0xc9d1d6, metalness: 0.85, roughness: 0.3 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.1, 2.0), new THREE.MeshStandardMaterial({ color: 0x2f7d8f, roughness: 0.7 }));
    top.position.y = 0.82;
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 1.3), new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: 1 }));
    sheet.position.set(0, 0.89, -0.25);
    grp.add(top, sheet);
    for (const [x, z] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 8), metal);
      leg.position.set(x, 0.43, z);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), new THREE.MeshStandardMaterial({ color: 0x1b1b1b }));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.06, z);
      grp.add(leg, wheel);
    }
    for (const x of [-0.36, 0.36]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 1.6), metal);
      rail.position.set(x, 0.98, 0);
      grp.add(rail);
    }
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return grp;
  }

  person(look) {
    const mesh = makePerson({ ...randomLook(), ...look });
    mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { mesh, anim: new HumanAnimator(mesh) };
  }

  /**
   * Ricovero. reason: 'faint' | 'drunk' | 'visit' | 'cliff'. bill: conto da pagare. Ritorna una Promise.
   * Se il giocatore non è già in ospedale, lo schermo deve essere già nero (dissolvenza fatta dal chiamante).
   */
  async admit({ reason, bill, title, sub }) {
    const g = this.game;
    const door = this.door;
    if (!door) return;
    g.transitioning = true;
    if (g.driving) g.exitVehicle();
    if (g.convo.isOpen) g.convo.close();
    g.player.aiming = false;
    g.police.clear(true);
    if (g.interior && !this.inside) g.leaveInteriorImmediate();
    if (!g.interior) g.openInterior(door);
    const ward = g.interior.ward;
    const W = (p) => new THREE.Vector3(INTERIOR_ORIGIN.x + p.x, 0, INTERIOR_ORIGIN.z + p.z);
    // Scena: barella all'ingresso, due paramedici, medico accanto al letto
    this.cleanup();
    this.scene = new THREE.Group();
    g.scene.add(this.scene);
    const stretcher = this.makeStretcher();
    this.scene.add(stretcher);
    const medic1 = this.person({ shirt: 0xf26b1d, pants: 0x2b2f36, sleeves: 'short', sex: 'm' });
    const medic2 = this.person({ shirt: 0xf26b1d, pants: 0x2b2f36, sleeves: 'short', sex: 'f' });
    const doctor = this.person({ shirt: 0xf4f7f8, pants: 0x9fd1c4, sleeves: 'long', glasses: true });
    this.scene.add(medic1.mesh, medic2.mesh, doctor.mesh);
    doctor.mesh.position.copy(W(ward.doctor));
    doctor.mesh.rotation.y = 0;
    this.people = [medic1, medic2, doctor];
    const path = [W(ward.entrance), W({ x: ward.entrance.x, z: ward.entrance.z - 0.6 }), W({ x: ward.side.x - 1.5, z: ward.side.z }), W(ward.side)];
    this.seq = { t: 0, dur: 6.5, path, stretcher, medic1, medic2, doctor, phase: 'ride', resolve: null };
    g.player.setPhysicsEnabled(false);
    g.rig.firstPerson = false;
    g.rig.yaw = Math.PI * 0.75;
    g.rig.pitch = 0.55;
    g.rig.targetDist = g.rig.dist = 4.2;
    this.place(0);
    audio.stretcher(6);
    audio.heartMonitor(true);
    await fadeTo(0, 0.8);
    g.toast(title || 'Ti portano in barella al reparto…', 3000);
    await new Promise((resolve) => { this.seq.resolve = resolve; });
    if (g.disposed) return;
    // Sul letto: il medico ti visita
    const st = g.state;
    const bed = W(ward.bed);
    g.player.setPose('lie', new THREE.Vector3(bed.x - 0.1, 0.72, bed.z), -Math.PI / 2);
    this.seq.phase = 'visit';
    stretcher.visible = false;
    await g.showCaption('Ospedale', sub || 'Il medico ti visita e ti cura', `Conto delle cure: ${formatMoney(bill)}. Paga all'accettazione prima di uscire.`, 3400);
    if (g.disposed) return;
    st.heal(st.maxHealth);
    st.stamina = st.maxStamina;
    st.hospitalBill += bill;
    // In piedi accanto al letto: ringrazia i medici
    g.player.setPose('auto');
    g.player.setPhysicsEnabled(true);
    const side = W(ward.side);
    g.player.setPosition(side.x, 0, side.z, Math.PI * 0.5);
    g.player.workState = 'give';
    audio.voice(g.character.sex === 'f', 9);
    g.toast(`${g.character.name}: «Grazie dottori, mi avete rimesso in piedi!»`, 3200);
    setTimeout(() => { if (!g.disposed) g.player.workState = null; }, 1600);
    audio.heartMonitor(false);
    this.seq = null;
    setTimeout(() => this.cleanup(), 4000);
    g.autosaver.saveNow();
    g.transitioning = false;
  }

  /** Posizione di barella, paramedici e paziente lungo il percorso (k = 0..1). */
  place(k) {
    const s = this.seq;
    const p = s.path;
    const segs = p.length - 1;
    const f = Math.min(segs - 1e-6, k * segs);
    const i = Math.floor(f), t = f - i;
    const a = p[i], b = p[i + 1];
    const x = lerp(a.x, b.x, t), z = lerp(a.z, b.z, t);
    const heading = Math.atan2(b.x - a.x, b.z - a.z);
    s.stretcher.position.set(x, 0, z);
    s.stretcher.rotation.y = heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    s.medic1.mesh.position.set(x - fx * 1.35, 0, z - fz * 1.35);
    s.medic1.mesh.rotation.y = heading;
    s.medic2.mesh.position.set(x + fz * 0.7 - fx * 0.2, 0, z - fx * 0.7 - fz * 0.2);
    s.medic2.mesh.rotation.y = heading;
    const g = this.game;
    g.player.setPose('lie', new THREE.Vector3(x, 0.9, z), heading + Math.PI);
  }

  update(dt) {
    const s = this.seq;
    if (!s) return;
    if (s.phase === 'ride') {
      s.t += dt;
      const k = Math.min(1, s.t / s.dur);
      this.place(k);
      s.medic1.anim.update(dt, { speed: 1.4, state: 'auto' });
      s.medic2.anim.update(dt, { speed: 1.4, state: 'auto' });
      s.doctor.anim.update(dt, { speed: 0, state: 'auto' });
      if (k >= 1 && s.resolve) { const r = s.resolve; s.resolve = null; r(); }
    } else {
      s.medic1.anim.update(dt, { speed: 0, state: 'auto' });
      s.medic2.anim.update(dt, { speed: 0, state: 'auto' });
      s.doctor.anim.update(dt, { speed: 0, state: 'tinker' });
    }
  }

  cleanup() {
    if (this.scene) {
      this.game.scene.remove(this.scene);
      disposeObject3D(this.scene);
      this.scene = null;
    }
  }

  /** Accettazione: visita (se ferito) oppure pagamento del conto. */
  reception() {
    const g = this.game;
    const st = g.state;
    const bill = st.hospitalBill;
    if (bill > 0) {
      g.dialogs.show({
        title: 'Ospedale · accettazione',
        subtitle: `Conto delle cure da saldare: <b>${formatMoney(bill)}</b>. Non puoi uscire finché non paghi.`,
        body: `${g.dialogs.payToggleHtml()}<div class="hosp-bill"><span>Cure e ricovero</span><b>${formatMoney(bill)}</b></div>
          <div class="chips"><button class="btn-solid" data-act="paybill">Paga ${formatMoney(bill)}</button><button class="btn-ghost" data-act="cannot">Non posso pagare</button></div>`,
        handlers: {
          pay: (d) => { g.dialogs.payMethod = d.m; this.reception(); },
          paybill: () => {
            if (!st.payWith(bill, g.dialogs.payMethod)) { g.toast('Fondi insufficienti: prova con la carta o chiama aiuto.', 2600); return; }
            st.hospitalBill = 0;
            audio.cash();
            g.dialogs.close();
            g.toast('Conto pagato. Arrivederci e riguardati!', 2600);
            g.autosaver.saveNow();
          },
          cannot: () => { g.dialogs.close(); this.cannotPay(); },
        },
      });
      return;
    }
    if (st.health >= st.maxHealth - 0.5) { g.toast('Il medico ti visita: sei in perfetta salute!'); return; }
    g.dialogs.show({
      title: 'Ospedale · accettazione',
      subtitle: `Visita e cure complete: ${formatMoney(SERVICE_PRICES.hospital)} (da pagare all'uscita).`,
      body: '<p>Un infermiere ti accompagna in barella fino alla stanza di ricovero.</p><div class="chips"><button class="btn-solid" data-act="visit">Fatti visitare</button></div>',
      handlers: {
        visit: async () => {
          g.dialogs.close();
          await fadeTo(1, 0.5, '#000');
          if (g.disposed) return;
          this.admit({ reason: 'visit', bill: SERVICE_PRICES.hospital, title: 'Un infermiere ti fa stendere sulla barella…' });
        },
      },
    });
  }

  /** Niente soldi: arriva la polizia → prigione per un giorno, −10 Aura, multa di € 900 (debito). */
  cannotPay() {
    const g = this.game;
    const st = g.state;
    const fine = SERVICE_PRICES.unpaidHospitalFine;
    st.hospitalBill = 0;
    st.cash -= fine; // può andare in negativo: debito
    st.changeAura(-10, 'Non hai pagato le cure in ospedale');
    st.changeHappiness(-8, 'Arrestato in ospedale');
    audio.siren(4);
    g.toast('L\'accettazione chiama la polizia…', 2400);
    setTimeout(() => {
      if (g.disposed) return;
      g.arrest(`Non hai pagato le cure: multa di ${formatMoney(fine)} (saldo: ${formatMoney(st.cash)}) e −10 Aura.`);
    }, 1800);
  }

  dispose() {
    audio.heartMonitor(false);
    this.cleanup();
    this.seq = null;
  }
}
