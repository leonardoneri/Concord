const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('seletor', {
  aoReceber: (cb) => ipcRenderer.on('seletor:fontes', (_e, dados) => cb(dados)),
  escolher: (escolha) => ipcRenderer.send('seletor:escolha', escolha),
});
