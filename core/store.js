'use strict';
// Logica dei dati (senza dipendenze da Electron): importazione, aggiornamenti, stampa.

const { DEFAULT_SUBJECT, DEFAULT_BODY } = require('./reminders');

const DEFAULT_SETTINGS = {
  assoc: { nome: '', indirizzo: '', cf: '', telefono: '', email: '', logo: '', nota: '' },
  nextReceipt: 1,
  receiptPrefix: '',
  receiptDigits: 4,
  defaultQuota: '',
  soonDays: 30,
  warnDays: 90,
  csvPath: '',
  defaultPayment: '', // '' = da indicare a mano sulla ricevuta
  theme: 'system', // 'system' | 'light' | 'dark'
  mail: {
    provider: 'gmail', // 'gmail' | 'outlook' | 'altro'
    host: '', port: 587, secure: false, // solo per 'altro'
    user: '', fromName: '', replyTo: '',
    daysBefore: 30,
    subject: DEFAULT_SUBJECT,
    body: DEFAULT_BODY,
  },
};

function emptyState() {
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), persons: {}, memberships: {}, imports: [], mailLog: [] };
}

function normalizeState(s) {
  const base = emptyState();
  const out = Object.assign(base, s || {});
  out.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), (s && s.settings) || {});
  out.settings.assoc = Object.assign({}, DEFAULT_SETTINGS.assoc, (s && s.settings && s.settings.assoc) || {});
  out.settings.mail = Object.assign({}, DEFAULT_SETTINGS.mail, (s && s.settings && s.settings.mail) || {});
  out.persons = out.persons || {};
  out.memberships = out.memberships || {};
  out.imports = out.imports || [];
  out.mailLog = Array.isArray(out.mailLog) ? out.mailLog : [];
  return out;
}

const PAYMENT_METHODS = ['Contanti', 'POS', 'Bonifico'];
const validPayment = (v) => v === '' || PAYMENT_METHODS.includes(v);
const mKey = (id, iscrizioneIso) => `${id}_${iscrizioneIso}`;
const PERSON_FIELDS = ['nome', 'cognome', 'nascita', 'provNascita', 'cf', 'email', 'cell', 'indirizzo', 'citta'];
const MEMBERSHIP_FIELDS = ['iscrizione', 'iscrizioneOra', 'scadenza', 'stato'];

// Unisce i record del CSV nell'archivio. Il primo import segna tutto come già stampato;
// dai successivi, solo le tessere mai viste prima risultano "da stampare".
function importRecords(state, records, { file = '', warnings = [], now = new Date() } = {}) {
  const firstImport = Object.keys(state.memberships).length === 0;
  const stamp = now.toISOString();
  const report = { file, at: stamp, rows: records.length, nuovi: 0, aggiornati: 0, invariati: 0, firstImport, nuoviKeys: [], warnings: [...warnings], avvisi: [] };

  // Per ogni persona i dati anagrafici vengono dalla tessera più recente presente nel file.
  const latest = new Map();
  for (const r of records) {
    const cur = latest.get(r.id);
    if (!cur || r.iscrizione > cur.iscrizione) latest.set(r.id, r);
  }

  const seen = new Set();
  for (const r of records) {
    const key = mKey(r.id, r.iscrizione);
    if (seen.has(key)) {
      report.avvisi.push(`Riga doppia nel file: ${r.cognome} ${r.nome} (ID ${r.id}), iscrizione del ${r.iscrizione.split('-').reverse().join('/')}. Unita in una sola tessera.`);
      continue;
    }
    seen.add(key);
    const ex = state.memberships[key];
    if (!ex) {
      state.memberships[key] = {
        key, personId: r.id,
        iscrizione: r.iscrizione, iscrizioneOra: r.iscrizioneOra, scadenza: r.scadenza, stato: r.stato,
        printed: firstImport, printedAt: null, receiptNo: null, receiptLabel: '', quota: '', paymentMethod: '',
        hidden: false, addedAt: stamp,
      };
      if (!firstImport) { report.nuovi++; report.nuoviKeys.push(key); }
      else report.nuovi++;
    } else {
      let changed = false;
      for (const f of MEMBERSHIP_FIELDS) if (ex[f] !== r[f]) { ex[f] = r[f]; changed = true; }
      if (changed) report.aggiornati++; else report.invariati++;
    }
  }

  for (const [id, r] of latest) {
    const p = state.persons[id];
    const data = {};
    for (const f of PERSON_FIELDS) data[f] = r[f];
    if (!p) state.persons[id] = Object.assign({ id, addedAt: stamp, note: '' }, data);
    else {
      for (const f of PERSON_FIELDS) if (p[f] !== data[f]) { Object.assign(p, data); break; }
    }
  }

  // Avvisi: stesso codice fiscale con ID diversi.
  const byCf = new Map();
  for (const p of Object.values(state.persons)) {
    if (!p.cf) continue;
    byCf.set(p.cf, (byCf.get(p.cf) || []).concat(p.id));
  }
  for (const [cf, ids] of byCf) if (ids.length > 1) report.avvisi.push(`Codice fiscale ${cf} presente con ID diversi: ${ids.join(', ')}.`);

  state.imports.push({ at: stamp, file, rows: report.rows, nuovi: report.nuovi, aggiornati: report.aggiornati, firstImport });
  if (state.imports.length > 200) state.imports.splice(0, state.imports.length - 200);
  return report;
}

function updateMemberships(state, keys, patch) {
  const allowed = ['printed', 'quota', 'hidden', 'paymentMethod'];
  if ('paymentMethod' in patch && !validPayment(patch.paymentMethod)) throw new Error('Metodo di pagamento non valido.');
  for (const k of keys) {
    const m = state.memberships[k];
    if (!m) continue;
    for (const f of allowed) if (f in patch) m[f] = patch[f];
    if ('printed' in patch && !patch.printed) { m.printedAt = null; }
    if ('printed' in patch && patch.printed && !m.printedAt) m.printedAt = new Date().toISOString();
  }
}

function updatePerson(state, id, patch) {
  const p = state.persons[id];
  if (!p) return;
  if ('note' in patch) p.note = String(patch.note || '');
  if ('noEmail' in patch) p.noEmail = !!patch.noEmail;
}

// Segna come avvisate le tessere (invio riuscito o già avvisate in altro modo).
function markReminded(state, keys, { to = '', at = new Date().toISOString(), manual = false } = {}) {
  for (const k of keys) {
    const m = state.memberships[k];
    if (!m) continue;
    m.reminders = Object.assign({}, m.reminders, { pre: { sentAt: at, to, manual } });
  }
}

function addMailLog(state, entries) {
  state.mailLog = (state.mailLog || []).concat(entries).slice(-500);
}

// Applica l'esito di una stampa riuscita: numerazione, quota, flag "stampata".
function commitPrint(state, receipts, nextReceipt, now = new Date()) {
  for (const r of receipts) {
    const m = state.memberships[r.key];
    if (!m) continue;
    m.printed = true;
    m.printedAt = now.toISOString();
    m.receiptNo = r.no;
    m.receiptLabel = r.label;
    m.quota = r.quota || '';
    m.paymentMethod = validPayment(r.method) ? (r.method || '') : '';
    m.receiptDate = r.date || '';
  }
  if (Number.isFinite(nextReceipt)) state.settings.nextReceipt = nextReceipt;
}

function saveSettings(state, settings) {
  const s = normalizeState({ settings }).settings;
  s.nextReceipt = Math.max(1, parseInt(s.nextReceipt, 10) || 1);
  s.receiptDigits = Math.min(10, Math.max(1, parseInt(s.receiptDigits, 10) || 4));
  s.soonDays = Math.max(1, parseInt(s.soonDays, 10) || 30);
  s.warnDays = Math.max(s.soonDays + 1, parseInt(s.warnDays, 10) || 90);
  if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
  if (!validPayment(s.defaultPayment)) s.defaultPayment = '';
  const m = s.mail;
  if (!['gmail', 'outlook', 'altro'].includes(m.provider)) m.provider = 'gmail';
  m.user = String(m.user || '').trim().toLowerCase();
  m.replyTo = String(m.replyTo || '').trim();
  m.fromName = String(m.fromName || '').trim();
  m.host = String(m.host || '').trim();
  m.port = Math.min(65535, Math.max(1, parseInt(m.port, 10) || 587));
  m.secure = !!m.secure;
  m.daysBefore = Math.min(120, Math.max(1, parseInt(m.daysBefore, 10) || 30));
  if (!String(m.subject || '').trim()) m.subject = DEFAULT_SUBJECT;
  if (!String(m.body || '').trim()) m.body = DEFAULT_BODY;
  state.settings = s;
}

module.exports = { markReminded, addMailLog, PAYMENT_METHODS, DEFAULT_SETTINGS, emptyState, normalizeState, importRecords, updateMemberships, updatePerson, commitPrint, saveSettings, mKey };
