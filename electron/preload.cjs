const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  config: () => ipcRenderer.invoke('desktop:config'),
  info: () => ipcRenderer.invoke('desktop:info'),
  conectar: (endereco) => ipcRenderer.invoke('desktop:conectar', endereco),
  hospedar: (opcoes) => ipcRenderer.invoke('desktop:hospedar', opcoes),
  trocarServidor: () => ipcRenderer.invoke('desktop:trocarServidor'),
  aoProgresso: (cb) => ipcRenderer.on('desktop:progresso', (_e, texto) => cb(texto)),
  aoTunel: (cb) => ipcRenderer.on('desktop:tunel', (_e, dados) => cb(dados)),
  atalhos: (ligar) => ipcRenderer.invoke('desktop:atalhos', ligar),
  aoAtalho: (cb) => ipcRenderer.on('desktop:atalho', (_e, acao) => cb(acao)),
});
