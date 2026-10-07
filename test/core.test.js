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

