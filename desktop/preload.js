'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

/* API duy nhất mà giao diện được dùng để chạm vào máy tính */
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  pickFolder: o => ipcRenderer.invoke('pick-folder', o),
  scan: abs => ipcRenderer.invoke('scan', abs),
  onScanProgress: cb => { const h = (e, d) => cb(d); ipcRenderer.on('scan-progress', h); return () => ipcRenderer.removeListener('scan-progress', h); },
  readFile: abs => ipcRenderer.invoke('read-file', abs),
  stat: abs => ipcRenderer.invoke('stat', abs),
  openPath: abs => ipcRenderer.invoke('open-path', abs),
  showItem: abs => ipcRenderer.invoke('show-item', abs),
  isDir: abs => ipcRenderer.invoke('is-dir', abs),
  exportTo: (dest, folder, entries) => ipcRenderer.invoke('export', dest, folder, entries),
  getConfig: () => ipcRenderer.invoke('config-get'),
  setConfig: patch => ipcRenderer.invoke('config-set', patch),
  appInfo: () => ipcRenderer.invoke('app-info'),
  pathOf: file => { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  fileUrl: abs => 'bfile://f/?p=' + encodeURIComponent(abs),
});
