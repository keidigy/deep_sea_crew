const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hostApp', {
  status: () => ipcRenderer.invoke('host:status'),
  start: () => ipcRenderer.invoke('host:start'),
  stop: () => ipcRenderer.invoke('host:stop'),
  loginCloudflare: () => ipcRenderer.invoke('cloudflare:login'),
  shareCloudflare: () => ipcRenderer.invoke('cloudflare:share'),
  stopCloudflare: () => ipcRenderer.invoke('cloudflare:stop'),
  openLocal: () => ipcRenderer.invoke('host:open-local'),
  onStatus: (listener) => { const wrapped = (_, state) => listener(state); ipcRenderer.on('host-status', wrapped); return () => ipcRenderer.removeListener('host-status', wrapped); }
});
