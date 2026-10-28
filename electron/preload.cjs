const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  atalhos: (ligar) => ipcRenderer.invoke('desktop:atalhos', ligar),
  aoAtalho: (cb) => ipcRenderer.on('desktop:atalho', (_e, acao) => cb(acao)),
  // apertar pra falar: true ao apertar a tecla, false ao soltar (mesmo com outro programa em foco)
  aoPtt: (cb) => ipcRenderer.on('desktop:ptt', (_e, apertado) => cb(apertado)),
  // atualização baixada: { versao } (ou null) ao perguntar, e aviso quando ficar pronta
  atualizacao: () => ipcRenderer.invoke('desktop:atualizacao'),
  aoAtualizacao: (cb) => ipcRenderer.on('desktop:atualizacao', (_e, info) => cb(info)),
  atualizar: () => ipcRenderer.invoke('desktop:atualizar'),
});
