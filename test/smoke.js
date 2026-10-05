'use strict';
// Test visivo: TESSERATI_SMOKE=1 TESSERATI_USERDATA=<dir> TESSERATI_OUT=<dir> TESSERATI_CSV=<file> npx electron .
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { readMembers } = require('../core/csv');
const B = require('../core/backup');

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
      st.settings.assoc = { nome: 'Associazione Culturale Teatrale “Il Sipario”', indirizzo: 'Via del Teatro 12, 65100 Pescara', cf: '91012345678', telefono: '085 1234567', email: 'info@ilsipario.it', logo: '', nota: 'Ricevuta di tesseramento per quota associativa, non soggetta a IVA.' };
      st.settings.nextReceipt = 124;
      st.settings.receiptPrefix = '2026/';
      const nuovi = records.slice(0, 5).map((r, i) => ({ ...r, id: '99000' + i, iscrizione: '2026-10-0' + (i + 1), scadenza: '2027-09-30', nome: ['Giulia', 'Marco', 'Anna Maria', 'Luca', 'Chiara'][i], cognome: ['Bianchi', 'D’Angelo', 'De Luca', 'Verdi', 'Esposito'][i], cf: 'XXXXXX00X00X000' + i }));
      S.importRecords(st, nuovi, { file: 'Younity.csv' });
      saveState();
      win.reload();
      await new Promise((r) => win.webContents.once('did-finish-load', r));
      await wait(500);

      await js(`window.api.setTheme('light').then(r=>{setData(r);render()})`);
      await shot('01-elenco');
      await js(`document.querySelector('[data-nav=impostazioni]').click()`);
      await js(`document.querySelector('[data-act=set-theme][data-v=dark]').click()`);
      await wait(500);
      log('tema salvato =', st.settings.theme, '| selettore premuto =', await js(`document.querySelector('[data-act=set-theme][aria-pressed=true]').textContent`));
      await shot('10-impostazioni-scuro');
      await js(`document.querySelector('[data-nav=lista]').click()`);
      await shot('11-elenco-scuro');
      await js(`window.api.setTheme('light').then(r=>{setData(r);render()})`);
      await js(`document.querySelector('tr[data-key]').click()`);
      await shot('02-scheda');
      await js(`document.querySelector('[data-nav=stampare]').click()`);
      await shot('03-da-stampare');
      await js(`document.querySelector('[data-act=print-all-todo]').click()`);
      await wait(900);
      await js(`(()=>{const rs=[...document.querySelectorAll('[data-rm]')];rs[0].value='Contanti';rs[0].dispatchEvent(new Event('change',{bubbles:true}));rs[1].value='POS';rs[1].dispatchEvent(new Event('change',{bubbles:true}));const q=document.querySelectorAll('[data-rq]')[0];q.value='25';q.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await wait(700);
      log('colonna opzioni: larghezza contenuto', await js(`(()=>{const c=document.querySelector('.ctl');return c.scrollWidth+' / visibile '+c.clientWidth})()`));
      const pay = await js(`openPrintDialog.current.receipts.map(r=>r.method+'|'+r.quota)`);
      log('metodi per ricevuta =', JSON.stringify(pay));
      await shot('04-dialogo-stampa');
      const html = await js(`openPrintDialog.current.html`);
      const nextNo = await js(`openPrintDialog.current.nextReceipt`);
      log('nextReceipt dopo stampa =', nextNo);
      log('html: Contanti in grassetto =', html.includes('<b>Contanti</b>'), '| POS =', html.includes('<b>POS</b>'), '| caselle da spuntare a mano =', (html.match(/class="box"/g) || []).length);
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
      win.setSize(1440, 2300); await wait(400);
      await shot('07-impostazioni');
      win.setSize(1440, 900); await wait(300);
      log('csv risolto:', JSON.stringify(await js(`App.csv`)));
      log('versione/copyright:', await js(`App.version + ' | ' + App.copyright`));
      log('footer in ogni vista:', JSON.stringify(await js(`(async()=>{const o={};for(const v of ['lista','stampare','calendario','impostazioni']){document.querySelector('[data-nav='+v+']').click();await new Promise(r=>setTimeout(r,80));o[v]=document.querySelector('.app-foot')?.textContent}return o})()`)));

      // ---- backup / ripristino ----
      const good = path.join(out, 'copia-buona.json');
      const bad = path.join(out, 'copia-manomessa.json');
      const bk = B.makeBackup(state(), '1.0.0');
      fs.writeFileSync(good, JSON.stringify(bk));
      const tam = JSON.parse(JSON.stringify(bk)); tam.data.persons[Object.keys(tam.data.persons)[0]].cognome = 'MANOMESSO';
      fs.writeFileSync(bad, JSON.stringify(tam));
      const insp = (f) => { const v = B.verifyBackup(JSON.parse(fs.readFileSync(f, 'utf8'))); return { path: f, name: path.basename(f), ok: v.ok, errors: v.errors, signed: v.signed, summary: v.summary }; };
      await js(`document.querySelector('[data-nav=impostazioni]').click()`);
      await js(`showRestoreDialog(${JSON.stringify(insp(good))})`); await shot('08-ripristino-ok');
      await js(`closeModal()`);
      await js(`showRestoreDialog(${JSON.stringify(insp(bad))})`); await shot('09-ripristino-manomesso');
      await js(`closeModal()`);
      const before = Object.keys(state().memberships).length;
      const rejected = await js(`window.api.applyBackup(${JSON.stringify(bad)}).then(()=>'ACCETTATO (ERRORE!)', e=>'rifiutato: '+e.message)`);
      log('copia manomessa ->', rejected, '| tessere invariate:', Object.keys(state().memberships).length === before);
      // modifica dei dati, poi ripristino della copia buona
      S.updateMemberships(state(), Object.keys(state().memberships).slice(0, 3), { printed: false });
      const applied = await js(`window.api.applyBackup(${JSON.stringify(good)}).then(r=>'ok, copia di sicurezza: '+r.safety, e=>'ERRORE '+e.message)`);
      log('ripristino copia buona ->', applied, '| da stampare dopo:', Object.values(state().memberships).filter((m) => !m.printed).length);
      log('file copia di sicurezza esiste:', fs.existsSync(path.join(process.env.TESSERATI_USERDATA, 'tesserati-data.json.prima-del-ripristino.json')));
      const errs = await js(`window.__errs || []`);
      log('fine', errs);
    } catch (e) {
      console.error('[smoke] ERRORE', e);
    }
    app.quit();
  });
};
