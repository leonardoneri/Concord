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
  // jogo aberto agora ({ nome, icone } ou null) e aviso quando muda
  jogo: () => ipcRenderer.invoke('desktop:jogo'),
  aoJogo: (cb) => ipcRenderer.on('desktop:jogo', (_e, jogo) => cb(jogo)),
  // traz a janela de volta da bandeja (ex.: clicou numa notificação)
  mostrar: () => ipcRenderer.invoke('desktop:mostrar'),
  // microfone bloqueado pelo Windows: status ('denied' = bloqueado) e abrir a tela de privacidade
  micWindows: () => ipcRenderer.invoke('desktop:mic-windows'),
  privacidadeMic: () => ipcRenderer.invoke('desktop:privacidade-mic'),
  // clipes: id da tela principal pra gravar (getUserMedia com chromeMediaSource 'desktop')
  clipeFonte: () => ipcRenderer.invoke('desktop:clipe-fonte'),
  // som só da janela compartilhada: liga ({ taxa, canais } ou null), recebe os pedaços de PCM (16 bits) e desliga
  somJanela: () => ipcRenderer.invoke('desktop:som-janela'),
  aoSomJanela: (cb) => {
    ipcRenderer.removeAllListeners('desktop:som-janela');
    ipcRenderer.on('desktop:som-janela', (_e, pedaco) => cb(pedaco));
  },
  pararSomJanela: () => ipcRenderer.invoke('desktop:parar-som-janela'),
});
