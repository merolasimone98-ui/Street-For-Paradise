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

## Regole Ferree per Claude
1. **ZERO errori di import:** Usa sempre `<script type="importmap">` in `index.html` con URL CDN funzionanti e testati (es. `unpkg` o `jsdelivr`).
2. **Modularità:** Non mettere mai tutto il codice in un solo file; rispetta rigorosamente la divisione in `/src`.
3. **Fisica sincronizzata:** Ogni oggetto 3D visibile (mesh) deve corrispondere esattamente al suo corpo fisico (body) in Cannon-es.
4. **Incrementalità:** Costruisci una meccanica alla volta e assicurati che il codice sia completo, senza `// TODO` o parti tagliate.
