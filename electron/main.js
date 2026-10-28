import { app, BrowserWindow, Menu, Tray, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { iniciarAtualizador } from './atualizador.js';
import { vigiarJogos } from './jogos.js';

// Onde o Concord roda (VPS). O app abre direto nele; criar/entrar em servidores é feito lá dentro.
const ENDERECO = 'https://152-67-40-158.sslip.io';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ICONE = path.join(dir, 'icone.png');

// O app se chamava "Amiguinhos Gamer": traz o login salvo (Local Storage) da pasta antiga
function migrarPastaAntiga() {
  const antiga = path.join(app.getPath('appData'), 'amiguinhos-gamer');
  const nova = app.getPath('userData');
  if (fs.existsSync(path.join(nova, 'Local Storage')) || !fs.existsSync(path.join(antiga, 'Local Storage'))) return;
  try {
    fs.cpSync(path.join(antiga, 'Local Storage'), path.join(nova, 'Local Storage'), { recursive: true, force: false });
  } catch {}
}
migrarPastaAntiga();

if (!app.requestSingleInstanceLock()) app.quit();

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 560,
    backgroundColor: '#313338',
    title: 'Concord',
    icon: ICONE,
    autoHideMenuBar: true,
    show: !OCULTO,
    // escondido na bandeja, a página continua rodando normal (chamada, atalhos, notificações)
    webPreferences: { preload: path.join(dir, 'preload.cjs'), backgroundThrottling: false },
  });

  // desligando o PC: deixa fechar
  janela.on('session-end', () => { saindo = true; });
  // fechar (X) só esconde: o Concord continua rodando na bandeja, igual o Discord
  janela.on('close', (e) => {
    if (saindo) return;
    e.preventDefault();
    janela.hide();
    avisarBandeja();
  });

  // links abrem no navegador padrão
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // sem internet / servidor fora do ar: tela com "Tentar de novo" (e tenta sozinho)
  janela.webContents.on('did-fail-load', (_e, codigo, descricao, url, principal) => {
    if (!principal || codigo === -3 || url.startsWith('file:')) return;
    janela.loadFile(path.join(dir, 'offline.html'), { query: { endereco: ENDERECO, erro: descricao } });
  });

  janela.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') janela.webContents.toggleDevTools();
    if (input.key === 'F5') janela.webContents.reload();
  });

  janela.loadURL(ENDERECO);
}

// ---------- bandeja do Windows (perto do relógio) ----------
let tray = null;
// aberto pelo Windows ao ligar o PC: começa só na bandeja
const OCULTO = process.argv.includes('--oculto');
const iniciaComWindows = () => app.getLoginItemSettings({ args: ['--oculto'] }).openAtLogin;
function iniciarComWindows(ligar) {
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: ligar, args: ['--oculto'] });
}
let saindo = false; // true = fechar de verdade (menu "Sair", atualização, desligar o PC)
app.on('before-quit', () => { saindo = true; });

function mostrarJanela() {
  if (!janela) return criarJanela();
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

function criarBandeja() {
  tray = new Tray(nativeImage.createFromPath(ICONE).resize({ width: 32, height: 32 }));
  tray.setToolTip('Concord');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Abrir o Concord', click: mostrarJanela },
    { type: 'separator' },
    { label: 'Abrir junto com o Windows', type: 'checkbox', checked: iniciaComWindows(), click: (item) => iniciarComWindows(item.checked) },
    { type: 'separator' },
    { label: 'Sair do Concord', click: () => app.quit() },
  ]));
  tray.on('click', mostrarJanela);
}

// Na primeira vez que fecha, explica onde o app foi parar
function avisarBandeja() {
  const marca = path.join(app.getPath('userData'), 'avisou-bandeja');
  if (fs.existsSync(marca)) return;
  try { fs.writeFileSync(marca, '1'); } catch {}
  tray?.displayBalloon({
    iconType: 'info',
    title: 'O Concord continua aberto',
    content: 'Ele fica aqui na bandeja, perto do relógio (a chamada continua). Pra fechar de vez: botão direito no ícone → Sair do Concord.',
  });
}

// ---------- seletor de tela ----------
function escolherFonte(fontes) {
  return new Promise((resolve) => {
    const seletor = new BrowserWindow({
      parent: janela,
      modal: true,
      width: 820,
      height: 600,
      resizable: false,
      minimizable: false,
      backgroundColor: '#313338',
      title: 'Compartilhar tela',
      icon: ICONE,
      autoHideMenuBar: true,
      webPreferences: { preload: path.join(dir, 'preload-seletor.cjs') },
    });
    let respondido = false;
    const responder = (v) => {
      if (respondido) return;
      respondido = true;
      ipcMain.removeAllListeners('seletor:escolha');
      resolve(v);
      if (!seletor.isDestroyed()) seletor.close();
    };
    ipcMain.on('seletor:escolha', (e, v) => { if (e.sender === seletor.webContents) responder(v); });
    seletor.on('closed', () => responder(null));
    seletor.webContents.once('did-finish-load', () => {
      seletor.webContents.send('seletor:fontes', {
        fontes: fontes.map((f) => ({
          id: f.id,
          nome: f.name,
          miniatura: f.thumbnail.toDataURL(),
          icone: f.appIcon?.toDataURL() ?? null,
          tela: f.id.startsWith('screen:'),
        })),
        audioDisponivel: process.platform === 'win32',
      });
    });
    seletor.loadFile(path.join(dir, 'seletor.html'));
  });
}

// ---------- IPC ----------
// Hook de teclado/mouse do sistema: vê a tecla do "apertar pra falar" até com o jogo em foco.
// Opcional: se não carregar, o apertar pra falar só funciona com a janela em foco.
let hook = null;
function carregarHook() {
  if (hook === null) {
    try {
      hook = createRequire(import.meta.url)('uiohook-napi');
    } catch (err) {
      console.error('Sem hook de teclado', err);
      hook = false;
    }
  }
  return hook;
}

const BOTOES_MOUSE = { Mouse3: 3, Mouse4: 4, Mouse5: 5 };
const MODIFICADORES = {
  ControlLeft: 'Ctrl', ControlRight: 'CtrlRight', ShiftLeft: 'Shift', ShiftRight: 'ShiftRight',
  AltLeft: 'Alt', AltRight: 'AltRight', MetaLeft: 'Meta', MetaRight: 'MetaRight',
};
let ptt = null; // { tecla } ou { botao }
let pttApertado = false;
let hookLigado = false;
let ouvintes = false;

function avisarPtt(apertado) {
  if (apertado === pttApertado) return;
  pttApertado = apertado;
  janela?.webContents.send('desktop:ptt', apertado);
}

// code = KeyboardEvent.code do navegador (KeyV, CapsLock…) ou Mouse3/4/5; null desliga
function configurarPtt(code) {
  ptt = null;
  avisarPtt(false);
  if (!code) {
    if (hookLigado) hook.uIOhook.stop();
    hookLigado = false;
    return false;
  }
  const h = carregarHook();
  if (!h) return false;
  if (code in BOTOES_MOUSE) {
    ptt = { botao: BOTOES_MOUSE[code] };
  } else {
    const tecla = h.UiohookKey[MODIFICADORES[code] ?? code.replace(/^Key|^Digit/, '')];
    if (tecla == null) return false;
    ptt = { tecla };
  }
  if (!ouvintes) {
    h.uIOhook.on('keydown', (e) => e.keycode === ptt?.tecla && avisarPtt(true));
    h.uIOhook.on('keyup', (e) => e.keycode === ptt?.tecla && avisarPtt(false));
    h.uIOhook.on('mousedown', (e) => e.button === ptt?.botao && avisarPtt(true));
    h.uIOhook.on('mouseup', (e) => e.button === ptt?.botao && avisarPtt(false));
    ouvintes = true;
  }
  if (!hookLigado) {
    try {
      h.uIOhook.start();
    } catch (err) {
      console.error('Hook de teclado não iniciou', err);
      ptt = null;
      return false;
    }
    hookLigado = true;
  }
  return true;
}

// "Jogando X": o jogo aberto agora ({ nome, icone } ou null), e aviso quando muda
let jogos = { atual: () => null };
ipcMain.handle('desktop:jogo', () => jogos.atual());
ipcMain.handle('desktop:mostrar', () => mostrarJanela());
// Clipes: id da tela principal, pra página gravar sem abrir o seletor de tela
ipcMain.handle('desktop:clipe-fonte', async (e) => {
  if (e.sender !== janela?.webContents) return null;
  const telas = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const principal = String(screen.getPrimaryDisplay().id);
  return (telas.find((t) => t.display_id === principal) ?? telas[0])?.id ?? null;
});

// Atalhos que funcionam mesmo com o jogo em foco (só enquanto está numa chamada)
const ATALHOS_PADRAO = { mudo: 'Ctrl+Shift+M', surdo: 'Ctrl+Shift+D' };
ipcMain.handle('desktop:atalhos', (e, cfg) => {
  if (e.sender !== janela?.webContents) return false;
  // a página antiga manda só true/false
  const { ligar, mudo, surdo, clipe, ptt: teclaPtt } = cfg && typeof cfg === 'object' ? cfg : { ligar: !!cfg, ...ATALHOS_PADRAO };
  globalShortcut.unregisterAll();
  if (!ligar) {
    configurarPtt(null);
    return { ok: true, ptt: false };
  }
  let ok = true;
  for (const [atalho, acao] of [[mudo, 'mudo'], [surdo, 'surdo'], [clipe, 'clipe']]) {
    if (!atalho) continue;
    try {
      ok = globalShortcut.register(atalho, () => janela?.webContents.send('desktop:atalho', acao)) && ok;
    } catch {
      ok = false; // atalho inválido
    }
  }
  return { ok, ptt: configurarPtt(teclaPtt) };
});

// ---------- inicialização ----------
app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  const permitidas = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection']);
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, cb) => cb(permitidas.has(permissao)));
  session.defaultSession.setPermissionCheckHandler((_wc, permissao) => permitidas.has(permissao));

  // getDisplayMedia() → nosso seletor de telas/janelas
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, callback) => {
    try {
      const fontes = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const escolha = await escolherFonte(fontes);
      const fonte = escolha && fontes.find((f) => f.id === escolha.id);
      if (!fonte) return callback({});
      // áudio do PC todo, menos o do próprio Concord: senão a voz da galera na chamada
      // vai junto na transmissão e todo mundo se ouve de volta (o Discord faz igual)
      callback(escolha.audio && process.platform === 'win32' ? { video: fonte, audio: 'loopbackWithoutChrome' } : { video: fonte });
    } catch (err) {
      console.error(err);
      callback({});
    }
  });

  // na primeira vez, já deixa abrindo junto com o Windows (escondido), igual o Discord; dá pra desligar na bandeja
  const marca = path.join(app.getPath('userData'), 'configurou-inicio');
  if (!fs.existsSync(marca)) {
    iniciarComWindows(true);
    try { fs.writeFileSync(marca, '1'); } catch {}
  }
  criarJanela();
  criarBandeja();
  iniciarAtualizador({ janela: () => janela });
  jogos = vigiarJogos((jogo) => janela?.webContents.send('desktop:jogo', jogo));
});

// abriu o Concord de novo (atalho/menu iniciar): traz a janela que já está aberta, mesmo escondida na bandeja
app.on('second-instance', () => mostrarJanela());
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  configurarPtt(null);
});
app.on('window-all-closed', () => app.quit());
