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

## Modelli 3D personalizzati (opzionale)

Tutto il gioco funziona senza file esterni. Per usare un modello `.glb` al posto di un veicolo generato:

1. Metti il file in `assets/models/` (es. `assets/models/berlina.glb`). Formati compressi DRACO, Meshopt e KTX2 sono supportati.
2. Aggiungilo in `assets/models/manifest.json`:

```json
{
  "vehicles": {
    "berlina": { "file": "berlina.glb", "rotateY": 0, "paint": ["Paint"], "wheels": "model" }
  }
}
```

- **chiave**: nome del modello (`bici`, `mtb`, `motorino`, `scooter125`, `moto_naked`, `moto_sport`, `utilitaria`, `berlina`, `suv`, `sportiva`, `polizia`) oppure il tipo (`car`, `car_small`, `suv`, `sport`, `moto`, `scooter`, `bike`) per tutti i modelli di quel tipo.
- **rotateY**: gradi per girare il modello finché il muso guarda in avanti (prova 0, 90, 180 o 270).
- **paint**: nomi dei materiali della carrozzeria; prendono il colore scelto nel concessionario.
- **wheels**: `"model"` usa le ruote del file (nodi con *Wheel* o *Ruota* nel nome), `"procedural"` tiene quelle del gioco.

Il modello viene scalato da solo alla lunghezza del veicolo (anche se esportato in centimetri) e appoggiato a terra.
Se un file manca o è rotto, in console compare un avviso e resta il veicolo generato. Il file `manifest.json` deve esistere sempre, anche vuoto.
Usa solo modelli con licenza libera (es. CC0).
