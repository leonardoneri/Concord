'use strict';

const socket = io({ autoConnect: false });
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
// Existe quando roda dentro do app desktop (Electron)
const appDesktop = window.desktop ?? null;
// Quem sou eu pros outros na chamada: fica igual quando a conexão cai e volta (o servidor reiniciou),
// então a call continua sem recomeçar. Muda só se recarregar a página.
const SESSAO = crypto.randomUUID?.().replace(/-/g, '') ?? Math.random().toString(36).slice(2) + Date.now().toString(36);

function el(tag, cls, texto) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (texto != null) e.textContent = texto;
  return e;
}

function lerStorage(chave, padrao) {
  try { return JSON.parse(localStorage.getItem(chave)) ?? padrao; } catch { return padrao; }
}
function salvarStorage(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {}
}

// ---------- ícones ----------
const CORTE = '<path d="M3 3l18 18" stroke="var(--vermelho)"/>';
const ICONES = {
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  cadeado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  voz: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>',
  fone: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  camera: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-4v12l-6-4z"/>',
  tela: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  desligar: '<path fill="currentColor" d="M3 15.5c5-5 13-5 18 0l-2.5 2.5-3.2-1.6v-2.8a10 10 0 0 0-6.6 0v2.8L5.5 18z"/>',
  config: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  jogo: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
  calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  enquete: '<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16v-7"/>',
  tv: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/>',
  sons: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  dado: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8.5" cy="8.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="15.5" cy="8.5" r="1"/><circle cx="8.5" cy="15.5" r="1"/>',
  volume: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  membros: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  seta: '<path d="m6 9 6 6 6-6"/>',
  sinal: '<path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16"/>',
  cheia: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  mais: '<circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>',
  fechar: '<path d="M18 6 6 18M6 6l12 12"/>',
  convidar: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
};
ICONES.lapis = '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>';
ICONES.lixo = '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>';
ICONES.pino = '<path d="M12 17v5M9 3h6l-1 7 4 3v2H6v-2l4-3z"/>';
ICONES.cima = '<path d="m18 15-6-6-6 6"/>';
ICONES.baixar = '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>';
ICONES.coroa = '<path fill="currentColor" stroke="none" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>';
ICONES.responder = '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>';
ICONES.emoji = '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>';
ICONES.buscar = '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>';
ICONES.arquivo = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';
ICONES.arroba = '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>';
ICONES.chat = '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>';
ICONES.mapa = '<path d="M14.1 6.4 9.9 4.2a2 2 0 0 0-1.8 0L3.6 6.4A1 1 0 0 0 3 7.3v12.1a1 1 0 0 0 1.4.9l3.7-1.9a2 2 0 0 1 1.8 0l4.2 2.2a2 2 0 0 0 1.8 0l4.5-2.2a1 1 0 0 0 .6-.9V4.6a1 1 0 0 0-1.4-.9l-3.7 1.9a2 2 0 0 1-1.8 0z"/><path d="M15 5.8v15M9 3.2v15"/>';
ICONES.micOff = ICONES.mic + CORTE;
ICONES.foneOff = ICONES.fone + CORTE;

const svg = (nome, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;
function icone(nome, cls) {
  const t = document.createElement('template');
  t.innerHTML = svg(nome, cls);
  return t.content.firstChild;
}
$$('[data-icone]').forEach((e) => e.prepend(icone(e.dataset.icone)));

// ---------- estado ----------
const SEM_SERVIDOR = { id: null, nome: '', icone: null, dono: null, convite: '', canais: [] };
// as conversas diretas abrem como se fossem um "servidor" à parte
const DM = { id: 'dm', nome: 'Mensagens diretas', icone: null, dono: null, convite: '', canais: [] };
const PAGINA = 50; // mensagens por vez no histórico (igual ao servidor)
const MAX_ARQUIVO = 25 * 1024 * 1024;
// o app desktop põe "Concord/1.0.8" no user agent (vale até nas versões antigas do app)
const VERSAO_APP = navigator.userAgent.match(/concord\/(\d+\.\d+\.\d+)/i)?.[1] ?? null;
function compararVersao(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}
const STATUS_NOME = { online: 'Online', ausente: 'Ausente', ocupado: 'Não perturbe', invisivel: 'Invisível' };
const estado = {
  eu: null,
  servidores: [], // os servidores de que participo (barra da esquerda): { id, nome, icone, dono }
  servidor: SEM_SERVIDOR, // o aberto agora, com convite e canais
  perfis: [], // membros do servidor aberto (online e offline): { id, nome, cor, avatar, bio, admin, dono }
  canaisTexto: [], // canais do servidor aberto: { id, tipo, nome, topico }
  canaisVoz: [],
  iceServers: [],
  canalTexto: null, // id
  srvNaoLidos: new Set(), // servidores com mensagem nova
  srvMencoes: new Map(), // servidor -> quantas vezes me marcaram lá
  canalMencoes: new Set(), // canais (do servidor aberto) em que me marcaram
  dms: [], // conversas diretas: { id, outro: { id, nome, cor, avatar, bio }, ultima }
  dmNaoLidos: new Map(), // conversa -> mensagens novas
  view: 'texto', // 'texto' | 'voz'
  usuarios: [],
  naoLidos: new Set(),
  membrosVisiveis: lerStorage('membrosVisiveis', true),
  // voz
  voz: null, // id do canal de voz (pode ser de outro servidor)
  vozInfo: null, // { canal, servidor }: nomes pro painel da chamada
  mudo: false,
  surdo: false,
  mic: null,
  cam: null,
  tela: null,
  mapa: null, // mapa da chamada ligado: { pessoas } (ver mapa.js)
};

// id do outro usuário -> { pc, polite, makingOffer, ignoreOffer, streams, senders, fila }
const peers = new Map();
const volumes = lerStorage('volumes', {});
// por nome: { mudo, ocultarCam, ocultarTela, baixa } — só vale pra mim
const ajustes = lerStorage('ajustes', {});
const dispositivos = lerStorage('dispositivos', { mic: '', cam: '', saida: '' });
const transmissao = lerStorage('transmissao', { resolucao: '1080', fps: 30 });
let meuBoneco = lerStorage('boneco', null); // como é o meu boneco no mapa da chamada

let toastTimer;
function avisar(msg, duracao = 5000) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), duracao);
}

// ---------- sons ----------
let audioCtx = null;
function som(tipo) {
  if (!audioCtx) return;
  const notas = { entrar: [523, 784], sair: [784, 523], mudo: [440], desmudo: [660] }[tipo];
  const t0 = audioCtx.currentTime;
  notas.forEach((freq, i) => {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    const t = t0 + i * 0.09;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + 0.17);
  });
}

// ---------- atalhos (mudo, surdo, apertar pra falar) ----------
// modo 'voz' = microfone aberto; 'ptt' = só transmite enquanto segura a tecla
const atalhos = { modo: 'voz', ptt: null, mudo: 'Ctrl+Shift+M', surdo: 'Ctrl+Shift+D', clipes: false, clipe: 'Ctrl+Alt+C', ...lerStorage('atalhos', {}) };
let pttGlobal = false; // o app desktop vê a tecla mesmo com o jogo em foco
let pttApertado = false;
let pttSoltar = null;
let capturando = null; // qual atalho está esperando a tecla nas configurações

function apertarPtt(apertado) {
  if (atalhos.modo !== 'ptt' || !estado.voz) return;
  clearTimeout(pttSoltar);
  if (apertado) {
    if (pttApertado) return;
    pttApertado = true;
    aplicarMudo();
  } else if (pttApertado) {
    // um tiquinho de atraso pra não cortar o fim da palavra
    pttSoltar = setTimeout(() => {
      pttApertado = false;
      aplicarMudo();
    }, 200);
  }
}

const NOMES_TECLA = {
  Space: 'Espaço', Backquote: "' (aspas)", CapsLock: 'Caps Lock', Tab: 'Tab', ControlLeft: 'Ctrl', ControlRight: 'Ctrl direito',
  ShiftLeft: 'Shift', ShiftRight: 'Shift direito', AltLeft: 'Alt', AltRight: 'AltGr', Mouse3: 'Botão do meio do mouse',
  Mouse4: 'Mouse 4 (lateral)', Mouse5: 'Mouse 5 (lateral)',
};
const nomeTecla = (code) => NOMES_TECLA[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
const BOTOES_MOUSE = { 1: 'Mouse3', 3: 'Mouse4', 4: 'Mouse5' };
const emCampoDeTexto = (e) => !!e.target.closest?.('input, textarea, select');

// Ctrl+Shift+M etc., no formato de atalho do Electron
function combinacao(e) {
  const tecla = /^(Key[A-Z]|Digit\d)$/.test(e.code) ? e.code.slice(-1) : /^F\d{1,2}$/.test(e.code) ? e.code : null;
  if (!tecla) return null;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', tecla].filter(Boolean).join('+');
}

appDesktop?.aoAtalho?.((acao) => (acao === 'mudo' ? alternarMudo() : acao === 'surdo' ? alternarSurdo() : acao === 'clipe' ? salvarClipe() : null));
appDesktop?.aoPtt?.(apertarPtt);

// Sem o hook do app desktop: a tecla só vale com o Concord em foco
document.addEventListener('keydown', (e) => {
  if (!pttGlobal && atalhos.ptt?.code === e.code && !e.repeat && !(emCampoDeTexto(e) && e.key.length === 1)) apertarPtt(true);
  if (appDesktop || !estado.voz) return; // no app, quem cuida é o atalho global
  const c = combinacao(e);
  if (!c || (c !== atalhos.mudo && c !== atalhos.surdo)) return;
  e.preventDefault();
  c === atalhos.mudo ? alternarMudo() : alternarSurdo();
});
document.addEventListener('keyup', (e) => { if (!pttGlobal && atalhos.ptt?.code === e.code) apertarPtt(false); });
document.addEventListener('mousedown', (e) => { if (!pttGlobal && atalhos.ptt && atalhos.ptt.code === BOTOES_MOUSE[e.button]) apertarPtt(true); });
document.addEventListener('mouseup', (e) => {
  if (pttGlobal || !atalhos.ptt || atalhos.ptt.code !== BOTOES_MOUSE[e.button]) return;
  e.preventDefault(); // botão lateral = "voltar" no navegador
  apertarPtt(false);
});
window.addEventListener('blur', () => { if (!pttGlobal) apertarPtt(false); });

// ---------- desktop ----------

// Atualização do app já baixada: aparece o botão verde (igual o Discord); clicar reinicia atualizado
// "Jogando X": o app desktop avisa quando um jogo abre/fecha
let meuJogo = null;
function mudouJogo(jogo) {
  meuJogo = jogo ?? null;
  if (estado.eu) socket.emit('jogo', meuJogo);
}
appDesktop?.jogo?.().then(mudouJogo);
appDesktop?.aoJogo?.(mudouJogo);
function iconeJogo(jogo) {
  if (jogo.icone) {
    const img = el('img', 'icone-jogo');
    img.src = jogo.icone;
    img.alt = '';
    return img;
  }
  return icone('jogo', 'icone-jogo');
}

let atualizacaoPronta = null; // app desktop: versão nova já baixada
let novaVersaoWeb = null; // servidor atualizado com a página aberta
function mostrarAtualizacao(info) {
  if (!info) return;
  atualizacaoPronta = info;
  const b = $('#btn-atualizar');
  b.hidden = false;
  b.title = `Atualização pronta (versão ${info.versao}): clique pra reiniciar e atualizar`;
}
function mostrarAtualizacaoWeb(versao) {
  novaVersaoWeb = versao;
  const b = $('#btn-atualizar');
  b.hidden = false;
  if (!atualizacaoPronta) b.title = `Versão ${versao} do Concord disponível: clique pra atualizar (leva 2 segundos)`;
}
appDesktop?.atualizacao?.().then(mostrarAtualizacao);
appDesktop?.aoAtualizacao?.(mostrarAtualizacao);
$('#btn-atualizar').onclick = () => {
  if (estado.voz && !confirm('Você está numa chamada: atualizar agora te tira dela por uns segundos. Atualizar mesmo assim?')) return;
  if (atualizacaoPronta) appDesktop?.atualizar();
  else location.reload();
};

// ---------- clipes: grava tela + som durante a chamada; o atalho salva os últimos ~30 s no chat ----------
// MediaRecorder não deixa cortar o começo do vídeo, então revezamos gravadores: um novo a cada
// CLIPE_PASSO s, cada um vive até CLIPE_S + CLIPE_PASSO s. Sempre tem um com 30–45 s gravados.
let CLIPE_S = 30;
let CLIPE_PASSO = 15;
const clipe = { tela: null, stream: null, ctx: null, gravadores: [], timer: null, iniciando: false, enviando: false };
const clipesDisponiveis = () => !!appDesktop?.clipeFonte && !!window.MediaRecorder;
const tipoClipe = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));

async function iniciarClipes() {
  if (!atalhos.clipes || !clipesDisponiveis() || !estado.voz || clipe.stream || clipe.iniciando) return;
  clipe.iniciando = true;
  try {
    const fonte = await appDesktop.clipeFonte();
    if (!fonte) throw new Error('sem tela');
    // tela principal + som do PC (jogo e a voz da galera); "desktop" não abre o seletor de tela
    const tela = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'desktop' } },
      video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: fonte, maxWidth: 1280, maxHeight: 720, maxFrameRate: 30 } },
    });
    if (!estado.voz || !atalhos.clipes) return tela.getTracks().forEach((t) => t.stop());
    // junta o som do PC com o meu microfone (respeita o mudo: a trilha desligada fica em silêncio)
    const ctx = new AudioContext();
    const mix = ctx.createMediaStreamDestination();
    for (const s of [tela, estado.mic]) {
      if (s?.getAudioTracks().length) ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks())).connect(mix);
    }
    Object.assign(clipe, { tela, ctx, stream: new MediaStream([...tela.getVideoTracks(), ...mix.stream.getAudioTracks()]) });
    novoGravador();
    clipe.timer = setInterval(novoGravador, CLIPE_PASSO * 1000);
  } catch (e) {
    console.warn('Clipes', e);
    avisar('Não deu pra começar a gravar os clipes (a captura da tela falhou).', 5000);
  } finally {
    clipe.iniciando = false;
  }
}

function novoGravador() {
  if (!clipe.stream) return;
  // descarta quem já passou do tamanho máximo do clipe
  const limite = (CLIPE_S + CLIPE_PASSO) * 1000 - 500;
  for (const g of clipe.gravadores.filter((x) => Date.now() - x.inicio > limite)) descartarGravador(g);
  const r = new MediaRecorder(clipe.stream, { mimeType: tipoClipe(), videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 128_000 });
  const g = { r, partes: [], inicio: Date.now() };
  r.ondataavailable = (e) => e.data.size && g.partes.push(e.data);
  r.start(1000);
  clipe.gravadores.push(g);
}

function descartarGravador(g) {
  clipe.gravadores = clipe.gravadores.filter((x) => x !== g);
  g.r.ondataavailable = null;
  if (g.r.state !== 'inactive') g.r.stop();
  g.partes = [];
}

function pararClipes() {
  clearInterval(clipe.timer);
  [...clipe.gravadores].forEach(descartarGravador);
  clipe.tela?.getTracks().forEach((t) => t.stop());
  clipe.ctx?.close().catch(() => {});
  Object.assign(clipe, { tela: null, stream: null, ctx: null, timer: null });
}

async function salvarClipe() {
  if (!clipe.stream) {
    return avisar(atalhos.clipes ? 'Os clipes só gravam durante uma chamada.' : 'Ligue os clipes em Configurações → Atalhos.', 4000);
  }
  if (clipe.enviando) return avisar('Ainda enviando o clipe anterior…', 3000);
  const canal = estado.canalTexto;
  if (canal == null) return avisar('Abra um canal de texto pra mandar o clipe.', 4000);
  // o mais antigo tem os últimos 30–45 s; os outros continuam gravando
  const g = clipe.gravadores.shift();
  if (!g) return;
  if (clipe.gravadores.length === 0) novoGravador();
  som('entrar');
  clipe.enviando = true;
  try {
    const blob = await new Promise((ok) => {
      g.r.onstop = () => ok(new Blob(g.partes, { type: 'video/webm' }));
      g.r.stop();
    });
    const segundos = Math.round((Date.now() - g.inicio) / 1000);
    if (blob.size > 25 * 1024 * 1024) return avisar('O clipe ficou grande demais pra enviar (máx. 25 MB).', 5000);
    const d = new Date();
    const nome = `clipe-${d.toLocaleDateString('pt-BR').replaceAll('/', '-')}-${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}.webm`;
    avisar(`🎬 Clipe de ${segundos} s salvo, enviando…`, 3000);
    const dados = await blob.arrayBuffer();
    const r = await new Promise((ok) => socket.timeout(120_000).emit('arquivo', { canal, nome, dados }, (err, res) => ok(err ? { erro: 'O envio do clipe demorou demais.' } : res)));
    if (r?.erro) return avisar(r.erro, 5000);
    avisar(`🎬 Clipe enviado em ${canalPorId(canal) ? `#${canalPorId(canal).nome}` : 'a conversa'}.`, 4000);
  } finally {
    clipe.enviando = false;
  }
}

// Avisa o app desktop pra ligar/desligar os atalhos globais (funcionam dentro do jogo)
function atalhosGlobais(ligar) {
  if (!appDesktop?.atalhos) return;
  const ptt = atalhos.modo === 'ptt' ? atalhos.ptt?.code ?? null : null;
  const clipe = atalhos.clipes && clipesDisponiveis() ? atalhos.clipe : '';
  appDesktop.atalhos({ ligar, mudo: atalhos.mudo, surdo: atalhos.surdo, clipe, ptt }).then((res) => {
    // a versão antiga do app responde só true/false
    const ok = typeof res === 'object' ? res?.ok : res;
    pttGlobal = typeof res === 'object' && !!res?.ptt;
    if (!ligar) return;
    if (ok === false) avisar(`Outro programa já usa ${[atalhos.mudo, atalhos.surdo, clipe].filter(Boolean).join(' ou ')}: algum desses atalhos não vai funcionar.`);
    if (ptt && !pttGlobal) avisar('Nesta versão do app, o apertar pra falar só funciona com o Concord em foco. Atualize o app pra funcionar dentro do jogo.', 8000);
  });
}

// ---------- convite ----------
const ehLocal = (host) => ['localhost', '127.0.0.1'].includes(host);

function abrirConvite() {
  fecharPopovers();
  const { nome, convite } = estado.servidor;
  if (!convite) return;
  const base = location.origin;
  $('#convite-titulo').textContent = `Convidar amigos pra ${nome}`;
  $('#convite-link').value = `${base}/?convite=${convite}`;
  $('#convite-codigo').textContent = convite;
  $('#convite-dica').textContent = ehLocal(new URL(base).hostname)
    ? 'Esse servidor só está acessível neste PC: o link não funciona pros amigos.'
    : 'O link abre no navegador (Chrome/Edge) sem instalar nada, ou dá pra colar o código no app.';
  $('#btn-novo-convite').hidden = !souAdmin();
  $('#modal-convite').hidden = false;
  $('#convite-link').select();
}

$$('.btn-convidar').forEach((b) => (b.onclick = abrirConvite));
$('#btn-fechar-convite').onclick = () => ($('#modal-convite').hidden = true);
$('#modal-convite').onclick = (e) => { if (e.target.id === 'modal-convite') e.target.hidden = true; };
$('#btn-novo-convite').onclick = () => {
  if (!confirm('Gerar outro convite? O atual para de funcionar (quem já entrou continua no servidor).')) return;
  socket.emit('servidor:novo-convite', null, (res) => {
    if (res?.erro) return avisar(res.erro);
    // o 'servidor' com o código novo chega antes do ack
    abrirConvite();
  });
};

// Convite que veio no link (…/?convite=CODIGO): usa depois do login
function conviteDaUrl() {
  return new URLSearchParams(location.search).get('convite');
}
function esquecerConviteDaUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('convite');
  history.replaceState(null, '', url);
}
$('#btn-copiar').onclick = async () => {
  const input = $('#convite-link');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  const b = $('#btn-copiar');
  b.textContent = 'Copiado!';
  b.classList.add('copiado');
  setTimeout(() => { b.textContent = 'Copiar'; b.classList.remove('copiado'); }, 1500);
};

// ---------- login / conta ----------
// O token da conta fica salvo neste navegador/app: entra sozinho da próxima vez
let token = lerStorage('token', null);
try { ['nome', 'senha', 'sessao'].forEach((k) => localStorage.removeItem(k)); } catch {} // sobras da versão sem conta

let modoLogin = 'entrar';
let pedeConvite = false;

function mostrarLogin(erro = '') {
  $('#erro-login').textContent = erro;
  $('#login').hidden = false;
  $('#app').hidden = true;
  if (!socket.connected) socket.connect();
  socket.emit('servidor:info', (info) => {
    pedeConvite = !!info?.pedeConvite;
    trocarModoLogin(modoLogin);
  });
}

function trocarModoLogin(modo) {
  modoLogin = modo;
  const criar = modo === 'criar';
  $$('.abas-login button').forEach((b) => b.classList.toggle('ativa', b.dataset.modo === modo));
  $$('.so-criar').forEach((e) => (e.hidden = !criar));
  $('#campo-convite').hidden = !criar || !pedeConvite;
  $('#convite').required = criar && pedeConvite;
  $('#senha').autocomplete = criar ? 'new-password' : 'current-password';
  $('#senha').minLength = criar ? 6 : 0;
  $('#login-titulo').textContent = criar ? 'Criar uma conta' : 'Boas-vindas de volta!';
  $('#login-sub').textContent = criar ? 'Rapidinho, e seu nome fica só seu.' : 'Que bom te ver de novo. Bora jogar?';
  $('#btn-login').textContent = criar ? 'Criar conta' : 'Entrar';
  $('#erro-login').textContent = '';
}
$$('.abas-login button').forEach((b) => (b.onclick = () => trocarModoLogin(b.dataset.modo)));

if (token) {
  $('#login').hidden = true;
  socket.connect();
  entrar();
} else {
  if (conviteDaUrl()) {
    modoLogin = 'criar';
    $('#convite').value = conviteDaUrl();
  }
  mostrarLogin();
}

$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  $('#erro-login').textContent = '';
  if (!socket.connected) socket.connect();
  const botao = $('#btn-login');
  botao.disabled = true;
  const dados = {
    usuario: $('#usuario').value.trim(),
    nome: $('#nome-exibicao').value.trim(),
    senha: $('#senha').value,
    convite: $('#convite').value,
  };
  socket.emit(modoLogin === 'criar' ? 'conta:criar' : 'conta:entrar', dados, (res) => {
    botao.disabled = false;
    if (res.erro) {
      $('#erro-login').textContent = res.erro;
      return;
    }
    token = res.token;
    salvarStorage('token', token);
    contaNova = modoLogin === 'criar';
    $('#senha').value = '';
    // criou a conta com o convite: já está no servidor, não precisa entrar de novo
    if (modoLogin === 'criar' && $('#convite').value === conviteDaUrl()) esquecerConviteDaUrl();
    $('#convite').value = '';
    entrar();
  });
});

let contaNova = false; // acabou de criar a conta: não mostra novidades
function entrar() {
  // se a conexão caiu no meio de uma chamada, já volta pra ela
  const voltar = estado.voz ? {
    voz: estado.voz, mudo: estado.mudo, surdo: estado.surdo,
    mic: estado.mic?.id ?? null, camera: estado.cam?.id ?? null, tela: estado.tela?.id ?? null,
  } : null;
  socket.emit('entrar', { token, sessao: SESSAO, voltar }, (res) => {
    if (res.erro) {
      if (res.sessaoInvalida) {
        token = null;
        salvarStorage('token', null);
      }
      mostrarLogin(res.erro);
      return;
    }
    const primeiraVez = !estado.eu;
    estado.eu = { id: res.id, conta: res.conta, nome: res.nome, usuario: res.usuario, status: res.status ?? 'online', statusTexto: res.statusTexto ?? '' };
    estado.servidores = res.servidores;
    estado.iceServers = res.iceServers;
    estado.versao ??= res.versao ?? null; // versão desta página (a das novidades)
    estado.versaoServidor = res.versao ?? null;
    // o servidor foi atualizado com a página aberta: oferece recarregar (as novidades aparecem depois disso)
    if (estado.versao && res.versao && res.versao !== estado.versao) mostrarAtualizacaoWeb(res.versao);
    if (!primeiraVez && estado.voz) restaurarVoz(res.voz);
    if (primeiraVez) aplicarPrefs(res.prefs);
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#meu-nome').textContent = res.nome;
    if (primeiraVez && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (primeiraVez) setTimeout(() => mostrarNovidades(), 800);
    if (meuJogo) socket.emit('jogo', meuJogo);
    if (res.eventos) agendarLembretes(res.eventos, null);
    const convite = conviteDaUrl();
    if (convite) {
      esquecerConviteDaUrl();
      return entrarComConvite(convite);
    }
    const lembrado = estado.servidor.id ?? lerStorage('servidorAtivo', null);
    if (lembrado === 'dm') return abrirDms();
    abrirServidor(estado.servidores.some((x) => x.id === lembrado) ? lembrado : estado.servidores[0]?.id);
  });
}

// ---------- servidor (nome, ícone, canais) e perfis ----------
function aplicarServidor(srv) {
  estado.servidor = srv;
  estado.canaisTexto = srv.canais.filter((c) => c.tipo === 'texto');
  estado.canaisVoz = srv.canais.filter((c) => c.tipo === 'voz');
  if (srv.eventos && estado.eu) agendarLembretes(srv.eventos, srv.id);
  document.title = srv.nome ? `${srv.nome} · Concord` : 'Concord';
  const i = estado.servidores.findIndex((x) => x.id === srv.id);
  if (i >= 0) estado.servidores[i] = { id: srv.id, nome: srv.nome, icone: srv.icone, dono: srv.dono };
}

// Troca o servidor aberto (id vazio = nenhum: mostra a tela de criar/entrar; 'dm' = conversas diretas)
function abrirServidor(id, canal) {
  fecharPopovers();
  if (id === 'dm') return abrirDms(canal);
  if (id == null) {
    aplicarServidor(SEM_SERVIDOR);
    estado.perfis = [];
    estado.canalTexto = null;
    mensagens = [];
    $('#app').classList.add('sem-servidor');
    render();
    renderMensagens();
    abrirNovoServidor(true);
    return;
  }
  socket.emit('servidor:abrir', id, (res) => {
    if (res?.erro) {
      avisar(res.erro);
      return abrirServidor(estado.servidores.find((x) => x.id !== id)?.id);
    }
    $('#app').classList.remove('sem-servidor');
    $('#modal-novo-servidor').hidden = true;
    const trocou = estado.servidor.id !== id;
    if (trocou) estado.naoLidos.clear();
    estado.perfis = res.perfis;
    aplicarServidor(res.servidor);
    estado.srvNaoLidos.delete(id);
    estado.srvMencoes.delete(id);
    salvarStorage('servidorAtivo', id);
    const preferido = canal ?? (trocou ? lerStorage('ultimoCanal', {})[id] : estado.canalTexto);
    abrirTexto((estado.canaisTexto.find((c) => c.id === preferido) ?? estado.canaisTexto[0])?.id);
  });
}

// ---------- conversas diretas ----------
const emDm = () => estado.servidor.id === 'dm';
const dmComoCanal = (d) => d && { id: d.id, tipo: 'texto', nome: d.outro.nome, topico: '', dm: d };

function aplicarDms(res) {
  estado.dms = res.dms.filter((d) => d.outro);
  estado.perfis = [res.eu, ...estado.dms.map((d) => d.outro)];
}

function abrirDms(canal) {
  fecharPopovers();
  socket.emit('dm:lista', null, (res) => {
    if (res?.erro) return avisar(res.erro);
    const trocou = !emDm();
    $('#app').classList.remove('sem-servidor');
    $('#modal-novo-servidor').hidden = true;
    if (trocou) estado.naoLidos.clear();
    aplicarDms(res);
    aplicarServidor(DM);
    salvarStorage('servidorAtivo', 'dm');
    const alvo = canal ?? (trocou ? lerStorage('ultimoCanal', {}).dm : estado.canalTexto);
    abrirTexto((estado.dms.find((d) => d.id === alvo) ?? estado.dms[0])?.id);
  });
}

// alguém começou uma conversa comigo: atualiza a lista sem trocar de conversa
function atualizarDms() {
  socket.emit('dm:lista', null, (res) => {
    if (!emDm() || res?.erro) return;
    aplicarDms(res);
    render();
  });
}

function abrirDmCom(conta) {
  fecharPopovers();
  socket.emit('dm:abrir', { conta }, (res) => {
    if (res?.erro) return avisar(res.erro);
    if (emDm() && estado.dms.some((d) => d.id === res.dm.id)) return abrirTexto(res.dm.id);
    abrirDms(res.dm.id);
  });
}

$('#btn-dms').onclick = () => { if (!emDm()) abrirDms(); };

function entrarComConvite(convite) {
  socket.emit('servidor:entrar', { convite }, (res) => {
    if (res?.erro) {
      avisar(res.erro);
      if (estado.servidor.id == null) abrirServidor(estado.servidores[0]?.id);
      return;
    }
    $('#modal-novo-servidor').hidden = true;
    abrirServidor(res.id);
  });
}

// Tela de criar servidor / entrar com convite; `obrigatorio` = não tem nenhum servidor ainda
function abrirNovoServidor(obrigatorio = false) {
  fecharPopovers();
  $('#btn-fechar-novo-servidor').hidden = obrigatorio;
  $('#novo-servidor-dica').textContent = obrigatorio
    ? 'Você ainda não está em nenhum servidor. Crie um pra sua galera ou entre num com o convite de um amigo.'
    : 'Crie um servidor pra sua galera ou entre num com o convite de um amigo.';
  $('#novo-servidor-nome').value ||= estado.eu ? `Servidor de ${estado.eu.nome}` : '';
  $('#modal-novo-servidor').hidden = false;
}

$('#btn-novo-servidor').onclick = () => abrirNovoServidor(estado.servidores.length === 0);
$('#btn-fechar-novo-servidor').onclick = () => ($('#modal-novo-servidor').hidden = true);
$('#modal-novo-servidor').onclick = (e) => {
  if (e.target.id === 'modal-novo-servidor' && estado.servidores.length) e.target.hidden = true;
};
$('#form-criar-servidor').addEventListener('submit', (e) => {
  e.preventDefault();
  const botao = e.target.querySelector('button');
  botao.disabled = true;
  socket.emit('servidor:criar', { nome: $('#novo-servidor-nome').value }, (res) => {
    botao.disabled = false;
    if (res?.erro) return avisar(res.erro);
    $('#novo-servidor-nome').value = '';
    // a lista nova ('servidores') chega antes do ack
    abrirServidor(res.id);
    setTimeout(abrirConvite, 300);
  });
});
$('#form-entrar-servidor').addEventListener('submit', (e) => {
  e.preventDefault();
  const convite = $('#entrar-convite').value.trim();
  $('#entrar-convite').value = '';
  entrarComConvite(convite);
});

// Menu de um servidor: no nome dele (topo) ou com clique direito no ícone (barra da esquerda)
let menuServidorDe = null; // id do servidor do menu aberto
function abrirMenuServidor(srv, { x, y, largura = 200 }) {
  const menu = $('#menu-servidor');
  fecharPopovers();
  menuServidorDe = srv.id;
  const aberto = srv.id === estado.servidor.id;
  // admin só dá pra saber no servidor aberto; nos outros, só o dono tem certeza
  $('#ms-config').hidden = aberto ? !souAdmin() : srv.dono !== estado.eu?.conta;
  $('#ms-sair').hidden = srv.dono === estado.eu?.conta; // o dono não sai: apaga nas configurações
  menu.hidden = false;
  menu.style.width = `${largura}px`;
  const { height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, innerWidth - largura - 8)}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - height - 8))}px`;
}

// ações que precisam do servidor aberto: troca pra ele antes
function noServidorDoMenu(acao) {
  fecharPopovers();
  const id = menuServidorDe;
  if (id === estado.servidor.id) return acao();
  abrirServidor(id);
  const esperar = setInterval(() => {
    if (estado.servidor.id !== id) return;
    clearInterval(esperar);
    acao();
  }, 50);
  setTimeout(() => clearInterval(esperar), 5000);
}

$('#btn-menu-servidor').onclick = (e) => {
  e.stopPropagation();
  if (emDm()) return;
  if (!$('#menu-servidor').hidden) return fecharPopovers();
  const r = e.currentTarget.getBoundingClientRect();
  abrirMenuServidor(estado.servidor, { x: r.left + 8, y: r.bottom + 4, largura: Math.max(200, r.width - 16) });
};
$('#ms-convidar').onclick = () => noServidorDoMenu(abrirConvite);
$('#ms-config').onclick = () => noServidorDoMenu(() => abrirModalServidor());
$('#ms-sair').onclick = () => {
  fecharPopovers();
  const srv = estado.servidores.find((x) => x.id === menuServidorDe);
  if (!srv || !confirm(`Sair de ${srv.nome}? Pra voltar, vai precisar de um convite.`)) return;
  socket.emit('servidor:sair', srv.id, (res) => res?.erro && avisar(res.erro));
};

const perfilDe = (nome) => estado.perfis.find((p) => p.nome === nome);
const perfilPorConta = (id) => estado.perfis.find((p) => p.id === id);
const souAdmin = () => !!perfilPorConta(estado.eu?.conta)?.admin;
// cargos da pessoa, do mais alto pro mais baixo
const cargosDe = (perfil) => (perfil?.cargos ?? []).map((id) => estado.servidor?.cargos?.find((c) => c.id === id)).filter(Boolean);
// nome na cor do cargo mais alto (sem cargo: a cor da pessoa)
const corDoNome = (perfil, padrao) => cargosDe(perfil)[0]?.cor ?? perfil?.cor ?? padrao;
const souDono = () => estado.servidor.dono != null && estado.servidor.dono === estado.eu?.conta;
const canalPorId = (id) => (emDm() ? dmComoCanal(estado.dms.find((d) => d.id === id)) : estado.servidor.canais.find((c) => c.id === id));

function iniciais(nome) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 3).map((p) => [...p][0]).join('').toUpperCase() || '?';
}
function pintarIconeServidor(e, srv = estado.servidor) {
  const { nome, icone } = srv;
  e.textContent = icone ? '' : iniciais(nome);
  e.style.backgroundImage = icone ? `url("${icone}")` : '';
  e.classList.toggle('com-imagem', !!icone);
}

socket.on('servidores', (lista) => {
  estado.servidores = lista;
  // saí / apagaram o servidor aberto
  if (estado.servidor.id != null && !emDm() && !lista.some((x) => x.id === estado.servidor.id)) abrirServidor(lista[0]?.id);
  else renderRail();
});

socket.on('servidor', (srv) => {
  if (srv.eventos) agendarLembretes(srv.eventos, srv.id);
  if (srv.id !== estado.servidor.id) {
    // outro servidor meu mudou nome/ícone: só atualiza a barra da esquerda
    const i = estado.servidores.findIndex((x) => x.id === srv.id);
    if (i >= 0) estado.servidores[i] = { id: srv.id, nome: srv.nome, icone: srv.icone, dono: srv.dono };
    return renderRail();
  }
  aplicarServidor(srv);
  // o canal que eu estava foi apagado
  if (!canalPorId(estado.canalTexto)) abrirTexto(estado.canaisTexto[0]?.id);
  else render();
  if (!$('#modal-servidor').hidden) renderModalServidor();
});

socket.on('servidor:removido', ({ id, nome }) => {
  if (id === estado.servidor.id) avisar(`O servidor ${nome} foi apagado pelo dono.`);
});
socket.on('servidor:expulso', ({ nome }) => avisar(`Você foi removido(a) de ${nome} por um admin.`, 8000));

socket.on('perfis', ({ servidor, perfis }) => {
  if (servidor !== estado.servidor.id) return;
  estado.perfis = perfis;
  render();
  if (estado.view === 'texto') renderMensagens();
  if (!$('#modal-servidor').hidden) renderModalServidor();
});

socket.on('canal:apagado', ({ id }) => {
  estado.naoLidos.delete(id);
});

// o canal de voz em que eu estava foi apagado (ou saí do servidor dele)
socket.on('voz:expulso', () => {
  if (!estado.voz) return;
  sairVoz(false);
  avisar('A sala em que você estava não existe mais (ou você saiu do servidor), então você saiu da chamada.');
});

socket.on('renomeado', ({ de, para }) => {
  for (const tipo of ['mic', 'tela']) {
    const antigo = volumes[chaveVolume(de, tipo)];
    if (antigo === undefined) continue;
    volumes[chaveVolume(para, tipo)] = antigo;
    delete volumes[chaveVolume(de, tipo)];
  }
  salvarStorage('volumes', volumes);
  if (ajustes[de]) {
    ajustes[para] = ajustes[de];
    delete ajustes[de];
    salvarStorage('ajustes', ajustes);
  }
  if (estado.eu?.nome === de) {
    estado.eu.nome = para;
    $('#meu-nome').textContent = para;
    sincronizarPrefs();
  }
  // recarrega o canal aberto pra mostrar o nome novo nas mensagens antigas
  if (estado.view === 'texto' && estado.canalTexto) abrirTexto(estado.canalTexto);
});

// ---------- configurações salvas na conta ----------
// Volume de cada pessoa, qualidade da tela etc. vão pro servidor; microfone/câmera ficam por PC
function aplicarPrefs(prefs = {}) {
  if (prefs.volumes) Object.assign(volumes, prefs.volumes);
  if (prefs.ajustes) Object.assign(ajustes, prefs.ajustes);
  salvarStorage('ajustes', ajustes);
  if (prefs.transmissao) Object.assign(transmissao, prefs.transmissao);
  if (typeof prefs.membrosVisiveis === 'boolean') estado.membrosVisiveis = prefs.membrosVisiveis;
  if (prefs.boneco) meuBoneco = prefs.boneco;
  salvarStorage('boneco', meuBoneco);
  salvarStorage('volumes', volumes);
  salvarStorage('transmissao', transmissao);
  salvarStorage('membrosVisiveis', estado.membrosVisiveis);
}

let prefsTimer;
function sincronizarPrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    socket.emit('prefs', { volumes, ajustes, transmissao, membrosVisiveis: estado.membrosVisiveis, boneco: meuBoneco });
  }, 1000);
}

// Fechando ou recarregando a página: sai da sala na hora (senão os outros acham que é só uma queda e esperam)
window.addEventListener('pagehide', () => { if (estado.voz) socket.emit('voz:sair'); });

// Reconectou (ex.: queda de internet, servidor atualizando): entra de novo automaticamente
socket.on('connect', () => { if (estado.eu) entrar(); });

// Sem servidor, a chamada continua (o áudio vai direto entre os PCs): só desiste se demorar demais
const ESPERA_RECONEXAO = 90_000;
let quedaTimer = null;
let silencioSonsAte = 0; // não toca "entrou/saiu" enquanto todo mundo reconecta
socket.on('disconnect', (motivo) => {
  // o servidor derrubou porque você entrou de novo em outra aba/janela
  if (motivo === 'io server disconnect') {
    if (token) avisar('Sua conta entrou em outro lugar, então esta janela foi desconectada. Aperte F5 pra voltar aqui.', 60000);
    if (estado.voz) sairVoz(false);
    return;
  }
  if (!estado.voz) return;
  silencioSonsAte = Infinity;
  avisar('Reconectando ao servidor… a chamada continua.', ESPERA_RECONEXAO);
  clearTimeout(quedaTimer);
  quedaTimer = setTimeout(() => {
    if (socket.connected || !estado.voz) return;
    sairVoz(false);
    avisar('Sem conexão com o servidor há muito tempo — você saiu da chamada.');
  }, ESPERA_RECONEXAO);
});

// Depois de reconectar: o servidor já me pôs de volta na sala e as conexões com quem estava lá continuam
function restaurarVoz(voz) {
  clearTimeout(quedaTimer);
  silencioSonsAte = Date.now() + 10_000;
  if (!voz) {
    sairVoz(false);
    return avisar('A sala em que você estava não existe mais, então você saiu da chamada.');
  }
  for (const id of voz.outros) if (!peers.has(id)) criarPeer(id);
  if ($('#toast').textContent.startsWith('Reconectando')) $('#toast').hidden = true;
  // o servidor reiniciou e esqueceu o vídeo: quem estava assistindo devolve ele, no ponto em que estava
  const tinha = estado.assistir && { ...estado.assistir, posicao: posicaoEsperada() };
  socket.emit('assistir:estado', null, (a) => {
    if (a || !tinha) return aplicarAssistir(a);
    socket.emit('assistir:iniciar', tinha.video, () => socket.emit('assistir:controle', { tocando: tinha.tocando, posicao: tinha.posicao }));
  });
  restaurarMapa();
}

let membrosVoz = new Set();
const sumidos = new Map(); // id -> timeout: estava na call e sumiu da lista (pode estar só reconectando)
const ESPERA_SUMIDO = 20_000;
function tirarSumido(id) {
  clearTimeout(sumidos.get(id));
  sumidos.delete(id);
  if (!estado.usuarios.some((x) => x.id === id && x.voz === estado.voz && !x.sumido)) fecharPeer(id);
  estado.usuarios = estado.usuarios.filter((x) => !(x.id === id && x.sumido));
  render();
}
socket.on('presenca', (lista) => {
  const antes = estado.usuarios;
  for (const id of [...peers.keys()]) {
    const u = lista.find((x) => x.id === id);
    const conta = antes.find((x) => x.id === id)?.conta;
    const voltouComOutraSessao = !u && conta != null && lista.some((x) => x.conta === conta && x.id !== id);
    if (voltouComOutraSessao) {
      clearTimeout(sumidos.get(id));
      sumidos.delete(id);
      fecharPeer(id);
    } else if (u?.voz === estado.voz) {
      clearTimeout(sumidos.get(id));
      sumidos.delete(id);
    } else if (u || peers.get(id).pc.connectionState !== 'connected') {
      fecharPeer(id); // saiu da sala de verdade
    } else if (!sumidos.has(id)) {
      // sumiu mas a conexão direta continua: espera ele reconectar no servidor
      sumidos.set(id, setTimeout(() => tirarSumido(id), ESPERA_SUMIDO));
    }
  }
  // quem está reconectando continua aparecendo (e sendo ouvido) na chamada
  const reconectando = antes.filter((u) => sumidos.has(u.id) && !lista.some((x) => x.id === u.id)).map((u) => ({ ...u, sumido: true }));
  estado.usuarios = [...lista, ...reconectando];
  lista = estado.usuarios;

  // som de alguém entrando/saindo da minha sala
  const agora = new Set(estado.voz ? lista.filter((u) => u.voz === estado.voz).map((u) => u.id) : []);
  if (estado.voz && membrosVoz.has(estado.eu.id) && Date.now() > silencioSonsAte) {
    if ([...agora].some((id) => !membrosVoz.has(id))) som('entrar');
    else if ([...membrosVoz].some((id) => !agora.has(id))) som('sair');
  }
  membrosVoz = agora;

  render();
});

// ---------- render ----------
function render() {
  renderServidor();
  renderEventos();
  renderCanais();
  renderMembros();
  renderPainel();
  renderView();
  renderGrid();
}

function avatar(u, { status = false } = {}) {
  const perfil = perfilDe(u.nome);
  const a = el('span', 'avatar', perfil?.avatar ? '' : [...u.nome][0]?.toUpperCase() ?? '?');
  a.style.background = perfil?.cor ?? u.cor;
  if (perfil?.avatar) {
    a.style.backgroundImage = `url("${perfil.avatar}")`;
    a.classList.add('com-foto');
  }
  if (u.id) a.dataset.fala = u.id;
  a.classList.toggle('falando', falando.has(u.id));
  if (status) {
    const dot = el('span', 'status-dot');
    dot.dataset.status = u.status ?? 'online';
    a.append(dot);
  }
  return a;
}

const contador = (n) => el('span', 'badge-mencao', n > 99 ? '99+' : String(n));

function renderRail() {
  const dms = $('#btn-dms');
  const dmsNovas = [...estado.dmNaoLidos.values()].reduce((a, b) => a + b, 0);
  dms.classList.toggle('ativo', emDm());
  dms.classList.toggle('nao-lido', dmsNovas > 0);
  dms.querySelector('.badge-mencao')?.remove();
  if (dmsNovas) dms.append(contador(dmsNovas));
  $('#lista-servidores').replaceChildren(...estado.servidores.map((srv) => {
    const item = el('div', 'rail-item');
    item.classList.toggle('ativo', srv.id === estado.servidor.id);
    item.classList.toggle('nao-lido', estado.srvNaoLidos.has(srv.id));
    item.title = srv.nome;
    const ic = el('div', 'icone-servidor');
    pintarIconeServidor(ic, srv);
    item.append(el('span', 'pill'), ic);
    if (estado.srvMencoes.get(srv.id)) item.append(contador(estado.srvMencoes.get(srv.id)));
    item.onclick = () => { if (srv.id !== estado.servidor.id) abrirServidor(srv.id); };
    item.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirMenuServidor(srv, { x: e.clientX, y: e.clientY });
    };
    return item;
  }));
}

function renderServidor() {
  $('#servidor-nome').textContent = estado.servidor.nome;
  $('#btn-menu-servidor').classList.toggle('sem-menu', emDm());
  $$('.btn-convidar').forEach((b) => (b.hidden = emDm()));
  renderRail();
  const admin = souAdmin();
  $('#btn-cfg-servidor').hidden = !admin;
  $$('.so-admin').forEach((e) => (e.hidden = !admin));
}

function renderDms() {
  $('#lista-dms').hidden = !emDm();
  $('.lista-canais').hidden = emDm();
  if (!emDm()) return;
  $('#dms-vazio').hidden = estado.dms.length > 0;
  $('#dms').replaceChildren(...estado.dms.map((d) => {
    const li = el('li', 'canal dm');
    const online = estado.usuarios.find((u) => u.conta === d.outro.id);
    li.append(avatar(online ?? { nome: d.outro.nome, cor: d.outro.cor }, { status: !!online }), el('span', null, d.outro.nome));
    li.classList.toggle('ativo', estado.view === 'texto' && d.id === estado.canalTexto);
    li.classList.toggle('nao-lido', estado.dmNaoLidos.has(d.id));
    if (estado.dmNaoLidos.get(d.id)) li.append(contador(estado.dmNaoLidos.get(d.id)));
    li.onclick = () => abrirTexto(d.id);
    return li;
  }));
}

// ---------- eventos agendados ----------
const DURA_EVENTO = 3 * 60 * 60 * 1000;
const lembretes = new Map(); // id do evento -> { ev, timers }
const eventoAgora = (ev) => ev.inicio <= Date.now() && Date.now() < ev.inicio + DURA_EVENTO;

function quandoEvento(inicio) {
  const d = new Date(inicio);
  const hoje = new Date();
  const amanha = new Date(Date.now() + 864e5);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`;
  if (d.toDateString() === amanha.toDateString()) return `Amanhã às ${hora}`;
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${dia[0].toUpperCase()}${dia.slice(1)} às ${hora}`;
}

function renderBotaoEventos() {
  const eventos = estado.servidor?.eventos ?? [];
  const agora = eventos.find(eventoAgora);
  $('#btn-eventos').hidden = !estado.servidor?.id || emDm();
  $('#btn-eventos').classList.toggle('ao-vivo', !!agora);
  $('#texto-eventos').textContent = agora ? `Agora: ${agora.titulo}` : 'Eventos';
  const futuros = eventos.filter((e) => e.inicio > Date.now()).length;
  $('#badge-eventos').hidden = !futuros;
  $('#badge-eventos').textContent = futuros;
}

function cartaoEvento(ev) {
  const c = el('div', `evento${eventoAgora(ev) ? ' ao-vivo' : ''}`);
  const vou = ev.confirmados.includes(estado.eu.conta);
  c.append(el('div', 'evento-quando', eventoAgora(ev) ? '🔴 Acontecendo agora' : quandoEvento(ev.inicio)));
  c.append(el('div', 'evento-titulo', ev.titulo));
  if (ev.descricao) c.append(el('div', 'evento-descricao', ev.descricao));
  const sala = ev.canal && canalPorId(ev.canal);
  const nomes = ev.confirmados.map((x) => perfilPorConta(x)?.nome ?? 'alguém');
  c.append(el('div', 'evento-info', `${sala ? `🔊 ${sala.nome} · ` : ''}Marcado por ${ev.autor} · ${nomes.length} ${nomes.length === 1 ? 'vai' : 'vão'}${nomes.length ? `: ${nomes.join(', ')}` : ''}`));
  const acoes = el('div', 'evento-acoes');
  const b = el('button', vou ? 'btn-secundario vou' : 'btn-primario', vou ? '✓ Vou' : 'Vou');
  b.type = 'button';
  b.title = vou ? 'Clique pra desmarcar' : 'Confirmar presença (você recebe lembrete)';
  b.onclick = () => socket.emit('evento:confirmar', ev.id, (r) => r?.erro && avisar(r.erro));
  acoes.append(b);
  if (sala && eventoAgora(ev)) {
    const entrar = el('button', 'btn-primario verde', 'Entrar na sala');
    entrar.type = 'button';
    entrar.onclick = () => {
      $('#modal-eventos').hidden = true;
      entrarVoz(sala.id);
    };
    acoes.append(entrar);
  }
  if (ev.conta === estado.eu.conta || perfilPorConta(estado.eu.conta)?.admin) {
    const x = el('button', 'btn-secundario', 'Cancelar evento');
    x.type = 'button';
    x.onclick = () => {
      if (confirm(`Cancelar o evento "${ev.titulo}"?`)) socket.emit('evento:apagar', ev.id, (r) => r?.erro && avisar(r.erro));
    };
    acoes.append(x);
  }
  c.append(acoes);
  return c;
}

function renderEventos() {
  renderBotaoEventos();
  if ($('#modal-eventos').hidden) return;
  const eventos = estado.servidor?.eventos ?? [];
  $('#lista-eventos').replaceChildren(...(eventos.length
    ? eventos.map(cartaoEvento)
    : [el('p', 'vazio-eventos', 'Nenhum evento marcado. Marque um jogo com a galera: quem confirmar recebe lembrete 10 minutos antes.')]));
}

function abrirEventos() {
  $('#modal-eventos').hidden = false;
  $('#form-evento').hidden = true;
  $('#btn-novo-evento').hidden = false;
  renderEventos();
}
$('#btn-eventos').onclick = abrirEventos;
$('#btn-fechar-eventos').onclick = () => ($('#modal-eventos').hidden = true);
$('#modal-eventos').onclick = (e) => { if (e.target.id === 'modal-eventos') e.target.hidden = true; };
$('#btn-novo-evento').onclick = () => {
  $('#form-evento').reset();
  // próxima hora cheia
  const d = new Date(Date.now() + 36e5);
  d.setMinutes(0, 0, 0);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  $('#evento-inicio').value = local;
  $('#evento-inicio').min = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  $('#evento-canal').replaceChildren(new Option('Nenhuma', ''), ...estado.canaisVoz.map((c) => new Option(c.nome, c.id)));
  $('#evento-canal').value = estado.canaisVoz[0]?.id ?? '';
  $('#form-evento').hidden = false;
  $('#btn-novo-evento').hidden = true;
  $('#evento-titulo').focus();
};
$('#btn-cancelar-evento').onclick = () => {
  $('#form-evento').hidden = true;
  $('#btn-novo-evento').hidden = false;
};
$('#form-evento').onsubmit = (e) => {
  e.preventDefault();
  const inicio = new Date($('#evento-inicio').value).getTime();
  socket.emit('evento:criar', {
    servidor: estado.servidor.id,
    titulo: $('#evento-titulo').value,
    descricao: $('#evento-descricao').value,
    inicio,
    canal: Number($('#evento-canal').value) || null,
  }, (r) => {
    if (r?.erro) return avisar(r.erro);
    $('#form-evento').hidden = true;
    $('#btn-novo-evento').hidden = false;
  });
};

// alguém marcou um evento no servidor
socket.on('evento:novo', (ev) => {
  if (ev.conta === estado.eu?.conta) return;
  const srv = estado.servidores.find((s) => s.id === ev.servidor);
  avisar(`📅 ${ev.autor} marcou "${ev.titulo}" (${quandoEvento(ev.inicio)})${srv && srv.id !== estado.servidor.id ? ` em ${srv.nome}` : ''}. Veja em Eventos.`, 8000);
});

// Lembretes: 10 min antes e na hora, dos eventos que eu confirmei (de qualquer servidor)
function lembrar(ev, quando) {
  const sala = ev.canal ? `: entre na sala de voz` : '';
  const texto = quando === 'antes' ? `📅 "${ev.titulo}" começa em 10 minutos` : `📅 Começou: "${ev.titulo}"${sala}`;
  avisar(texto, 15000);
  som('entrar');
  if (window.Notification?.permission === 'granted') {
    const n = new Notification('Concord: evento', { body: texto });
    n.onclick = () => {
      appDesktop?.mostrar?.();
      window.focus();
      abrirServidor(ev.servidor);
      setTimeout(abrirEventos, 500);
    };
  }
}
function agendarLembretes(eventos, servidor) {
  // eventos desse servidor (ou da lista inicial) que sumiram/foram desmarcados: cancela
  for (const [id, l] of lembretes) {
    if ((servidor == null || l.ev.servidor === servidor) && !eventos.some((e) => e.id === id && e.confirmados.includes(estado.eu.conta))) {
      l.timers.forEach(clearTimeout);
      lembretes.delete(id);
    }
  }
  for (const ev of eventos) {
    if (!ev.confirmados.includes(estado.eu.conta)) continue;
    const velho = lembretes.get(ev.id);
    if (velho?.ev.inicio === ev.inicio) {
      velho.ev = ev;
      continue;
    }
    velho?.timers.forEach(clearTimeout);
    const timers = [];
    const ate = (t) => t - Date.now();
    // setTimeout não aguenta mais de ~24 dias; o lembrete é reagendado quando a lista chegar de novo
    if (ate(ev.inicio - 10 * 6e4) > 0 && ate(ev.inicio) < 2 ** 31 - 1) timers.push(setTimeout(() => lembrar(ev, 'antes'), ate(ev.inicio - 10 * 6e4)));
    if (ate(ev.inicio) > 0 && ate(ev.inicio) < 2 ** 31 - 1) timers.push(setTimeout(() => lembrar(ev, 'agora'), ate(ev.inicio)));
    lembretes.set(ev.id, { ev, timers });
  }
}
// "Acontecendo agora" muda sozinho com o tempo
setInterval(() => estado.servidor?.eventos?.length && renderEventos(), 30_000);

function renderCanais() {
  renderDms();
  if (emDm()) return;
  $('#canais-texto').replaceChildren(...estado.canaisTexto.map((c) => {
    const li = el('li', 'canal');
    li.append(icone('hash'), el('span', null, c.nome));
    if (c.privado) li.append(icone('cadeado', 'privado'));
    li.classList.toggle('ativo', estado.view === 'texto' && c.id === estado.canalTexto);
    li.classList.toggle('nao-lido', estado.naoLidos.has(c.id));
    if (estado.canalMencoes.has(c.id)) li.append(contador(1));
    li.onclick = () => abrirTexto(c.id);
    return li;
  }));

  $('#canais-voz').replaceChildren(...estado.canaisVoz.map((c) => {
    const li = el('li');
    const nome = el('div', 'canal');
    nome.append(icone('voz'), el('span', null, c.nome));
    if (c.privado) nome.append(icone('cadeado', 'privado'));
    nome.classList.toggle('ativo', estado.view === 'voz' && c.id === estado.voz);
    nome.onclick = () => entrarVoz(c.id);
    const membros = el('ul', 'membros-voz');
    for (const u of estado.usuarios.filter((x) => x.voz === c.id)) {
      const m = el('li', 'usuario-voz');
      m.append(avatar(u), el('span', 'nome', u.nome));
      if (u.jogo) {
        const j = iconeJogo(u.jogo);
        j.title = `Jogando ${u.jogo.nome}`;
        m.append(j);
      }
      m.onclick = (e) => {
        if (u.tela && u.voz === estado.voz) {
          e.stopPropagation();
          esconderPrevia();
          estado.view = 'voz';
          return render();
        }
        abrirPerfil(u.nome, e);
      };
      m.oncontextmenu = (e) => abrirMenuPessoa(u.id, e);
      if (u.tela) {
        m.onmouseenter = () => mostrarPrevia(u, m);
        m.onmouseleave = esconderPrevia;
      }
      if (u.id !== estado.eu.id && ajustes[u.nome]?.mudo) m.classList.add('silenciado-pra-mim');
      if (u.tela) m.append(el('span', 'badge-vivo', 'AO VIVO'));
      if (u.camera) m.append(icone('camera'));
      if (u.voz === estado.voz) {
        const r = iconeRede(redeDe(u));
        if (r) m.append(r);
      }
      if (u.surdo) m.append(icone('foneOff'));
      else if (u.mudo) m.append(icone('micOff'));
      membros.append(m);
    }
    li.append(nome, membros);
    return li;
  }));
}

function itemMembro(u, online) {
  const li = el('li', online ? 'membro' : 'membro offline');
  const nome = el('span', 'nome');
  const linha = el('span', 'nome-linha', u.nome);
  linha.style.color = corDoNome(perfilPorConta(u.conta) ?? perfilDe(u.nome), u.cor);
  if (perfilDe(u.nome)?.admin) linha.append(icone('coroa', 'coroa'));
  nome.append(linha);
  if (online && u.jogo) {
    const a = el('span', 'atividade jogando');
    a.append(el('span', null, 'Jogando '), el('b', null, u.jogo.nome));
    nome.append(a);
  }
  if (u.voz) {
    const sala = canalPorId(u.voz)?.nome ?? 'outro servidor';
    nome.append(el('span', 'atividade', u.tela ? `Ao vivo em ${sala}` : `Em ${sala}`));
  } else if (online && u.statusTexto && !u.jogo) {
    nome.append(el('span', 'atividade', u.statusTexto));
  }
  li.append(avatar(u, { status: online }), nome);
  if (online && u.jogo) {
    const j = iconeJogo(u.jogo);
    j.title = `Jogando ${u.jogo.nome}`;
    li.append(j);
  }
  li.onclick = (e) => abrirPerfil(u.nome, e);
  if (online) li.oncontextmenu = (e) => abrirMenuPessoa(u.id, e);
  return li;
}

function renderMembros() {
  $('#membros').hidden = !estado.membrosVisiveis || estado.view === 'voz' || emDm();
  $('#btn-membros').classList.toggle('ativo', estado.membrosVisiveis);
  $('#btn-membros').hidden = emDm();
  const porNome = (a, b) => a.nome.localeCompare(b.nome);
  // só membros deste servidor (a lista também traz quem está na minha call de outro servidor)
  const online = estado.usuarios.filter((u) => perfilPorConta(u.conta)).sort(porNome);
  const nomesOnline = new Set(online.map((u) => u.nome));
  const offline = estado.perfis.filter((p) => !nomesOnline.has(p.nome)).sort(porNome);
  // online agrupado pelo cargo mais alto (como no Discord); quem não tem cargo fica em "Online"
  const grupos = new Map((estado.servidor?.cargos ?? []).map((c) => [c.id, []]));
  const semCargo = [];
  for (const u of online) {
    const topo = cargosDe(perfilPorConta(u.conta))[0];
    (topo ? grupos.get(topo.id) : semCargo).push(u);
  }
  const itens = [];
  for (const c of estado.servidor?.cargos ?? []) {
    const lista = grupos.get(c.id);
    if (lista.length) itens.push(el('li', 'titulo-grupo', `${c.nome} — ${lista.length}`), ...lista.map((u) => itemMembro(u, true)));
  }
  // sem nenhum grupo de cargo: só o título "Online" de sempre
  $('#titulo-online').hidden = itens.length > 0;
  $('#titulo-online').textContent = `Online — ${online.length}`;
  if (itens.length && semCargo.length) itens.push(el('li', 'titulo-grupo', `Online — ${semCargo.length}`));
  $('#online').replaceChildren(...itens, ...semCargo.map((u) => itemMembro(u, true)));
  $('#titulo-offline').hidden = !offline.length;
  $('#titulo-offline').textContent = `Offline — ${offline.length}`;
  $('#offline').replaceChildren(...offline.map((p) => itemMembro(p, false)));
}

function renderPainel() {
  const meu = estado.usuarios.find((u) => u.id === estado.eu?.id);
  if (meu) $('#meu-avatar').replaceChildren(avatar(meu, { status: true }));
  if (estado.eu) $('.eu-txt .status').textContent = estado.eu.statusTexto || STATUS_NOME[estado.eu.status] || 'Online';
  $('#painel-voz').hidden = !estado.voz;
  $('#nome-canal-voz').textContent = estado.vozInfo ? `${estado.vozInfo.canal} / ${estado.vozInfo.servidor}` : '';

  const semMic = estado.mudo || estado.surdo;
  $$('.btn-mudo').forEach((b) => {
    b.replaceChildren(icone(semMic ? 'micOff' : 'mic'));
    b.classList.toggle('desligado', semMic);
    b.title = semMic ? 'Reativar microfone' : 'Silenciar';
  });
  $$('.btn-surdo').forEach((b) => {
    b.replaceChildren(icone(estado.surdo ? 'foneOff' : 'fone'));
    b.classList.toggle('desligado', estado.surdo);
  });
  $$('.btn-camera').forEach((b) => b.classList.toggle('ligado', !!estado.cam));
  $$('.btn-tela').forEach((b) => b.classList.toggle('ligado', !!estado.tela));
}

function renderView() {
  const naVoz = estado.view === 'voz' && !!estado.voz;
  $('#view-texto').hidden = naVoz;
  $('#view-voz').hidden = !naVoz;
  $('#icone-canal').replaceChildren(icone(naVoz ? 'voz' : emDm() ? 'arroba' : 'hash'));
  const texto = canalPorId(estado.canalTexto);
  $('#titulo-canal').textContent = naVoz ? estado.vozInfo?.canal ?? '' : texto?.nome ?? '';
  $('#topico').textContent = naVoz ? '' : texto?.topico ?? '';
  $('#btn-fixadas').hidden = naVoz;
  $('#input-msg').placeholder = emDm() ? `Conversar com @${texto?.nome ?? ''}` : `Conversar em #${texto?.nome ?? ''}`;
  $('#form-msg').hidden = estado.canalTexto == null;
}

$$('.categoria').forEach((c) => {
  c.onclick = () => {
    c.classList.toggle('recolhida');
    $(`#${c.dataset.lista}`).hidden = c.classList.contains('recolhida');
  };
});

$('#btn-membros').onclick = () => {
  estado.membrosVisiveis = !estado.membrosVisiveis;
  salvarStorage('membrosVisiveis', estado.membrosVisiveis);
  sincronizarPrefs();
  renderMembros();
};

// menu lateral em tela pequena
$('#btn-menu').onclick = () => $('#app').classList.toggle('menu-aberto');
const fecharMenu = () => $('#app').classList.remove('menu-aberto');

// ---------- chat ----------
let mensagens = []; // mensagens do canal aberto, em ordem
let editando = null; // { id, texto } da mensagem sendo editada
let respondendo = null; // mensagem que estou respondendo
let temMais = false; // ainda tem mensagem mais antiga pra carregar
let carregandoAntigas = false;
let alvoMensagem = null; // { canal, id }: pular pra essa mensagem quando o canal abrir
const digitando = new Map(); // nome -> timeout

function abrirTexto(canal) {
  estado.canalTexto = canal ?? null;
  if (canal != null && estado.servidor.id != null) {
    const ultimos = lerStorage('ultimoCanal', {});
    ultimos[estado.servidor.id] = canal;
    salvarStorage('ultimoCanal', ultimos);
  }
  estado.view = 'texto';
  estado.naoLidos.delete(canal);
  estado.canalMencoes.delete(canal);
  estado.dmNaoLidos.delete(canal);
  mensagens = [];
  temMais = false;
  editando = null;
  respondendo = null;
  renderResposta();
  digitando.forEach(clearTimeout);
  digitando.clear();
  renderDigitando();
  $('#painel-fixadas').hidden = true;
  renderMensagens();

  if (canal != null) socket.emit('historico', canal, (rows) => {
    if (canal !== estado.canalTexto || !Array.isArray(rows)) return;
    mensagens = rows;
    temMais = rows.length >= PAGINA;
    renderMensagens();
    rolarProFim();
    if (alvoMensagem?.canal === canal) revelar(alvoMensagem.id);
  });
  fecharMenu();
  render();
  $('#input-msg').focus();
}

const rolarProFim = () => { const m = $('#mensagens'); m.scrollTop = m.scrollHeight; };

// Rolou pro topo: busca as mensagens de antes (sem a tela pular)
function carregarAnteriores() {
  if (!temMais || carregandoAntigas || !mensagens.length) return Promise.resolve(false);
  carregandoAntigas = true;
  const canal = estado.canalTexto;
  return new Promise((resolve) => socket.emit('historico', { canal, antes: mensagens[0].id }, (rows) => {
    carregandoAntigas = false;
    if (canal !== estado.canalTexto || !Array.isArray(rows)) return resolve(false);
    temMais = rows.length >= PAGINA;
    const box = $('#mensagens');
    const distanciaDoFim = box.scrollHeight - box.scrollTop;
    mensagens = [...rows, ...mensagens];
    renderMensagens({ distanciaDoFim });
    resolve(true);
  }));
}
$('#mensagens').addEventListener('scroll', (e) => { if (e.target.scrollTop < 400) carregarAnteriores(); });

// Vai até uma mensagem do canal aberto (carregando as antigas se precisar) e pisca ela
async function revelar(id) {
  alvoMensagem = null;
  const canal = estado.canalTexto;
  for (let i = 0; i < 50 && !mensagens.some((m) => m.id === id) && temMais; i++) {
    if (!(await carregarAnteriores()) || canal !== estado.canalTexto) return;
  }
  const no = $(`#mensagens .msg[data-id="${id}"]`);
  if (!no) return avisar('Essa mensagem não existe mais.', 3000);
  no.scrollIntoView({ block: 'center' });
  no.classList.remove('destaque');
  void no.offsetWidth; // reinicia a animação
  no.classList.add('destaque');
}

// Abre o servidor/conversa e o canal certos e mostra a mensagem
function irParaMensagem(servidor, canal, id) {
  const destino = servidor ?? 'dm';
  alvoMensagem = { canal, id };
  if (destino !== estado.servidor.id) return abrirServidor(destino, canal);
  if (canal !== estado.canalTexto || estado.view !== 'texto') return abrirTexto(canal);
  revelar(id);
}

const URL_RE = /https?:\/\/[^\s<]+/g;
const IMG_RE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
const GIF_RE = /^https:\/\/(media\d*\.giphy\.com|i\.giphy\.com|media\.tenor\.com|c\.tenor\.com)\/[^\s<]+$/;
const UPLOAD_RE = /^\/uploads\/[a-f0-9]+\.(png|jpg|gif|webp)$/;
const ARQUIVO_RE = /^\/uploads\/[a-f0-9]{24}\/([^/?#]+)$/;
const ehUpload = (texto) => texto.startsWith('/uploads/');
const extensao = (nome) => nome.match(/\.([a-z0-9]{1,8})$/i)?.[1].toLowerCase() ?? '';
const nomeDoArquivo = (texto) => {
  try { return decodeURIComponent(texto.match(ARQUIVO_RE)?.[1] ?? ''); } catch { return 'arquivo'; }
};
function resumoMensagem(texto) {
  if (UPLOAD_RE.test(texto)) return '📷 Imagem';
  if (ARQUIVO_RE.test(texto)) return `📎 ${nomeDoArquivo(texto)}`;
  texto = texto.replace(/\|\|[\s\S]+?\|\|/g, '▒▒▒▒');
  return texto.length > 120 ? `${texto.slice(0, 120)}…` : texto;
}

function cartaoArquivo(url, nome) {
  const c = el('div', 'arquivo');
  const link = el('a', 'arquivo-nome', nome);
  link.href = url;
  link.download = nome;
  const baixar = el('a', 'btn-icone');
  baixar.href = url;
  baixar.download = nome;
  baixar.title = 'Baixar';
  baixar.append(icone('baixar'));
  c.append(icone('arquivo'), link, baixar);
  return c;
}

function previewArquivo(url) {
  const nome = nomeDoArquivo(url);
  const ext = extensao(nome);
  if (['mp4', 'webm', 'mov'].includes(ext)) {
    const v = el('video', 'preview-video');
    v.src = url;
    v.controls = true;
    v.preload = 'metadata';
    v.addEventListener('loadedmetadata', () => {
      if (v.duration !== Infinity) return;
      v.currentTime = 1e9;
      v.addEventListener('timeupdate', () => (v.currentTime = 0), { once: true });
    }, { once: true });
    const caixa = el('div', 'arquivo-midia');
    caixa.append(v, cartaoArquivo(url, nome));
    return caixa;
  }
  if (['mp3', 'ogg', 'wav', 'm4a'].includes(ext)) {
    const a = el('audio');
    a.src = url;
    a.controls = true;
    a.preload = 'metadata';
    const caixa = el('div', 'arquivo-midia');
    caixa.append(cartaoArquivo(url, nome), a);
    return caixa;
  }
  return cartaoArquivo(url, nome);
}

// ---------- @menções ----------
const escaparRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FIM_NOME = '(?![\\p{L}\\p{N}_])';
let mencaoRe = null;
let mencaoChave = null;
function regexMencao() {
  // nomes maiores primeiro: "@Ana Paula" ganha de "@Ana"
  const nomes = [...new Set(estado.perfis.map((p) => p.nome))].sort((a, b) => b.length - a.length);
  const chave = nomes.join('\n');
  if (chave !== mencaoChave) {
    mencaoChave = chave;
    mencaoRe = new RegExp(`@(?:${['todos', 'everyone', ...nomes.map(escaparRe)].join('|')})${FIM_NOME}`, 'giu');
  }
  return mencaoRe;
}
function mencionaEu(texto) {
  const nome = estado.eu?.nome;
  return !!nome && new RegExp(`@(?:todos|everyone|${escaparRe(nome)})${FIM_NOME}`, 'iu').test(texto);
}
// :nome: vira a imagem do emoji do servidor aberto
function imgEmoji(e) {
  const img = el('img', 'emoji-custom');
  img.src = e.url;
  img.alt = `:${e.nome}:`;
  img.title = `:${e.nome}:`;
  img.draggable = false;
  return img;
}
function emojiDoServidor(texto) {
  const nome = /^:([a-z0-9_]{2,32}):$/.exec(texto)?.[1];
  return nome && !emDm() ? estado.servidor?.emojis?.find((e) => e.nome === nome) : null;
}
function comEmojis(trecho) {
  const lista = emDm() ? [] : estado.servidor?.emojis ?? [];
  if (!lista.length || !trecho.includes(':')) return [trecho];
  const nos = [];
  let i = 0;
  for (const m of trecho.matchAll(/:([a-z0-9_]{2,32}):/g)) {
    const e = lista.find((x) => x.nome === m[1]);
    if (!e) continue;
    nos.push(trecho.slice(i, m.index), imgEmoji(e));
    i = m.index + m[0].length;
  }
  nos.push(trecho.slice(i));
  return nos;
}

function comMencoes(trecho) {
  const nos = [];
  let i = 0;
  for (const m of trecho.matchAll(regexMencao())) {
    nos.push(...comEmojis(trecho.slice(i, m.index)));
    const marca = el('span', 'mencao', m[0]);
    const p = estado.perfis.find((x) => x.nome.toLowerCase() === m[0].slice(1).toLowerCase());
    if (p) marca.onclick = (e) => abrirPerfil(p.nome, e);
    nos.push(marca);
    i = m.index + m[0].length;
  }
  nos.push(...comEmojis(trecho.slice(i)));
  return nos;
}

function imagemPreview(src) {
  const img = el('img', 'preview');
  img.src = src;
  img.loading = 'lazy';
  img.onclick = () => window.open(new URL(src, location.href).href, '_blank', 'noopener');
  img.onload = () => {
    const box = $('#mensagens');
    if (box.scrollHeight - box.scrollTop - box.clientHeight < img.height + 80) rolarProFim();
  };
  return img;
}

function formatarTexto(texto) {
  const linha = el('div', 'linha');
  // só um GIF (do botão GIF): mostra a imagem, sem o link
  if (GIF_RE.test(texto)) {
    linha.append(imagemPreview(texto));
    return linha;
  }
  // só emojis do servidor: ficam grandes
  if (/^(\s*:[a-z0-9_]{2,32}:\s*){1,6}$/.test(texto)) {
    const nos = comEmojis(texto.trim());
    if (nos.some((n) => n instanceof Element)) {
      linha.classList.add('so-emoji');
      linha.append(...nos);
      return linha;
    }
  }
  if (UPLOAD_RE.test(texto)) {
    linha.append(imagemPreview(texto));
    return linha;
  }
  if (ARQUIVO_RE.test(texto)) {
    linha.append(previewArquivo(texto));
    return linha;
  }
  linha.append(...textoRico(texto));
  return linha;
}

// ---------- formatação: **negrito**, *itálico*, __sublinhado__, ~~riscado~~, `código`, ```bloco```, ||spoiler|| ----------
// grupos: 1 bloco, 2 código, 3 <link sem prévia>, 4 link, 5 spoiler, 6 negrito, 7 sublinhado, 8 riscado, 9-10 itálico
const FORMATO_RE = /```(?:[\w+#-]{1,15}\n)?([\s\S]+?)```|`([^`\n]+)`|<(https?:\/\/[^\s<>]+)>|(https?:\/\/[^\s<]+)|\|\|([\s\S]+?)\|\||\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^*\s](?:[^*\n]*[^*\s])?)\*|(?<![\p{L}\p{N}_])_([^_\s](?:[^_\n]*[^_\s])?)_(?![\p{L}\p{N}_])/gu;
const MARCAS = { 6: 'strong', 7: 'u', 8: 's', 9: 'em', 10: 'em' };
function linkNoTexto(url, { semPrevia, spoiler }) {
  const a = el('a', 'link-msg', url);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (semPrevia || spoiler) a.dataset.semPrevia = '';
  else a.dataset.url = url;
  // imagem dentro de spoiler só aparece se a pessoa abrir o link
  return IMG_RE.test(url) && !spoiler ? [a, imagemPreview(url)] : [a];
}
function textoRico(texto, ctx = {}) {
  const nos = [];
  let i = 0;
  for (const m of texto.matchAll(FORMATO_RE)) {
    nos.push(...comMencoes(texto.slice(i, m.index)));
    i = m.index + m[0].length;
    if (m[1] != null) {
      const pre = el('pre', 'bloco-codigo');
      pre.append(el('code', null, m[1].replace(/^\n|\n$/g, '')));
      nos.push(pre);
      if (texto[i] === '\n') i++; // o bloco já quebra a linha
    } else if (m[2] != null) {
      nos.push(el('code', 'codigo', m[2]));
    } else if (m[3] != null || m[4] != null) {
      nos.push(...linkNoTexto(m[3] ?? m[4], { ...ctx, semPrevia: m[3] != null }));
    } else if (m[5] != null) {
      const s = el('span', 'spoiler');
      s.title = 'Spoiler: clique pra ver';
      s.append(...textoRico(m[5], { ...ctx, spoiler: true }));
      s.onclick = (e) => {
        if (s.classList.contains('revelado')) return;
        e.preventDefault();
        s.classList.add('revelado');
        s.title = '';
      };
      nos.push(s);
    } else {
      const g = Object.keys(MARCAS).find((k) => m[k] != null);
      const marca = el(MARCAS[g]);
      marca.append(...textoRico(m[g], ctx));
      nos.push(marca);
    }
  }
  nos.push(...comMencoes(texto.slice(i)));
  return nos;
}

// ---------- prévia de links (o servidor lê título/imagem da página) ----------
const previas = new Map(); // url -> prévia (null = sem prévia) | Promise
function pedirPrevia(url) {
  if (!previas.has(url)) {
    previas.set(url, new Promise((pronto) => {
      socket.timeout(15000).emit('link:previa', url, (err, p) => {
        if (err) previas.delete(url); // conexão caiu: tenta de novo depois
        else previas.set(url, p ?? null);
        pronto(err ? null : p ?? null);
      });
    }));
  }
  return previas.get(url);
}
function cartaoPrevia(url) {
  const caixa = el('div', 'previa-link');
  const preencher = (p) => {
    if (!p) return false;
    if (p.cor) caixa.style.borderLeftColor = p.cor;
    const textos = el('div', 'previa-textos');
    textos.append(el('div', 'previa-site', p.site));
    const titulo = el('a', 'previa-titulo', p.titulo);
    titulo.href = url;
    titulo.target = '_blank';
    titulo.rel = 'noopener noreferrer';
    textos.append(titulo);
    if (p.descricao) textos.append(el('div', 'previa-descricao', p.descricao));
    caixa.append(textos);
    if (p.imagem) {
      const img = el('img', p.grande ? 'previa-img grande' : 'previa-img');
      img.src = p.imagem;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => img.remove();
      img.onclick = () => window.open(url, '_blank', 'noopener');
      caixa.classList.toggle('com-grande', !!p.grande);
      caixa.append(img);
    }
    if (p.youtube && estado.voz) {
      const b = el('button', 'btn-secundario previa-assistir', estado.assistir ? 'Pôr na fila da chamada' : 'Assistir junto na chamada');
      b.type = 'button';
      b.onclick = () => socket.emit('assistir:adicionar', { videos: [p.youtube], agora: !estado.assistir }, (r) => {
        if (r?.erro) return avisar(r.erro);
        avisar(estado.assistir ? 'Vídeo na fila da chamada.' : 'Vídeo rolando na chamada.', 3000);
      });
      caixa.append(b);
    }
    return true;
  };
  const p = previas.get(url);
  if (p instanceof Promise || p === undefined) {
    caixa.hidden = true;
    pedirPrevia(url).then((r) => {
      if (!caixa.isConnected) return;
      const box = $('#mensagens');
      const noFim = pertoDoFim(box);
      if (preencher(r)) caixa.hidden = false;
      if (noFim) rolarProFim();
    });
  } else if (!preencher(p)) {
    caixa.hidden = true;
  }
  return caixa;
}

const fmtHora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function fmtCabecalho(d) {
  const hoje = new Date();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return `Hoje às ${fmtHora(d)}`;
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${fmtHora(d)}`;
  return `${d.toLocaleDateString('pt-BR')} ${fmtHora(d)}`;
}

const pertoDoFim = (box) => box.scrollHeight - box.scrollTop - box.clientHeight < 80;
const minhaMensagem = (m) => m.conta != null && m.conta === estado.eu?.conta;

// Uma mensagem vira [divisor de data?, linha]; `anterior` decide se agrupa com a de cima
function criarMensagem(m, anterior) {
  const nos = [];
  const data = new Date(m.criado_em);
  const novoDia = !anterior || new Date(anterior.criado_em).toDateString() !== data.toDateString();
  if (novoDia) {
    const div = el('div', 'divisor-data');
    div.append(el('span', null, data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })));
    nos.push(div);
  }
  const agrupar = !novoDia && !m.resposta && anterior.autor === m.autor && m.criado_em - anterior.criado_em < 7 * 60e3;

  const linha = el('div', agrupar ? 'msg' : 'msg inicio');
  linha.dataset.id = m.id;
  linha.classList.toggle('fixada', !!m.fixada);
  linha.classList.toggle('mencionado', !minhaMensagem(m) && (mencionaEu(m.texto) || m.resposta?.conta === estado.eu?.conta));
  const corpo = editando?.id === m.id ? editorMensagem(m) : corpoMensagem(m);
  if (agrupar) {
    linha.append(el('span', 'hora-lateral', fmtHora(data)), corpo);
  } else {
    if (m.resposta) {
      linha.classList.add('com-resposta');
      linha.append(previaResposta(m.resposta));
    }
    const cab = el('div', 'cabecalho');
    const autor = el('span', 'autor', m.autor);
    autor.style.color = corDoNome(perfilDe(m.autor), m.cor);
    autor.onclick = (e) => abrirPerfil(m.autor, e);
    cab.append(autor, el('span', 'hora', fmtCabecalho(data)));
    const av = avatar({ nome: m.autor, cor: m.cor });
    av.onclick = (e) => abrirPerfil(m.autor, e);
    linha.append(av, cab, corpo);
  }
  const reacoes = linhaReacoes(m);
  if (reacoes) linha.append(reacoes);
  linha.append(acoesMensagem(m));
  nos.push(linha);
  return nos;
}

// "↱ @Fulano: texto" em cima da resposta; clicar vai pra original
function previaResposta(r) {
  const p = el('div', 'resposta-previa');
  if (r.apagada) {
    p.append(el('span', 'resposta-apagada', 'A mensagem original foi apagada'));
    return p;
  }
  const perfil = perfilDe(r.autor);
  const autor = el('span', 'autor', r.autor);
  autor.style.color = corDoNome(perfil, '');
  p.append(avatar({ nome: r.autor, cor: perfil?.cor ?? 'var(--acento)' }), autor, el('span', 'resposta-texto', resumoMensagem(r.texto)));
  p.onclick = () => revelar(r.id);
  return p;
}

const EMOJIS = ['👍', '👎', '😂', '🤣', '😭', '😍', '🥰', '😎', '🤔', '😮', '😡', '🥲', '😅', '🙏', '👏', '🔥',
  '💯', '❤️', '💀', '🎉', '👀', '✅', '❌', '🤡', '🫡', '🤝', '💪', '🎮', '🍕', '🍺', '😴', '🤯'];
const reagir = (m, emoji) => socket.emit('msg:reagir', { id: m.id, emoji }, (res) => res?.erro && avisar(res.erro));

// `m` = mensagem pra reagir, ou uma função que recebe o emoji escolhido (ex.: escrever no chat)
function abrirSeletorEmoji(m, evento) {
  evento.stopPropagation();
  const alvo = evento.currentTarget.getBoundingClientRect();
  const pop = $('#seletor-emoji');
  fecharPopovers();
  const escolher = typeof m === 'function' ? m : (emoji) => reagir(m, emoji);
  const botao = (conteudo, valor, titulo) => {
    const b = el('button', null);
    b.type = 'button';
    b.append(conteudo);
    if (titulo) b.title = titulo;
    b.onclick = () => {
      escolher(valor);
      pop.hidden = true;
    };
    return b;
  };
  const doServidor = emDm() ? [] : estado.servidor?.emojis ?? [];
  pop.replaceChildren(
    ...doServidor.map((e) => botao(imgEmoji(e), `:${e.nome}:`, `:${e.nome}:`)),
    ...(doServidor.length ? [el('div', 'sep-emoji')] : []),
    ...EMOJIS.map((emoji) => botao(emoji, emoji)),
  );
  pop.hidden = false;
  const { width, height } = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(alvo.right - width, innerWidth - width - 8))}px`;
  pop.style.top = `${alvo.top - height - 6 < 8 ? alvo.bottom + 6 : alvo.top - height - 6}px`;
}

function linhaReacoes(m) {
  if (!m.reacoes?.length) return null;
  const linha = el('div', 'reacoes');
  for (const r of m.reacoes) {
    const b = el('button', 'reacao');
    b.type = 'button';
    b.classList.toggle('minha', r.contas.includes(estado.eu?.conta));
    const custom = emojiDoServidor(r.emoji);
    const rosto = el('span', 'reacao-emoji');
    rosto.append(custom ? imgEmoji(custom) : r.emoji);
    b.append(rosto, el('span', 'reacao-n', String(r.contas.length)));
    b.title = `${r.contas.map((c) => perfilPorConta(c)?.nome ?? 'alguém').join(', ')} reagiu com ${r.emoji}`;
    b.onclick = () => reagir(m, r.emoji);
    linha.append(b);
  }
  const mais = el('button', 'reacao reacao-add');
  mais.type = 'button';
  mais.title = 'Adicionar reação';
  mais.append(icone('emoji'));
  mais.onclick = (e) => abrirSeletorEmoji(m, e);
  linha.append(mais);
  return linha;
}

function corpoMensagem(m) {
  if (m.enquete) return cartaoEnquete(m);
  const corpo = formatarTexto(m.texto);
  if (m.editado_em) {
    const tag = el('span', 'editada', ' (editada)');
    tag.title = new Date(m.editado_em).toLocaleString('pt-BR');
    corpo.append(tag);
  }
  // até 2 cartões por mensagem (link de imagem já aparece como imagem)
  const links = [...new Set([...corpo.querySelectorAll('a[data-url]')].map((a) => a.dataset.url))].filter((u) => !IMG_RE.test(u));
  corpo.append(...links.slice(0, 2).map(cartaoPrevia));
  return corpo;
}

function acoesMensagem(m) {
  const minha = minhaMensagem(m);
  const botoes = [];
  const botao = (nome, titulo, acao) => {
    const b = el('button', null);
    b.title = titulo;
    b.append(icone(nome));
    b.onclick = acao;
    botoes.push(b);
  };
  botao('emoji', 'Reagir', (e) => abrirSeletorEmoji(m, e));
  botao('responder', 'Responder', () => responder(m));
  if (minha && !ehUpload(m.texto) && !m.enquete) botao('lapis', 'Editar', () => iniciarEdicao(m));
  if (souAdmin() || emDm()) botao('pino', m.fixada ? 'Desafixar' : 'Fixar', () => fixarMensagem(m, !m.fixada));
  if (minha || souAdmin()) botao('lixo', 'Apagar (Shift+clique apaga sem perguntar)', (e) => apagarMensagem(m, e));
  const caixa = el('div', 'acoes-msg');
  caixa.append(...botoes);
  return caixa;
}

// distanciaDoFim: mantém a tela parada quando entram mensagens antigas em cima
function renderMensagens({ distanciaDoFim } = {}) {
  const box = $('#mensagens');
  const noFim = pertoDoFim(box);
  const topo = box.scrollTop;
  const canal = canalPorId(estado.canalTexto)?.nome;
  if (canal == null) {
    if (emDm()) {
      const vazio = el('div', 'boas-vindas');
      vazio.append(el('h2', null, 'Nenhuma conversa ainda'), el('p', null, 'Clique no nome de alguém do servidor e em "Mandar mensagem".'));
      return box.replaceChildren(vazio);
    }
    return box.replaceChildren();
  }
  let inicio;
  if (temMais) {
    inicio = el('div', 'carregando-mais', 'Carregando mensagens antigas…');
  } else {
    inicio = el('div', 'boas-vindas');
    const bola = el('div', 'bola');
    bola.append(icone(emDm() ? 'arroba' : 'hash'));
    if (emDm()) inicio.append(bola, el('h2', null, canal), el('p', null, `Este é o começo da sua conversa com ${canal}.`));
    else inicio.append(bola, el('h2', null, `Bem-vindo(a) a #${canal}!`), el('p', null, `Este é o começo do canal #${canal}.`));
  }
  box.replaceChildren(inicio, ...mensagens.flatMap((m, i) => criarMensagem(m, mensagens[i - 1])));
  if (distanciaDoFim != null) box.scrollTop = box.scrollHeight - distanciaDoFim;
  else if (noFim) rolarProFim();
  else box.scrollTop = topo;
  box.querySelector('.editar-msg')?.focus();
}

function adicionarMensagem(m) {
  const box = $('#mensagens');
  const noFim = pertoDoFim(box);
  box.append(...criarMensagem(m, mensagens[mensagens.length - 1]));
  mensagens.push(m);
  if (noFim || minhaMensagem(m)) rolarProFim();
}

// ---------- editar / apagar / fixar ----------
function iniciarEdicao(m) {
  editando = { id: m.id, texto: m.texto };
  renderMensagens();
}

function editorMensagem(m) {
  const caixa = el('div', 'editor-msg');
  const campo = el('textarea', 'editar-msg');
  campo.value = editando.texto;
  campo.maxLength = 2000;
  campo.rows = Math.min(8, campo.value.split('\n').length);
  campo.oninput = () => (editando.texto = campo.value);
  campo.onkeydown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      editando = null;
      renderMensagens();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      salvarEdicao(m.id, campo.value);
    }
  };
  const dica = el('div', 'dica-editar');
  dica.append('Esc pra ', el('b', null, 'cancelar'), ' • Enter pra ', el('b', null, 'salvar'));
  caixa.append(campo, dica);
  return caixa;
}

function salvarEdicao(id, texto) {
  texto = texto.trim();
  const original = mensagens.find((m) => m.id === id);
  if (!texto || texto === original?.texto) {
    editando = null;
    return renderMensagens();
  }
  socket.emit('msg:editar', { id, texto }, (res) => {
    if (res?.erro) return avisar(res.erro);
    editando = null;
    renderMensagens();
  });
}

function apagarMensagem(m, e) {
  if (!e.shiftKey && !confirm('Apagar esta mensagem? Não dá pra desfazer.')) return;
  socket.emit('msg:apagar', m.id, (res) => res?.erro && avisar(res.erro));
}

function fixarMensagem(m, fixar) {
  socket.emit('msg:fixar', { id: m.id, fixar }, (res) => {
    if (res?.erro) return avisar(res.erro);
    avisar(fixar ? '📌 Mensagem fixada' : 'Mensagem desafixada', 2000);
  });
}

socket.on('msg:atualizada', (m) => {
  const i = mensagens.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    mensagens[i] = m;
    renderMensagens();
  }
  if (!$('#painel-fixadas').hidden && m.canal === estado.canalTexto) carregarFixadas();
});

socket.on('msg:apagada', ({ id, canal }) => {
  if (canal !== estado.canalTexto) return;
  mensagens = mensagens.filter((m) => m.id !== id);
  if (editando?.id === id) editando = null;
  renderMensagens();
  if (!$('#painel-fixadas').hidden) carregarFixadas();
});

// ---------- mensagens fixadas ----------
function mensagemCompacta(m) {
  const item = el('div', 'fixada-item');
  const cab = el('div', 'cabecalho');
  const autor = el('span', 'autor', m.autor);
  autor.style.color = corDoNome(perfilDe(m.autor), m.cor);
  cab.append(avatar({ nome: m.autor, cor: m.cor }), autor, el('span', 'hora', fmtCabecalho(new Date(m.criado_em))));
  item.append(cab, formatarTexto(m.texto));
  return item;
}

function carregarFixadas() {
  const canal = estado.canalTexto;
  socket.emit('fixadas', canal, (lista) => {
    if (canal !== estado.canalTexto || !Array.isArray(lista)) return;
    const box = $('#lista-fixadas');
    if (!lista.length) {
      box.replaceChildren(el('p', 'vazio', 'Nenhuma mensagem fixada neste canal ainda.'));
      return;
    }
    box.replaceChildren(...lista.map((m) => {
      const item = mensagemCompacta(m);
      if (souAdmin() || emDm()) {
        const b = el('button', 'btn-link', 'Desafixar');
        b.onclick = () => fixarMensagem(m, false);
        item.append(b);
      }
      return item;
    }));
  });
}

$('#btn-fixadas').onclick = (e) => {
  e.stopPropagation();
  const painel = $('#painel-fixadas');
  painel.hidden = !painel.hidden;
  if (!painel.hidden) {
    $('#lista-fixadas').replaceChildren(el('p', 'vazio', 'Carregando…'));
    carregarFixadas();
  }
};

// ---------- busca ----------
function buscar(termo) {
  fecharPopovers();
  $('#painel-busca').hidden = false;
  $('#titulo-busca').textContent = 'Buscando…';
  $('#lista-busca').replaceChildren();
  socket.emit('buscar', { termo }, (res) => {
    if (res?.erro) {
      $('#titulo-busca').textContent = 'Busca';
      return $('#lista-busca').replaceChildren(el('p', 'vazio', res.erro));
    }
    const n = res.resultados.length;
    $('#titulo-busca').textContent = n ? `${n >= 25 ? 'Os 25 mais recentes' : n === 1 ? '1 resultado' : `${n} resultados`} pra "${termo}"` : `Nada encontrado pra "${termo}"`;
    $('#lista-busca').replaceChildren(...res.resultados.map((m) => {
      const item = mensagemCompacta(m);
      const canal = canalPorId(m.canal)?.nome ?? '';
      item.prepend(el('div', 'busca-onde', m.servidor === null ? `@${canal}` : `#${canal}`));
      item.classList.add('clicavel');
      item.title = 'Ir pra mensagem';
      item.onclick = () => {
        fecharPopovers();
        irParaMensagem(m.servidor, m.canal, m.id);
      };
      return item;
    }));
  });
}
$('#input-busca').onkeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const termo = e.target.value.trim();
    if (termo) buscar(termo);
  } else if (e.key === 'Escape') {
    e.target.value = '';
    e.target.blur();
  }
};

// ---------- mensagem nova, notificação ----------
function notificar(m, mencao) {
  if (m.conta === estado.eu.conta || estado.eu.status === 'ocupado') return;
  const vendo = document.hasFocus() && m.canal === estado.canalTexto && estado.view === 'texto';
  // com o app em foco, só avisa quando me marcam ou é mensagem direta
  if (vendo || (document.hasFocus() && !mencao) || window.Notification?.permission !== 'granted') return;
  const onde = m.servidor === null
    ? 'mensagem direta'
    : m.servidor === estado.servidor.id ? `#${canalPorId(m.canal)?.nome}` : estado.servidores.find((x) => x.id === m.servidor)?.nome;
  const n = new Notification(`${m.autor} (${onde})`, { body: resumoMensagem(m.texto) });
  n.onclick = () => {
    appDesktop?.mostrar?.(); // pode estar escondido na bandeja
    window.focus();
    irParaMensagem(m.servidor, m.canal, m.id);
  };
}

socket.on('mensagem', (m) => {
  if (digitando.has(m.autor)) {
    clearTimeout(digitando.get(m.autor));
    digitando.delete(m.autor);
    renderDigitando();
  }
  const minha = m.conta === estado.eu.conta;
  const dm = m.servidor === null;
  const mencao = !minha && (dm || mencionaEu(m.texto) || m.resposta?.conta === estado.eu.conta);
  const aberto = dm ? emDm() : m.servidor === estado.servidor.id;
  if (dm && emDm()) {
    const d = estado.dms.find((x) => x.id === m.canal);
    if (d) {
      d.ultima = m.criado_em;
      estado.dms.sort((a, b) => (b.ultima ?? 0) - (a.ultima ?? 0));
      renderCanais();
    } else {
      atualizarDms(); // conversa nova
    }
  }
  const vendo = aberto && m.canal === estado.canalTexto;
  if (vendo) adicionarMensagem(m);
  if (!minha && !(vendo && estado.view === 'texto')) {
    if (dm) {
      estado.dmNaoLidos.set(m.canal, (estado.dmNaoLidos.get(m.canal) ?? 0) + 1);
    } else if (aberto) {
      estado.naoLidos.add(m.canal);
      if (mencao) estado.canalMencoes.add(m.canal);
    } else {
      // mensagem em outro servidor meu: marca a bolinha na barra da esquerda
      estado.srvNaoLidos.add(m.servidor);
      if (mencao) estado.srvMencoes.set(m.servidor, (estado.srvMencoes.get(m.servidor) ?? 0) + 1);
    }
    renderCanais();
    renderRail();
  }
  notificar(m, mencao);
});

// ---------- responder ----------
function responder(m) {
  respondendo = m;
  renderResposta();
  $('#input-msg').focus();
}
function renderResposta() {
  $('#barra-resposta').hidden = !respondendo;
  if (respondendo) $('#resposta-texto').replaceChildren('Respondendo a ', el('b', null, respondendo.autor));
}
$('#btn-cancelar-resposta').onclick = () => {
  respondendo = null;
  renderResposta();
};

$('#form-msg').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#input-msg');
  const texto = input.value.trim();
  if (!texto) return;
  socket.emit('mensagem', { canal: estado.canalTexto, texto, resposta: respondendo?.id ?? null });
  input.value = '';
  respondendo = null;
  renderResposta();
});

// ---------- arquivos (imagem, vídeo, zip…) ----------
async function enviarArquivo(arquivo) {
  if (!arquivo) return;
  if (arquivo.size > MAX_ARQUIVO) return avisar(`${arquivo.name || 'Esse arquivo'} é grande demais (máx. 25 MB).`);
  const canal = estado.canalTexto;
  const resposta = respondendo?.id ?? null;
  respondendo = null;
  renderResposta();
  avisar(`Enviando ${arquivo.name || 'arquivo'}…`, 120000);
  const dados = await arquivo.arrayBuffer();
  socket.timeout(120000).emit('arquivo', { canal, nome: arquivo.name, dados, resposta }, (err, res) => {
    if (err) return avisar('Não deu pra enviar o arquivo (conexão lenta?).');
    if (res?.erro) return avisar(res.erro);
    $('#toast').hidden = true;
  });
}

$('#input-msg').addEventListener('paste', (e) => {
  const arquivos = [...e.clipboardData.files];
  if (!arquivos.length) return;
  e.preventDefault();
  arquivos.forEach(enviarArquivo);
});
$('#btn-anexar').onclick = () => $('#input-arquivo').click();
$('#input-arquivo').onchange = (e) => {
  [...e.target.files].forEach(enviarArquivo);
  e.target.value = '';
};
$('#view-texto').addEventListener('dragover', (e) => e.preventDefault());
$('#view-texto').addEventListener('drop', (e) => {
  e.preventDefault();
  [...e.dataTransfer.files].forEach(enviarArquivo);
});

// ---------- sugestões de @menção ----------
let sugestoes = [];
let sugestaoAtiva = 0;
function atualizarSugestoes() {
  const input = $('#input-msg');
  const caixa = $('#sugestoes-mencao');
  const m = input.value.slice(0, input.selectionStart).match(/(?:^|\s)@([^\s@]*)$/u);
  sugestoes = [];
  if (m) {
    const busca = m[1].toLowerCase();
    const pessoas = estado.perfis.filter((p) => p.id !== estado.eu?.conta).map((p) => ({ nome: p.nome, perfil: p }));
    if (!emDm()) pessoas.push({ nome: 'todos', dica: 'avisa todo mundo do servidor' });
    sugestoes = pessoas.filter((x) => x.nome.toLowerCase().includes(busca))
      .sort((a, b) => b.nome.toLowerCase().startsWith(busca) - a.nome.toLowerCase().startsWith(busca))
      .slice(0, 8);
  }
  caixa.hidden = !sugestoes.length;
  if (!sugestoes.length) return;
  sugestaoAtiva = Math.min(sugestaoAtiva, sugestoes.length - 1);
  caixa.replaceChildren(el('div', 'sugestoes-titulo', 'Membros'), ...sugestoes.map((x, i) => {
    const item = el('div', 'sugestao');
    item.classList.toggle('ativa', i === sugestaoAtiva);
    item.append(x.perfil ? avatar(x.perfil) : el('span', 'avatar avatar-arroba', '@'), el('span', null, x.nome));
    if (x.dica) item.append(el('small', null, x.dica));
    item.onmousedown = (e) => {
      e.preventDefault(); // não tira o foco do campo
      escolherSugestao(i);
    };
    return item;
  }));
}
function escolherSugestao(i) {
  const x = sugestoes[i];
  if (!x) return;
  const input = $('#input-msg');
  const pos = input.selectionStart;
  const antes = input.value.slice(0, pos).replace(/@([^\s@]*)$/u, `@${x.nome} `);
  input.value = antes + input.value.slice(pos);
  input.setSelectionRange(antes.length, antes.length);
  sugestoes = [];
  $('#sugestoes-mencao').hidden = true;
}
$('#input-msg').addEventListener('input', () => {
  sugestaoAtiva = 0;
  atualizarSugestoes();
});
$('#input-msg').addEventListener('blur', () => setTimeout(() => ($('#sugestoes-mencao').hidden = true), 100));
$('#input-msg').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && respondendo && $('#sugestoes-mencao').hidden) {
    e.stopPropagation();
    respondendo = null;
    return renderResposta();
  }
  if (!sugestoes.length || $('#sugestoes-mencao').hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    sugestaoAtiva = (sugestaoAtiva + (e.key === 'ArrowDown' ? 1 : -1) + sugestoes.length) % sugestoes.length;
    atualizarSugestoes();
  } else if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault();
    escolherSugestao(sugestaoAtiva);
  } else if (e.key === 'Escape') {
    e.stopPropagation();
    sugestoes = [];
    $('#sugestoes-mencao').hidden = true;
  }
});

let ultimoAvisoDigitando = 0;
$('#input-msg').addEventListener('input', () => {
  if (Date.now() - ultimoAvisoDigitando < 2000) return;
  ultimoAvisoDigitando = Date.now();
  socket.emit('digitando', estado.canalTexto);
});

socket.on('digitando', ({ canal, nome }) => {
  if (canal !== estado.canalTexto) return;
  clearTimeout(digitando.get(nome));
  digitando.set(nome, setTimeout(() => { digitando.delete(nome); renderDigitando(); }, 3000));
  renderDigitando();
});

function renderDigitando() {
  const nomes = [...digitando.keys()];
  const box = $('#digitando');
  box.replaceChildren();
  if (!nomes.length) return;
  nomes.forEach((n, i) => {
    if (i) box.append(i === nomes.length - 1 ? ' e ' : ', ');
    box.append(el('b', null, n));
  });
  box.append(nomes.length > 1 ? ' estão digitando...' : ' está digitando...');
}

// ---------- detector de fala ----------
const analisadores = new Map(); // userId -> { stream, src, analyser, buf, ultimoSom }
const falando = new Set();

function monitorarFala(id, stream) {
  if (!audioCtx || !stream?.getAudioTracks().length) return;
  if (analisadores.get(id)?.stream === stream) return;
  pararMonitor(id);
  const src = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 512;
  src.connect(analyser);
  analisadores.set(id, { stream, src, analyser, buf: new Uint8Array(analyser.fftSize), ultimoSom: 0 });
}

function pararMonitor(id) {
  const a = analisadores.get(id);
  if (!a) return;
  a.src.disconnect();
  analisadores.delete(id);
  marcarFalando(id, false);
}

function marcarFalando(id, ativo) {
  if (ativo === falando.has(id)) return;
  ativo ? falando.add(id) : falando.delete(id);
  $$(`[data-fala="${CSS.escape(id)}"]`).forEach((e) => e.classList.toggle('falando', ativo));
}

setInterval(() => {
  const agora = Date.now();
  for (const [id, a] of analisadores) {
    a.analyser.getByteTimeDomainData(a.buf);
    let soma = 0;
    for (const v of a.buf) { const x = (v - 128) / 128; soma += x * x; }
    const silenciado = id === estado.eu?.id && (estado.mudo || estado.surdo);
    if (Math.sqrt(soma / a.buf.length) > 0.03 && !silenciado) a.ultimoSom = agora;
    marcarFalando(id, agora - a.ultimoSom < 300);
  }
}, 100);

// ---------- voz / vídeo (WebRTC) ----------
const preferido = (id) => (id ? { deviceId: { ideal: id } } : {});

// supressão de ruído: 'padrao' (a do navegador), 'forte' (RNNoise: tira teclado, ventilador) ou 'desligado'
async function pegarMic() {
  const ruido = dispositivos.ruido ?? 'padrao';
  const bruto = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: ruido === 'padrao', autoGainControl: true, ...preferido(dispositivos.mic) },
  });
  if (ruido !== 'forte') return bruto;
  try {
    return await suprimirRuido(bruto);
  } catch (e) {
    console.error('Supressão de ruído', e);
    avisar('A supressão de ruído forte não funcionou aqui: usando a normal.');
    return bruto;
  }
}

let ruidoCtx = null;
let ruidoLib = null;
let ruidoWasm = null;
async function suprimirRuido(bruto) {
  ruidoLib ??= await import('/vendor/ruido/index.js');
  if (!ruidoCtx) {
    const ctx = new AudioContext({ sampleRate: 48000 }); // o RNNoise trabalha em 48 kHz
    await ctx.audioWorklet.addModule('/vendor/ruido/rnnoise/workletProcessor.js');
    ruidoWasm = await ruidoLib.loadRnnoise({ url: '/vendor/ruido/rnnoise.wasm', simdUrl: '/vendor/ruido/rnnoise_simd.wasm' });
    ruidoCtx = ctx;
  }
  await ruidoCtx.resume();
  const src = ruidoCtx.createMediaStreamSource(bruto);
  const filtro = new ruidoLib.RnnoiseWorkletNode(ruidoCtx, { maxChannels: 1, wasmBinary: ruidoWasm });
  const saida = ruidoCtx.createMediaStreamDestination();
  src.connect(filtro).connect(saida);
  const [track] = saida.stream.getAudioTracks();
  // parar a trilha limpa desliga o microfone de verdade
  const parar = track.stop.bind(track);
  track.stop = () => {
    parar();
    bruto.getTracks().forEach((t) => t.stop());
    src.disconnect();
    filtro.disconnect();
    filtro.destroy();
  };
  return new MediaStream([track]);
}

async function entrarVoz(canal) {
  fecharMenu();
  if (estado.voz === canal) {
    estado.view = 'voz';
    render();
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices) {
    avisar('Chamada só funciona via https:// ou http://localhost (ou pelo app desktop). Veja o README.');
    return;
  }
  if (estado.voz) sairVoz();

  audioCtx ??= new AudioContext();
  audioCtx.resume();

  try {
    estado.mic = await pegarMic();
  } catch (e) {
    estado.mic = null;
    avisar(`Você entrou só ouvindo. ${explicarErroMic(e)}`, 15000);
  }
  aplicarMudo();
  if (estado.mic) monitorarFala(estado.eu.id, estado.mic);

  estado.voz = canal;
  estado.vozInfo = { canal: canalPorId(canal)?.nome ?? '', servidor: estado.servidor.nome, servidorId: estado.servidor.id };
  estado.view = 'voz';
  socket.emit('voz:entrar', canal, (ids) => {
    if (!Array.isArray(ids)) {
      sairVoz(false);
      return avisar('Não deu pra entrar nessa sala.');
    }
    for (const id of ids) if (!peers.has(id)) criarPeer(id);
    socket.emit('assistir:estado', null, aplicarAssistir); // já tem vídeo passando nessa sala?
    socket.emit('mapa:boneco', meuBonecoAgora());
    socket.emit('mapa:estado', null, aplicarMapa); // e o mapa, está ligado?
  });
  enviarEstado();
  atalhosGlobais(true);
  iniciarClipes();
  som('entrar');
  render();
}

function sairVoz(avisarServidor = true) {
  for (const id of [...peers.keys()]) fecharPeer(id);
  for (const tipo of ['mic', 'cam', 'tela']) {
    estado[tipo]?.getTracks().forEach((t) => t.stop());
    estado[tipo] = null;
  }
  if (estado.eu) pararMonitor(estado.eu.id);
  if (estado.voz) som('sair');
  clearTimeout(pttSoltar);
  pttApertado = false;
  clearTimeout(quedaTimer);
  sumidos.forEach(clearTimeout);
  sumidos.clear();
  estado.voz = null;
  estado.vozInfo = null;
  estado.assistir = null;
  fecharPlayer();
  aplicarMapa(null);
  Object.assign(minhaRede, { ping: null, perda: null, ruinsSeguidas: 0, enviado: null });
  minhaRede.porPeer.clear();
  miniaturas(false);
  membrosVoz = new Set();
  if (estado.view === 'voz') estado.view = 'texto';
  if (avisarServidor) socket.emit('voz:sair');
  atalhosGlobais(false);
  pararClipes();
  render();
}

function enviarEstado() {
  socket.emit('estado', {
    mudo: estado.mudo,
    surdo: estado.surdo,
    mic: estado.mic?.id ?? null,
    camera: estado.cam?.id ?? null,
    tela: estado.tela?.id ?? null,
  });
}

function aplicarMudo() {
  const aberto = !estado.mudo && !estado.surdo && (atalhos.modo !== 'ptt' || pttApertado);
  estado.mic?.getAudioTracks().forEach((t) => (t.enabled = aberto));
}

// Bitrate máximo por pessoa assistindo, de acordo com a qualidade escolhida
const QUALIDADES = {
  720: { largura: 1280, altura: 720, bitrate: { 30: 2_500_000, 60: 4_000_000 } },
  1080: { largura: 1920, altura: 1080, bitrate: { 30: 4_500_000, 60: 7_000_000 } },
  original: { bitrate: { 30: 8_000_000, 60: 12_000_000 } },
};
const qualidadeTela = () => QUALIDADES[transmissao.resolucao] ?? QUALIDADES[1080];
const fpsTela = () => (Number(transmissao.fps) === 60 ? 60 : 30);

function restricoesTela() {
  const q = qualidadeTela();
  const fps = fpsTela();
  return {
    frameRate: { ideal: fps, max: fps },
    ...(q.altura && { width: { max: q.largura }, height: { max: q.altura } }),
  };
}

function limitesBitrate(tipo) {
  if (tipo === 'cam') return { max: 1_200_000, min: 300_000, total: 2_000_000 };
  const max = qualidadeTela().bitrate[fpsTela()];
  return { max, min: max * 0.3, total: max * 2 };
}

// Na mesh cada pessoa recebe uma cópia do seu vídeo: divide o upload entre elas
function ajustarBitrates() {
  const n = Math.max(1, peers.size);
  for (const p of peers.values()) {
    for (const tipo of ['cam', 'tela']) {
      const { max, min, total } = limitesBitrate(tipo);
      const pedido = p.pedido?.[tipo] ?? 'normal';
      let alvo = Math.round(Math.max(min, Math.min(max, total / n)));
      if (pedido === 'baixa') alvo = Math.min(alvo, tipo === 'tela' ? 800_000 : 250_000);
      for (const sender of p.senders[tipo]) {
        if (sender.track?.kind !== 'video') continue;
        const params = sender.getParameters();
        if (!params.encodings?.length) continue; // ainda negociando: tenta de novo ao conectar
        const enc = params.encodings[0];
        enc.maxBitrate = alvo;
        enc.active = pedido !== 'pausa'; // a pessoa ocultou meu vídeo: nem gasta upload com ela
        enc.scaleResolutionDownBy = pedido === 'baixa' ? 2 : 1;
        sender.setParameters(params).catch(() => {});
      }
    }
  }
}

function enviarTrilhas(p, tipo, stream) {
  p.senders[tipo] = stream.getTracks().map((t) => p.pc.addTrack(t, stream));
}

function criarPeer(id) {
  const pc = new RTCPeerConnection({ iceServers: estado.iceServers });
  const peer = {
    pc,
    polite: estado.eu.id < id,
    makingOffer: false,
    ignoreOffer: false,
    streams: new Map(), // stream.id -> MediaStream recebida
    senders: { mic: [], cam: [], tela: [] },
    fila: Promise.resolve(),
  };
  peers.set(id, peer);

  // "Perfect negotiation": qualquer lado pode renegociar (ligar câmera/tela) sem conflito
  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      await pc.setLocalDescription();
      socket.emit('sinal', { para: id, dados: { description: pc.localDescription } });
    } catch (e) {
      console.error('Erro ao negociar', e);
    } finally {
      peer.makingOffer = false;
    }
  };
  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('sinal', { para: id, dados: { candidate } });
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      ajustarBitrates();
      enviarPedido(id);
    }
    // sumiu do servidor e agora a conexão direta também caiu: fechou o app, não está só reconectando
    if (sumidos.has(id) && ['disconnected', 'failed', 'closed'].includes(pc.connectionState)) tirarSumido(id);
  };
  let reiniciou = false;
  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState !== 'failed') return;
    if (!reiniciou) {
      reiniciou = true;
      pc.restartIce();
      return;
    }
    const nome = estado.usuarios.find((u) => u.id === id)?.nome ?? 'alguém';
    avisar(`Não deu pra conectar a chamada com ${nome}. A rede de um de vocês está bloqueando (comum em 4G). Quem hospeda pode configurar um TURN nas opções avançadas.`);
  };
  pc.ontrack = ({ track, streams }) => {
    const stream = streams[0];
    if (!stream) return;
    peer.streams.set(stream.id, stream);
    stream.onremovetrack = () => renderGrid();
    track.onunmute = () => renderGrid();
    renderGrid();
  };

  if (estado.mic) {
    peer.senders.mic = estado.mic.getTracks().map((t) => pc.addTrack(t, estado.mic));
  } else {
    // Sem microfone: ainda precisa negociar pra ouvir os outros
    pc.addTransceiver('audio', { direction: 'recvonly' });
  }
  for (const tipo of ['cam', 'tela']) {
    if (estado[tipo]) enviarTrilhas(peer, tipo, estado[tipo]);
  }
  ajustarBitrates();
  return peer;
}

function fecharPeer(id) {
  const peer = peers.get(id);
  if (!peer) return;
  peer.pc.close();
  peers.delete(id);
  ajustarBitrates();
  renderGrid();
}

// O que eu quero receber de cada pessoa: { cam, tela } = 'normal' | 'baixa' | 'pausa'
function pedidoPara(nome) {
  const a = ajustes[nome] ?? {};
  const nivel = (oculto) => (oculto ? 'pausa' : a.baixa ? 'baixa' : 'normal');
  return { cam: nivel(a.ocultarCam), tela: nivel(a.ocultarTela) };
}
function enviarPedido(id) {
  const u = estado.usuarios.find((x) => x.id === id);
  if (u && peers.has(id)) socket.emit('sinal', { para: id, dados: { pedido: pedidoPara(u.nome) } });
}

async function processarSinal(peer, { description, candidate, pedido }, de) {
  const { pc } = peer;
  if (pc.signalingState === 'closed') return;
  if (pedido) {
    const valido = (v) => (['baixa', 'pausa'].includes(v) ? v : 'normal');
    peer.pedido = { cam: valido(pedido.cam), tela: valido(pedido.tela) };
    ajustarBitrates();
    return;
  }
  if (description) {
    const colisao = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
    peer.ignoreOffer = !peer.polite && colisao;
    if (peer.ignoreOffer) return;
    await pc.setRemoteDescription(description);
    if (description.type === 'offer') {
      await pc.setLocalDescription();
      socket.emit('sinal', { para: de, dados: { description: pc.localDescription } });
    }
  } else if (candidate) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (e) {
      if (!peer.ignoreOffer) throw e;
    }
  }
}

socket.on('sinal', ({ de, dados }) => {
  if (!estado.voz || !dados) return;
  const peer = peers.get(de) ?? criarPeer(de);
  // processa em ordem, um sinal por vez por pessoa
  peer.fila = peer.fila
    .then(() => processarSinal(peer, dados, de))
    .catch((e) => console.error('Erro de sinalização', e));
});

async function ligarCamera() {
  try {
    estado.cam = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, ...preferido(dispositivos.cam) },
    });
  } catch (e) {
    avisar(`Não consegui abrir a câmera: ${e.message}`);
    return;
  }
  estado.cam.getVideoTracks().forEach((t) => (t.contentHint = 'motion'));
  for (const p of peers.values()) enviarTrilhas(p, 'cam', estado.cam);
  ajustarBitrates();
}

async function alternarCamera() {
  if (!estado.voz) return avisar('Entre num canal de voz primeiro.');
  if (estado.cam) pararStream('cam');
  else await ligarCamera();
  enviarEstado();
  render();
}

async function alternarTela() {
  if (!estado.voz) return avisar('Entre num canal de voz primeiro.');
  if (estado.tela) {
    pararStream('tela');
  } else {
    if (!navigator.mediaDevices.getDisplayMedia) {
      avisar('Esse navegador não deixa compartilhar a tela (no celular geralmente não rola).');
      return;
    }
    try {
      estado.tela = await navigator.mediaDevices.getDisplayMedia({
        video: restricoesTela(),
        // não grava o som da própria página (a voz da chamada) junto com o da tela
        audio: { restrictOwnAudio: true },
      });
    } catch {
      return; // cancelou a escolha
    }
    // garante a qualidade escolhida mesmo se o seletor ignorar as restrições
    estado.tela.getVideoTracks()[0].applyConstraints(restricoesTela()).catch(() => {});
    // clicou em "Parar de compartilhar" fora do app
    estado.tela.getVideoTracks()[0].onended = () => {
      if (!estado.tela) return;
      pararStream('tela');
      enviarEstado();
      render();
    };
    // prioriza fluidez (jogo) em vez de nitidez de texto parado
    estado.tela.getVideoTracks().forEach((t) => (t.contentHint = 'motion'));
    for (const p of peers.values()) enviarTrilhas(p, 'tela', estado.tela);
    ajustarBitrates();
  }
  miniaturas(!!estado.tela);
  enviarEstado();
  render();
}

function pararStream(tipo) {
  const s = estado[tipo];
  if (!s) return;
  s.getTracks().forEach((t) => t.stop());
  for (const p of peers.values()) {
    for (const sender of p.senders[tipo]) {
      try { p.pc.removeTrack(sender); } catch {}
    }
    p.senders[tipo] = [];
  }
  estado[tipo] = null;
  if (tipo === 'tela') miniaturas(false);
}

function alternarMudo() {
  if (estado.surdo) estado.surdo = estado.mudo = false;
  else estado.mudo = !estado.mudo;
  som(estado.mudo ? 'mudo' : 'desmudo');
  aplicarMudo();
  enviarEstado();
  render();
}

function alternarSurdo() {
  estado.surdo = !estado.surdo;
  som(estado.surdo ? 'mudo' : 'desmudo');
  aplicarMudo();
  enviarEstado();
  render();
}

$$('.btn-mudo').forEach((b) => (b.onclick = alternarMudo));
$$('.btn-surdo').forEach((b) => (b.onclick = alternarSurdo));
$$('.btn-camera').forEach((b) => (b.onclick = alternarCamera));
$$('.btn-tela').forEach((b) => (b.onclick = alternarTela));
$$('.btn-sair-voz').forEach((b) => (b.onclick = () => sairVoz()));
$('#btn-tira').onclick = () => {
  tiraVisivel = !tiraVisivel;
  renderGrid();
};

document.addEventListener('keydown', (e) => {
  if (!estado.eu || !e.ctrlKey || !e.shiftKey) return;
  if (e.code === 'KeyM') { e.preventDefault(); alternarMudo(); }
  if (e.code === 'KeyD') { e.preventDefault(); alternarSurdo(); }
});

// ---------- grade da chamada ----------
const temVideo = (s) => !!s && s.getVideoTracks().some((t) => t.readyState === 'live');
const chaveVolume = (nome, tipo) => `${nome}:${tipo}`;
const volumeDe = (nome, tipo) => volumes[chaveVolume(nome, tipo)] ?? 1;

function aplicarSaida(midia) {
  if (dispositivos.saida && midia.setSinkId && midia.sinkId !== dispositivos.saida) {
    midia.setSinkId(dispositivos.saida).catch(() => {});
  }
}

// Palco: o vídeo em destaque (normalmente a transmissão) fica grande em cima,
// e o resto das pessoas numa faixa de miniaturas embaixo, sem cobrir o vídeo.
// foco = null (automático) | chave do tile escolhido | false (sem destaque)
let foco = null;
let telasAntes = new Set();
let tiraVisivel = true;

// o "assistir junto" conta como uma transmissão (chave 'assistir') e tem preferência no automático
let destaqueAtual = null;
function escolherDestaque(desejados, assistindo) {
  const telas = desejados.filter((d) => d.tipo === 'tela');
  const chaves = [...(assistindo ? ['assistir'] : []), ...telas.map((d) => d.chave)];
  // alguém começou a transmitir (ou colocou vídeo): volta pro automático pra mostrar
  if (chaves.some((c) => !telasAntes.has(c))) foco = null;
  telasAntes = new Set(chaves);
  if (foco === false) return null;
  if (foco && (foco === 'assistir' ? assistindo : desejados.some((d) => d.chave === foco))) return foco;
  foco = null;
  if (assistindo) return 'assistir';
  return (telas.find((d) => !d.local) ?? telas[0])?.chave ?? null;
}

function focarTile(chave) {
  foco = destaqueAtual === chave ? false : chave;
  renderGrid();
}

// vídeo diminuído: o player (que não pode mudar de lugar no DOM, senão o YouTube recarrega)
// fica por cima de um bloco reservado na faixa, do mesmo tamanho dos outros
function posicionarMini() {
  const box = $('#assistir');
  const lugar = $('#grid').classList.contains('assistindo-mini') && $('#tira .tile-assistir');
  if (!lugar) {
    box.style.cssText = '';
    return;
  }
  const g = $('#grid').getBoundingClientRect();
  const r = lugar.getBoundingClientRect();
  const visivel = r.width > 0 && r.height > 0;
  Object.assign(box.style, {
    left: `${r.left - g.left}px`, top: `${r.top - g.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    visibility: visivel ? '' : 'hidden',
  });
}
new ResizeObserver(posicionarMini).observe($('#grid'));
$('#tira').addEventListener('scroll', posicionarMini);
$('#ampliar-assistir').onclick = () => focarTile('assistir');
$('#btn-diminuir-assistir').onclick = () => focarTile('assistir');

function renderGrid() {
  const grid = $('#grid');
  const palco = $('#palco');
  const tira = $('#tira');
  const desejados = [];

  if (estado.voz) {
    for (const u of estado.usuarios.filter((x) => x.voz === estado.voz)) {
      const local = u.id === estado.eu.id;
      const peer = peers.get(u.id);
      const cam = local ? estado.cam : peer?.streams.get(u.camera);
      const tela = local ? estado.tela : peer?.streams.get(u.tela);
      const a = local ? {} : ajustes[u.nome] ?? {};
      if (temVideo(tela)) {
        desejados.push({ chave: `${u.id}:tela`, u, tipo: 'tela', stream: a.ocultarTela ? null : tela, local, oculto: !!a.ocultarTela });
      }
      desejados.push({ chave: `${u.id}:cam`, u, tipo: 'cam', stream: temVideo(cam) && !a.ocultarCam ? cam : null, local });
    }
  }

  // mapa ligado: só aparece o vídeo de quem está perto, e nada vai pro grande sozinho (só clicando)
  const noMapa = !!(estado.voz && estado.mapa);
  if (noMapa) desejados.splice(0, desejados.length, ...desejados.filter((d) => d.local || pertoNoMapa(d.u.id)));
  const assistindo = !!(estado.voz && estado.assistir);
  const destaque = noMapa
    ? (foco === 'assistir' ? assistindo : desejados.some((d) => d.chave === foco)) ? foco : null
    : escolherDestaque(desejados, assistindo);
  destaqueAtual = destaque;
  const videoGrande = destaque === 'assistir';
  grid.classList.toggle('mapa', noMapa && !destaque);
  $('#btn-mapa').classList.toggle('ligado', noMapa);
  grid.classList.toggle('foco', !!destaque);
  grid.classList.toggle('assistindo', videoGrande);
  grid.classList.toggle('assistindo-mini', assistindo && !videoGrande);
  grid.classList.toggle('sem-tira', !!destaque && !tiraVisivel);
  $('#btn-tira').hidden = !destaque;
  $('#btn-tira').title = tiraVisivel ? 'Esconder participantes' : 'Mostrar participantes';
  $('#btn-tira').classList.toggle('desligado', !tiraVisivel);

  // bloco reservado pro vídeo diminuído (primeiro da faixa)
  let reserva = tira.querySelector('.tile-assistir');
  if (assistindo && !videoGrande) {
    if (!reserva) {
      reserva = el('div', 'tile tile-assistir');
      reserva.dataset.chave = 'assistir';
    }
    if (tira.firstElementChild !== reserva) tira.prepend(reserva);
  } else {
    reserva?.remove();
  }
  const existentes = new Map([...grid.querySelectorAll('.tile:not(.tile-assistir)')].map((t) => [t.dataset.chave, t]));
  for (const d of desejados) {
    let tile = existentes.get(d.chave);
    if (tile) existentes.delete(d.chave);
    else tile = criarTile(d);
    const lugar = d.chave === destaque ? palco : tira;
    if (tile.parentElement !== lugar) {
      lugar.append(tile);
      // mover o <video> no DOM pausa ele
      const video = tile.querySelector('video');
      if (video.srcObject) video.play().catch(() => {});
    }
    tile.classList.toggle('em-destaque', d.chave === destaque);
    atualizarTile(tile, d);
  }
  for (const t of existentes.values()) t.remove();
  posicionarMini();
  // mantém a ordem estável na faixa
  desejados.filter((d) => d.chave !== destaque).forEach((d) => {
    const t = tira.querySelector(`[data-chave="${d.chave}"]`);
    if (t && t !== tira.lastElementChild) tira.append(t);
  });

  atualizarAudios();
}

function criarTile(d) {
  const tile = el('div', `tile ${d.tipo}${d.local ? ' minha' : ''}`);
  tile.dataset.chave = d.chave;
  if (d.tipo === 'cam') tile.dataset.fala = d.u.id;
  const video = el('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  if (d.tipo === 'tela') aplicarSaida(video);
  const rotulo = el('div', 'rotulo');
  tile.append(video, el('div', 'capa'), rotulo);

  rotulo.append(el('span', 'nome-tile'));
  if (!d.local) {
    // volume: no tile da câmera controla a voz; no da tela, o áudio da tela
    const tipoVol = d.tipo === 'tela' ? 'tela' : 'mic';
    const vol = el('input');
    vol.type = 'range';
    vol.min = 0;
    vol.max = 2;
    vol.step = 0.05;
    vol.title = d.tipo === 'tela' ? 'Volume da transmissão' : 'Volume do usuário';
    vol.value = volumeDe(d.u.nome, tipoVol);
    vol.oninput = () => mudarVolume(d.u.nome, tipoVol, Number(vol.value));
    vol.ondblclick = (e) => e.stopPropagation();
    rotulo.append(vol);
  }
  // a própria transmissão em tela cheia vira um espelho infinito (e cobre o que você está transmitindo)
  const minhaTela = d.local && d.tipo === 'tela';
  const cheia = el('button', 'btn-cheia');
  cheia.append(icone('cheia'));
  rotulo.append(cheia);
  if (minhaTela) {
    cheia.disabled = true;
    cheia.title = 'Não dá pra pôr a sua própria transmissão em tela cheia';
  } else {
    cheia.title = 'Tela cheia';
    cheia.onclick = () => telaCheia(tile);
    tile.ondblclick = () => telaCheia(tile);
  }
  tile.onclick = (e) => { if (!e.target.closest('input, button')) focarTile(d.chave); };
  if (!d.local) tile.oncontextmenu = (e) => abrirMenuPessoa(d.u.id, e);
  return tile;
}

function telaCheia(tile) {
  if (document.fullscreenElement) document.exitFullscreen();
  else if (!tile.matches('.tela.minha')) tile.requestFullscreen?.();
}
// garantia: se por qualquer caminho a própria transmissão (ou o vídeo dela) for pra tela cheia, sai na hora
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement?.closest?.('.tela.minha')) document.exitFullscreen();
});

function atualizarTile(tile, d) {
  const video = tile.querySelector('video');
  if (video.srcObject !== d.stream) {
    video.srcObject = d.stream;
    if (d.stream) video.play().catch(() => {});
  }
  // o som (voz e áudio da tela) vai pelos <audio> em #audios; o vídeo é só imagem
  video.muted = true;
  video.classList.toggle('espelhado', d.local && d.tipo === 'cam');
  const vol = tile.querySelector('.rotulo input[type=range]');
  if (vol && document.activeElement !== vol) vol.value = volumeDe(d.u.nome, d.tipo === 'tela' ? 'tela' : 'mic');
  tile.classList.toggle('com-video', !!d.stream);
  tile.classList.toggle('falando', d.tipo === 'cam' && falando.has(d.u.id));
  tile.style.setProperty('--tile-cor', `color-mix(in srgb, ${d.u.cor} 35%, #1e1f22)`);
  tile.querySelector('.capa').replaceChildren(avatar(d.u));

  const nome = tile.querySelector('.nome-tile');
  nome.replaceChildren();
  if (d.tipo === 'tela') nome.append(el('span', 'badge-vivo', 'AO VIVO'));
  nome.append(d.u.nome + (d.local ? ' (você)' : ''));
  if (d.oculto) nome.append(el('span', 'info-tela', 'transmissão oculta'));
  if (!d.local && ajustes[d.u.nome]?.mudo && d.tipo === 'cam') nome.append(el('span', 'info-tela', 'silenciado pra você'));
  // no seu próprio quadro da tela: o que está sendo capturado de verdade
  if (d.local && d.tipo === 'tela') {
    const { height, frameRate } = d.stream.getVideoTracks()[0]?.getSettings() ?? {};
    if (height) nome.append(el('span', 'info-tela', `${height}p · ${Math.round(frameRate ?? 0)} fps`));
  }
  if (d.tipo === 'cam' && d.u.surdo) nome.append(icone('foneOff'));
  else if (d.tipo === 'cam' && d.u.mudo) nome.append(icone('micOff'));
  if (d.tipo === 'cam') {
    const r = iconeRede(redeDe(d.u));
    if (r) nome.append(r);
  }
}

const reforcos = new Map(); // "id:tipo" -> { stream, src, ganho } para volume acima de 100%

function mudarVolume(nome, tipo, valor) {
  volumes[chaveVolume(nome, tipo)] = valor;
  salvarStorage('volumes', volumes);
  sincronizarPrefs();
  atualizarAudios();
}

function mudarAjuste(nome, chave, valor) {
  const a = { ...ajustes[nome], [chave]: valor };
  if (!valor) delete a[chave];
  if (Object.keys(a).length) ajustes[nome] = a;
  else delete ajustes[nome];
  salvarStorage('ajustes', ajustes);
  sincronizarPrefs();
  const u = estado.usuarios.find((x) => x.nome === nome);
  if (u) enviarPedido(u.id);
  renderGrid();
}

function ajustarReforco(chave, stream, ganho) {
  let r = reforcos.get(chave);
  if (ganho <= 1 || !audioCtx) {
    if (r) {
      r.src.disconnect();
      reforcos.delete(chave);
    }
    return false;
  }
  if (r?.stream !== stream) {
    r?.src.disconnect();
    const src = audioCtx.createMediaStreamSource(stream);
    const g = audioCtx.createGain();
    src.connect(g).connect(audioCtx.destination);
    r = { stream, src, ganho: g };
    reforcos.set(chave, r);
  }
  r.ganho.gain.value = ganho;
  return true;
}

function atualizarAudios() {
  const box = $('#audios');
  const vistos = new Set();
  // a saída escolhida vale também pro áudio reforçado (WebAudio)
  if (audioCtx?.setSinkId && (audioCtx.sinkId || '') !== (dispositivos.saida || '')) {
    audioCtx.setSinkId(dispositivos.saida || '').catch(() => {});
  }
  for (const [id, peer] of peers) {
    const u = estado.usuarios.find((x) => x.id === id);
    if (!u) continue;
    const fontes = [['mic', u.mic && peer.streams.get(u.mic)], ['tela', u.tela && peer.streams.get(u.tela)]];
    for (const [tipo, stream] of fontes) {
      if (!stream?.getAudioTracks().length) continue;
      const chave = `${id}:${tipo}`;
      vistos.add(chave);
      let audio = [...box.children].find((a) => a.dataset.chave === chave);
      if (!audio) {
        audio = el('audio');
        audio.autoplay = true;
        audio.dataset.chave = chave;
        audio.dataset.peer = id;
        box.append(audio);
      }
      if (audio.srcObject !== stream) {
        audio.srcObject = stream;
        audio.play().catch(() => {});
        if (tipo === 'mic') monitorarFala(id, stream);
      }
      aplicarSaida(audio);
      const silenciado = estado.surdo || (tipo === 'mic' && ajustes[u.nome]?.mudo);
      const volume = silenciado ? 0 : volumeDe(u.nome, tipo) * (tipo === 'mic' ? fatorMapa(id) : 1);
      // acima de 100% o <audio> não alcança: toca pelo GainNode e o <audio> fica mudo
      // (mas continua tocando — o Chrome só entrega o áudio do WebRTC se houver um elemento)
      const reforcado = ajustarReforco(chave, stream, volume);
      audio.muted = silenciado || reforcado;
      audio.volume = Math.min(1, volume);
    }
  }
  for (const audio of [...box.children]) {
    if (vistos.has(audio.dataset.chave)) continue;
    audio.remove();
    ajustarReforco(audio.dataset.chave, null, 0);
    if (audio.dataset.chave.endsWith(':mic')) pararMonitor(audio.dataset.peer);
  }
}

// ---------- menu de cada pessoa na chamada (clique direito) ----------
function abrirMenuPessoa(id, evento) {
  evento.preventDefault();
  evento.stopPropagation();
  const u = estado.usuarios.find((x) => x.id === id);
  if (!u) return;
  if (id === estado.eu.id || !estado.voz || u.voz !== estado.voz) return abrirPerfil(u.nome, evento);
  const a = ajustes[u.nome] ?? {};
  const menu = $('#menu-pessoa');
  menu.dataset.pessoa = id;

  const titulo = el('div', 'menu-titulo');
  titulo.append(avatar(u), el('span', null, u.nome));

  const slider = (rotulo, tipo) => {
    const caixa = el('label', 'menu-slider');
    const valor = el('span', 'menu-valor');
    const r = el('input');
    r.type = 'range';
    r.min = 0;
    r.max = 2;
    r.step = 0.05;
    r.value = volumeDe(u.nome, tipo);
    const mostrar = () => (valor.textContent = `${Math.round(r.value * 100)}%`);
    mostrar();
    r.oninput = () => {
      mostrar();
      mudarVolume(u.nome, tipo, Number(r.value));
    };
    const linha = el('div', 'menu-linha');
    linha.append(el('span', null, rotulo), valor);
    caixa.append(linha, r);
    return caixa;
  };
  const opcao = (rotulo, chave, dica) => {
    const caixa = el('label', 'menu-opcao');
    const c = el('input');
    c.type = 'checkbox';
    c.checked = !!a[chave];
    c.onchange = () => {
      mudarAjuste(u.nome, chave, c.checked);
      if (chave === 'mudo') renderCanais();
    };
    const texto = el('span', null, rotulo);
    if (dica) texto.append(el('small', null, dica));
    caixa.append(texto, c);
    return caixa;
  };

  const itens = [titulo, slider('Volume do usuário', 'mic'), opcao('Silenciar pra mim', 'mudo')];
  if (u.tela) itens.push(el('hr'), slider('Volume da transmissão', 'tela'), opcao('Ocultar transmissão', 'ocultarTela', 'Para de receber o vídeo da tela'));
  itens.push(el('hr'), opcao('Ocultar câmera', 'ocultarCam'), opcao('Qualidade baixa', 'baixa', 'Economiza internet: recebe o vídeo em resolução menor'));
  const perfil = el('button', 'menu-botao', 'Ver perfil');
  perfil.onclick = (e) => abrirPerfil(u.nome, e);
  itens.push(el('hr'), perfil);
  menu.replaceChildren(...itens);
  fecharPopovers();
  menu.hidden = false;
  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(evento.clientX, innerWidth - width - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(evento.clientY, innerHeight - height - 8))}px`;
}

// ---------- prévia da transmissão ao passar o mouse ----------
let previaTimer = null;
function mostrarPrevia(u, alvo) {
  clearTimeout(previaTimer);
  previaTimer = setTimeout(() => {
    const caixa = $('#previa-tela');
    const r = alvo.getBoundingClientRect();
    const rotulo = el('div', 'previa-rotulo');
    rotulo.append(el('span', 'badge-vivo', 'AO VIVO'), u.nome);
    const aoVivo = estado.voz && u.voz === estado.voz ? peers.get(u.id)?.streams.get(u.tela) : null;
    let midia;
    if (temVideo(aoVivo) && !ajustes[u.nome]?.ocultarTela) {
      midia = el('video');
      midia.muted = true;
      midia.autoplay = true;
      midia.playsInline = true;
      midia.srcObject = aoVivo;
    } else {
      midia = el('div', 'previa-vazia', 'Carregando prévia…');
      socket.emit('tela:ver-previa', u.id, (res) => {
        if (caixa.hidden || caixa.dataset.pessoa !== u.id) return;
        if (res?.img) {
          const img = el('img');
          img.src = res.img;
          midia.replaceWith(img);
        } else {
          midia.textContent = 'Sem prévia ainda';
        }
      });
    }
    const sala = canalPorId(u.voz)?.nome;
    const dica = el('div', 'previa-dica', u.voz === estado.voz ? 'Clique pra assistir' : sala ? `Entre em ${sala} pra assistir` : 'Entre na call pra assistir');
    caixa.dataset.pessoa = u.id;
    caixa.replaceChildren(midia, rotulo, dica);
    caixa.hidden = false;
    caixa.style.left = `${r.right + 12}px`;
    caixa.style.top = `${Math.max(8, Math.min(r.top - 60, innerHeight - 230))}px`;
  }, 250);
}
function esconderPrevia() {
  clearTimeout(previaTimer);
  const caixa = $('#previa-tela');
  caixa.hidden = true;
  caixa.querySelector('video')?.removeAttribute('src');
  caixa.replaceChildren();
}

// quem transmite manda uma miniatura de tempos em tempos pro servidor
let previaEnvio = null;
function enviarMiniatura() {
  const track = estado.tela?.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return;
  const video = el('video');
  video.muted = true;
  video.srcObject = new MediaStream([track]);
  video.play().then(() => {
    const canvas = document.createElement('canvas');
    const escala = Math.min(1, 480 / (video.videoWidth || 480));
    canvas.width = Math.round((video.videoWidth || 480) * escala);
    canvas.height = Math.round((video.videoHeight || 270) * escala);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    video.srcObject = null;
    socket.emit('tela:previa', canvas.toDataURL('image/jpeg', 0.6));
  }).catch(() => {});
}
function miniaturas(ligar) {
  clearInterval(previaEnvio);
  previaEnvio = null;
  if (!ligar) return;
  setTimeout(enviarMiniatura, 1500); // espera a imagem estabilizar
  previaEnvio = setInterval(enviarMiniatura, 10_000);
}

// ---------- novidades da versão ----------
// Mostra uma vez o que entrou desde a última versão que a pessoa viu (forcar = botão "Ver novidades")
async function mostrarNovidades(forcar = false) {
  const atual = estado.versao;
  if (!atual) return;
  const vista = lerStorage('versaoVista', null);
  if (!forcar && (contaNova || (vista && compararVersao(atual, vista) <= 0))) return salvarStorage('versaoVista', atual);
  let lista;
  try {
    lista = await (await fetch('novidades.json', { cache: 'no-cache' })).json();
  } catch {
    return;
  }
  lista = lista.filter((n) => compararVersao(n.versao, atual) <= 0);
  if (forcar) lista = lista.slice(0, 5);
  else if (vista) lista = lista.filter((n) => compararVersao(n.versao, vista) > 0);
  else lista = lista.slice(0, 1); // nunca viu: só a mais recente
  salvarStorage('versaoVista', atual);
  if (!lista.length) return;
  $('#lista-novidades').replaceChildren(...lista.map((n) => {
    const bloco = el('div', 'novidade-versao');
    const lis = n.itens.map((t) => el('li', null, t));
    const ul = el('ul');
    ul.append(...lis);
    bloco.append(el('h3', null, `Versão ${n.versao}`), ul);
    return bloco;
  }));
  $('#modal-novidades').hidden = false;
}
const fecharNovidades = () => ($('#modal-novidades').hidden = true);
$('#btn-ok-novidades').onclick = fecharNovidades;
$('#btn-fechar-novidades').onclick = fecharNovidades;
$('#modal-novidades').onclick = (e) => { if (e.target.id === 'modal-novidades') fecharNovidades(); };

// ---------- configurações ----------
const TITULOS_ABA = {
  conta: 'Minha conta', perfil: 'Perfil', voz: 'Voz e vídeo', transmissao: 'Transmissão de tela', atalhos: 'Atalhos', sobre: 'Sobre o Concord',
};
function abrirAba(aba) {
  $$('.cfg-abas [data-aba]').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === aba));
  $$('.cfg-conteudo section[data-aba]').forEach((s) => (s.hidden = s.dataset.aba !== aba));
  $('#cfg-titulo').textContent = TITULOS_ABA[aba];
  capturando = null;
  if (aba !== 'voz') pararTesteMic();
  renderAtalhos();
}
$$('.cfg-abas [data-aba]').forEach((b) => (b.onclick = () => abrirAba(b.dataset.aba)));

function preencherSobre() {
  $('#ver-app').textContent = VERSAO_APP ?? 'não está usando (navegador)';
  $('#ver-servidor').textContent = estado.versaoServidor ?? '?';
  $('#cfg-versao').textContent = VERSAO_APP ? `Concord ${VERSAO_APP}` : estado.versao ? `Concord web ${estado.versao}` : '';
  const aviso = $('#ver-atualizacao');
  aviso.hidden = !atualizacaoPronta;
  if (atualizacaoPronta) aviso.textContent = `A versão ${atualizacaoPronta.versao} já foi baixada: clique no botão verde da barra da esquerda pra reiniciar e atualizar.`;
}
$('#btn-ver-novidades').onclick = () => mostrarNovidades(true);

async function abrirConfig(aba = 'conta') {
  $('#modal-config').hidden = false;
  abrirAba(aba);
  preencherSobre();
  preencherPerfil();
  const lista = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
  const preencher = (sel, tipo, chave) => {
    const opcoes = [new Option('Padrão do sistema', '')];
    lista.filter((d) => d.kind === tipo && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .forEach((d, i) => opcoes.push(new Option(d.label || `Dispositivo ${i + 1}`, d.deviceId)));
    $(sel).replaceChildren(...opcoes);
    $(sel).value = dispositivos[chave];
    if ($(sel).value !== dispositivos[chave]) $(sel).value = '';
  };
  $('#cfg-nome').value = estado.eu?.nome ?? '';
  $('#cfg-usuario').textContent = estado.eu?.usuario ? `Usuário pra entrar: ${estado.eu.usuario}` : '';
  preencher('#cfg-mic', 'audioinput', 'mic');
  preencher('#cfg-saida', 'audiooutput', 'saida');
  preencher('#cfg-cam', 'videoinput', 'cam');
  $('#cfg-resolucao').value = qualidadeTela() === QUALIDADES[transmissao.resolucao] ? transmissao.resolucao : '1080';
  $('#cfg-fps').value = String(fpsTela());
  $('#cfg-ruido').value = dispositivos.ruido ?? 'padrao';
}

// ---------- atalhos nas configurações ----------
function renderAtalhos() {
  $('#cfg-modo').value = atalhos.modo;
  $('#clipes-cfg').hidden = !clipesDisponiveis();
  $('#clipes-indisponivel').hidden = clipesDisponiveis();
  $('#cfg-clipes').checked = !!atalhos.clipes;
  $('#linha-ptt').hidden = atalhos.modo !== 'ptt';
  $$('[data-atalho]').forEach((b) => {
    const chave = b.dataset.atalho;
    const valor = chave === 'ptt' ? atalhos.ptt && nomeTecla(atalhos.ptt.code) : atalhos[chave];
    b.textContent = capturando === chave ? 'Aperte a tecla… (Esc cancela)' : valor || 'Nenhum';
    b.classList.toggle('capturando', capturando === chave);
  });
}
function salvarAtalhos() {
  capturando = null;
  salvarStorage('atalhos', atalhos);
  renderAtalhos();
  aplicarMudo();
  if (estado.voz) atalhosGlobais(true);
}
$('#cfg-clipes').onchange = (e) => {
  atalhos.clipes = e.target.checked;
  salvarStorage('atalhos', atalhos);
  if (atalhos.clipes) {
    iniciarClipes();
    if (!estado.voz) avisar('Os clipes começam a gravar quando você entrar numa chamada.', 4000);
  } else {
    pararClipes();
  }
  if (estado.voz) atalhosGlobais(true);
};
$('#cfg-modo').onchange = (e) => {
  atalhos.modo = e.target.value;
  if (atalhos.modo === 'ptt' && !atalhos.ptt) capturando = 'ptt';
  salvarStorage('atalhos', atalhos);
  renderAtalhos();
  aplicarMudo();
  if (estado.voz) atalhosGlobais(true);
};
$$('[data-atalho]').forEach((b) => (b.onclick = (e) => {
  e.preventDefault();
  capturando = capturando === b.dataset.atalho ? null : b.dataset.atalho;
  renderAtalhos();
}));
// pega a tecla antes de qualquer outro atalho da página
window.addEventListener('keydown', (e) => {
  if (!capturando) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.key === 'Escape') {
    capturando = null;
    return renderAtalhos();
  }
  const apagar = e.key === 'Backspace' || e.key === 'Delete';
  if (capturando === 'ptt') {
    atalhos.ptt = apagar ? null : { code: e.code };
  } else if (apagar) {
    atalhos[capturando] = '';
  } else {
    const c = combinacao(e);
    if (!c) return; // só modificador por enquanto: espera a tecla
    if (!c.includes('+') && !/^F\d/.test(c)) return avisar('Use junto com Ctrl, Alt ou Shift (ou uma tecla F1–F12).', 3000);
    atalhos[capturando] = c;
  }
  salvarAtalhos();
}, true);
window.addEventListener('mousedown', (e) => {
  if (capturando !== 'ptt' || !BOTOES_MOUSE[e.button]) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  atalhos.ptt = { code: BOTOES_MOUSE[e.button] };
  salvarAtalhos();
}, true);

// ---------- status (clicar no seu nome, embaixo à esquerda) ----------
function mudarStatus(status, texto = estado.eu.statusTexto) {
  socket.emit('status', { status, texto }, (res) => {
    if (res?.erro) return avisar(res.erro);
    estado.eu.status = status;
    estado.eu.statusTexto = String(texto ?? '').trim().slice(0, 60);
    renderPainel();
  });
}
function abrirMenuStatus(e) {
  e.stopPropagation();
  const menu = $('#menu-status');
  if (!menu.hidden) return fecharPopovers();
  fecharPopovers();
  $('#status-texto').value = estado.eu.statusTexto ?? '';
  $$('#menu-status [data-status]').forEach((b) => b.classList.toggle('ativo', b.dataset.status === estado.eu.status));
  menu.hidden = false;
  const r = $('.painel-usuario').getBoundingClientRect();
  menu.style.left = `${r.left + 8}px`;
  menu.style.top = `${Math.max(8, r.top - menu.getBoundingClientRect().height - 8)}px`;
  $('#status-texto').focus();
}
$$('#menu-status [data-status]').forEach((b) => (b.onclick = () => {
  mudarStatus(b.dataset.status, $('#status-texto').value);
  fecharPopovers();
}));
$('#status-texto').onkeydown = (e) => {
  if (e.key !== 'Enter') return;
  mudarStatus(estado.eu.status, e.target.value);
  fecharPopovers();
};
$('#ms-editar-perfil').onclick = () => {
  fecharPopovers();
  abrirConfig('perfil');
};

// ---------- perfil (foto, cor, sobre mim) ----------
let corAutomatica = true;

// Converte qualquer cor CSS (hsl, nome…) pra #rrggbb, que é o que o <input type=color> aceita
function corHex(cor) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = cor;
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#5865f2';
}

function preencherPerfil() {
  const p = perfilPorConta(estado.eu?.conta);
  if (!p) return;
  $('#cfg-avatar').replaceChildren(avatar(p));
  $('#btn-remover-foto').hidden = !p.avatar;
  corAutomatica = !p.cor.startsWith('#');
  $('#cfg-cor').value = corHex(p.cor);
  $('#btn-cor-padrao').hidden = corAutomatica;
  $('#cfg-bio').value = p.bio ?? '';
}

async function enviarImagemPara(evento, arquivo, aoTerminar) {
  if (!arquivo?.type.startsWith('image/')) return;
  if (arquivo.size > 10 * 1024 * 1024) return avisar('Imagem grande demais (máx. 10 MB).');
  avisar('Enviando imagem…', 60000);
  socket.timeout(60000).emit(evento, await arquivo.arrayBuffer(), (err, res) => {
    if (err) return avisar('Não deu pra enviar a imagem (conexão lenta?).');
    if (res?.erro) return avisar(res.erro);
    $('#toast').hidden = true;
    aoTerminar?.();
  });
}

$('#btn-trocar-foto').onclick = () => $('#input-foto').click();
$('#input-foto').onchange = (e) => {
  enviarImagemPara('perfil:avatar', e.target.files[0]);
  e.target.value = '';
};
$('#btn-remover-foto').onclick = () => socket.emit('perfil:avatar', null, (res) => res?.erro && avisar(res.erro));
$('#cfg-cor').oninput = () => {
  corAutomatica = false;
  $('#btn-cor-padrao').hidden = false;
};
$('#btn-cor-padrao').onclick = () => {
  corAutomatica = true;
  $('#btn-cor-padrao').hidden = true;
};
$('#btn-salvar-perfil').onclick = () => {
  const botao = $('#btn-salvar-perfil');
  botao.disabled = true;
  socket.emit('perfil:editar', { cor: corAutomatica ? null : $('#cfg-cor').value, bio: $('#cfg-bio').value }, (res) => {
    botao.disabled = false;
    if (res?.erro) return avisar(res.erro);
    botao.textContent = 'Salvo!';
    setTimeout(() => (botao.textContent = 'Salvar perfil'), 1500);
  });
};

// quando os perfis chegam do servidor, a foto/cor do modal acompanham
socket.on('perfis', () => { if (!$('#modal-config').hidden) $('#cfg-avatar').replaceChildren(avatar(perfilPorConta(estado.eu.conta))); });

// ---------- cartão de perfil (clicar no nome/foto de alguém) ----------
function abrirPerfil(nome, evento) {
  evento?.stopPropagation();
  const p = perfilDe(nome);
  const online = estado.usuarios.find((u) => u.nome === nome);
  if (!p && !online) return;
  const pessoa = { nome, cor: p?.cor ?? online.cor, id: online?.id };
  const cartao = $('#cartao-perfil');

  const banner = el('div', 'perfil-banner');
  banner.style.background = pessoa.cor;
  const foto = avatar(pessoa, { status: !!online });
  foto.classList.add('grande');
  if (!online) foto.classList.add('sem-status');

  const corpo = el('div', 'perfil-corpo');
  const titulo = el('h3', null, nome);
  if (p?.admin) titulo.append(icone('coroa', 'coroa'));
  corpo.append(titulo);
  if (p?.dono) corpo.append(el('p', 'perfil-status', `Dono de ${estado.servidor.nome}`));
  const sala = online?.voz ? canalPorId(online.voz)?.nome ?? 'uma call' : null;
  const status = online
    ? sala ? `Em ${sala}${online.tela ? ' · ao vivo' : ''}` : STATUS_NOME[online.status] ?? 'Online'
    : 'Offline';
  corpo.append(el('p', 'perfil-status', status));
  if (online?.statusTexto) corpo.append(el('p', 'perfil-status-texto', online.statusTexto));
  if (p?.bio) {
    corpo.append(el('h4', null, 'Sobre mim'), el('p', 'perfil-bio', p.bio));
  }
  // cargos: admin vê todos e liga/desliga clicando; os outros veem só os da pessoa
  const todosCargos = estado.servidor?.cargos ?? [];
  const cargosVisiveis = p && !emDm() ? (souAdmin() ? todosCargos : cargosDe(p)) : [];
  if (cargosVisiveis.length) {
    const lista = el('div', 'perfil-cargos');
    for (const c of cargosVisiveis) {
      const tem = p.cargos.includes(c.id);
      const chip = el(souAdmin() ? 'button' : 'span', `cargo-chip${tem ? ' tem' : ''}`);
      chip.style.setProperty('--cor-cargo', c.cor);
      chip.append(el('span', 'bolinha'), el('span', null, c.nome));
      if (souAdmin()) {
        chip.type = 'button';
        chip.title = tem ? `Tirar o cargo ${c.nome}` : `Dar o cargo ${c.nome}`;
        chip.onclick = (e) => {
          e.stopPropagation();
          const dar = !chip.classList.contains('tem');
          chip.classList.toggle('tem', dar);
          socket.emit('cargo:dar', { conta: p.id, cargo: c.id, dar }, (r) => {
            if (r?.erro) {
              chip.classList.toggle('tem', !dar);
              avisar(r.erro);
            }
          });
        };
      }
      lista.append(chip);
    }
    corpo.append(el('h4', null, souAdmin() ? 'Cargos (clique pra dar/tirar)' : 'Cargos'), lista);
  }

  const acoes = el('div', 'perfil-acoes');
  if (p && p.id === estado.eu?.conta) {
    const b = el('button', 'btn-secundario', 'Editar perfil');
    b.onclick = () => { fecharPopovers(); abrirConfig('perfil'); };
    acoes.append(b);
  } else if (p) {
    const msg = el('button', 'btn-primario', 'Mandar mensagem');
    msg.onclick = () => abrirDmCom(p.id);
    acoes.append(msg);
    if (souAdmin() && !p.dono) {
      const b = el('button', 'btn-secundario', p.admin ? 'Remover admin' : 'Tornar admin');
      b.onclick = () => socket.emit('admin:definir', { conta: p.id, admin: !p.admin }, (res) => {
        if (res?.erro) return avisar(res.erro);
        fecharPopovers();
      });
      acoes.append(b);
    }
    // admin expulsa membro comum; só o dono expulsa admin
    if (souAdmin() && !p.dono && (!p.admin || souDono())) {
      const b = el('button', 'btn-perigo', 'Expulsar');
      b.onclick = () => {
        if (!confirm(`Expulsar ${p.nome} de ${estado.servidor.nome}? A pessoa só volta com um convite.`)) return;
        socket.emit('membro:expulsar', { conta: p.id }, (res) => {
          if (res?.erro) return avisar(res.erro);
          fecharPopovers();
          avisar(`${p.nome} foi expulso(a) do servidor.`, 3000);
        });
      };
      acoes.append(b);
    }
  }
  if (acoes.childElementCount) corpo.append(acoes);

  cartao.replaceChildren(banner, foto, corpo);
  cartao.hidden = false;
  // abre perto do clique, sem sair da tela
  const x = evento?.clientX ?? innerWidth / 2;
  const y = evento?.clientY ?? innerHeight / 3;
  const { width, height } = cartao.getBoundingClientRect();
  cartao.style.left = `${Math.max(8, Math.min(x + 8, innerWidth - width - 8))}px`;
  cartao.style.top = `${Math.max(8, Math.min(y - 40, innerHeight - height - 8))}px`;
}

// ---------- soundboard ----------
// Sons que já vêm no app: gerados aqui mesmo (sem arquivo), viram um .wav na hora de tocar
const SONS_PADRAO = [
  { padrao: 'badumtss', nome: 'Ba-dum-tss', emoji: '🥁' },
  { padrao: 'buzina', nome: 'Buzina', emoji: '📯' },
  { padrao: 'triste', nome: 'Triste', emoji: '😢' },
  { padrao: 'vitoria', nome: 'Vitória', emoji: '🏆' },
  { padrao: 'palmas', nome: 'Palmas', emoji: '👏' },
  { padrao: 'grilo', nome: 'Grilos', emoji: '🦗' },
];
const urlsPadrao = new Map();
let volumeSons = Number(lerStorage('volumeSons', 0.6));
let sonsServidor = { servidor: null, sons: [] };

function wav(buffer) {
  const dados = buffer.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + dados.length * 2));
  const txt = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  txt(0, 'RIFF'); out.setUint32(4, 36 + dados.length * 2, true); txt(8, 'WAVE'); txt(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, buffer.sampleRate, true); out.setUint32(28, buffer.sampleRate * 2, true);
  out.setUint16(32, 2, true); out.setUint16(34, 16, true); txt(36, 'data'); out.setUint32(40, dados.length * 2, true);
  dados.forEach((v, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Blob([out], { type: 'audio/wav' });
}

async function gerarSomPadrao(nome) {
  if (urlsPadrao.has(nome)) return urlsPadrao.get(nome);
  const dur = { badumtss: 1.4, buzina: 1.3, triste: 2.6, vitoria: 1.3, palmas: 1.6, grilo: 2.2 }[nome] ?? 1;
  const taxa = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(taxa * dur), taxa);
  const ruido = () => {
    const b = ctx.createBuffer(1, taxa * dur, taxa);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  };
  // envelope rápido: sobe em `ataque`, cai até `fim`
  const env = (g, t, pico, ataque, fim) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fim);
  };
  const tom = (t, f0, f1, dura, pico = 0.8) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dura);
    env(g, t, pico, 0.005, dura);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dura);
  };
  const chiado = (t, dura, filtro, freq, pico) => {
    const s = ruido();
    const f = ctx.createBiquadFilter();
    f.type = filtro;
    f.frequency.value = freq;
    const g = ctx.createGain();
    env(g, t, pico, 0.003, dura);
    s.connect(f).connect(g).connect(ctx.destination);
    s.start(t);
    s.stop(t + dura);
  };
  const nota = (t, freq, dura, tipo, pico, vibrato = 0) => {
    const o = ctx.createOscillator();
    o.type = tipo;
    o.frequency.value = freq;
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dura);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    const subida = Math.min(0.03, dura / 3);
    g.gain.exponentialRampToValueAtTime(pico, t + subida);
    g.gain.setValueAtTime(pico, Math.max(t + subida, t + dura - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
    o.connect(f).connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dura);
  };
  if (nome === 'badumtss') {
    tom(0, 200, 90, 0.25);
    tom(0.22, 150, 70, 0.3);
    tom(0.5, 60, 40, 0.3, 0.9);
    chiado(0.5, 0.9, 'highpass', 6000, 0.5);
  } else if (nome === 'buzina') {
    [0, 0.42, 0.62].forEach((t, i) => [349, 440, 523].forEach((f) => nota(t, f, i === 2 ? 0.65 : 0.32, 'sawtooth', 0.13, 3)));
  } else if (nome === 'triste') {
    [[0, 311], [0.45, 294], [0.9, 277]].forEach(([t, f]) => nota(t, f, 0.4, 'sawtooth', 0.22));
    nota(1.35, 262, 1.2, 'sawtooth', 0.22, 8);
  } else if (nome === 'vitoria') {
    [[0, 523], [0.12, 659], [0.24, 784]].forEach(([t, f]) => nota(t, f, 0.12, 'square', 0.12));
    nota(0.36, 1047, 0.9, 'square', 0.12, 5);
  } else if (nome === 'palmas') {
    for (let t = 0; t < 1.3; t += 0.09 + Math.random() * 0.05) chiado(t, 0.08, 'bandpass', 1200 + Math.random() * 600, 0.9);
  } else if (nome === 'grilo') {
    for (const inicio of [0, 1.1]) for (let k = 0; k < 4; k++) nota(inicio + k * 0.07, 4400, 0.05, 'sine', 0.15);
  }
  const url = URL.createObjectURL(wav(await ctx.startRendering()));
  urlsPadrao.set(nome, url);
  return url;
}

function botaoSom(som) {
  const b = el('button', 'botao-som');
  b.type = 'button';
  b.title = som.nome;
  b.append(el('span', 'emoji-som', som.emoji), el('span', 'nome-som', som.nome));
  b.onclick = () => tocarNaChamada(som.padrao ?? som.id);
  const meu = som.conta === estado.eu.conta;
  if (som.id && (meu || perfilPorConta(estado.eu.conta)?.admin)) {
    const x = el('span', 'apagar-som');
    x.title = 'Apagar som';
    x.append(icone('lixo'));
    x.onclick = (e) => {
      e.stopPropagation();
      if (!confirm(`Apagar o som "${som.nome}" do servidor?`)) return;
      socket.emit('som:apagar', som.id, (r) => r?.erro && avisar(r.erro));
    };
    b.append(x);
  }
  return b;
}

function renderSons() {
  const padrao = el('div', 'grade-sons');
  padrao.append(...SONS_PADRAO.map(botaoSom));
  const doServidor = el('div', 'grade-sons');
  doServidor.append(...sonsServidor.sons.map(botaoSom));
  const partes = [el('div', 'titulo-sons', 'Do Concord'), padrao, el('div', 'titulo-sons', `Do servidor (${sonsServidor.sons.length})`)];
  partes.push(sonsServidor.sons.length ? doServidor : el('p', 'vazio-sons', 'Nenhum ainda. Adicione o primeiro aí embaixo!'));
  $('#lista-sons').replaceChildren(...partes);
}

function abrirSons(e) {
  e?.stopPropagation();
  const painel = $('#painel-sons');
  if (!painel.hidden) return fecharPopovers();
  fecharPopovers();
  const srv = estado.vozInfo?.servidorId;
  if (srv !== sonsServidor.servidor) sonsServidor = { servidor: srv, sons: [] };
  renderSons();
  socket.emit('sons:lista', srv, (r) => {
    if (r?.sons && sonsServidor.servidor === srv) {
      sonsServidor.sons = r.sons;
      renderSons();
    }
  });
  $('#vol-sons').value = volumeSons;
  $('#form-som').hidden = true;
  $('#btn-novo-som').hidden = false;
  painel.hidden = false;
  const r = $('#btn-sons').getBoundingClientRect();
  const largura = painel.getBoundingClientRect().width;
  painel.style.left = `${Math.max(8, Math.min(innerWidth - largura - 8, r.left + r.width / 2 - largura / 2))}px`;
  painel.style.top = `${Math.max(8, r.top - painel.getBoundingClientRect().height - 10)}px`;
}
$('#btn-sons').onclick = abrirSons;

// ---------- sortear times (o servidor sorteia e manda no chat) ----------
function pessoasNaChamada() {
  return [...new Map(estado.usuarios.filter((u) => u.voz === estado.voz).map((u) => [u.conta, u])).values()];
}
function canalDoResultado() {
  return estado.servidor?.id === estado.vozInfo?.servidorId ? canalPorId(estado.canalTexto) : null;
}
function abrirTimes(e) {
  e?.stopPropagation();
  const painel = $('#painel-times');
  if (!painel.hidden) return fecharPopovers();
  fecharPopovers();
  const n = pessoasNaChamada().length;
  const canal = canalDoResultado();
  $('#times-info').textContent = canal
    ? `${n} ${n === 1 ? 'pessoa' : 'pessoas'} na chamada. O resultado vai pro #${canal.nome}.`
    : 'Abre um canal de texto do servidor da chamada pra mandar o resultado.';
  for (const b of $$('#painel-times [data-times]')) b.disabled = !canal || n < Number(b.dataset.times);
  painel.hidden = false;
  const r = $('#btn-times').getBoundingClientRect();
  const largura = painel.getBoundingClientRect().width;
  painel.style.left = `${Math.max(8, Math.min(innerWidth - largura - 8, r.left + r.width / 2 - largura / 2))}px`;
  painel.style.top = `${Math.max(8, r.top - painel.getBoundingClientRect().height - 10)}px`;
}
$('#btn-times').onclick = abrirTimes;
for (const b of $$('#painel-times [data-times]')) {
  b.onclick = () => socket.emit('times:sortear', { canal: canalDoResultado()?.id, times: Number(b.dataset.times) }, (r) => {
    if (r?.erro) return avisar(r.erro);
    fecharPopovers();
  });
}
// todo mundo da chamada vê o resultado na tela, mesmo sem estar olhando o chat
let timerTimes;
socket.on('times', ({ por, grupos }) => {
  const c = $('#cartao-times');
  const lista = el('div', 'lista-times');
  lista.append(...grupos.map((g, i) => {
    const t = el('div', 'time');
    t.append(el('b', null, `Time ${i + 1}`), ...g.map((nome) => el('span', null, nome)));
    return t;
  }));
  $('#times-por').textContent = `🎲 ${por} sorteou os times`;
  $('#times-lista').replaceWith(lista);
  lista.id = 'times-lista';
  c.hidden = false;
  clearTimeout(timerTimes);
  timerTimes = setTimeout(() => (c.hidden = true), 20000);
});
$('#fechar-times').onclick = () => ($('#cartao-times').hidden = true);
$('#vol-sons').oninput = (e) => {
  volumeSons = Number(e.target.value);
  salvarStorage('volumeSons', volumeSons);
};

function tocarNaChamada(som) {
  if (!estado.voz) return avisar('Entra numa sala de voz pra tocar sons.');
  socket.emit('som:tocar', som, (r) => r?.erro && avisar(r.erro));
}

socket.on('sons', ({ servidor, sons }) => {
  if (servidor !== sonsServidor.servidor) return;
  sonsServidor.sons = sons;
  if (!$('#painel-sons').hidden) renderSons();
});

// Alguém da chamada tocou um som: cada um toca aqui (respeita o "surdo" e o volume dos sons)
socket.on('som', async (s) => {
  if (!estado.voz || estado.surdo) return;
  const padrao = SONS_PADRAO.find((x) => x.padrao === s.padrao);
  const emoji = padrao?.emoji ?? s.emoji ?? '🔊';
  const tile = document.querySelector(`.tile[data-fala="${CSS.escape(s.de)}"]`);
  if (tile) {
    const bolha = el('div', 'bolha-som', emoji);
    tile.append(bolha);
    setTimeout(() => bolha.remove(), 1800);
  }
  const url = s.padrao ? (padrao ? await gerarSomPadrao(s.padrao) : null) : s.url;
  if (!url || !volumeSons) return;
  const a = new Audio(url);
  a.volume = volumeSons;
  aplicarSaida(a);
  a.play().catch(() => {});
});

$('#btn-novo-som').onclick = (e) => {
  e.stopPropagation();
  $('#form-som').reset();
  $('#form-som').hidden = false;
  $('#btn-novo-som').hidden = true;
};
$('#btn-cancelar-som').onclick = () => {
  $('#form-som').hidden = true;
  $('#btn-novo-som').hidden = false;
};
$('#som-arquivo').onchange = () => {
  const f = $('#som-arquivo').files[0];
  if (f && !$('#som-nome').value) $('#som-nome').value = f.name.replace(/\.[^.]+$/, '').slice(0, 24);
};
$('#form-som').onsubmit = async (e) => {
  e.preventDefault();
  const f = $('#som-arquivo').files[0];
  if (!f) return;
  if (f.size > 1024 * 1024) return avisar('Som grande demais (máx. 1 MB).');
  // duração: som de soundboard é curto
  const duracao = await new Promise((resolve) => {
    const a = new Audio(URL.createObjectURL(f));
    a.onloadedmetadata = () => resolve(a.duration);
    a.onerror = () => resolve(NaN);
  });
  if (Number.isNaN(duracao)) return avisar('Não consegui ler esse áudio. Tenta mp3, ogg ou wav.');
  if (duracao > 7.5) return avisar(`Esse som tem ${Math.round(duracao)} segundos. O máximo é 7.`);
  const btn = $('#btn-salvar-som');
  btn.disabled = true;
  socket.timeout(30000).emit('som:enviar', {
    servidor: sonsServidor.servidor,
    nome: $('#som-nome').value,
    emoji: [...$('#som-emoji').value.trim()].slice(0, 2).join('') || '🔊',
    dados: await f.arrayBuffer(),
  }, (err, r) => {
    btn.disabled = false;
    if (err) return avisar('Não deu pra enviar (conexão lenta?).');
    if (r?.erro) return avisar(r.erro);
    $('#form-som').hidden = true;
    $('#btn-novo-som').hidden = false;
  });
};

// ---------- assistir junto (YouTube sincronizado) ----------
// O servidor guarda { video, por, tocando, posicao }; cada um toca o vídeo no próprio PC
// e corrige quando fica fora do tempo dos outros.
let player = null;
let playerVideo = null;
let ytPronto = null;
let recebidoEm = 0; // quando chegou o estado (pra calcular onde o vídeo deveria estar agora)
let aplicandoAte = 0; // mudanças feitas pelo próprio app (não são cliques da pessoa)
let surdoAssistir = null;

// { video, lista }: vídeo e/ou playlist de um link do YouTube
function linkDoYoutube(texto) {
  const video = idDoYoutube(texto);
  let lista = null;
  try {
    lista = new URL(String(texto).trim()).searchParams.get('list');
  } catch {}
  return { video, lista: /^[A-Za-z0-9_-]{10,64}$/.test(lista ?? '') ? lista : null };
}

// ids dos vídeos de uma playlist: abre um player escondido com ela e pergunta a lista (até 200)
async function videosDaPlaylist(lista) {
  await carregarYoutube();
  return new Promise((ok, falha) => {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px';
    document.body.append(div);
    let tentativas = 0;
    let timer = null;
    const fim = (v, erro) => {
      clearInterval(timer);
      try { p.destroy(); } catch {}
      div.remove();
      erro ? falha(erro) : ok(v);
    };
    const p = new YT.Player(div, {
      playerVars: { listType: 'playlist', list: lista, autoplay: 0, mute: 1, origin: location.origin },
      events: {
        onReady: () => {
          timer = setInterval(() => {
            const ids = p.getPlaylist?.();
            if (ids?.length) fim(ids.filter((id) => /^[A-Za-z0-9_-]{11}$/.test(id)));
            else if (++tentativas > 30) fim(null, new Error('playlist vazia'));
          }, 300);
        },
        onError: () => fim(null, new Error('playlist inválida')),
      },
    });
  });
}

function idDoYoutube(texto) {
  texto = String(texto ?? '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(texto)) return texto;
  try {
    const u = new URL(texto);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be') return u.pathname.slice(1, 12);
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v').slice(0, 11);
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {}
  return null;
}

function carregarYoutube() {
  ytPronto ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      ytPronto = null;
      reject(new Error('sem acesso ao YouTube'));
    };
    document.head.append(s);
  });
  return ytPronto;
}

// onde o vídeo deveria estar agora, pelo estado do servidor
function posicaoEsperada() {
  const a = estado.assistir;
  if (!a) return 0;
  return a.tocando ? a.posicao + (Date.now() - recebidoEm) / 1000 : a.posicao;
}

function sincronizarPlayer() {
  const a = estado.assistir;
  if (!player?.getPlayerState || !a || playerVideo !== a.video) return;
  const st = player.getPlayerState();
  // acabou: espera o servidor mandar o próximo (a não ser que seja o mesmo vídeo de novo na fila)
  if (st === YT.PlayerState.ENDED && !(a.tocando && posicaoEsperada() < 3)) return;
  const atual = player.getCurrentTime?.() ?? 0;
  const esperada = posicaoEsperada();
  if (Math.abs(atual - esperada) > 2) {
    aplicandoAte = Date.now() + 1500;
    player.seekTo(esperada, true);
  }
  if (a.tocando && st !== YT.PlayerState.PLAYING && st !== YT.PlayerState.BUFFERING) {
    aplicandoAte = Date.now() + 1500;
    player.playVideo();
  } else if (!a.tocando && st === YT.PlayerState.PLAYING) {
    aplicandoAte = Date.now() + 1500;
    player.pauseVideo();
  }
  // no surdo, o vídeo também fica mudo
  if (surdoAssistir !== estado.surdo) {
    surdoAssistir = estado.surdo;
    if (estado.surdo) player.mute();
    else player.unMute();
  }
}

// a pessoa deu play/pause/pulou no player: avisa a sala (se for diferente do que todo mundo já está vendo)
function mudouPlayer(e) {
  if (!estado.assistir) return;
  const S = YT.PlayerState;
  if (e.data === S.ENDED) {
    // acabou: o servidor passa pro próximo da fila (todo mundo avisa, ele só conta uma vez).
    // Só vale se é o vídeo atual e chegou mesmo no fim: trocando de vídeo, o player às vezes
    // avisa "acabou" do anterior
    const a = estado.assistir;
    const dur = player?.getDuration?.() ?? 0;
    const doAtual = playerVideo === a.video && player?.getVideoData?.().video_id === a.video;
    if (a.tocando && doAtual && dur > 0 && player.getCurrentTime() >= dur - 2) socket.emit('assistir:fim', a.atual);
    return;
  }
  if (Date.now() < aplicandoAte) return;
  if (![S.PLAYING, S.PAUSED].includes(e.data)) return;
  const tocando = e.data === S.PLAYING;
  const posicao = player.getCurrentTime();
  if (tocando === estado.assistir.tocando && Math.abs(posicao - posicaoEsperada()) < 1.5) return;
  estado.assistir = { ...estado.assistir, tocando, posicao };
  recebidoEm = Date.now();
  socket.emit('assistir:controle', { tocando, posicao });
}

function renderInfoAssistir() {
  const a = estado.assistir;
  if (!a) return;
  const titulo = a.titulo ?? (playerVideo === a.video ? player?.getVideoData?.().title : null);
  const n = a.fila?.length ?? 1;
  $('#info-assistir').textContent = `${a.por} colocou${titulo ? `: ${titulo}` : ' um vídeo'}${n > 1 ? ` · ${a.atual + 1} de ${n}` : ''}`;
  $('#btn-proximo-video').hidden = !(a.atual + 1 < n);
  $('#btn-fila-assistir').hidden = n < 2;
  $('#btn-fila-assistir').textContent = filaVisivel ? `Esconder fila (${n})` : `Fila (${n})`;
}

// fila do "assistir junto": clique pra pular pra um vídeo, X tira da fila
let filaVisivel = lerStorage('filaAssistir', true);
let filaRenderizada = '';
function renderFila() {
  const a = estado.assistir;
  const fila = a?.fila ?? [];
  $('#fila-assistir').hidden = !filaVisivel || fila.length < 2;
  const chave = JSON.stringify([a?.atual, fila]);
  if (chave === filaRenderizada) return;
  filaRenderizada = chave;
  $('#titulo-fila').textContent = `Fila · ${fila.length} vídeos`;
  $('#lista-fila').replaceChildren(...fila.map((v, i) => {
    const li = el('li', `item-fila${i === a.atual ? ' atual' : ''}`);
    li.title = i === a.atual ? 'Tocando agora' : 'Tocar este';
    const img = el('img');
    img.src = `https://i.ytimg.com/vi/${v.video}/mqdefault.jpg`;
    img.loading = 'lazy';
    img.alt = '';
    const txt = el('div', 'txt');
    txt.append(el('span', 'titulo-item', v.titulo ?? 'Vídeo do YouTube'), el('span', 'por-item', `${i === a.atual ? '▶ Tocando · ' : ''}${v.por}`));
    const x = el('button', 'btn-icone');
    x.type = 'button';
    x.title = 'Tirar da fila';
    x.append(icone('fechar'));
    x.onclick = (e) => {
      e.stopPropagation();
      socket.emit('assistir:remover', i, (r) => r?.erro && avisar(r.erro));
    };
    li.append(el('span', 'n-item', String(i + 1)), img, txt, x);
    li.onclick = () => i !== a.atual && socket.emit('assistir:pular', i, (r) => r?.erro && avisar(r.erro));
    return li;
  }));
  $('#lista-fila .atual')?.scrollIntoView({ block: 'nearest' });
}
$('#btn-fila-assistir').onclick = () => {
  filaVisivel = !filaVisivel;
  salvarStorage('filaAssistir', filaVisivel);
  renderFila();
  renderInfoAssistir();
};
$('#btn-proximo-video').onclick = () => {
  const a = estado.assistir;
  if (a && a.atual + 1 < a.fila.length) socket.emit('assistir:pular', a.atual + 1, (r) => r?.erro && avisar(r.erro));
};

function fecharPlayer() {
  player?.destroy?.();
  player = null;
  playerVideo = null;
  surdoAssistir = null;
  $('#assistir').hidden = true;
  // o destroy troca a div do player por nada: recria pro próximo vídeo
  if (!$('#player-assistir')) $('.video-assistir').append(Object.assign(document.createElement('div'), { id: 'player-assistir' }));
}

async function aplicarAssistir(a) {
  estado.assistir = estado.voz ? a : null;
  recebidoEm = Date.now();
  if (!estado.assistir) {
    fecharPlayer();
    renderGrid();
    return;
  }
  $('#assistir').hidden = false;
  renderInfoAssistir();
  renderFila();
  renderGrid();
  if (playerVideo === a.video && player) return sincronizarPlayer();
  try {
    await carregarYoutube();
  } catch {
    return avisar('Não consegui carregar o YouTube aqui (sem internet ou bloqueado).');
  }
  if (estado.assistir?.video !== a.video) return;
  playerVideo = a.video;
  if (player) {
    aplicandoAte = Date.now() + 2000;
    player.loadVideoById({ videoId: a.video, startSeconds: posicaoEsperada() });
    return;
  }
  player = new YT.Player('player-assistir', {
    videoId: a.video,
    playerVars: { autoplay: 1, start: Math.floor(posicaoEsperada()), rel: 0, playsinline: 1, origin: location.origin },
    events: {
      onReady: () => {
        aplicandoAte = Date.now() + 2000;
        sincronizarPlayer();
        renderInfoAssistir();
      },
      onStateChange: (e) => {
        mudouPlayer(e);
        renderInfoAssistir();
      },
      onError: (e) => {
        const a = estado.assistir;
        const temProximo = a && a.atual + 1 < (a.fila?.length ?? 1);
        const msg = [101, 150, 153].includes(e.data)
          ? 'Esse vídeo não deixa ser assistido fora do YouTube.'
          : 'O YouTube não conseguiu tocar esse vídeo.';
        avisar(temProximo ? `${msg} Pulando pro próximo da fila…` : `${msg} Tenta outro.`);
        // não trava a fila num vídeo bloqueado (todo mundo avisa; o servidor só pula uma vez)
        if (temProximo) {
          const atual = a.atual;
          setTimeout(() => estado.assistir?.atual === atual && socket.emit('assistir:fim', atual), 2500);
        }
      },
    },
  });
}
socket.on('assistir', aplicarAssistir);

// Pular pela barra do YouTube nem sempre gera evento: percebe o pulo pelo tempo do vídeo
// (andou bem mais ou voltou, comparado com o relógio) e avisa a sala. Depois confere se
// ninguém ficou pra trás (internet travou, PC lento…).
let ultimoT = null;
let ultimoRelogio = 0;
setInterval(() => {
  const a = estado.assistir;
  if (!player?.getPlayerState || !a || playerVideo !== a.video) {
    ultimoT = null;
    return;
  }
  const st = player.getPlayerState();
  // carregando (muitas vezes porque a pessoa acabou de pular): espera, senão puxaria o vídeo de volta
  if (st === YT.PlayerState.BUFFERING) return;
  const agora = Date.now();
  const t = player.getCurrentTime();
  if (ultimoT != null && agora > aplicandoAte) {
    const andou = t - ultimoT;
    const passou = (agora - ultimoRelogio) / 1000;
    const pulou = st === YT.PlayerState.PLAYING ? andou - passou > 2 || andou < -1 : Math.abs(andou) > 1;
    if (pulou && Math.abs(t - posicaoEsperada()) > 1.5) {
      estado.assistir = { ...a, posicao: t };
      recebidoEm = agora;
      socket.emit('assistir:controle', { tocando: a.tocando, posicao: t });
    }
  }
  ultimoT = t;
  ultimoRelogio = agora;
  sincronizarPlayer();
}, 1000);

function abrirAssistir(e) {
  e?.stopPropagation();
  const painel = $('#painel-assistir');
  if (!painel.hidden) return fecharPopovers();
  fecharPopovers();
  painel.hidden = false;
  const r = $('#btn-assistir').getBoundingClientRect();
  const largura = painel.getBoundingClientRect().width;
  painel.style.left = `${Math.max(8, Math.min(innerWidth - largura - 8, r.left + r.width / 2 - largura / 2))}px`;
  painel.style.top = `${Math.max(8, r.top - painel.getBoundingClientRect().height - 10)}px`;
  $('#link-assistir').value = '';
  // já tem vídeo: escolhe entre tocar agora ou pôr na fila
  $('#btn-fila-add').hidden = !estado.assistir;
  $('#btn-tocar-agora').textContent = estado.assistir ? 'Tocar agora' : 'Assistir';
  $('#link-assistir').focus();
}
$('#btn-assistir').onclick = abrirAssistir;
$('#btn-trocar-video').onclick = abrirAssistir;
async function enviarVideo(agora) {
  const { video, lista } = linkDoYoutube($('#link-assistir').value);
  if (!video && !lista) return avisar('Esse link não parece ser de um vídeo ou playlist do YouTube.');
  let videos = [video];
  let inicio = 0;
  const botoes = [$('#btn-tocar-agora'), $('#btn-fila-add')];
  if (lista) {
    botoes.forEach((b) => (b.disabled = true));
    const texto = $('#btn-tocar-agora').textContent;
    $('#btn-tocar-agora').textContent = 'Abrindo playlist…';
    try {
      const ids = await videosDaPlaylist(lista);
      videos = ids;
      // link de um vídeo dentro da playlist: começa nele
      inicio = video ? Math.max(0, ids.indexOf(video)) : 0;
    } catch {
      if (!video) return avisar('Não consegui abrir essa playlist (ela é privada?).');
    } finally {
      botoes.forEach((b) => (b.disabled = false));
      $('#btn-tocar-agora').textContent = texto;
    }
  }
  socket.emit('assistir:adicionar', { videos, agora, inicio }, (r) => {
    if (r?.erro) return avisar(r.erro);
    fecharPopovers();
    if (r.cortados) avisar(`A fila só cabe 200 vídeos: ${r.cortados} ficaram de fora.`, 5000);
    else if (!agora || videos.length > 1) avisar(videos.length > 1 ? `${r.adicionados} vídeos da playlist na fila.` : 'Vídeo adicionado na fila.', 3000);
  });
}
$('#btn-fila-add').onclick = () => enviarVideo(false);
$('#btn-parar-assistir').onclick = () => socket.emit('assistir:parar');
$('#painel-assistir').onsubmit = (e) => {
  e.preventDefault();
  enviarVideo(true);
};

// ---------- qualidade da conexão na chamada ----------
// A cada 3 s cada um mede, nas próprias conexões diretas, o ping e quanto do áudio dos outros
// se perdeu no caminho. O resumo vai pro servidor e todo mundo vê um sinal do lado do nome.
const minhaRede = { ping: null, perda: null, porPeer: new Map(), ruinsSeguidas: 0, avisouEm: 0, enviado: null };

function nivelRede(r) {
  if (!r || r.ping == null) return null;
  if (r.ping < 150 && r.perda < 3) return 'boa';
  if (r.ping < 300 && r.perda < 10) return 'media';
  return 'ruim';
}
const NOME_NIVEL = { boa: 'boa', media: 'instável', ruim: 'ruim' };
function textoRede(r) {
  const n = nivelRede(r);
  return n ? `Conexão ${NOME_NIVEL[n]}: ping ${r.ping} ms, ${r.perda}% do áudio perdido` : 'Medindo a conexão…';
}
function iconeRede(r) {
  const n = nivelRede(r);
  if (!n) return null;
  const i = icone('sinal', `rede rede-${n}`);
  i.setAttribute('aria-label', textoRede(r));
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = textoRede(r);
  i.prepend(t);
  return i;
}

async function medirPeer(id, peer) {
  const stats = await peer.pc.getStats();
  let rtt = null;
  let perdidos = 0;
  let recebidos = 0;
  stats.forEach((s) => {
    if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded' && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime * 1000;
    if (s.type === 'inbound-rtp' && s.kind === 'audio') {
      perdidos += s.packetsLost ?? 0;
      recebidos += s.packetsReceived ?? 0;
    }
  });
  const antes = minhaRede.porPeer.get(id);
  minhaRede.porPeer.set(id, { perdidos, recebidos, rtt });
  if (!antes || rtt == null) return null;
  const dp = Math.max(0, perdidos - antes.perdidos);
  const dr = Math.max(0, recebidos - antes.recebidos);
  return { ping: rtt, perda: dp + dr ? (dp / (dp + dr)) * 100 : 0 };
}

async function medirRede() {
  if (!estado.voz) return;
  const medidas = (await Promise.all([...peers].filter(([, p]) => p.pc.connectionState === 'connected')
    .map(([id, p]) => medirPeer(id, p).catch(() => null)))).filter(Boolean);
  for (const id of minhaRede.porPeer.keys()) if (!peers.has(id)) minhaRede.porPeer.delete(id);
  if (!medidas.length) {
    minhaRede.ping = minhaRede.perda = null;
  } else {
    // a pior conexão é a que mais atrapalha; perda média (uma pessoa ruim não marca você como ruim)
    minhaRede.ping = Math.round(Math.max(...medidas.map((m) => m.ping)));
    minhaRede.perda = Math.round((medidas.reduce((s, m) => s + m.perda, 0) / medidas.length) * 10) / 10;
  }
  const r = minhaRede.ping == null ? null : { ping: minhaRede.ping, perda: minhaRede.perda };
  // manda quando muda de nível, ou a cada ~15 s pra atualizar os números
  const chave = nivelRede(r);
  if (chave !== minhaRede.enviado?.nivel || Date.now() - (minhaRede.enviado?.em ?? 0) > 15_000) {
    minhaRede.enviado = { nivel: chave, em: Date.now() };
    socket.emit('rede', r);
  }
  // sua conexão está ruim faz um tempinho: avisa (no máximo a cada 2 min)
  minhaRede.ruinsSeguidas = chave === 'ruim' ? minhaRede.ruinsSeguidas + 1 : 0;
  if (minhaRede.ruinsSeguidas >= 3 && Date.now() - minhaRede.avisouEm > 120_000) {
    minhaRede.avisouEm = Date.now();
    avisar(`Sua conexão está ruim (ping ${r.ping} ms, ${r.perda}% perdido): sua voz pode estar picotando pros outros. Se puder, use cabo ou chegue perto do roteador.`, 10000);
  }
  renderRede();
}
setInterval(medirRede, 3000);

// painel "Voz conectada": cor e detalhes da minha conexão
// a minha conexão vem da medição local (mais fresca que a que voltou pelo servidor)
function redeLocal() {
  return peers.size && minhaRede.ping != null ? { ping: minhaRede.ping, perda: minhaRede.perda } : null;
}
function redeDe(u) {
  return u.id === estado.eu?.id ? redeLocal() : u.rede;
}
let ultimaRedeLocal = '';

function renderRede() {
  const info = $('#painel-voz .conectado');
  const r = redeLocal();
  const n = nivelRede(r);
  $('#meu-ping').textContent = r ? ` · ${r.ping} ms` : '';
  // o meu sinal na lista da sala e no meu quadro acompanha a medição
  const agora = r ? `${n}:${r.ping}:${r.perda}` : '';
  if (agora !== ultimaRedeLocal) {
    ultimaRedeLocal = agora;
    renderCanais();
    renderGrid();
  }
  info.classList.toggle('rede-media', n === 'media');
  info.classList.toggle('rede-ruim', n === 'ruim');
  info.title = peers.size ? textoRede(r) : 'Sozinho na sala';
}

// ---------- enquetes ----------
function cartaoEnquete(m) {
  const e = m.enquete;
  const cartao = el('div', 'enquete');
  cartao.append(el('div', 'enquete-pergunta', e.pergunta));
  const pessoas = new Set(e.opcoes.flatMap((o) => o.contas));
  cartao.append(el('div', 'enquete-info', `${e.multipla ? 'Pode escolher várias' : 'Escolha uma'} · ${pessoas.size} ${pessoas.size === 1 ? 'pessoa votou' : 'pessoas votaram'}`));
  const maior = Math.max(1, ...e.opcoes.map((o) => o.contas.length));
  e.opcoes.forEach((o, i) => {
    const meu = o.contas.includes(estado.eu?.conta);
    const b = el('button', `enquete-opcao${meu ? ' votada' : ''}${o.contas.length === maior && o.contas.length ? ' lider' : ''}`);
    b.type = 'button';
    const pct = pessoas.size ? Math.round((o.contas.length / pessoas.size) * 100) : 0;
    const barra = el('span', 'enquete-barra');
    barra.style.width = `${pct}%`;
    b.append(barra, el('span', 'enquete-marca', meu ? '✓' : ''), el('span', 'enquete-texto', o.texto), el('span', 'enquete-pct', `${o.contas.length} · ${pct}%`));
    b.title = o.contas.length ? `Votaram: ${o.contas.map((c) => perfilPorConta(c)?.nome ?? 'alguém').join(', ')}` : 'Ninguém votou ainda';
    b.onclick = () => socket.emit('enquete:votar', { id: m.id, opcao: i }, (r) => r?.erro && avisar(r.erro));
    cartao.append(b);
  });
  return cartao;
}

function linhaOpcao(valor = '') {
  const i = el('input');
  i.maxLength = 80;
  i.placeholder = `Opção ${$('#enquete-opcoes').children.length + 1}`;
  i.value = valor;
  i.autocomplete = 'off';
  return i;
}
$('#btn-enquete').onclick = (e) => {
  e.stopPropagation();
  const painel = $('#painel-enquete');
  if (!painel.hidden) return fecharPopovers();
  fecharPopovers();
  painel.reset();
  $('#enquete-opcoes').replaceChildren();
  $('#enquete-opcoes').append(linhaOpcao(), linhaOpcao());
  painel.hidden = false;
  const r = $('#btn-enquete').getBoundingClientRect();
  painel.style.left = `${Math.max(8, r.left - 8)}px`;
  painel.style.top = `${Math.max(8, r.top - painel.getBoundingClientRect().height - 12)}px`;
  $('#enquete-pergunta').focus();
};
$('#btn-mais-opcao').onclick = (e) => {
  e.stopPropagation();
  if ($('#enquete-opcoes').children.length >= 10) return avisar('No máximo 10 opções.');
  const i = linhaOpcao();
  $('#enquete-opcoes').append(i);
  i.focus();
  const painel = $('#painel-enquete');
  painel.style.top = `${Math.max(8, parseFloat(painel.style.top) - i.getBoundingClientRect().height - 6)}px`;
};
$('#btn-cancelar-enquete').onclick = fecharPopovers;
$('#painel-enquete').onsubmit = (e) => {
  e.preventDefault();
  const opcoes = [...$('#enquete-opcoes').children].map((i) => i.value.trim()).filter(Boolean);
  if (opcoes.length < 2) return avisar('Coloca pelo menos 2 opções.');
  socket.emit('enquete:criar', {
    canal: estado.canalTexto,
    pergunta: $('#enquete-pergunta').value,
    opcoes,
    multipla: $('#enquete-multipla').checked,
  }, (r) => {
    if (r?.erro) return avisar(r.erro);
    fecharPopovers();
  });
};

// ---------- GIFs ----------
let buscaGifTimer = null;
let buscaGifAtual = 0;
function buscarGif(termo) {
  const n = ++buscaGifAtual;
  socket.emit('gifs:buscar', termo, (r) => {
    if (n !== buscaGifAtual) return; // chegou resposta de uma busca antiga
    const grade = $('#grade-gif');
    if (r?.erro === 'semChave') {
      grade.replaceChildren(el('p', 'vazio-gif', 'A busca de GIF ainda não foi ligada neste servidor (falta a chave do Tenor ou GIPHY). Dá pra colar link de GIF ou enviar um arquivo .gif.'));
      return;
    }
    if (r?.erro) return grade.replaceChildren(el('p', 'vazio-gif', r.erro === 'Calma' ? 'Buscando…' : r.erro));
    $('#fonte-gif').textContent = r.fonte ? `GIFs por ${r.fonte}` : '';
    if (!r.gifs.length) return grade.replaceChildren(el('p', 'vazio-gif', 'Nenhum GIF encontrado.'));
    grade.replaceChildren(...r.gifs.map((g) => {
      const b = el('button', 'gif');
      b.type = 'button';
      b.title = g.titulo;
      const img = el('img');
      img.src = g.previa;
      img.loading = 'lazy';
      img.alt = g.titulo;
      if (g.largura && g.altura) img.style.aspectRatio = `${g.largura} / ${g.altura}`;
      b.append(img);
      b.onclick = () => {
        if (estado.canalTexto == null) return;
        socket.emit('mensagem', { canal: estado.canalTexto, texto: g.url });
        fecharPopovers();
        $('#input-msg').focus();
      };
      return b;
    }));
  });
}
$('#btn-gif').onclick = (e) => {
  e.stopPropagation();
  const painel = $('#painel-gif');
  if (!painel.hidden) return fecharPopovers();
  fecharPopovers();
  painel.hidden = false;
  const r = $('#btn-gif').getBoundingClientRect();
  const { width, height } = painel.getBoundingClientRect();
  painel.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, r.right - width))}px`;
  painel.style.top = `${Math.max(8, r.top - height - 12)}px`;
  $('#busca-gif').value = '';
  $('#grade-gif').replaceChildren(el('p', 'vazio-gif', 'Carregando…'));
  $('#busca-gif').focus();
  buscarGif('');
};
$('#busca-gif').oninput = () => {
  clearTimeout(buscaGifTimer);
  buscaGifTimer = setTimeout(() => buscarGif($('#busca-gif').value.trim()), 450);
};

// emoji no chat: escreve onde está o cursor
$('#btn-emoji-msg').onclick = (e) => abrirSeletorEmoji((emoji) => {
  const input = $('#input-msg');
  const ini = input.selectionStart ?? input.value.length;
  const fim = input.selectionEnd ?? ini;
  input.value = input.value.slice(0, ini) + emoji + input.value.slice(fim);
  input.focus();
  input.selectionStart = input.selectionEnd = ini + emoji.length;
}, e);

// emojis do servidor (configurações do servidor, só admin)
function renderEmojisServidor() {
  const lista = estado.servidor?.emojis ?? [];
  $('#srv-emojis').replaceChildren(...(lista.length ? lista.map((e) => {
    const item = el('div', 'srv-emoji');
    const x = el('button', 'btn-icone');
    x.type = 'button';
    x.title = `Apagar :${e.nome}:`;
    x.append(icone('fechar'));
    x.onclick = () => {
      if (confirm(`Apagar o emoji :${e.nome}:?`)) socket.emit('emoji:apagar', e.nome, (r) => r?.erro && avisar(r.erro));
    };
    item.append(imgEmoji(e), el('span', null, `:${e.nome}:`), x);
    return item;
  }) : [el('p', 'dica-cfg', 'Nenhum ainda.')]));
}
$('#emoji-arquivo').onchange = () => {
  const f = $('#emoji-arquivo').files[0];
  if (f && !$('#emoji-nome').value) {
    $('#emoji-nome').value = f.name.replace(/\.[^.]+$/, '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_]+/g, '_').slice(0, 32);
  }
};
$('#form-emoji').onsubmit = async (e) => {
  e.preventDefault();
  const f = $('#emoji-arquivo').files[0];
  if (!f) return;
  if (f.size > 256 * 1024) return avisar('Imagem grande demais pra emoji (máx. 256 KB).');
  socket.timeout(30000).emit('emoji:enviar', { nome: $('#emoji-nome').value, dados: await f.arrayBuffer() }, (err, r) => {
    if (err) return avisar('Não deu pra enviar (conexão lenta?).');
    if (r?.erro) return avisar(r.erro);
    $('#form-emoji').reset();
  });
};

function fecharPopovers() {
  $$('.popover').forEach((e) => (e.hidden = true));
}
document.addEventListener('click', (e) => {
  for (const pop of $$('.popover')) {
    if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true;
  }
});

// ---------- configurações do servidor (admin) ----------
let servidorPendente = false;

function abrirModalServidor(focoTipo) {
  $('#modal-servidor').hidden = false;
  renderModalServidor(true);
  if (focoTipo) $(`.srv-novo[data-tipo="${focoTipo}"] input`).focus();
}

// ---------- cargos (configurações do servidor) ----------
const acessoAberto = new Set(); // canais com o painel do cadeado aberto
function renderCargosServidor() {
  const cargos = estado.servidor.cargos ?? [];
  $('#srv-cargos').replaceChildren(...(cargos.length ? cargos.map((c, i) => {
    const li = el('li', 'srv-cargo');
    const cor = el('input');
    cor.type = 'color';
    cor.value = c.cor;
    cor.title = 'Cor do cargo';
    cor.onchange = () => socket.emit('cargo:editar', { id: c.id, cor: cor.value }, respostaServidor);
    const nome = el('input');
    nome.value = c.nome;
    nome.maxLength = 24;
    nome.onchange = () => socket.emit('cargo:editar', { id: c.id, nome: nome.value }, respostaServidor);
    const qtd = estado.perfis.filter((p) => p.cargos?.includes(c.id)).length;
    li.append(cor, nome, el('span', 'srv-cargo-n', `${qtd} ${qtd === 1 ? 'pessoa' : 'pessoas'}`));
    const botao = (ic, titulo, acao, desligado) => {
      const b = el('button', 'btn-icone');
      b.type = 'button';
      b.title = titulo;
      b.disabled = !!desligado;
      b.append(icone(ic));
      b.onclick = acao;
      li.append(b);
    };
    botao('cima', 'Subir (cargo mais alto dá a cor do nome)', () => socket.emit('cargo:mover', { id: c.id, direcao: -1 }, respostaServidor), i === 0);
    botao('seta', 'Descer', () => socket.emit('cargo:mover', { id: c.id, direcao: 1 }, respostaServidor), i === cargos.length - 1);
    botao('lixo', 'Apagar cargo', () => {
      if (confirm(`Apagar o cargo "${c.nome}"? Quem tem perde, e canais liberados só pra ele ficam só pros admins.`)) {
        socket.emit('cargo:apagar', c.id, respostaServidor);
      }
    });
    return li;
  }) : [el('p', 'dica-cfg', 'Nenhum cargo ainda.')]));
}
$('#form-cargo').onsubmit = (e) => {
  e.preventDefault();
  socket.emit('cargo:criar', { nome: $('#cargo-nome').value, cor: $('#cargo-cor').value }, (r) => {
    if (r?.erro) return avisar(r.erro);
    $('#cargo-nome').value = '';
    // próxima cor sugerida
    const cores = ['#e67e22', '#3498db', '#2ecc71', '#e91e63', '#9b59b6', '#f1c40f', '#1abc9c', '#e74c3c'];
    $('#cargo-cor').value = cores[(cores.indexOf($('#cargo-cor').value) + 1) % cores.length];
  });
};

// painel do cadeado: privado + quais cargos veem
function painelAcesso(c) {
  const box = el('div', 'srv-acesso');
  const marcados = new Set(c.cargos ?? []);
  const enviar = () => socket.emit('canal:acesso', { id: c.id, privado: privado.checked, cargos: [...marcados] }, respostaServidor);
  const privado = el('input');
  privado.type = 'checkbox';
  privado.checked = !!c.privado;
  privado.onchange = enviar;
  const rotulo = el('label', 'srv-acesso-privado');
  rotulo.append(privado, el('span', null, c.tipo === 'texto' ? 'Canal privado: só admins e os cargos marcados veem' : 'Sala privada: só admins e os cargos marcados veem e entram'));
  box.append(rotulo);
  if (c.privado) {
    const cargos = estado.servidor.cargos ?? [];
    if (!cargos.length) box.append(el('p', 'dica-cfg', 'Crie cargos aqui embaixo pra liberar o canal pra mais gente além dos admins.'));
    for (const cargo of cargos) {
      const marca = el('input');
      marca.type = 'checkbox';
      marca.checked = marcados.has(cargo.id);
      marca.onchange = () => {
        if (marca.checked) marcados.add(cargo.id);
        else marcados.delete(cargo.id);
        enviar();
      };
      const r = el('label', 'cargo-chip tem');
      r.style.setProperty('--cor-cargo', cargo.cor);
      r.append(marca, el('span', null, cargo.nome));
      box.append(r);
    }
  }
  return box;
}

function linhaCanal(c, lista) {
  const li = el('li', 'srv-canal');
  li.append(icone(c.tipo === 'texto' ? 'hash' : 'voz'));
  const nome = el('input');
  nome.value = c.nome;
  nome.maxLength = 32;
  nome.title = 'Nome do canal';
  nome.onchange = () => editarCanal(c.id, { nome: nome.value });
  li.append(nome);
  if (c.tipo === 'texto') {
    const topico = el('input', 'srv-topico');
    topico.value = c.topico;
    topico.maxLength = 120;
    topico.placeholder = 'Tópico (opcional)';
    topico.onchange = () => editarCanal(c.id, { topico: topico.value });
    li.append(topico);
  }
  const botao = (ic, titulo, acao, desligado) => {
    const b = el('button', 'btn-icone');
    b.type = 'button';
    b.title = titulo;
    b.disabled = !!desligado;
    b.append(icone(ic));
    b.onclick = acao;
    li.append(b);
  };
  botao('cadeado', c.privado ? 'Canal privado: quem pode ver' : 'Tornar privado', () => {
    if (acessoAberto.has(c.id)) acessoAberto.delete(c.id);
    else acessoAberto.add(c.id);
    renderModalServidor(true);
  });
  li.lastChild.classList.toggle('ligado', !!c.privado);
  if (acessoAberto.has(c.id)) li.classList.add('com-acesso');
  const i = lista.indexOf(c);
  botao('cima', 'Subir', () => moverCanal(c.id, -1), i === 0);
  botao('seta', 'Descer', () => moverCanal(c.id, 1), i === lista.length - 1);
  botao('lixo', 'Apagar canal', () => {
    const aviso = c.tipo === 'texto'
      ? `Apagar #${c.nome} e TODAS as mensagens dele? Não dá pra desfazer.`
      : `Apagar a sala "${c.nome}"? Quem estiver nela sai da chamada.`;
    if (confirm(aviso)) socket.emit('canal:apagar', c.id, (res) => res?.erro && avisar(res.erro));
  }, lista.length <= 1);
  if (acessoAberto.has(c.id)) li.append(painelAcesso(c));
  return li;
}

const respostaServidor = (res) => {
  if (res?.erro) {
    avisar(res.erro);
    renderModalServidor(true);
  }
};
const editarCanal = (id, dados) => socket.emit('canal:editar', { id, ...dados }, respostaServidor);
const moverCanal = (id, direcao) => socket.emit('canal:mover', { id, direcao }, respostaServidor);

function renderModalServidor(forcar = false) {
  const modal = $('#modal-servidor');
  // não atrapalha quem está digitando num campo: atualiza quando sair dele
  if (!forcar && modal.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox])')) {
    servidorPendente = true;
    return;
  }
  servidorPendente = false;
  const srv = estado.servidor;
  if (forcar || document.activeElement !== $('#srv-nome')) $('#srv-nome').value = srv.nome;
  pintarIconeServidor($('#srv-icone'));
  $('#btn-remover-icone').hidden = !srv.icone;
  $('#srv-convite').textContent = srv.convite;
  $('#srv-perigo').hidden = srv.dono !== estado.eu.conta;
  for (const tipo of ['texto', 'voz']) {
    const lista = srv.canais.filter((c) => c.tipo === tipo);
    $(`#srv-canais-${tipo}`).replaceChildren(...lista.map((c) => linhaCanal(c, lista)));
  }
  renderCargosServidor();
  renderEmojisServidor();
  $('#srv-admins').replaceChildren(...estado.perfis.map((p) => {
    const li = el('li');
    const marcar = el('input');
    marcar.type = 'checkbox';
    marcar.checked = p.admin;
    marcar.disabled = p.dono; // o dono é sempre admin
    marcar.onchange = () => socket.emit('admin:definir', { conta: p.id, admin: marcar.checked }, respostaServidor);
    const rotulo = el('label');
    rotulo.append(marcar, avatar(p), el('span', null, p.nome + (p.id === estado.eu.conta ? ' (você)' : '') + (p.dono ? ' · dono' : '')));
    li.append(rotulo);
    return li;
  }));
}

$('#modal-servidor').addEventListener('focusout', () => setTimeout(() => servidorPendente && renderModalServidor(), 0));
$('#btn-cfg-servidor').onclick = () => abrirModalServidor();
$('#btn-srv-convidar').onclick = () => { $('#modal-servidor').hidden = true; abrirConvite(); };
$('#btn-apagar-servidor').onclick = () => {
  const { id, nome } = estado.servidor;
  if (!confirm(`Apagar ${nome} pra todo mundo, com todos os canais e mensagens? Não dá pra desfazer.`)) return;
  socket.emit('servidor:apagar', id, (res) => {
    if (res?.erro) return avisar(res.erro);
    $('#modal-servidor').hidden = true;
  });
};
$$('.btn-add-canal').forEach((b) => (b.onclick = (e) => {
  e.stopPropagation(); // não recolhe a categoria
  abrirModalServidor(b.dataset.tipo);
}));
$('#btn-fechar-servidor').onclick = () => ($('#modal-servidor').hidden = true);
$('#modal-servidor').onclick = (e) => { if (e.target.id === 'modal-servidor') e.target.hidden = true; };
$('#btn-salvar-srv-nome').onclick = () => socket.emit('servidor:editar', { nome: $('#srv-nome').value }, (res) => {
  if (res?.erro) return avisar(res.erro);
  avisar('Nome do servidor salvo', 2000);
});
$('#srv-nome').onkeydown = (e) => { if (e.key === 'Enter') $('#btn-salvar-srv-nome').click(); };
$('#btn-trocar-icone').onclick = () => $('#input-icone').click();
$('#input-icone').onchange = (e) => {
  enviarImagemPara('servidor:icone', e.target.files[0]);
  e.target.value = '';
};
$('#btn-remover-icone').onclick = () => socket.emit('servidor:icone', null, respostaServidor);
$$('.srv-novo').forEach((form) => form.addEventListener('submit', (e) => {
  e.preventDefault();
  const input = form.querySelector('input');
  socket.emit('canal:criar', { tipo: form.dataset.tipo, nome: input.value }, (res) => {
    if (res?.erro) return avisar(res.erro);
    input.value = '';
    renderModalServidor(true);
    input.focus();
  });
}));

function salvarNome() {
  const novo = $('#cfg-nome').value.trim();
  if (!novo || novo === estado.eu?.nome) return;
  const botao = $('#btn-salvar-nome');
  botao.disabled = true;
  socket.emit('conta:nome', novo, (res) => {
    botao.disabled = false;
    if (res.erro) return avisar(res.erro);
    $('#cfg-nome').value = res.nome;
    botao.textContent = 'Salvo!';
    botao.classList.add('copiado');
    setTimeout(() => { botao.textContent = 'Salvar'; botao.classList.remove('copiado'); }, 1500);
  });
}
$('#btn-salvar-nome').onclick = salvarNome;
$('#cfg-nome').onkeydown = (e) => { if (e.key === 'Enter') salvarNome(); };

$('#btn-sair-conta').onclick = () => {
  const t = token;
  token = null;
  salvarStorage('token', null);
  socket.emit('conta:sair', t);
  setTimeout(() => location.reload(), 200);
};
$('.eu').onclick = abrirMenuStatus;

function salvarDispositivo(chave, valor) {
  dispositivos[chave] = valor;
  salvarStorage('dispositivos', dispositivos);
}

$('#cfg-mic').onchange = (e) => {
  salvarDispositivo('mic', e.target.value);
  trocarMic();
  if (testeMic) testarMic(); // reinicia o teste com o microfone novo
};
$('#cfg-ruido').onchange = (e) => {
  salvarDispositivo('ruido', e.target.value);
  trocarMic();
  if (testeMic) testarMic();
};

// ---------- testar microfone (Configurações → Voz e vídeo) ----------
// Erro do getUserMedia em português, dizendo o que fazer
function explicarErroMic(e) {
  switch (e?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'O microfone está bloqueado. No Windows: Configurações → Privacidade e segurança → Microfone → ligue "Acesso ao microfone" e "Permitir que aplicativos da área de trabalho acessem o microfone". Depois feche o Concord pela bandeja (botão direito → Sair) e abra de novo.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhum microfone encontrado. Confira se ele está conectado e escolha ele em "Dispositivo de entrada".';
    case 'NotReadableError':
    case 'AbortError':
      return 'O Windows não deixou usar o microfone (outro programa travou ele). Tente outro dispositivo, ou no Painel de Som do Windows → Gravação → Propriedades do microfone → Avançado, desmarque "Permitir que aplicativos assumam o controle exclusivo".';
    default:
      return `Não deu pra abrir o microfone (${e?.message || e?.name || 'erro desconhecido'}).`;
  }
}

let testeMic = null; // { stream, ctx, intervalo, timer, audio, maximo }
function pararTesteMic() {
  if (!testeMic) return;
  clearInterval(testeMic.intervalo);
  clearTimeout(testeMic.timer);
  testeMic.stream.getTracks().forEach((t) => t.stop());
  testeMic.ctx.close().catch(() => {});
  testeMic.audio?.pause();
  testeMic = null;
  $('#btn-testar-mic').textContent = 'Testar microfone';
  $('#btn-testar-mic').classList.remove('testando');
  $('#nivel-mic').style.width = '0';
}
async function testarMic() {
  pararTesteMic();
  const status = $('#status-mic');
  status.className = '';
  status.textContent = 'Abrindo o microfone…';
  let stream;
  try {
    stream = await pegarMic();
  } catch (e) {
    status.className = 'erro';
    status.textContent = explicarErroMic(e);
    return;
  }
  const ctx = new AudioContext();
  ctx.resume().catch(() => {});
  const analisador = ctx.createAnalyser();
  analisador.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analisador);
  const amostras = new Float32Array(analisador.fftSize);
  const trilha = stream.getAudioTracks()[0];
  testeMic = { stream, ctx, maximo: 0 };
  $('#btn-testar-mic').textContent = 'Parar teste';
  $('#btn-testar-mic').classList.add('testando');
  status.textContent = `Usando: ${trilha?.label || 'microfone padrão'}. Fale alguma coisa: a barra tem que mexer.`;
  ouvirMic();
  const medir = () => {
    if (!testeMic || testeMic.stream !== stream) return;
    analisador.getFloatTimeDomainData(amostras);
    let soma = 0;
    for (const v of amostras) soma += v * v;
    const nivel = Math.min(1, Math.sqrt(soma / amostras.length) * 6);
    testeMic.maximo = Math.max(testeMic.maximo, nivel);
    const barra = $('#nivel-mic');
    barra.style.width = `${Math.round(nivel * 100)}%`;
    barra.classList.toggle('alto', nivel > 0.85);
  };
  testeMic.intervalo = setInterval(medir, 50);
  // depois de uns segundos sem chegar som nenhum, explica
  testeMic.timer = setTimeout(() => {
    if (!testeMic || testeMic.stream !== stream || testeMic.maximo > 0.04) return;
    status.className = 'erro';
    status.textContent = trilha?.muted
      ? 'O Windows está mandando o microfone mudo. Confira se ele não está silenciado no Windows ou no botão do próprio fone.'
      : `Não está chegando som do "${trilha?.label || 'microfone padrão'}". Se você usa outro microfone (tipo o do fone), escolha ele em "Dispositivo de entrada" acima.`;
  }, 6000);
}
function ouvirMic() {
  if (!testeMic) return;
  testeMic.audio?.pause();
  testeMic.audio = null;
  if (!$('#chk-ouvir-mic').checked) return;
  const a = new Audio();
  a.srcObject = testeMic.stream;
  aplicarSaida(a);
  a.play().catch(() => {});
  testeMic.audio = a;
}
$('#btn-testar-mic').onclick = () => (testeMic ? pararTesteMic() : testarMic());
$('#chk-ouvir-mic').onchange = ouvirMic;
// troca o microfone no meio da chamada sem mudar o id do stream
async function trocarMic() {
  if (!estado.mic) return;
  try {
    const novo = (await pegarMic()).getAudioTracks()[0];
    const [antigo] = estado.mic.getAudioTracks();
    estado.mic.removeTrack(antigo);
    estado.mic.addTrack(novo);
    antigo.stop();
    aplicarMudo();
    for (const p of peers.values()) p.senders.mic.forEach((s) => s.replaceTrack(novo));
    pararMonitor(estado.eu.id);
    monitorarFala(estado.eu.id, estado.mic);
  } catch (err) {
    avisar(`Não consegui trocar o microfone: ${err.message}`);
  }
}
$('#cfg-saida').onchange = (e) => {
  salvarDispositivo('saida', e.target.value);
  $$('#audios audio').forEach((m) => m.setSinkId?.(e.target.value).catch(() => {}));
  atualizarAudios();
};
async function mudarTransmissao(chave, valor) {
  transmissao[chave] = valor;
  salvarStorage('transmissao', transmissao);
  sincronizarPrefs();
  const track = estado.tela?.getVideoTracks()[0];
  if (!track) return;
  try {
    await track.applyConstraints(restricoesTela());
  } catch (err) {
    avisar(`Não deu pra mudar a qualidade: ${err.message}`);
  }
  ajustarBitrates();
  renderGrid();
}
$('#cfg-resolucao').onchange = (e) => mudarTransmissao('resolucao', e.target.value);
$('#cfg-fps').onchange = (e) => mudarTransmissao('fps', Number(e.target.value));

$('#cfg-cam').onchange = async (e) => {
  salvarDispositivo('cam', e.target.value);
  if (!estado.cam) return;
  pararStream('cam');
  await ligarCamera();
  enviarEstado();
  render();
};

$('#btn-config').onclick = () => abrirConfig();
$('#btn-fechar-config').onclick = () => {
  pararTesteMic();
  $('#modal-config').hidden = true;
};
$('#modal-config').onclick = (e) => {
  if (e.target.id !== 'modal-config') return;
  pararTesteMic();
  e.target.hidden = true;
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  pararTesteMic();
  $$('.modal').forEach((m) => (m.hidden = true));
  fecharPopovers();
});
// atalho de busca, igual o Discord
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && !$('#app').hidden) {
    e.preventDefault();
    $('#input-busca').focus();
    $('#input-busca').select();
  }
});
