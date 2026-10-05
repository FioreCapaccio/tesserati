'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readMembers } = require('./core/csv');
const S = require('./core/store');

if (process.env.TESSERATI_USERDATA) app.setPath('userData', process.env.TESSERATI_USERDATA);

if (process.env.TESSERATI_THEME) require('electron').nativeTheme.themeSource = process.env.TESSERATI_THEME;

let win;
let state = S.emptyState();
let dataFile;

// ---------- Salvataggio ----------
function loadState() {
  dataFile = path.join(app.getPath('userData'), 'tesserati-data.json');
  for (const f of [dataFile, dataFile + '.bak']) {
    try {
      state = S.normalizeState(JSON.parse(fs.readFileSync(f, 'utf8')));
      return;
    } catch (_) { /* prova il prossimo */ }
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

const snapshot = () => ({ state, dataFile });

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
  let file = state.settings.csvPath;
  if (pick || !file || !fs.existsSync(file)) {
    const r = await dialog.showOpenDialog(win, {
      title: 'Scegli il file CSV dei tesserati',
      defaultPath: file && fs.existsSync(path.dirname(file)) ? path.dirname(file) : app.getPath('documents'),
      properties: ['openFile'],
      filters: [{ name: 'File CSV', extensions: ['csv', 'txt'] }, { name: 'Tutti i file', extensions: ['*'] }],
    });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    file = r.filePaths[0];
  }
  const { records, warnings } = readMembers(fs.readFileSync(file));
  state.settings.csvPath = file;
  const report = S.importRecords(state, records, { file: path.basename(file), warnings });
  saveState();
  return { report, ...snapshot() };
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
  const r = await dialog.showSaveDialog(win, { title: 'Salva copia dei dati', defaultPath: `tesserati-backup-${stamp}.json`, filters: [{ name: 'Backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return { canceled: true };
  fs.writeFileSync(r.filePath, JSON.stringify(state, null, 1));
  return { path: r.filePath };
});

handle('backup:import', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Ripristina una copia dei dati', properties: ['openFile'], filters: [{ name: 'Backup', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  const parsed = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
  if (!parsed || typeof parsed !== 'object' || !parsed.memberships || !parsed.persons) throw new Error('Il file non è una copia dei dati valida.');
  state = S.normalizeState(parsed);
  saveState();
  return { ...snapshot() };
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
