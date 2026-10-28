import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Server } from 'socket.io';

// Canais de todo servidor novo; depois os admins mudam pelo app
const CANAIS_NOVO_SERVIDOR = [
  { tipo: 'texto', nome: 'geral', topico: 'Papo geral da galera' },
  { tipo: 'voz', nome: 'Sala 1' },
  { tipo: 'voz', nome: 'Sala 2' },
];
// Nome do servidor que nasce dos dados da época em que só existia um
const NOME_SERVIDOR_PADRAO = 'Amiguinhos Gamer';
const MAX_SERVIDORES_POR_CONTA = 10;
const MAX_CANAIS = 50;
// Convite: 8 letras/números sem os que se confundem (0/O, 1/I/l)
const LETRAS_CONVITE = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Aceita o código puro ou o link inteiro (…/?convite=CODIGO)
const limparConvite = (v) => String(v ?? '').trim().match(/(?:convite=)?([A-Za-z0-9]{6,16})\/?$/)?.[1] ?? '';

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
const corDaConta = (conta) => conta.cor || corDoNome(conta.nome);

const idDeStream = (v) => (typeof v === 'string' && v.length <= 100 ? v : null);

const MAX_IMAGEM = 10 * 1024 * 1024;
const MAX_TEXTO = 2000;
const MAX_BIO = 190;
const COR_RE = /^#[0-9a-f]{6}$/i;

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

// Canal de texto vira "minusculo-com-traco" (igual ao Discord); de voz aceita espaço
function limparNomeCanal(tipo, nome) {
  nome = String(nome ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  if (tipo === 'texto') nome = nome.toLowerCase().replace(/ /g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/g, '-');
  if (!nome || [...nome].length > 32) return { erro: 'O nome do canal precisa ter de 1 a 32 caracteres' };
  return { nome };
}
function limparNomeServidor(nome) {
  nome = String(nome ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!nome || [...nome].length > 40) return { erro: 'O nome do servidor precisa ter de 1 a 40 caracteres' };
  return { nome };
}
const MAX_PREFS = 20_000; // bytes do JSON de configurações por conta
const MAX_PREVIA = 200_000; // miniatura da transmissão (data URL jpeg)
const PREVIA_RE = /^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

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
 * Se `senha` não for vazia, criar conta pede ela ou o convite de algum servidor daqui.
 * `host` = '127.0.0.1' deixa o servidor acessível só pelo próprio PC (ex.: quando usa túnel).
 * `turn` = { url, usuario, senha } opcional, pra quem não consegue conectar a chamada direto.
 */
export function iniciarServidor({ porta = 3000, senha = '', pastaDados = path.join(raiz, 'data'), host, turn } = {}) {
  const ICE_SERVERS = montarIceServers(turn);

  // ---------- banco ----------
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
    CREATE TABLE IF NOT EXISTS canais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      nome TEXT NOT NULL,
      topico TEXT NOT NULL DEFAULT '',
      posicao INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS servidores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      icone TEXT,
      dono INTEGER,
      convite TEXT NOT NULL UNIQUE,
      criado_em INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS membros (
      servidor INTEGER NOT NULL,
      conta INTEGER NOT NULL,
      admin INTEGER NOT NULL DEFAULT 0,
      entrou_em INTEGER NOT NULL,
      PRIMARY KEY (servidor, conta)
    );
  `);
  // Colunas que chegaram depois: bancos antigos ganham elas sem perder nada
  const colunasNovas = {
    contas: { nome: 'TEXT', cor: 'TEXT', avatar: 'TEXT', bio: "TEXT NOT NULL DEFAULT ''", admin: 'INTEGER NOT NULL DEFAULT 0' },
    mensagens: { conta: 'INTEGER', editado_em: 'INTEGER', fixada: 'INTEGER NOT NULL DEFAULT 0', canal_id: 'INTEGER' },
    canais: { servidor: 'INTEGER' },
  };
  for (const [tabela, colunas] of Object.entries(colunasNovas)) {
    const existentes = new Set(db.prepare(`PRAGMA table_info(${tabela})`).all().map((c) => c.name));
    for (const [coluna, tipo] of Object.entries(colunas)) {
      if (!existentes.has(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    }
  }
  db.exec(`
    UPDATE contas SET nome = usuario WHERE nome IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_contas_nome ON contas (nome COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_mensagens_canal_id ON mensagens (canal_id, id);
    CREATE INDEX IF NOT EXISTS idx_mensagens_fixadas_id ON mensagens (canal_id, fixada);
    CREATE INDEX IF NOT EXISTS idx_membros_conta ON membros (conta);
  `);
  const novoConvite = () => {
    for (;;) {
      const codigo = [...randomBytes(8)].map((b) => LETRAS_CONVITE[b % LETRAS_CONVITE.length]).join('');
      if (!db.prepare('SELECT 1 FROM servidores WHERE convite = ?').get(codigo)) return codigo;
    }
  };
  migrarServidorUnico(db, novoConvite);

  const sql = {
    criarConta: db.prepare('INSERT INTO contas (usuario, nome, senha, criado_em) VALUES (?, ?, ?, ?)'),
    contaPorId: db.prepare('SELECT * FROM contas WHERE id = ?'),
    contaPorUsuario: db.prepare('SELECT * FROM contas WHERE usuario = ?'),
    contaPorNome: db.prepare('SELECT * FROM contas WHERE nome = ? COLLATE NOCASE'),
    contaPorToken: db.prepare('SELECT contas.* FROM sessoes JOIN contas ON contas.id = sessoes.conta WHERE sessoes.token = ?'),
    trocarNome: db.prepare('UPDATE contas SET nome = ? WHERE id = ?'),
    trocarPerfil: db.prepare('UPDATE contas SET cor = ?, bio = ? WHERE id = ?'),
    trocarAvatar: db.prepare('UPDATE contas SET avatar = ? WHERE id = ?'),
    renomearMensagens: db.prepare('UPDATE mensagens SET autor = ?, cor = ? WHERE autor = ?'),
    recolorirMensagens: db.prepare('UPDATE mensagens SET cor = ? WHERE autor = ?'),
    criarSessao: db.prepare('INSERT INTO sessoes (token, conta, criado_em) VALUES (?, ?, ?)'),
    apagarSessao: db.prepare('DELETE FROM sessoes WHERE token = ?'),
    salvarPrefs: db.prepare('UPDATE contas SET prefs = ? WHERE id = ?'),

    servidor: db.prepare('SELECT * FROM servidores WHERE id = ?'),
    servidorPorConvite: db.prepare('SELECT * FROM servidores WHERE convite = ?'),
    servidoresDa: db.prepare(`SELECT s.* FROM servidores s JOIN membros m ON m.servidor = s.id
      WHERE m.conta = ? ORDER BY m.entrou_em, s.id`),
    criarServidor: db.prepare('INSERT INTO servidores (nome, dono, convite, criado_em) VALUES (?, ?, ?, ?)'),
    editarServidor: db.prepare('UPDATE servidores SET nome = ? WHERE id = ?'),
    iconeServidor: db.prepare('UPDATE servidores SET icone = ? WHERE id = ?'),
    conviteServidor: db.prepare('UPDATE servidores SET convite = ? WHERE id = ?'),
    apagarServidor: db.prepare('DELETE FROM servidores WHERE id = ?'),
    membro: db.prepare('SELECT * FROM membros WHERE servidor = ? AND conta = ?'),
    contasMembros: db.prepare('SELECT conta FROM membros WHERE servidor = ?'),
    perfis: db.prepare(`SELECT c.id, c.nome, c.cor, c.avatar, c.bio, m.admin FROM membros m JOIN contas c ON c.id = m.conta
      WHERE m.servidor = ? ORDER BY c.nome COLLATE NOCASE`),
    entrarServidor: db.prepare('INSERT OR IGNORE INTO membros (servidor, conta, admin, entrou_em) VALUES (?, ?, ?, ?)'),
    sairServidor: db.prepare('DELETE FROM membros WHERE servidor = ? AND conta = ?'),
    apagarMembros: db.prepare('DELETE FROM membros WHERE servidor = ?'),
    definirAdmin: db.prepare('UPDATE membros SET admin = ? WHERE servidor = ? AND conta = ?'),

    inserirMensagem: db.prepare('INSERT INTO mensagens (canal, canal_id, autor, cor, texto, criado_em, conta) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    historico: db.prepare('SELECT * FROM (SELECT * FROM mensagens WHERE canal_id = ? ORDER BY id DESC LIMIT 100) ORDER BY id'),
    fixadas: db.prepare('SELECT * FROM mensagens WHERE canal_id = ? AND fixada = 1 ORDER BY id DESC'),
    mensagem: db.prepare('SELECT * FROM mensagens WHERE id = ?'),
    editarMensagem: db.prepare('UPDATE mensagens SET texto = ?, editado_em = ? WHERE id = ?'),
    apagarMensagem: db.prepare('DELETE FROM mensagens WHERE id = ?'),
    fixarMensagem: db.prepare('UPDATE mensagens SET fixada = ? WHERE id = ?'),

    canaisDo: db.prepare('SELECT * FROM canais WHERE servidor = ? ORDER BY posicao, id'),
    canal: db.prepare('SELECT * FROM canais WHERE id = ?'),
    canalPorNome: db.prepare('SELECT * FROM canais WHERE servidor = ? AND tipo = ? AND nome = ? COLLATE NOCASE'),
    criarCanal: db.prepare(`INSERT INTO canais (servidor, tipo, nome, topico, posicao)
      VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(posicao), 0) + 1 FROM canais WHERE servidor = ?))`),
    editarCanal: db.prepare('UPDATE canais SET nome = ?, topico = ? WHERE id = ?'),
    posicaoCanal: db.prepare('UPDATE canais SET posicao = ? WHERE id = ?'),
    apagarCanal: db.prepare('DELETE FROM canais WHERE id = ?'),
    apagarMensagensDoCanal: db.prepare('DELETE FROM mensagens WHERE canal_id = ?'),
  };
  const limitador = criarLimitador();

  function novaSessao(contaId) {
    const token = randomBytes(32).toString('base64url');
    sql.criarSessao.run(hashToken(token), contaId, Date.now());
    return token;
  }

  const pastaUploads = path.join(pastaDados, 'uploads');
  fs.mkdirSync(pastaUploads, { recursive: true });

  // Valida e grava uma imagem enviada; devolve { url } ou { erro }
  async function salvarImagem(dados) {
    if (!Buffer.isBuffer(dados) || !dados.length) return { erro: 'Imagem vazia' };
    if (dados.length > MAX_IMAGEM) return { erro: 'Imagem grande demais (máx. 10 MB)' };
    const ext = extensaoDaImagem(dados);
    if (!ext) return { erro: 'Só dá pra mandar PNG, JPG, GIF ou WEBP' };
    const arquivo = `${randomBytes(12).toString('hex')}.${ext}`;
    try {
      await fs.promises.writeFile(path.join(pastaUploads, arquivo), dados);
    } catch {
      return { erro: 'Não consegui salvar a imagem' };
    }
    return { url: `/uploads/${arquivo}` };
  }

  // ---------- servidores (nome, ícone, canais, membros) ----------
  const canaisDe = (srv, tipo) => sql.canaisDo.all(srv).filter((c) => c.tipo === tipo);
  const ehMembro = (srv, conta) => !!sql.membro.get(srv, conta);
  const ehAdminDe = (srv, conta) => {
    const s = sql.servidor.get(srv);
    return !!s && (s.dono === conta || !!sql.membro.get(srv, conta)?.admin);
  };
  // Canal de um servidor do qual a conta participa (ou null)
  function canalDoMembro(id, conta, tipo) {
    const c = sql.canal.get(Number(id));
    if (!c || (tipo && c.tipo !== tipo) || !ehMembro(c.servidor, conta)) return null;
    return c;
  }

  const resumoServidor = ({ id, nome, icone, dono }) => ({ id, nome, icone, dono });
  function estadoServidor(id) {
    const s = sql.servidor.get(id);
    return {
      ...resumoServidor(s),
      convite: s.convite,
      canais: sql.canaisDo.all(id).map(({ id: cid, tipo, nome, topico }) => ({ id: cid, tipo, nome, topico })),
    };
  }
  function perfisDo(id) {
    const dono = sql.servidor.get(id)?.dono;
    return sql.perfis.all(id).map((p) => ({ ...p, cor: corDaConta(p), admin: !!p.admin || p.id === dono, dono: p.id === dono }));
  }
  // Mensagem como o cliente vê: `canal` é o id do canal
  const msgPublica = (m, servidor = sql.canal.get(m.canal_id)?.servidor) => ({
    id: m.id, canal: m.canal_id, servidor, autor: m.autor, cor: m.cor, texto: m.texto,
    criado_em: m.criado_em, conta: m.conta, editado_em: m.editado_em, fixada: m.fixada,
  });

  function criarServidor(nome, dono) {
    const { lastInsertRowid } = sql.criarServidor.run(nome, dono, novoConvite(), Date.now());
    const id = Number(lastInsertRowid);
    sql.entrarServidor.run(id, dono, 1, Date.now());
    CANAIS_NOVO_SERVIDOR.forEach((c) => sql.criarCanal.run(id, c.tipo, c.nome, c.topico ?? '', id));
    return id;
  }

  // ---------- servidor ----------
  const app = express();
  app.use(express.static(path.join(raiz, 'public')));
  app.use('/uploads', express.static(pastaUploads, { maxAge: '30d', immutable: true }));

  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: MAX_IMAGEM + 64 * 1024 });

  const usuarios = new Map(); // socket.id -> usuário
  const previas = new Map(); // socket.id -> miniatura da tela que a pessoa está transmitindo
  const sala = (srv) => `s:${srv}`;

  // Cada um vê quem é do servidor aberto + quem está na mesma call (que pode ser de outro servidor)
  const publico = ({ id, conta, nome, cor, voz, mudo, surdo, mic, camera, tela }) => ({ id, conta, nome, cor, voz, mudo, surdo, mic, camera, tela });
  function emitirPresenca() {
    const membrosDe = new Map();
    const membrosDoServidor = (srv) => {
      if (!membrosDe.has(srv)) membrosDe.set(srv, new Set(sql.contasMembros.all(srv).map((m) => m.conta)));
      return membrosDe.get(srv);
    };
    const todos = [...usuarios.values()];
    for (const eu of todos) {
      const membros = eu.servidor ? membrosDoServidor(eu.servidor) : new Set();
      const lista = todos.filter((o) => membros.has(o.conta) || (eu.voz && o.voz === eu.voz)).map(publico);
      io.to(eu.id).emit('presenca', lista);
    }
  }
  const emitirServidor = (srv) => io.to(sala(srv)).emit('servidor', estadoServidor(srv));
  const emitirPerfis = (srv) => io.to(sala(srv)).emit('perfis', { servidor: srv, perfis: perfisDo(srv) });
  const emitirPerfisDaConta = (conta) => sql.servidoresDa.all(conta).forEach((s) => emitirPerfis(s.id));
  const socketsDaConta = (conta) => [...usuarios.values()].filter((u) => u.conta === conta).map((u) => io.sockets.sockets.get(u.id)).filter(Boolean);
  // Lista de servidores (barra da esquerda) de uma conta
  function emitirServidores(conta) {
    const lista = sql.servidoresDa.all(conta).map(resumoServidor);
    socketsDaConta(conta).forEach((s) => s.emit('servidores', lista));
  }
  // Tira da call quem estava num canal de voz que deixou de existir / que a pessoa não pode mais ver
  function tirarDaVoz(filtro) {
    for (const o of usuarios.values()) {
      if (o.voz != null && filtro(o)) {
        Object.assign(o, { voz: null, mic: null, camera: null, tela: null });
        previas.delete(o.id);
        io.to(o.id).emit('voz:expulso');
      }
    }
  }

  io.on('connection', (socket) => {
    const eu = () => usuarios.get(socket.id);
    // Registra um evento que exige estar logado; `ack` sempre existe (no-op se o cliente não mandou)
    const quando = (evento, fn) =>
      socket.on(evento, async (dados, ack) => {
        if (typeof ack !== 'function') ack = () => {};
        const u = eu();
        if (!u) return ack({ erro: 'Entra primeiro' });
        try {
          await fn(u, dados, ack);
        } catch (err) {
          console.error(`Erro em ${evento}`, err);
          ack({ erro: 'Deu ruim no servidor' });
        }
      });
    // Ações de admin no servidor aberto
    const quandoAdmin = (evento, fn) =>
      quando(evento, (u, dados, ack) => {
        if (!u.servidor || !ehAdminDe(u.servidor, u.conta)) return ack({ erro: 'Só admin pode fazer isso' });
        return fn(u, dados, ack, u.servidor);
      });

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
      // o código pode ser o do servidor (SENHA) ou o convite de qualquer servidor daqui
      const servidorConvite = sql.servidorPorConvite.get(limparConvite(convite));
      if (senha && convite !== senha && !servidorConvite) {
        limitador.errou(ip);
        return ack({ erro: 'Código de convite errado' });
      }
      const limpo = limparNome(String(nome ?? '').trim() || usuario);
      if (limpo.erro) return ack({ erro: limpo.erro });
      if (sql.contaPorUsuario.get(usuario)) return ack({ erro: `O usuário "${usuario}" já existe. Escolhe outro ou entra com ele.` });
      if (sql.contaPorNome.get(limpo.nome)) return ack({ erro: `Já tem alguém chamado "${limpo.nome}". Escolhe outro nome de exibição.` });
      const { lastInsertRowid } = sql.criarConta.run(usuario, limpo.nome, await hashSenha(senhaConta), Date.now());
      const conta = Number(lastInsertRowid);
      if (servidorConvite) {
        sql.entrarServidor.run(servidorConvite.id, conta, 0, Date.now());
        emitirPerfis(servidorConvite.id);
      }
      ack({ token: novaSessao(conta) });
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

    socket.on('entrar', ({ token } = {}, ack) => {
      if (typeof ack !== 'function') return;
      const conta = typeof token === 'string' && sql.contaPorToken.get(hashToken(token));
      if (!conta) return ack({ erro: 'Sua sessão expirou. Entra de novo.', sessaoInvalida: true });

      // A mesma conta aberta em outro lugar (ou reconectando antes do servidor perceber a queda): derruba a velha
      for (const o of [...usuarios.values()]) {
        if (o.conta === conta.id && o.id !== socket.id) {
          usuarios.delete(o.id);
          previas.delete(o.id);
          io.sockets.sockets.get(o.id)?.disconnect(true);
        }
      }

      usuarios.set(socket.id, {
        conta: conta.id,
        id: socket.id,
        nome: conta.nome,
        cor: corDaConta(conta),
        servidor: null, // servidor aberto na tela
        voz: null, // id do canal de voz
        mudo: false,
        surdo: false,
        mic: null,
        camera: null,
        tela: null,
      });
      socket.join('todos');
      const servidores = sql.servidoresDa.all(conta.id);
      servidores.forEach((s) => socket.join(sala(s.id)));
      ack({
        id: socket.id,
        conta: conta.id,
        nome: conta.nome,
        usuario: conta.usuario,
        prefs: JSON.parse(conta.prefs),
        servidores: servidores.map(resumoServidor),
        iceServers: ICE_SERVERS,
      });
      emitirPresenca();
    });

    // ---------- servidores ----------
    quando('servidor:abrir', (u, id, ack) => {
      id = Number(id);
      if (!ehMembro(id, u.conta)) return ack({ erro: 'Você não está nesse servidor' });
      u.servidor = id;
      ack({ servidor: estadoServidor(id), perfis: perfisDo(id) });
      emitirPresenca();
    });

    quando('servidor:criar', (u, { nome } = {}, ack) => {
      const limpo = limparNomeServidor(nome);
      if (limpo.erro) return ack(limpo);
      if (sql.servidoresDa.all(u.conta).filter((s) => s.dono === u.conta).length >= MAX_SERVIDORES_POR_CONTA) {
        return ack({ erro: `Dá pra ser dono de no máximo ${MAX_SERVIDORES_POR_CONTA} servidores` });
      }
      const id = criarServidor(limpo.nome, u.conta);
      socketsDaConta(u.conta).forEach((s) => s.join(sala(id)));
      emitirServidores(u.conta);
      ack({ id });
    });

    quando('servidor:entrar', (u, { convite } = {}, ack) => {
      if (limitador.bloqueado(ip)) return ack({ erro: 'Muitas tentativas. Espera uns minutos e tenta de novo.' });
      const s = sql.servidorPorConvite.get(limparConvite(convite));
      if (!s) {
        limitador.errou(ip);
        return ack({ erro: 'Convite inválido ou expirado' });
      }
      if (!ehMembro(s.id, u.conta)) {
        sql.entrarServidor.run(s.id, u.conta, 0, Date.now());
        socketsDaConta(u.conta).forEach((so) => so.join(sala(s.id)));
        emitirServidores(u.conta);
        emitirPerfis(s.id);
        emitirPresenca();
      }
      ack({ id: s.id });
    });

    quando('servidor:sair', (u, id, ack) => {
      const s = sql.servidor.get(Number(id));
      if (!s || !ehMembro(s.id, u.conta)) return ack({ erro: 'Você não está nesse servidor' });
      if (s.dono === u.conta) return ack({ erro: 'Você é o dono: pra sair, apague o servidor' });
      sql.sairServidor.run(s.id, u.conta);
      socketsDaConta(u.conta).forEach((so) => so.leave(sala(s.id)));
      const canaisVoz = new Set(canaisDe(s.id, 'voz').map((c) => c.id));
      tirarDaVoz((o) => o.conta === u.conta && canaisVoz.has(o.voz));
      for (const o of usuarios.values()) if (o.conta === u.conta && o.servidor === s.id) o.servidor = null;
      emitirServidores(u.conta);
      emitirPerfis(s.id);
      emitirPresenca();
      ack({});
    });

    quando('servidor:apagar', (u, id, ack) => {
      const s = sql.servidor.get(Number(id));
      if (!s || s.dono !== u.conta) return ack({ erro: 'Só o dono pode apagar o servidor' });
      const contas = sql.contasMembros.all(s.id).map((m) => m.conta);
      const canais = sql.canaisDo.all(s.id);
      const canaisVoz = new Set(canais.filter((c) => c.tipo === 'voz').map((c) => c.id));
      tirarDaVoz((o) => canaisVoz.has(o.voz));
      canais.forEach((c) => {
        sql.apagarMensagensDoCanal.run(c.id);
        sql.apagarCanal.run(c.id);
      });
      sql.apagarMembros.run(s.id);
      sql.apagarServidor.run(s.id);
      io.to(sala(s.id)).emit('servidor:removido', { id: s.id, nome: s.nome });
      io.in(sala(s.id)).socketsLeave(sala(s.id));
      for (const o of usuarios.values()) if (o.servidor === s.id) o.servidor = null;
      contas.forEach(emitirServidores);
      emitirPresenca();
      ack({});
    });

    quandoAdmin('servidor:editar', (u, { nome } = {}, ack, srv) => {
      const limpo = limparNomeServidor(nome);
      if (limpo.erro) return ack(limpo);
      sql.editarServidor.run(limpo.nome, srv);
      emitirServidor(srv);
      ack({});
    });

    quandoAdmin('servidor:icone', async (u, dados, ack, srv) => {
      if (dados === null) {
        sql.iconeServidor.run(null, srv);
      } else {
        const r = await salvarImagem(dados);
        if (r.erro) return ack(r);
        sql.iconeServidor.run(r.url, srv);
      }
      emitirServidor(srv);
      ack({});
    });

    quandoAdmin('servidor:novo-convite', (u, _, ack, srv) => {
      sql.conviteServidor.run(novoConvite(), srv);
      emitirServidor(srv);
      ack({});
    });

    quandoAdmin('admin:definir', (u, { conta, admin } = {}, ack, srv) => {
      conta = Number(conta);
      if (!ehMembro(srv, conta)) return ack({ erro: 'Essa pessoa não está no servidor' });
      if (sql.servidor.get(srv).dono === conta) return ack({ erro: 'O dono é sempre admin' });
      sql.definirAdmin.run(admin ? 1 : 0, srv, conta);
      emitirPerfis(srv);
      ack({});
    });

    // ---------- perfil ----------
    quando('prefs', (u, prefs) => {
      if (typeof prefs !== 'object' || prefs === null) return;
      const json = JSON.stringify(prefs);
      if (json.length <= MAX_PREFS) sql.salvarPrefs.run(json, u.conta);
    });

    quando('conta:nome', (u, novo, ack) => {
      const limpo = limparNome(novo);
      if (limpo.erro) return ack({ erro: limpo.erro });
      const dono = sql.contaPorNome.get(limpo.nome);
      if (dono && dono.id !== u.conta) return ack({ erro: `Já tem alguém chamado "${limpo.nome}"` });
      const antigo = u.nome;
      sql.trocarNome.run(limpo.nome, u.conta);
      const cor = corDaConta(sql.contaPorId.get(u.conta));
      sql.renomearMensagens.run(limpo.nome, cor, antigo);
      Object.assign(u, { nome: limpo.nome, cor });
      io.to('todos').emit('renomeado', { de: antigo, para: limpo.nome });
      emitirPerfisDaConta(u.conta);
      emitirPresenca();
      ack({ nome: limpo.nome });
    });

    quando('perfil:editar', (u, { cor, bio } = {}, ack) => {
      cor = cor == null || cor === '' ? null : String(cor);
      if (cor !== null && !COR_RE.test(cor)) return ack({ erro: 'Cor inválida' });
      // tira caracteres de controle, mas mantém a quebra de linha
      bio = String(bio ?? '').replace(/[\p{Cc}]/gu, (c) => (c === '\n' ? c : '')).trim().slice(0, MAX_BIO);
      sql.trocarPerfil.run(cor, bio, u.conta);
      u.cor = corDaConta(sql.contaPorId.get(u.conta));
      sql.recolorirMensagens.run(u.cor, u.nome);
      emitirPerfisDaConta(u.conta);
      emitirPresenca();
      ack({});
    });

    quando('perfil:avatar', async (u, dados, ack) => {
      if (dados === null) {
        sql.trocarAvatar.run(null, u.conta);
      } else {
        const r = await salvarImagem(dados);
        if (r.erro) return ack(r);
        sql.trocarAvatar.run(r.url, u.conta);
      }
      emitirPerfisDaConta(u.conta);
      ack({});
    });

    // ---------- canais (admin do servidor do canal) ----------
    // Canal que o usuário pode administrar, ou null
    const canalDoAdmin = (u, id) => {
      const c = sql.canal.get(Number(id));
      return c && ehAdminDe(c.servidor, u.conta) ? c : null;
    };

    quandoAdmin('canal:criar', (u, { tipo, nome } = {}, ack, srv) => {
      if (!['texto', 'voz'].includes(tipo)) return ack({ erro: 'Tipo de canal inválido' });
      const limpo = limparNomeCanal(tipo, nome);
      if (limpo.erro) return ack(limpo);
      if (sql.canalPorNome.get(srv, tipo, limpo.nome)) return ack({ erro: `Já existe um canal "${limpo.nome}"` });
      if (sql.canaisDo.all(srv).length >= MAX_CANAIS) return ack({ erro: `Limite de ${MAX_CANAIS} canais por servidor` });
      const { lastInsertRowid } = sql.criarCanal.run(srv, tipo, limpo.nome, '', srv);
      emitirServidor(srv);
      ack({ id: Number(lastInsertRowid), nome: limpo.nome });
    });

    quando('canal:editar', (u, { id, nome, topico } = {}, ack) => {
      const canal = canalDoAdmin(u, id);
      if (!canal) return ack({ erro: 'Só admin pode fazer isso' });
      const limpo = limparNomeCanal(canal.tipo, nome ?? canal.nome);
      if (limpo.erro) return ack(limpo);
      const outro = sql.canalPorNome.get(canal.servidor, canal.tipo, limpo.nome);
      if (outro && outro.id !== canal.id) return ack({ erro: `Já existe um canal "${limpo.nome}"` });
      topico = String(topico ?? canal.topico).replace(/[\p{C}]/gu, '').trim().slice(0, 120);
      sql.editarCanal.run(limpo.nome, topico, canal.id);
      emitirServidor(canal.servidor);
      ack({ nome: limpo.nome });
    });

    quando('canal:mover', (u, { id, direcao } = {}, ack) => {
      const canal = canalDoAdmin(u, id);
      if (!canal) return ack({ erro: 'Só admin pode fazer isso' });
      const lista = canaisDe(canal.servidor, canal.tipo);
      const i = lista.findIndex((c) => c.id === canal.id);
      const j = i + (direcao < 0 ? -1 : 1);
      if (j < 0 || j >= lista.length) return ack({});
      [lista[i], lista[j]] = [lista[j], lista[i]];
      lista.forEach((c, pos) => sql.posicaoCanal.run(pos, c.id));
      emitirServidor(canal.servidor);
      ack({});
    });

    quando('canal:apagar', (u, id, ack) => {
      const canal = canalDoAdmin(u, id);
      if (!canal) return ack({ erro: 'Só admin pode fazer isso' });
      if (canaisDe(canal.servidor, canal.tipo).length <= 1) return ack({ erro: 'Precisa sobrar pelo menos um canal desse tipo' });
      sql.apagarCanal.run(canal.id);
      if (canal.tipo === 'texto') sql.apagarMensagensDoCanal.run(canal.id);
      else tirarDaVoz((o) => o.voz === canal.id);
      io.to(sala(canal.servidor)).emit('canal:apagado', { id: canal.id, tipo: canal.tipo, nome: canal.nome, servidor: canal.servidor });
      emitirServidor(canal.servidor);
      emitirPresenca();
      ack({});
    });

    // ---------- chat ----------
    quando('historico', (u, canal, ack) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      ack(c ? sql.historico.all(c.id).map((m) => msgPublica(m, c.servidor)) : []);
    });

    quando('fixadas', (u, canal, ack) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      ack(c ? sql.fixadas.all(c.id).map((m) => msgPublica(m, c.servidor)) : []);
    });

    function publicar(u, c, texto) {
      const { lastInsertRowid } = sql.inserirMensagem.run(c.nome, c.id, u.nome, u.cor, texto, Date.now(), u.conta);
      io.to(sala(c.servidor)).emit('mensagem', msgPublica(sql.mensagem.get(Number(lastInsertRowid)), c.servidor));
    }

    quando('mensagem', (u, { canal, texto } = {}) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!c) return;
      texto = String(texto ?? '').trim().slice(0, MAX_TEXTO);
      if (texto) publicar(u, c, texto);
    });

    quando('imagem', async (u, { canal, dados } = {}, ack) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!c) return ack({ erro: 'Esse canal não existe mais' });
      const r = await salvarImagem(dados);
      if (r.erro) return ack(r);
      publicar(u, c, r.url);
      ack({});
    });

    // Mensagem + canal, se a conta participa do servidor dela
    function mensagemDoMembro(id, conta) {
      const m = sql.mensagem.get(Number(id));
      const c = m && sql.canal.get(m.canal_id);
      return c && ehMembro(c.servidor, conta) ? { m, c } : {};
    }

    quando('msg:editar', (u, { id, texto } = {}, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (m.conta !== u.conta) return ack({ erro: 'Só dá pra editar as suas mensagens' });
      if (m.texto.startsWith('/uploads/')) return ack({ erro: 'Imagem não dá pra editar' });
      texto = String(texto ?? '').trim().slice(0, MAX_TEXTO);
      if (!texto) return ack({ erro: 'Mensagem vazia' });
      sql.editarMensagem.run(texto, Date.now(), m.id);
      io.to(sala(c.servidor)).emit('msg:atualizada', msgPublica(sql.mensagem.get(m.id), c.servidor));
      ack({});
    });

    quando('msg:apagar', (u, id, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (m.conta !== u.conta && !ehAdminDe(c.servidor, u.conta)) return ack({ erro: 'Só dá pra apagar as suas mensagens' });
      sql.apagarMensagem.run(m.id);
      io.to(sala(c.servidor)).emit('msg:apagada', { id: m.id, canal: c.id, servidor: c.servidor });
      ack({});
    });

    quando('msg:fixar', (u, { id, fixar } = {}, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (!ehAdminDe(c.servidor, u.conta)) return ack({ erro: 'Só admin pode fazer isso' });
      sql.fixarMensagem.run(fixar ? 1 : 0, m.id);
      io.to(sala(c.servidor)).emit('msg:atualizada', msgPublica(sql.mensagem.get(m.id), c.servidor));
      ack({});
    });

    quando('digitando', (u, canal) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (c) socket.to(sala(c.servidor)).emit('digitando', { canal: c.id, nome: u.nome });
    });

    // ---------- voz ----------
    quando('voz:entrar', (u, canal, ack) => {
      const c = canalDoMembro(canal, u.conta, 'voz');
      if (!c) return ack([]);
      u.voz = c.id;
      u.camera = null;
      u.tela = null;
      previas.delete(socket.id);
      const outros = [...usuarios.values()].filter((o) => o.voz === c.id && o.id !== u.id).map((o) => o.id);
      emitirPresenca();
      ack(outros);
    });

    quando('voz:sair', (u) => {
      Object.assign(u, { voz: null, mic: null, camera: null, tela: null });
      previas.delete(socket.id);
      emitirPresenca();
    });

    quando('estado', (u, s = {}) => {
      u.mudo = !!s.mudo;
      u.surdo = !!s.surdo;
      u.mic = idDeStream(s.mic);
      u.camera = idDeStream(s.camera);
      u.tela = idDeStream(s.tela);
      if (!u.tela) previas.delete(socket.id);
      emitirPresenca();
    });

    // Repassa oferta/resposta/ICE do WebRTC entre quem está na mesma sala de voz
    quando('sinal', (u, { para, dados } = {}) => {
      const alvo = usuarios.get(para);
      if (u.voz == null || alvo?.voz !== u.voz) return;
      io.to(para).emit('sinal', { de: socket.id, dados });
    });

    // Miniatura de quem está ao vivo, pra prévia ao passar o mouse (até pra quem não está na call)
    quando('tela:previa', (u, img) => {
      if (u.tela && typeof img === 'string' && img.length <= MAX_PREVIA && PREVIA_RE.test(img)) previas.set(socket.id, img);
    });
    quando('tela:ver-previa', (u, id, ack) => ack({ img: previas.get(id) ?? null }));

    socket.on('disconnect', () => {
      previas.delete(socket.id);
      if (usuarios.delete(socket.id)) emitirPresenca();
    });
  });

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(porta, host, () => {
      resolve({
        porta,
        host,
        // só resolve depois que a porta foi liberada (dá pra subir de novo na mesma porta logo em seguida)
        fechar: () => new Promise((r) => io.close(() => { db.close(); r(); })),
      });
    });
  });
}

// Bancos da época de um servidor só: tudo vira o primeiro servidor, e o admin mais antigo vira o dono
function migrarServidorUnico(db, novoConvite) {
  if (!db.prepare('SELECT 1 FROM canais WHERE servidor IS NULL').get()) return;
  const config = (chave) => db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor ?? null;
  const dono = db.prepare('SELECT MIN(id) AS id FROM contas WHERE admin = 1').get().id
    ?? db.prepare('SELECT MIN(id) AS id FROM contas').get().id;
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO servidores (nome, icone, dono, convite, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(config('nome') ?? NOME_SERVIDOR_PADRAO, config('icone'), dono, novoConvite(), Date.now());
    const id = Number(lastInsertRowid);
    db.prepare('UPDATE canais SET servidor = ? WHERE servidor IS NULL').run(id);
    // mensagens antigas guardavam o nome do canal; agora apontam pro id
    db.exec(`UPDATE mensagens SET canal_id = (SELECT c.id FROM canais c WHERE c.tipo = 'texto' AND c.nome = mensagens.canal)
      WHERE canal_id IS NULL`);
    const primeiro = db.prepare("SELECT id FROM canais WHERE servidor = ? AND tipo = 'texto' ORDER BY posicao, id").get(id);
    if (primeiro) db.prepare('UPDATE mensagens SET canal_id = ? WHERE canal_id IS NULL').run(primeiro.id);
    // todo mundo que já tinha conta continua no servidor, com o mesmo cargo
    db.prepare('INSERT OR IGNORE INTO membros (servidor, conta, admin, entrou_em) SELECT ?, id, admin, criado_em FROM contas').run(id);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
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
