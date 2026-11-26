# Street for Paradise - Regole di Sviluppo

## Panoramica del Progetto
Gioco open-world 3D in terza persona ispirato a GTA IV, sviluppato interamente per browser senza software esterni.

## Stack Tecnologico
- HTML5 / CSS3 / JavaScript (ES6 Modules)
- **Three.js** (importato via CDN) per il rendering 3D
- **Cannon-es** (importato via CDN) per la fisica realistica di personaggio, auto e collisioni
- Nessun bundler (niente Webpack/Vite/npm): tutto deve funzionare direttamente su GitHub Pages aprendo `index.html`.

## Architettura dei File
- `index.html`: canvas, importmap per Three.js/Cannon-es, contenitori dell'interfaccia (menu, HUD, dialoghi, menu ESC/TAB).
- `style.css`: tutto lo stile dell'interfaccia (va nella cartella principale, accanto a `index.html`).
- `src/main.js`: renderer, loop `requestAnimationFrame`, macchina a stati menu → intro → gioco.
- `src/menu.js`: menu principale (GIOCA → NEW GAME / CONTINUA GAME, SHOP con schermata "esempi", IMPOSTAZIONI, CREDITI, lingua IT/EN/DE/RU).
- `src/intro.js`, `src/space.js`, `src/placenta.js`, `src/lifestory.js`, `src/birthdata.js`: universo → Terra → scelta della nascita → ospedale → panoramica 0-18 anni (skip con `V`).
- `src/game.js`: gameplay (interazioni `E`, veicoli `F`, menu `TAB`/`ESC`, salute/stamina, Aura, sonno, prigione, salvataggi).
- `src/world.js`: città (strade, incroci, edifici con collisioni, porte accessibili, ATM, luci, ciclo giorno/notte, riflessi PBR).
- `src/landmarks.js`: monumenti e skyline ispirati alla città di nascita.
- `src/interiors.js`: interni 3D (casa, ospedale con stanza di ricovero, minimarket, concessionario, banca, locale, ristorante, pizzeria, farmacia, armeria, boutique, chiesa con banchi/fedeli/candele, polizia, barbiere).
- `src/hospital.js`: ricovero (`HospitalCare.admit`: barella con paramedici, medico, letto, ringraziamento), conto all'accettazione (`state.hospitalBill`, uscita bloccata finché non paghi), "Non posso pagare" → multa € 900 in debito, −10 Aura, una notte in prigione.
- `src/player.js`: personaggio, movimento WASD, corsa (Shift), salto (Spazio), camera terza persona.
- `src/characters.js`: modelli umani con articolazioni e animatore (camminata, corsa, salto, seduto, sdraiato, telefono, in sella).
- `src/vehicle.js`: veicoli guidabili (bici, motorini, moto, auto), tasto `F` per salire/scendere, furto con cacciavite speciale.
- `src/npcs.js`: pedoni, senzatetto, base per camerieri e poliziotti.
- `src/restaurant.js`: servizio al tavolo (menù, piatto dopo 10 s, scontrino, polizia se non paghi).
- `src/dialogs.js`: negozi, concessionario, banca, ATM con PIN, menù, scontrino, donazioni, guardaroba.
- `src/menus.js`: menu ESC (Mappa · Impostazioni · Statistiche/Aura) e TAB (Inventario · Portafoglio · Telefono).
- `src/hud.js`: HUD (minimappa radar in basso a sinistra, salute/stamina in basso a destra, tachimetro, prompt).
- `src/audio.js`: motore audio procedurale (Web Audio API, nessun file esterno): musica, UI, passi, salto, motori per tipo di veicolo, uccelli, folla, voci, spari, motosega, antifurto, sirene, telefono, cibo/bevande. Volumi collegati alle Impostazioni.
- `src/paradise.js`: scena del Paradiso (Gesù e i ricordi d'infanzia con mamma e papà), raggiungibile dalla chiesa con Aura ≥ 90%.
- `src/calendar.js`: calendario liturgico (Pasqua, feste fisse e mobili, domeniche in rosso), data di gioco, griglia mensile.
- `src/aura.js`: Livelli Aura 1-100, titoli e ricompense dell'app "Livelli" del telefono (livello 100 = Paradiso completo).
- `src/food.js`: piatti 3D realistici (pizze, pasta, carne, pesce, dolci, bevande) serviti al tavolo.
- `src/conversation.js`: conversazioni con i passanti in stile GTA V (risposte [1]-[4], indicazioni, feste, aiuto, scortesia).
- `src/police.js`: ricercato 1-3 stelle, volanti che partono dalla stazione di polizia, seguono le strade, cono visivo + linea di vista, arresto.
- `src/workshop.js`: officina meccanica (quiz di assunzione, turno con tuta, clienti con guasti, collega, minigiochi cavi/bulloni/calibrazione, computer).
- `src/drunk.js`: effetto visivo dell'ubriachezza (render target + shader ondulato/sdoppiato/colorato).
- `src/settings.js`: impostazioni condivise (volume generale/musica/SFX, FOV, mouse, grafica) + modulo HTML riusato da menu principale e pausa.
- `src/models.js`: modelli glTF/GLB opzionali elencati in `assets/models/manifest.json` (GLTFLoader + DRACO/KTX2/Meshopt r160 da `three/addons/`); sostituiscono la carrozzeria dei veicoli, con ritorno al modello procedurale se il file manca.
- `src/traffic.js`: traffico NPC (auto, scooter, Vespe, moto con pilota) su corsie di destra con curve di Bézier agli incroci; semafori (`world.trafficPhase`), STOP, precedenze, distanza di sicurezza, fari/stop, clacson; corpi Cannon-es cinematici; si riposizionano attorno al giocatore.
- `src/garage.js`: garage fisico di casa (4 box): consegne del concessionario, entrata/uscita guidando dalla serranda, veicoli custoditi fuori dalla fisica finché non entri.
- `src/taxi.js`: `TaxiService`: taxi giallo chiamato dal telefono, percorso sulle strade (corsia di destra), stati idle → arriving → waiting → boarded → riding → leaving, vista posteriore in prima persona (`eyeWorld`), tariffa `TAXI_FARE` (€ 10-200), E salta il viaggio, F scende.
- `src/saints.js`: 99 santi (`SAINTS`, uno per Livello Aura) con `saintForLevel`, immagine da Wikipedia (`fetchSaintImage`, REST summary con cache e timeout) e ripiego SVG (`saintFallbackImage`).
- `src/sacred.js`: arte sacra e arredo urbano procedurali (`makeCrucifix`, `makeMadonna`, `makeShrine` con faretti finti emissivi, `makeFountain` con acqua animata, `frescoTexture` per i soffitti).
- `src/prayers.js`: `PrayerReader.recite(['padreNostro','aveMaria'])`: testo completo a schermo (non tradotto, `data-notr`) e voce italiana con Web Speech API (maschile/femminile), ripiego a tempo senza voce.
- `src/procession.js`: processione del Venerdì Santo (dalle 18, prete con crocifisso + 2 chierichetti + 50 fedeli in file da 4, dalla Piazza del Monumento alla Cattedrale).
- `src/names.js`: nomi e cognomi degli NPC per nazione della città (`setNameCity`, `localFirstName`, `localSurname`, `localNickname`).
- `src/i18n.js` + `src/lang-en.js` + `src/lang-de.js` + `src/lang-ru.js`: lingue IT/EN/DE/RU (DE e RU cercano prima il proprio dizionario, poi l'inglese come riserva; date tradotte per lingua; CSS `html[lang]` per parole lunghe e cirillico). Il codice scrive in italiano; un MutationObserver traduce al volo tutto il DOM con il dizionario (chiavi esatte + modelli `{*}`), date comprese. Le insegne 3D usano `tr()` quando vengono create.
- `src/items.js`, `src/playerstate.js`, `src/save.js`, `src/input.js`, `src/ui.js`, `src/tween.js`: dati, stato, salvataggio, input e utilità.

## Convenzioni di gioco
- Valuta: sempre **Euro (€)** tramite `formatMoney()` in `src/birthdata.js`.
- Il protagonista inizia a 18 anni da **orfano**; i genitori compaiono nei ricordi del Paradiso.
- `ESC` apre la mappa senza pausa (pulsante PAUSA in alto); `TAB` apre solo l'inventario: il **telefono è un oggetto** (`telefono`, non si consuma né si regala) e si apre/ripone cliccandolo; rotellina avanti fino in fondo = prima persona.
- Finestre: `openUi(kind)`/`closeUi(kind)`; `'tab'` e `'phone'` sono **non bloccanti** (`NON_BLOCKING_UI` in `game.js`): con inventario o telefono aperti si cammina, si guida e (col telefono) si interagisce. La tastiera funziona anche senza Pointer Lock (serve solo alla visuale col mouse): dopo un acquisto il controllo torna subito. Aprendo il telefono l'inventario si chiude e il telefono resta in basso a sinistra.
- I menu (`TabMenu`, `EscMenu`, `Dialogs`) hanno `dispose()` che rimuove i listener: una nuova partita non deve mai ereditare i click della precedente.
- Marciapiedi: `SIDEWALK_H` (12 cm) esportato da `world.js` e usato anche da NPC e gioco.
- Traffico: conducente/pilota figlio della mesh del veicolo (sempre visibile, anche nelle auto); i mezzi si riposizionano solo fuori dall'inquadratura (`inView`).
- Veicoli: `cc` e `spec` per modello in `VEHICLE_MODELS`; stili moto `sport` e `hyper` (Ninja H2R, `buildSportBike`); dettagli piccoli uniti per materiale con `DetailBatch` (poche draw call). Tuning motore a 3 stage (`ENGINE_STAGES`, costo `engine1..3`).
- Caschi (`HELMETS` in `items.js`, `makeHelmet` in `characters.js`): oggetti dell'inventario, `state.helmet`, indossati solo in sella (`player.showHelmet`), dimezzano i danni da caduta. Negozio `helmets` (porta aggiunta con `world.buildShopFront`).
- Casa ↔ garage: porta interna (`I.innerDoor`, azioni `togarage`/`tohouse`, `game.passInnerDoor`), solo nella casa principale (`door.type === 'home'`).
- Chiese: `buildChurch` registra `churchSpots`; portali, contrafforti, vetrate, aiuole e alberi li aggiunge `world.buildSacredSites()` dopo la città, con un generatore separato (`seed ^ 0x5acced`): la città non cambia. Interni: grande crocifisso sopra l'altare, croce sulla mensa, Madonna nell'angolo a destra dell'altare, affreschi sul soffitto.
- Città: 2 fontane (`world.fountains`: piazza + parco alberato) e 2 edicole (`world.shrines`: Madonna illuminata e crocifisso in luoghi diversi: collina, parco, piazza, viale). [E] davanti all'edicola = preghiera di 5 s, +1 Aura (esatta) ogni volta.
- Preghiere: domenica in chiesa/cattedrale (`daily.sundayPrayer`) e fine processione in cattedrale (`daily.processionPrayer`) → Padre Nostro + Ave Maria recitati, +10 Aura solo arrivando all'Amen.
- Valori di reati e preghiere in `PENALTIES` (`items.js`): furti −10 Aura (veicoli di ogni tipo, furto in auto, consumazioni non pagate), rosso € 500 e −3 Aura (`game.checkRedLight` all'ingresso degli incroci con semaforo, giallo tollerato).
- Officina: 4 postazioni; minigioco bulloni "tieni premuto e rilascia nel verde" (tempo reale, 4 errori, nessun timer).
- Con un menu aperto o in pausa il veicolo guidato va **in folle** (nessun freno né retromarcia automatici).
- Lingua: ogni nuovo testo va scritto in italiano **e** aggiunto a `src/lang-en.js` (con `{*}` per le parti variabili).
- Felicità 0-100 (`state.happiness`, `changeHappiness`): barra sopra la minimappa; sale con cibo, pasti, sonno, opere buone, acquisti, tuning; scende con incidenti, ferite, arresti, svenimenti; tende al 50% nel tempo.
- Cambio: impostazione `gearbox` (`auto`/`manual`, in manuale `E` su e `Q` giù), marce in `GEARS` (`vehicle.js`); tachimetro `speedUnit` (`kmh`/`mph`).
- Garage: i veicoli comprati vanno nel garage di casa (`garage.store`), con `inGarage`/`bay`/`tune` salvati; tuning in `dialogs.tuning()` (vernice, cerchi, vetri, assetto, neon, motore stage 1-2, freni). Prezzi di servizi e tuning in `items.js` (`SERVICE_PRICES`, `TUNING`).
- Moto/motorini: impennata con equilibrio (`wheelie`/`wheelieVel`, caduta oltre il limite → `bikeCrash`), stoppie con CTRL + freno (`stoppie`), piega fino a 0,88 rad; bici con pedalata (`pedalPhase`, guarnitura `crank`). Vespe in `VEHICLE_MODELS` (`style: 'vespa'`, la Special ha `gears: 4`, `spec` per modello).
- Fari: `Vehicle.setLights(0|1|2, stop)` cambia solo l'emissione (nessuna luce aggiunta); `T` abbaglianti (SpotLight più lunga, pedoni abbagliati, auto che lampeggiano), `H` clacson per tipo di mezzo, `R` radio (4 stazioni procedurali in `audio.js`), prima persona in auto con abitacolo (`cockpit`).
- Fisica: i collider statici piccoli/medi sono raggruppati in corpi composti per zona (`addStaticBox` in `world.js`); non creare migliaia di corpi singoli.
- Polizia: vista 155 m / 85°, ricerca 30 s, una volante in più delle stelle, più veloci; `police.report` fa scappare i passanti (`npcs.panic`).
- Case in vendita: interno diverso per casa (classico, loft, rustico, famiglia, design) scelto dall'id della casa.
- Monumenti: al centro della **Piazza del Monumento** (`PLAZA` in `world.js`, terreno spianato), collisioni dalle parti `solid` di `landmarks.js`; vulcani/colline/mare restano sfondo oltre il confine. Semafori agli incroci del centro (`updateTraffic`), STOP/precedenza/limite 50 nei quartieri.
- I veicoli non guidati diventano corpi **statici** in Cannon-es (non scivolano se urtati).
- Tempo: **1 giorno di gioco = 1 ora reale** (`GAME_MINUTES_PER_SECOND = 0.4` in `game.js`); il giorno 1 è il 18° compleanno.
- Aura: barra 1-100% in alto a sinistra; al 100% si sale di Livello (max 100) e la barra riparte dal 20%. 7 giorni senza chiesa = −5 Aura (poi −2/giorno); Messa nei giorni rossi = +5 extra.
- Aura più difficile: `changeAura` scala i guadagni ×0,7 (passa `exact = true` per valori fissi: candele +1, senzatetto 0,1 Aura per €). Messa solo seduti nel banco (`pewSeat`), preghiera in ginocchio (stato animatore `pray`), candele votive (oggetto `candela`, max 5 Aura al giorno).
- Debito: i contanti possono andare in negativo; con Aura a 0 ogni nuovo giorno costa € 1.000 (`SERVICE_PRICES.zeroAuraPenalty`).
- Ubriachezza: oltre il 50% si sviene → ospedale e −10 Aura.
- Barbiere (`BARBER` in `items.js`, `dialogs.barber`): taglio, colore, barba (`character.hairStyle`/`hair`/`beard`). Porta aggiunta con `world.buildBarber()` dopo la città, senza usare l'RNG.
- Spacciatori nascosti (`world.dealerSpots`, `npcs.spawnDealers`), oggetti categoria `illegali` con `high`: effetto allucinogeno (`trip` in `drunk.js`); guidando sotto effetto dopo 3 s → teletrasporto sopra `LAKE_SPOT`, caduta, ospedale e −15 Aura.
- Veicoli: salute 0-100 salvata (`health`), deformazione e fumo progressivi, in panne a 0; SHIFT impenna su moto/motorini/bici; il pilota segue piega e impennata (`player.rideQuat`).
- Tasti: tasto destro = mira con la pistola (camera sulla spalla + puntino), sinistro = sparo; E vicino a un'auto chiusa con il cacciavite = scasso/saccheggio, F = furto; E al bancomat con la motosega equipaggiata = rapina.
- Crimini → `game.police.report(stelle, motivo)`.
- Mappa: città centrale + 4 anelli di quartieri residenziali (`RINGS`), colline, lago e montagne (heightfield Cannon-es allineato alla mesh del terreno). Non cambiare la sequenza RNG della città: romperebbe i salvataggi.

- Carro attrezzi: incidente con ricovero → `game.towToWorkshop` mette il veicolo in `state.impound` (costo `TOW_REPAIR` € 1.000-3.000 secondo il danno), ritiro dall'officina (`dialogs.repairShop`).
- Sostanze: alcol o droga = −1 Aura subito (`PENALTIES.substanceAura`); droghe in `items.js` con `power`/`wobble`/`cliff` (più costose = effetto e sbandata più forti).
- Chiesa: offerte (`dialogs.churchOffering`, +1 Aura esatta, max 5/giorno); domeniche e feste (`ctx.festive`) chiesa quasi piena e fedeli in piedi.
- Bancomat: massimo 3 per città (`MAX_ATMS`); rapina € 3.000 e −10 Aura. Spacciatori nascosti nei vicoli dietro un cassonetto.
- Polizia a piedi: con il giocatore a piedi la volante si ferma a 26 m e scendono 2 agenti (`police.deploy`), che seguono la scia del giocatore, lo ammanettano (`game.cuffedByPolice`) e lo portano in prigione.
- Lavori: paga dell'officina ×2,2 (`JOB_PAY_MULT`).

## Standard tecnici di rendering (Three.js r160 via CDN, niente bundler)
- **Versioni bloccate:** `three@0.160.0` e `cannon-es@0.20.0` nell'importmap. Non aggiornare senza richiesta esplicita (in r160 `THREE.Timer` non è nel core: si usa il delta di `performance.now()`).
- **Un solo loop:** `renderer.setAnimationLoop(frame)` in `main.js`; delta in secondi limitato a [0, 0.05] e azzerato al ritorno da una scheda nascosta. Lo stato di gioco vive in oggetti JS; le mesh sono solo la "vista".
- **Contesto WebGL:** gestire `webglcontextlost` (preventDefault, salta i fotogrammi) e `webglcontextrestored`; non tenere oggetti GL grezzi.
- **Risoluzione:** pixel ratio massimo 1,5 (Alta), 1,25 (Media), 0,85 (Bassa) tramite `pixelRatioFor()`.
- **Colore e tone mapping:** `outputColorSpace = SRGBColorSpace`, `ACESFilmicToneMapping`; esposizione regolata dal ciclo giorno/notte (`DayCycle.exposure`). Le texture di colore sono sRGB; normal/roughness map restano lineari.
- **Materiali PBR:** `MeshStandardMaterial` / `MeshPhysicalMaterial` con roughness/metalness sensati; carrozzerie con `clearcoat`, vetri lisci con `ior`; asfalto e facciate con roughness map (e normal map) procedurali da canvas. Mai `MeshBasicMaterial` per oggetti illuminati (solo cielo, insegne, effetti).
- **Environment map:** `scene.environment` generato dal cielo con `PMREMGenerator` (rigenerato solo quando la luce cambia abbastanza); ambiente dedicato negli interni.
- **Ombre:** un'unica `DirectionalLight` con `PCFSoftShadowMap`, shadow camera ortografica ±70 m centrata sul giocatore e agganciata alla griglia dei texel (niente tremolio), `bias`/`normalBias` calibrati.
- **Luci dinamiche:** numero di luci costante (mai cambiare `visible` o aggiungere/rimuovere luci a runtime: ricompila gli shader). Le luci notturne (lampioni vicini, fari) restano in scena con intensità 0 di giorno.
- **Cloni e risorse:** ogni modello animato ha il proprio `HumanAnimator`; geometrie condivise solo se immutabili; liberare geometrie, materiali e texture con `disposeObject3D` quando si smonta una scena.
- **Modelli glTF:** un solo `GLTFLoader` condiviso, decoder dalla stessa release (`three@0.160.0/examples/jsm/libs/...`), addon importati in modo dinamico (se il CDN fallisce si resta sul procedurale). Copie con `SkeletonUtils.clone` e un `AnimationMixer` per copia aggiornato in secondi; risorse del file marcate `userData.sharedAsset` (mai liberate dalle copie). Il modello si scala sulla lunghezza del corpo fisico, base a y = 0, centrato in X/Z; le ruote del file vanno sotto perni centrati. `assets/models/manifest.json` deve sempre esistere (anche vuoto) per non avere 404 in console.
- **Verifica runtime:** aprire con `#debug` (espone `window.sfp` e `window.renderer`), controllare console senza errori, `renderer.info.render.calls > 0` e screenshot di giorno e di notte.

## Regole Ferree per Claude
1. **ZERO errori di import:** Usa sempre `<script type="importmap">` in `index.html` con URL CDN funzionanti e testati (es. `unpkg` o `jsdelivr`).
2. **Modularità:** Non mettere mai tutto il codice in un solo file; rispetta rigorosamente la divisione in `/src`.
3. **Fisica sincronizzata:** Ogni oggetto 3D visibile (mesh) deve corrispondere esattamente al suo corpo fisico (body) in Cannon-es.
4. **Incrementalità:** Costruisci una meccanica alla volta e assicurati che il codice sia completo, senza `// TODO` o parti tagliate.
5. **Consegna:** alla fine di ogni aggiornamento manda sempre lo zip completo del progetto (`street-for-paradise.zip`: file della cartella principale + `src/` + `assets/`), pronto da estrarre e caricare su GitHub.
