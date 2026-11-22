// Cataloghi di gioco: oggetti, vestiti, veicoli, menù di ristoranti e negozi.

/* ---------- Oggetti generici (inventario) ---------- */
export const ITEMS = {
  // Cibo e bevande
  panino: { name: 'Panino', cat: 'cibo', price: 6, heal: 12, icon: '🥪', desc: 'Prosciutto e formaggio.' },
  pizza_trancio: { name: 'Trancio di pizza', cat: 'cibo', price: 4, heal: 10, icon: '🍕', desc: 'Margherita, appena sfornata.' },
  mela: { name: 'Mela', cat: 'cibo', price: 1, heal: 4, icon: '🍎', desc: 'Frutta fresca.' },
  barretta: { name: 'Barretta energetica', cat: 'cibo', price: 3, heal: 6, stamina: 40, icon: '🍫', desc: 'Ricarica la stamina.' },
  acqua: { name: 'Bottiglia d\'acqua', cat: 'cibo', price: 1, heal: 3, stamina: 25, icon: '💧', desc: 'Mezzo litro.' },
  caffe: { name: 'Caffè', cat: 'cibo', price: 2, heal: 2, stamina: 35, icon: '☕', desc: 'Espresso.' },
  pasto_pronto: { name: 'Pasto pronto', cat: 'cibo', price: 9, heal: 22, icon: '🍱', desc: 'Pasta al forno da asporto.' },
  // Medicinali (ripristinano la salute in 3 secondi)
  cerotti: { name: 'Cerotti', cat: 'medicinali', price: 4, heal: 10, icon: '🩹', desc: 'Per piccole ferite.' },
  paracetamolo: { name: 'Paracetamolo', cat: 'medicinali', price: 7, heal: 25, icon: '💊', desc: 'Antidolorifico e antifebbrile.' },
  ibuprofene: { name: 'Ibuprofene', cat: 'medicinali', price: 9, heal: 35, icon: '💊', desc: 'Antinfiammatorio.' },
  sciroppo: { name: 'Sciroppo per la tosse', cat: 'medicinali', price: 8, heal: 15, icon: '🧴', desc: 'Calma la tosse.' },
  vitamine: { name: 'Vitamine', cat: 'medicinali', price: 12, heal: 20, stamina: 50, icon: '🟠', desc: 'Integratore multivitaminico.' },
  kit_pronto_soccorso: { name: 'Kit di pronto soccorso', cat: 'medicinali', price: 45, heal: 100, icon: '🧰', desc: 'Ripristina completamente la salute.' },
  // Armi e attrezzi (armeria)
  cacciavite: { name: 'Cacciavite speciale', cat: 'attrezzi', price: 450, hold: 'screwdriver', icon: '🪛', desc: 'Forza le serrature dei veicoli che non sono tuoi.' },
  torcia: { name: 'Torcia tattica', cat: 'attrezzi', price: 60, hold: 'flashlight', icon: '🔦', desc: 'Illumina la strada di notte.' },
  coltello: { name: 'Coltello da caccia', cat: 'armi', price: 120, hold: 'knife', icon: '🔪', desc: 'Lama in acciaio inox.' },
  mazza: { name: 'Mazza da baseball', cat: 'armi', price: 80, hold: 'bat', icon: '🏏', desc: 'Legno di frassino.' },
  pistola: { name: 'Pistola 9mm', cat: 'armi', price: 2400, hold: 'pistol', icon: '🔫', desc: 'Richiede porto d\'armi. Solo per difesa.' },
  fondina: { name: 'Fondina', cat: 'armi', price: 70, icon: '🧷', desc: 'Accessorio per la pistola.' },
  motosega: { name: 'Motosega', cat: 'attrezzi', price: 380, hold: 'chainsaw', icon: '🪚', desc: 'Impugnala e tieni premuto il tasto sinistro per accenderla.' },
  // Varie (minimarket)
  sacco_a_pelo: { name: 'Sacco a pelo', cat: 'varie', price: 55, icon: '🛌', desc: 'Caldo anche d\'inverno.' },
  tenda: { name: 'Tenda da campeggio', cat: 'varie', price: 140, icon: '⛺', desc: 'Due posti, montaggio rapido.' },
  coperta: { name: 'Coperta', cat: 'varie', price: 20, icon: '🧣', desc: 'Lana pesante.' },
  candela: { name: 'Candela votiva', cat: 'varie', price: 2, icon: '🕯️', desc: 'Da accendere in chiesa.' },
  // Documenti
  carta_credito: { name: 'Carta di credito', cat: 'documenti', price: 0, icon: '💳', desc: 'Usala agli ATM con il tuo PIN.' },
};

/* ---------- Vestiti e accessori ---------- */
export const CLOTHES = {
  tshirt_bianca: { name: 'T-shirt bianca', slot: 'shirt', color: 0xeeeeea, sleeves: 'short', price: 15 },
  tshirt_grigia: { name: 'T-shirt grigia', slot: 'shirt', color: 0x7b7f86, sleeves: 'short', price: 15 },
  tshirt_nera: { name: 'T-shirt nera', slot: 'shirt', color: 0x1d1e22, sleeves: 'short', price: 18 },
  polo_blu: { name: 'Polo blu navy', slot: 'shirt', color: 0x1f2f55, sleeves: 'short', price: 35 },
  camicia_azzurra: { name: 'Camicia azzurra', slot: 'shirt', color: 0x9cc3e6, sleeves: 'long', price: 45 },
  felpa_rossa: { name: 'Felpa rossa', slot: 'shirt', color: 0x9a2224, sleeves: 'long', price: 50 },
  felpa_verde: { name: 'Felpa verde militare', slot: 'shirt', color: 0x4b5a35, sleeves: 'long', price: 50 },
  giacca_pelle: { name: 'Giacca di pelle', slot: 'shirt', color: 0x2a1c16, sleeves: 'long', price: 220 },
  completo_grigio: { name: 'Giacca elegante grigia', slot: 'shirt', color: 0x55585f, sleeves: 'long', price: 380 },
  jeans_blu: { name: 'Jeans blu', slot: 'pants', color: 0x2d3d5c, price: 40 },
  jeans_neri: { name: 'Jeans neri', slot: 'pants', color: 0x1c1d22, price: 45 },
  cargo_beige: { name: 'Pantaloni cargo beige', slot: 'pants', color: 0x9c8a66, price: 38 },
  tuta_grigia: { name: 'Pantaloni della tuta', slot: 'pants', color: 0x6c6f75, price: 30 },
  chino_verde: { name: 'Chino verde oliva', slot: 'pants', color: 0x55593e, price: 55 },
  sneakers_bianche: { name: 'Sneakers bianche', slot: 'shoes', color: 0xf0f0ee, price: 60 },
  sneakers_nere: { name: 'Sneakers nere', slot: 'shoes', color: 0x1a1a1c, price: 60 },
  stivali: { name: 'Stivali in pelle', slot: 'shoes', color: 0x4a2f1c, price: 110 },
  mocassini: { name: 'Mocassini', slot: 'shoes', color: 0x5a3a24, price: 140 },
  berretto_nero: { name: 'Berretto con visiera nero', slot: 'cap', color: 0x18191c, price: 20 },
  berretto_rosso: { name: 'Berretto con visiera rosso', slot: 'cap', color: 0xa11f22, price: 20 },
  berretto_bianco: { name: 'Berretto con visiera bianco', slot: 'cap', color: 0xe9e9e6, price: 20 },
  bracciale_oro: { name: 'Bracciale d\'oro', slot: 'bracelet', color: 0xd6a73a, metal: true, price: 650 },
  bracciale_argento: { name: 'Bracciale d\'argento', slot: 'bracelet', color: 0xc9ced3, metal: true, price: 180 },
  bracciale_pelle: { name: 'Bracciale in pelle', slot: 'bracelet', color: 0x5a3a24, price: 25 },
  anello_oro: { name: 'Anello d\'oro', slot: 'ring', color: 0xd6a73a, metal: true, price: 420 },
  anello_argento: { name: 'Anello d\'argento', slot: 'ring', color: 0xc9ced3, metal: true, price: 95 },
  occhiali_sole: { name: 'Occhiali da sole', slot: 'glasses', color: 0x111111, price: 85 },
};

export const CLOTH_SLOTS = {
  shirt: 'Maglia / giacca', pants: 'Pantaloni', shoes: 'Scarpe', cap: 'Berretto',
  bracelet: 'Bracciale', ring: 'Anello', glasses: 'Occhiali',
};

export const DEFAULT_OUTFIT = {
  shirt: 'tshirt_grigia', pants: 'jeans_blu', shoes: 'sneakers_bianche',
  cap: null, bracelet: null, ring: null, glasses: null,
};

/* ---------- Veicoli (concessionario) ---------- */
export const VEHICLE_MODELS = {
  bici: { name: 'Bicicletta urbana', kind: 'bike', price: 320, colors: [0x2b6cb0, 0x1d1d1f, 0xc53030] },
  mtb: { name: 'Mountain bike', kind: 'bike', price: 690, colors: [0x2f855a, 0xdd6b20] },
  motorino: { name: 'Motorino 50cc', kind: 'scooter', price: 1900, colors: [0xe9e9e6, 0x9b2c2c, 0x2c5282] },
  scooter125: { name: 'Scooter 125cc', kind: 'scooter', price: 3400, colors: [0x1a1a1c, 0xb7b7b2] },
  moto_naked: { name: 'Moto naked 650', kind: 'moto', price: 7800, colors: [0xc53030, 0x1a1a1c, 0xd69e2e] },
  moto_sport: { name: 'Moto sportiva 1000', kind: 'moto', price: 16500, colors: [0x2b6cb0, 0xe9e9e6] },
  utilitaria: { name: 'Utilitaria 3 porte', kind: 'car_small', price: 9800, colors: [0xe9e9e6, 0x9b2c2c, 0x2c7a7b, 0x4a5568] },
  berlina: { name: 'Berlina familiare', kind: 'car', price: 24500, colors: [0x1a202c, 0x718096, 0x2a4365, 0xe2e8f0] },
  suv: { name: 'SUV 4x4', kind: 'suv', price: 39000, colors: [0x1a1a1c, 0xe9e9e6, 0x4a5240] },
  sportiva: { name: 'Coupé sportiva', kind: 'sport', price: 86000, colors: [0xc53030, 0xd69e2e, 0x1a1a1c] },
  // Non in vendita: volanti delle pattuglie
  polizia: { name: 'Volante della Polizia', kind: 'car', price: 0, colors: [0xf2f4f7], hidden: true },
};

/* ---------- Menù di ristorante e pizzeria ---------- */
export const MENUS = {
  restaurant: {
    title: 'Trattoria del Porto',
    items: [
      { id: 'bruschetta', name: 'Bruschetta al pomodoro', cat: 'Antipasti', price: 6, heal: 6, color: 0xc0392b },
      { id: 'tagliere', name: 'Tagliere di salumi e formaggi', cat: 'Antipasti', price: 14, heal: 12, color: 0xd98880 },
      { id: 'carbonara', name: 'Spaghetti alla carbonara', cat: 'Primi', price: 12, heal: 22, color: 0xf4d03f },
      { id: 'lasagna', name: 'Lasagna al forno', cat: 'Primi', price: 13, heal: 25, color: 0xc0392b },
      { id: 'risotto', name: 'Risotto ai funghi porcini', cat: 'Primi', price: 15, heal: 22, color: 0xd5c4a1 },
      { id: 'bistecca', name: 'Tagliata di manzo', cat: 'Secondi', price: 24, heal: 30, color: 0x7b3f2a },
      { id: 'branzino', name: 'Branzino al forno', cat: 'Secondi', price: 21, heal: 26, color: 0xe5e7e9 },
      { id: 'cotoletta', name: 'Cotoletta con patate', cat: 'Secondi', price: 16, heal: 26, color: 0xd4a017 },
      { id: 'tiramisu', name: 'Tiramisù', cat: 'Dolci', price: 7, heal: 8, color: 0x8b6b4a },
      { id: 'pannacotta', name: 'Panna cotta ai frutti di bosco', cat: 'Dolci', price: 6, heal: 7, color: 0xf5eef8 },
      { id: 'cannolo', name: 'Cannolo siciliano', cat: 'Dolci', price: 5, heal: 6, color: 0xe6c27a },
      { id: 'acqua_tav', name: 'Acqua minerale 75cl', cat: 'Bevande', price: 3, heal: 2, color: 0xaed6f1 },
      { id: 'vino', name: 'Calice di vino rosso', cat: 'Bevande', price: 6, heal: 2, color: 0x7b241c },
      { id: 'bibita', name: 'Bibita in lattina', cat: 'Bevande', price: 3, heal: 2, color: 0xc0392b },
      { id: 'espresso', name: 'Caffè espresso', cat: 'Bevande', price: 2, heal: 1, color: 0x3e2723 },
    ],
  },
  pizzeria: {
    title: 'Pizzeria Vesuvio',
    items: [
      { id: 'frittatina', name: 'Frittatina di pasta', cat: 'Fritti', price: 4, heal: 8, color: 0xd4a017 },
      { id: 'supplì', name: 'Supplì al telefono', cat: 'Fritti', price: 3, heal: 7, color: 0xca6f1e },
      { id: 'margherita', name: 'Pizza Margherita', cat: 'Pizze', price: 7, heal: 24, color: 0xe74c3c },
      { id: 'marinara', name: 'Pizza Marinara', cat: 'Pizze', price: 6, heal: 20, color: 0xc0392b },
      { id: 'diavola', name: 'Pizza Diavola', cat: 'Pizze', price: 9, heal: 26, color: 0xb03a2e },
      { id: 'capricciosa', name: 'Pizza Capricciosa', cat: 'Pizze', price: 10, heal: 28, color: 0xdc7633 },
      { id: 'quattro_formaggi', name: 'Pizza 4 formaggi', cat: 'Pizze', price: 10, heal: 28, color: 0xf7dc6f },
      { id: 'calzone', name: 'Calzone ripieno', cat: 'Pizze', price: 9, heal: 27, color: 0xd68910 },
      { id: 'babà', name: 'Babà al rum', cat: 'Dolci', price: 5, heal: 6, color: 0xb9770e },
      { id: 'sfogliatella', name: 'Sfogliatella riccia', cat: 'Dolci', price: 3, heal: 5, color: 0xf0b27a },
      { id: 'birra', name: 'Birra alla spina', cat: 'Bevande', price: 5, heal: 2, color: 0xf4d03f },
      { id: 'cola', name: 'Cola in bottiglia', cat: 'Bevande', price: 3, heal: 2, color: 0x4a2511 },
      { id: 'acqua_pizz', name: 'Acqua naturale', cat: 'Bevande', price: 2, heal: 2, color: 0xaed6f1 },
    ],
  },
};

/* ---------- Bevande del bar "Paradise" (alcol = punti di ubriachezza) ---------- */
export const DRINKS = [
  { id: 'acqua_bar', name: 'Acqua tonica con limone', cat: 'Analcolici', price: 3, alcohol: 0, color: 'e8f4ff', stamina: 15 },
  { id: 'cola_bar', name: 'Cola con ghiaccio', cat: 'Analcolici', price: 4, alcohol: 0, color: '3a1d0c', stamina: 20 },
  { id: 'succo', name: 'Succo d\'arancia fresco', cat: 'Analcolici', price: 4, alcohol: 0, color: 'ff9a1f', stamina: 15, heal: 3 },
  { id: 'virgin_mojito', name: 'Virgin mojito', cat: 'Analcolici', price: 6, alcohol: 0, color: 'c8f0b0', stamina: 20 },
  { id: 'crodino', name: 'Aperitivo analcolico', cat: 'Analcolici', price: 4, alcohol: 0, color: 'ff6a1f', stamina: 10 },
  { id: 'birra_bar', name: 'Birra media alla spina', cat: 'Alcolici', price: 5, alcohol: 9, color: 'f2c230' },
  { id: 'vino_bar', name: 'Calice di vino rosso', cat: 'Alcolici', price: 6, alcohol: 10, color: '6d0f1c' },
  { id: 'spritz', name: 'Spritz', cat: 'Alcolici', price: 7, alcohol: 11, color: 'ff6a1f' },
  { id: 'mojito', name: 'Mojito', cat: 'Alcolici', price: 8, alcohol: 13, color: 'd9f2c4' },
  { id: 'negroni', name: 'Negroni', cat: 'Alcolici', price: 9, alcohol: 16, color: 'b3122a' },
  { id: 'whisky', name: 'Whisky on the rocks', cat: 'Alcolici', price: 10, alcohol: 18, color: 'c27a1d' },
  { id: 'vodka', name: 'Shot di vodka', cat: 'Alcolici', price: 5, alcohol: 15, color: 'f4f8ff' },
  { id: 'tequila', name: 'Shot di tequila con sale e lime', cat: 'Alcolici', price: 6, alcohol: 15, color: 'f6e7a0' },
];

/* ---------- Assortimento dei negozi ---------- */
export const SHOP_STOCK = {
  market: ['panino', 'pizza_trancio', 'mela', 'barretta', 'acqua', 'caffe', 'pasto_pronto', 'coperta', 'sacco_a_pelo', 'tenda', 'candela'],
  pharmacy: ['cerotti', 'paracetamolo', 'ibuprofene', 'sciroppo', 'vitamine', 'kit_pronto_soccorso'],
  weapons: ['cacciavite', 'torcia', 'motosega', 'coltello', 'mazza', 'pistola', 'fondina'],
  bar: ['caffe', 'acqua', 'panino', 'barretta'],
};

export const CATEGORY_LABELS = {
  cibo: 'Cibo e bevande', medicinali: 'Medicinali', attrezzi: 'Attrezzi', armi: 'Armi',
  varie: 'Varie', documenti: 'Documenti', vestiti: 'Vestiti e accessori',
};

export function itemInfo(id) {
  if (ITEMS[id]) return { id, ...ITEMS[id] };
  if (CLOTHES[id]) return { id, ...CLOTHES[id], cat: 'vestiti', icon: '👕' };
  return { id, name: id, cat: 'varie', price: 0, icon: '📦', desc: '' };
}
