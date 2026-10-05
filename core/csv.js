'use strict';
// Lettura del CSV esportato da Younity e normalizzazione dei campi.

function decodeBuffer(buf) {
  let b = buf;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch (_) {
    return new TextDecoder('windows-1252').decode(b);
  }
}

function detectDelimiter(text) {
  const head = text.slice(0, 2000);
  const commas = (head.match(/,/g) || []).length;
  const semis = (head.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
}

// Parser RFC 4180: gestisce virgolette, doppie virgolette e a-capo dentro i campi.
function parseCsv(text, delim = detectDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const squash = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s'’\-.])([a-zàèéìòù])/g, (m, p, ch) => p + ch.toUpperCase());
}
// Maiuscole sistemate solo se il testo è tutto minuscolo o tutto maiuscolo.
function smartCase(s) {
  s = squash(s);
  if (s && (s === s.toLowerCase() || s === s.toUpperCase())) return titleCase(s);
  return s;
}

// "dd/mm/yyyy[ hh:mm:ss]" -> { iso: "yyyy-mm-dd", time: "hh:mm:ss" }
function parseDate(s) {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/.exec(String(s || ''));
  if (!m) return null;
  const [, d, mo, y, t] = m;
  const iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  if (isNaN(dt) || dt.getUTCMonth() + 1 !== Number(mo)) return null;
  return { iso, time: t || '' };
}

const HEADER_MAP = {
  id: 'id', nome: 'nome', cognome: 'cognome',
  'data di nascita': 'nascita', 'data scadenza': 'scadenza',
  'provincia nascita': 'provNascita', 'codice fiscale': 'cf', email: 'email',
  'data iscrizione': 'iscrizione', stato: 'stato', cellulare: 'cell',
  'indirizzo di residenza': 'indirizzo', 'città': 'citta', citta: 'citta',
};

// Ritorna { records, warnings, totalRows }.
function readMembers(buf) {
  const text = typeof buf === 'string' ? buf : decodeBuffer(buf);
  const rows = parseCsv(text);
  const hIdx = rows.findIndex((r) => squash(r[0]).toLowerCase() === 'id');
  if (hIdx < 0) throw new Error('Intestazione non trovata: il file non sembra un export dei tesserati (manca la colonna "ID").');
  const cols = {};
  rows[hIdx].forEach((h, i) => {
    const k = HEADER_MAP[squash(h).toLowerCase()];
    if (k && !(k in cols)) cols[k] = i;
  });
  for (const need of ['id', 'nome', 'cognome', 'scadenza', 'iscrizione']) {
    if (!(need in cols)) throw new Error(`Colonna obbligatoria mancante nel file: ${need}`);
  }
  const get = (r, k) => (k in cols ? r[cols[k]] : '');
  const warnings = [];
  const records = [];
  rows.slice(hIdx + 1).forEach((r, n) => {
    const id = squash(get(r, 'id'));
    const line = hIdx + 2 + n;
    if (!id) { warnings.push(`Riga ${line}: ID mancante, ignorata.`); return; }
    const isc = parseDate(get(r, 'iscrizione'));
    const sca = parseDate(get(r, 'scadenza'));
    if (!isc || !sca) { warnings.push(`Riga ${line} (ID ${id}): date non valide, ignorata.`); return; }
    const nasc = parseDate(get(r, 'nascita'));
    let prov = squash(get(r, 'provNascita'));
    if (/^null$/i.test(prov)) prov = '';
    const stato = squash(get(r, 'stato'));
    records.push({
      id,
      nome: smartCase(get(r, 'nome')),
      cognome: smartCase(get(r, 'cognome')),
      nascita: nasc ? nasc.iso : '',
      provNascita: prov.toUpperCase(),
      cf: squash(get(r, 'cf')).toUpperCase().replace(/\s/g, ''),
      email: squash(get(r, 'email')).toLowerCase(),
      cell: squash(get(r, 'cell')).replace(/[^\d+]/g, ''),
      indirizzo: squash(get(r, 'indirizzo')),
      citta: smartCase(get(r, 'citta')),
      iscrizione: isc.iso,
      iscrizioneOra: isc.time,
      scadenza: sca.iso,
      stato: stato ? stato[0].toUpperCase() + stato.slice(1).toLowerCase() : 'Attivo',
    });
  });
  return { records, warnings, totalRows: rows.length - hIdx - 1 };
}

// Nella cartella indicata, il file Younity*.csv modificato più di recente (es. "Younity (1).csv").
function newestMatching(dir) {
  const fs = require('fs');
  const path = require('path');
  try {
    const list = fs.readdirSync(dir).filter((n) => /^younity.*\.csv$/i.test(n))
      .map((n) => ({ n, t: fs.statSync(path.join(dir, n)).mtimeMs })).sort((a, b) => b.t - a.t);
    return list[0] ? path.join(dir, list[0].n) : null;
  } catch (_) { return null; }
}

module.exports = { newestMatching, decodeBuffer, parseCsv, parseDate, smartCase, readMembers };
