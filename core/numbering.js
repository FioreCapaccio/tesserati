'use strict';
// Numerazione delle ricevute in ordine di data. Funziona sia in Node (require) sia nel browser (window.Numbering).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Numbering = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  // Tutte le ricevute già emesse: registro + ricevute di tessera anteriori al registro + quelle di chi è nel cestino.
  function issuedList(state) {
    const ledger = state.receipts || [];
    const out = ledger.map((r) => ({ no: r.no, date: r.date || '', nome: r.nome || '', key: r.key, tipo: r.tipo, label: r.label }));
    const addLegacy = (m, p) => {
      if (!m.receiptNo) return;
      if (ledger.some((r) => r.tipo === 'annuale' && r.key === m.key && r.no === m.receiptNo)) return;
      out.push({ no: m.receiptNo, date: m.receiptDate || '', nome: p ? `${p.cognome} ${p.nome}`.trim() : '', key: m.key, tipo: 'annuale', label: m.receiptLabel });
    };
    for (const m of Object.values(state.memberships || {})) addLegacy(m, (state.persons || {})[m.personId]);
    for (const t of Object.values(state.trash || {})) for (const m of t.memberships || []) addLegacy(m, t.person);
    return out;
  }

  // rows: [{ id, date, order, reuseNo, fixedNo }]. Le ricevute senza numero proprio prendono i numeri in ordine di data
  // (a parità di data, nell'ordine dato), saltando quelli già occupati. Ritorna { id: numero }.
  function assign(rows, start, issuedNos) {
    const used = issuedNos || new Set();
    const nos = {}, taken = new Set();
    for (const r of rows) {
      if (r.reuseNo) { nos[r.id] = r.reuseNo; taken.add(r.reuseNo); }
      else if (r.fixedNo) { nos[r.id] = r.fixedNo; taken.add(r.fixedNo); }
    }
    let n = Math.max(1, Math.floor(start) || 1);
    const auto = rows.filter((r) => !r.reuseNo && !r.fixedNo).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order);
    for (const r of auto) {
      while (taken.has(n) || used.has(n)) n++;
      nos[r.id] = n; taken.add(n); n++;
    }
    return nos;
  }

  // items: [{ id, no, date, reuse }]; issued: ricevute già emesse. Ritorna { id: [{ level, text }] }.
  function check(items, issued) {
    const res = {};
    const add = (id, level, text) => { (res[id] = res[id] || []).push({ level, text }); };
    for (const it of items) {
      if (it.reuse) continue;
      const others = issued.concat(items.filter((x) => x.id !== it.id).map((x) => ({ no: x.no, date: x.date, nome: x.nome || 'un’altra ricevuta di questa stampa' })));
      const dup = others.find((o) => o.no === it.no);
      if (dup) { add(it.id, 'error', `Il numero ${it.no} è già assegnato${dup.nome ? ' a ' + dup.nome : ''}${dup.date ? ' (ricevuta del ' + fmt(dup.date) + ')' : ''}.`); continue; }
      if (!it.date) continue;
      const conflict = others.find((o) => o.date && ((o.no < it.no && o.date > it.date) || (o.no > it.no && o.date < it.date)));
      if (conflict) add(it.id, 'warn', conflict.no < it.no
        ? `Ordine non cronologico: la n° ${conflict.no} ha numero più basso ma è del ${fmt(conflict.date)}, dopo questa.`
        : `Ordine non cronologico: la n° ${conflict.no} ha numero più alto ma è del ${fmt(conflict.date)}, prima di questa.`);
    }
    return res;
  }

  return { issuedList, assign, check };
});
