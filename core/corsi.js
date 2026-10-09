'use strict';
// Corsisti: stagione da novembre a maggio, rata mensile con scadenza il 1° del mese,
// più la quota di iscrizione al corso (scadenza 1° novembre).

const { latestByPerson, daysBetween } = require('./reminders');

const ISCRIZIONE = 'iscrizione';
const pad = (n) => String(n).padStart(2, '0');

// Stagione identificata dall'anno di novembre: 2026 = novembre 2026 → maggio 2027.
const seasonMonths = (y) => [`${y}-11`, `${y}-12`, `${y + 1}-01`, `${y + 1}-02`, `${y + 1}-03`, `${y + 1}-04`, `${y + 1}-05`];
const seasonLabel = (y) => `${y}/${pad((y + 1) % 100)}`;
const seasonSlots = (y) => [ISCRIZIONE, ...seasonMonths(y)];
// Da giugno in poi si guarda alla stagione che inizia; da gennaio a maggio a quella in corso.
const seasonOfDate = (iso) => (Number(iso.slice(5, 7)) >= 6 ? Number(iso.slice(0, 4)) : Number(iso.slice(0, 4)) - 1);
const seasonOfPeriod = (per) => {
  const y = Number(per.slice(0, 4)), m = Number(per.slice(5, 7));
  if (m >= 11) return y;
  if (m >= 1 && m <= 5) return y - 1;
  return null; // giugno–ottobre: fuori stagione
};
// La stagione va dal 1° novembre al 31 maggio.
const seasonStart = (y) => `${y}-11-01`;
const seasonEnd = (y) => `${y + 1}-05-31`;
const seasonPhase = (y, today) => (today < seasonStart(y) ? 'prossima' : today > seasonEnd(y) ? 'conclusa' : 'incorso');
const dueDate = (slot, y) => (slot === ISCRIZIONE ? `${y}-11-01` : `${slot}-01`);

const getPay = (p, y, slot) => (p && p.corso && p.corso[y] && p.corso[y][slot]) || null;

// status: 'pagato' | 'nondovuto' | null (= torna "da pagare").
function setPay(state, personId, y, slot, status, { at = new Date().toISOString(), no = null, label = '', manual = true } = {}) {
  const p = state.persons[personId];
  if (!p) throw new Error('Tesserato non trovato.');
  if (!seasonSlots(y).includes(slot)) throw new Error('Scadenza non valida per questa stagione.');
  if (status !== null && !['pagato', 'nondovuto'].includes(status)) throw new Error('Stato del pagamento non valido.');
  p.corso = p.corso || {};
  if (status === null) {
    if (p.corso[y]) { delete p.corso[y][slot]; if (!Object.keys(p.corso[y]).length) delete p.corso[y]; }
    if (!Object.keys(p.corso).length) delete p.corso;
    return;
  }
  p.corso[y] = p.corso[y] || {};
  p.corso[y][slot] = { status, at, manual, ...(no != null ? { no, label } : {}) };
}

function classOf(status, days, soonDays, warnDays) {
  if (status === 'pagato') return 'paid';
  if (status === 'nondovuto') return 'skip';
  if (days < 0) return 'expired';
  if (days <= soonDays) return 'soon';
  if (days <= warnDays) return 'warn';
  return 'future';
}

// Tutte le scadenze di una stagione, una per corsista e per voce.
function items(state, y, today) {
  const { soonDays, warnDays } = state.settings;
  const latest = latestByPerson(state);
  const out = [];
  for (const p of Object.values(state.persons)) {
    if (!p.corsista) continue;
    const key = latest.get(p.id) ? latest.get(p.id).key : null;
    for (const slot of seasonSlots(y)) {
      const pay = getPay(p, y, slot);
      const status = pay ? pay.status : 'dovuto';
      const due = dueDate(slot, y);
      const days = daysBetween(today, due);
      out.push({
        personId: p.id, key, nome: p.nome, cognome: p.cognome, slot, due, days, status,
        cls: classOf(status, days, soonDays, warnDays),
        paidAt: pay && pay.status === 'pagato' ? pay.at : null, receipt: pay && pay.no != null ? { no: pay.no, label: pay.label } : null, manual: pay ? !!pay.manual : false,
      });
    }
  }
  out.sort((a, b) => a.due.localeCompare(b.due) || (a.slot === ISCRIZIONE ? -1 : 0) - (b.slot === ISCRIZIONE ? -1 : 0) || `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'));
  return out;
}

const overdueCount = (state, today) => items(state, seasonOfDate(today), today).filter((i) => i.cls === 'expired').length;

// Una ricevuta stampata segna da sola il pagamento, ma solo per i corsisti.
function markFromReceipt(state, r, now = new Date()) {
  const m = state.memberships[r.key];
  const p = m && state.persons[m.personId];
  if (!p || !p.corsista) return false;
  const at = now.toISOString();
  if (r.tipo === 'mensile') {
    const y = r.periodo ? seasonOfPeriod(r.periodo) : null;
    if (y == null) return false;
    setPay(state, p.id, y, r.periodo, 'pagato', { at, no: r.no, label: r.label, manual: false });
    return true;
  }
  if (r.tipo === 'corso') {
    const y = /^\d{4}$/.test(r.periodo || '') ? Number(r.periodo) : seasonOfDate(r.date || at.slice(0, 10));
    setPay(state, p.id, y, ISCRIZIONE, 'pagato', { at, no: r.no, label: r.label, manual: false });
    return true;
  }
  return false;
}

module.exports = { seasonStart, seasonEnd, seasonPhase, ISCRIZIONE, seasonMonths, seasonLabel, seasonSlots, seasonOfDate, seasonOfPeriod, dueDate, getPay, setPay, items, overdueCount, markFromReceipt, classOf };
