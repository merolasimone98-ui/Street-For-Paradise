


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
| TAB | Inventario · Portafoglio (il telefono si apre cliccando l'oggetto 📱 Telefono) |
| E / Q (cambio manuale) | Marcia su / marcia giù |
| Shift (moto/motorino) | Impennata: dosala, se esageri ti ribalti |
| Ctrl sinistro + S | Stoppie (ruota posteriore sollevata) |
| H | Clacson (tocco breve o tenuto premuto) |
| T | Abbaglianti |
| R (in auto) | Radio: cambia stazione / spegni |
| Rotella avanti (in auto) | Prima persona con abitacolo |
| ESC | Mappa · Impostazioni · Statistiche (Aura) |
| C | Scheda personaggio |
| V (tenuto premuto) | Salta la panoramica 0-18 anni |

## Novità

- **Taxi giallo**: chiamalo dal telefono (app Taxi), sali con F, scegli la destinazione e viaggia sul sedile posteriore in prima persona; E salta il viaggio, F scende. Corsa da € 10 a € 200 in base alla distanza.
- **Carro attrezzi**: dopo un incidente con ricovero il tuo veicolo va all'officina; lo ritiri riparato per € 1.000-3.000.
- **Chiesa**: cassetta delle offerte (+1 Aura, max 5 al giorno) e chiesa piena la domenica e nei giorni di festa.
- **Polizia** più tenace: con il giocatore a piedi gli agenti scendono, ti inseguono, ti ammanettano e ti portano in prigione.
- **99 Santi**: ogni Livello Aura ha il suo santo con immagine (da Wikipedia, con ripiego grafico) nell'app Livelli.
- **Lingua** italiano / inglese dal pulsante con la bandiera in alto a destra nel menu (anche nelle Impostazioni): tutto il gioco si traduce subito.
- **Crediti** nel menu principale, sotto Impostazioni.
- **Impostazioni di guida**: cambio automatico o manuale, tachimetro in km/h o mph.
- **Felicità**: barra sopra la minimappa.
- **Garage di casa** (G sulla mappa, accanto alla porta di casa): i veicoli comprati arrivano qui; entra a piedi (E) o guidando piano verso la serranda, fai tuning (vernice, cerchi, vetri, assetto, neon, motore, freni) ed esci guidando oltre la serranda.
- **Piazza del Monumento** a nord della città con il monumento tipico della tua città (solido, raggiungibile in auto o in taxi), semafori in centro e cartelli nei quartieri.
- **Ospedale**: barella fino al letto, visita del medico e conto da pagare all'accettazione prima di uscire. Senza soldi: polizia, una notte in prigione, −10 Aura e multa di € 900 (i contanti possono andare in debito). Con Aura a zero paghi € 1.000 al giorno.
- **Chiesa**: fedeli nei banchi, Messa solo seduto (E sul banco), preghiera in ginocchio davanti all'altare, candele votive accese nella zona candele (+1 Aura). Donazioni ai senzatetto: 0,1 Aura per ogni euro.
- **Barbiere** (✂ sulla mappa): taglio, colore e barba.
- **Spacciatori** nascosti nei vicoli dei quartieri poveri: le sostanze danno forti allucinazioni. Non metterti alla guida…
- **Inventario e telefono senza fermarti**: con TAB aperto continui a camminare; cliccando il telefono l'inventario si chiude e il telefono resta in basso a sinistra mentre cammini o guidi.
- **Nuovi mezzi**: Vespa Primavera 125cc, Vespa Special 125cc a marce e Kawasaki Ninja H2R (oltre 340 km/h). Prestazioni in base alla cilindrata; tuning motore stage 1, 2 e 3 nel garage di casa.
- **Negozio di caschi** (K sulla mappa): integrale, adventure, motocross, modulare e jet. Dall'inventario scegli "Usa in moto": lo indossi in sella e dimezza i danni nelle cadute.
- **Porta interna casa ↔ garage**, case più arredate e più economiche.
- **Officina** con 4 postazioni e minigioco dei bulloni semplificato (tieni premuto, lascia nel verde).
- **Traffico** con conducenti sempre visibili, più pedoni, nomi degli abitanti tipici della nazione.
- **Chiese e cattedrali** più belle: portale con colonne, vetrate, alberi e aiuole fuori; dentro affreschi sul soffitto, crocifisso al centro dell'altare e statua della Madonna a destra.
- **Madonna e crocifisso in città** (M e ✝ sulla mappa): prega davanti con E, +1 Aura ogni volta.
- **Domenica**: in chiesa o cattedrale recita Padre Nostro e Ave Maria (testo a schermo e voce), +10 Aura.
- **Venerdì Santo**: alle 18 processione con il prete, il crocifisso e 50 fedeli dalla Piazza del Monumento alla Cattedrale; alla fine preghi con loro, +10 Aura.
- **Fontane** in piazza e nel parco (≈ sulla mappa).
- **Semaforo rosso**: multa di € 500 e −3 Aura. **Furti**: −10 Aura.
- **Menu**: tasto SHOP (schermata di esempio) e lingue Italiano, English, Deutsch, Русский.

## Cosa c'è in città

Casa con garage, Ospedale, Minimarket, Concessionario, Armeria, Boutique, 2 Farmacie, Banca con ATM, Trattoria, Pizzeria,
Chiesa, Stazione di Polizia, Locale, Officina, case in vendita (interni diversi), Piazza del Monumento, bancomat sui marciapiedi,
pedoni, senzatetto e veicoli parcheggiati.

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
