Street for Paradise - Regole di Sviluppo
Panoramica del Progetto
Gioco open-world 3D in terza persona ispirato a GTA IV, sviluppato interamente per browser senza software esterni.

Stack Tecnologico
HTML5 / CSS3 / JavaScript (ES6 Modules)
Three.js (importato via CDN) per il rendering 3D
Cannon-es (importato via CDN) per la fisica realistica di personaggio, auto e collisioni
Nessun bundler (niente Webpack/Vite/npm): tutto deve funzionare direttamente su GitHub Pages aprendo index.html.
Architettura dei File
index.html: canvas, importmap per Three.js/Cannon-es, contenitori dell'interfaccia (menu, HUD, dialoghi, menu ESC/TAB).
style.css: tutto lo stile dell'interfaccia (va nella cartella principale, accanto a index.html).
src/main.js: renderer, loop requestAnimationFrame, macchina a stati menu → intro → gioco.
src/menu.js: menu principale (GIOCA → NEW GAME / CONTINUA GAME).
src/intro.js, src/space.js, src/placenta.js, src/lifestory.js, src/birthdata.js: universo → Terra → scelta della nascita → ospedale → panoramica 0-18 anni (skip con V).
src/game.js: gameplay (interazioni E, veicoli F, menu TAB/ESC, salute/stamina, Aura, sonno, prigione, salvataggi).
src/world.js: città (strade, incroci, edifici con collisioni, porte accessibili, ATM, luci, ciclo giorno/notte, riflessi PBR).
src/landmarks.js: monumenti e skyline ispirati alla città di nascita.
src/interiors.js: interni 3D (casa, ospedale, minimarket, concessionario, banca, locale, ristorante, pizzeria, farmacia, armeria, boutique, chiesa, polizia).
src/player.js: personaggio, movimento WASD, corsa (Shift), salto (Spazio), camera terza persona.
src/characters.js: modelli umani con articolazioni e animatore (camminata, corsa, salto, seduto, sdraiato, telefono, in sella).
src/vehicle.js: veicoli guidabili (bici, motorini, moto, auto), tasto F per salire/scendere, furto con cacciavite speciale.
src/npcs.js: pedoni, senzatetto, base per camerieri e poliziotti.
src/restaurant.js: servizio al tavolo (menù, piatto dopo 10 s, scontrino, polizia se non paghi).
src/dialogs.js: negozi, concessionario, banca, ATM con PIN, menù, scontrino, donazioni, guardaroba.
src/menus.js: menu ESC (Mappa · Impostazioni · Statistiche/Aura) e TAB (Inventario · Portafoglio · Telefono).
src/hud.js: HUD (minimappa radar in basso a sinistra, salute/stamina in basso a destra, tachimetro, prompt).
src/items.js, src/playerstate.js, src/settings.js, src/save.js, src/input.js, src/ui.js, src/tween.js: dati, stato, impostazioni, salvataggio, input e utilità.
Regole Ferree per Claude
ZERO errori di import: Usa sempre <script type="importmap"> in index.html con URL CDN funzionanti e testati (es. unpkg o jsdelivr).
Modularità: Non mettere mai tutto il codice in un solo file; rispetta rigorosamente la divisione in /src.
Fisica sincronizzata: Ogni oggetto 3D visibile (mesh) deve corrispondere esattamente al suo corpo fisico (body) in Cannon-es.
Incrementalità: Costruisci una meccanica alla volta e assicurati che il codice sia completo, senza // TODO o parti tagliate.
