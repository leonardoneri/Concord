import { app, BrowserWindow, Menu, desktopCapturer, globalShortcut, ipcMain, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { iniciarAtualizador } from './atualizador.js';

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
    webPreferences: { preload: path.join(dir, 'preload.cjs') },
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
// Atalhos que funcionam mesmo com o jogo em foco (só enquanto está numa chamada)
const ATALHOS = { 'CommandOrControl+Shift+M': 'mudo', 'CommandOrControl+Shift+D': 'surdo' };
ipcMain.handle('desktop:atalhos', (e, ligar) => {
  if (e.sender !== janela?.webContents) return false;
  globalShortcut.unregisterAll();
  if (!ligar) return true;
  let ok = true;
  for (const [tecla, acao] of Object.entries(ATALHOS)) {
    ok = globalShortcut.register(tecla, () => janela?.webContents.send('desktop:atalho', acao)) && ok;
  }
  return ok;
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
      callback(escolha.audio && process.platform === 'win32' ? { video: fonte, audio: 'loopback' } : { video: fonte });
    } catch (err) {
      console.error(err);
      callback({});
    }
  });

  criarJanela();
  iniciarAtualizador({ janela: () => janela });
});

app.on('second-instance', () => {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.focus();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
