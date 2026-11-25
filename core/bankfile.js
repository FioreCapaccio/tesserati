'use strict';
// Lettura del file dell'estratto conto (PDF, Excel .xlsx, CSV) -> { movements, saldoIniziale, saldoFinale }.

const fs = require('fs');
const path = require('path');
const { decodeBuffer, parseCsv } = require('./csv');
const Bank = require('./bank');

// Frammenti di testo con coordinate, pagina per pagina.
async function readPdfTokens(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    pages.push(tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width })));
  }
  await doc.destroy();
  return pages;
}

async function readStatement(file, mapping) {
  const ext = path.extname(file).toLowerCase();
  const buf = fs.readFileSync(file);
  if (ext === '.pdf') {
    const parsed = Bank.parsePdfTokens(await readPdfTokens(buf));
    if (!parsed.movements.length) throw new Error('Nel PDF non trovo la tabella dei movimenti (colonne DATA, VALUTA, MOV.DARE, MOV.AVERE). Può essere una scansione o un altro formato: prova con il file Excel o CSV della banca.');
    return parsed;
  }
  if (ext === '.xlsx') { const { readSheet } = require('read-excel-file/node'); return Bank.parseTable(await readSheet(buf), mapping); }
  if (ext === '.csv' || ext === '.txt') return Bank.parseTable(parseCsv(decodeBuffer(buf)), mapping);
  if (ext === '.xls') throw new Error('Il vecchio formato .xls non è supportato: salva il file come .xlsx o CSV.');
  throw new Error('Formato non riconosciuto: usa PDF, Excel (.xlsx) o CSV.');
}

module.exports = { readStatement, readPdfTokens };
