// Dati del mondo: città di nascita, contesti familiari e generatore casuale.

export const CITIES = [
  {
    id: 'napoli', city: 'Napoli', country: 'Italia', code: 'IT', lat: 40.85, lon: 14.27, moneyMult: 0.85,
    mods: { resistenza: 2, carisma: 6, riflessi: 3 },
    bonus: ['Carisma di strada (+6 Carisma)', 'Rete familiare e di quartiere fortissima'],
    malus: ['Disoccupazione giovanile alta', 'Burocrazia lenta (−15% patrimonio)'],
    palette: [0xe8c9a0, 0xd9a27a, 0xf0dcc0, 0xc98f6b, 0xe3b98f, 0xb9785a],
    names: { m: ['Gennaro', 'Ciro', 'Salvatore', 'Vincenzo', 'Pasquale'], f: ['Carmela', 'Assunta', 'Teresa', 'Rosa', 'Chiara'] },
    surnames: ['Esposito', 'Russo', 'De Luca', 'Coppola', 'Ferrara'],
  },
  {
    id: 'newyork', city: 'New York', country: 'Stati Uniti', code: 'US', lat: 40.71, lon: -74.0, moneyMult: 1.35,
    mods: { resistenza: 1, carisma: 4, riflessi: 4 },
    bonus: ['Opportunità economiche enormi (+35% patrimonio)', 'Città che non dorme mai'],
    malus: ['Costo della vita altissimo', 'Competizione spietata'],
    palette: [0x9a8f86, 0x7d6f66, 0xb7aca0, 0x8e5a48, 0x5d6670, 0xa7a29c],
    names: { m: ['Jayden', 'Marcus', 'Tyler', 'Daniel', 'Luis'], f: ['Ashley', 'Kayla', 'Maya', 'Brianna', 'Sofia'] },
    surnames: ['Johnson', 'Rivera', 'Williams', 'Brooks', 'Morales'],
  },
  {
    id: 'tokyo', city: 'Tokyo', country: 'Giappone', code: 'JP', lat: 35.68, lon: 139.69, moneyMult: 1.2,
    mods: { resistenza: 2, carisma: -2, riflessi: 7 },
    bonus: ['Sicurezza e trasporti eccellenti', 'Disciplina e precisione (+7 Riflessi)'],
    malus: ['Pressione sociale e lavorativa', 'Spazi abitativi minuscoli'],
    palette: [0xd4d4d0, 0xb9bcc0, 0xe6e2da, 0x8f959c, 0xc7c0b5, 0x6f757c],
    names: { m: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kaito'], f: ['Yui', 'Hina', 'Sakura', 'Aoi', 'Mei'] },
    surnames: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe'],
  },
  {
    id: 'rio', city: 'Rio de Janeiro', country: 'Brasile', code: 'BR', lat: -22.91, lon: -43.17, moneyMult: 0.6,
    mods: { resistenza: 5, carisma: 6, riflessi: 3 },
    bonus: ['Energia e carisma contagiosi (+6 Carisma)', 'Clima e mare tutto l’anno'],
    malus: ['Criminalità diffusa', 'Forti disuguaglianze (−40% patrimonio)'],
    palette: [0xf2d16b, 0xe89a5c, 0x7fc4b8, 0xf0efe6, 0xd46c5a, 0x9bc96f],
    names: { m: ['Gabriel', 'Lucas', 'Matheus', 'Thiago', 'Rafael'], f: ['Ana', 'Beatriz', 'Larissa', 'Júlia', 'Camila'] },
    surnames: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira'],
  },
  {
    id: 'berlino', city: 'Berlino', country: 'Germania', code: 'DE', lat: 52.52, lon: 13.4, moneyMult: 1.15,
    mods: { resistenza: 3, carisma: 1, riflessi: 2 },
    bonus: ['Welfare solido e istruzione gratuita', 'Scena culturale vivace'],
    malus: ['Inverni lunghi e grigi', 'Affitti in forte crescita'],
    palette: [0xc9c3b8, 0x9d978d, 0xe0dbd0, 0x7a8288, 0xb59f86, 0x8c9a8f],
    names: { m: ['Leon', 'Finn', 'Jonas', 'Elias', 'Emre'], f: ['Mia', 'Lena', 'Hannah', 'Emma', 'Leyla'] },
    surnames: ['Müller', 'Schmidt', 'Weber', 'Wagner', 'Yilmaz'],
  },
  {
    id: 'lagos', city: 'Lagos', country: 'Nigeria', code: 'NG', lat: 6.52, lon: 3.38, moneyMult: 0.4,
    mods: { resistenza: 8, carisma: 4, riflessi: 2 },
    bonus: ['Spirito imprenditoriale (+4 Carisma)', 'Tempra durissima (+8 Resistenza)'],
    malus: ['Infrastrutture fragili', 'Economia instabile (−60% patrimonio)'],
    palette: [0xe0c49a, 0xc77d4f, 0xd8d0b8, 0x8fae7d, 0xb5a27f, 0x6f8fa6],
    names: { m: ['Chinedu', 'Tunde', 'Emeka', 'Seun', 'Ifeanyi'], f: ['Ngozi', 'Amaka', 'Funmi', 'Chioma', 'Zainab'] },
    surnames: ['Okafor', 'Adeyemi', 'Balogun', 'Eze', 'Bello'],
  },
  {
    id: 'mumbai', city: 'Mumbai', country: 'India', code: 'IN', lat: 19.08, lon: 72.88, moneyMult: 0.45,
    mods: { resistenza: 6, carisma: 2, riflessi: 4 },
    bonus: ['Capitale del cinema e degli affari', 'Adattabilità estrema'],
    malus: ['Sovraffollamento', 'Divario enorme tra ricchi e poveri'],
    palette: [0xe9d7b6, 0xd6a86b, 0xc2c9b0, 0xe78f6a, 0x9c8a7a, 0xf3e7cf],
    names: { m: ['Arjun', 'Rohan', 'Vikram', 'Aditya', 'Imran'], f: ['Priya', 'Ananya', 'Kavya', 'Sana', 'Isha'] },
    surnames: ['Sharma', 'Patel', 'Iyer', 'Khan', 'Desai'],
  },
  {
    id: 'cdmx', city: 'Città del Messico', country: 'Messico', code: 'MX', lat: 19.43, lon: -99.13, moneyMult: 0.55,
    mods: { resistenza: 5, carisma: 5, riflessi: 2 },
    bonus: ['Comunità calorosa (+5 Carisma)', 'Cucina e cultura leggendarie'],
    malus: ['Smog e traffico', 'Corruzione diffusa'],
    palette: [0xe7b26a, 0xd56e5c, 0x6fb3c9, 0xf1e3c8, 0xb0c46f, 0xc58fbb],
    names: { m: ['Santiago', 'Diego', 'Emiliano', 'Mateo', 'Alejandro'], f: ['Valentina', 'Ximena', 'Regina', 'Fernanda', 'Lucía'] },
    surnames: ['Hernández', 'García', 'Martínez', 'López', 'Ramírez'],
  },
  {
    id: 'mosca', city: 'Mosca', country: 'Russia', code: 'RU', lat: 55.75, lon: 37.62, moneyMult: 0.75,
    mods: { resistenza: 8, carisma: -1, riflessi: 2 },
    bonus: ['Resistenza al freddo e alla fatica (+8)', 'Ottime scuole tecniche'],
    malus: ['Inverni estremi', 'Mercato del lavoro chiuso'],
    palette: [0xc4b8a6, 0xa69683, 0xdcd3c3, 0x8b4a3c, 0x7d8a96, 0xbdae8f],
    names: { m: ['Dmitri', 'Ivan', 'Aleksei', 'Mikhail', 'Artem'], f: ['Anastasia', 'Daria', 'Polina', 'Sofia', 'Ksenia'] },
    surnames: ['Ivanov', 'Smirnov', 'Kuznetsov', 'Popov', 'Volkov'],
  },
  {
    id: 'sydney', city: 'Sydney', country: 'Australia', code: 'AU', lat: -33.87, lon: 151.21, moneyMult: 1.2,
    mods: { resistenza: 4, carisma: 3, riflessi: 3 },
    bonus: ['Qualità della vita altissima', 'Vita all’aria aperta (+4 Resistenza)'],
    malus: ['Lontano da tutto', 'Case carissime'],
    palette: [0xe8dcc7, 0xc9b291, 0xf3efe6, 0x9ab3bf, 0xd29b74, 0xb5c2a0],
    names: { m: ['Jack', 'Oliver', 'Liam', 'Noah', 'Kai'], f: ['Charlotte', 'Olivia', 'Isla', 'Ruby', 'Zoe'] },
    surnames: ['Smith', 'Nguyen', 'Taylor', 'Wilson', 'Kelly'],
  },
  {
    id: 'cairo', city: 'Il Cairo', country: 'Egitto', code: 'EG', lat: 30.04, lon: 31.24, moneyMult: 0.45,
    mods: { resistenza: 6, carisma: 3, riflessi: 3 },
    bonus: ['Città millenaria e vivissima', 'Abilità nel commercio (+3 Carisma)'],
    malus: ['Caldo e sovraffollamento', 'Salari bassi (−55% patrimonio)'],
    palette: [0xd9c29a, 0xc4a36f, 0xe6d6b4, 0xb08a5b, 0xa39782, 0xd1b48a],
    names: { m: ['Omar', 'Youssef', 'Karim', 'Mostafa', 'Ahmed'], f: ['Nour', 'Salma', 'Yasmin', 'Farida', 'Mariam'] },
    surnames: ['Hassan', 'Mahmoud', 'Fathy', 'Saleh', 'Ibrahim'],
  },
  {
    id: 'londra', city: 'Londra', country: 'Regno Unito', code: 'GB', lat: 51.51, lon: -0.13, moneyMult: 1.3,
    mods: { resistenza: 2, carisma: 4, riflessi: 3 },
    bonus: ['Hub finanziario mondiale (+30% patrimonio)', 'Multiculturale'],
    malus: ['Affitti proibitivi', 'Pioggia, tanta pioggia'],
    palette: [0xa65a44, 0xc9b9a0, 0x8f8f8a, 0xe1dbcf, 0x6b7680, 0xb38b6d],
    names: { m: ['Harry', 'George', 'Kwame', 'Ollie', 'Rhys'], f: ['Amelia', 'Freya', 'Aisha', 'Poppy', 'Grace'] },
    surnames: ['Smith', 'Jones', 'Patel', 'Evans', 'Clarke'],
  },
  {
    id: 'seoul', city: 'Seul', country: 'Corea del Sud', code: 'KR', lat: 37.57, lon: 126.98, moneyMult: 1.1,
    mods: { resistenza: 2, carisma: 2, riflessi: 6 },
    bonus: ['Tecnologia ovunque', 'Riflessi da gamer (+6 Riflessi)'],
    malus: ['Competizione scolastica feroce', 'Ritmi di lavoro estenuanti'],
    palette: [0xd8d8d4, 0xb5b8bc, 0xece8df, 0x8c97a3, 0xc9b6a4, 0x737c86],
    names: { m: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Do-yun', 'Ha-joon'], f: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Yu-na'] },
    surnames: ['Kim', 'Lee', 'Park', 'Choi', 'Jung'],
  },
  {
    id: 'buenosaires', city: 'Buenos Aires', country: 'Argentina', code: 'AR', lat: -34.6, lon: -58.38, moneyMult: 0.55,
    mods: { resistenza: 4, carisma: 6, riflessi: 3 },
    bonus: ['Passione e talento (+6 Carisma)', 'Università pubblica gratuita'],
    malus: ['Inflazione galoppante (−45% patrimonio)', 'Crisi economiche cicliche'],
    palette: [0xe5d3b3, 0xc79a6b, 0x9fb6c4, 0xf0e8da, 0xb3765a, 0x8fa38a],
    names: { m: ['Bautista', 'Thiago', 'Facundo', 'Joaquín', 'Lautaro'], f: ['Martina', 'Catalina', 'Delfina', 'Abril', 'Lucía'] },
    surnames: ['González', 'Fernández', 'Rodríguez', 'Gómez', 'Romero'],
  },
  {
    id: 'parigi', city: 'Parigi', country: 'Francia', code: 'FR', lat: 48.86, lon: 2.35, moneyMult: 1.15,
    mods: { resistenza: 1, carisma: 6, riflessi: 2 },
    bonus: ['Stile e fascino (+6 Carisma)', 'Servizi pubblici efficienti'],
    malus: ['Banlieue isolate', 'Costo della vita alto'],
    palette: [0xe9dfcb, 0xd6c6a8, 0xc2b59b, 0x8d99a6, 0xf1ebe0, 0xb7a58a],
    names: { m: ['Lucas', 'Hugo', 'Karim', 'Louis', 'Nathan'], f: ['Léa', 'Chloé', 'Inès', 'Camille', 'Manon'] },
    surnames: ['Martin', 'Bernard', 'Dubois', 'Benali', 'Moreau'],
  },
  {
    id: 'istanbul', city: 'Istanbul', country: 'Turchia', code: 'TR', lat: 41.01, lon: 28.98, moneyMult: 0.6,
    mods: { resistenza: 4, carisma: 5, riflessi: 3 },
    bonus: ['Ponte tra due continenti', 'Arte del commercio (+5 Carisma)'],
    malus: ['Inflazione alta (−40% patrimonio)', 'Traffico infernale'],
    palette: [0xe4cfae, 0xc98b5f, 0xd9d1c0, 0x8aa1ad, 0xb55f4b, 0xa9b38a],
    names: { m: ['Emir', 'Yusuf', 'Kerem', 'Mert', 'Burak'], f: ['Zeynep', 'Elif', 'Defne', 'Ecrin', 'Ayşe'] },
    surnames: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik'],
  },
  {
    id: 'losangeles', city: 'Los Angeles', country: 'Stati Uniti', code: 'US', lat: 34.05, lon: -118.24, moneyMult: 1.3,
    mods: { resistenza: 2, carisma: 5, riflessi: 4 },
    bonus: ['Industria dello spettacolo', 'Sole 300 giorni l’anno'],
    malus: ['Senza auto non sei nessuno', 'Gang e quartieri difficili'],
    palette: [0xf0e2c8, 0xe3b98b, 0xc9d3c5, 0xd98f74, 0xa7b9c7, 0xf5efe3],
    names: { m: ['Carlos', 'Andre', 'Ethan', 'Marcus', 'Diego'], f: ['Jasmine', 'Madison', 'Isabella', 'Destiny', 'Camila'] },
    surnames: ['Garcia', 'Lee', 'Washington', 'Flores', 'Kim'],
  },
  {
    id: 'johannesburg', city: 'Johannesburg', country: 'Sudafrica', code: 'ZA', lat: -26.2, lon: 28.05, moneyMult: 0.5,
    mods: { resistenza: 7, carisma: 3, riflessi: 4 },
    bonus: ['Città dell’oro e degli affari', 'Sopravvivenza urbana (+7 Resistenza)'],
    malus: ['Criminalità elevata', 'Disuguaglianze storiche (−50% patrimonio)'],
    palette: [0xd8c3a0, 0xb98b5e, 0xcfd2c4, 0x8f7c66, 0xa6b59a, 0xe6dcc6],
    names: { m: ['Thabo', 'Sipho', 'Lwazi', 'Pieter', 'Kagiso'], f: ['Lerato', 'Naledi', 'Thandi', 'Zanele', 'Anika'] },
    surnames: ['Nkosi', 'Dlamini', 'Mokoena', 'Botha', 'Khumalo'],
  },
];

export const FAMILIES = [
  {
    id: 'rich', label: 'Famiglia Benestante', short: 'Benestante', weight: 14,
    desc: 'Genitori professionisti, casa di proprietà in un quartiere elegante. Scuole private, viaggi e nessuna preoccupazione economica.',
    money: [45000, 95000], mods: { resistenza: -2, carisma: 4, riflessi: 0 }, hospital: 'premium',
  },
  {
    id: 'middle', label: 'Ceto Medio', short: 'Ceto medio', weight: 34,
    desc: 'Due stipendi, un mutuo e le vacanze d’estate. Una vita stabile, ma a fine mese bisogna fare i conti.',
    money: [9000, 22000], mods: { resistenza: 1, carisma: 1, riflessi: 1 }, hospital: 'standard',
  },
  {
    id: 'worker', label: 'Famiglia Operaia', short: 'Operaia', weight: 30,
    desc: 'Turni in fabbrica, lavori manuali e straordinari. Pochi soldi, tanta dignità e una famiglia unita.',
    money: [2500, 7000], mods: { resistenza: 4, carisma: 0, riflessi: 1 }, hospital: 'public',
  },
  {
    id: 'poor', label: 'Quartiere Popolare · Disagiato', short: 'Disagiata', weight: 22,
    desc: 'Case popolari, un genitore spesso assente, la strada come seconda scuola. Si cresce in fretta.',
    money: [80, 1500], mods: { resistenza: 7, carisma: -2, riflessi: 4 }, hospital: 'poor',
  },
];

export const SKIN_TONES = [0xf3d3b8, 0xe7bc98, 0xd29f78, 0xb7835b, 0x8d5a3b, 0x6b4129, 0x4a2c1c];
export const HAIR_COLORS = [0x1b1410, 0x2e1f15, 0x4a2f1d, 0x6b4a2b, 0xa8763e, 0xd8b27a, 0x2a2a2a];

const BLOOD = [['0+', 38], ['A+', 32], ['B+', 9], ['AB+', 3], ['0-', 7], ['A-', 7], ['B-', 2], ['AB-', 2]];

export const getCity = (id) => CITIES.find((c) => c.id === id) || CITIES[0];
export const getFamily = (id) => FAMILIES.find((f) => f.id === id) || FAMILIES[1];

const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

function weighted(list, getWeight, rng = Math.random) {
  const total = list.reduce((s, x) => s + getWeight(x), 0);
  let r = rng() * total;
  for (const x of list) {
    r -= getWeight(x);
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

function gaussian(mean, sd, rng = Math.random) {
  const u = 1 - rng();
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const clampStat = (v) => Math.max(5, Math.min(99, Math.round(v)));

export function formatMoney(n) {
  return '$' + Math.round(n).toLocaleString('it-IT');
}

export function formatCoords(lat, lon) {
  const la = `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'O'}`;
  return `${la} · ${lo}`;
}

/** Genera una destinazione di nascita casuale (diversa dalla città precedente). */
export function generateBirth(excludeCityId = null) {
  const pool = CITIES.filter((c) => c.id !== excludeCityId);
  const city = pick(pool);
  const family = weighted(FAMILIES, (f) => f.weight);
  const sex = Math.random() < 0.5 ? 'm' : 'f';

  const genetics = {};
  for (const key of ['resistenza', 'carisma', 'riflessi']) {
    genetics[key] = clampStat(gaussian(52, 14) + (city.mods[key] || 0) + (family.mods[key] || 0));
  }

  const [minM, maxM] = family.money;
  const baseMoney = minM + Math.random() * (maxM - minM);

  return {
    cityId: city.id,
    familyId: family.id,
    city,
    family,
    sex,
    name: pick(city.names[sex]),
    surname: pick(city.surnames),
    genetics,
    baseMoney,
    moneyRange: [minM * city.moneyMult, maxM * city.moneyMult],
    weightKg: +(2.6 + Math.random() * 1.6).toFixed(2),
    blood: weighted(BLOOD, (b) => b[1])[0],
    bpm: Math.round(122 + genetics.riflessi * 0.4 + Math.random() * 8),
    skin: pick(SKIN_TONES),
    hair: pick(HAIR_COLORS),
    seed: Math.floor(Math.random() * 1e9),
    birthYear: new Date().getFullYear() - 18,
  };
}

/** Generatore pseudo-casuale deterministico (mulberry32). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
