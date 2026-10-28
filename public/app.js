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
  voz: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"/>',
  fone: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  camera: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-4v12l-6-4z"/>',
  tela: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  desligar: '<path fill="currentColor" d="M3 15.5c5-5 13-5 18 0l-2.5 2.5-3.2-1.6v-2.8a10 10 0 0 0-6.6 0v2.8L5.5 18z"/>',
  config: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  jogo: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
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
};

// id do outro usuário -> { pc, polite, makingOffer, ignoreOffer, streams, senders, fila }
const peers = new Map();
const volumes = lerStorage('volumes', {});
// por nome: { mudo, ocultarCam, ocultarTela, baixa } — só vale pra mim
const ajustes = lerStorage('ajustes', {});
const dispositivos = lerStorage('dispositivos', { mic: '', cam: '', saida: '' });
const transmissao = lerStorage('transmissao', { resolucao: '1080', fps: 30 });

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
const atalhos = { modo: 'voz', ptt: null, mudo: 'Ctrl+Shift+M', surdo: 'Ctrl+Shift+D', ...lerStorage('atalhos', {}) };
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

appDesktop?.aoAtalho?.((acao) => (acao === 'mudo' ? alternarMudo() : acao === 'surdo' ? alternarSurdo() : null));
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

// Avisa o app desktop pra ligar/desligar os atalhos globais (funcionam dentro do jogo)
function atalhosGlobais(ligar) {
  if (!appDesktop?.atalhos) return;
  const ptt = atalhos.modo === 'ptt' ? atalhos.ptt?.code ?? null : null;
  appDesktop.atalhos({ ligar, mudo: atalhos.mudo, surdo: atalhos.surdo, ptt }).then((res) => {
    // a versão antiga do app responde só true/false
    const ok = typeof res === 'object' ? res?.ok : res;
    pttGlobal = typeof res === 'object' && !!res?.ptt;
    if (!ligar) return;
    if (ok === false) avisar(`Outro programa já usa ${[atalhos.mudo, atalhos.surdo].filter(Boolean).join(' ou ')}: esse atalho só vai funcionar com o app em foco.`);
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
  salvarStorage('volumes', volumes);
  salvarStorage('transmissao', transmissao);
  salvarStorage('membrosVisiveis', estado.membrosVisiveis);
}

let prefsTimer;
function sincronizarPrefs() {
  clearTimeout(prefsTimer);
  prefsTimer = setTimeout(() => {
    socket.emit('prefs', { volumes, ajustes, transmissao, membrosVisiveis: estado.membrosVisiveis });
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

function renderCanais() {
  renderDms();
  if (emDm()) return;
  $('#canais-texto').replaceChildren(...estado.canaisTexto.map((c) => {
    const li = el('li', 'canal');
    li.append(icone('hash'), el('span', null, c.nome));
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
  linha.style.color = u.cor;
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
  $('#titulo-online').textContent = `Online — ${online.length}`;
  $('#online').replaceChildren(...online.map((u) => itemMembro(u, true)));
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
function comMencoes(trecho) {
  const nos = [];
  let i = 0;
  for (const m of trecho.matchAll(regexMencao())) {
    nos.push(trecho.slice(i, m.index));
    const marca = el('span', 'mencao', m[0]);
    const p = estado.perfis.find((x) => x.nome.toLowerCase() === m[0].slice(1).toLowerCase());
    if (p) marca.onclick = (e) => abrirPerfil(p.nome, e);
    nos.push(marca);
    i = m.index + m[0].length;
  }
  nos.push(trecho.slice(i));
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
  if (UPLOAD_RE.test(texto)) {
    linha.append(imagemPreview(texto));
    return linha;
  }
  if (ARQUIVO_RE.test(texto)) {
    linha.append(previewArquivo(texto));
    return linha;
  }
  let i = 0;
  for (const m of texto.matchAll(URL_RE)) {
    linha.append(...comMencoes(texto.slice(i, m.index)));
    const a = el('a', null, m[0]);
    a.href = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    linha.append(a);
    if (IMG_RE.test(m[0])) linha.append(imagemPreview(m[0]));
    i = m.index + m[0].length;
  }
  linha.append(...comMencoes(texto.slice(i)));
  return linha;
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
    autor.style.color = perfilDe(m.autor)?.cor ?? m.cor;
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
  autor.style.color = perfil?.cor ?? '';
  p.append(avatar({ nome: r.autor, cor: perfil?.cor ?? 'var(--acento)' }), autor, el('span', 'resposta-texto', resumoMensagem(r.texto)));
  p.onclick = () => revelar(r.id);
  return p;
}

const EMOJIS = ['👍', '👎', '😂', '🤣', '😭', '😍', '🥰', '😎', '🤔', '😮', '😡', '🥲', '😅', '🙏', '👏', '🔥',
  '💯', '❤️', '💀', '🎉', '👀', '✅', '❌', '🤡', '🫡', '🤝', '💪', '🎮', '🍕', '🍺', '😴', '🤯'];
const reagir = (m, emoji) => socket.emit('msg:reagir', { id: m.id, emoji }, (res) => res?.erro && avisar(res.erro));

function abrirSeletorEmoji(m, evento) {
  evento.stopPropagation();
  const alvo = evento.currentTarget.getBoundingClientRect();
  const pop = $('#seletor-emoji');
  fecharPopovers();
  pop.replaceChildren(...EMOJIS.map((emoji) => {
    const b = el('button', null, emoji);
    b.type = 'button';
    b.onclick = () => {
      reagir(m, emoji);
      pop.hidden = true;
    };
    return b;
  }));
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
    b.append(el('span', 'reacao-emoji', r.emoji), el('span', 'reacao-n', String(r.contas.length)));
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
  const corpo = formatarTexto(m.texto);
  if (m.editado_em) {
    const tag = el('span', 'editada', ' (editada)');
    tag.title = new Date(m.editado_em).toLocaleString('pt-BR');
    corpo.append(tag);
  }
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
  if (minha && !ehUpload(m.texto)) botao('lapis', 'Editar', () => iniciarEdicao(m));
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
  autor.style.color = perfilDe(m.autor)?.cor ?? m.cor;
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
    avisar(`Sem microfone (${e.message}) — você entrou só ouvindo.`);
  }
  aplicarMudo();
  if (estado.mic) monitorarFala(estado.eu.id, estado.mic);

  estado.voz = canal;
  estado.vozInfo = { canal: canalPorId(canal)?.nome ?? '', servidor: estado.servidor.nome };
  estado.view = 'voz';
  socket.emit('voz:entrar', canal, (ids) => {
    if (!Array.isArray(ids)) {
      sairVoz(false);
      return avisar('Não deu pra entrar nessa sala.');
    }
    for (const id of ids) if (!peers.has(id)) criarPeer(id);
  });
  enviarEstado();
  atalhosGlobais(true);
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
  miniaturas(false);
  membrosVoz = new Set();
  if (estado.view === 'voz') estado.view = 'texto';
  if (avisarServidor) socket.emit('voz:sair');
  atalhosGlobais(false);
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

function escolherDestaque(desejados) {
  const telas = desejados.filter((d) => d.tipo === 'tela');
  // alguém começou a transmitir: volta pro automático pra mostrar a tela nova
  if (telas.some((d) => !telasAntes.has(d.chave))) foco = null;
  telasAntes = new Set(telas.map((d) => d.chave));
  if (foco === false) return null;
  if (foco && desejados.some((d) => d.chave === foco)) return foco;
  foco = null;
  return (telas.find((d) => !d.local) ?? telas[0])?.chave ?? null;
}

function focarTile(chave) {
  foco = $('#palco').firstElementChild?.dataset.chave === chave ? false : chave;
  renderGrid();
}

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

  const destaque = escolherDestaque(desejados);
  grid.classList.toggle('foco', !!destaque);
  grid.classList.toggle('sem-tira', !!destaque && !tiraVisivel);
  $('#btn-tira').hidden = !destaque;
  $('#btn-tira').title = tiraVisivel ? 'Esconder participantes' : 'Mostrar participantes';
  $('#btn-tira').classList.toggle('desligado', !tiraVisivel);

  const existentes = new Map([...grid.querySelectorAll('.tile')].map((t) => [t.dataset.chave, t]));
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
      const volume = silenciado ? 0 : volumeDe(u.nome, tipo);
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
  const i = lista.indexOf(c);
  botao('cima', 'Subir', () => moverCanal(c.id, -1), i === 0);
  botao('seta', 'Descer', () => moverCanal(c.id, 1), i === lista.length - 1);
  botao('lixo', 'Apagar canal', () => {
    const aviso = c.tipo === 'texto'
      ? `Apagar #${c.nome} e TODAS as mensagens dele? Não dá pra desfazer.`
      : `Apagar a sala "${c.nome}"? Quem estiver nela sai da chamada.`;
    if (confirm(aviso)) socket.emit('canal:apagar', c.id, (res) => res?.erro && avisar(res.erro));
  }, lista.length <= 1);
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
};
$('#cfg-ruido').onchange = (e) => {
  salvarDispositivo('ruido', e.target.value);
  trocarMic();
};
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
$('#btn-fechar-config').onclick = () => ($('#modal-config').hidden = true);
$('#modal-config').onclick = (e) => { if (e.target.id === 'modal-config') e.target.hidden = true; };
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
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
