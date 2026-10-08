'use strict';
// Copie di sicurezza con firma di integrità (SHA-256) e controllo strutturale.
const crypto = require('crypto');

const FORMAT = 'tesserati-backup';
const FORMAT_VERSION = 1;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const validIso = (s) => ISO.test(s) && !isNaN(new Date(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const counts = (state) => ({ persons: Object.keys(state.persons || {}).length, memberships: Object.keys(state.memberships || {}).length });

function makeBackup(state, appVersion, now = new Date()) {
  const data = JSON.parse(JSON.stringify(state));
  return { format: FORMAT, formatVersion: FORMAT_VERSION, appVersion, createdAt: now.toISOString(), counts: counts(data), sha256: sha256(JSON.stringify(data)), data };
}

// Controllo di coerenza dei dati: usato sia sul ripristino sia dopo il salvataggio.
function checkStructure(data) {
  const errors = [];
  const add = (m) => { if (errors.length < 25) errors.push(m); };
  if (!data || typeof data !== 'object') return ['Contenuto dei dati non valido.'];
  if (!data.persons || typeof data.persons !== 'object') add('Mancano le anagrafiche dei tesserati.');
  if (!data.memberships || typeof data.memberships !== 'object') add('Mancano le tessere.');
  if (errors.length) return errors;
  for (const [id, p] of Object.entries(data.persons)) {
    if (!p || p.id !== id) add(`Anagrafica ${id}: ID incoerente.`);
    else if (typeof p.nome !== 'string' || typeof p.cognome !== 'string') add(`Anagrafica ${id}: nome o cognome non validi.`);
  }
  for (const [key, m] of Object.entries(data.memberships)) {
    if (!m || typeof m !== 'object') { add(`Tessera ${key}: non valida.`); continue; }
    if (key !== `${m.personId}_${m.iscrizione}`) add(`Tessera ${key}: chiave incoerente con i dati.`);
    if (!data.persons[m.personId]) add(`Tessera ${key}: manca l'anagrafica del tesserato ${m.personId}.`);
    if (!validIso(m.iscrizione) || !validIso(m.scadenza)) add(`Tessera ${key}: date non valide.`);
    else if (m.scadenza < m.iscrizione) add(`Tessera ${key}: scadenza precedente all'iscrizione.`);
    if (typeof m.printed !== 'boolean') add(`Tessera ${key}: stato di stampa non valido.`);
    if (m.paymentMethod != null && !['', 'Contanti', 'POS', 'Bonifico'].includes(m.paymentMethod)) add(`Tessera ${key}: metodo di pagamento non valido.`);
    if (m.printed && m.receiptNo != null && !Number.isInteger(m.receiptNo)) add(`Tessera ${key}: numero ricevuta non valido.`);
  }
  for (const [id, p] of Object.entries(data.persons)) if (p && p.professione != null && typeof p.professione !== 'string') add(`Anagrafica ${id}: professione non valida.`);
  for (const [id, p] of Object.entries(data.persons)) if (p && p.noEmail != null && typeof p.noEmail !== 'boolean') add(`Anagrafica ${id}: esclusione email non valida.`);
  for (const [key, m] of Object.entries(data.memberships)) {
    const r = m && m.reminders;
    if (r == null) continue;
    if (typeof r !== 'object' || (r.pre && (typeof r.pre.sentAt !== 'string' || isNaN(new Date(r.pre.sentAt))))) add(`Tessera ${key}: dati dell'avviso email non validi.`);
  }
  if (data.mailLog != null && !Array.isArray(data.mailLog)) add('Registro degli invii email non valido.');
  if (data.trash != null) {
    if (typeof data.trash !== 'object' || Array.isArray(data.trash)) add('Cestino non valido.');
    else for (const [id, t] of Object.entries(data.trash)) {
      if (!t || !t.person || t.person.id !== id || !Array.isArray(t.memberships)) add(`Cestino ${id}: voce non valida.`);
      else if (data.persons[id]) add(`Cestino ${id}: il tesserato esiste anche tra quelli attivi.`);
    }
  }
  if (data.receipts != null) {
    if (!Array.isArray(data.receipts)) add('Registro delle ricevute non valido.');
    else data.receipts.forEach((r, i) => {
      if (!r || !Number.isInteger(r.no) || !['annuale', 'mensile'].includes(r.tipo)) add(`Registro ricevute, voce ${i + 1}: non valida.`);
      else if (r.tipo === 'mensile' && r.periodo && !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.periodo)) add(`Registro ricevute, voce ${i + 1}: mese non valido.`);
    });
  }
  for (const [id, p] of Object.entries(data.persons)) if (p && p.overrides != null && (typeof p.overrides !== 'object' || Array.isArray(p.overrides))) add(`Anagrafica ${id}: modifiche manuali non valide.`);
  const s = data.settings;
  if (s && s.nextReceipt != null && !(Number.isInteger(Number(s.nextReceipt)) && Number(s.nextReceipt) >= 1)) add('Il prossimo numero di ricevuta non è valido.');
  return errors;
}

// Ritorna { ok, errors, signed, summary, state }.
function verifyBackup(obj) {
  const res = { ok: false, errors: [], signed: false, summary: null, state: null };
  if (!obj || typeof obj !== 'object') { res.errors.push('Il file non contiene dati leggibili.'); return res; }
  let data;
  if (obj.format === FORMAT) {
    res.signed = true;
    if (obj.formatVersion > FORMAT_VERSION) res.errors.push('La copia è stata creata da una versione più recente di Tesserati: aggiorna l\'app.');
    if (!obj.data || typeof obj.sha256 !== 'string') res.errors.push('Intestazione della copia incompleta.');
    else if (sha256(JSON.stringify(obj.data)) !== obj.sha256) res.errors.push('Firma di integrità non corrispondente: il file è stato modificato o è danneggiato.');
    data = obj.data;
  } else if (obj.persons && obj.memberships) {
    data = obj; // copia senza firma (formato semplice)
  } else {
    res.errors.push('Il file non è una copia dei dati di Tesserati.');
    return res;
  }
  if (data) {
    res.errors.push(...checkStructure(data));
    if (res.signed && obj.counts) {
      const c = counts(data);
      if (obj.counts.persons !== c.persons || obj.counts.memberships !== c.memberships) res.errors.push('I conteggi dichiarati non corrispondono ai dati contenuti.');
    }
  }
  res.ok = res.errors.length === 0;
  if (data && data.persons && data.memberships) {
    const c = counts(data);
    const printed = Object.values(data.memberships).filter((m) => m && m.printed).length;
    res.summary = { createdAt: obj.createdAt || null, appVersion: obj.appVersion || null, persons: c.persons, memberships: c.memberships, printed, toPrint: c.memberships - printed };
  }
  if (res.ok) res.state = data;
  return res;
}

module.exports = { FORMAT, makeBackup, verifyBackup, checkStructure, sha256 };
