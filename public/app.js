'use strict';

const socket = io({ autoConnect: false });
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
// Existe quando roda dentro do app desktop (Electron)
const appDesktop = window.desktop ?? null;

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
  config: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
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
ICONES.coroa = '<path fill="currentColor" stroke="none" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>';
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

// ---------- desktop ----------
appDesktop?.aoAtalho?.((acao) => (acao === 'mudo' ? alternarMudo() : alternarSurdo()));

// Avisa o app desktop pra ligar/desligar os atalhos globais (Ctrl+Shift+M/D dentro do jogo)
function atalhosGlobais(ligar) {
  appDesktop?.atalhos?.(ligar).then((ok) => {
    if (ligar && ok === false) avisar('Outro programa já usa Ctrl+Shift+M ou Ctrl+Shift+D: os atalhos só vão funcionar com o app em foco.');
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
    $('#senha').value = '';
    // criou a conta com o convite: já está no servidor, não precisa entrar de novo
    if (modoLogin === 'criar' && $('#convite').value === conviteDaUrl()) esquecerConviteDaUrl();
    $('#convite').value = '';
    entrar();
  });
});

function entrar() {
  socket.emit('entrar', { token }, (res) => {
    if (res.erro) {
      if (res.sessaoInvalida) {
        token = null;
        salvarStorage('token', null);
      }
      mostrarLogin(res.erro);
      return;
    }
    const primeiraVez = !estado.eu;
    estado.eu = { id: res.id, conta: res.conta, nome: res.nome, usuario: res.usuario };
    estado.servidores = res.servidores;
    estado.iceServers = res.iceServers;
    if (primeiraVez) aplicarPrefs(res.prefs);
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#meu-nome').textContent = res.nome;
    if (primeiraVez && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    const convite = conviteDaUrl();
    if (convite) {
      esquecerConviteDaUrl();
      return entrarComConvite(convite);
    }
    const lembrado = estado.servidor.id ?? lerStorage('servidorAtivo', null);
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

// Troca o servidor aberto (id vazio = nenhum: mostra a tela de criar/entrar)
function abrirServidor(id) {
  fecharPopovers();
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
    salvarStorage('servidorAtivo', id);
    const preferido = trocou ? lerStorage('ultimoCanal', {})[id] : estado.canalTexto;
    abrirTexto((estado.canaisTexto.find((c) => c.id === preferido) ?? estado.canaisTexto[0])?.id);
  });
}

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
const canalPorId = (id) => estado.servidor.canais.find((c) => c.id === id);

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
  if (estado.servidor.id != null && !lista.some((x) => x.id === estado.servidor.id)) abrirServidor(lista[0]?.id);
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

// Reconectou (ex.: queda de internet): entra de novo automaticamente
socket.on('connect', () => { if (estado.eu) entrar(); });
socket.on('disconnect', (motivo) => {
  // o servidor derrubou porque você entrou de novo em outra aba/janela
  if (motivo === 'io server disconnect' && token) avisar('Sua conta entrou em outro lugar, então esta janela foi desconectada. Aperte F5 pra voltar aqui.', 60000);
  if (estado.voz) {
    sairVoz(false);
    avisar('Conexão caiu — você saiu da chamada.');
  }
});

let membrosVoz = new Set();
socket.on('presenca', (lista) => {
  estado.usuarios = lista;
  for (const id of [...peers.keys()]) {
    const u = lista.find((x) => x.id === id);
    if (!u || u.voz !== estado.voz) fecharPeer(id);
  }

  // som de alguém entrando/saindo da minha sala
  const agora = new Set(estado.voz ? lista.filter((u) => u.voz === estado.voz).map((u) => u.id) : []);
  if (estado.voz && membrosVoz.has(estado.eu.id)) {
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
  if (status) a.append(el('span', 'status-dot'));
  return a;
}

function renderRail() {
  $('#lista-servidores').replaceChildren(...estado.servidores.map((srv) => {
    const item = el('div', 'rail-item');
    item.classList.toggle('ativo', srv.id === estado.servidor.id);
    item.classList.toggle('nao-lido', estado.srvNaoLidos.has(srv.id));
    item.title = srv.nome;
    const ic = el('div', 'icone-servidor');
    pintarIconeServidor(ic, srv);
    item.append(el('span', 'pill'), ic);
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
  renderRail();
  const admin = souAdmin();
  $('#btn-cfg-servidor').hidden = !admin;
  $$('.so-admin').forEach((e) => (e.hidden = !admin));
}

function renderCanais() {
  $('#canais-texto').replaceChildren(...estado.canaisTexto.map((c) => {
    const li = el('li', 'canal');
    li.append(icone('hash'), el('span', null, c.nome));
    li.classList.toggle('ativo', estado.view === 'texto' && c.id === estado.canalTexto);
    li.classList.toggle('nao-lido', estado.naoLidos.has(c.id));
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
  if (u.voz) {
    const sala = canalPorId(u.voz)?.nome ?? 'outro servidor';
    nome.append(el('span', 'atividade', u.tela ? `Ao vivo em ${sala}` : `Em ${sala}`));
  }
  li.append(avatar(u, { status: online }), nome);
  li.onclick = (e) => abrirPerfil(u.nome, e);
  if (online) li.oncontextmenu = (e) => abrirMenuPessoa(u.id, e);
  return li;
}

function renderMembros() {
  $('#membros').hidden = !estado.membrosVisiveis || estado.view === 'voz';
  $('#btn-membros').classList.toggle('ativo', estado.membrosVisiveis);
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
  $('#icone-canal').replaceChildren(icone(naVoz ? 'voz' : 'hash'));
  const texto = canalPorId(estado.canalTexto);
  $('#titulo-canal').textContent = naVoz ? estado.vozInfo?.canal ?? '' : texto?.nome ?? '';
  $('#topico').textContent = naVoz ? '' : texto?.topico ?? '';
  $('#btn-fixadas').hidden = naVoz;
  $('#input-msg').placeholder = `Conversar em #${texto?.nome ?? ''}`;
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
  mensagens = [];
  editando = null;
  digitando.forEach(clearTimeout);
  digitando.clear();
  renderDigitando();
  $('#painel-fixadas').hidden = true;
  renderMensagens();

  if (canal != null) socket.emit('historico', canal, (rows) => {
    if (canal !== estado.canalTexto || !Array.isArray(rows)) return;
    mensagens = rows;
    renderMensagens();
    rolarProFim();
  });
  fecharMenu();
  render();
  $('#input-msg').focus();
}

const rolarProFim = () => { const m = $('#mensagens'); m.scrollTop = m.scrollHeight; };

const URL_RE = /https?:\/\/[^\s<]+/g;
const IMG_RE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;
const UPLOAD_RE = /^\/uploads\/[a-f0-9]+\.(png|jpg|gif|webp)$/;

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
  let i = 0;
  for (const m of texto.matchAll(URL_RE)) {
    linha.append(texto.slice(i, m.index));
    const a = el('a', null, m[0]);
    a.href = m[0];
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    linha.append(a);
    if (IMG_RE.test(m[0])) linha.append(imagemPreview(m[0]));
    i = m.index + m[0].length;
  }
  linha.append(texto.slice(i));
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
  const agrupar = !novoDia && anterior.autor === m.autor && m.criado_em - anterior.criado_em < 7 * 60e3;

  const linha = el('div', agrupar ? 'msg' : 'msg inicio');
  linha.dataset.id = m.id;
  linha.classList.toggle('fixada', !!m.fixada);
  const corpo = editando?.id === m.id ? editorMensagem(m) : corpoMensagem(m);
  if (agrupar) {
    linha.append(el('span', 'hora-lateral', fmtHora(data)), corpo);
  } else {
    const cab = el('div', 'cabecalho');
    const autor = el('span', 'autor', m.autor);
    autor.style.color = perfilDe(m.autor)?.cor ?? m.cor;
    autor.onclick = (e) => abrirPerfil(m.autor, e);
    cab.append(autor, el('span', 'hora', fmtCabecalho(data)));
    const av = avatar({ nome: m.autor, cor: m.cor });
    av.onclick = (e) => abrirPerfil(m.autor, e);
    linha.append(av, cab, corpo);
  }
  const acoes = acoesMensagem(m);
  if (acoes) linha.append(acoes);
  nos.push(linha);
  return nos;
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
  if (minha && !UPLOAD_RE.test(m.texto)) botao('lapis', 'Editar', () => iniciarEdicao(m));
  if (souAdmin()) botao('pino', m.fixada ? 'Desafixar' : 'Fixar', () => fixarMensagem(m, !m.fixada));
  if (minha || souAdmin()) botao('lixo', 'Apagar (Shift+clique apaga sem perguntar)', (e) => apagarMensagem(m, e));
  if (!botoes.length) return null;
  const caixa = el('div', 'acoes-msg');
  caixa.append(...botoes);
  return caixa;
}

function renderMensagens() {
  const box = $('#mensagens');
  const noFim = pertoDoFim(box);
  const topo = box.scrollTop;
  const canal = canalPorId(estado.canalTexto)?.nome;
  if (canal == null) return box.replaceChildren();
  const boas = el('div', 'boas-vindas');
  const bola = el('div', 'bola');
  bola.append(icone('hash'));
  boas.append(bola, el('h2', null, `Bem-vindo(a) a #${canal}!`), el('p', null, `Este é o começo do canal #${canal}.`));
  box.replaceChildren(boas, ...mensagens.flatMap((m, i) => criarMensagem(m, mensagens[i - 1])));
  if (noFim) rolarProFim();
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
      const item = el('div', 'fixada-item');
      const cab = el('div', 'cabecalho');
      const autor = el('span', 'autor', m.autor);
      autor.style.color = perfilDe(m.autor)?.cor ?? m.cor;
      cab.append(avatar({ nome: m.autor, cor: m.cor }), autor, el('span', 'hora', fmtCabecalho(new Date(m.criado_em))));
      item.append(cab, formatarTexto(m.texto));
      if (souAdmin()) {
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

socket.on('mensagem', (m) => {
  if (digitando.has(m.autor)) {
    clearTimeout(digitando.get(m.autor));
    digitando.delete(m.autor);
    renderDigitando();
  }
  const minha = m.conta === estado.eu.conta;
  if (m.servidor !== estado.servidor.id) {
    // mensagem em outro servidor meu: marca a bolinha na barra da esquerda
    if (!minha) {
      estado.srvNaoLidos.add(m.servidor);
      renderRail();
    }
  } else {
    if (m.canal === estado.canalTexto) adicionarMensagem(m);
    if (m.canal !== estado.canalTexto || estado.view !== 'texto') {
      estado.naoLidos.add(m.canal);
      renderCanais();
    }
  }
  if (!minha && !document.hasFocus() && window.Notification?.permission === 'granted') {
    const srv = estado.servidores.find((x) => x.id === m.servidor)?.nome;
    const canal = m.servidor === estado.servidor.id ? `#${canalPorId(m.canal)?.nome}` : srv;
    new Notification(`${m.autor} (${canal})`, { body: UPLOAD_RE.test(m.texto) ? '📷 Imagem' : m.texto, silent: false });
  }
});

$('#form-msg').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#input-msg');
  const texto = input.value.trim();
  if (!texto) return;
  socket.emit('mensagem', { canal: estado.canalTexto, texto });
  input.value = '';
});

async function enviarImagem(arquivo) {
  if (!arquivo?.type.startsWith('image/')) return;
  if (arquivo.size > 10 * 1024 * 1024) return avisar('Imagem grande demais (máx. 10 MB).');
  const canal = estado.canalTexto;
  avisar('Enviando imagem…', 60000);
  const dados = await arquivo.arrayBuffer();
  socket.timeout(60000).emit('imagem', { canal, dados }, (err, res) => {
    if (err) return avisar('Não deu pra enviar a imagem (conexão lenta?).');
    if (res?.erro) return avisar(res.erro);
    $('#toast').hidden = true;
  });
}

$('#input-msg').addEventListener('paste', (e) => {
  const arquivo = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'));
  if (!arquivo) return;
  e.preventDefault();
  enviarImagem(arquivo);
});
$('#btn-anexar').onclick = () => $('#input-arquivo').click();
$('#input-arquivo').onchange = (e) => {
  [...e.target.files].forEach(enviarImagem);
  e.target.value = '';
};
$('#view-texto').addEventListener('dragover', (e) => e.preventDefault());
$('#view-texto').addEventListener('drop', (e) => {
  e.preventDefault();
  [...e.dataTransfer.files].forEach(enviarImagem);
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

async function pegarMic() {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...preferido(dispositivos.mic) },
  });
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
  estado.mic?.getAudioTracks().forEach((t) => (t.enabled = !estado.mudo && !estado.surdo));
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
        audio: true,
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
  const tile = el('div', `tile ${d.tipo}`);
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
  const cheia = el('button', 'btn-cheia');
  cheia.title = 'Tela cheia';
  cheia.append(icone('cheia'));
  cheia.onclick = () => telaCheia(tile);
  rotulo.append(cheia);

  tile.ondblclick = () => telaCheia(tile);
  tile.onclick = (e) => { if (!e.target.closest('input, button')) focarTile(d.chave); };
  if (!d.local) tile.oncontextmenu = (e) => abrirMenuPessoa(d.u.id, e);
  return tile;
}

function telaCheia(tile) {
  if (document.fullscreenElement) document.exitFullscreen();
  else tile.requestFullscreen?.();
}

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

// ---------- configurações ----------
async function abrirConfig() {
  $('#modal-config').hidden = false;
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

}

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
  const status = online ? (online.voz ? `Em ${online.voz}${online.tela ? ' · ao vivo' : ''}` : 'Online') : 'Offline';
  corpo.append(el('p', 'perfil-status', status));
  if (p?.bio) {
    corpo.append(el('h4', null, 'Sobre mim'), el('p', 'perfil-bio', p.bio));
  }

  const acoes = el('div', 'perfil-acoes');
  if (p && p.id === estado.eu?.conta) {
    const b = el('button', 'btn-secundario', 'Editar perfil');
    b.onclick = () => { fecharPopovers(); abrirConfig(); };
    acoes.append(b);
  } else if (p && souAdmin() && !p.dono) {
    const b = el('button', 'btn-secundario', p.admin ? 'Remover admin' : 'Tornar admin');
    b.onclick = () => socket.emit('admin:definir', { conta: p.id, admin: !p.admin }, (res) => {
      if (res?.erro) return avisar(res.erro);
      fecharPopovers();
    });
    acoes.append(b);
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
$('.eu').onclick = abrirConfig;

function salvarDispositivo(chave, valor) {
  dispositivos[chave] = valor;
  salvarStorage('dispositivos', dispositivos);
}

$('#cfg-mic').onchange = async (e) => {
  salvarDispositivo('mic', e.target.value);
  if (!estado.mic) return;
  // troca o microfone no meio da chamada sem mudar o id do stream
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
};
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

$('#btn-config').onclick = abrirConfig;
$('#btn-fechar-config').onclick = () => ($('#modal-config').hidden = true);
$('#modal-config').onclick = (e) => { if (e.target.id === 'modal-config') e.target.hidden = true; };
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  $$('.modal').forEach((m) => (m.hidden = true));
  fecharPopovers();
});
