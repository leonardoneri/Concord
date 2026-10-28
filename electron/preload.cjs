const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  atalhos: (ligar) => ipcRenderer.invoke('desktop:atalhos', ligar),
  aoAtalho: (cb) => ipcRenderer.on('desktop:atalho', (_e, acao) => cb(acao)),
});
