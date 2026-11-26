// Stato persistente del giocatore: salute, stamina, aura, portafoglio, banca, inventario, vestiti, veicoli.
import { DEFAULT_OUTFIT, CLOTHES, itemInfo } from './items.js';

/** Gruppi di collisione Cannon-es condivisi da tutti i moduli. */
export const GROUPS = { WORLD: 1, PLAYER: 2, NPC: 4, VEHICLE: 8 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PlayerState {
  /**
   * @param {object|null} saved  save.state di una partita precedente (può mancare nei salvataggi vecchi)
   * @param {object} character
   * @param {number} fallbackCash
   */
  constructor(saved, character, fallbackCash) {
    const s = saved || {};
    const res = character.stats ? character.stats.resistenza : 50;
    this.maxHealth = Math.round(90 + res * 0.3);
    this.maxStamina = 100;
    this.health = clamp(s.health ?? this.maxHealth, 1, this.maxHealth);
    this.stamina = clamp(s.stamina ?? this.maxStamina, 0, this.maxStamina);
    this.aura = clamp(s.aura ?? 50, 0, 100);
    this.auraLog = Array.isArray(s.auraLog) ? s.auraLog.slice(0, 12) : [];
    // I contanti possono andare in negativo: è il debito (multe, penalità con Aura a zero)
    this.cash = Math.round(s.cash ?? fallbackCash ?? character.money ?? 0);
    this.bank = { account: false, balance: 0, pin: null, ...(s.bank || {}) };
    this.inventory = Array.isArray(s.inventory) ? s.inventory.filter((i) => i && i.id && i.qty > 0) : [];
    this.wardrobe = Array.isArray(s.wardrobe) ? s.wardrobe.slice() : Object.values(DEFAULT_OUTFIT).filter(Boolean);
    this.outfit = { ...DEFAULT_OUTFIT, ...(s.outfit || {}) };
    this.vehicles = Array.isArray(s.vehicles) ? s.vehicles.slice() : [];
    this.equipped = s.equipped && this.count(s.equipped) > 0 ? s.equipped : null;
    this.stats = {
      goodDeeds: 0, badDeeds: 0, arrests: 0, meals: 0, donations: 0, donatedMoney: 0,
      stolenVehicles: 0, prayers: 0, nightsSlept: 0, ...(s.stats || {}),
    };
    this.daily = { momCall: -1, prayer: -1, candle: -1, mass: -1, confession: -1, ...(s.daily || {}) };
    this.homelessGifts = s.homelessGifts || {};
    this.exhausted = false;
    // Fase 2: livelli Aura, chiesa, ubriachezza, case di proprietà
    this.auraLevel = Math.max(0, Math.min(100, s.auraLevel ?? 0));
    this.rewardsClaimed = Array.isArray(s.rewardsClaimed) ? s.rewardsClaimed.slice() : [];
    this.lastChurchDay = s.lastChurchDay ?? 1;
    this.lastChurchPenaltyDay = s.lastChurchPenaltyDay ?? 0;
    this.drunk = Math.max(0, s.drunk ?? 0);
    this.houses = Array.isArray(s.houses) ? s.houses.slice() : [];
    this.levelUps = [];
    // Fase 3: lavoro da meccanico e crimini
    this.jobs = { mechanic: false, repairs: 0, earned: 0, ...(s.jobs || {}) };
    this.stats.robberies = this.stats.robberies || 0;
    this.stats.shots = this.stats.shots || 0;
    // Felicità 0-100: sale con cibo buono e attività piacevoli, scende con eventi negativi o tristi
    this.happiness = clamp(s.happiness ?? 60, 0, 100);
    // Ospedale: conto da pagare all'accettazione prima di uscire; sostanze illegali (secondi di effetto)
    this.hospitalBill = Math.max(0, s.hospitalBill ?? 0);
    this.high = Math.max(0, s.high ?? 0);
    this.highDrug = s.highDrug || null; // sostanza più pesante ancora in corpo (intensità degli effetti)
    this.churchOfferings = s.churchOfferings || { day: -1, n: 0 }; // offerte in chiesa che danno Aura oggi
    this.stats.drugs = this.stats.drugs || 0;
    this.stats.debtPenalties = this.stats.debtPenalties || 0;
    this.happyLog = Array.isArray(s.happyLog) ? s.happyLog.slice(0, 8) : [];
    // Casco scelto per moto/scooter/bici (indossato solo in sella)
    this.helmet = s.helmet && this.count(s.helmet) > 0 ? s.helmet : null;
    // Veicoli distrutti portati in officina dopo un incidente con ricovero: { uid, name, cost }
    this.impound = Array.isArray(s.impound) ? s.impound.slice() : [];
    // Il telefono è un oggetto dell'inventario: si apre solo cliccandolo nel menu TAB
    if (!this.has('telefono')) this.inventory.unshift({ id: 'telefono', qty: 1 });
  }

  /** Varia la Felicità (0-100) e ne tiene un breve registro. */
  changeHappiness(delta, reason = '') {
    const before = this.happiness;
    this.happiness = clamp(this.happiness + delta, 0, 100);
    const real = this.happiness - before;
    if (reason && Math.abs(real) >= 0.5) {
      this.happyLog.unshift({ delta: Math.round(real * 10) / 10, reason });
      this.happyLog = this.happyLog.slice(0, 8);
    }
    return real;
  }

  happinessTitle() {
    const h = this.happiness;
    if (h >= 85) return 'Al settimo cielo';
    if (h >= 65) return 'Felice';
    if (h >= 45) return 'Sereno';
    if (h >= 25) return 'Giù di morale';
    return 'Triste';
  }

  happinessIcon() {
    const h = this.happiness;
    return h >= 85 ? '😄' : h >= 65 ? '🙂' : h >= 45 ? '😐' : h >= 25 ? '🙁' : '😢';
  }

  serialize() {
    return {
      health: Math.round(this.health), stamina: Math.round(this.stamina), aura: Math.round(this.aura * 10) / 10,
      auraLog: this.auraLog, cash: Math.round(this.cash), bank: this.bank, inventory: this.inventory,
      wardrobe: this.wardrobe, outfit: this.outfit, vehicles: this.vehicles, equipped: this.equipped,
      stats: this.stats, daily: this.daily, homelessGifts: this.homelessGifts,
      auraLevel: this.auraLevel, rewardsClaimed: this.rewardsClaimed, lastChurchDay: this.lastChurchDay,
      lastChurchPenaltyDay: this.lastChurchPenaltyDay, drunk: Math.round(this.drunk), houses: this.houses,
      jobs: this.jobs, happiness: Math.round(this.happiness * 10) / 10, happyLog: this.happyLog,
      hospitalBill: this.hospitalBill, high: Math.round(this.high), helmet: this.helmet, highDrug: this.highDrug,
      churchOfferings: this.churchOfferings, impound: this.impound,
    };
  }

  /* ---------- Inventario ---------- */
  count(id) {
    const it = this.inventory.find((i) => i.id === id);
    return it ? it.qty : 0;
  }

  has(id) {
    return this.count(id) > 0;
  }

  addItem(id, qty = 1) {
    if (CLOTHES[id]) {
      if (!this.wardrobe.includes(id)) this.wardrobe.push(id);
      return;
    }
    const it = this.inventory.find((i) => i.id === id);
    if (it) it.qty += qty;
    else this.inventory.push({ id, qty });
  }

  removeItem(id, qty = 1) {
    if (CLOTHES[id]) {
      this.wardrobe = this.wardrobe.filter((w) => w !== id);
      for (const slot of Object.keys(this.outfit)) if (this.outfit[slot] === id) this.outfit[slot] = slot === 'shirt' || slot === 'pants' || slot === 'shoes' ? DEFAULT_OUTFIT[slot] : null;
      if (!this.wardrobe.includes(this.outfit.shirt)) this.wardrobe.push(this.outfit.shirt);
      if (!this.wardrobe.includes(this.outfit.pants)) this.wardrobe.push(this.outfit.pants);
      if (!this.wardrobe.includes(this.outfit.shoes)) this.wardrobe.push(this.outfit.shoes);
      return true;
    }
    if (id === 'telefono') return false; // il telefono non si consuma né si regala
    const it = this.inventory.find((i) => i.id === id);
    if (!it || it.qty < qty) return false;
    it.qty -= qty;
    if (it.qty <= 0) {
      this.inventory = this.inventory.filter((i) => i !== it);
      if (this.equipped === id) this.equipped = null;
    }
    return true;
  }

  groupedInventory() {
    const groups = {};
    for (const it of this.inventory) {
      const info = itemInfo(it.id);
      (groups[info.cat] ||= []).push({ ...info, qty: it.qty });
    }
    groups.vestiti = this.wardrobe.map((id) => ({ ...itemInfo(id), qty: 1, worn: Object.values(this.outfit).includes(id) }));
    return groups;
  }

  /* ---------- Soldi ---------- */
  pay(amount) {
    if (this.cash < amount) return false;
    this.cash -= amount;
    return true;
  }

  /** Paga in contanti oppure con carta (dal conto) se method === 'card'. */
  payWith(amount, method) {
    if (method === 'card') {
      if (!this.bank.account || !this.has('carta_credito') || this.bank.balance < amount) return false;
      this.bank.balance -= amount;
      return true;
    }
    return this.pay(amount);
  }

  /* ---------- Salute / stamina / aura ---------- */
  heal(v) { this.health = clamp(this.health + v, 0, this.maxHealth); }
  damage(v) { this.health = clamp(this.health - v, 0, this.maxHealth); }
  restoreStamina(v) { this.stamina = clamp(this.stamina + v, 0, this.maxStamina); }

  /** Aura 1..100: sale con le buone azioni, scende con quelle cattive. */
  /**
   * Varia l'Aura. Raggiunto il 100% si sale di 1 Livello Aura (max 100) e la barra riparte dal 20%,
   * conservando l'eccedenza. I livelli raggiunti vengono accodati in this.levelUps.
   */
  changeAura(delta, reason, exact = false) {
    const before = this.aura;
    // Aura più impegnativa: i guadagni sono graduali (−30%), tranne i valori fissi (candele, elemosina)
    if (delta > 0 && !exact) delta = Math.round(delta * 0.7 * 100) / 100;
    let next = this.aura + delta;
    while (next >= 100 && this.auraLevel < 100) {
      this.auraLevel++;
      this.levelUps.push(this.auraLevel);
      next = 20 + (next - 100);
    }
    // Può scendere fino a 0: con Aura a zero scatta la penalità giornaliera di € 1.000
    this.aura = clamp(next, 0, 100);
    if (delta > 0) this.stats.goodDeeds++;
    else if (delta < 0) this.stats.badDeeds++;
    // Fare del bene rende sereni; i peccati lasciano un po' di amarezza
    if (delta > 0) this.changeHappiness(Math.min(3, delta * 0.6));
    else if (delta < 0) this.changeHappiness(Math.max(-4, delta * 0.35));
    this.auraLog.unshift({ delta: Math.round(delta * 10) / 10, reason, t: Date.now() });
    this.auraLog = this.auraLog.slice(0, 12);
    return this.aura - before;
  }

  auraTitle() {
    const a = this.aura;
    if (a >= 90) return 'Anima luminosa';
    if (a >= 75) return 'Giusto e generoso';
    if (a >= 55) return 'Persona per bene';
    if (a >= 40) return 'In bilico';
    if (a >= 20) return 'Sulla cattiva strada';
    return 'Anima smarrita';
  }
}
