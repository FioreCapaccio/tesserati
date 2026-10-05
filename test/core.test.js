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
