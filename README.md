# Tesserati

App desktop (Mac Apple Silicon e Windows) per gestire i tesserati di un'associazione culturale:
elenco, scheda di dettaglio, ricevute (4 per foglio A4), calendario delle scadenze.
I dati restano solo sul computer.

## Uso
0. **Dashboard** (la prima pagina all'apertura): tessere valide, scadute, in scadenza e sospese, corsisti, nuovi tesserati, ricevute da stampare;
   l'elenco *Da fare* con un clic per aprire la schermata giusta; grafici delle iscrizioni e delle scadenze, età, città, corsisti e incassi dell'anno
   (somma degli importi scritti sulle ricevute). Valida = stato Attivo e non scaduta; le sospese sono contate a parte.
1. **Impostazioni**: inserisci nome, indirizzo, C.F., logo dell'associazione e il prossimo numero di ricevuta.
2. **Rileggi file**: l'app cerca in **Download** il file `Younity…csv` più recente (cartella o file modificabili in Impostazioni).
   Il primo caricamento segna le tessere come *già stampate*; dalle letture successive risultano **Da stampare** solo i tesserati nuovi (o i rinnovi).
3. **Da stampare / Tesserati**: seleziona le righe → *Stampa ricevute* (anteprima, data, numero iniziale, quota) → stampa o PDF.
   Dopo la stampa il flag "stampata" e il progressivo vengono salvati.
4. **Avvisi di rinnovo** (menu *Avvisi*): l'app elenca le tessere che scadono entro 30 giorni (modificabile) e non hanno ancora ricevuto l'avviso,
   una email per indirizzo (le famiglie con la stessa email ricevono un solo messaggio). Anteprima, selezione, *Invia selezionati* con conferma.
   Mittente Gmail o Outlook con **password per app** (guida in Impostazioni → *Email di avviso*), salvata cifrata dal sistema e **non** inclusa nei backup.
   Si può escludere un singolo tesserato dalla scheda; chi non ha un'email valida viene segnalato.
5. **Inserire, modificare, eliminare** un tesserato (scheda → *Modifica dati* / *Elimina tesserato*, pulsante *Nuovo tesserato* nell'elenco):
   gli inseriti a mano hanno ID `M001`, `M002`… e la tessera risulta *da stampare*. I dati del CSV modificati a mano **restano tali** anche dopo *Rileggi file*
   (si può tornare ai dati di Younity dalla scheda). L'eliminazione sposta il tesserato nel **Cestino** (Impostazioni): la lettura del CSV non lo fa tornare finché è lì.
6. **Data e numero della ricevuta**: ogni ricevuta ha la sua data e il suo numero. I numeri si ricalcolano **subito** in ordine di data (la più vecchia prende il numero più basso)
   partendo da *Primo numero*; si possono scrivere a mano (il numero scritto resta fermo e gli altri lo saltano) e *Ricalcola tutto* riporta l'automatico.
   Se un numero è già assegnato, se l'ordine non è cronologico rispetto alle ricevute già emesse o se la data è precedente al pagamento, la riga lo segnala e la stampa chiede conferma.
   Una ristampa della tessera tiene numero e data originali.
7. **Tipo di ricevuta**: *Tessera associativa* (la quota annuale dell'associazione: il numero è legato alla tessera e una ristampa lo mantiene) oppure *Corso*
   (per i corsisti: *rata mensile*, con il mese, oppure *iscrizione al corso* di novembre; ogni stampa ha un numero nuovo e la tessera non cambia).
8. **Corsisti** (casella *Corsista* nella scheda): compaiono nel **Calendario corsisti**, con la stagione da novembre a maggio.
   La rata mensile scade il **1° di ogni mese**; a novembre c'è anche l'**iscrizione al corso** (importo predefinito in Impostazioni).
   Si segna *pagato* a mano (vista Mese o Stagione) oppure in automatico stampando la ricevuta *Corso* (rata del mese o iscrizione).
   Colori: verde pagato, rosso scaduto non pagato, arancione/giallo in arrivo, grigio più avanti, tratteggiato non dovuto.
9. **Calendario tesserati**: vista mese/anno; rosso = scaduta, arancione ≤ 30 gg, giallo ≤ 90 gg, verde oltre
   (soglie modificabili). L'occhio barrato rimuove una tessera dal calendario (resta nell'archivio).

## Sviluppo
```
npm install
npm start            # avvia l'app
npm test             # test della logica (usa ../Younity.csv se presente)
npm run dist:mac     # dmg + zip per Mac Apple Silicon -> dist/
npm run dist:win     # installer + zip per Windows x64 -> dist/
```
I dati sono salvati in `tesserati-data.json`, in una cartella modificabile da Impostazioni (con copia automatica `.bak`).
Il **backup** è un file firmato con SHA-256: al ripristino l'app verifica firma e coerenza dei dati prima di sostituire
qualcosa e salva una copia dei dati attuali (`…prima-del-ripristino.json`).

## Build automatica (GitHub Actions)
`.github/workflows/build.yml`:
- a ogni push e pull request esegue i test;
- sui push su `main` costruisce l'app per **Mac Apple Silicon** e **Windows x64** (file scaricabili da *Actions → run → Artifacts*);
- creando un tag di versione (`git tag v1.0.1 && git push --tags`, con la stessa versione di `package.json`)
  pubblica anche una *Release* con dmg, exe e zip.

Le app non sono firmate: su Mac clic destro → Apri, su Windows "Ulteriori informazioni → Esegui comunque".
L'icona è `build/icon.png` (ricavata da `logo.png`).

© Fioravante Capaccio
