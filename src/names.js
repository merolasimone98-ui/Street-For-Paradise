// Nomi e cognomi degli NPC coerenti con la nazione della città in cui si gioca
// (niente cognomi italiani a caso a Tokyo). La partita imposta la città con setNameCity().
import { getCity } from './birthdata.js';

/* Pool per codice nazione: nomi maschili, femminili e cognomi. */
const POOLS = {
  IT: {
    m: ['Marco', 'Luca', 'Giuseppe', 'Antonio', 'Francesco', 'Alessandro', 'Matteo', 'Davide', 'Stefano', 'Paolo', 'Giovanni', 'Andrea'],
    f: ['Giulia', 'Sara', 'Francesca', 'Chiara', 'Martina', 'Elena', 'Valentina', 'Anna', 'Laura', 'Federica', 'Silvia', 'Paola'],
    s: ['Rossi', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'Costa', 'Mancini'],
    nick: ['Il Biondo', 'Tony', 'Er Secco'],
  },
  US: {
    m: ['James', 'Michael', 'Chris', 'Kevin', 'Brandon', 'Jason', 'Ryan', 'Andre', 'Ethan', 'Noah', 'Logan', 'Diego'],
    f: ['Emily', 'Jessica', 'Megan', 'Lauren', 'Hannah', 'Olivia', 'Madison', 'Tiffany', 'Chloe', 'Grace', 'Jasmine', 'Valeria'],
    s: ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Garcia', 'Martinez', 'Anderson', 'Thomas'],
    nick: ['Slim', 'Ace', 'T-Bone'],
  },
  GB: {
    m: ['Oliver', 'Harry', 'George', 'Jack', 'Charlie', 'Thomas', 'William', 'Alfie', 'Callum', 'Rhys', 'Liam', 'Arjun'],
    f: ['Amelia', 'Olivia', 'Isla', 'Emily', 'Poppy', 'Ava', 'Jessica', 'Sophie', 'Ellie', 'Charlotte', 'Freya', 'Priya'],
    s: ['Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Evans', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Hughes'],
    nick: ['Gaz', 'Spider', 'Dodgy Dave'],
  },
  AU: {
    m: ['Jack', 'Liam', 'Cooper', 'Mason', 'Riley', 'Lachlan', 'Hamish', 'Brodie', 'Kai', 'Ethan', 'Jayden', 'Tom'],
    f: ['Charlotte', 'Mia', 'Matilda', 'Ruby', 'Chloe', 'Isla', 'Zoe', 'Grace', 'Sienna', 'Jess', 'Kirra', 'Ella'],
    s: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Nguyen', 'Kelly', 'Ryan', 'Walker', 'Harris', 'Lee'],
    nick: ['Bluey', 'Shazza', 'Davo'],
  },
  JP: {
    m: ['Haruto', 'Ren', 'Sota', 'Yuto', 'Kenji', 'Takumi', 'Daiki', 'Hiroshi', 'Kaito', 'Riku', 'Shota', 'Akira'],
    f: ['Yui', 'Hina', 'Sakura', 'Aoi', 'Yuki', 'Mio', 'Haruka', 'Rin', 'Ayaka', 'Nanami', 'Misaki', 'Emi'],
    s: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada'],
    nick: ['Ryu', 'Kuro', 'Taka'],
  },
  KR: {
    m: ['Min-jun', 'Seo-jun', 'Ji-ho', 'Do-yoon', 'Hyun-woo', 'Jae-won', 'Sung-min', 'Tae-yang', 'Joon-ho', 'Woo-jin', 'Dong-hyun', 'Ji-hoon'],
    f: ['Seo-yeon', 'Ji-woo', 'Ha-eun', 'Min-seo', 'Soo-ah', 'Ye-jin', 'Da-eun', 'Ji-min', 'Yoo-na', 'Eun-ji', 'Hye-jin', 'So-yeon'],
    s: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon', 'Jang', 'Lim', 'Han', 'Shin'],
    nick: ['Kang', 'Shin', 'Jin'],
  },
  BR: {
    m: ['João', 'Pedro', 'Lucas', 'Gabriel', 'Mateus', 'Rafael', 'Thiago', 'Bruno', 'Felipe', 'Diego', 'Caio', 'Vinícius'],
    f: ['Ana', 'Beatriz', 'Larissa', 'Camila', 'Juliana', 'Fernanda', 'Mariana', 'Gabriela', 'Letícia', 'Bruna', 'Isabela', 'Aline'],
    s: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Lima', 'Araújo', 'Ferreira'],
    nick: ['Magrão', 'Neguinho', 'Baixinho'],
  },
  DE: {
    m: ['Lukas', 'Jonas', 'Felix', 'Leon', 'Maximilian', 'Paul', 'Tim', 'Jan', 'Niklas', 'Florian', 'Tobias', 'Emre'],
    f: ['Anna', 'Lena', 'Laura', 'Lea', 'Sophie', 'Marie', 'Julia', 'Hannah', 'Katharina', 'Johanna', 'Nina', 'Aylin'],
    s: ['Müller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Schulz', 'Hoffmann', 'Koch', 'Richter'],
    nick: ['Blondie', 'Der Lange', 'Kalle'],
  },
  FR: {
    m: ['Lucas', 'Hugo', 'Louis', 'Gabriel', 'Arthur', 'Jules', 'Théo', 'Nathan', 'Mathis', 'Karim', 'Antoine', 'Maxime'],
    f: ['Emma', 'Léa', 'Chloé', 'Manon', 'Camille', 'Inès', 'Jade', 'Sarah', 'Louise', 'Lina', 'Clara', 'Juliette'],
    s: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent'],
    nick: ['Le Blond', 'Momo', 'La Fouine'],
  },
  RU: {
    m: ['Aleksandr', 'Dmitrij', 'Maksim', 'Ivan', 'Sergej', 'Nikolaj', 'Andrej', 'Artëm', 'Mikhail', 'Pavel', 'Oleg', 'Igor'],
    f: ['Anastasija', 'Marija', 'Darja', 'Anna', 'Elena', 'Olga', 'Natalja', 'Ekaterina', 'Polina', 'Svetlana', 'Irina', 'Tatjana'],
    s: ['Ivanov', 'Smirnov', 'Kuznecov', 'Popov', 'Vasilev', 'Petrov', 'Sokolov', 'Mikhajlov', 'Novikov', 'Fëdorov', 'Morozov', 'Volkov'],
    nick: ['Belyj', 'Lysyj', 'Kostja'],
  },
  MX: {
    m: ['José', 'Juan', 'Luis', 'Carlos', 'Miguel', 'Jorge', 'Alejandro', 'Diego', 'Fernando', 'Ricardo', 'Emiliano', 'Santiago'],
    f: ['María', 'Guadalupe', 'Fernanda', 'Daniela', 'Sofía', 'Valeria', 'Ximena', 'Andrea', 'Paola', 'Camila', 'Lucía', 'Regina'],
    s: ['Hernández', 'García', 'Martínez', 'López', 'González', 'Pérez', 'Rodríguez', 'Sánchez', 'Ramírez', 'Cruz', 'Flores', 'Gómez'],
    nick: ['El Güero', 'El Flaco', 'Chuy'],
  },
  AR: {
    m: ['Santiago', 'Mateo', 'Facundo', 'Joaquín', 'Nicolás', 'Martín', 'Agustín', 'Lautaro', 'Tomás', 'Gonzalo', 'Franco', 'Ezequiel'],
    f: ['Sofía', 'Valentina', 'Martina', 'Camila', 'Lucía', 'Florencia', 'Agustina', 'Micaela', 'Julieta', 'Milagros', 'Rocío', 'Belén'],
    s: ['González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez', 'Romero', 'Sosa', 'Álvarez', 'Benítez'],
    nick: ['El Rubio', 'El Flaco', 'Pato'],
  },
  NG: {
    m: ['Chukwuemeka', 'Oluwaseun', 'Ibrahim', 'Tunde', 'Emeka', 'Babatunde', 'Chidi', 'Musa', 'Segun', 'Obinna', 'Kunle', 'Uche'],
    f: ['Ngozi', 'Funmilayo', 'Aisha', 'Chiamaka', 'Folake', 'Adaeze', 'Zainab', 'Bisola', 'Amaka', 'Yetunde', 'Halima', 'Ifeoma'],
    s: ['Okafor', 'Adeyemi', 'Okonkwo', 'Bello', 'Eze', 'Ogunleye', 'Abubakar', 'Nwosu', 'Balogun', 'Okeke', 'Adebayo', 'Mohammed'],
    nick: ['Small Boy', 'Oga Ty', 'Skinny'],
  },
  ZA: {
    m: ['Thabo', 'Sipho', 'Lwazi', 'Bongani', 'Kagiso', 'Johan', 'Pieter', 'Mandla', 'Tshepo', 'Ruan', 'Sizwe', 'Lethabo'],
    f: ['Naledi', 'Thandiwe', 'Lerato', 'Zanele', 'Ayanda', 'Anke', 'Precious', 'Nomvula', 'Karabo', 'Lindiwe', 'Mpho', 'Elmarie'],
    s: ['Nkosi', 'Dlamini', 'Ndlovu', 'Khumalo', 'Mokoena', 'Van der Merwe', 'Botha', 'Mahlangu', 'Zulu', 'Pretorius', 'Molefe', 'Naidoo'],
    nick: ['Skhokho', 'Mshefane', 'Bra T'],
  },
  IN: {
    m: ['Aarav', 'Rahul', 'Rohan', 'Arjun', 'Vikram', 'Amit', 'Sanjay', 'Karan', 'Ravi', 'Imran', 'Siddharth', 'Nikhil'],
    f: ['Priya', 'Ananya', 'Pooja', 'Neha', 'Kavya', 'Sneha', 'Aisha', 'Riya', 'Divya', 'Meera', 'Sana', 'Lakshmi'],
    s: ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Desai', 'Shah', 'Iyer', 'Reddy', 'Khan', 'Joshi', 'Mehta'],
    nick: ['Chhotu', 'Bhai', 'Pappu'],
  },
  EG: {
    m: ['Mohamed', 'Ahmed', 'Mahmoud', 'Mostafa', 'Omar', 'Youssef', 'Karim', 'Tarek', 'Hossam', 'Amr', 'Khaled', 'Mina'],
    f: ['Fatma', 'Mariam', 'Nour', 'Salma', 'Yasmin', 'Aya', 'Hana', 'Rana', 'Dina', 'Mona', 'Heba', 'Marina'],
    s: ['Hassan', 'Ibrahim', 'Mahmoud', 'Abdel Aziz', 'El Sayed', 'Mostafa', 'Ali', 'Farouk', 'Salem', 'Gamal', 'Shawky', 'Fathy'],
    nick: ['Abu Shanab', 'El Ahmar', 'Zizo'],
  },
  TR: {
    m: ['Mehmet', 'Mustafa', 'Ahmet', 'Emre', 'Burak', 'Can', 'Murat', 'Kerem', 'Yusuf', 'Ömer', 'Hakan', 'Serkan'],
    f: ['Zeynep', 'Elif', 'Ayşe', 'Fatma', 'Merve', 'Esra', 'Defne', 'Selin', 'Büşra', 'Ece', 'Derya', 'Ebru'],
    s: ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan'],
    nick: ['Sarı', 'Uzun', 'Kara Ali'],
  },
};

let current = POOLS.IT;
let cityPool = null;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Imposta la nazione dei nomi a partire dall'id della città di gioco (usa anche i nomi tipici della città). */
export function setNameCity(cityId) {
  const city = getCity(cityId);
  current = POOLS[city.code] || POOLS.IT;
  cityPool = city.names ? { m: city.names.m || [], f: city.names.f || [], s: city.surnames || [] } : null;
}

/** Nome proprio locale (sex 'f' o 'm'). */
export function localFirstName(sex = 'm') {
  const k = sex === 'f' ? 'f' : 'm';
  const extra = cityPool ? cityPool[k] : [];
  return pick(extra.length && Math.random() < 0.35 ? extra : current[k]);
}

/** Cognome locale. */
export function localSurname() {
  const extra = cityPool ? cityPool.s : [];
  return pick(extra.length && Math.random() < 0.35 ? extra : current.s);
}

/** Nome e cognome locali. */
export function localFullName(sex = 'm') {
  return `${localFirstName(sex)} ${localSurname()}`;
}

/** Soprannome da strada (spacciatori), nella lingua del posto. */
export function localNickname(i = 0) {
  const n = current.nick || POOLS.IT.nick;
  return n[i % n.length];
}
