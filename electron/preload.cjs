const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  atalhos: (ligar) => ipcRenderer.invoke('desktop:atalhos', ligar),
  aoAtalho: (cb) => ipcRenderer.on('desktop:atalho', (_e, acao) => cb(acao)),
  // atualização baixada: { versao } (ou null) ao perguntar, e aviso quando ficar pronta
  atualizacao: () => ipcRenderer.invoke('desktop:atualizacao'),
  aoAtualizacao: (cb) => ipcRenderer.on('desktop:atualizacao', (_e, info) => cb(info)),
  atualizar: () => ipcRenderer.invoke('desktop:atualizar'),
});
