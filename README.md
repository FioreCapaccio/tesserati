# Tesserati

App desktop (Mac Apple Silicon e Windows) per gestire i tesserati di un'associazione culturale:
elenco, scheda di dettaglio, ricevute (4 per foglio A4), calendario delle scadenze.
I dati restano solo sul computer.

## Uso
1. **Impostazioni**: inserisci nome, indirizzo, C.F., logo dell'associazione e il prossimo numero di ricevuta.
2. **Rileggi file**: l'app cerca in **Download** il file `Younity…csv` più recente (cartella o file modificabili in Impostazioni).
   Il primo caricamento segna le tessere come *già stampate*; dalle letture successive risultano **Da stampare** solo i tesserati nuovi (o i rinnovi).
3. **Da stampare / Tesserati**: seleziona le righe → *Stampa ricevute* (anteprima, data, numero iniziale, quota) → stampa o PDF.
   Dopo la stampa il flag "stampata" e il progressivo vengono salvati.
4. **Calendario**: vista mese/anno; rosso = scaduta, arancione ≤ 30 gg, giallo ≤ 90 gg, verde oltre
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
