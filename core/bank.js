'use strict';
// Estratto conto: lettura dei movimenti, abbinamento dei bonifici ai tesserati, effetti della conferma.

const crypto = require('crypto');
const Corsi = require('./corsi');
const { latestByPerson } = require('./reminders');

const pad = (n) => String(n).padStart(2, '0');
const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// "1.000,00" / "-12,5" / 375 -> numero; altro -> null
function money(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v == null ? '' : v).replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
const MONEY = /^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/;

function isoDate(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 25000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10); // numero seriale di Excel
  const s = String(v == null ? '' : v).trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})/.exec(s);
  if (m) { const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]); return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// ---------------------------------------------------------------- PDF
// pages: [[{ s, x, y, w }]] (frammenti di testo con coordinate, come li dà pdfjs). Le colonne si riconoscono dalle intestazioni
// DATA | VALUTA | MOV.DARE | MOV.AVERE | DESCRIZIONE. La riga con data e importi sta in mezzo alle righe della descrizione:
// ogni frammento va alla data più vicina in verticale.
function parsePdfTokens(pages) {
  const movements = [];
  let saldoIniziale = null, saldoFinale = null;
  for (const toks of pages) {
    const find = (re) => toks.find((t) => re.test(t.s.trim()));
    const hData = find(/^DATA$/), hVal = find(/^VALUTA$/), hDare = find(/^MOV\.DARE$/), hAvere = find(/^MOV\.AVERE$/), hDesc = find(/^DESCRIZIONE/);
    if (!hData || !hDare || !hAvere || !hDesc) continue;
    const boundary = (hDare.x + hDare.w / 2 + hAvere.x + hAvere.w / 2) / 2;
    const body = toks.filter((t) => t.y < hData.y - 1 && t.s.trim());
    const nearCol = (t, h) => Math.abs(t.x - h.x) < 22;
    const anchors = body.filter((t) => /^\d{2}\/\d{2}\/\d{2,4}$/.test(t.s.trim()) && nearCol(t, hData)).sort((a, b) => b.y - a.y);
    if (!anchors.length) continue;
    const mv = anchors.map((a) => ({ date: isoDate(a.s.trim()), valuta: null, dare: null, avere: null, parts: [], y: a.y }));
    const nearest = (y) => { let best = 0; anchors.forEach((a, i) => { if (Math.abs(a.y - y) < Math.abs(anchors[best].y - y)) best = i; }); return best; };
    for (const t of body) {
      const s = t.s.trim();
      if (anchors.includes(t)) continue;
      const i = nearest(t.y);
      if (hVal && nearCol(t, hVal) && (/^\d{2}\/\d{2}\/\d{2,4}$/.test(s) || /^\*+$/.test(s))) { mv[i].valuta = /^\*+$/.test(s) ? null : isoDate(s); continue; }
      if (t.x >= hDesc.x - 3) { mv[i].parts.push(t); continue; }
      if (MONEY.test(s) && t.x >= hDare.x - 25) { const v = money(s); if (t.x + t.w / 2 < boundary) mv[i].dare = v; else mv[i].avere = v; }
    }
    for (const m of mv) {
      const descr = m.parts.sort((a, b) => b.y - a.y || a.x - b.x).map((p) => p.s.trim()).join(' ').replace(/\s+/g, ' ');
      const bal = m.avere != null ? m.avere : m.dare;
      if (/^SALDO INIZIALE/i.test(descr)) { saldoIniziale = bal; continue; }
      if (/^SALDO FINALE/i.test(descr)) { saldoFinale = bal; continue; }
      movements.push({ date: m.date, valuta: m.valuta, dare: m.dare, avere: m.avere, descr });
    }
  }
  return { kind: 'pdf', movements, saldoIniziale, saldoFinale };
}

// Se il file riporta saldo iniziale e finale, la somma dei movimenti deve quadrare.
function reconcile(parsed) {
  const { movements, saldoIniziale, saldoFinale } = parsed;
  if (saldoIniziale == null || saldoFinale == null) return null;
  const avere = movements.reduce((s, m) => s + (m.avere || 0), 0), dare = movements.reduce((s, m) => s + (m.dare || 0), 0);
  const calcolato = Math.round((saldoIniziale + avere - dare) * 100) / 100;
  return { ok: Math.abs(calcolato - saldoFinale) < 0.005, saldoIniziale, saldoFinale, entrate: Math.round(avere * 100) / 100, uscite: Math.round(dare * 100) / 100, differenza: Math.round((saldoFinale - calcolato) * 100) / 100 };
}

// ---------------------------------------------------------------- Excel / CSV
const ROLES = {
  data: /^data( contabile| operazione| registrazione| movimento)?$/,
  valuta: /valuta/,
  dare: /^(mov )?(dare|uscite|uscita|addebiti|addebito)$|dare/,
  avere: /^(mov )?(avere|entrate|entrata|accrediti|accredito)$|avere/,
  importo: /^(importo|valore|ammontare)( .*)?$/,
  descr: /descrizione|causale|dettagli|dettaglio|operazione$|movimento$|^note$/,
};

// rows: righe di celle. mapping facoltativo: { data, valuta, dare, avere, importo, descr } = indici di colonna.
function parseTable(rows, mapping) {
  let h = -1, map = mapping || null;
  if (!map) {
    for (let i = 0; i < Math.min(rows.length, 60) && h < 0; i++) {
      const cells = rows[i].map((c) => fold(c));
      const m = {};
      for (const [role, re] of Object.entries(ROLES)) { const idx = cells.findIndex((c, k) => c && re.test(c) && !Object.values(m).includes(k)); if (idx >= 0) m[role] = idx; }
      if (m.data != null && m.descr != null && (m.avere != null || m.importo != null)) { h = i; map = m; }
    }
    if (!map) {
      const hi = rows.findIndex((r) => r.filter((c) => c !== null && c !== '').length >= 3);
      return { needMapping: true, headerRow: hi, headers: hi >= 0 ? rows[hi].map((c) => String(c == null ? '' : c)) : [] };
    }
  } else {
    h = Number.isInteger(map.headerRow) ? map.headerRow : 0;
  }
  const movements = [];
  for (const r of rows.slice(h + 1)) {
    const date = isoDate(r[map.data]);
    if (!date) continue;
    let dare = map.dare != null ? money(r[map.dare]) : null, avere = map.avere != null ? money(r[map.avere]) : null;
    if (map.importo != null && dare == null && avere == null) { const v = money(r[map.importo]); if (v != null) { if (v >= 0) avere = v; else dare = -v; } }
    if (dare != null && dare < 0 && avere == null) { avere = -dare; dare = null; }   // alcune banche scrivono le uscite con il segno nella colonna "dare"
    if (!dare && !avere) continue;
    movements.push({ date, valuta: map.valuta != null ? isoDate(r[map.valuta]) : null, dare: dare || null, avere: avere || null, descr: String(r[map.descr] == null ? '' : r[map.descr]).replace(/\s+/g, ' ').trim() });
  }
  return { kind: 'tabella', movements, saldoIniziale: null, saldoFinale: null, mapping: map };
}

// ---------------------------------------------------------------- abbinamento
const isBonifico = (d) => /^\s*bonifico/i.test(d) || (/bonifico|accredito|giroconto/i.test(d) && !/incasso|incassi|\bpos\b|pagobancomat|commission|sdd|imposta/i.test(d));

// Toglie il prefisso della banca e l'ora dei bonifici istantanei, per mostrare e confrontare solo ordinante e causale.
function cleanDescr(d) {
  return String(d).replace(/^\s*bonifico\s+(?:tramite\s+internet\s+banking\s+)?(?:a\s+vs\s+favore|a\s+favore\s+di|da)\s*\*?\s*/i, '').replace(/^\s*(?:INST\s+\d{1,2}:\d{2}\s*)/i, '').replace(/\s*ID\.BON:\S+/i, '').trim();
}
// L'ordinante sono le prime due parole: serve a ricordare "questo nome paga per quel tesserato".
const payerKey = (d) => fold(cleanDescr(d)).split(' ').slice(0, 2).join(' ');

function hashOf(mv, n) {
  return crypto.createHash('sha1').update([mv.date, mv.avere, fold(mv.descr), n].join('|')).digest('hex').slice(0, 16);
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
// Il mese scritto nella causale si riferisce all'occorrenza più recente non oltre 60 giorni dopo il bonifico.
function nearestMonth(m, dateIso) {
  const limit = new Date(dateIso + 'T00:00:00Z'); limit.setUTCDate(limit.getUTCDate() + 60);
  const y0 = Number(dateIso.slice(0, 4));
  const cands = [y0 + 1, y0, y0 - 1].map((y) => `${y}-${pad(m)}`);
  return cands.find((ym) => new Date(ym + '-01T00:00:00Z') <= limit) || cands[cands.length - 1];
}

const targetKey = (t) => (t.kind === 'tessera' ? 'tessera' : t.kind === 'iscrizione' ? `iscrizione:${t.season}` : `rata:${t.ym}`);
function parseTargetKey(k) {
  if (k === 'tessera') return { kind: 'tessera' };
  const [kind, v] = String(k).split(':');
  if (kind === 'iscrizione' && /^\d{4}$/.test(v)) return { kind, season: Number(v) };
  if (kind === 'rata' && /^\d{4}-\d{2}$/.test(v)) { const season = Corsi.seasonOfPeriod(v); return season == null ? null : { kind, ym: v, season }; }
  return null;
}

function suggestTarget(state, p, mv) {
  const text = fold(mv.descr), importo = mv.avere, s = state.settings;
  const eq = (a, b) => { const x = money(b); return x != null && Math.abs(x - a) < 0.005; };
  const reasons = [];
  let t = null;
  const mi = MESI.findIndex((m) => new RegExp(`\\b${m}\\b`).test(text));
  if (mi >= 0 && (p.corsista || /\brat[ae]\b/.test(text))) {
    const ym = nearestMonth(mi + 1, mv.date), season = Corsi.seasonOfPeriod(ym);
    if (season != null) { t = { kind: 'rata', ym, season }; reasons.push(`mese “${MESI[mi]}” nella causale`); }
  }
  if (!t && p.corsista && /iscrizion/.test(text) && /corso|corsi|stagione/.test(text)) { t = { kind: 'iscrizione', season: Corsi.seasonOfDate(mv.date) }; reasons.push('“iscrizione al corso” nella causale'); }
  if (!t && /tessera|tesserament|associativ|socio/.test(text)) { t = { kind: 'tessera' }; reasons.push('“tessera/associativa” nella causale'); }
  const unpaid = () => Corsi.items(state, Corsi.seasonOfDate(mv.date), mv.date).filter((i) => i.personId === p.id && i.status === 'dovuto');
  if (!t && p.corsista && eq(importo, s.defaultIscrizioneCorso) && unpaid().some((i) => i.slot === 'iscrizione')) { t = { kind: 'iscrizione', season: Corsi.seasonOfDate(mv.date) }; reasons.push('importo = iscrizione al corso predefinita'); }
  if (!t && p.corsista && eq(importo, s.defaultRetta)) { const u = unpaid().find((i) => i.slot !== 'iscrizione'); if (u) { t = { kind: 'rata', ym: u.slot, season: Corsi.seasonOfDate(mv.date) }; reasons.push('importo = rata predefinita'); } }
  if (!t && eq(importo, s.defaultQuota)) { t = { kind: 'tessera' }; reasons.push('importo = quota tessera predefinita'); }
  const sure = !!t;
  if (!t && p.corsista) { const u = unpaid()[0]; if (u) t = u.slot === 'iscrizione' ? { kind: 'iscrizione', season: Corsi.seasonOfDate(mv.date) } : { kind: 'rata', ym: u.slot, season: Corsi.seasonOfDate(mv.date) }; }
  if (!t) t = { kind: 'tessera' };
  const expected = t.kind === 'tessera' ? s.defaultQuota : t.kind === 'iscrizione' ? s.defaultIscrizioneCorso : s.defaultRetta;
  const warn = [];
  const ex = money(expected);
  if (ex != null && Math.abs(ex - importo) > 0.005) warn.push(`Importo diverso da quello predefinito (${expected} €)${importo > ex && Math.abs(importo / ex - Math.round(importo / ex)) < 0.005 ? ': forse più voci insieme' : ''}.`);
  return { target: t, reasons, sure, warn };
}

// Per ogni entrata che sembra un bonifico: candidati, voce suggerita, fiducia.
function analyze(state, parsed, { all = false } = {}) {
  const bank = state.bank || {}, aliases = state.bankAliases || {};
  const seen = {};
  const people = Object.values(state.persons).map((p) => ({ p, cog: fold(p.cognome).split(' ').filter(Boolean), nom: fold(p.nome).split(' ').filter(Boolean) }));
  const out = [];
  let registrati = 0, scartati = 0;
  for (const mv of parsed.movements) {
    if (!(mv.avere > 0) || !mv.date) continue;
    if (!all && !isBonifico(mv.descr)) { scartati++; continue; }
    const k = `${mv.date}|${mv.avere}|${fold(mv.descr)}`;
    seen[k] = (seen[k] || 0) + 1;
    const hash = hashOf(mv, seen[k]);
    if (bank[hash]) { registrati++; continue; }
    const cleaned = cleanDescr(mv.descr), tokens = new Set(fold(cleaned).split(' ')), pk = payerKey(mv.descr);
    const cand = [];
    for (const id of aliases[pk] || []) if (state.persons[id]) cand.push({ personId: id, how: 'alias' });
    const full = people.filter(({ cog, nom }) => cog.length && nom.length && cog.join('').length >= 3 && cog.every((t) => tokens.has(t)) && tokens.has(nom[0]));
    const payerIsName = (x) => pk === `${x.cog.join(' ')} ${x.nom[0]}`.split(' ').slice(0, 2).join(' ') || pk === `${x.nom[0]} ${x.cog.join(' ')}`.split(' ').slice(0, 2).join(' ');
    for (const x of full.sort((a, b) => payerIsName(a) - payerIsName(b))) if (!cand.some((c) => c.personId === x.p.id)) cand.push({ personId: x.p.id, how: 'nome' });
    if (!cand.length) for (const x of people.filter(({ cog }) => cog.length && cog.join('').length >= 4 && cog.every((t) => tokens.has(t))).slice(0, 5)) cand.push({ personId: x.p.id, how: 'cognome' });
    const first = cand[0] ? state.persons[cand[0].personId] : null;
    const sg = first ? suggestTarget(state, first, mv) : null;
    const confidence = !first ? 'bassa' : cand.length === 1 && cand[0].how !== 'cognome' && sg.sure ? 'alta' : cand[0].how === 'cognome' || cand.length > 1 ? 'bassa' : 'media';
    out.push({
      hash, date: mv.date, valuta: mv.valuta, importo: mv.avere, descr: cleaned, payerKey: pk,
      candidates: cand.map((c) => ({ ...c, nome: `${state.persons[c.personId].cognome} ${state.persons[c.personId].nome}`.trim() })),
      personId: first ? first.id : null, target: sg ? sg.target : null, reasons: sg ? sg.reasons : [], warn: sg ? sg.warn : [], confidence,
    });
  }
  const dates = parsed.movements.map((m) => m.date).filter(Boolean).sort();
  return { proposals: out, registrati, scartati, movimenti: parsed.movements.length, periodo: dates.length ? { da: dates[0], a: dates[dates.length - 1] } : null, quadratura: reconcile(parsed) };
}

// ---------------------------------------------------------------- conferma
const shortDescr = (d) => String(d).slice(0, 140);
const money2 = (n) => (Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(2).replace('.', ','));

// items: [{ hash, date, valuta, importo, descr, payerKey, personId, targetKey }]. Ritorna { done, errors, rows } con le righe pronte per la stampa.
function applyBank(state, items, now = new Date()) {
  state.bank = state.bank || {}; state.bankAliases = state.bankAliases || {};
  const done = [], errors = [], rows = [], diventati = [];
  const latest = latestByPerson(state);
  for (const it of items) {
    const p = state.persons[it.personId], t = parseTargetKey(it.targetKey);
    const who = p ? `${p.cognome} ${p.nome}`.trim() : it.personId;
    if (!p) { errors.push(`${it.date}: tesserato non trovato.`); continue; }
    if (!t) { errors.push(`${who}: voce non valida.`); continue; }
    const nuovoCorsista = t.kind !== 'tessera' && !p.corsista;   // chi paga una rata o l'iscrizione al corso è un corsista: lo si segna
    const m = latest.get(p.id);
    if (!m) { errors.push(`${who}: nessuna tessera.`); continue; }
    const at = `${it.date}T12:00:00.000Z`;
    if (t.kind === 'tessera') {
      m.bonifico = { date: it.date, importo: it.importo, bank: it.hash };
      m.paymentMethod = 'Bonifico'; m.quota = money2(it.importo);
      rows.push({ key: m.key, tipo: 'annuale', quota: money2(it.importo), method: 'Bonifico', minDate: it.date, fresh: !!m.printed });   // tessera già stampata: nuova ricevuta, non una ristampa
    } else {
      const slot = t.kind === 'iscrizione' ? Corsi.ISCRIZIONE : t.ym;
      Corsi.setPay(state, p.id, t.season, slot, 'pagato', { at, manual: false, method: 'Bonifico', importo: it.importo, bank: it.hash });
      rows.push({ key: m.key, tipo: 'corso', voce: t.kind === 'iscrizione' ? 'iscrizione' : 'rata', periodo: t.ym || undefined, quota: money2(it.importo), method: 'Bonifico', minDate: it.date });
    }
    state.bank[it.hash] = { status: 'confermato', date: it.date, importo: it.importo, descr: shortDescr(it.descr), personId: p.id, target: it.targetKey, at: now.toISOString() };
    // Se il nome sul bonifico non è quello del tesserato (genitore, altro familiare) si ricorda per le volte dopo.
    const pk = it.payerKey;
    if (pk && !fold(p.cognome).split(' ').every((w) => pk.split(' ').includes(w))) {
      const list = state.bankAliases[pk] = state.bankAliases[pk] || [];
      if (!list.includes(p.id)) list.push(p.id);
    }
    if (nuovoCorsista) { p.corsista = true; diventati.push(who); }
    done.push(who);
  }
  return { done, errors, rows, diventati };
}

function ignoreBank(state, items, now = new Date()) {
  state.bank = state.bank || {};
  for (const it of items) state.bank[it.hash] = { status: 'ignorato', date: it.date, importo: it.importo, descr: shortDescr(it.descr), at: now.toISOString() };
}

module.exports = { fold, money, isoDate, parsePdfTokens, parseTable, reconcile, isBonifico, cleanDescr, payerKey, hashOf, nearestMonth, targetKey, parseTargetKey, suggestTarget, analyze, applyBank, ignoreBank, MESI };
