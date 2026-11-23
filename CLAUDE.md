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
- `src/menu.js`: menu principale (GIOCA → NEW GAME / CONTINUA GAME).
- `src/intro.js`, `src/space.js`, `src/placenta.js`, `src/lifestory.js`, `src/birthdata.js`: universo → Terra → scelta della nascita → ospedale → panoramica 0-18 anni (skip con `V`).
- `src/game.js`: gameplay (interazioni `E`, veicoli `F`, menu `TAB`/`ESC`, salute/stamina, Aura, sonno, prigione, salvataggi).
- `src/world.js`: città (strade, incroci, edifici con collisioni, porte accessibili, ATM, luci, ciclo giorno/notte, riflessi PBR).
- `src/landmarks.js`: monumenti e skyline ispirati alla città di nascita.
- `src/interiors.js`: interni 3D (casa, ospedale, minimarket, concessionario, banca, locale, ristorante, pizzeria, farmacia, armeria, boutique, chiesa, polizia).
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
- `src/items.js`, `src/playerstate.js`, `src/save.js`, `src/input.js`, `src/ui.js`, `src/tween.js`: dati, stato, salvataggio, input e utilità.

## Convenzioni di gioco
- Valuta: sempre **Euro (€)** tramite `formatMoney()` in `src/birthdata.js`.
- Il protagonista inizia a 18 anni da **orfano**; i genitori compaiono nei ricordi del Paradiso.
- `ESC` apre la mappa senza pausa (pulsante PAUSA in alto); `TAB` apre inventario + telefono; rotellina avanti fino in fondo = prima persona.
- I veicoli non guidati diventano corpi **statici** in Cannon-es (non scivolano se urtati).
- Tempo: **1 giorno di gioco = 1 ora reale** (`GAME_MINUTES_PER_SECOND = 0.4` in `game.js`); il giorno 1 è il 18° compleanno.
- Aura: barra 1-100% in alto a sinistra; al 100% si sale di Livello (max 100) e la barra riparte dal 20%. 7 giorni senza chiesa = −5 Aura (poi −2/giorno); Messa nei giorni rossi = +5 extra.
- Ubriachezza: oltre il 50% si sviene → ospedale e −10 Aura.
- Veicoli: salute 0-100 salvata (`health`), deformazione e fumo progressivi, in panne a 0; SHIFT impenna su moto/motorini/bici; il pilota segue piega e impennata (`player.rideQuat`).
- Tasti: tasto destro = mira con la pistola (camera sulla spalla + puntino), sinistro = sparo; E vicino a un'auto chiusa con il cacciavite = scasso/saccheggio, F = furto; E al bancomat con la motosega equipaggiata = rapina.
- Crimini → `game.police.report(stelle, motivo)`.
- Mappa: città centrale + 4 anelli di quartieri residenziali (`RINGS`), colline, lago e montagne (heightfield Cannon-es allineato alla mesh del terreno). Non cambiare la sequenza RNG della città: romperebbe i salvataggi.

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
