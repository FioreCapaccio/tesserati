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
  exportBackup: () => call('backup:export'),
  importBackup: () => call('backup:import'),
  showDataFile: () => call('shell:showData'),
  print: (payload) => call('print:run', payload),
});
