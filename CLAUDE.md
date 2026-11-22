# Street for Paradise - Regole di Sviluppo

## Panoramica del Progetto
Gioco open-world 3D in terza persona ispirato a GTA IV, sviluppato interamente per browser senza software esterni.

## Stack Tecnologico
- HTML5 / CSS3 / JavaScript (ES6 Modules)
- **Three.js** (importato via CDN) per il rendering 3D
- **Cannon-es** (importato via CDN) per la fisica realistica di personaggio, auto e collisioni
- Nessun bundler (niente Webpack/Vite/npm): tutto deve funzionare direttamente su GitHub Pages aprendo `index.html`.

## Architettura dei File
- `index.html`: Contiene solo il canvas, gli importmap per Three.js/Cannon-es e l'HUD base.
- `src/main.js`: Inizializza scena, renderer, loop `requestAnimationFrame` e collega i moduli.
- `src/world.js`: Costruisce la città (strade, incroci, edifici con collisioni, luci).
- `src/player.js`: Gestisce il personaggio 3D, movimento WASD, corsa (Shift), salto (Spazio) e telecamera terza persona orientabile col mouse.
- `src/vehicle.js`: Gestisce le auto guidaibili, fisica sospensioni/sterzo e tasto `F` per entrare/uscire.
- `src/ui.js`: Gestisce HUD (minimappa radar in basso a sinistra, contachilometri, salute).

## Regole Ferree per Claude
1. **ZERO errori di import:** Usa sempre `<script type="importmap">` in `index.html` con URL CDN funzionanti e testati (es. `unpkg` o `jsdelivr`).
2. **Modularità:** Non mettere mai tutto il codice in un solo file; rispetta rigorosamente la divisione in `/src`.
3. **Fisica sincronizzata:** Ogni oggetto 3D visibile (mesh) deve corrispondere esattamente al suo corpo fisico (body) in Cannon-es.
4. **Incrementalità:** Costruisci una meccanica alla volta e assicurati che il codice sia completo, senza `// TODO` o parti tagliate.
