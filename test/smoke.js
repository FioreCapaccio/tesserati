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
  const shot = async (name) => { await wait(500); await win.webContents.capturePage(); await wait(500); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('shot', name); };
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
      await js(`(()=>{const i=document.getElementById('professione');i.focus();i.value='  Insegnante   di teatro ';i.blur();})()`);
      await wait(600);
      const pid = Object.keys(st.persons).find((k) => st.persons[k].professione);
      log('professione salvata =', JSON.stringify(pid && st.persons[pid].professione), '| nel campo =', await js(`document.getElementById('professione').value`));
      await shot('02b-scheda-professione');
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
      // ---- inserimento / modifica / eliminazione manuale ----
      const setv = (id, val) => js(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(val)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await js(`document.querySelector('[data-nav=lista]').click()`);
      await js(`document.querySelector('[data-act=new-person]').click()`); await wait(400);
      await shot('18-nuovo-tesserato');
      await js(`document.querySelector('[data-act=save-person]').click()`); await wait(300);
      log('invio modulo vuoto -> errore =', await js(`document.getElementById('pf-err').textContent`));
      for (const [id, v] of [['pf-cognome', 'bianchi'], ['pf-nome', 'giulia maria'], ['pf-nascita', '1991-04-12'], ['pf-prov', 'pe'], ['pf-cf', 'bnchgl91d52g482x'], ['pf-email', 'giulia@esempio.it'], ['pf-cell', '333 987 6543'], ['pf-indirizzo', 'Via Roma 5'], ['pf-citta', 'pescara'], ['pf-prof', 'Attrice'], ['pf-isc', '2026-10-08']]) await setv(id, v);
      log('scadenza proposta dopo l iscrizione =', await js(`document.getElementById('pf-sca').value`));
      await js(`document.querySelector('[data-act=save-person]').click()`); await wait(800);
      const man = Object.values(st.persons).find((p) => p.manual);
      log('creato =', man && `${man.id} ${man.cognome} ${man.nome} ${man.cf} ${man.cell} ${man.citta}`, '| tessere =', Object.values(st.memberships).filter((m) => m.personId === (man && man.id)).length, '| scheda aperta =', await js(`document.querySelector('#drawer h2')?.textContent`));
      await shot('19-tesserato-creato');
      await js(`document.querySelector('[data-act=new-person]').click()`); await wait(300);
      await setv('pf-cognome', 'Bianchi'); await setv('pf-nome', 'Giulia'); await setv('pf-cf', 'BNCHGL91D52G482X');
      await js(`document.querySelector('[data-act=save-person]').click()`); await wait(500);
      log('doppione -> avviso =', (await js(`document.getElementById('pf-err').textContent`)).slice(0, 90), '| pulsante =', await js(`document.querySelector('[data-act=save-person]').textContent`));
      await shot('20-doppione');
      await js(`closeModal()`);
      // modifica di un tesserato del CSV
      const csvKey = Object.values(st.memberships).find((m) => !m.manual && m.personId === '1472513').key;
      await js(`document.querySelector('tr[data-key="${csvKey}"]').click()`); await wait(300);
      await js(`document.querySelector('[data-act=edit-person]').click()`); await wait(300);
      log('iscrizione CSV bloccata =', await js(`document.getElementById('pf-isc').disabled`));
      await setv('pf-email', 'Nuova.Email@Esempio.it'); await setv('pf-citta', 'Chieti');
      await js(`document.querySelector('[data-act=save-person]').click()`); await wait(800);
      const pe = st.persons['1472513'];
      log('modifica salvata =', pe.email, pe.citta, JSON.stringify(pe.overrides));
      S.importRecords(st, records, { file: 'Younity.csv' }); saveState();
      log('dopo rilettura del CSV: email =', pe.email, '| città =', pe.citta, '(la modifica resta)');
      await js(`window.api.getState().then(r=>{setData(r);render()})`); await wait(300);
      await shot('21-scheda-modificata');
      // ricevuta: retta mensile
      await js(`document.querySelector('[data-act=print-one]').click()`); await wait(700);
      await js(`(()=>{const t=document.getElementById('p-tipo');t.value='corso';t.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      log('scelte del tipo =', JSON.stringify(await js(`[...document.getElementById('p-tipo').options].map(o=>o.textContent)`)), '| voci del corso =', JSON.stringify(await js(`[...document.getElementById('p-voce').options].map(o=>o.textContent)`)));
      await setv('p-quota', '40'); await setv('p-periodo', '2026-11'); await wait(800);
      const rp = await js(`openPrintDialog.current.receipts[0]`);
      const rh = await js(`openPrintDialog.current.html`);
      log('ricevuta corso/rata: tipo/periodo/quota =', rp.tipo, rp.periodo, rp.quota, '| titolo =', rh.includes('Ricevuta corso'), '| causale =', rh.includes('Corso 2026/27 – rata di novembre 2026'), '| "Rata del corso versata" =', rh.includes('Rata del corso versata'));
      await shot('22-stampa-retta-mensile');
      await js(`closeModal()`);
      // eliminazione e cestino
      await js(`document.querySelector('[data-act=delete-person]').click()`); await wait(300);
      await shot('23-conferma-eliminazione');
      await js(`document.querySelector('[data-act=delete-go]').click()`); await wait(800);
      log('eliminato -> nel cestino =', !!st.trash['1472513'], '| attivo =', !!st.persons['1472513'], '| tessere rimaste =', Object.values(st.memberships).filter((m) => m.personId === '1472513').length);
      const rep2 = S.importRecords(st, records, { file: 'Younity.csv' });
      log('rilettura CSV: ignorati =', rep2.ignorati, '| tornato attivo =', !!st.persons['1472513'], '| nuovi =', rep2.nuovi);
      await js(`document.querySelector('[data-nav=impostazioni]').click()`); await wait(300);
      win.setSize(1440, 2900); await wait(500);
      await js(`document.querySelector('[data-act=trash-restore]').scrollIntoView()`);
      await shot('24-cestino');
      win.setSize(1440, 900); await wait(300);
      await js(`document.querySelector('[data-act=trash-restore]').click()`); await wait(600);
      log('ripristinato =', !!st.persons['1472513'] && !st.trash['1472513'], '| tessere =', Object.values(st.memberships).filter((m) => m.personId === '1472513').length);

      // ---- corsisti ----
      const keyOf = (pid) => Object.values(st.memberships).find((m) => m.personId === pid && !m.manual || m.personId === pid).key;
      await js(`document.querySelector('[data-nav=lista]').click()`); await wait(300);
      for (const pid of ['1472513', '1375050']) {
        await js(`document.querySelector('tr[data-key="${keyOf(pid)}"]').click()`); await wait(300);
        await js(`document.getElementById('corsista').click()`); await wait(500);
      }
      log('corsisti segnati =', Object.values(st.persons).filter((p) => p.corsista).map((p) => p.id).join(','));
      await js(`App.filters.corsisti='si';render()`); await wait(300);
      log('filtro "solo corsisti": righe =', await js(`document.querySelectorAll('#tbody tr').length`));
      await js(`App.filters.corsisti='';render()`);
      await js(`document.querySelector('[data-nav=corsisti]').click()`); await wait(1200);
      log('menu: voci calendario =', JSON.stringify(await js(`[...document.querySelectorAll('.nav span:nth-child(2)')].map(e=>e.textContent).filter(t=>/Calendario/.test(t))`)), '| stagione =', await js(`App.corsi.label`), '| voci =', await js(`App.corsi.items.length`), '| mese iniziale =', await js(`App.corsi.months[App.cs.mi]`));
      await shot('25-calendario-corsisti-mese');
      const entry = '1472513|2026-11';
      await js(`document.querySelector('[data-act=cs-pay][data-e="${entry}"]').click()`); await wait(900);
      log('pagato a mano: stato =', JSON.stringify(st.persons['1472513'].corso && st.persons['1472513'].corso['2026']['2026-11'] && st.persons['1472513'].corso['2026']['2026-11'].status));
      await js(`document.querySelector('[data-act=cs-skip][data-e="1375050|iscrizione"]').click()`); await wait(900);
      await js(`document.querySelector('[data-cs=stagione]').click()`); await wait(900);
      await js(`document.querySelector('[data-csc="1375050|2026-12"]').click()`); await wait(900);
      log('matrice: dicembre pagato =', st.persons['1375050'].corso['2026']['2026-12'].status, '| iscrizione non dovuta =', st.persons['1375050'].corso['2026']['iscrizione'].status);
      await shot('26-calendario-corsisti-stagione');
      await js(`document.querySelector('[data-cs=mese]').click()`); await wait(900);
      // stampa: retta + iscrizione di novembre per la stessa persona
      await js(`document.querySelector('[data-cssel="1472513|iscrizione"]').click()`); await wait(400);
      await js(`document.querySelector('[data-cssel="1472513|2026-11"]').click()`); await wait(400);
      log('selezionate per la stampa =', await js(`App.cs.sel.size`));
      await js(`document.querySelector('[data-act=cs-bulk-print]').click()`); await wait(1200);
      const cr = await js(`openPrintDialog.current.receipts.map(r=>r.tipo+':'+r.periodo+':'+r.no)`);
      const ch = await js(`openPrintDialog.current.html`);
      log('stampa dal calendario: tipo in alto =', await js(`document.getElementById('p-tipo').value`), '| voce in alto visibile =', await js(`!document.getElementById('p-voce-w').hidden`), '| tipi delle righe =', JSON.stringify(await js(`[...document.querySelectorAll('[data-rt]')].map(e=>e.value)`)), '| voci delle righe =', JSON.stringify(await js(`[...document.querySelectorAll('[data-rv]')].map(e=>e.value)`)));
      log('ricevute da stampare =', JSON.stringify(cr), '| causale iscrizione =', ch.includes('Corso 2026/27 – iscrizione'), '| causale rata =', ch.includes('Corso 2026/27 – rata di novembre 2026'), '| titolo =', ch.includes('Ricevuta corso'), '| nessuna "Retta" =', !/Retta/.test(ch));
      await shot('27-stampa-corsista');
      const payload = await js(`({receipts: openPrintDialog.current.receipts, nextReceipt: openPrintDialog.current.nextReceipt})`);
      await js(`closeModal()`);
      S.updateMemberships(st, [keyOf('1472513')], { printed: true });
      S.commitPrint(st, payload.receipts, payload.nextReceipt); saveState();   // come dopo una stampa riuscita
      await js(`window.api.getState().then(r=>{setData(r);render()})`); await wait(1200);
      const cp = st.persons['1472513'].corso['2026'];
      log('dopo la stampa: iscrizione =', cp.iscrizione.status, 'n°', cp.iscrizione.no, '| novembre =', cp['2026-11'].status, 'n°', cp['2026-11'].no, '| automatico =', cp['2026-11'].manual === false);
      await shot('28-corsisti-dopo-stampa');

      // ---- avvisi email (trasporto finto: nessuna rete) ----
      st.settings.mail.user = 'associazione@gmail.com'; st.settings.mail.fromName = 'Il Sipario'; saveState();
      await js(`window.api.getState().then(r=>{setData(r);render()})`);
      await js(`document.querySelector('[data-nav=avvisi]').click()`); await wait(1200);
      const nGroups = await js(`App.avvisi.groups.length`);
      log('avvisi dovuti: email =', nGroups, '| tesserati =', await js(`App.avvisi.groups.reduce((a,g)=>a+g.items.length,0)`), '| senza email valida =', await js(`App.avvisi.skipped.senzaEmail.length`), '| badge menu =', await js(`document.querySelector('[data-nav=avvisi] .count').textContent`));
      await shot('12-avvisi');
      await js(`document.querySelector('[data-act=avvisi-preview]').click()`); await shot('13-anteprima-email');
      await js(`closeModal()`);
      await js(`document.querySelector('[data-avsel]').click()`); await wait(300);   // deseleziona il primo
      await js(`document.querySelector('[data-act=avvisi-send]').click()`); await shot('14-conferma-invio');
      await js(`document.querySelector('[data-act=avvisi-send-go]').click()`); await wait(2500);
      await shot('15-esito-invio');
      const sentLines = fs.existsSync(process.env.TESSERATI_MAIL_FAKE) ? fs.readFileSync(process.env.TESSERATI_MAIL_FAKE, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
      const marked = Object.values(st.memberships).filter((m) => m.reminders && m.reminders.pre).length;
      log('email inviate (file) =', sentLines.length, '| attese =', nGroups - 1, '| tessere segnate =', marked, '| registro =', st.mailLog.length, '| mittente =', JSON.stringify(sentLines[0] && sentLines[0].from), '| oggetto =', sentLines[0] && sentLines[0].subject);
      await js(`closeModal()`);
      await js(`document.querySelector('[data-nav=avvisi]').click()`); await wait(1200);
      log('dopo invio, restano da inviare =', await js(`App.avvisi.groups.length`), '(la sola deselezionata)');
      await shot('16-avvisi-dopo-invio');
      await js(`document.querySelector('[data-nav=impostazioni]').click()`);
      win.setSize(1440, 2600); await wait(500);
      await js(`document.getElementById('mail-card').scrollIntoView()`);
      await shot('17-impostazioni-email');
      win.setSize(1440, 900); await wait(300);

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
      await js(`document.querySelector('[data-nav=lista]').click()`);
      await js(`(()=>{const q=document.querySelector('input.search');q.value='insegnante di teatro';q.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await wait(300);
      log('ricerca per professione, righe trovate =', await js(`document.querySelectorAll('#tbody tr').length`));
      log('pulsante Chiudi app presente =', await js(`!!document.querySelector('[data-act=quit-app]')`));
      await js(`document.querySelector('[data-act=quit-app]').click()`);
      await wait(2500);
      const errs = await js(`window.__errs || []`);
      log('fine', errs);
    } catch (e) {
      console.error('[smoke] ERRORE', e);
    }
    app.quit();
  });
};
