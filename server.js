import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Server } from 'socket.io';

const CANAIS_TEXTO = ['geral', 'jogos', 'memes'];
const CANAIS_VOZ = ['Sala 1', 'Sala 2', 'AFK'];

const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };

function montarIceServers(turn) {
  const lista = [STUN];
  for (const t of [turn, { url: process.env.TURN_URL, usuario: process.env.TURN_USER, senha: process.env.TURN_PASS }]) {
    if (t?.url) lista.push({ urls: t.url.split(',').map((u) => u.trim()), username: t.usuario, credential: t.senha });
  }
  return lista;
}

const raiz = path.dirname(fileURLToPath(import.meta.url));

function corDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.codePointAt(0)) % 360;
  return `hsl(${h} 65% 55%)`;
}

const idDeStream = (v) => (typeof v === 'string' && v.length <= 100 ? v : null);

const MAX_IMAGEM = 10 * 1024 * 1024;

// ---------- contas ----------
const scryptAsync = promisify(scrypt);
const USUARIO_RE = /^[\p{L}\p{N}_.-]{2,24}$/u;

// Nome de exibição: pode ter espaço e ser trocado; espaços repetidos viram um só
function limparNome(nome) {
  nome = String(nome ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  if ([...nome].length < 2 || [...nome].length > 32) return { erro: 'O nome precisa ter de 2 a 32 caracteres' };
  if (!/[\p{L}\p{N}]/u.test(nome)) return { erro: 'O nome precisa ter pelo menos uma letra ou número' };
  return { nome };
}
const MAX_PREFS = 20_000; // bytes do JSON de configurações por conta

async function hashSenha(senha, sal = randomBytes(16)) {
  const hash = await scryptAsync(senha, sal, 64);
  return `${sal.toString('hex')}:${hash.toString('hex')}`;
}
async function conferirSenha(senha, salvo) {
  const [sal, hash] = salvo.split(':');
  const novo = await scryptAsync(senha, Buffer.from(sal, 'hex'), 64);
  return timingSafeEqual(novo, Buffer.from(hash, 'hex'));
}
const hashToken = (token) => createHash('sha256').update(token).digest('hex');

// Freia quem erra a senha várias vezes (por IP): 10 erros a cada 15 minutos
const TENTATIVAS = { max: 10, janela: 15 * 60e3 };
function criarLimitador() {
  const erros = new Map(); // ip -> { n, desde }
  return {
    bloqueado(ip) {
      const e = erros.get(ip);
      if (e && Date.now() - e.desde > TENTATIVAS.janela) erros.delete(ip);
      return (erros.get(ip)?.n ?? 0) >= TENTATIVAS.max;
    },
    errou(ip) {
      const e = erros.get(ip) ?? { n: 0, desde: Date.now() };
      e.n++;
      erros.set(ip, e);
    },
  };
}

// Descobre o tipo pela assinatura do arquivo (não confia no nome)
function extensaoDaImagem(buf) {
  const h = buf.subarray(0, 12);
  if (h[0] === 0x89 && h.toString('ascii', 1, 4) === 'PNG') return 'png';
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'jpg';
  if (h.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/**
 * Sobe o servidor de chat + sinalização da chamada. Usado pelo `node server.js`
 * e pelo app desktop quando você escolhe "Hospedar no meu PC".
 * Se `senha` não for vazia, ela vira o código de convite pedido pra criar conta.
 * `host` = '127.0.0.1' deixa o servidor acessível só pelo próprio PC (ex.: quando usa túnel).
 * `turn` = { url, usuario, senha } opcional, pra quem não consegue conectar a chamada direto.
 */
export function iniciarServidor({ porta = 3000, senha = '', pastaDados = path.join(raiz, 'data'), host, turn } = {}) {
  const ICE_SERVERS = montarIceServers(turn);

  // ---------- banco de mensagens ----------
  fs.mkdirSync(pastaDados, { recursive: true });
  const db = new DatabaseSync(path.join(pastaDados, 'chat.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS mensagens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      canal TEXT NOT NULL,
      autor TEXT NOT NULL,
      cor TEXT NOT NULL,
      texto TEXT NOT NULL,
      criado_em INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mensagens_canal ON mensagens (canal, id);
    CREATE TABLE IF NOT EXISTS contas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
      senha TEXT NOT NULL,
      prefs TEXT NOT NULL DEFAULT '{}',
      criado_em INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessoes (
      token TEXT PRIMARY KEY,
      conta INTEGER NOT NULL REFERENCES contas (id) ON DELETE CASCADE,
      criado_em INTEGER NOT NULL
    );
  `);
  // Contas criadas antes do nome de exibição existir: o nome começa igual ao usuário
  if (!db.prepare('PRAGMA table_info(contas)').all().some((c) => c.name === 'nome')) {
    db.exec('ALTER TABLE contas ADD COLUMN nome TEXT');
  }
  db.exec(`
    UPDATE contas SET nome = usuario WHERE nome IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_nome ON contas (nome COLLATE NOCASE);
  `);
  const sql = {
    criarConta: db.prepare('INSERT INTO contas (usuario, nome, senha, criado_em) VALUES (?, ?, ?, ?)'),
    contaPorUsuario: db.prepare('SELECT * FROM contas WHERE usuario = ?'),
    contaPorNome: db.prepare('SELECT * FROM contas WHERE nome = ? COLLATE NOCASE'),
    trocarNome: db.prepare('UPDATE contas SET nome = ? WHERE id = ?'),
    renomearMensagens: db.prepare('UPDATE mensagens SET autor = ?, cor = ? WHERE autor = ?'),
    contaPorToken: db.prepare('SELECT contas.* FROM sessoes JOIN contas ON contas.id = sessoes.conta WHERE sessoes.token = ?'),
    criarSessao: db.prepare('INSERT INTO sessoes (token, conta, criado_em) VALUES (?, ?, ?)'),
    apagarSessao: db.prepare('DELETE FROM sessoes WHERE token = ?'),
    salvarPrefs: db.prepare('UPDATE contas SET prefs = ? WHERE id = ?'),
  };
  const limitador = criarLimitador();

  function novaSessao(contaId) {
    const token = randomBytes(32).toString('base64url');
    sql.criarSessao.run(hashToken(token), contaId, Date.now());
    return token;
  }
  const inserirMensagem = db.prepare(
    'INSERT INTO mensagens (canal, autor, cor, texto, criado_em) VALUES (?, ?, ?, ?, ?)'
  );
  const buscarHistorico = db.prepare(
    'SELECT * FROM (SELECT * FROM mensagens WHERE canal = ? ORDER BY id DESC LIMIT 100) ORDER BY id'
  );

  const pastaUploads = path.join(pastaDados, 'uploads');
  fs.mkdirSync(pastaUploads, { recursive: true });

  // ---------- servidor ----------
  const app = express();
  app.use(express.static(path.join(raiz, 'public')));
  app.use('/uploads', express.static(pastaUploads, { maxAge: '30d', immutable: true }));

  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: MAX_IMAGEM + 64 * 1024 });

  const usuarios = new Map(); // socket.id -> usuário

  function emitirPresenca() {
    io.to('todos').emit('presenca', [...usuarios.values()].map(({ conta, ...u }) => u));
  }

  io.on('connection', (socket) => {
    const eu = () => usuarios.get(socket.id);

    const ip = String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address).split(',')[0].trim();

    // O que a tela de login precisa saber antes de entrar
    socket.on('servidor:info', (ack) => {
      if (typeof ack === 'function') ack({ pedeConvite: !!senha });
    });

    socket.on('conta:criar', async ({ usuario, nome, senha: senhaConta, convite } = {}, ack) => {
      if (typeof ack !== 'function') return;
      usuario = String(usuario ?? '').trim();
      senhaConta = String(senhaConta ?? '');
      if (!USUARIO_RE.test(usuario)) return ack({ erro: 'O usuário precisa ter de 2 a 24 letras, números, ponto, traço ou _' });
      if (senhaConta.length < 6) return ack({ erro: 'A senha precisa ter pelo menos 6 caracteres' });
      if (senhaConta.length > 200) return ack({ erro: 'Senha comprida demais' });
      if (limitador.bloqueado(ip)) return ack({ erro: 'Muitas tentativas. Espera uns minutos e tenta de novo.' });
      if (senha && convite !== senha) {
        limitador.errou(ip);
        return ack({ erro: 'Código de convite errado' });
      }
      const limpo = limparNome(String(nome ?? '').trim() || usuario);
      if (limpo.erro) return ack({ erro: limpo.erro });
      if (sql.contaPorUsuario.get(usuario)) return ack({ erro: `O usuário "${usuario}" já existe. Escolhe outro ou entra com ele.` });
      if (sql.contaPorNome.get(limpo.nome)) return ack({ erro: `Já tem alguém chamado "${limpo.nome}". Escolhe outro nome de exibição.` });
      const { lastInsertRowid } = sql.criarConta.run(usuario, limpo.nome, await hashSenha(senhaConta), Date.now());
      ack({ token: novaSessao(Number(lastInsertRowid)) });
    });

    socket.on('conta:entrar', async ({ usuario, senha: senhaConta } = {}, ack) => {
      if (typeof ack !== 'function') return;
      if (limitador.bloqueado(ip)) return ack({ erro: 'Muitas tentativas. Espera uns minutos e tenta de novo.' });
      const conta = sql.contaPorUsuario.get(String(usuario ?? '').trim());
      if (!conta || !(await conferirSenha(String(senhaConta ?? ''), conta.senha))) {
        limitador.errou(ip);
        return ack({ erro: 'Usuário ou senha errados' });
      }
      ack({ token: novaSessao(conta.id) });
    });

    socket.on('conta:sair', (token) => {
      if (typeof token === 'string') sql.apagarSessao.run(hashToken(token));
      socket.disconnect(true);
    });

    socket.on('conta:nome', (novo, ack) => {
      const u = eu();
      if (!u || typeof ack !== 'function') return;
      const limpo = limparNome(novo);
      if (limpo.erro) return ack({ erro: limpo.erro });
      const dono = sql.contaPorNome.get(limpo.nome);
      if (dono && dono.id !== u.conta) return ack({ erro: `Já tem alguém chamado "${limpo.nome}"` });
      const antigo = u.nome;
      const cor = corDoNome(limpo.nome);
      sql.trocarNome.run(limpo.nome, u.conta);
      sql.renomearMensagens.run(limpo.nome, cor, antigo);
      Object.assign(u, { nome: limpo.nome, cor });
      io.to('todos').emit('renomeado', { de: antigo, para: limpo.nome });
      emitirPresenca();
      ack({ nome: limpo.nome });
    });

    socket.on('prefs', (prefs) => {
      const u = eu();
      if (!u || typeof prefs !== 'object' || prefs === null) return;
      const json = JSON.stringify(prefs);
      if (json.length <= MAX_PREFS) sql.salvarPrefs.run(json, u.conta);
    });

    socket.on('entrar', ({ token } = {}, ack) => {
      if (typeof ack !== 'function') return;
      const conta = typeof token === 'string' && sql.contaPorToken.get(hashToken(token));
      if (!conta) return ack({ erro: 'Sua sessão expirou. Entra de novo.', sessaoInvalida: true });
      const nome = conta.nome;

      // A mesma conta aberta em outro lugar (ou reconectando antes do servidor perceber a queda): derruba a velha
      for (const o of [...usuarios.values()]) {
        if (o.conta === conta.id && o.id !== socket.id) {
          usuarios.delete(o.id);
          io.sockets.sockets.get(o.id)?.disconnect(true);
        }
      }

      usuarios.set(socket.id, {
        conta: conta.id,
        id: socket.id,
        nome,
        cor: corDoNome(nome),
        voz: null,
        mudo: false,
        surdo: false,
        mic: null,
        camera: null,
        tela: null,
      });
      socket.join('todos');
      ack({ id: socket.id, nome, usuario: conta.usuario, prefs: JSON.parse(conta.prefs), canaisTexto: CANAIS_TEXTO, canaisVoz: CANAIS_VOZ, iceServers: ICE_SERVERS });
      emitirPresenca();
    });

    socket.on('historico', (canal, ack) => {
      if (!eu() || typeof ack !== 'function' || !CANAIS_TEXTO.includes(canal)) return;
      ack(buscarHistorico.all(canal));
    });

    socket.on('mensagem', ({ canal, texto } = {}) => {
      const u = eu();
      if (!u || !CANAIS_TEXTO.includes(canal)) return;
      texto = String(texto ?? '').trim().slice(0, 2000);
      if (!texto) return;
      const criado_em = Date.now();
      const { lastInsertRowid } = inserirMensagem.run(canal, u.nome, u.cor, texto, criado_em);
      io.to('todos').emit('mensagem', {
        id: Number(lastInsertRowid),
        canal,
        autor: u.nome,
        cor: u.cor,
        texto,
        criado_em,
      });
    });

    socket.on('imagem', ({ canal, dados } = {}, ack) => {
      const u = eu();
      if (!u || !CANAIS_TEXTO.includes(canal) || typeof ack !== 'function') return;
      if (!Buffer.isBuffer(dados) || !dados.length) return ack({ erro: 'Imagem vazia' });
      if (dados.length > MAX_IMAGEM) return ack({ erro: 'Imagem grande demais (máx. 10 MB)' });
      const ext = extensaoDaImagem(dados);
      if (!ext) return ack({ erro: 'Só dá pra mandar PNG, JPG, GIF ou WEBP' });

      const arquivo = `${randomBytes(12).toString('hex')}.${ext}`;
      fs.writeFile(path.join(pastaUploads, arquivo), dados, (err) => {
        if (err) return ack({ erro: 'Não consegui salvar a imagem' });
        const texto = `/uploads/${arquivo}`;
        const criado_em = Date.now();
        const { lastInsertRowid } = inserirMensagem.run(canal, u.nome, u.cor, texto, criado_em);
        io.to('todos').emit('mensagem', { id: Number(lastInsertRowid), canal, autor: u.nome, cor: u.cor, texto, criado_em });
        ack({});
      });
    });

    socket.on('digitando', (canal) => {
      const u = eu();
      if (!u || !CANAIS_TEXTO.includes(canal)) return;
      socket.to('todos').emit('digitando', { canal, nome: u.nome });
    });

    // ---------- voz ----------
    socket.on('voz:entrar', (canal, ack) => {
      const u = eu();
      if (!u || !CANAIS_VOZ.includes(canal) || typeof ack !== 'function') return;
      u.voz = canal;
      u.camera = null;
      u.tela = null;
      const outros = [...usuarios.values()].filter((o) => o.voz === canal && o.id !== u.id).map((o) => o.id);
      emitirPresenca();
      ack(outros);
    });

    socket.on('voz:sair', () => {
      const u = eu();
      if (!u) return;
      Object.assign(u, { voz: null, mic: null, camera: null, tela: null });
      emitirPresenca();
    });

    socket.on('estado', (s = {}) => {
      const u = eu();
      if (!u) return;
      u.mudo = !!s.mudo;
      u.surdo = !!s.surdo;
      u.mic = idDeStream(s.mic);
      u.camera = idDeStream(s.camera);
      u.tela = idDeStream(s.tela);
      emitirPresenca();
    });

    // Repassa oferta/resposta/ICE do WebRTC entre quem está na mesma sala de voz
    socket.on('sinal', ({ para, dados } = {}) => {
      const u = eu();
      const alvo = usuarios.get(para);
      if (!u?.voz || alvo?.voz !== u.voz) return;
      io.to(para).emit('sinal', { de: socket.id, dados });
    });

    socket.on('disconnect', () => {
      if (usuarios.delete(socket.id)) emitirPresenca();
    });
  });

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(porta, host, () => {
      resolve({
        porta,
        host,
        fechar: () => new Promise((r) => { io.close(); db.close(); r(); }),
      });
    });
  });
}

// Rodando direto: `node server.js`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const porta = Number(process.env.PORT) || 3000;
  const senha = process.env.SENHA || '';
  // HOST=127.0.0.1 quando fica atrás de um proxy (Caddy); DADOS = pasta do chat.db e das imagens
  const host = process.env.HOST || undefined;
  const pastaDados = process.env.DADOS || undefined;
  await iniciarServidor({ porta, senha, host, pastaDados });
  console.log(`Concord rodando em http://${host ?? 'localhost'}:${porta}`);
  if (senha) console.log('Senha de entrada ativada.');
}
