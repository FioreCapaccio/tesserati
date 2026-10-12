'use strict';
// Numeri della dashboard (senza dipendenze da Electron).

const R = require('./reminders');
const C = require('./corsi');

const pad = (n) => String(n).padStart(2, '0');
const addMonths = (ym, n) => { let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${y}-${pad(m + 1)}`; };
function ageOn(nascita, today) {
  if (!nascita) return null;
  let a = Number(today.slice(0, 4)) - Number(nascita.slice(0, 4));
  if (today.slice(5) < nascita.slice(5)) a--;
  return a;
}
// "20", "20,50", "€ 1.250,50" -> numero; vuoto o non valido -> null
function amount(q) {
  let s = String(q == null ? '' : q).replace(/[€\s]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function dashboard(state, today) {
  const { soonDays, warnDays } = state.settings;
  const persons = state.persons;
  const latest = R.latestByPerson(state);

  // ---- tessere (ultima tessera di ogni persona) ----
  const t = { totale: 0, valide: 0, scadute: 0, sospese: 0, inScadenza: 0, entroWarn: 0, scadute30: 0 };
  const expMonths = {};
  for (const m of latest.values()) {
    if (!persons[m.personId]) continue;
    t.totale++;
    const days = R.daysBetween(today, m.scadenza);
    if (m.stato !== 'Attivo') { t.sospese++; continue; }
    if (days < 0) { t.scadute++; if (days >= -30) t.scadute30++; continue; }
    t.valide++;
    if (days <= soonDays) t.inScadenza++;
    if (days <= warnDays) t.entroWarn++;
    const ym = m.scadenza.slice(0, 7);
    expMonths[ym] = (expMonths[ym] || 0) + 1;
  }
  const thisMonth = today.slice(0, 7);
  const scadenzePerMese = Array.from({ length: 6 }, (_, i) => { const ym = addMonths(thisMonth, i); return { ym, n: expMonths[ym] || 0 }; });

  // ---- iscrizioni: nuovi, rinnovi, per mese ----
  const byPerson = {};
  const regMonths = {};
  for (const m of Object.values(state.memberships)) {
    if (!persons[m.personId]) continue;
    (byPerson[m.personId] = byPerson[m.personId] || []).push(m);
    regMonths[m.iscrizione.slice(0, 7)] = (regMonths[m.iscrizione.slice(0, 7)] || 0) + 1;
  }
  let nuovi30 = 0, rinnovi30 = 0, nuoviAnno = 0;
  for (const list of Object.values(byPerson)) {
    list.sort((a, b) => a.iscrizione.localeCompare(b.iscrizione));
    list.forEach((m, i) => {
      const d = R.daysBetween(m.iscrizione, today);
      if (i === 0) { if (d >= 0 && d <= 30) nuovi30++; if (m.iscrizione.slice(0, 4) === today.slice(0, 4)) nuoviAnno++; }
      else if (d >= 0 && d <= 30) rinnovi30++;
    });
  }
  const iscrizioniPerMese = Array.from({ length: 12 }, (_, i) => { const ym = addMonths(thisMonth, i - 11); return { ym, n: regMonths[ym] || 0 }; });

  // ---- età e città ----
  const bins = [['Fino a 17', 0, 17], ['18–29', 18, 29], ['30–44', 30, 44], ['45–59', 45, 59], ['60 e oltre', 60, 200]].map(([label, lo, hi]) => ({ label, lo, hi, n: 0 }));
  let minorenni = 0, sumAge = 0, nAge = 0;
  const citta = {};
  let senzaEmail = 0;
  for (const p of Object.values(persons)) {
    const a = ageOn(p.nascita, today);
    if (a != null && a >= 0) { sumAge += a; nAge++; if (a < 18) minorenni++; const b = bins.find((x) => a >= x.lo && a <= x.hi); if (b) b.n++; }
    if (p.citta) citta[p.citta] = (citta[p.citta] || 0) + 1;
    if (!R.isEmail(p.email)) senzaEmail++;
  }
  const topCitta = Object.entries(citta).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).slice(0, 6).map(([nome, n]) => ({ nome, n }));

  // ---- corsisti (stagione in corso, oppure la prossima da giugno a ottobre) ----
  const y = C.seasonOfDate(today);
  const items = C.items(state, y, today);
  const cors = { totale: Object.values(persons).filter((p) => p.corsista).length, season: y, label: C.seasonLabel(y), phase: C.seasonPhase(y, today), pagati: 0, scaduti: 0, inScadenza: 0, dopo: 0, nonDovuti: 0, prossima: null };
  for (const i of items) {
    if (i.cls === 'paid') cors.pagati++; else if (i.cls === 'expired') cors.scaduti++; else if (i.cls === 'soon') cors.inScadenza++; else if (i.cls === 'skip') cors.nonDovuti++; else cors.dopo++;
  }
  const upcoming = items.filter((i) => i.status === 'dovuto' && i.due >= today).sort((a, b) => a.due.localeCompare(b.due));
  if (upcoming.length) cors.prossima = { due: upcoming[0].due, days: upcoming[0].days, n: upcoming.filter((i) => i.due === upcoming[0].due).length };

  // ---- ricevute e incassi (anno solare) ----
  const year = today.slice(0, 4);
  const rec = (state.receipts || []).filter((r) => (r.date || '').slice(0, 4) === year);
  const nome = { annuale: 'Tessera associativa', mensile: 'Corso – rate mensili', corso: 'Corso – iscrizioni' };
  const perTipo = ['annuale', 'mensile', 'corso'].map((k) => {
    const list = rec.filter((r) => r.tipo === k);
    return { tipo: k, nome: nome[k], n: list.length, importo: list.reduce((s, r) => s + (amount(r.quota) || 0), 0) };
  });
  const perMetodo = ['Contanti', 'POS', 'Bonifico', ''].map((k) => {
    const list = rec.filter((r) => (r.method || '') === k && amount(r.quota) != null);
    return { metodo: k || 'Non indicato', n: list.length, importo: list.reduce((s, r) => s + amount(r.quota), 0) };
  }).filter((x) => x.n > 0);
  const ric = {
    anno: year, emesse: rec.length, senzaImporto: rec.filter((r) => amount(r.quota) == null).length,
    totale: perTipo.reduce((s, x) => s + x.importo, 0), perTipo, perMetodo,
    daStampare: Object.values(state.memberships).filter((m) => !m.printed && persons[m.personId]).length,
    prossimoNumero: state.settings.nextReceipt,
  };

  // ---- avvisi email, archivio ----
  const pronti = R.dueReminders(state, today).groups.length;
  const inviati30 = (state.mailLog || []).filter((l) => l.ok && Date.now() - new Date(l.at).getTime() <= 30 * 864e5).length;
  const lastImport = state.imports[state.imports.length - 1] || null;

  const attenzione = [
    { id: 'stampare', n: ric.daStampare, testo: 'ricevute da stampare', view: 'stampare' },
    { id: 'avvisi', n: pronti, testo: 'avvisi di rinnovo pronti da inviare', view: 'avvisi' },
    { id: 'corsisti', n: cors.scaduti, testo: 'pagamenti dei corsisti scaduti e non pagati', view: 'corsisti' },
    { id: 'scadute30', n: t.scadute30, testo: 'tessere scadute da meno di 30 giorni (da rinnovare)', view: 'lista', filtro: 'expired' },
    { id: 'senzaEmail', n: senzaEmail, testo: 'tesserati senza email valida (non ricevono gli avvisi)', view: 'lista' },
  ].filter((x) => x.n > 0);

  return {
    today, soonDays, warnDays, tessere: t, nuovi30, rinnovi30, nuoviAnno, iscrizioniPerMese, scadenzePerMese,
    eta: { minorenni, media: nAge ? Math.round(sumAge / nAge) : null, fasce: bins.map(({ label, n }) => ({ label, n })) },
    topCitta, senzaEmail, corsisti: cors, ricevute: ric,
    avvisi: { pronti, inviati30 },
    archivio: { cestino: Object.keys(state.trash || {}).length, ultimaLettura: lastImport ? { at: lastImport.at, nuovi: lastImport.nuovi, aggiornati: lastImport.aggiornati, file: lastImport.file } : null },
    attenzione,
  };
}

module.exports = { dashboard, amount, ageOn, addMonths };
