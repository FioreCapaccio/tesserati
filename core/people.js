'use strict';
// Inserimento, modifica ed eliminazione manuale dei tesserati (senza dipendenze da Electron).

const { smartCase } = require('./csv');
const { isEmail } = require('./reminders');
const { mKey } = require('./store');

const FIELDS = ['nome', 'cognome', 'nascita', 'provNascita', 'cf', 'email', 'cell', 'indirizzo', 'citta'];
const STATI = ['Attivo', 'Sospeso'];
const sq = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const validIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Come Younity: la tessera dura un anno, fino al giorno prima.
function addYear(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function cleanPerson(input) {
  return {
    nome: smartCase(input.nome), cognome: smartCase(input.cognome),
    nascita: sq(input.nascita),
    provNascita: sq(input.provNascita).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4),
    cf: sq(input.cf).toUpperCase().replace(/\s/g, ''),
    email: sq(input.email).toLowerCase(),
    cell: sq(input.cell).replace(/[^\d+]/g, ''),
    indirizzo: sq(input.indirizzo), citta: smartCase(input.citta),
    professione: sq(input.professione).slice(0, 120),
  };
}

// Controlla solo i campi cambiati: un dato "strano" arrivato dal CSV non deve bloccare altre modifiche.
function checkPerson(c, current, today) {
  const errors = [];
  const changed = (f) => !current || current[f] !== c[f];
  if (!c.nome) errors.push('Il nome è obbligatorio.');
  if (!c.cognome) errors.push('Il cognome è obbligatorio.');
  if (c.nascita && changed('nascita')) {
    if (!validIso(c.nascita)) errors.push('La data di nascita non è valida.');
    else if (c.nascita > today) errors.push('La data di nascita è nel futuro.');
  }
  if (c.email && changed('email') && !isEmail(c.email)) errors.push('L’indirizzo email non è valido.');
  if (c.cf && changed('cf') && !/^[A-Z0-9]{16}$/.test(c.cf)) errors.push('Il codice fiscale deve avere 16 caratteri (lettere e numeri).');
  return errors;
}

function checkTessera(t, current) {
  const errors = [];
  const isc = sq(t.iscrizione), sca = sq(t.scadenza), stato = sq(t.stato);
  if (!validIso(isc)) errors.push('La data di iscrizione non è valida.');
  if (!validIso(sca)) errors.push('La data di scadenza non è valida.');
  if (validIso(isc) && validIso(sca) && sca < isc) errors.push('La scadenza non può essere precedente all’iscrizione.');
  if (!STATI.includes(stato) && !(current && current.stato === stato)) errors.push('Lo stato deve essere Attivo o Sospeso.');
  return errors;
}

function findDuplicates(state, c, exceptId) {
  const out = [];
  for (const p of [...Object.values(state.persons), ...Object.values(state.trash || {}).map((t) => t.person)]) {
    if (p.id === exceptId) continue;
    const sameCf = c.cf && p.cf && c.cf === p.cf;
    const sameName = c.nascita && p.nascita === c.nascita && p.nome.toLowerCase() === c.nome.toLowerCase() && p.cognome.toLowerCase() === c.cognome.toLowerCase();
    if (sameCf || sameName) out.push({ id: p.id, nome: `${p.cognome} ${p.nome}`.trim(), motivo: sameCf ? 'stesso codice fiscale' : 'stesso nome e data di nascita', nelCestino: !state.persons[p.id] });
  }
  return out;
}

// Gli ID dei tesserati inseriti a mano sono M001, M002…: non possono scontrarsi con quelli numerici di Younity.
function nextManualId(state) {
  let max = 0;
  for (const id of [...Object.keys(state.persons), ...Object.keys(state.trash || {})]) { const m = /^M(\d+)$/.exec(id); if (m) max = Math.max(max, Number(m[1])); }
  return 'M' + String(max + 1).padStart(3, '0');
}

// input: campi anagrafici + iscrizione, scadenza, stato. Ritorna { personId, key } oppure { duplicates } se serve conferma.
function createPerson(state, input, { force = false, now = new Date(), today = localToday() } = {}) {
  const c = cleanPerson(input);
  const iscrizione = sq(input.iscrizione) || today;
  const t = { iscrizione, scadenza: sq(input.scadenza) || (validIso(iscrizione) ? addYear(iscrizione) : ''), stato: sq(input.stato) || 'Attivo' };
  const errors = [...checkPerson(c, null, today), ...checkTessera(t, null)];
  if (errors.length) throw new Error(errors.join(' '));
  const duplicates = findDuplicates(state, c);
  if (duplicates.length && !force) return { duplicates };
  const id = nextManualId(state), stamp = now.toISOString(), key = mKey(id, t.iscrizione);
  const { professione, ...anagrafica } = c;
  state.persons[id] = Object.assign({ id, addedAt: stamp, note: '', professione, manual: true }, anagrafica);
  state.memberships[key] = {
    key, personId: id, iscrizione: t.iscrizione, iscrizioneOra: '', scadenza: t.scadenza, stato: t.stato,
    printed: false, printedAt: null, receiptNo: null, receiptLabel: '', quota: '', paymentMethod: '', hidden: false, addedAt: stamp, manual: true,
  };
  return { personId: id, key };
}

// Modifica anagrafica e una tessera. Per i dati arrivati dal CSV si ricorda cosa è stato cambiato a mano:
// la lettura successiva del file non lo sovrascrive. L'iscrizione (parte della chiave) si cambia solo sulle tessere manuali.
function editPerson(state, personId, input, key, { today = localToday() } = {}) {
  const p = state.persons[personId];
  const m = state.memberships[key];
  if (!p || !m || m.personId !== personId) throw new Error('Tesserato non trovato.');
  const c = cleanPerson(input);
  const t = { iscrizione: m.manual && input.iscrizione ? sq(input.iscrizione) : m.iscrizione, scadenza: sq(input.scadenza) || m.scadenza, stato: sq(input.stato) || m.stato };
  const errors = [...checkPerson(c, p, today), ...checkTessera(t, m)];
  if (errors.length) throw new Error(errors.join(' '));
  const changed = [];
  for (const f of FIELDS) {
    if (p[f] === c[f]) continue;
    p[f] = c[f]; changed.push(f);
    if (!p.manual) p.overrides = Object.assign({}, p.overrides, { [f]: true });
  }
  if ((p.professione || '') !== c.professione) { p.professione = c.professione; changed.push('professione'); }
  for (const f of ['scadenza', 'stato']) {
    if (m[f] === t[f]) continue;
    m[f] = t[f]; changed.push(f);
    if (!m.manual) m.overrides = Object.assign({}, m.overrides, { [f]: true });
  }
  let newKey = key;
  if (m.manual && t.iscrizione !== m.iscrizione) {
    newKey = mKey(personId, t.iscrizione);
    if (state.memberships[newKey]) throw new Error('Esiste già una tessera di questo tesserato con la stessa data di iscrizione.');
    m.iscrizione = t.iscrizione; m.key = newKey;
    state.memberships[newKey] = m; delete state.memberships[key];
    for (const r of state.receipts || []) if (r.key === key) r.key = newKey;
    changed.push('iscrizione');
  }
  return { changed, key: newKey };
}

// Le modifiche manuali tornano ai valori del CSV alla prossima lettura del file.
function resetOverrides(state, personId) {
  const p = state.persons[personId];
  if (!p) return;
  delete p.overrides;
  for (const m of Object.values(state.memberships)) if (m.personId === personId) delete m.overrides;
}

// Eliminazione "morbida": il tesserato va nel cestino e la lettura del CSV non lo fa tornare.
function deletePerson(state, personId, { now = new Date() } = {}) {
  const p = state.persons[personId];
  if (!p) throw new Error('Tesserato non trovato.');
  const memberships = Object.values(state.memberships).filter((m) => m.personId === personId);
  state.trash[personId] = { person: p, memberships, deletedAt: now.toISOString() };
  delete state.persons[personId];
  for (const m of memberships) delete state.memberships[m.key];
  return { tessere: memberships.length };
}

function restorePerson(state, personId) {
  const t = state.trash[personId];
  if (!t) throw new Error('Non è nel cestino.');
  if (state.persons[personId]) throw new Error('Esiste già un tesserato con questo ID.');
  state.persons[personId] = t.person;
  for (const m of t.memberships) state.memberships[m.key] = m;
  delete state.trash[personId];
}

function purgeTrash(state, personId) {
  if (personId) delete state.trash[personId]; else state.trash = {};
}

module.exports = { addYear, cleanPerson, checkPerson, checkTessera, findDuplicates, nextManualId, createPerson, editPerson, resetOverrides, deletePerson, restorePerson, purgeTrash };
