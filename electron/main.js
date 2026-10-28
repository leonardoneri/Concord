import { app, BrowserWindow, Menu, desktopCapturer, globalShortcut, ipcMain, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { abrirTunel, garantirCloudflared } from './tunel.js';
import { iniciarAtualizador } from './atualizador.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER = path.join(dir, 'launcher.html');
const ICONE = path.join(dir, 'icone.png');
const arquivoConfig = path.join(app.getPath('userData'), 'config.json');

// O app se chamava "Amiguinhos Gamer": traz a config, o histórico do chat e o nome salvo da pasta antiga
function migrarPastaAntiga() {
  const antiga = path.join(app.getPath('appData'), 'amiguinhos-gamer');
  if (fs.existsSync(arquivoConfig) || !fs.existsSync(path.join(antiga, 'config.json'))) return;
  for (const item of ['config.json', 'dados', 'bin', 'Local Storage']) {
    try {
      fs.cpSync(path.join(antiga, item), path.join(app.getPath('userData'), item), { recursive: true, force: false });
    } catch {}
  }
}
migrarPastaAntiga();

function lerConfig() {
  try { return JSON.parse(fs.readFileSync(arquivoConfig, 'utf8')); } catch { return {}; }
}
function salvarConfig() {
  fs.mkdirSync(path.dirname(arquivoConfig), { recursive: true });
  fs.writeFileSync(arquivoConfig, JSON.stringify(config, null, 2));
}

const config = {
  servidor: '',
  porta: 3000,
  senha: '',
  publico: true,
  turn: { url: '', usuario: '', senha: '' },
  origensConfiaveis: [],
  ...lerConfig(),
};

// Microfone/câmera/tela exigem "contexto seguro". Pra funcionar com http://IP:porta
// (rede local, Radmin, Hamachi) sem https, marcamos esses servidores como confiáveis.
// Isso só vale a partir da inicialização, por isso o app reinicia na 1ª vez com um servidor novo.
if (config.origensConfiaveis.length) {
  app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', config.origensConfiaveis.join(','));
}

if (!app.requestSingleInstanceLock()) app.quit();

let janela = null;
let servidor = null; // servidor embutido quando hospedando
let tunel = null; // link público do servidor embutido

function enderecosLocais(porta) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${porta}`);
}

const precisaConfiar = (u) => u.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(u.hostname);
const doLauncher = (e) => e.senderFrame?.url.startsWith('file:');
const progresso = (texto) => janela?.webContents.send('desktop:progresso', texto);

// Aceita link completo, "ip:porta" ou só o código do convite (ex.: "palavra-palavra-palavra")
function normalizarEndereco(texto) {
  texto = texto.trim().replace(/\/+$/, '');
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/i.test(texto)) return `https://${texto.toLowerCase()}.trycloudflare.com`;
  return /^https?:\/\//i.test(texto) ? texto : `http://${texto}`;
}

function abrirLauncher(erro) {
  janela.loadFile(LAUNCHER, erro ? { query: { erro } } : undefined);
}

let tunelPorta = null; // porta do túnel ativo; null = não reabrir se cair

async function criarTunel(porta) {
  const exe = await garantirCloudflared(path.join(app.getPath('userData'), 'bin'), (pct) =>
    progresso(`Baixando o conector do link público (só na 1ª vez)… ${pct}%`));
  tunelPorta = porta;
  tunel = await abrirTunel(exe, porta, () => {
    tunel = null;
    reabrirTunel(porta);
  });
}

// O Quick Tunnel cai de vez em quando: tenta criar outro sozinho e avisa o link novo
async function reabrirTunel(porta, tentativa = 1) {
  if (tunelPorta !== porta || !servidor) return;
  janela?.webContents.send('desktop:tunel', { estado: 'caiu' });
  await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * tentativa)));
  if (tunelPorta !== porta || !servidor || tunel) return;
  try {
    await criarTunel(porta);
    janela?.webContents.send('desktop:tunel', { estado: 'novo', url: tunel.url });
  } catch {
    reabrirTunel(porta, tentativa + 1);
  }
}

async function pararHospedagem() {
  tunelPorta = null;
  tunel?.fechar();
  tunel = null;
  if (servidor) await servidor.fechar();
  servidor = null;
}

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

  janela.webContents.on('did-fail-load', (_e, codigo, descricao, url, principal) => {
    if (!principal || codigo === -3 || url.startsWith('file:')) return;
    abrirLauncher(`Não consegui conectar em ${new URL(url).origin}. O servidor está ligado? Se for um link de convite, peça um novo (${descricao}).`);
  });

  janela.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') janela.webContents.toggleDevTools();
    if (input.key === 'F5') janela.webContents.reload();
  });

  if (config.abrirAoIniciar) {
    const url = config.abrirAoIniciar;
    delete config.abrirAoIniciar;
    salvarConfig();
    janela.loadURL(url);
  } else {
    abrirLauncher();
  }
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
ipcMain.handle('desktop:config', (e) => {
  if (!doLauncher(e)) return null;
  return {
    servidor: config.servidor,
    porta: config.porta,
    senha: config.senha,
    publico: config.publico,
    turn: config.turn,
    enderecos: enderecosLocais(config.porta),
  };
});

ipcMain.handle('desktop:info', () => ({
  hospedando: !!servidor,
  link: tunel?.url ?? null,
  enderecos: servidor && !tunel ? enderecosLocais(servidor.porta) : [],
}));

ipcMain.handle('desktop:conectar', async (e, endereco) => {
  if (!doLauncher(e)) return;
  let u;
  try {
    u = new URL(normalizarEndereco(String(endereco ?? '')));
  } catch {
    return { erro: 'Endereço inválido. Cole o link que seu amigo mandou.' };
  }
  await pararHospedagem();
  config.servidor = u.origin;
  if (precisaConfiar(u) && !config.origensConfiaveis.includes(u.origin)) {
    config.origensConfiaveis.push(u.origin);
    config.abrirAoIniciar = u.origin;
    salvarConfig();
    app.relaunch();
    app.exit(0);
    return;
  }
  salvarConfig();
  janela.loadURL(u.origin);
});

ipcMain.handle('desktop:hospedar', async (e, opcoes = {}) => {
  if (!doLauncher(e)) return;
  const porta = Number(opcoes.porta) || 3000;
  const senha = String(opcoes.senha ?? '');
  const publico = opcoes.publico !== false;
  const turn = {
    url: String(opcoes.turn?.url ?? '').trim(),
    usuario: String(opcoes.turn?.usuario ?? ''),
    senha: String(opcoes.turn?.senha ?? ''),
  };
  // Com link público o servidor só escuta no próprio PC: sem pergunta do firewall
  const host = publico ? '127.0.0.1' : undefined;

  const mudou = servidor && (servidor.porta !== porta || servidor.host !== host
    || config.senha !== senha || JSON.stringify(config.turn) !== JSON.stringify(turn));
  if (mudou) await pararHospedagem();

  if (!servidor) {
    try {
      progresso('Ligando o servidor…');
      const { iniciarServidor } = await import('../server.js');
      servidor = await iniciarServidor({ porta, senha, host, turn, pastaDados: path.join(app.getPath('userData'), 'dados') });
    } catch (err) {
      return { erro: err.code === 'EADDRINUSE' ? `A porta ${porta} já está em uso. Tente outra (ex.: ${porta + 1}).` : err.message };
    }
  }
  Object.assign(config, { porta, senha, publico, turn });
  salvarConfig();

  if (publico && !tunel) {
    try {
      progresso('Preparando o link público…');
      await criarTunel(porta);
    } catch (err) {
      return { erro: `O servidor ligou, mas não deu pra criar o link público: ${err.message}. Tente de novo ou desmarque "Criar link público" e use rede local/VPN.` };
    }
  }
  janela.loadURL(`http://localhost:${porta}`);
});

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

ipcMain.handle('desktop:trocarServidor', async () => {
  globalShortcut.unregisterAll();
  await pararHospedagem();
  abrirLauncher();
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
  iniciarAtualizador({ janela: () => janela, hospedando: () => !!servidor });
});

app.on('second-instance', () => {
  if (!janela) return;
  if (janela.isMinimized()) janela.restore();
  janela.focus();
});

// o cloudflared é outro processo: precisa fechar junto com o app
app.on('before-quit', () => {
  tunelPorta = null;
  tunel?.fechar();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
