# Street for Paradise

Open-world 3D in browser (Three.js r160 + Cannon-es 0.20 via CDN, nessun bundler). Compatibile con GitHub Pages.

## Avvio locale

```
python -m http.server 8080
```

Poi apri `http://localhost:8080`. I moduli ES6 non funzionano aprendo `index.html` con doppio clic.

## Comandi

| Tasto | Azione |
| --- | --- |
| WASD / frecce | Muoviti |
| Shift | Corri |
| Spazio | Salta |
| Mouse / rotella | Camera / zoom |
| E | Entra / esci dagli edifici |
| C | Scheda personaggio |
| V (tenuto premuto) | Salta la panoramica 0-18 anni |
| Esc | Pausa |

## Struttura `/src`

- `main.js` — renderer, macchina a stati menu → intro → gioco, game loop
- `menu.js` — menu principale (GIOCA → NEW GAME / CONTINUA GAME)
- `intro.js` — zoom universo → Terra, scelta casuale della nascita, skip [V]
- `space.js` — scena spaziale (stelle, Terra, atmosfera, marker)
- `placenta.js` — placenta 3D con tratti genetici
- `lifestory.js` — ospedale e panoramica 0-18 anni
- `birthdata.js` — città, famiglie, generatore di nascita
- `world.js` — città procedurale, porte accessibili, ciclo giorno/notte
- `interiors.js` — interni 3D (casa, ospedale, minimarket, officina, banca, locale)
- `player.js` — giocatore fisico + camera in terza persona
- `game.js` — gameplay, Pointer Lock, pausa, porte [E], autosalvataggio
- `hud.js`, `input.js`, `save.js`, `ui.js`, `tween.js`, `characters.js`

Il salvataggio è in `localStorage` (chiave `sfp_save_v1`): automatico ogni 30 s, in pausa e alla chiusura della pagina.
