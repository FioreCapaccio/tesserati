'use strict';
/* global Receipt */

// ======================= Utilità =======================
const esc = Receipt.esc;
const $ = (sel, root = document) => root.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const isoToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const daysFrom = (iso) => Math.round((isoToDate(iso) - isoToDate(todayIso())) / 864e5);
const fmt = (iso) => (iso ? iso.split('-').reverse().join('/') : '—');
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const ICON = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  cal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  cog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  sync: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-15-6.7L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 15 6.7L21 16"/><path d="M16 16h5v5"/></svg>',
  eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
};
const BRAND = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6c0 9 2 17 8 20 6-3 8-11 8-20-5 2-11 2-16 0z"/><path d="M9 12.5h.01M15 12.5h.01"/><path d="M9.5 18c1.2 1.6 3.6 1.6 4.8 0"/><path d="M22 9c3 .3 6 .1 6-.1 0 7-1.7 12.6-5.5 14.6"/></svg>';

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ======================= Stato =======================
const App = {
  data: null, dataFile: '',
  view: 'lista',
  sel: new Set(),
  detailKey: null,
  filters: { q: '', stato: '', scad: '', stampa: '', latestOnly: true },
  sort: { key: 'cognome', dir: 1 },
  cal: { y: new Date().getFullYear(), m: new Date().getMonth(), mode: 'mese', day: null, showHidden: false },
  busy: false,
};

function setData(snap) {
  App.data = snap.state;
  for (const k of ['dataFile', 'version', 'copyright', 'csv', 'defaultDataFile']) if (snap[k] !== undefined) App[k] = snap[k];
}
const S = () => App.data.settings;

function statusOf(m) {
  const d = daysFrom(m.scadenza);
  if (d < 0) return 'expired';
  if (d <= S().soonDays) return 'soon';
  if (d <= S().warnDays) return 'warn';
  return 'ok';
}
const STATUS_LABEL = { expired: 'Scaduta', soon: 'In scadenza', warn: 'Da rinnovare', ok: 'Valida' };
function expText(m) {
  const d = daysFrom(m.scadenza);
  const unit = (n) => (n > 60 ? `${Math.round(n / 30.4)} mesi` : `${n} gg`);
  if (d < 0) return `scaduta da ${unit(-d)}`;
  if (d === 0) return 'scade oggi';
  return `tra ${unit(d)}`;
}
function age(iso) {
  if (!iso) return null;
  const b = isoToDate(iso), t = new Date();
  let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}

function derive() {
  const mem = Object.values(App.data.memberships);
  const latest = new Map();
  for (const m of mem) {
    const c = latest.get(m.personId);
    if (!c || m.iscrizione > c.iscrizione || (m.iscrizione === c.iscrizione && m.scadenza > c.scadenza)) latest.set(m.personId, m);
  }
  const rows = mem.map((m) => ({ m, p: App.data.persons[m.personId] || { id: m.personId, nome: '', cognome: '', cf: '', email: '', cell: '', indirizzo: '', citta: '', nascita: '', provNascita: '' }, isLatest: latest.get(m.personId) === m, st: statusOf(m) }));
  return { rows, latest, todo: rows.filter((r) => !r.m.printed) };
}
const byName = (a, b) => (a.p.cognome + ' ' + a.p.nome).localeCompare(b.p.cognome + ' ' + b.p.nome, 'it');

// ======================= Shell =======================
function renderSide() {
  const { todo } = derive();
  const item = (v, icon, label, count) => `<button class="nav" data-nav="${v}" ${App.view === v ? 'aria-current="page"' : ''}>${ICON[icon]}<span>${label}</span>${count != null ? `<span class="count ${count ? '' : 'zero'}">${count}</span>` : ''}</button>`;
  const last = App.data.imports[App.data.imports.length - 1];
  $('#side').innerHTML = `
    <div class="brand"><img src="brand.png" alt="" width="40" height="40"><span>AROTRON</span></div>
    ${item('lista', 'users', 'Tesserati')}
    ${item('stampare', 'print', 'Da stampare', todo.length)}
    ${item('calendario', 'cal', 'Calendario')}
    ${item('impostazioni', 'cog', 'Impostazioni')}
    <div class="side-bottom">
      <div class="meta">${last ? `Ultimo caricamento<br><b>${new Date(last.at).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}</b>${last.nuovi && !last.firstImport ? ` · ${last.nuovi} nuovi` : ''}` : 'Nessun file ancora caricato'}</div>
      <button class="btn-reload" data-act="reload" ${App.busy ? 'disabled' : ''}>${ICON.sync}<span>${App.busy ? 'Lettura…' : 'Rileggi file'}</span></button>
      <div class="meta ver">v${esc(App.version || '')}</div>
    </div>`;
}

function render() {
  renderSide();
  const main = $('#main');
  const scroll = main.scrollTop;
  let body;
  if (!Object.keys(App.data.memberships).length && App.view !== 'impostazioni') body = welcome();
  else if (App.view === 'lista' || App.view === 'stampare') body = listView();
  else if (App.view === 'calendario') body = calendarView();
  else body = settingsView();
  main.innerHTML = `<div class="view">${body}</div><footer class="app-foot">Tesserati · versione ${esc(App.version || '')} · ${esc(App.copyright || '')}</footer>`;
  main.scrollTop = scroll;
  if (App.view === 'lista' || App.view === 'stampare') renderTable();
  renderDrawer();
}

function welcome() {
  return `<div class="empty"><h2>Benvenuto in Tesserati</h2>
    <p>Per iniziare carica il file CSV esportato da Younity.<br>Le tessere presenti ora verranno segnate come già stampate: da quel momento, a ogni lettura, risulteranno “da stampare” solo i nuovi tesserati.</p>
    <p>Il file viene cercato nella cartella <b>Download</b> (<span class="path">${esc(App.csv ? App.csv.folder : '')}</span>).</p>
    <button class="btn primary" data-act="reload">${ICON.sync} Leggi il file</button>
    <button class="btn" data-act="pick-import">Scegli un altro file…</button></div>`;
}

// ======================= Elenco =======================
function listView() {
  const f = App.filters;
  const todoMode = App.view === 'stampare';
  const { todo } = derive();
  const sel = (id, opts, val) => `<select class="field" data-filter="${id}">${opts.map(([v, l]) => `<option value="${v}" ${v === val ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  return `
    <div class="page-head">
      <div>
        <h1>${todoMode ? 'Da stampare' : 'Tesserati'}</h1>
        <p>${todoMode ? (todo.length ? `${todo.length} ricevute in attesa di stampa` : 'Tutto stampato: nessuna ricevuta in attesa.') : 'Archivio completo, con scheda e ricevuta per ogni tessera.'}</p>
      </div>
      ${todoMode && todo.length ? `<div style="display:flex;gap:8px"><button class="btn" data-act="mark-all-printed">Segna tutte come stampate</button><button class="btn primary" data-act="print-all-todo">${ICON.print} Stampa tutte (${todo.length})</button></div>` : ''}
    </div>
    <div class="toolbar">
      <input class="field search" type="search" placeholder="Cerca per nome, cognome, ID, codice fiscale, email, telefono, città…" value="${esc(f.q)}" data-filter="q" aria-label="Cerca">
      ${todoMode ? '' : sel('stato', [['', 'Ogni stato'], ['Attivo', 'Attivo'], ['Sospeso', 'Sospeso']], f.stato)}
      ${sel('scad', [['', 'Ogni scadenza'], ['expired', 'Scadute'], ['soon', `Entro ${S().soonDays} giorni`], ['warn', `Entro ${S().warnDays} giorni`], ['ok', 'Valide']], f.scad)}
      ${todoMode ? '' : sel('stampa', [['', 'Ricevuta: tutte'], ['todo', 'Da stampare'], ['done', 'Già stampate']], f.stampa)}
      ${todoMode ? '' : `<label class="check"><input type="checkbox" data-filter="latestOnly" ${f.latestOnly ? 'checked' : ''}> Solo ultima tessera</label>`}
    </div>
    <div id="selbar"></div>
    <div class="tablewrap"><table>
      <thead><tr>
        <th class="cbx"><input type="checkbox" id="selall" aria-label="Seleziona tutti"></th>
        ${th('cognome', 'Tesserato')}${th('id', 'ID', 'num opt')}${th('nascita', 'Nascita', 'opt')}${th('citta', 'Città', 'opt')}${th('iscrizione', 'Iscrizione', 'opt')}${th('scadenza', 'Scadenza')}${th('stato', 'Stato')}${th('ricevuta', 'Ricevuta')}
      </tr></thead>
      <tbody id="tbody"></tbody>
    </table><div class="tfoot" id="tfoot"></div></div>`;
}
function th(key, label, cls = '') {
  const on = App.sort.key === key;
  return `<th class="sortable ${cls}" data-sort="${key}" aria-sort="${on ? (App.sort.dir > 0 ? 'ascending' : 'descending') : 'none'}">${label}${on ? `<span class="arrow"> ${App.sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`;
}

function filteredRows() {
  const f = App.filters;
  const todoMode = App.view === 'stampare';
  const q = norm(f.q).split(/\s+/).filter(Boolean);
  let rows = derive().rows;
  if (todoMode) rows = rows.filter((r) => !r.m.printed);
  else if (f.latestOnly) rows = rows.filter((r) => r.isLatest);
  if (!todoMode && f.stato) rows = rows.filter((r) => r.m.stato === f.stato);
  if (f.scad) rows = rows.filter((r) => r.st === f.scad);
  if (!todoMode && f.stampa) rows = rows.filter((r) => (f.stampa === 'todo') === !r.m.printed);
  if (q.length) {
    rows = rows.filter((r) => {
      const hay = norm([r.p.nome, r.p.cognome, r.p.cognome + ' ' + r.p.nome, r.p.id, r.p.cf, r.p.email, r.p.cell, r.p.citta, r.p.indirizzo].join(' '));
      return q.every((t) => hay.includes(t));
    });
  }
  const k = App.sort.key, dir = App.sort.dir;
  const val = (r) => ({ cognome: (r.p.cognome + ' ' + r.p.nome).toLowerCase(), id: Number(r.p.id), nascita: r.p.nascita, citta: (r.p.citta || '').toLowerCase(), iscrizione: r.m.iscrizione, scadenza: r.m.scadenza, stato: r.m.stato, ricevuta: r.m.printed ? (r.m.receiptNo || 0) : -1 })[k];
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : byName(a, b)) * dir; });
  return rows;
}

function renderTable() {
  const tb = $('#tbody');
  if (!tb) return;
  const rows = filteredRows();
  const MAX = 800;
  tb.innerHTML = rows.slice(0, MAX).map((r) => {
    const { m, p } = r;
    const minor = age(p.nascita) != null && age(p.nascita) < 18;
    return `<tr data-key="${esc(m.key)}" class="${App.detailKey === m.key ? 'active' : ''}">
      <td class="cbx"><input type="checkbox" data-sel="${esc(m.key)}" ${App.sel.has(m.key) ? 'checked' : ''} aria-label="Seleziona ${esc(p.cognome)} ${esc(p.nome)}"></td>
      <td class="name">${esc(p.cognome)} ${esc(p.nome)}${minor ? ' <span class="badge neutral">minorenne</span>' : ''}<small>${esc(p.email)}</small></td>
      <td class="num opt">${esc(p.id)}</td>
      <td class="opt">${fmt(p.nascita)}</td>
      <td class="opt">${esc(p.citta) || '<span style="color:var(--muted)">—</span>'}</td>
      <td class="opt">${fmt(m.iscrizione)}</td>
      <td><div class="exp"><span class="dot ${r.st}" title="${STATUS_LABEL[r.st]}"></span><span>${fmt(m.scadenza)}</span><small>${expText(m)}</small></div></td>
      <td>${m.stato === 'Attivo' ? '<span class="badge neutral">Attivo</span>' : `<span class="badge susp">${esc(m.stato)}</span>`}</td>
      <td>${m.printed ? `<span class="badge neutral">${m.receiptNo ? '✓ n° ' + esc(m.receiptLabel || m.receiptNo) : '✓ stampata'}</span>` : '<span class="badge todo">Da stampare</span>'}</td>
    </tr>`;
  }).join('');
  $('#tfoot').textContent = rows.length ? `${rows.length} tessere${rows.length > MAX ? ` (mostrate le prime ${MAX}: restringi la ricerca)` : ''}` : 'Nessun risultato per i filtri impostati.';
  const all = $('#selall');
  if (all) {
    const vis = rows.slice(0, MAX);
    const n = vis.filter((r) => App.sel.has(r.m.key)).length;
    all.checked = vis.length > 0 && n === vis.length;
    all.indeterminate = n > 0 && n < vis.length;
    all._keys = vis.map((r) => r.m.key);
  }
  renderSelbar();
}

function renderSelbar() {
  const el = $('#selbar');
  if (!el) return;
  const n = App.sel.size;
  el.innerHTML = n ? `<div class="selbar"><b>${n} selezionat${n === 1 ? 'a' : 'e'}</b>
    <button class="btn primary sm" data-act="print-sel">${ICON.print} Stampa ricevute</button>
    <button class="btn sm" data-act="flag-sel" data-v="1">Segna come stampate</button>
    <button class="btn sm" data-act="flag-sel" data-v="0">Segna da stampare</button>
    <button class="btn sm ghost" data-act="clear-sel">Deseleziona</button></div>` : '';
}

// ======================= Scheda =======================
function renderDrawer() {
  const dr = $('#drawer');
  const m = App.detailKey && App.data.memberships[App.detailKey];
  document.body.classList.toggle('drawer-open', !!m);
  if (!m) { dr.hidden = true; dr.innerHTML = ''; return; }
  const p = App.data.persons[m.personId];
  const st = statusOf(m);
  const a = age(p.nascita);
  const hist = Object.values(App.data.memberships).filter((x) => x.personId === m.personId).sort((x, y) => y.iscrizione.localeCompare(x.iscrizione));
  const keep = dr.scrollTop;
  dr.hidden = false;
  dr.innerHTML = `
    <div class="d-head">
      <button class="d-close" data-act="close-drawer" aria-label="Chiudi">×</button>
      <h2>${esc(p.cognome)} ${esc(p.nome)}</h2>
      <div class="d-badges">
        <span class="badge ${st}">${STATUS_LABEL[st]} · ${expText(m)}</span>
        ${m.stato === 'Attivo' ? '<span class="badge neutral">Attivo</span>' : `<span class="badge susp">${esc(m.stato)}</span>`}
        ${a != null && a < 18 ? '<span class="badge neutral">Minorenne</span>' : ''}
        ${m.printed ? `<span class="badge neutral">✓ Ricevuta${m.receiptNo ? ' n° ' + esc(m.receiptLabel || m.receiptNo) : ''}</span>` : '<span class="badge todo">Da stampare</span>'}
        ${m.hidden ? '<span class="badge neutral">Nascosta dal calendario</span>' : ''}
      </div>
    </div>
    <div class="d-body">
      <div class="d-sec"><h3>Azioni</h3><div class="d-actions">
        <button class="btn primary" data-act="print-one">${ICON.print} ${m.printed ? 'Ristampa ricevuta' : 'Stampa ricevuta'}</button>
        <button class="btn" data-act="flag-one" data-v="${m.printed ? 0 : 1}">${m.printed ? 'Segna da stampare' : 'Segna come stampata'}</button>
        <button class="btn ${m.hidden ? '' : 'danger'}" data-act="toggle-hidden">${m.hidden ? ICON.eye + ' Rimetti nel calendario' : ICON.eyeoff + ' Rimuovi dal calendario'}</button>
      </div></div>
      <div class="d-sec"><h3>Anagrafica</h3><dl class="kv">
        <dt>ID tessera</dt><dd>${esc(p.id)}</dd>
        <dt>Cognome</dt><dd>${esc(p.cognome)}</dd>
        <dt>Nome</dt><dd>${esc(p.nome)}</dd>
        <dt>Data di nascita</dt><dd>${fmt(p.nascita)}${a != null ? ` <span style="color:var(--muted)">(${a} anni)</span>` : ''}</dd>
        <dt>Provincia nascita</dt><dd>${esc(p.provNascita) || '<span style="color:var(--muted)">Estero / non indicata</span>'}</dd>
        <dt>Codice fiscale</dt><dd>${esc(p.cf)}</dd>
      </dl></div>
      <div class="d-sec"><h3>Contatti e residenza</h3><dl class="kv">
        <dt>Email</dt><dd>${esc(p.email) || '—'}</dd>
        <dt>Cellulare</dt><dd>${esc(p.cell) || '—'}</dd>
        <dt>Indirizzo</dt><dd>${esc(p.indirizzo) || '—'}</dd>
        <dt>Città</dt><dd>${esc(p.citta) || '—'}</dd>
      </dl></div>
      <div class="d-sec"><h3>Tessera selezionata</h3><dl class="kv">
        <dt>Iscrizione</dt><dd>${fmt(m.iscrizione)}${m.iscrizioneOra ? ` <span style="color:var(--muted)">${esc(m.iscrizioneOra)}</span>` : ''}</dd>
        <dt>Scadenza</dt><dd>${fmt(m.scadenza)}</dd>
        <dt>Stato</dt><dd>${esc(m.stato)}</dd>
        <dt>Ricevuta</dt><dd>${m.printed ? `Stampata${m.printedAt ? ' il ' + new Date(m.printedAt).toLocaleDateString('it-IT') : ' (già prima del primo caricamento)'}${m.receiptNo ? ` · n° ${esc(m.receiptLabel || m.receiptNo)}` : ''}` : 'Da stampare'}</dd>
        <dt>Quota (€)</dt><dd><div class="inline-field"><input class="field" id="quota" value="${esc(m.quota)}" placeholder="vuoto = a mano" inputmode="decimal"><button class="btn sm" data-act="save-quota">Salva</button></div></dd>
      </dl></div>
      <div class="d-sec"><h3>Storico tessere (${hist.length})</h3><div class="hist">
        ${hist.map((h) => `<button data-open="${esc(h.key)}" class="${h.key === m.key ? 'on' : ''}"><span class="dot ${statusOf(h)}"></span><span class="when">${fmt(h.iscrizione)} → ${fmt(h.scadenza)}</span>${h.printed ? '<span class="badge neutral">✓</span>' : '<span class="badge todo">Da stampare</span>'}</button>`).join('')}
      </div></div>
      <div class="d-sec"><h3>Note</h3><textarea class="field" id="note" placeholder="Annotazioni sul tesserato…">${esc(p.note)}</textarea></div>
    </div>`;
  dr.scrollTop = keep;
}

// ======================= Calendario =======================
function calRows() {
  const { rows } = derive();
  return rows.filter((r) => r.isLatest && (App.cal.showHidden || !r.m.hidden));
}
function chip(r) {
  return `<button class="chip ${r.st} ${r.m.stato !== 'Attivo' ? 'susp' : ''} ${r.m.hidden ? 'hid' : ''}" data-open="${esc(r.m.key)}" title="${esc(r.p.cognome + ' ' + r.p.nome)} · scade il ${fmt(r.m.scadenza)} · ${STATUS_LABEL[r.st]}${r.m.stato !== 'Attivo' ? ' · ' + r.m.stato : ''}">${esc(r.p.cognome)} ${esc(r.p.nome)}</button>`;
}
function calendarView() {
  const c = App.cal;
  const rows = calRows();
  const counts = { expired: 0, soon: 0, warn: 0, ok: 0 };
  rows.forEach((r) => counts[r.st]++);
  const legend = `<div class="legend">
    <span class="chip expired">Scadute · ${counts.expired}</span>
    <span class="chip soon">Entro ${S().soonDays} gg · ${counts.soon}</span>
    <span class="chip warn">Entro ${S().warnDays} gg · ${counts.warn}</span>
    <span class="chip ok">Valide · ${counts.ok}</span>
    <span class="chip" style="border-style:dashed;border-color:var(--muted);color:var(--muted);background:transparent">Bordo tratteggiato = sospeso</span></div>`;
  const nav = `<div class="cal-nav">
    <button class="btn sm" data-cal="prev" aria-label="Precedente">◀</button>
    <h2>${c.mode === 'mese' ? MONTHS[c.m] + ' ' + c.y : 'Anno ' + c.y}</h2>
    <button class="btn sm" data-cal="next" aria-label="Successivo">▶</button>
    <button class="btn sm" data-cal="today">Oggi</button>
    <label class="check" style="margin-left:8px"><input type="checkbox" data-cal-hidden ${c.showHidden ? 'checked' : ''}> Mostra rimosse</label>
    <div class="seg"><button data-cal="mese" aria-pressed="${c.mode === 'mese'}">Mese</button><button data-cal="anno" aria-pressed="${c.mode === 'anno'}">Anno</button></div></div>`;
  const head = `<div class="page-head"><div><h1>Calendario scadenze</h1><p>Ogni tessera compare nel giorno di scadenza, colorata in base alla distanza da oggi (${new Date().toLocaleDateString('it-IT', { dateStyle: 'long' })}).</p></div></div>`;
  return head + legend + nav + (c.mode === 'mese' ? monthGrid(rows) : yearGrid(rows));
}

function monthGrid(rows) {
  const c = App.cal;
  const first = new Date(c.y, c.m, 1);
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(c.y, c.m, 1 - lead);
  const byDay = new Map();
  rows.forEach((r) => { (byDay.get(r.m.scadenza) || byDay.set(r.m.scadenza, []).get(r.m.scadenza)).push(r); });
  const today = todayIso();
  const cells = [];
  const total = Math.ceil((lead + new Date(c.y, c.m + 1, 0).getDate()) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const list = (byDay.get(iso) || []).sort(byName);
    const out = d.getMonth() !== c.m;
    cells.push(`<div class="day ${out ? 'out' : ''} ${iso === today ? 'today' : ''} ${c.day === iso ? 'sel' : ''}" data-day="${iso}" role="button" tabindex="0">
      <div class="dnum"><span>${d.getDate()}</span>${list.length ? `<span>${list.length}</span>` : ''}</div>
      ${list.slice(0, 3).map(chip).join('')}${list.length > 3 ? `<span class="more">+${list.length - 3} altri</span>` : ''}</div>`);
  }
  const monthRows = rows.filter((r) => r.m.scadenza.startsWith(`${c.y}-${pad(c.m + 1)}`) && (!c.day || r.m.scadenza === c.day)).sort((a, b) => a.m.scadenza.localeCompare(b.m.scadenza) || byName(a, b));
  const title = c.day ? `${Number(c.day.slice(8))} ${MONTHS[c.m]} ${c.y}` : `${MONTHS[c.m]} ${c.y}`;
  return `<div class="cal-layout">
    <div class="cal">${DOW.map((d) => `<div class="dow">${d}</div>`).join('')}${cells.join('')}</div>
    <aside class="side-card"><h3>Scadenze · ${title} <span style="font-size:14px;color:var(--muted);font-family:var(--sans)">(${monthRows.length})</span></h3>
      <div class="side-list">${monthRows.length ? monthRows.map((r) => `<div class="li ${r.m.hidden ? 'hid' : ''}" data-open="${esc(r.m.key)}">
        <span class="d">${r.m.scadenza.slice(8)}/${r.m.scadenza.slice(5, 7)}</span><span class="dot ${r.st}"></span>
        <span class="n">${esc(r.p.cognome)} ${esc(r.p.nome)}<small>${expText(r.m)}${r.m.stato !== 'Attivo' ? ' · ' + esc(r.m.stato) : ''}</small></span>
        <button class="icon-btn" data-hide="${esc(r.m.key)}" title="${r.m.hidden ? 'Rimetti nel calendario' : 'Rimuovi dal calendario'}" aria-label="${r.m.hidden ? 'Rimetti nel calendario' : 'Rimuovi dal calendario'}">${r.m.hidden ? ICON.eye : ICON.eyeoff}</button></div>`).join('') : '<div class="empty" style="padding:28px 16px">Nessuna scadenza in questo periodo.</div>'}</div>
      ${c.day ? `<div style="padding:10px 14px;border-top:1px solid var(--line)"><button class="btn sm" data-cal="clearday">Mostra tutto il mese</button></div>` : ''}
    </aside></div>`;
}

function yearGrid(rows) {
  const c = App.cal;
  const curKey = todayIso().slice(0, 7);
  return `<div class="year">${MONTHS.map((name, i) => {
    const key = `${c.y}-${pad(i + 1)}`;
    const list = rows.filter((r) => r.m.scadenza.startsWith(key));
    const cnt = { expired: 0, soon: 0, warn: 0, ok: 0 };
    list.forEach((r) => cnt[r.st]++);
    return `<button class="mcard ${key === curKey ? 'cur' : ''}" data-month="${i}"><h3>${name}</h3>
      <div class="pills">${Object.entries(cnt).filter(([, n]) => n).map(([k, n]) => `<span class="chip ${k}" style="width:auto;display:inline-block;cursor:pointer">${n}</span>`).join('') || '<span style="color:var(--muted)">—</span>'}</div>
      <div class="tot">${list.length} scadenz${list.length === 1 ? 'a' : 'e'}</div></button>`;
  }).join('')}</div>`;
}

// ======================= Impostazioni =======================
function csvBlock() {
  const c = App.csv;
  if (!c) return '';
  const where = c.auto ? 'Download (automatico)' : c.kind === 'file' ? 'File scelto' : 'Cartella scelta';
  return `<div style="margin-bottom:6px"><b>${where}</b>${c.missing ? ' <span class="badge expired">Percorso salvato non trovato: uso Download</span>' : ''}</div>
    <div class="path" style="margin-bottom:8px">${esc(c.target)}</div>
    <div>${c.file ? `Verrà letto: <b>${esc(c.file.split(/[\\/]/).pop())}</b> <span style="color:var(--muted)">(${esc(c.kind === 'folder' ? 'il più recente della cartella' : 'file indicato')})</span>` : '<span class="badge soon">Nessun file Younity…csv trovato qui: al “Rileggi file” ti verrà chiesto di sceglierlo</span>'}</div>`;
}
function settingsView() {
  const s = S(), a = s.assoc;
  const inp = (id, label, val, extra = '', wide = false) => `<label class="${wide ? 'wide' : ''}">${label}<input class="field" id="${id}" value="${esc(val)}" ${extra}></label>`;
  return `
    <div class="page-head"><div><h1>Impostazioni</h1><p>Dati dell’associazione per le ricevute, numerazione e colori del calendario.</p></div></div>
    <div class="settings">
      <section class="card"><h2>Aspetto</h2><p>Scegli la versione chiara o scura. “Automatico” segue le impostazioni del computer.</p>
        <div class="seg" style="margin-left:0" role="group" aria-label="Tema">
          ${[['system', 'Automatico'], ['light', 'Chiaro'], ['dark', 'Scuro']].map(([v, l]) => `<button data-act="set-theme" data-v="${v}" aria-pressed="${(s.theme || 'system') === v}">${l}</button>`).join('')}
        </div></section>
      <section class="card"><h2>Associazione</h2><p>Compaiono nell’intestazione di ogni ricevuta.</p>
        <div class="form">
          ${inp('s-nome', 'Nome associazione', a.nome, '', true)}
          ${inp('s-indirizzo', 'Indirizzo / sede', a.indirizzo)}
          ${inp('s-cf', 'Codice fiscale / P. IVA', a.cf)}
          ${inp('s-telefono', 'Telefono', a.telefono)}
          ${inp('s-email', 'Email', a.email)}
          <label class="wide">Nota a piè di ricevuta (facoltativa)<textarea class="field" id="s-nota" rows="2">${esc(a.nota)}</textarea></label>
          <div class="wide logo-box">${a.logo ? `<img src="${esc(a.logo)}" alt="Logo">` : '<span style="color:var(--muted)">Nessun logo</span>'}
            <button class="btn sm" data-act="pick-logo">Scegli logo…</button>${a.logo ? '<button class="btn sm danger" data-act="remove-logo">Rimuovi</button>' : ''}</div>
        </div></section>
      <section class="card"><h2>Ricevute</h2><p>Il progressivo viene assegnato alla stampa e può essere modificato in qualsiasi momento.</p>
        <div class="form">
          ${inp('s-next', 'Prossimo numero ricevuta', s.nextReceipt, 'type="number" min="1"')}
          ${inp('s-prefix', 'Prefisso (es. 2026/)', s.receiptPrefix)}
          ${inp('s-digits', 'Cifre del numero (zeri iniziali)', s.receiptDigits, 'type="number" min="1" max="10"')}
          ${inp('s-quota', 'Quota predefinita € (vuoto = da scrivere a mano)', s.defaultQuota, 'inputmode="decimal"')}
        </div>
        <p class="path" style="margin:10px 0 0">Anteprima numero: <b id="numprev">${esc(s.receiptPrefix + String(s.nextReceipt).padStart(s.receiptDigits, '0'))}</b></p></section>
      <section class="card"><h2>Calendario</h2><p>Soglie dei colori rispetto alla data di oggi: rosso se scaduta, arancione e giallo in base ai giorni mancanti, verde oltre.</p>
        <div class="form">
          ${inp('s-soon', 'Arancione: scade entro (giorni)', s.soonDays, 'type="number" min="1"')}
          ${inp('s-warn', 'Giallo: scade entro (giorni)', s.warnDays, 'type="number" min="2"')}
        </div></section>
      <div class="savebar"><button class="btn primary" data-act="save-settings">Salva impostazioni</button><span id="saved" style="color:var(--muted)">Salva Associazione, Ricevute e Calendario. Le sezioni qui sotto agiscono subito.</span></div>
      <section class="card"><h2>File CSV da leggere</h2>
        <p>Di norma il file esportato da Younity si trova nella cartella <b>Download</b>: l'app cerca lì il file <i>Younity…csv</i> più recente. Puoi indicare un'altra cartella oppure un file preciso.</p>
        ${csvBlock()}
        <div class="d-actions" style="margin-top:12px">
          <button class="btn" data-act="set-csv" data-kind="folder">Scegli cartella…</button>
          <button class="btn" data-act="set-csv" data-kind="file">Scegli file…</button>
          <button class="btn" data-act="set-csv" data-kind="auto" ${App.csv && App.csv.auto && !App.csv.missing ? 'disabled' : ''}>Torna a Download</button></div></section>
      <section class="card"><h2>Archivio dati</h2>
        <p>È il file dove l'app conserva tessere, flag di stampa e numerazione. Puoi tenerlo in un'altra cartella (per esempio su un disco esterno o in una cartella sincronizzata).</p>
        <div class="path" style="margin-bottom:6px">${esc(App.dataFile)}</div>
        <div style="color:var(--muted);font-size:13px;margin-bottom:12px">${App.dataFile === App.defaultDataFile ? 'Posizione predefinita.' : 'Posizione personalizzata.'} Spostando l'archivio, la copia nella vecchia posizione non viene cancellata.</div>
        <div class="d-actions"><button class="btn" data-act="change-archive">Cambia cartella…</button>
          <button class="btn" data-act="change-archive" data-reset="1" ${App.dataFile === App.defaultDataFile ? 'disabled' : ''}>Posizione predefinita</button>
          <button class="btn" data-act="show-data">Mostra nel file manager</button></div></section>
      <section class="card"><h2>Backup e ripristino</h2>
        <p>La copia contiene tutti i dati e le impostazioni (logo compreso) ed è protetta da una firma di integrità. Al ripristino l'app verifica firma e coerenza dei dati prima di toccare qualcosa, e salva a parte una copia dei dati attuali.</p>
        <div class="d-actions"><button class="btn primary" data-act="export-backup">Backup: salva copia…</button>
          <button class="btn" data-act="import-backup">Ripristina da copia…</button></div></section>
      <section class="card"><h2>Informazioni</h2>
        <dl class="kv"><dt>Programma</dt><dd>Tesserati</dd><dt>Versione</dt><dd>${esc(App.version || '')}</dd><dt>Copyright</dt><dd>${esc(App.copyright || '')}</dd></dl></section>
    </div>`;
}

function readSettingsForm() {
  const v = (id) => $('#' + id).value;
  const cur = S();
  return Object.assign({}, cur, {
    assoc: Object.assign({}, cur.assoc, { nome: v('s-nome'), indirizzo: v('s-indirizzo'), cf: v('s-cf'), telefono: v('s-telefono'), email: v('s-email'), nota: v('s-nota') }),
    nextReceipt: v('s-next'), receiptPrefix: v('s-prefix'), receiptDigits: v('s-digits'), defaultQuota: v('s-quota'),
    soonDays: v('s-soon'), warnDays: v('s-warn'),
  });
}

// ======================= Modali =======================
function closeModal() { $('#modal-root').innerHTML = ''; }
function openModal(html, onReady) {
  $('#modal-root').innerHTML = `<div class="overlay" data-act="modal-bg">${html}</div>`;
  if (onReady) onReady($('#modal-root'));
}

function showImportReport(res) {
  const r = res.report;
  const todo = r.nuoviKeys.length;
  const notes = [...r.warnings, ...r.avvisi];
  openModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
    <header><h2 id="mt">${r.firstImport ? 'Primo caricamento completato' : 'File riletto'}</h2></header>
    <div class="mbody">
      <p style="margin:0;color:var(--muted)">${esc(r.file)} · ${r.rows} righe lette</p>
      ${r.firstImport ? `<p>Sono state importate <b>${r.nuovi}</b> tessere, tutte segnate come <b>già stampate</b>. Da ora, a ogni lettura, risulteranno “da stampare” solo i tesserati nuovi.</p>` : `
      <div class="stats">
        <div class="stat ${todo ? 'hl' : ''}"><b>${todo}</b><span>nuove tessere da stampare</span></div>
        <div class="stat"><b>${r.aggiornati}</b><span>aggiornate (dati o stato)</span></div>
        <div class="stat"><b>${r.invariati}</b><span>invariate</span></div>
      </div>`}
      ${notes.length ? `<h3 style="font-family:var(--sans);font-size:13px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:14px 0 0">Da controllare (${notes.length})</h3><ul class="warns">${notes.slice(0, 30).map((n) => `<li>${esc(n)}</li>`).join('')}${notes.length > 30 ? `<li>…e altre ${notes.length - 30}</li>` : ''}</ul>` : ''}
    </div>
    <footer>${todo ? '<button class="btn primary" data-act="goto-todo">Vedi quelli da stampare</button>' : ''}<button class="btn" data-act="close-modal">Chiudi</button></footer></div>`);
}

function openPrintDialog(keys) {
  const { rows } = derive();
  const map = new Map(rows.map((r) => [r.m.key, r]));
  const items = keys.map((k) => map.get(k)).filter(Boolean).sort(byName);
  if (!items.length) return;
  const s = S();
  const existing = items.filter((r) => r.m.receiptNo).length;
  const pages = Math.ceil(items.length / 4);
  openModal(`<div class="modal big" role="dialog" aria-modal="true" aria-labelledby="mt">
    <header><h2 id="mt">Stampa ricevute</h2></header>
    <div class="mbody"><div class="print-grid">
      <div class="ctl">
        <div><b>${items.length}</b> ricevut${items.length === 1 ? 'a' : 'e'} · <b>${pages}</b> foglio${pages === 1 ? '' : 'i'} A4 (4 per foglio)</div>
        <label>Data della ricevuta<input class="field" type="date" id="p-date" value="${todayIso()}"></label>
        <label>Primo numero progressivo<input class="field" type="number" min="1" id="p-start" value="${s.nextReceipt}"></label>
        <label>Quota predefinita (€)<input class="field" id="p-quota" value="${esc(s.defaultQuota)}" inputmode="decimal" placeholder="vuoto = da scrivere a mano"></label>
        <div class="hint">${existing ? `${existing} ${existing === 1 ? 'ricevuta ha' : 'ricevute hanno'} già un numero e lo mantiene${existing === items.length ? '' : '; le altre proseguono dal numero indicato'}. ` : ''}La quota salvata sulla singola tessera ha la precedenza. Se la quota è vuota, resta uno spazio da compilare a mano.</div>
        <div class="hint" id="p-range"></div>
        ${s.assoc.nome ? '' : '<div class="hint" style="color:var(--org-tx);background:var(--org-bg);padding:8px 10px;border-radius:8px">Mancano i dati dell’associazione: inseriscili in Impostazioni per averli sulla ricevuta.</div>'}
      </div>
      <div class="preview" id="pv"></div>
    </div></div>
    <footer><span class="note">Dopo la stampa le tessere risultano “stampate” e il progressivo avanza.</span>
      <button class="btn" data-act="close-modal">Annulla</button>
      <button class="btn" data-act="do-print" data-mode="pdf">Salva PDF…</button>
      <button class="btn primary" data-act="do-print" data-mode="print">${ICON.print} Stampa</button></footer></div>`, () => {
    const build = () => {
      const date = $('#p-date').value || todayIso();
      let n = Math.max(1, parseInt($('#p-start').value, 10) || 1);
      const defQuota = $('#p-quota').value.trim();
      const out = [];
      const receipts = [];
      let lastNew = null;
      for (const r of items) {
        let no = r.m.receiptNo;
        let label = r.m.receiptLabel;
        if (!no) { no = n++; label = s.receiptPrefix + String(no).padStart(s.receiptDigits, '0'); lastNew = no; }
        const quota = r.m.quota || defQuota;
        out.push({ p: r.p, m: r.m, label: label || String(no), quota, date });
        receipts.push({ key: r.m.key, no, label: label || String(no), quota, date });
      }
      const nums = receipts.map((x) => x.no);
      $('#p-range').textContent = `Numeri: dal ${s.receiptPrefix}${String(Math.min(...nums)).padStart(s.receiptDigits, '0')} al ${s.receiptPrefix}${String(Math.max(...nums)).padStart(s.receiptDigits, '0')}.`;
      const html = Receipt.build(out, s.assoc);
      openPrintDialog.current = { html, receipts, nextReceipt: lastNew != null ? lastNew + 1 : NaN };
      const pv = $('#pv');
      const scale = Math.min(1, Math.max(300, pv.clientWidth - 48) / 794);
      const H = pages * (1123 + 18) + 28;
      pv.innerHTML = `<div style="width:${794 * scale + 24}px;height:${H * scale}px;overflow:hidden"><iframe sandbox title="Anteprima ricevute" style="width:794px;height:${H}px;transform:scale(${scale});margin-left:12px"></iframe></div>`;
      $('iframe', pv).srcdoc = Receipt.build(out, s.assoc, { preview: true });
    };
    let t;
    for (const id of ['p-date', 'p-start', 'p-quota']) $('#' + id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(build, 200); });
    build();
  });
}

function showRestoreDialog(r) {
  const s = r.summary;
  const when = s && s.createdAt ? new Date(s.createdAt).toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' }) : 'data non indicata';
  const check = (ok, text) => `<li style="list-style:none;margin:4px 0">${ok ? '<span class="badge ok">✓</span>' : '<span class="badge expired">✕</span>'} ${text}</li>`;
  const sigOk = r.signed && r.ok;
  openModal(`<div class="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
    <header><h2 id="mt">${r.ok ? 'Ripristinare questa copia?' : 'Copia non utilizzabile'}</h2></header>
    <div class="mbody">
      <p style="margin:0;color:var(--muted)">${esc(r.name)}</p>
      <ul style="padding:0;margin:12px 0">
        ${r.signed ? check(r.ok || !r.errors.some((e) => e.startsWith('Firma')), 'Firma di integrità ' + (r.errors.some((e) => e.startsWith('Firma')) ? 'NON corrispondente' : 'verificata')) : check(false, 'File senza firma di integrità (formato semplice): è stato verificato solo il contenuto')}
        ${check(!r.errors.some((e) => !e.startsWith('Firma')), r.errors.some((e) => !e.startsWith('Firma')) ? 'Coerenza dei dati: problemi trovati' : 'Coerenza dei dati verificata')}
      </ul>
      ${s ? `<div class="stats"><div class="stat"><b>${s.persons}</b><span>tesserati</span></div><div class="stat"><b>${s.memberships}</b><span>tessere</span></div><div class="stat"><b>${s.toPrint}</b><span>da stampare</span></div></div>
        <p style="color:var(--muted);margin:0">Copia creata il ${esc(when)}${s.appVersion ? ' con la versione ' + esc(s.appVersion) : ''}.</p>` : ''}
      ${r.errors.length ? `<ul class="warns">${r.errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join('')}${r.errors.length > 8 ? `<li>…e altri ${r.errors.length - 8} problemi</li>` : ''}</ul>` : ''}
      ${r.ok ? `<p style="margin:14px 0 0"><b>Attenzione:</b> i dati attuali (${Object.keys(App.data.memberships).length} tessere) verranno sostituiti. Prima del ripristino ne viene salvata una copia accanto all’archivio.</p>` : '<p style="margin:14px 0 0">Il ripristino è stato bloccato per non danneggiare i dati attuali, che restano intatti.</p>'}
    </div>
    <footer><button class="btn" data-act="close-modal">${r.ok ? 'Annulla' : 'Chiudi'}</button>${r.ok ? `<button class="btn primary" data-act="do-restore" data-path="${esc(r.path)}">Ripristina</button>` : ''}</footer></div>`);
}

async function doPrint(mode) {
  const cur = openPrintDialog.current;
  if (!cur) return;
  const btns = document.querySelectorAll('.modal footer .btn');
  btns.forEach((b) => (b.disabled = true));
  try {
    const res = await window.api.print({ html: cur.html, mode, receipts: cur.receipts, nextReceipt: cur.nextReceipt });
    if (res.canceled) { toast('Stampa annullata: nessuna tessera segnata.'); btns.forEach((b) => (b.disabled = false)); return; }
    setData(res);
    closeModal();
    App.sel.clear();
    render();
    toast(mode === 'pdf' ? `PDF salvato · ${cur.receipts.length} tessere segnate come stampate` : `${cur.receipts.length} tessere segnate come stampate`);
  } catch (e) {
    btns.forEach((b) => (b.disabled = false));
    toast('Errore: ' + e.message);
  }
}

// ======================= Azioni =======================
async function reload(pick) {
  if (App.busy) return;
  App.busy = true; renderSide();
  try {
    const res = await window.api.importCsv({ pick: !!pick });
    if (res.canceled) return;
    setData(res);
    App.sel.clear();
    render();
    showImportReport(res);
  } catch (e) {
    toast('Errore: ' + e.message);
  } finally {
    App.busy = false; renderSide();
  }
}

async function patch(keys, p, msg) {
  const res = await window.api.updateMemberships(keys, p);
  setData(res);
  render();
  if (msg) toast(msg);
}

function go(view) {
  App.view = view;
  if (view === 'calendario' || view === 'impostazioni') App.detailKey = null;
  App.sel.clear();
  if (view === 'stampare') App.filters.scad = '';
  render();
  $('#main').scrollTop = 0;
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const nav = t.closest('[data-nav]');
  if (nav) return go(nav.dataset.nav);

  const sortTh = t.closest('[data-sort]');
  if (sortTh) {
    const k = sortTh.dataset.sort;
    App.sort = { key: k, dir: App.sort.key === k ? -App.sort.dir : 1 };
    render();
    return;
  }

  const hideBtn = t.closest('[data-hide]');
  if (hideBtn) {
    e.stopPropagation();
    const m = App.data.memberships[hideBtn.dataset.hide];
    return patch([m.key], { hidden: !m.hidden }, m.hidden ? 'Rimessa nel calendario.' : 'Rimossa dal calendario (resta nell’archivio).');
  }

  const open = t.closest('[data-open]');
  if (open) { App.detailKey = open.dataset.open; renderTableIfAny(); renderDrawer(); return; }

  const cal = t.closest('[data-cal]');
  if (cal) {
    const c = App.cal, a = cal.dataset.cal;
    if (a === 'prev' || a === 'next') {
      const d = a === 'prev' ? -1 : 1;
      if (c.mode === 'mese') { const x = new Date(c.y, c.m + d, 1); c.y = x.getFullYear(); c.m = x.getMonth(); c.day = null; } else c.y += d;
    } else if (a === 'today') { const n = new Date(); c.y = n.getFullYear(); c.m = n.getMonth(); c.day = null; }
    else if (a === 'mese' || a === 'anno') c.mode = a;
    else if (a === 'clearday') c.day = null;
    return render();
  }
  const month = t.closest('[data-month]');
  if (month) { App.cal.m = Number(month.dataset.month); App.cal.mode = 'mese'; App.cal.day = null; return render(); }
  const day = t.closest('[data-day]');
  if (day) { App.cal.day = App.cal.day === day.dataset.day ? null : day.dataset.day; return render(); }

  const row = t.closest('tr[data-key]');
  if (row && !t.closest('input')) { App.detailKey = row.dataset.key; renderTable(); renderDrawer(); return; }

  const act = t.closest('[data-act]');
  if (!act) return;
  if (act.classList.contains('overlay') && t !== act) return;
  const a = act.dataset.act;
  try {
    switch (a) {
      case 'modal-bg': if (t === act) closeModal(); break;
      case 'close-modal': closeModal(); break;
      case 'reload': await reload(false); break;
      case 'pick-import': await reload(true); break;
      case 'goto-todo': closeModal(); go('stampare'); break;
      case 'close-drawer': App.detailKey = null; renderTableIfAny(); renderDrawer(); break;
      case 'print-one': openPrintDialog([App.detailKey]); break;
      case 'print-sel': openPrintDialog([...App.sel]); break;
      case 'print-all-todo': openPrintDialog(derive().todo.map((r) => r.m.key)); break;
      case 'clear-sel': App.sel.clear(); renderTable(); break;
      case 'flag-one': await patch([App.detailKey], { printed: act.dataset.v === '1' }, act.dataset.v === '1' ? 'Segnata come stampata.' : 'Rimessa tra quelle da stampare.'); break;
      case 'flag-sel': { const n = App.sel.size; await patch([...App.sel], { printed: act.dataset.v === '1' }, `${n} tessere aggiornate.`); App.sel.clear(); render(); break; }
      case 'mark-all-printed':
        if (confirm(`Segnare tutte le ${derive().todo.length} ricevute come già stampate?`)) await patch(derive().todo.map((r) => r.m.key), { printed: true }, 'Fatto: nulla più da stampare.');
        break;
      case 'toggle-hidden': { const m = App.data.memberships[App.detailKey]; await patch([m.key], { hidden: !m.hidden }, m.hidden ? 'Rimessa nel calendario.' : 'Rimossa dal calendario (resta nell’archivio).'); break; }
      case 'save-quota': await patch([App.detailKey], { quota: $('#quota').value.trim() }, 'Quota salvata.'); break;
      case 'do-print': await doPrint(act.dataset.mode); break;
      case 'save-settings': {
        setData(await window.api.saveSettings(readSettingsForm()));
        renderSide();
        $('#saved').textContent = 'Impostazioni salvate ✓';
        render();
        toast('Impostazioni salvate.');
        break;
      }
      case 'pick-logo': { const logo = await window.api.pickLogo(); if (logo) { const cur = readSettingsForm(); cur.assoc.logo = logo; setData(await window.api.saveSettings(cur)); render(); } break; }
      case 'remove-logo': { const cur = readSettingsForm(); cur.assoc.logo = ''; setData(await window.api.saveSettings(cur)); render(); break; }
      case 'export-backup': {
        const r = await window.api.exportBackup();
        if (!r.canceled) toast(`Copia salvata e verificata: ${r.summary.persons} tesserati, ${r.summary.memberships} tessere.`);
        break;
      }
      case 'import-backup': {
        const r = await window.api.inspectBackup();
        if (!r.canceled) showRestoreDialog(r);
        break;
      }
      case 'do-restore': {
        const res = await window.api.applyBackup(act.dataset.path);
        setData(res); App.sel.clear(); App.detailKey = null; closeModal(); render();
        toast('Dati ripristinati. Copia dei dati precedenti salvata accanto all’archivio.');
        break;
      }
      case 'set-csv': { const r = await window.api.setCsv(act.dataset.kind); if (!r.canceled) { setData(r); render(); toast('Origine del file CSV aggiornata.'); } break; }
      case 'change-archive': {
        const r = await window.api.changeArchive(!!act.dataset.reset);
        if (r.canceled || r.unchanged) break;
        setData(r); App.sel.clear(); App.detailKey = null; render();
        toast(r.useExisting ? 'Ora usi l’archivio presente nella nuova cartella.' : 'Archivio spostato nella nuova cartella.');
        break;
      }
      case 'set-theme': setData(await window.api.setTheme(act.dataset.v)); render(); break;
      case 'show-data': await window.api.showDataFile(); break;
      default: break;
    }
  } catch (err) {
    toast('Errore: ' + err.message);
  }
});

function renderTableIfAny() { if ($('#tbody')) renderTable(); if (App.view === 'calendario') { /* niente */ } }

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'selall') {
    (t._keys || []).forEach((k) => (t.checked ? App.sel.add(k) : App.sel.delete(k)));
    renderTable();
  } else if (t.dataset.sel) {
    t.checked ? App.sel.add(t.dataset.sel) : App.sel.delete(t.dataset.sel);
    renderTable();
  } else if (t.dataset.filter) {
    App.filters[t.dataset.filter] = t.type === 'checkbox' ? t.checked : t.value;
    renderTable();
  } else if (t.hasAttribute('data-cal-hidden')) { App.cal.showHidden = t.checked; render(); }
});
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.filter === 'q') { App.filters.q = t.value; renderTable(); }
  if (['s-next', 's-prefix', 's-digits'].includes(t.id)) {
    const p = $('#s-prefix').value, d = Math.max(1, parseInt($('#s-digits').value, 10) || 4), n = Math.max(1, parseInt($('#s-next').value, 10) || 1);
    $('#numprev').textContent = p + String(n).padStart(d, '0');
  }
});
document.addEventListener('focusout', async (e) => {
  if (e.target.id === 'note' && App.detailKey) {
    const m = App.data.memberships[App.detailKey];
    const p = App.data.persons[m.personId];
    if (p && p.note !== e.target.value) { setData(await window.api.updatePerson(p.id, { note: e.target.value })); toast('Nota salvata.'); }
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if ($('#modal-root').firstChild) closeModal();
    else if (App.detailKey) { App.detailKey = null; renderTableIfAny(); renderDrawer(); }
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.day[data-day]')) { e.preventDefault(); e.target.click(); }
});

// ======================= Avvio =======================
(async function init() {
  const snap = await window.api.getState();
  setData(snap);
  render();
  if (snap.warning) openModal(`<div class="modal"><header><h2>Attenzione</h2></header><div class="mbody"><p>${esc(snap.warning)}</p></div><footer><button class="btn primary" data-act="close-modal">Ho capito</button></footer></div>`);
  // Se si lascia la finestra aperta a cavallo di mezzanotte, ricalcola i colori.
  let day = todayIso();
  setInterval(() => { if (todayIso() !== day) { day = todayIso(); render(); } }, 60000);
})();
