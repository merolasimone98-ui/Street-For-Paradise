// Livelli Aura (1-100) e ricompense riscattabili dall'app "Livelli" del telefono.

export const MAX_AURA_LEVEL = 100;
/** Livello dal quale si sblocca la sequenza completa del Paradiso (incontro con Gesù e ricordi). */
export const PARADISE_LEVEL = 100;
/** Livello dal quale si può già "intravedere" il Paradiso in chiesa (anteprima). */
export const PARADISE_PREVIEW_LEVEL = 10;

const SPECIAL = {
  1: { label: '3 candele votive + € 100', items: [['candela', 3]], money: 100 },
  2: { label: 'Kit di pronto soccorso', items: [['kit_pronto_soccorso', 1]] },
  3: { label: '€ 300', money: 300 },
  5: { label: 'Bicicletta urbana', vehicle: 'bici' },
  8: { label: 'Coperta e sacco a pelo (per chi ne ha bisogno)', items: [['coperta', 2], ['sacco_a_pelo', 1]] },
  10: { label: 'Anteprima del Paradiso + € 1.000', money: 1000 },
  15: { label: 'Motorino 50cc', vehicle: 'motorino' },
  20: { label: '€ 3.000', money: 3000 },
  25: { label: 'Bracciale d\'oro', items: [['bracciale_oro', 1]] },
  30: { label: 'Utilitaria 3 porte', vehicle: 'utilitaria' },
  40: { label: '€ 10.000', money: 10000 },
  50: { label: 'Moto sportiva 1000', vehicle: 'moto_sport' },
  60: { label: '€ 25.000', money: 25000 },
  70: { label: 'SUV 4x4', vehicle: 'suv' },
  80: { label: '€ 60.000 (per una casa tutta tua)', money: 60000 },
  90: { label: 'Coupé sportiva', vehicle: 'sportiva' },
  100: { label: 'Il Paradiso: incontro con Gesù e i ricordi con mamma e papà', paradise: true, money: 100000 },
};

/** Ricompensa del livello (sempre migliore salendo). */
export function rewardFor(level) {
  if (SPECIAL[level]) return { level, ...SPECIAL[level] };
  return { level, label: `€ ${(level * 150).toLocaleString('it-IT')}`, money: level * 150 };
}

export function levelTitle(level) {
  if (level >= 100) return 'Santo';
  if (level >= 75) return 'Anima eletta';
  if (level >= 50) return 'Testimone di fede';
  if (level >= 25) return 'Pellegrino fedele';
  if (level >= 10) return 'Discepolo';
  if (level >= 1) return 'Cercatore';
  return 'All\'inizio del cammino';
}
