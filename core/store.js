'use strict';
// Logica dei dati (senza dipendenze da Electron): importazione, aggiornamenti, stampa.

const DEFAULT_SETTINGS = {
  assoc: { nome: '', indirizzo: '', cf: '', telefono: '', email: '', logo: '', nota: '' },
  nextReceipt: 1,
  receiptPrefix: '',
  receiptDigits: 4,
  defaultQuota: '',
  soonDays: 30,
  warnDays: 90,
  csvPath: '',
  theme: 'system', // 'system' | 'light' | 'dark'
};

function emptyState() {
  return { version: 1, settings: structuredClone(DEFAULT_SETTINGS), persons: {}, memberships: {}, imports: [] };
}

function normalizeState(s) {
  const base = emptyState();
  const out = Object.assign(base, s || {});
  out.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), (s && s.settings) || {});
  out.settings.assoc = Object.assign({}, DEFAULT_SETTINGS.assoc, (s && s.settings && s.settings.assoc) || {});
  out.persons = out.persons || {};
  out.memberships = out.memberships || {};
  out.imports = out.imports || [];
  return out;
}

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
        printed: firstImport, printedAt: null, receiptNo: null, receiptLabel: '', quota: '',
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
  const allowed = ['printed', 'quota', 'hidden'];
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
  if (p && 'note' in patch) p.note = String(patch.note || '');
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
  state.settings = s;
}

module.exports = { DEFAULT_SETTINGS, emptyState, normalizeState, importRecords, updateMemberships, updatePerson, commitPrint, saveSettings, mKey };
