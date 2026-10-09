'use strict';
// Generazione HTML delle ricevute: 4 per foglio A4 (2 x 2), con linee di taglio.
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

  function formatQuota(q) {
    const s = String(q == null ? '' : q).trim();
    if (!s) return '';
    const n = Number(s.replace(/\./g, '').replace(',', '.'));
    if (Number.isFinite(n) && /^[\d.,\s]+$/.test(s)) return '€ ' + n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return s;
  }

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  // "2026-10" -> "ottobre 2026"
  function periodLabel(p) {
    const m = /^(\d{4})-(\d{2})$/.exec(p || '');
    return m && MESI[Number(m[2]) - 1] ? `${MESI[Number(m[2]) - 1]} ${m[1]}` : '';
  }
  function seasonLabel(y) {
    const n = Number(y);
    return /^\d{4}$/.test(String(y)) ? `${n}/${String((n + 1) % 100).padStart(2, '0')}` : '';
  }
  function causale(tipo, periodo) {
    // 'corso' = iscrizione al corso (periodo = anno della stagione); 'mensile' = rata mensile del corso (periodo = mese)
    if (tipo === 'corso') { const s = seasonLabel(periodo); return s ? `Corso ${s} – iscrizione` : 'Corso – iscrizione'; }
    if (tipo !== 'mensile') return 'Tessera associativa – quota annuale';
    const mese = periodLabel(periodo);
    const y = Number((periodo || '').slice(0, 4)), mo = Number((periodo || '').slice(5, 7));
    const stagione = mo >= 11 ? y : mo >= 1 && mo <= 5 ? y - 1 : null;
    const sl = stagione ? seasonLabel(stagione) : '';
    return mese ? `Corso${sl ? ' ' + sl : ''} – rata di ${mese}` : 'Corso – rata mensile';
  }

  function row(label, value) {
    return `<div class="r"><span class="l">${esc(label)}</span><span class="v">${value ? esc(value) : '<i class="blank"></i>'}</span></div>`;
  }

  function cell(item, assoc) {
    if (!item) return '<div class="cell"></div>';
    const { p, m, label, quota, date, method, tipo, periodo } = item;
    const mensile = tipo === 'mensile';
    const corso = tipo === 'corso';
    const q = formatQuota(quota);
    const nasc = [fmtDate(p.nascita), p.provNascita ? `(${p.provNascita})` : p.cf && /Z\d{3}/.test(p.cf.slice(11, 15)) ? '(estero)' : ''].filter(Boolean).join(' ');
    const resid = [p.indirizzo, p.citta].filter(Boolean).join(' – ');
    const head = `
      <div class="head">
        ${assoc.logo ? `<img class="logo" src="${esc(assoc.logo)}" alt="">` : ''}
        <div class="who">
          <div class="an">${esc(assoc.nome || 'Nome dell’associazione')}</div>
          <div class="ad">${esc([assoc.indirizzo, assoc.cf && `C.F. ${assoc.cf}`, assoc.telefono, assoc.email].filter(Boolean).join(' · '))}</div>
        </div>
      </div>`;
    return `
    <div class="cell">
      ${head}
      <div class="title"><span>${mensile || corso ? 'Ricevuta corso' : 'Ricevuta di tesseramento'}</span><b>N° ${esc(label)}</b></div>
      <div class="date">del ${esc(fmtDate(date))}</div>
      <div class="rows">
        <div class="r causale"><span class="l">Causale</span><span class="v">${esc(causale(tipo, periodo))}</span></div>
        ${row('Tessera ID', p.id)}
        ${row('Tesserato', `${p.cognome} ${p.nome}`)}
        ${row('Nato/a il', nasc)}
        ${row('Codice fiscale', p.cf)}
        ${row('Residenza', resid)}
        ${row('Email', p.email)}
        ${row('Cellulare', p.cell)}
        ${row('Iscrizione', fmtDate(m.iscrizione))}
        ${row('Scadenza', fmtDate(m.scadenza))}
        ${row('Stato', m.stato)}
      </div>
      <div class="quota"><span>${mensile ? 'Rata del corso versata' : corso ? 'Iscrizione al corso versata' : 'Quota associativa versata'}</span><b>${q ? esc(q) : '€ <i class="line"></i>'}</b></div>
      <div class="pay"><span class="l2">Metodo di pagamento</span>${method ? `<b>${esc(method)}</b>` : ['Contanti', 'POS', 'Bonifico'].map((x) => `<span class="opt"><i class="box"></i>${x}</span>`).join('')}</div>
      <div class="foot">
        <div class="sig"><i></i><span>Firma per l’associazione</span></div>
        ${assoc.nota ? `<div class="nota">${esc(assoc.nota)}</div>` : ''}
      </div>
    </div>`;
  }

  const CSS = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #1d1717; font-family: "Helvetica Neue", Arial, "Segoe UI", sans-serif; }
  .page { width: 210mm; height: 297mm; display: grid; grid-template-columns: 105mm 105mm; grid-template-rows: 148.5mm 148.5mm; page-break-after: always; break-after: page; overflow: hidden; background: #fff; }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .cell { width: 105mm; height: 148.5mm; padding: 8mm 8mm 6mm; display: flex; flex-direction: column; font-size: 8.4pt; line-height: 1.3; border: 0 dashed #9a9086; overflow: hidden; }
  .cell:nth-child(odd) { border-right-width: .3mm; }
  .cell:nth-child(-n+2) { border-bottom-width: .3mm; }
  .head { display: flex; align-items: center; gap: 3mm; padding-bottom: 2.4mm; border-bottom: .35mm solid #1d1717; }
  .logo { height: 12mm; max-width: 22mm; object-fit: contain; }
  .an { font-weight: 700; font-size: 10.5pt; line-height: 1.15; }
  .ad { font-size: 6.8pt; color: #555; margin-top: .6mm; }
  .title { display: flex; justify-content: space-between; align-items: baseline; margin-top: 3.2mm; font-size: 9pt; text-transform: uppercase; letter-spacing: .06em; }
  .title b { font-size: 11pt; letter-spacing: 0; }
  .date { font-size: 7.6pt; color: #555; margin-bottom: 2.4mm; text-align: right; }
  .rows { border-top: .2mm solid #bbb; }
  .r { display: flex; gap: 2mm; padding: 1.15mm 0; border-bottom: .2mm solid #d9d4cd; }
  .l { flex: 0 0 28mm; color: #666; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .03em; padding-top: .3mm; }
  .v { flex: 1; font-weight: 600; word-break: break-word; }
  .causale .v { font-size: 9pt; }
  .blank { display: inline-block; width: 100%; border-bottom: .2mm dotted #999; height: 3mm; }
  .quota { margin-top: 3.4mm; display: flex; justify-content: space-between; align-items: baseline; padding: 2.2mm 2.6mm; border: .35mm solid #1d1717; font-size: 8.6pt; }
  .quota b { font-size: 11pt; min-width: 32mm; text-align: right; }
  .line { display: inline-block; width: 26mm; border-bottom: .3mm solid #1d1717; height: 4mm; vertical-align: bottom; }
  .pay { display: flex; align-items: center; gap: 4mm; margin-top: 2.6mm; font-size: 8.4pt; }
  .pay .l2 { color: #666; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .03em; margin-right: auto; }
  .pay b { font-size: 10pt; }
  .pay .opt { display: inline-flex; align-items: center; gap: 1.4mm; }
  .box { display: inline-block; width: 3.4mm; height: 3.4mm; border: .3mm solid #1d1717; }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 2mm; }
  .sig { align-self: flex-end; width: 46mm; text-align: center; }
  .sig i { display: block; height: 9mm; border-bottom: .25mm solid #1d1717; }
  .sig span { font-size: 6.8pt; color: #666; }
  .nota { font-size: 6.4pt; color: #666; line-height: 1.25; }
  `;
  const PREVIEW_CSS = `html,body{background:#d9d2c7}body{padding:14px 0}.page{margin:0 auto 18px;box-shadow:0 2px 14px rgba(0,0,0,.25)}`;

  function build(items, assoc, { preview = false } = {}) {
    const pages = [];
    for (let i = 0; i < items.length; i += 4) pages.push(items.slice(i, i + 4));
    const body = pages.map((pg) => `<section class="page">${[0, 1, 2, 3].map((k) => cell(pg[k], assoc)).join('')}</section>`).join('');
    return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Ricevute</title><style>${CSS}${preview ? PREVIEW_CSS : ''}</style></head><body>${body}</body></html>`;
  }

  window.Receipt = { build, formatQuota, esc, periodLabel, causale, seasonLabel };
})();
