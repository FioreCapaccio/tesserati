'use strict';
// Test visivo: TESSERATI_SMOKE=1 TESSERATI_USERDATA=<dir> TESSERATI_OUT=<dir> TESSERATI_CSV=<file> npx electron .
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { readMembers } = require('../core/csv');

module.exports = ({ win, state, saveState, S, app }) => {
  const out = process.env.TESSERATI_OUT;
  fs.mkdirSync(out, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const js = (code) => win.webContents.executeJavaScript(code);
  const shot = async (name) => { await wait(350); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('shot', name); };
  const log = (...a) => console.log('[smoke]', ...a);

  win.webContents.once('did-finish-load', async () => {
    try {
      win.setSize(1440, 900);
      const st = state();
      // Primo import reale + 2 nuovi iscritti
      const { records } = readMembers(fs.readFileSync(process.env.TESSERATI_CSV));
      S.importRecords(st, records, { file: 'Younity.csv' });
      st.settings.csvPath = process.env.TESSERATI_CSV;
      st.settings.assoc = { nome: 'Associazione Culturale Teatrale “Il Sipario”', indirizzo: 'Via del Teatro 12, 65100 Pescara', cf: '91012345678', telefono: '085 1234567', email: 'info@ilsipario.it', logo: '', nota: 'Ricevuta di tesseramento per quota associativa, non soggetta a IVA.' };
      st.settings.nextReceipt = 124;
      st.settings.receiptPrefix = '2026/';
      const nuovi = records.slice(0, 5).map((r, i) => ({ ...r, id: '99000' + i, iscrizione: '2026-10-0' + (i + 1), scadenza: '2027-09-3' + (i % 2), nome: ['Giulia', 'Marco', 'Anna Maria', 'Luca', 'Chiara'][i], cognome: ['Bianchi', 'D’Angelo', 'De Luca', 'Verdi', 'Esposito'][i], cf: 'XXXXXX00X00X000' + i }));
      S.importRecords(st, nuovi, { file: 'Younity.csv' });
      saveState();
      win.reload();
      await new Promise((r) => win.webContents.once('did-finish-load', r));
      await wait(500);

      await shot('01-elenco');
      await js(`document.querySelector('tr[data-key]').click()`);
      await shot('02-scheda');
      await js(`document.querySelector('[data-nav=stampare]').click()`);
      await shot('03-da-stampare');
      await js(`document.querySelector('[data-act=print-all-todo]').click()`);
      await wait(900);
      await shot('04-dialogo-stampa');
      const html = await js(`openPrintDialog.current.html`);
      const nextNo = await js(`openPrintDialog.current.nextReceipt`);
      log('nextReceipt dopo stampa =', nextNo);
      fs.writeFileSync(path.join(out, 'ricevute.html'), html);
      const pw = new BrowserWindow({ show: false, width: 794, height: 1123, useContentSize: true });
      await pw.loadFile(path.join(out, 'ricevute.html'));
      await wait(300);
      fs.writeFileSync(path.join(out, 'ricevute-pagina1.png'), (await pw.webContents.capturePage()).toPNG());
      const pdf = await pw.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(path.join(out, 'ricevute.pdf'), pdf);
      log('pdf bytes', pdf.length);
      pw.destroy();
      await js(`document.querySelector('[data-act=close-modal]').click()`);
      await js(`document.querySelector('[data-nav=calendario]').click()`);
      await js(`(()=>{const d=new Date();App.cal.y=d.getFullYear();App.cal.m=d.getMonth();render()})()`);
      await shot('05-calendario-mese');
      await js(`document.querySelector('[data-cal=anno]').click()`);
      await shot('06-calendario-anno');
      await js(`document.querySelector('[data-nav=impostazioni]').click()`);
      await shot('07-impostazioni');
      const errs = await js(`window.__errs || []`);
      log('fine', errs);
    } catch (e) {
      console.error('[smoke] ERRORE', e);
    }
    app.quit();
  });
};
