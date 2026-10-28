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
const estado = {
  eu: null,
  canaisTexto: [],
  canaisVoz: [],
  iceServers: [],
  canalTexto: null,
  view: 'texto', // 'texto' | 'voz'
  usuarios: [],
  naoLidos: new Set(),
  membrosVisiveis: lerStorage('membrosVisiveis', true),
  // voz
  voz: null,
  mudo: false,
  surdo: false,
  mic: null,
  cam: null,
  tela: null,
};

// id do outro usuário -> { pc, polite, makingOffer, ignoreOffer, streams, senders, fila }
const peers = new Map();
const volumes = lerStorage('volumes', {});
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
if (appDesktop) {
  $$('.trocar-servidor').forEach((b) => {
    b.hidden = false;
    b.onclick = () => appDesktop.trocarServidor();
  });
  appDesktop.aoTunel?.(({ estado: e, url }) => {
    if (e === 'caiu') avisar('O link público caiu. Criando outro…');
    else avisar(`Link novo criado: ${url} — mande pra galera (botão Convidar).`, 15000);
  });
  appDesktop.aoAtalho?.((acao) => (acao === 'mudo' ? alternarMudo() : alternarSurdo()));
}

// Avisa o app desktop pra ligar/desligar os atalhos globais (Ctrl+Shift+M/D dentro do jogo)
function atalhosGlobais(ligar) {
  appDesktop?.atalhos?.(ligar).then((ok) => {
    if (ligar && ok === false) avisar('Outro programa já usa Ctrl+Shift+M ou Ctrl+Shift+D: os atalhos só vão funcionar com o app em foco.');
  });
}

// ---------- convite ----------
const ehLocal = (host) => ['localhost', '127.0.0.1'].includes(host);

async function abrirConvite() {
  const info = appDesktop ? await appDesktop.info() : null;
  let link = info?.link ?? (ehLocal(location.hostname) ? null : location.origin);
  const extras = info?.enderecos ?? [];
  if (!link && extras.length) link = extras[0];

  $('#convite-link').value = link ?? '';
  $('#btn-copiar').disabled = !link;
  if (!link) {
    $('#convite-dica').textContent = 'Esse servidor só está acessível neste PC. Crie o servidor com "link pra amigos pela internet" marcado.';
  } else if (link.startsWith('https:')) {
    $('#convite-dica').textContent = 'Funciona de qualquer lugar. Seu amigo pode colar no app Concord ou abrir direto no navegador (Chrome/Edge), sem instalar nada.';
  } else {
    $('#convite-dica').textContent = 'Esse link só funciona na mesma rede ou VPN (Radmin, Hamachi…) e precisa do app: pelo navegador o microfone não funciona em http.';
  }
  $('#convite-extra').textContent = [
    extras.length > 1 && `Outros endereços deste PC: ${extras.slice(1).join(', ')}.`,
    info?.link && 'O link muda toda vez que você cria o servidor de novo.',
  ].filter(Boolean).join(' ');
  $('#modal-convite').hidden = false;
  $('#convite-link').select();
}

$$('.btn-convidar').forEach((b) => (b.onclick = abrirConvite));
$('#btn-fechar-convite').onclick = () => ($('#modal-convite').hidden = true);
$('#modal-convite').onclick = (e) => { if (e.target.id === 'modal-convite') e.target.hidden = true; };
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

// ---------- login ----------
// Identifica este navegador/app, pra reconexão não ser barrada como "nome repetido"
const sessao = lerStorage('sessao', null) ?? crypto.getRandomValues(new Uint32Array(4)).join('-');
salvarStorage('sessao', sessao);

$('#nome').value = lerStorage('nome', '');
$('#senha').value = lerStorage('senha', '');

// Já entrou antes neste servidor: entra direto, sem mostrar a tela de login
if ($('#nome').value) {
  $('#login').hidden = true;
  socket.connect();
  entrar();
}

$('#form-login').addEventListener('submit', (e) => {
  e.preventDefault();
  $('#erro-login').textContent = '';
  if (!socket.connected) socket.connect();
  entrar();
});

function entrar() {
  const nome = $('#nome').value.trim();
  const senha = $('#senha').value;
  socket.emit('entrar', { nome, senha, sessao }, (res) => {
    if (res.erro) {
      $('#erro-login').textContent = res.erro;
      $('#login').hidden = false;
      $('#app').hidden = true;
      return;
    }
    salvarStorage('nome', nome);
    salvarStorage('senha', senha);
    const primeiraVez = !estado.eu;
    estado.eu = { id: res.id, nome };
    estado.canaisTexto = res.canaisTexto;
    estado.canaisVoz = res.canaisVoz;
    estado.iceServers = res.iceServers;
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#meu-nome').textContent = nome;
    if (primeiraVez && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    abrirTexto(primeiraVez ? res.canaisTexto[0] : estado.canalTexto);
  });
}

// Reconectou (ex.: queda de internet): entra de novo automaticamente
socket.on('connect', () => { if (estado.eu) entrar(); });
socket.on('disconnect', (motivo) => {
  // o servidor derrubou porque você entrou de novo em outra aba/janela
  if (motivo === 'io server disconnect') avisar('Você entrou em outra janela, então esta foi desconectada. Aperte F5 pra voltar aqui.', 60000);
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
  renderCanais();
  renderMembros();
  renderPainel();
  renderView();
  renderGrid();
}

function avatar(u, { status = false } = {}) {
  const a = el('span', 'avatar', [...u.nome][0]?.toUpperCase() ?? '?');
  a.style.background = u.cor;
  if (u.id) a.dataset.fala = u.id;
  a.classList.toggle('falando', falando.has(u.id));
  if (status) a.append(el('span', 'status-dot'));
  return a;
}

function renderCanais() {
  $('#canais-texto').replaceChildren(...estado.canaisTexto.map((c) => {
    const li = el('li', 'canal');
    li.append(icone('hash'), el('span', null, c));
    li.classList.toggle('ativo', estado.view === 'texto' && c === estado.canalTexto);
    li.classList.toggle('nao-lido', estado.naoLidos.has(c));
    li.onclick = () => abrirTexto(c);
    return li;
  }));

  $('#canais-voz').replaceChildren(...estado.canaisVoz.map((c) => {
    const li = el('li');
    const nome = el('div', 'canal');
    nome.append(icone('voz'), el('span', null, c));
    nome.classList.toggle('ativo', estado.view === 'voz' && c === estado.voz);
    nome.onclick = () => entrarVoz(c);
    const membros = el('ul', 'membros-voz');
    for (const u of estado.usuarios.filter((x) => x.voz === c)) {
      const m = el('li', 'usuario-voz');
      m.append(avatar(u), el('span', 'nome', u.nome));
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

function renderMembros() {
  $('#membros').hidden = !estado.membrosVisiveis || estado.view === 'voz';
  $('#btn-membros').classList.toggle('ativo', estado.membrosVisiveis);
  $('#titulo-online').textContent = `Online — ${estado.usuarios.length}`;
  const ordenados = [...estado.usuarios].sort((a, b) => a.nome.localeCompare(b.nome));
  $('#online').replaceChildren(...ordenados.map((u) => {
    const li = el('li', 'membro');
    const nome = el('span', 'nome', u.nome);
    nome.style.color = u.cor;
    if (u.voz) nome.append(el('span', 'atividade', u.tela ? `Ao vivo em ${u.voz}` : `Em ${u.voz}`));
    li.append(avatar(u, { status: true }), nome);
    return li;
  }));
}

function renderPainel() {
  const meu = estado.usuarios.find((u) => u.id === estado.eu?.id);
  if (meu) $('#meu-avatar').replaceChildren(avatar(meu, { status: true }));
  $('#painel-voz').hidden = !estado.voz;
  $('#nome-canal-voz').textContent = estado.voz ? `${estado.voz} / Amiguinhos Gamer` : '';

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
  $('#titulo-canal').textContent = naVoz ? estado.voz : (estado.canalTexto ?? '');
  $('#topico').textContent = naVoz ? '' : TOPICOS[estado.canalTexto] ?? '';
  $('#input-msg').placeholder = `Conversar em #${estado.canalTexto ?? ''}`;
}

const TOPICOS = {
  geral: 'Papo geral da galera',
  jogos: 'Bora marcar aquela partida',
  memes: 'Só os melhores (ou não)',
};

$$('.categoria').forEach((c) => {
  c.onclick = () => {
    c.classList.toggle('recolhida');
    $(`#${c.dataset.lista}`).hidden = c.classList.contains('recolhida');
  };
});

$('#btn-membros').onclick = () => {
  estado.membrosVisiveis = !estado.membrosVisiveis;
  salvarStorage('membrosVisiveis', estado.membrosVisiveis);
  renderMembros();
};

// menu lateral em tela pequena
$('#btn-menu').onclick = () => $('#app').classList.toggle('menu-aberto');
const fecharMenu = () => $('#app').classList.remove('menu-aberto');

// ---------- chat ----------
let ultimaMsg = null;
const digitando = new Map(); // nome -> timeout

function abrirTexto(canal) {
  estado.canalTexto = canal;
  estado.view = 'texto';
  estado.naoLidos.delete(canal);
  ultimaMsg = null;
  digitando.forEach(clearTimeout);
  digitando.clear();
  renderDigitando();

  const boas = el('div', 'boas-vindas');
  const bola = el('div', 'bola');
  bola.append(icone('hash'));
  boas.append(bola, el('h2', null, `Bem-vindo(a) a #${canal}!`), el('p', null, `Este é o começo do canal #${canal}.`));
  $('#mensagens').replaceChildren(boas);

  socket.emit('historico', canal, (rows) => {
    if (canal !== estado.canalTexto) return;
    rows.forEach(adicionarMensagem);
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

function adicionarMensagem(m) {
  const box = $('#mensagens');
  const pertoDoFim = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const data = new Date(m.criado_em);

  const novoDia = !ultimaMsg || new Date(ultimaMsg.criado_em).toDateString() !== data.toDateString();
  if (novoDia) {
    const div = el('div', 'divisor-data');
    div.append(el('span', null, data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })));
    box.append(div);
  }
  const agrupar = !novoDia && ultimaMsg.autor === m.autor && m.criado_em - ultimaMsg.criado_em < 7 * 60e3;

  const linha = el('div', agrupar ? 'msg' : 'msg inicio');
  if (agrupar) {
    linha.append(el('span', 'hora-lateral', fmtHora(data)), formatarTexto(m.texto));
  } else {
    const cab = el('div', 'cabecalho');
    const autor = el('span', 'autor', m.autor);
    autor.style.color = m.cor;
    cab.append(autor, el('span', 'hora', fmtCabecalho(data)));
    linha.append(avatar({ nome: m.autor, cor: m.cor }), cab, formatarTexto(m.texto));
  }
  box.append(linha);
  ultimaMsg = m;
  if (pertoDoFim || m.autor === estado.eu.nome) rolarProFim();
}

socket.on('mensagem', (m) => {
  if (digitando.has(m.autor)) {
    clearTimeout(digitando.get(m.autor));
    digitando.delete(m.autor);
    renderDigitando();
  }
  if (m.canal === estado.canalTexto) adicionarMensagem(m);
  if (m.canal !== estado.canalTexto || estado.view !== 'texto') {
    estado.naoLidos.add(m.canal);
    renderCanais();
  }
  if (m.autor !== estado.eu.nome && !document.hasFocus() && window.Notification?.permission === 'granted') {
    new Notification(`${m.autor} (#${m.canal})`, { body: UPLOAD_RE.test(m.texto) ? '📷 Imagem' : m.texto, silent: false });
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
      const alvo = Math.round(Math.max(min, Math.min(max, total / n)));
      for (const sender of p.senders[tipo]) {
        if (sender.track?.kind !== 'video') continue;
        const params = sender.getParameters();
        if (!params.encodings?.length) continue; // ainda negociando: tenta de novo ao conectar
        params.encodings[0].maxBitrate = alvo;
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
    if (pc.connectionState === 'connected') ajustarBitrates();
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

async function processarSinal(peer, { description, candidate }, de) {
  const { pc } = peer;
  if (pc.signalingState === 'closed') return;
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

function renderGrid() {
  const grid = $('#grid');
  const desejados = [];

  if (estado.voz) {
    for (const u of estado.usuarios.filter((x) => x.voz === estado.voz)) {
      const local = u.id === estado.eu.id;
      const peer = peers.get(u.id);
      const cam = local ? estado.cam : peer?.streams.get(u.camera);
      const tela = local ? estado.tela : peer?.streams.get(u.tela);
      if (temVideo(tela)) desejados.push({ chave: `${u.id}:tela`, u, tipo: 'tela', stream: tela, local });
      desejados.push({ chave: `${u.id}:cam`, u, tipo: 'cam', stream: temVideo(cam) ? cam : null, local });
    }
  }

  const existentes = new Map([...grid.children].map((t) => [t.dataset.chave, t]));
  for (const d of desejados) {
    let tile = existentes.get(d.chave);
    if (tile) existentes.delete(d.chave);
    else grid.append((tile = criarTile(d)));
    atualizarTile(tile, d);
  }
  for (const t of existentes.values()) t.remove();

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
    vol.max = 1;
    vol.step = 0.05;
    vol.title = d.tipo === 'tela' ? 'Volume da transmissão' : 'Volume do usuário';
    vol.value = volumeDe(d.u.nome, tipoVol);
    vol.oninput = () => {
      volumes[chaveVolume(d.u.nome, tipoVol)] = Number(vol.value);
      salvarStorage('volumes', volumes);
      renderGrid();
    };
    vol.ondblclick = (e) => e.stopPropagation();
    rotulo.append(vol);
  }
  const cheia = el('button', 'btn-cheia');
  cheia.title = 'Tela cheia';
  cheia.append(icone('cheia'));
  cheia.onclick = () => telaCheia(tile);
  rotulo.append(cheia);

  tile.ondblclick = () => telaCheia(tile);
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
  // só o vídeo da tela de outra pessoa toca som; a voz vai pelos <audio>
  video.muted = d.local || d.tipo === 'cam' || estado.surdo;
  video.volume = volumeDe(d.u.nome, 'tela');
  video.classList.toggle('espelhado', d.local && d.tipo === 'cam');
  tile.classList.toggle('com-video', !!d.stream);
  tile.classList.toggle('falando', d.tipo === 'cam' && falando.has(d.u.id));
  tile.style.setProperty('--tile-cor', `color-mix(in srgb, ${d.u.cor} 35%, #1e1f22)`);
  tile.querySelector('.capa').replaceChildren(avatar(d.u));

  const nome = tile.querySelector('.nome-tile');
  nome.replaceChildren();
  if (d.tipo === 'tela') nome.append(el('span', 'badge-vivo', 'AO VIVO'));
  nome.append(d.u.nome + (d.local ? ' (você)' : ''));
  // no seu próprio quadro da tela: o que está sendo capturado de verdade
  if (d.local && d.tipo === 'tela') {
    const { height, frameRate } = d.stream.getVideoTracks()[0]?.getSettings() ?? {};
    if (height) nome.append(el('span', 'info-tela', `${height}p · ${Math.round(frameRate ?? 0)} fps`));
  }
  if (d.tipo === 'cam' && d.u.surdo) nome.append(icone('foneOff'));
  else if (d.tipo === 'cam' && d.u.mudo) nome.append(icone('micOff'));
}

function atualizarAudios() {
  const box = $('#audios');
  const vistos = new Set();
  for (const [id, peer] of peers) {
    const u = estado.usuarios.find((x) => x.id === id);
    const stream = u?.mic && peer.streams.get(u.mic);
    if (!stream) continue;
    vistos.add(id);
    let audio = [...box.children].find((a) => a.dataset.peer === id);
    if (!audio) {
      audio = el('audio');
      audio.autoplay = true;
      audio.dataset.peer = id;
      box.append(audio);
    }
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
      audio.play().catch(() => {});
      monitorarFala(id, stream);
    }
    aplicarSaida(audio);
    audio.muted = estado.surdo;
    audio.volume = volumeDe(u.nome, 'mic');
  }
  for (const audio of [...box.children]) {
    if (!vistos.has(audio.dataset.peer)) {
      audio.remove();
      pararMonitor(audio.dataset.peer);
    }
  }
}

// ---------- configurações ----------
async function abrirConfig() {
  $('#modal-config').hidden = false;
  const lista = (await navigator.mediaDevices?.enumerateDevices()) ?? [];
  const preencher = (sel, tipo, chave) => {
    const opcoes = [new Option('Padrão do sistema', '')];
    lista.filter((d) => d.kind === tipo && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .forEach((d, i) => opcoes.push(new Option(d.label || `Dispositivo ${i + 1}`, d.deviceId)));
    $(sel).replaceChildren(...opcoes);
    $(sel).value = dispositivos[chave];
    if ($(sel).value !== dispositivos[chave]) $(sel).value = '';
  };
  preencher('#cfg-mic', 'audioinput', 'mic');
  preencher('#cfg-saida', 'audiooutput', 'saida');
  preencher('#cfg-cam', 'videoinput', 'cam');
  $('#cfg-resolucao').value = qualidadeTela() === QUALIDADES[transmissao.resolucao] ? transmissao.resolucao : '1080';
  $('#cfg-fps').value = String(fpsTela());

}

$('#btn-trocar-nome').onclick = () => {
  salvarStorage('nome', '');
  location.reload();
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
  $$('#audios audio, .tile.tela video').forEach((m) => m.setSinkId?.(e.target.value).catch(() => {}));
};
async function mudarTransmissao(chave, valor) {
  transmissao[chave] = valor;
  salvarStorage('transmissao', transmissao);
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
  if (e.key === 'Escape') $$('.modal').forEach((m) => (m.hidden = true));
});
