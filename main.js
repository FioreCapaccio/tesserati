'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readMembers, newestMatching } = require('./core/csv');
const S = require('./core/store');
const B = require('./core/backup');

const COPYRIGHT = `© ${new Date().getFullYear()} Fioravante Capaccio`;

if (process.env.TESSERATI_USERDATA) app.setPath('userData', process.env.TESSERATI_USERDATA);

if (process.env.TESSERATI_THEME) require('electron').nativeTheme.themeSource = process.env.TESSERATI_THEME;

let win;
let state = S.emptyState();
let dataFile;

// ---------- Salvataggio ----------
const DATA_NAME = 'tesserati-data.json';
const locFile = () => path.join(app.getPath('userData'), 'location.json');
let startupWarning = '';

// La posizione dell'archivio è modificabile: la scelta è tenuta in un piccolo file fisso.
function resolveDataFile() {
  let dir = app.getPath('userData');
  try {
    const c = JSON.parse(fs.readFileSync(locFile(), 'utf8'));
    if (c.dataDir) {
      if (fs.existsSync(c.dataDir)) dir = c.dataDir;
      else startupWarning = `La cartella dell'archivio (${c.dataDir}) non è raggiungibile: uso quella predefinita. Ricollega il disco e rimetti la posizione dalle Impostazioni.`;
    }
  } catch (_) { /* nessuna scelta salvata */ }
  return path.join(dir, DATA_NAME);
}

function loadState() {
  dataFile = resolveDataFile();
  for (const f of [dataFile, dataFile + '.bak']) {
    if (!fs.existsSync(f)) continue;
    try {
      state = S.normalizeState(JSON.parse(fs.readFileSync(f, 'utf8')));
      if (f !== dataFile) startupWarning = (startupWarning + ' L\'archivio principale non era leggibile: ripristinata l\'ultima copia automatica.').trim();
      return;
    } catch (_) { /* prova il prossimo */ }
  }
  if (fs.existsSync(dataFile)) {
    const bad = `${dataFile}.danneggiato-${Date.now()}`;
    try { fs.renameSync(dataFile, bad); startupWarning = (startupWarning + ` L'archivio non era leggibile ed è stato messo da parte in ${bad}.`).trim(); } catch (_) {}
  }
  state = S.emptyState();
}

function saveState() {
  const tmp = dataFile + '.tmp';
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state));
  try { if (fs.existsSync(dataFile)) fs.copyFileSync(dataFile, dataFile + '.bak'); } catch (_) {}
  fs.renameSync(tmp, dataFile);
}

// ---------- File CSV: predefinito = cartella Download ----------
function resolveCsv() {
  const raw = state.settings.csvPath || '';
  const missing = !!raw && !fs.existsSync(raw);
  const target = raw && !missing ? raw : app.getPath('downloads');
  let isFile = false;
  try { isFile = fs.statSync(target).isFile(); } catch (_) {}
  return {
    setting: raw, missing, auto: !raw || missing, target,
    kind: isFile ? 'file' : 'folder',
    folder: isFile ? path.dirname(target) : target,
    file: isFile ? target : newestMatching(target),
  };
}

const snapshot = () => ({ state, dataFile, version: app.getVersion(), copyright: COPYRIGHT, csv: resolveCsv(), defaultDataFile: path.join(app.getPath('userData'), DATA_NAME), warning: startupWarning });

// ---------- Finestra ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 680,
    title: 'Tesserati',
    backgroundColor: '#f6f1e9',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// ---------- IPC ----------
const handle = (name, fn) => ipcMain.handle(name, async (_e, ...args) => {
  try { return { ok: true, data: await fn(...args) }; }
  catch (err) { return { ok: false, error: err.message || String(err) }; }
});

handle('state:get', () => snapshot());

handle('settings:save', (settings) => { S.saveSettings(state, settings); saveState(); return snapshot(); });

handle('import:run', async ({ pick } = {}) => {
  const info = resolveCsv();
  let file = pick ? null : info.file;
  if (!file) {
    const r = await dialog.showOpenDialog(win, {
      title: pick ? 'Scegli il file CSV da leggere' : 'File CSV non trovato: sceglilo',
      message: `Cerco un file tipo "Younity.csv" in: ${info.folder}`,
      defaultPath: info.folder,
      properties: ['openFile'],
      filters: [{ name: 'File CSV', extensions: ['csv', 'txt'] }, { name: 'Tutti i file', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    file = r.filePaths[0];
  }
  const { records, warnings } = readMembers(fs.readFileSync(file));
  const report = S.importRecords(state, records, { file: path.basename(file), warnings });
  saveState();
  return { report, ...snapshot() };
});

handle('csv:set', async ({ kind }) => {
  const info = resolveCsv();
  if (kind === 'auto') state.settings.csvPath = '';
  else {
    const r = await dialog.showOpenDialog(win, kind === 'folder'
      ? { title: 'Cartella dove si trova il file CSV', defaultPath: info.folder, properties: ['openDirectory'] }
      : { title: 'Scegli il file CSV', defaultPath: info.folder, properties: ['openFile'], filters: [{ name: 'File CSV', extensions: ['csv', 'txt'] }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    state.settings.csvPath = r.filePaths[0];
  }
  saveState();
  return snapshot();
});

handle('archive:change', async ({ reset }) => {
  let dir;
  if (reset) dir = app.getPath('userData');
  else {
    const r = await dialog.showOpenDialog(win, { title: 'Cartella dove tenere l\'archivio dei tesserati', defaultPath: path.dirname(dataFile), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    dir = r.filePaths[0];
  }
  const target = path.join(dir, DATA_NAME);
  if (path.resolve(target) === path.resolve(dataFile)) return { unchanged: true, ...snapshot() };
  fs.mkdirSync(dir, { recursive: true });
  fs.accessSync(dir, fs.constants.W_OK);
  let useExisting = false;
  if (fs.existsSync(target)) {
    const ex = await dialog.showMessageBox(win, {
      type: 'question', buttons: ['Usa l\'archivio presente', 'Sostituiscilo con quello attuale', 'Annulla'], defaultId: 2, cancelId: 2,
      message: 'Nella cartella scelta esiste già un archivio.',
      detail: 'Puoi usare quello che c\'è (i dati attuali restano nella vecchia posizione) oppure sostituirlo con i dati attuali (l\'archivio presente viene prima copiato di lato).',
    });
    if (ex.response === 2) return { canceled: true };
    if (ex.response === 0) {
      const parsed = JSON.parse(fs.readFileSync(target, 'utf8'));
      const errs = B.checkStructure(parsed);
      if (errs.length) throw new Error('L\'archivio presente nella cartella non è valido: ' + errs[0]);
      state = S.normalizeState(parsed);
      useExisting = true;
    } else fs.copyFileSync(target, `${target}.prima-della-sostituzione-${Date.now()}.bak`);
  }
  const oldFile = dataFile;
  dataFile = target;
  try { saveState(); } catch (e) { dataFile = oldFile; throw e; }
  fs.writeFileSync(locFile(), JSON.stringify({ dataDir: reset ? '' : dir }));
  startupWarning = '';
  return { moved: true, useExisting, from: oldFile, ...snapshot() };
});

handle('membership:update', ({ keys, patch }) => { S.updateMemberships(state, keys, patch); saveState(); return snapshot(); });
handle('person:update', ({ id, patch }) => { S.updatePerson(state, id, patch); saveState(); return snapshot(); });

handle('logo:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Scegli il logo', properties: ['openFile'], filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  const f = r.filePaths[0];
  const ext = path.extname(f).slice(1).toLowerCase().replace('jpg', 'jpeg');
  const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
  const buf = fs.readFileSync(f);
  if (buf.length > 3 * 1024 * 1024) throw new Error('Il logo supera 3 MB: usa un\'immagine più leggera.');
  return `data:${mime};base64,${buf.toString('base64')}`;
});

handle('backup:export', async () => {
  const stamp = new Date().toISOString().slice(0, 10);
  const r = await dialog.showSaveDialog(win, { title: 'Salva copia di sicurezza', defaultPath: path.join(app.getPath('documents'), `tesserati-backup-${stamp}.json`), filters: [{ name: 'Copia di sicurezza', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, JSON.stringify(B.makeBackup(state, app.getVersion())));
  // Rilettura di controllo: la copia deve risultare integra prima di dirlo all'utente.
  const check = B.verifyBackup(JSON.parse(fs.readFileSync(r.filePath, 'utf8')));
  if (!check.ok) throw new Error('La copia è stata scritta ma non supera la verifica: ' + check.errors[0]);
  return { path: r.filePath, summary: check.summary };
});

function readBackupFile(file) {
  let obj;
  try { obj = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (_) { return { ok: false, errors: ['Il file non è leggibile come copia di sicurezza (JSON non valido o troncato).'], signed: false, summary: null }; }
  return B.verifyBackup(obj);
}

handle('backup:inspect', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Scegli la copia da ripristinare', properties: ['openFile'], filters: [{ name: 'Copia di sicurezza', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const v = readBackupFile(r.filePaths[0]);
  return { path: r.filePaths[0], name: path.basename(r.filePaths[0]), ok: v.ok, errors: v.errors, signed: v.signed, summary: v.summary };
});

handle('backup:apply', async ({ path: file }) => {
  const v = readBackupFile(file); // si ricontrolla: il file potrebbe essere cambiato dopo l'anteprima
  if (!v.ok) throw new Error('La copia non supera il controllo di integrità: ' + v.errors[0]);
  // Copia di sicurezza automatica dei dati attuali, accanto all'archivio.
  const safety = `${dataFile}.prima-del-ripristino.json`;
  fs.writeFileSync(safety, JSON.stringify(B.makeBackup(state, app.getVersion())));
  state = S.normalizeState(v.state);
  saveState();
  return { safety, ...snapshot() };
});

handle('shell:showData', () => { shell.showItemInFolder(dataFile); return true; });

// ---------- Stampa ricevute ----------
async function withPrintWindow(html, fn) {
  const tmp = path.join(os.tmpdir(), `tesserati-ricevute-${Date.now()}.html`);
  fs.writeFileSync(tmp, html);
  const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await w.loadFile(tmp);
    await w.webContents.executeJavaScript('Promise.all([...document.images].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r})))');
    return await fn(w);
  } finally {
    w.destroy();
    fs.unlink(tmp, () => {});
  }
}

handle('print:run', async ({ html, mode, receipts, nextReceipt }) => {
  if (!receipts || !receipts.length) throw new Error('Nessuna ricevuta da stampare.');
  const done = () => { S.commitPrint(state, receipts, nextReceipt); saveState(); return snapshot(); };

  if (mode === 'pdf') {
    const r = await dialog.showSaveDialog(win, { title: 'Salva ricevute in PDF', defaultPath: path.join(app.getPath('documents'), `ricevute-${new Date().toISOString().slice(0, 10)}.pdf`), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    const pdf = await withPrintWindow(html, (w) => w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true, margins: { marginType: 'none' } }));
    fs.writeFileSync(r.filePath, pdf);
    return { saved: r.filePath, ...done() };
  }

  const result = await withPrintWindow(html, (w) => new Promise((resolve) => {
    w.webContents.print({ silent: false, printBackground: true, pageSize: 'A4', margins: { marginType: 'none' } }, (success, reason) => resolve({ success, reason }));
  }));
  if (!result.success) return { canceled: true, reason: result.reason };
  return { printed: true, ...done() };
});

// ---------- Avvio ----------
app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'Tesserati', applicationVersion: app.getVersion(), version: '', copyright: COPYRIGHT });
  loadState();
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    ]));
  } else Menu.setApplicationMenu(null);
  createWindow();
  if (process.env.TESSERATI_SMOKE) require('./test/smoke')({ win, state: () => state, saveState, snapshot, S, app });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
