const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__electronAPI', {
  getVersion: () => ipcRenderer.sendSync('app:version'),
});
