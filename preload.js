'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const call = async (channel, payload) => {
  const res = await ipcRenderer.invoke(channel, payload);
  if (!res.ok) throw new Error(res.error);
  return res.data;
};

contextBridge.exposeInMainWorld('api', {
  getState: () => call('state:get'),
  saveSettings: (s) => call('settings:save', s),
  importCsv: (opts) => call('import:run', opts || {}),
  updateMemberships: (keys, patch) => call('membership:update', { keys, patch }),
  updatePerson: (id, patch) => call('person:update', { id, patch }),
  pickLogo: () => call('logo:pick'),
  setCsv: (kind) => call('csv:set', { kind }),
  changeArchive: (reset) => call('archive:change', { reset: !!reset }),
  exportBackup: () => call('backup:export'),
  inspectBackup: () => call('backup:inspect'),
  applyBackup: (path) => call('backup:apply', { path }),
  showDataFile: () => call('shell:showData'),
  print: (payload) => call('print:run', payload),
});
