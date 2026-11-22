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
| WASD / frecce | Muoviti (alla guida: accelera, frena, sterza) |
| Shift | Corri (consuma stamina) |
| Spazio | Salta (alla guida: freno a mano) |
| Mouse / rotella | Camera / zoom |
| E | Interagisci: porte, negozi, sportelli, ATM, tavoli, letto, persone |
| F | Sali/scendi dal veicolo, forza la serratura (serve il cacciavite speciale) |
| TAB | Inventario · Portafoglio · Telefono |
| ESC | Mappa · Impostazioni · Statistiche (Aura) |
| C | Scheda personaggio |
| V (tenuto premuto) | Salta la panoramica 0-18 anni |

## Cosa c'è in città

Casa, Ospedale, Minimarket, Concessionario, Armeria, Boutique, 2 Farmacie, Banca con ATM, Trattoria, Pizzeria,
Chiesa, Stazione di Polizia, Locale, bancomat sui marciapiedi, pedoni, senzatetto e veicoli parcheggiati.

## Struttura

Vedi `CLAUDE.md` per l'elenco completo dei moduli in `/src`.

Il salvataggio è in `localStorage` (chiave `sfp_save_v1`): automatico ogni 30 s, in pausa e alla chiusura della pagina.
Le impostazioni grafiche sono in `sfp_settings_v1`.
