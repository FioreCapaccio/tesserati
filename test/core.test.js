'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readMembers, parseCsv } = require('../core/csv');
const S = require('../core/store');

const csvPath = process.argv[2] || path.join(__dirname, '..', '..', 'Younity.csv');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('parser gestisce virgolette e a-capo nei campi', () => {
  const r = parseCsv('a,"b\nc","d ""x"""\n1,2,3\n');
  assert.deepStrictEqual(r, [['a', 'b\nc', 'd "x"'], ['1', '2', '3']]);
});

if (fs.existsSync(csvPath)) {
  const { records, warnings, totalRows } = readMembers(fs.readFileSync(csvPath));
  t('legge tutte le righe del CSV reale', () => {
    assert.strictEqual(records.length, totalRows);
    assert.strictEqual(warnings.length, 0);
    console.log('   righe:', records.length);
  });
  t('pulizia nomi e province', () => {
    const r = records.find((x) => x.id === '1220539');
    assert.strictEqual(r.nome, 'Roberto');
    assert.strictEqual(r.cognome, 'Cocco');
    assert.ok(records.every((x) => x.provNascita !== 'NULL'));
    assert.ok(records.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.scadenza)));
  });

  const state = S.emptyState();
  let rep;
  t('primo import: tutto già stampato, 561 persone, 571 tessere (1 riga doppia unita)', () => {
    rep = S.importRecords(state, records, { file: 'Younity.csv' });
    assert.strictEqual(Object.keys(state.persons).length, 561);
    assert.strictEqual(Object.keys(state.memberships).length, 571);
    assert.strictEqual(rep.avvisi.filter((a) => a.startsWith('Riga doppia')).length, 1);
    assert.ok(Object.values(state.memberships).every((m) => m.printed));
    assert.strictEqual(rep.nuoviKeys.length, 0);
  });
  t('secondo import identico: nessun nuovo, nulla di cambiato', () => {
    rep = S.importRecords(state, records, {});
    assert.strictEqual(rep.nuovi, 0);
    assert.strictEqual(rep.aggiornati, 0);
  });
  t('nuova riga + rinnovo: solo i nuovi da stampare; flag esistenti intatti', () => {
    const extra = records.concat([
      { ...records[0], id: '9999999', nome: 'Nuovo', cognome: 'Socio', cf: 'AAAAAA00A00A000A' },
      { ...records[0], iscrizione: '2027-10-04', scadenza: '2028-10-03' },
    ]);
    S.updateMemberships(state, [Object.keys(state.memberships)[0]], { hidden: true });
    rep = S.importRecords(state, extra, {});
    assert.strictEqual(rep.nuovi, 2);
    assert.strictEqual(rep.nuoviKeys.length, 2);
    assert.ok(rep.nuoviKeys.every((k) => state.memberships[k].printed === false));
    assert.strictEqual(Object.values(state.memberships).filter((m) => !m.printed).length, 2);
    assert.strictEqual(Object.keys(state.persons).length, 562);
  });
  t('stampa: commit imposta flag, numero, prossimo progressivo', () => {
    const keys = Object.values(state.memberships).filter((m) => !m.printed).map((m) => m.key);
    S.commitPrint(state, keys.map((k, i) => ({ key: k, no: 10 + i, label: 'R' + (10 + i), quota: '20' })), 12);
    assert.ok(keys.every((k) => state.memberships[k].printed && state.memberships[k].receiptNo >= 10));
    assert.strictEqual(state.settings.nextReceipt, 12);
    rep = S.importRecords(state, records, {});
    assert.strictEqual(Object.values(state.memberships).filter((m) => !m.printed).length, 0);
  });
  t('la tessera nascosta resta nascosta dopo un nuovo import', () => {
    assert.strictEqual(Object.values(state.memberships).filter((m) => m.hidden).length, 1);
  });
} else console.log('CSV reale non trovato, test saltati:', csvPath);
console.log(`\n${n} test superati`);

// ---- Metodo di pagamento ----
{
  const st = S.emptyState();
  S.importRecords(st, [{ id: '7', nome: 'Pia', cognome: 'Neri', nascita: '1980-01-01', provNascita: '', cf: 'Y', email: '', cell: '', indirizzo: '', citta: '', iscrizione: '2026-02-01', iscrizioneOra: '', scadenza: '2027-01-31', stato: 'Attivo' }], {});
  const k = Object.keys(st.memberships)[0];
  t('pagamento: metodi ammessi salvati sulla tessera', () => {
    for (const v of ['Contanti', 'POS', 'Bonifico', '']) { S.updateMemberships(st, [k], { paymentMethod: v }); assert.strictEqual(st.memberships[k].paymentMethod, v); }
  });
  t('pagamento: metodo inventato rifiutato', () => {
    S.updateMemberships(st, [k], { paymentMethod: 'POS' });
    assert.throws(() => S.updateMemberships(st, [k], { paymentMethod: 'Assegno' }), /non valido/);
    assert.strictEqual(st.memberships[k].paymentMethod, 'POS');
  });
  t('pagamento: la stampa registra il metodo usato', () => {
    S.commitPrint(st, [{ key: k, no: 1, label: '1', quota: '20', method: 'Bonifico', date: '2026-10-05' }], 2);
    assert.strictEqual(st.memberships[k].paymentMethod, 'Bonifico');
    S.commitPrint(st, [{ key: k, no: 1, label: '1', quota: '20', method: 'xyz' }], 2);
    assert.strictEqual(st.memberships[k].paymentMethod, '');
  });
  t('pagamento: predefinito nelle impostazioni validato', () => {
    S.saveSettings(st, { ...st.settings, defaultPayment: 'POS' }); assert.strictEqual(st.settings.defaultPayment, 'POS');
    S.saveSettings(st, { ...st.settings, defaultPayment: 'Barattolo' }); assert.strictEqual(st.settings.defaultPayment, '');
  });
  t('pagamento: backup con metodo non valido è rifiutato', () => {
    const B = require('../core/backup');
    const bk = B.makeBackup(st, '1.0.0');
    assert.ok(B.verifyBackup(JSON.parse(JSON.stringify(bk))).ok);
    const bad = JSON.parse(JSON.stringify(bk)); bad.data.memberships[k].paymentMethod = 'Assegno'; bad.sha256 = B.sha256(JSON.stringify(bad.data));
    assert.ok(!B.verifyBackup(bad).ok);
  });
}

// ---- Professione (campo facoltativo) ----
{
  const B = require('../core/backup');
  const rec = { id: '5', nome: 'Elsa', cognome: 'Verdi', nascita: '1985-05-05', provNascita: '', cf: 'E', email: 'e@x.it', cell: '', indirizzo: '', citta: '', iscrizione: '2026-03-01', iscrizioneOra: '', scadenza: '2027-02-28', stato: 'Attivo' };
  const st = S.emptyState();
  S.importRecords(st, [rec], {});
  t('professione: vuota all\'inizio, salvata ripulita e limitata a 120 caratteri', () => {
    assert.strictEqual(st.persons['5'].professione, '');
    S.updatePerson(st, '5', { professione: '   Insegnante   di   teatro ' });
    assert.strictEqual(st.persons['5'].professione, 'Insegnante di teatro');
    S.updatePerson(st, '5', { professione: 'x'.repeat(300) });
    assert.strictEqual(st.persons['5'].professione.length, 120);
    S.updatePerson(st, '5', { professione: null });
    assert.strictEqual(st.persons['5'].professione, '');
  });
  t('professione: la rilettura del CSV non la cancella', () => {
    S.updatePerson(st, '5', { professione: 'Attrice' });
    S.importRecords(st, [{ ...rec, citta: 'Pescara', email: 'nuova@x.it' }], {});
    assert.strictEqual(st.persons['5'].professione, 'Attrice');
    assert.strictEqual(st.persons['5'].citta, 'Pescara');             // i dati del CSV invece si aggiornano
  });
  t('professione: backup con valore non testuale rifiutato; vecchi backup senza campo ok', () => {
    const bk = B.makeBackup(st, '1.2.0');
    assert.ok(B.verifyBackup(JSON.parse(JSON.stringify(bk))).ok);
    const bad = JSON.parse(JSON.stringify(bk)); bad.data.persons['5'].professione = 42; bad.sha256 = B.sha256(JSON.stringify(bad.data));
    assert.ok(!B.verifyBackup(bad).ok);
    const old = JSON.parse(JSON.stringify(bk)); delete old.data.persons['5'].professione; old.sha256 = B.sha256(JSON.stringify(old.data));
    assert.ok(B.verifyBackup(old).ok);
  });
}

// ---- Inserimento, modifica ed eliminazione manuale ----
{
  const P = require('../core/people');
  const B = require('../core/backup');
  const TODAY = '2026-10-08';
  const rec = (id, nome, cognome, o = {}) => ({ id, nome, cognome, nascita: o.nascita || '1990-01-01', provNascita: 'PE', cf: o.cf || ('CF' + id.padStart(14, '0')), email: o.email || `${nome.toLowerCase()}@x.it`, cell: '', indirizzo: 'Via X 1', citta: 'Pescara', iscrizione: o.isc || '2026-01-10', iscrizioneOra: '', scadenza: o.scad || '2027-01-09', stato: o.stato || 'Attivo' });
  const withCsv = (...r) => { const s = S.emptyState(); S.importRecords(s, r, {}); return s; };

  t('manuale: creazione pulita, ID M001, tessera da stampare, scadenza = 1 anno', () => {
    const s = S.emptyState();
    const r = P.createPerson(s, { nome: 'anna maria', cognome: 'DE LUCA', nascita: '1985-03-02', cf: 'dlcnmr85c42g482x', email: 'ANNA@Mail.it', cell: '333 1234567', iscrizione: '2026-10-08' }, { today: TODAY });
    assert.strictEqual(r.personId, 'M001'); assert.strictEqual(r.key, 'M001_2026-10-08');
    const p = s.persons.M001, m = s.memberships[r.key];
    assert.deepStrictEqual([p.nome, p.cognome, p.cf, p.email, p.cell, p.manual], ['Anna Maria', 'De Luca', 'DLCNMR85C42G482X', 'anna@mail.it', '3331234567', true]);
    assert.deepStrictEqual([m.scadenza, m.stato, m.printed, m.manual], ['2027-10-07', 'Attivo', false, true]);
    assert.strictEqual(P.createPerson(s, { nome: 'Luca', cognome: 'Neri' }, { today: TODAY }).personId, 'M002');
  });
  t('manuale: scadenza 29 febbraio e 31 dicembre', () => {
    assert.strictEqual(P.addYear('2024-02-29'), '2025-02-28'); assert.strictEqual(P.addYear('2026-12-31'), '2027-12-30'); assert.strictEqual(P.addYear('2026-03-01'), '2027-02-28');
  });
  t('manuale: campi obbligatori e formati rifiutati con messaggi chiari', () => {
    const s = S.emptyState();
    const err = (i) => { try { P.createPerson(s, i, { today: TODAY }); return null; } catch (e) { return e.message; } };
    assert.ok(/nome è obbligatorio/.test(err({ cognome: 'X' }))); assert.ok(/cognome è obbligatorio/.test(err({ nome: 'X' })));
    assert.ok(/email non è valido/.test(err({ nome: 'A', cognome: 'B', email: 'xx' })));
    assert.ok(/16 caratteri/.test(err({ nome: 'A', cognome: 'B', cf: 'ABC' })));
    assert.ok(/nel futuro/.test(err({ nome: 'A', cognome: 'B', nascita: '2030-01-01' })));
    assert.ok(/data di nascita non è valida/.test(err({ nome: 'A', cognome: 'B', nascita: '2026-02-31' })));
    assert.ok(/precedente/.test(err({ nome: 'A', cognome: 'B', iscrizione: '2026-10-08', scadenza: '2026-10-01' })));
    assert.ok(/Attivo o Sospeso/.test(err({ nome: 'A', cognome: 'B', stato: 'Boh' })));
    assert.strictEqual(Object.keys(s.persons).length, 0);   // nulla è stato creato
  });
  t('manuale: duplicato (stesso CF o stesso nome+nascita) chiede conferma, anche col cestino', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi', { cf: 'RSSNNA90A41G482X', nascita: '1990-01-01' }));
    let r = P.createPerson(s, { nome: 'A', cognome: 'B', cf: 'RSSNNA90A41G482X' }, { today: TODAY });
    assert.strictEqual(r.duplicates.length, 1); assert.strictEqual(r.duplicates[0].motivo, 'stesso codice fiscale'); assert.strictEqual(Object.keys(s.persons).length, 1);
    r = P.createPerson(s, { nome: 'anna', cognome: 'ROSSI', nascita: '1990-01-01' }, { today: TODAY });
    assert.strictEqual(r.duplicates[0].motivo, 'stesso nome e data di nascita');
    r = P.createPerson(s, { nome: 'anna', cognome: 'ROSSI', nascita: '1990-01-01' }, { today: TODAY, force: true });
    assert.ok(r.personId);
    P.deletePerson(s, '1');
    assert.strictEqual(P.createPerson(s, { nome: 'Z', cognome: 'Z', cf: 'RSSNNA90A41G482X' }, { today: TODAY }).duplicates[0].nelCestino, true);
  });
  t('manuale: il primo caricamento del CSV resta "primo" anche dopo un inserimento a mano', () => {
    const s = S.emptyState();
    P.createPerson(s, { nome: 'Prima', cognome: 'Manuale' }, { today: TODAY });
    const rep = S.importRecords(s, [rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi')], {});
    assert.ok(rep.firstImport);
    assert.strictEqual(Object.values(s.memberships).filter((m) => !m.printed).length, 1);   // solo quella manuale
    assert.ok(s.memberships.M001_2026_10_08 === undefined);
  });
  t('modifica: i dati del CSV cambiati a mano non vengono sovrascritti dalla rilettura', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi', { email: 'vecchia@x.it' }));
    const key = '1_2026-01-10';
    const r = P.editPerson(s, '1', { nome: 'Anna', cognome: 'Rossi', nascita: '1990-01-01', provNascita: 'PE', cf: s.persons['1'].cf, email: 'NUOVA@x.it', cell: '', indirizzo: 'Via X 1', citta: 'Pescara', professione: 'Attrice', scadenza: '2027-03-01', stato: 'Sospeso' }, key, { today: TODAY });
    assert.deepStrictEqual(r.changed.sort(), ['email', 'professione', 'scadenza', 'stato']);
    assert.strictEqual(s.persons['1'].email, 'nuova@x.it'); assert.deepStrictEqual(s.persons['1'].overrides, { email: true });
    const rep = S.importRecords(s, [rec('1', 'Anna', 'Rossi', { email: 'vecchia@x.it' })], {});
    assert.strictEqual(s.persons['1'].email, 'nuova@x.it'); assert.strictEqual(s.memberships[key].scadenza, '2027-03-01'); assert.strictEqual(s.memberships[key].stato, 'Sospeso');
    assert.strictEqual(rep.aggiornati, 0);
  });
  t('modifica: gli altri campi continuano ad aggiornarsi dal CSV; "ripristina" restituisce il CSV', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi', { email: 'vecchia@x.it' }));
    P.editPerson(s, '1', { nome: 'Anna', cognome: 'Rossi', nascita: '1990-01-01', provNascita: 'PE', cf: s.persons['1'].cf, email: 'mia@x.it', cell: '', indirizzo: 'Via X 1', citta: 'Pescara', scadenza: '2027-01-09', stato: 'Attivo' }, '1_2026-01-10', { today: TODAY });
    S.importRecords(s, [{ ...rec('1', 'Anna', 'Rossi', { email: 'csv@x.it' }), citta: 'Chieti' }], {});
    assert.strictEqual(s.persons['1'].email, 'mia@x.it'); assert.strictEqual(s.persons['1'].citta, 'Chieti');
    P.resetOverrides(s, '1');
    S.importRecords(s, [{ ...rec('1', 'Anna', 'Rossi', { email: 'csv@x.it' }), citta: 'Chieti' }], {});
    assert.strictEqual(s.persons['1'].email, 'csv@x.it');
  });
  t('modifica: un dato "strano" del CSV non blocca altre modifiche; scadenza prima dell\'iscrizione rifiutata', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi', { cf: 'CORTO' }));
    const base = { nome: 'Anna', cognome: 'Rossi', nascita: '1990-01-01', provNascita: 'PE', cf: 'CORTO', email: 'anna@x.it', cell: '', indirizzo: 'Via X 1', citta: 'Pescara', scadenza: '2027-01-09', stato: 'Attivo' };
    assert.ok(P.editPerson(s, '1', { ...base, professione: 'Cuoca' }, '1_2026-01-10', { today: TODAY }).changed.includes('professione'));
    assert.throws(() => P.editPerson(s, '1', { ...base, scadenza: '2025-01-01' }, '1_2026-01-10', { today: TODAY }), /precedente/);
    assert.throws(() => P.editPerson(s, '1', { ...base, cf: 'ALTRO' }, '1_2026-01-10', { today: TODAY }), /16 caratteri/);
  });
  t('modifica: l\'iscrizione di una tessera manuale cambia la chiave e il registro ricevute', () => {
    const s = S.emptyState();
    const { key } = P.createPerson(s, { nome: 'Eva', cognome: 'Blu', iscrizione: '2026-10-01' }, { today: TODAY });
    S.commitPrint(s, [{ key, no: 7, label: '7', quota: '20', method: 'POS', date: '2026-10-01' }], 8);
    const r = P.editPerson(s, 'M001', { nome: 'Eva', cognome: 'Blu', scadenza: '2027-09-30', stato: 'Attivo', iscrizione: '2026-09-15' }, key, { today: TODAY });
    assert.strictEqual(r.key, 'M001_2026-09-15'); assert.ok(!s.memberships[key] && s.memberships['M001_2026-09-15']);
    assert.strictEqual(s.receipts[0].key, 'M001_2026-09-15');
    assert.strictEqual(s.memberships['M001_2026-09-15'].receiptNo, 7);
  });
  t('elimina: va nel cestino, la rilettura del CSV non lo fa tornare, "ripristina" lo rimette', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi'));
    const rep0 = S.importRecords(s, [rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi')], {});
    assert.strictEqual(rep0.nuovi, 0);
    assert.strictEqual(P.deletePerson(s, '1').tessere, 1);
    assert.ok(!s.persons['1'] && !s.memberships['1_2026-01-10'] && s.trash['1']);
    const rep = S.importRecords(s, [rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi')], {});
    assert.strictEqual(rep.ignorati, 1); assert.strictEqual(rep.nuovi, 0); assert.ok(!s.persons['1']);
    assert.ok(rep.avvisi.some((a) => /cestino/.test(a)));
    P.restorePerson(s, '1');
    assert.ok(s.persons['1'] && s.memberships['1_2026-01-10'] && !s.trash['1']);
    assert.throws(() => P.restorePerson(s, '1'), /Non è nel cestino/);
  });
  t('elimina: svuotare il cestino è definitivo (il CSV lo ricrea come nuovo)', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi'));
    P.deletePerson(s, '1'); P.purgeTrash(s, '1');
    assert.deepStrictEqual(s.trash, {});
    const rep = S.importRecords(s, [rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi')], {});
    assert.strictEqual(rep.nuovi, 1); assert.deepStrictEqual(rep.nuoviKeys, ['1_2026-01-10']);
    P.deletePerson(s, '2'); P.purgeTrash(s);
    assert.deepStrictEqual(s.trash, {});
  });
  t('elimina: la persona eliminata esce dagli avvisi email', () => {
    const R = require('../core/reminders');
    const s = withCsv(rec('1', 'Anna', 'Rossi', { scad: '2026-10-20' }));
    assert.strictEqual(R.dueReminders(s, TODAY).groups.length, 1);
    P.deletePerson(s, '1');
    assert.strictEqual(R.dueReminders(s, TODAY).groups.length, 0);
  });
  t('ricevute: iscrizione annuale tiene numero e flag; retta mensile = numero nuovo, tessera intatta', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi'));
    const key = '1_2026-01-10';
    S.updateMemberships(s, [key], { printed: false });
    S.commitPrint(s, [{ key, no: 10, label: 'A10', quota: '25', method: 'Contanti', date: '2026-10-08', tipo: 'annuale' }], 11);
    assert.strictEqual(s.memberships[key].receiptNo, 10); assert.ok(s.memberships[key].printed);
    S.commitPrint(s, [{ key, no: 10, label: 'A10', quota: '25', method: 'Contanti', date: '2026-10-09', tipo: 'annuale' }], NaN);    // ristampa
    assert.strictEqual(s.receipts.filter((r) => r.tipo === 'annuale').length, 1);
    S.commitPrint(s, [{ key, no: 11, label: 'A11', quota: '40', method: 'POS', date: '2026-10-08', tipo: 'mensile', periodo: '2026-10' }], 12);
    S.commitPrint(s, [{ key, no: 12, label: 'A12', quota: '40', method: 'POS', date: '2026-11-08', tipo: 'mensile', periodo: '2026-11' }], 13);
    assert.strictEqual(s.memberships[key].receiptNo, 10);        // la ricevuta della tessera non è stata toccata
    assert.strictEqual(s.memberships[key].quota, '25');
    assert.deepStrictEqual(s.receipts.filter((r) => r.tipo === 'mensile').map((r) => [r.no, r.periodo, r.nome]), [[11, '2026-10', 'Rossi Anna'], [12, '2026-11', 'Rossi Anna']]);
    assert.strictEqual(s.settings.nextReceipt, 13);
  });
  t('ricevute: impostazioni tipo predefinito validate; archivio nuovo con cestino e registro', () => {
    const s = S.emptyState();
    assert.deepStrictEqual([s.trash, s.receipts, s.settings.defaultReceiptType], [{}, [], 'annuale']);
    S.saveSettings(s, { ...s.settings, defaultReceiptType: 'mensile', defaultRetta: ' 40 ' });
    assert.deepStrictEqual([s.settings.defaultReceiptType, s.settings.defaultRetta], ['mensile', '40']);
    S.saveSettings(s, { ...s.settings, defaultReceiptType: 'settimanale' });
    assert.strictEqual(s.settings.defaultReceiptType, 'annuale');
  });
  t('backup: nuove strutture valide passano; cestino/registro/modifiche corrotti rifiutati', () => {
    const s = withCsv(rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi'));
    P.editPerson(s, '1', { nome: 'Anna', cognome: 'Rossi', nascita: '1990-01-01', provNascita: 'PE', cf: s.persons['1'].cf, email: 'z@x.it', cell: '', indirizzo: 'Via X 1', citta: 'Pescara', scadenza: '2027-01-09', stato: 'Attivo' }, '1_2026-01-10', { today: TODAY });
    P.deletePerson(s, '2');
    S.commitPrint(s, [{ key: '1_2026-01-10', no: 3, label: '3', quota: '', method: '', date: '2026-10-08', tipo: 'mensile', periodo: '2026-10' }], 4);
    const bk = B.makeBackup(s, '1.4.0');
    assert.ok(B.verifyBackup(JSON.parse(JSON.stringify(bk))).ok);
    const bad = (fn) => { const x = JSON.parse(JSON.stringify(bk)); fn(x.data); x.sha256 = B.sha256(JSON.stringify(x.data)); return B.verifyBackup(x); };
    assert.ok(!bad((d) => { d.trash['2'].person.id = '9'; }).ok);
    assert.ok(!bad((d) => { d.trash['1'] = d.trash['2']; d.trash['1'].person = { ...d.trash['2'].person, id: '1' }; }).ok);   // anche attivo
    assert.ok(!bad((d) => { d.receipts[0].periodo = '2026-13'; }).ok);
    assert.ok(!bad((d) => { d.receipts[0].no = 'x'; }).ok);
    assert.ok(!bad((d) => { d.persons['1'].overrides = 5; }).ok);
    const old = JSON.parse(JSON.stringify(bk)); delete old.data.trash; delete old.data.receipts; old.sha256 = B.sha256(JSON.stringify(old.data));
    assert.ok(B.verifyBackup(old).ok);
  });
}

// ---- Corsisti: calendario novembre–maggio ----
{
  const C = require('../core/corsi');
  const P = require('../core/people');
  const B = require('../core/backup');
  const rec = (id, nome, cognome) => ({ id, nome, cognome, nascita: '1990-01-01', provNascita: '', cf: 'C' + id, email: `${nome}@x.it`, cell: '', indirizzo: '', citta: '', iscrizione: '2026-01-10', iscrizioneOra: '', scadenza: '2027-01-09', stato: 'Attivo' });
  const mk = () => { const s = S.emptyState(); S.importRecords(s, [rec('1', 'Anna', 'Rossi'), rec('2', 'Luca', 'Bianchi'), rec('3', 'Zoe', 'Neri')], {}); S.updatePerson(s, '1', { corsista: true }); S.updatePerson(s, '2', { corsista: true }); return s; };
  const get = (it, id, slot) => it.find((x) => x.personId === id && x.slot === slot);

  t('corsisti: stagione da novembre a maggio, scadenze il 1° del mese, iscrizione il 1° novembre', () => {
    assert.deepStrictEqual(C.seasonMonths(2026), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    assert.strictEqual(C.seasonLabel(2026), '2026/27');
    assert.deepStrictEqual([C.dueDate('iscrizione', 2026), C.dueDate('2027-03', 2026)], ['2026-11-01', '2027-03-01']);
    assert.deepStrictEqual([C.seasonOfDate('2026-10-09'), C.seasonOfDate('2027-05-31'), C.seasonOfDate('2027-06-01')], [2026, 2026, 2027]);
    assert.deepStrictEqual([C.seasonOfPeriod('2026-12'), C.seasonOfPeriod('2027-01'), C.seasonOfPeriod('2026-10'), C.seasonOfPeriod('2027-06')], [2026, 2026, null, null]);
  });
  t('corsisti: la stagione va dal 1° novembre al 31 maggio (prossima / in corso / conclusa)', () => {
    assert.deepStrictEqual([C.seasonStart(2026), C.seasonEnd(2026)], ['2026-11-01', '2027-05-31']);
    const ph = (d) => C.seasonPhase(2026, d);
    assert.deepStrictEqual([ph('2026-10-31'), ph('2026-11-01'), ph('2027-05-31'), ph('2027-06-01')], ['prossima', 'incorso', 'incorso', 'conclusa']);
    const s = S.emptyState();
    assert.deepStrictEqual(C.seasonMonths(2026).map((m) => C.dueDate(m, 2026)).filter((d) => d < C.seasonStart(2026) || d > C.seasonEnd(2026)), []);   // tutte le scadenze cadono dentro la stagione
    assert.strictEqual(C.dueDate('2027-05', 2026), '2027-05-01');
  });
  t('corsisti: solo i corsisti compaiono; ognuno ha iscrizione + 7 mesi', () => {
    const s = mk(); const it = C.items(s, 2026, '2026-10-09');
    assert.strictEqual(it.length, 2 * 8);
    assert.ok(!it.some((x) => x.personId === '3'));
    assert.deepStrictEqual(it.filter((x) => x.personId === '1').map((x) => x.slot), ['iscrizione', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    assert.deepStrictEqual(it.filter((x) => x.due === '2026-11-01').map((x) => x.slot), ['iscrizione', 'iscrizione', '2026-11', '2026-11']);   // a novembre due voci a testa
  });
  t('corsisti: colori in base a oggi (scaduto, in scadenza, in arrivo, lontano)', () => {
    const s = mk();
    const at = (today) => { const it = C.items(s, 2026, today); return [get(it, '1', '2026-11').cls, get(it, '1', '2026-12').cls, get(it, '1', '2027-03').cls]; };
    assert.deepStrictEqual(at('2026-10-09'), ['soon', 'warn', 'future']);       // 23, 53, 143 giorni
    assert.deepStrictEqual(at('2026-11-01'), ['soon', 'soon', 'future']);         // il giorno stesso non è ancora scaduto; marzo è a 120 giorni
    assert.deepStrictEqual(at('2026-11-02'), ['expired', 'soon', 'future']);
    assert.strictEqual(get(C.items(s, 2026, '2026-11-20'), '1', 'iscrizione').days, -19);
  });
  t('corsisti: pagato / non dovuto / annullato', () => {
    const s = mk();
    C.setPay(s, '1', 2026, '2026-11', 'pagato', { at: '2026-11-03T10:00:00.000Z' });
    C.setPay(s, '1', 2026, '2026-12', 'nondovuto');
    let it = C.items(s, 2026, '2026-11-20');
    assert.deepStrictEqual([get(it, '1', '2026-11').cls, get(it, '1', '2026-12').cls, get(it, '1', 'iscrizione').cls, get(it, '2', '2026-11').cls], ['paid', 'skip', 'expired', 'expired']);
    assert.strictEqual(C.overdueCount(s, '2026-11-20'), 2 * 2 - 1);      // Anna: iscrizione; Luca: iscrizione + novembre
    C.setPay(s, '1', 2026, '2026-11', null);
    assert.strictEqual(get(C.items(s, 2026, '2026-11-20'), '1', '2026-11').status, 'dovuto');
    assert.ok(!s.persons['1'].corso[2026]['2026-11']);
    assert.throws(() => C.setPay(s, '1', 2026, '2026-10', 'pagato'), /non valida/);
    assert.throws(() => C.setPay(s, '1', 2026, '2026-11', 'forse'), /non valido/);
  });
  t('corsisti: la ricevuta della retta mensile segna da sola il mese, solo per i corsisti', () => {
    const s = mk(); const key = '1_2026-01-10', keyNon = '3_2026-01-10';
    S.commitPrint(s, [{ key, no: 50, label: 'R50', quota: '40', method: 'POS', date: '2026-11-03', tipo: 'mensile', periodo: '2026-11' }, { key: keyNon, no: 51, label: 'R51', quota: '40', method: 'POS', date: '2026-11-03', tipo: 'mensile', periodo: '2026-11' }], 52);
    const p = get(C.items(s, 2026, '2026-11-20'), '1', '2026-11');
    assert.deepStrictEqual([p.status, p.receipt, p.manual], ['pagato', { no: 50, label: 'R50' }, false]);
    assert.ok(!s.persons['3'].corso);
    S.commitPrint(s, [{ key, no: 52, label: 'R52', quota: '40', method: '', date: '2026-10-03', tipo: 'mensile', periodo: '2026-10' }], 53);   // ottobre: fuori stagione
    assert.deepStrictEqual(Object.keys(s.persons['1'].corso[2026]), ['2026-11']);
  });
  t('corsisti: la ricevuta "iscrizione al corso" segna l\'iscrizione e non tocca la tessera', () => {
    const s = mk(); const key = '2_2026-01-10';
    S.updateMemberships(s, [key], { printed: false });
    S.commitPrint(s, [{ key, no: 60, label: 'C60', quota: '80', method: 'Contanti', date: '2026-10-20', tipo: 'corso', periodo: '2026' }], 61);
    const pay = C.getPay(s.persons['2'], 2026, 'iscrizione');
    assert.deepStrictEqual([pay.status, pay.no], ['pagato', 60]);
    assert.strictEqual(s.memberships[key].printed, false);                 // la tessera resta da stampare
    assert.strictEqual(s.receipts[0].tipo, 'corso');
    assert.strictEqual(s.receipts[0].periodo, '2026');
    S.commitPrint(s, [{ key, no: 61, label: 'C61', quota: '', method: '', date: '2027-02-02', tipo: 'corso' }], 62);   // senza stagione: la ricava dalla data
    assert.ok(C.getPay(s.persons['2'], 2026, 'iscrizione'));
  });
  t('corsisti: chi è nel cestino sparisce dal calendario; si ripristina con i pagamenti', () => {
    const s = mk(); C.setPay(s, '1', 2026, '2026-11', 'pagato');
    P.deletePerson(s, '1');
    assert.ok(!C.items(s, 2026, '2026-10-09').some((x) => x.personId === '1'));
    P.restorePerson(s, '1');
    assert.strictEqual(get(C.items(s, 2026, '2026-10-09'), '1', '2026-11').status, 'pagato');
  });
  t('corsisti: flag dal modulo di inserimento/modifica e rilettura del CSV', () => {
    const s = S.emptyState();
    const { personId, key } = P.createPerson(s, { nome: 'Eva', cognome: 'Blu', corsista: true }, { today: '2026-10-09' });
    assert.strictEqual(s.persons[personId].corsista, true);
    assert.ok(P.editPerson(s, personId, { nome: 'Eva', cognome: 'Blu', corsista: false, scadenza: s.memberships[key].scadenza, stato: 'Attivo' }, key, { today: '2026-10-09' }).changed.includes('corsista'));
    assert.strictEqual(s.persons[personId].corsista, false);
    const s2 = mk(); S.importRecords(s2, [rec('1', 'Anna', 'Rossi')], {});
    assert.strictEqual(s2.persons['1'].corsista, true);                    // il CSV non conosce il flag e non lo cancella
  });
  t('corsisti: impostazione dell\'importo del corso e backup con i nuovi dati', () => {
    const s = mk(); S.saveSettings(s, { ...s.settings, defaultIscrizioneCorso: ' 80 ' });
    assert.strictEqual(s.settings.defaultIscrizioneCorso, '80');
    C.setPay(s, '1', 2026, '2026-11', 'pagato'); C.setPay(s, '1', 2026, 'iscrizione', 'nondovuto');
    const bk = B.makeBackup(s, '1.5.0');
    assert.ok(B.verifyBackup(JSON.parse(JSON.stringify(bk))).ok);
    const bad = (fn) => { const x = JSON.parse(JSON.stringify(bk)); fn(x.data); x.sha256 = B.sha256(JSON.stringify(x.data)); return B.verifyBackup(x); };
    assert.ok(!bad((d) => { d.persons['1'].corso[2026]['2026-10'] = { status: 'pagato' }; }).ok);
    assert.ok(!bad((d) => { d.persons['1'].corso[2026]['2026-11'].status = 'boh'; }).ok);
    assert.ok(!bad((d) => { d.persons['1'].corsista = 'si'; }).ok);
    assert.ok(!bad((d) => { d.persons['1'].corso = [1]; }).ok);
    const old = JSON.parse(JSON.stringify(bk)); delete old.data.persons['1'].corso; delete old.data.persons['1'].corsista; old.sha256 = B.sha256(JSON.stringify(old.data));
    assert.ok(B.verifyBackup(old).ok);
  });
}

// ---- Ricerca del CSV nella cartella Download ----
{
  const os = require('os');
  const { newestMatching } = require('../core/csv');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'));
  const w = (name, ageSec) => { const f = path.join(dir, name); fs.writeFileSync(f, 'x'); const tm = new Date(Date.now() - ageSec * 1000); fs.utimesSync(f, tm, tm); };
  t('Download: nessun file Younity -> null', () => { w('altro.csv', 5); w('foto.png', 1); assert.strictEqual(newestMatching(dir), null); });
  t('Download: sceglie il Younity più recente (anche "Younity (1).csv")', () => {
    w('Younity.csv', 600); w('Younity (1).csv', 10); w('younity-vecchio.CSV', 3000);
    assert.strictEqual(path.basename(newestMatching(dir)), 'Younity (1).csv');
  });
  t('Download: cartella inesistente -> null', () => assert.strictEqual(newestMatching(path.join(dir, 'no')), null));
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---- Backup con controllo di integrità ----
{
  const B = require('../core/backup');
  const st = S.emptyState();
  S.importRecords(st, [
    { id: '1', nome: 'Ada', cognome: 'Rossi', nascita: '1990-01-01', provNascita: 'PE', cf: 'X', email: 'a@b.it', cell: '1', indirizzo: 'Via', citta: 'Pescara', iscrizione: '2026-01-10', iscrizioneOra: '', scadenza: '2027-01-09', stato: 'Attivo' },
  ], {});
  const bk = B.makeBackup(st, '1.0.0');
  t('backup integro: verifica ok e riepilogo', () => {
    const v = B.verifyBackup(JSON.parse(JSON.stringify(bk)));
    assert.ok(v.ok, v.errors.join('; '));
    assert.ok(v.signed);
    assert.strictEqual(v.summary.memberships, 1);
  });
  t('backup manomesso: firma non corrispondente', () => {
    const bad = JSON.parse(JSON.stringify(bk));
    bad.data.persons['1'].nome = 'Mallory';
    const v = B.verifyBackup(bad);
    assert.ok(!v.ok);
    assert.ok(v.errors.some((e) => e.includes('Firma di integrità')));
  });
  t('backup con dati incoerenti (anche con firma ricalcolata) è rifiutato', () => {
    const bad = JSON.parse(JSON.stringify(bk));
    bad.data.memberships['1_2026-01-10'].personId = '999';
    bad.sha256 = B.sha256(JSON.stringify(bad.data));
    const v = B.verifyBackup(bad);
    assert.ok(!v.ok);
    assert.ok(v.errors.some((e) => e.includes('chiave incoerente') || e.includes('anagrafica')));
  });
  t('backup troncato / file estraneo rifiutati', () => {
    assert.ok(!B.verifyBackup({ foo: 1 }).ok);
    assert.ok(!B.verifyBackup(null).ok);
    const bad = JSON.parse(JSON.stringify(bk)); delete bad.data.memberships;
    assert.ok(!B.verifyBackup(bad).ok);
  });
  t('copia semplice senza firma accettata solo se coerente', () => {
    const v = B.verifyBackup(JSON.parse(JSON.stringify(st)));
    assert.ok(v.ok && !v.signed);
  });
}
console.log(`\n${n} test superati (totale)`);

// ---- Avvisi email di rinnovo ----
{
  const R = require('../core/reminders');
  const M = require('../core/mailer');
  const TODAY = '2026-10-07';
  const rec = (id, nome, cognome, email, scad, extra = {}) => ({ id, nome, cognome, nascita: '1990-01-01', provNascita: '', cf: 'C' + id, email, cell: '', indirizzo: '', citta: '', iscrizione: extra.isc || '2025-10-01', iscrizioneOra: '', scadenza: scad, stato: extra.stato || 'Attivo' });
  const fresh = (recs) => { const s = S.emptyState(); S.importRecords(s, recs, {}); s.settings.assoc = { nome: 'Il Sipario', telefono: '085 111', email: 'info@sipario.it', indirizzo: 'Via Roma 1' }; return s; };
  const due = (s) => R.dueReminders(s, TODAY);
  const names = (s) => due(s).groups.flatMap((g) => g.items.map((i) => i.cognome)).sort();

  t('avvisi: finestra 0–30 giorni, bordi inclusi', () => {
    const s = fresh([rec('1', 'A', 'Ieri', 'a@x.it', '2026-10-06'), rec('2', 'B', 'Oggi', 'b@x.it', '2026-10-07'), rec('3', 'C', 'Trenta', 'c@x.it', '2026-11-06'), rec('4', 'D', 'Trentuno', 'd@x.it', '2026-11-07')]);
    assert.deepStrictEqual(names(s), ['Oggi', 'Trenta']);
  });
  t('avvisi: esclusi nascoste, sospese, "non inviare", email mancante/non valida', () => {
    const s = fresh([rec('1', 'A', 'Ok', 'ok@x.it', '2026-10-20'), rec('2', 'B', 'Nascosta', 'b@x.it', '2026-10-20'), rec('3', 'C', 'Sospesa', 'c@x.it', '2026-10-20', { stato: 'Sospeso' }),
      rec('4', 'D', 'NoMail', 'd@x.it', '2026-10-20'), rec('5', 'E', 'Vuota', '', '2026-10-20'), rec('6', 'F', 'Rotta', 'senza-chiocciola', '2026-10-20')]);
    S.updateMemberships(s, ['2_2025-10-01'], { hidden: true });
    S.updatePerson(s, '4', { noEmail: true });
    const d = due(s);
    assert.deepStrictEqual(names(s), ['Ok']);
    assert.strictEqual(d.skipped.nascoste, 1); assert.strictEqual(d.skipped.nonAttivi, 1); assert.strictEqual(d.skipped.escluse, 1);
    assert.deepStrictEqual(d.skipped.senzaEmail.map((x) => x.nome).sort(), ['Rotta F', 'Vuota E']);
  });
  t('avvisi: già avvisati non tornano; solo l\'ultima tessera conta', () => {
    const s = fresh([rec('1', 'A', 'Avvisata', 'a@x.it', '2026-10-20'), rec('2', 'B', 'Rinnovata', 'b@x.it', '2026-10-10', { isc: '2025-10-11' }), rec('2', 'B', 'Rinnovata', 'b@x.it', '2027-10-09', { isc: '2026-10-10' })]);
    assert.deepStrictEqual(names(s), ['Avvisata']);               // il rinnovo di B scade nel 2027
    S.markReminded(s, ['1_2025-10-01'], { to: 'a@x.it' });
    assert.deepStrictEqual(names(s), []);
    assert.strictEqual(s.memberships['1_2025-10-01'].reminders.pre.to, 'a@x.it');
  });
  t('avvisi: una sola email per indirizzo condiviso (famiglia), maiuscole ignorate', () => {
    const s = fresh([rec('1', 'Anna', 'Rossi', 'Famiglia@X.it', '2026-10-20'), rec('2', 'Luca', 'Rossi', 'famiglia@x.it', '2026-10-15'), rec('3', 'Zoe', 'Bianchi', 'zoe@x.it', '2026-10-12')]);
    const d = due(s);
    assert.strictEqual(d.groups.length, 2);
    const fam = d.groups.find((g) => g.email === 'famiglia@x.it');
    assert.deepStrictEqual(fam.items.map((i) => i.nome), ['Luca', 'Anna']);  // ordinati per scadenza
    assert.strictEqual(d.groups[0].email, 'zoe@x.it');                       // gruppi ordinati per prima scadenza
  });
  t('avvisi: il testo usa data, elenco e contatti, mai "30 giorni"', () => {
    const s = fresh([rec('1', 'Anna', 'Rossi', 'f@x.it', '2026-10-20'), rec('2', 'Luca', 'Rossi', 'f@x.it', '2026-11-02')]);
    const m = R.renderMail(s.settings.mail, s.settings.assoc, due(s).groups[0]);
    assert.strictEqual(m.to, 'f@x.it');
    assert.ok(m.text.includes('• Anna Rossi — scade il 20/10/2026') && m.text.includes('• Luca Rossi — scade il 02/11/2026'));
    assert.ok(m.text.includes('Telefono: 085 111') && m.text.includes('Email: info@sipario.it') && m.text.includes('Sede: Via Roma 1'));
    assert.ok(m.subject.includes('Il Sipario') && !/30 giorni/.test(m.text + m.subject));
    assert.ok(!/\{(elenco|associazione|contatti)\}/.test(m.text + m.subject));
  });
  t('avvisi: archivio nuovo (primo avvio) già pronto, senza registro mancante', () => {
    const e = S.emptyState();
    assert.deepStrictEqual(e.mailLog, []);
    assert.strictEqual(e.settings.mail.daysBefore, 30);
    assert.deepStrictEqual(R.dueReminders(e, TODAY).groups, []);
  });
  t('avvisi: giorni personalizzabili (15) e impostazioni mail validate', () => {
    const s = fresh([rec('1', 'A', 'Vicina', 'a@x.it', '2026-10-17'), rec('2', 'B', 'Lontana', 'b@x.it', '2026-10-30')]);
    assert.deepStrictEqual(R.dueReminders(s, TODAY, { daysBefore: 15 }).groups.flatMap((g) => g.items.map((i) => i.cognome)), ['Vicina']);
  });

  const msgs = (n) => Array.from({ length: n }, (_, i) => ({ to: `u${i}@x.it`, subject: 's', text: 't' }));
  const fake = (fail = {}) => { const sent = []; return { sent, sendMail: async (o) => { if (fail[o.to]) { const e = new Error('boom'); Object.assign(e, fail[o.to]); throw e; } sent.push(o); }, close() {} }; };
  const cfg = { provider: 'gmail', user: 'assoc@gmail.com', fromName: 'Il Sipario', replyTo: '' };

  const run = async () => {
    let r = fake({ 'u1@x.it': { code: 'EENVELOPE' } });
    let out = await M.sendMany({ mail: cfg, assoc: { email: 'info@sipario.it' }, password: 'x', messages: msgs(3), transport: r, delayMs: 0 });
    t('invio: un errore a metà non ferma gli altri e resta segnalato', () => {
      assert.deepStrictEqual(out.results.map((x) => x.ok), [true, false, true]);
      assert.ok(/rifiutato/.test(out.results[1].error)); assert.strictEqual(out.stopped, null);
      assert.strictEqual(r.sent[0].replyTo, 'info@sipario.it'); assert.strictEqual(r.sent[0].from.address, 'assoc@gmail.com');
    });
    r = fake({ 'u1@x.it': { code: 'EAUTH' } });
    out = await M.sendMany({ mail: cfg, assoc: {}, password: 'x', messages: msgs(4), transport: r, delayMs: 0 });
    t('invio: accesso rifiutato ferma subito il lotto', () => {
      assert.deepStrictEqual(out.results.map((x) => x.ok), [true, false, false, false]);
      assert.strictEqual(out.stopped, 'auth'); assert.strictEqual(r.sent.length, 1);
      assert.ok(/password per app/.test(out.results[1].error));
    });
    r = fake();
    out = await M.sendMany({ mail: cfg, assoc: {}, password: 'x', messages: msgs(5), transport: r, delayMs: 0, max: 3 });
    t('invio: tetto per operazione rispettato', () => {
      assert.strictEqual(r.sent.length, 3); assert.strictEqual(out.stopped, 'limit');
      assert.ok(out.results.slice(3).every((x) => !x.ok && x.skipped));
    });
    t('provider: preset Gmail/Outlook e server personalizzato', () => {
      assert.deepStrictEqual(M.effectiveConfig({ provider: 'gmail' }), { host: 'smtp.gmail.com', port: 465, secure: true });
      assert.strictEqual(M.effectiveConfig({ provider: 'outlook' }).port, 587);
      assert.deepStrictEqual(M.effectiveConfig({ provider: 'altro', host: 'smtp.x.it', port: '25', secure: false }), { host: 'smtp.x.it', port: 25, secure: false });
    });
    if (fs.existsSync(csvPath)) {
      const real = S.emptyState(); S.importRecords(real, readMembers(fs.readFileSync(csvPath)).records, {});
      const d = R.dueReminders(real, TODAY);
      // controllo incrociato indipendente: ultima tessera, 0–30 giorni, Attivo, email valida
      const latest = new Map(); for (const m of Object.values(real.memberships)) { const c = latest.get(m.personId); if (!c || m.iscrizione > c.iscrizione) latest.set(m.personId, m); }
      const indep = [...latest.values()].filter((m) => { const x = R.daysBetween(TODAY, m.scadenza); return x >= 0 && x <= 30 && m.stato === 'Attivo' && /^\S+@\S+\.\S+$/.test(real.persons[m.personId].email); });
      t('avvisi: CSV reale — conteggi coerenti con il controllo indipendente', () => {
        const n = d.groups.reduce((a, g) => a + g.items.length, 0);
        assert.strictEqual(n, indep.length);
        console.log(`   oggi (${TODAY}): ${n} tesserati da avvisare in ${d.groups.length} email; senza email valida: ${d.skipped.senzaEmail.length}`);
        assert.ok(d.groups.length <= n && d.groups.length > 0);
      });
    }
    console.log(`\n${n} test superati (totale finale)`);
  };
  run().catch((e) => { console.error(e); process.exit(1); });
}

