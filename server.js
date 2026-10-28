import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Server } from 'socket.io';

// Canais criados na primeira vez; depois os admins mudam pelo app
const CANAIS_INICIAIS = [
  { tipo: 'texto', nome: 'geral', topico: 'Papo geral da galera' },
  { tipo: 'texto', nome: 'jogos', topico: 'Bora marcar aquela partida' },
  { tipo: 'texto', nome: 'memes', topico: 'Só os melhores (ou não)' },
  { tipo: 'voz', nome: 'Sala 1' },
  { tipo: 'voz', nome: 'Sala 2' },
  { tipo: 'voz', nome: 'AFK' },
];
const NOME_SERVIDOR_PADRAO = 'Amiguinhos Gamer';

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
 * Se `senha` não for vazia, ela vira o código de convite pedido pra criar conta.
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
    CREATE TABLE IF NOT EXISTS canais (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL,
      nome TEXT NOT NULL,
      topico TEXT NOT NULL DEFAULT '',
      posicao INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
  `);
  // Colunas que chegaram depois: bancos antigos ganham elas sem perder nada
  const colunasNovas = {
    contas: { nome: 'TEXT', cor: 'TEXT', avatar: 'TEXT', bio: "TEXT NOT NULL DEFAULT ''", admin: 'INTEGER NOT NULL DEFAULT 0' },
    mensagens: { conta: 'INTEGER', editado_em: 'INTEGER', fixada: 'INTEGER NOT NULL DEFAULT 0' },
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
    CREATE INDEX IF NOT EXISTS idx_mensagens_fixadas ON mensagens (canal, fixada);
  `);
  // Sem nenhum admin (banco antigo): a conta mais antiga vira admin
  if (!db.prepare('SELECT 1 FROM contas WHERE admin = 1').get()) {
    db.exec('UPDATE contas SET admin = 1 WHERE id = (SELECT MIN(id) FROM contas)');
  }
  if (!db.prepare('SELECT 1 FROM canais').get()) {
    const inserir = db.prepare('INSERT INTO canais (tipo, nome, topico, posicao) VALUES (?, ?, ?, ?)');
    CANAIS_INICIAIS.forEach((c, i) => inserir.run(c.tipo, c.nome, c.topico ?? '', i));
  }

  const sql = {
    criarConta: db.prepare('INSERT INTO contas (usuario, nome, senha, admin, criado_em) VALUES (?, ?, ?, ?, ?)'),
    temConta: db.prepare('SELECT 1 FROM contas LIMIT 1'),
    contaPorId: db.prepare('SELECT * FROM contas WHERE id = ?'),
    contaPorUsuario: db.prepare('SELECT * FROM contas WHERE usuario = ?'),
    contaPorNome: db.prepare('SELECT * FROM contas WHERE nome = ? COLLATE NOCASE'),
    contaPorToken: db.prepare('SELECT contas.* FROM sessoes JOIN contas ON contas.id = sessoes.conta WHERE sessoes.token = ?'),
    perfis: db.prepare('SELECT id, nome, cor, avatar, bio, admin FROM contas ORDER BY nome COLLATE NOCASE'),
    trocarNome: db.prepare('UPDATE contas SET nome = ? WHERE id = ?'),
    trocarPerfil: db.prepare('UPDATE contas SET cor = ?, bio = ? WHERE id = ?'),
    trocarAvatar: db.prepare('UPDATE contas SET avatar = ? WHERE id = ?'),
    definirAdmin: db.prepare('UPDATE contas SET admin = ? WHERE id = ?'),
    contarAdmins: db.prepare('SELECT COUNT(*) AS n FROM contas WHERE admin = 1'),
    renomearMensagens: db.prepare('UPDATE mensagens SET autor = ?, cor = ? WHERE autor = ?'),
    recolorirMensagens: db.prepare('UPDATE mensagens SET cor = ? WHERE autor = ?'),
    criarSessao: db.prepare('INSERT INTO sessoes (token, conta, criado_em) VALUES (?, ?, ?)'),
    apagarSessao: db.prepare('DELETE FROM sessoes WHERE token = ?'),
    salvarPrefs: db.prepare('UPDATE contas SET prefs = ? WHERE id = ?'),

    inserirMensagem: db.prepare('INSERT INTO mensagens (canal, autor, cor, texto, criado_em, conta) VALUES (?, ?, ?, ?, ?, ?)'),
    historico: db.prepare('SELECT * FROM (SELECT * FROM mensagens WHERE canal = ? ORDER BY id DESC LIMIT 100) ORDER BY id'),
    fixadas: db.prepare('SELECT * FROM mensagens WHERE canal = ? AND fixada = 1 ORDER BY id DESC'),
    mensagem: db.prepare('SELECT * FROM mensagens WHERE id = ?'),
    editarMensagem: db.prepare('UPDATE mensagens SET texto = ?, editado_em = ? WHERE id = ?'),
    apagarMensagem: db.prepare('DELETE FROM mensagens WHERE id = ?'),
    fixarMensagem: db.prepare('UPDATE mensagens SET fixada = ? WHERE id = ?'),

    canais: db.prepare('SELECT * FROM canais ORDER BY posicao, id'),
    canal: db.prepare('SELECT * FROM canais WHERE id = ?'),
    canalPorNome: db.prepare('SELECT * FROM canais WHERE tipo = ? AND nome = ? COLLATE NOCASE'),
    criarCanal: db.prepare('INSERT INTO canais (tipo, nome, topico, posicao) VALUES (?, ?, ?, (SELECT COALESCE(MAX(posicao), 0) + 1 FROM canais))'),
    editarCanal: db.prepare('UPDATE canais SET nome = ?, topico = ? WHERE id = ?'),
    posicaoCanal: db.prepare('UPDATE canais SET posicao = ? WHERE id = ?'),
    apagarCanal: db.prepare('DELETE FROM canais WHERE id = ?'),
    moverMensagensDeCanal: db.prepare('UPDATE mensagens SET canal = ? WHERE canal = ?'),
    apagarMensagensDoCanal: db.prepare('DELETE FROM mensagens WHERE canal = ?'),

    lerConfig: db.prepare('SELECT valor FROM config WHERE chave = ?'),
    salvarConfig: db.prepare('INSERT INTO config (chave, valor) VALUES (?, ?) ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor'),
    apagarConfig: db.prepare('DELETE FROM config WHERE chave = ?'),
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

  // ---------- estado do servidor (nome, ícone, canais) ----------
  const config = (chave, padrao) => sql.lerConfig.get(chave)?.valor ?? padrao;
  const canaisDe = (tipo) => sql.canais.all().filter((c) => c.tipo === tipo);
  const existeCanal = (tipo, nome) => canaisDe(tipo).some((c) => c.nome === nome);

  function estadoServidor() {
    return {
      nome: config('nome', NOME_SERVIDOR_PADRAO),
      icone: config('icone', null),
      canais: sql.canais.all().map(({ id, tipo, nome, topico }) => ({ id, tipo, nome, topico })),
    };
  }
  const perfisPublicos = () => sql.perfis.all().map((p) => ({ ...p, cor: corDaConta(p), admin: !!p.admin }));

  // ---------- servidor ----------
  const app = express();
  app.use(express.static(path.join(raiz, 'public')));
  app.use('/uploads', express.static(pastaUploads, { maxAge: '30d', immutable: true }));

  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: MAX_IMAGEM + 64 * 1024 });

  const usuarios = new Map(); // socket.id -> usuário
  const previas = new Map(); // socket.id -> miniatura da tela que a pessoa está transmitindo

  function emitirPresenca() {
    io.to('todos').emit('presenca', [...usuarios.values()]);
  }
  const emitirServidor = () => io.to('todos').emit('servidor', estadoServidor());
  const emitirPerfis = () => io.to('todos').emit('perfis', perfisPublicos());

  io.on('connection', (socket) => {
    const eu = () => usuarios.get(socket.id);
    const ehAdmin = () => {
      const u = eu();
      return !!u && !!sql.contaPorId.get(u.conta)?.admin;
    };
    // Registra um evento que exige estar logado; `ack` sempre existe (no-op se o cliente não mandou)
    const quando = (evento, { admin = false } = {}, fn) =>
      socket.on(evento, async (dados, ack) => {
        if (typeof ack !== 'function') ack = () => {};
        const u = eu();
        if (!u) return ack({ erro: 'Entra primeiro' });
        if (admin && !ehAdmin()) return ack({ erro: 'Só admin pode fazer isso' });
        try {
          await fn(u, dados, ack);
        } catch (err) {
          console.error(`Erro em ${evento}`, err);
          ack({ erro: 'Deu ruim no servidor' });
        }
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
      if (senha && convite !== senha) {
        limitador.errou(ip);
        return ack({ erro: 'Código de convite errado' });
      }
      const limpo = limparNome(String(nome ?? '').trim() || usuario);
      if (limpo.erro) return ack({ erro: limpo.erro });
      if (sql.contaPorUsuario.get(usuario)) return ack({ erro: `O usuário "${usuario}" já existe. Escolhe outro ou entra com ele.` });
      if (sql.contaPorNome.get(limpo.nome)) return ack({ erro: `Já tem alguém chamado "${limpo.nome}". Escolhe outro nome de exibição.` });
      const primeira = !sql.temConta.get(); // quem cria a primeira conta vira admin
      const { lastInsertRowid } = sql.criarConta.run(usuario, limpo.nome, await hashSenha(senhaConta), primeira ? 1 : 0, Date.now());
      ack({ token: novaSessao(Number(lastInsertRowid)) });
      emitirPerfis();
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
          io.sockets.sockets.get(o.id)?.disconnect(true);
        }
      }

      usuarios.set(socket.id, {
        conta: conta.id,
        id: socket.id,
        nome: conta.nome,
        cor: corDaConta(conta),
        voz: null,
        mudo: false,
        surdo: false,
        mic: null,
        camera: null,
        tela: null,
      });
      socket.join('todos');
      ack({
        id: socket.id,
        conta: conta.id,
        nome: conta.nome,
        usuario: conta.usuario,
        prefs: JSON.parse(conta.prefs),
        servidor: estadoServidor(),
        perfis: perfisPublicos(),
        iceServers: ICE_SERVERS,
      });
      emitirPresenca();
    });

    // ---------- perfil ----------
    quando('prefs', {}, (u, prefs) => {
      if (typeof prefs !== 'object' || prefs === null) return;
      const json = JSON.stringify(prefs);
      if (json.length <= MAX_PREFS) sql.salvarPrefs.run(json, u.conta);
    });

    quando('conta:nome', {}, (u, novo, ack) => {
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
      emitirPerfis();
      emitirPresenca();
      ack({ nome: limpo.nome });
    });

    quando('perfil:editar', {}, (u, { cor, bio } = {}, ack) => {
      cor = cor == null || cor === '' ? null : String(cor);
      if (cor !== null && !COR_RE.test(cor)) return ack({ erro: 'Cor inválida' });
      // tira caracteres de controle, mas mantém a quebra de linha
      bio = String(bio ?? '').replace(/[\p{Cc}]/gu, (c) => (c === '\n' ? c : '')).trim().slice(0, MAX_BIO);
      sql.trocarPerfil.run(cor, bio, u.conta);
      u.cor = corDaConta(sql.contaPorId.get(u.conta));
      sql.recolorirMensagens.run(u.cor, u.nome);
      emitirPerfis();
      emitirPresenca();
      ack({});
    });

    quando('perfil:avatar', {}, async (u, dados, ack) => {
      if (dados === null) {
        sql.trocarAvatar.run(null, u.conta);
      } else {
        const r = await salvarImagem(dados);
        if (r.erro) return ack(r);
        sql.trocarAvatar.run(r.url, u.conta);
      }
      emitirPerfis();
      ack({});
    });

    quando('admin:definir', { admin: true }, (u, { conta, admin } = {}, ack) => {
      const alvo = sql.contaPorId.get(Number(conta));
      if (!alvo) return ack({ erro: 'Conta não encontrada' });
      if (!admin && alvo.admin && sql.contarAdmins.get().n <= 1) return ack({ erro: 'Precisa ter pelo menos um admin' });
      sql.definirAdmin.run(admin ? 1 : 0, alvo.id);
      emitirPerfis();
      ack({});
    });

    // ---------- servidor e canais (admin) ----------
    quando('servidor:editar', { admin: true }, (u, { nome } = {}, ack) => {
      nome = String(nome ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim();
      if (!nome || [...nome].length > 40) return ack({ erro: 'O nome do servidor precisa ter de 1 a 40 caracteres' });
      sql.salvarConfig.run('nome', nome);
      emitirServidor();
      ack({});
    });

    quando('servidor:icone', { admin: true }, async (u, dados, ack) => {
      if (dados === null) {
        sql.apagarConfig.run('icone');
      } else {
        const r = await salvarImagem(dados);
        if (r.erro) return ack(r);
        sql.salvarConfig.run('icone', r.url);
      }
      emitirServidor();
      ack({});
    });

    quando('canal:criar', { admin: true }, (u, { tipo, nome } = {}, ack) => {
      if (!['texto', 'voz'].includes(tipo)) return ack({ erro: 'Tipo de canal inválido' });
      const limpo = limparNomeCanal(tipo, nome);
      if (limpo.erro) return ack(limpo);
      if (sql.canalPorNome.get(tipo, limpo.nome)) return ack({ erro: `Já existe um canal "${limpo.nome}"` });
      const { lastInsertRowid } = sql.criarCanal.run(tipo, limpo.nome, '');
      emitirServidor();
      ack({ id: Number(lastInsertRowid), nome: limpo.nome });
    });

    quando('canal:editar', { admin: true }, (u, { id, nome, topico } = {}, ack) => {
      const canal = sql.canal.get(Number(id));
      if (!canal) return ack({ erro: 'Canal não encontrado' });
      const limpo = limparNomeCanal(canal.tipo, nome ?? canal.nome);
      if (limpo.erro) return ack(limpo);
      const outro = sql.canalPorNome.get(canal.tipo, limpo.nome);
      if (outro && outro.id !== canal.id) return ack({ erro: `Já existe um canal "${limpo.nome}"` });
      topico = String(topico ?? canal.topico).replace(/[\p{C}]/gu, '').trim().slice(0, 120);
      sql.editarCanal.run(limpo.nome, topico, canal.id);
      if (limpo.nome !== canal.nome) {
        // as mensagens e quem está na sala acompanham o nome novo
        if (canal.tipo === 'texto') sql.moverMensagensDeCanal.run(limpo.nome, canal.nome);
        else for (const o of usuarios.values()) if (o.voz === canal.nome) o.voz = limpo.nome;
        io.to('todos').emit('canal:renomeado', { tipo: canal.tipo, de: canal.nome, para: limpo.nome });
      }
      emitirServidor();
      emitirPresenca();
      ack({ nome: limpo.nome });
    });

    quando('canal:mover', { admin: true }, (u, { id, direcao } = {}, ack) => {
      const canal = sql.canal.get(Number(id));
      if (!canal) return ack({ erro: 'Canal não encontrado' });
      const lista = canaisDe(canal.tipo);
      const i = lista.findIndex((c) => c.id === canal.id);
      const j = i + (direcao < 0 ? -1 : 1);
      if (j < 0 || j >= lista.length) return ack({});
      [lista[i], lista[j]] = [lista[j], lista[i]];
      lista.forEach((c, pos) => sql.posicaoCanal.run(pos, c.id));
      emitirServidor();
      ack({});
    });

    quando('canal:apagar', { admin: true }, (u, id, ack) => {
      const canal = sql.canal.get(Number(id));
      if (!canal) return ack({ erro: 'Canal não encontrado' });
      if (canaisDe(canal.tipo).length <= 1) return ack({ erro: 'Precisa sobrar pelo menos um canal desse tipo' });
      sql.apagarCanal.run(canal.id);
      if (canal.tipo === 'texto') sql.apagarMensagensDoCanal.run(canal.nome);
      else for (const o of usuarios.values()) if (o.voz === canal.nome) Object.assign(o, { voz: null, mic: null, camera: null, tela: null });
      io.to('todos').emit('canal:apagado', { tipo: canal.tipo, nome: canal.nome });
      emitirServidor();
      emitirPresenca();
      ack({});
    });

    // ---------- chat ----------
    quando('historico', {}, (u, canal, ack) => {
      if (!existeCanal('texto', canal)) return ack([]);
      ack(sql.historico.all(canal));
    });

    quando('fixadas', {}, (u, canal, ack) => {
      if (!existeCanal('texto', canal)) return ack([]);
      ack(sql.fixadas.all(canal));
    });

    function publicar(u, canal, texto) {
      const { lastInsertRowid } = sql.inserirMensagem.run(canal, u.nome, u.cor, texto, Date.now(), u.conta);
      io.to('todos').emit('mensagem', sql.mensagem.get(Number(lastInsertRowid)));
    }

    quando('mensagem', {}, (u, { canal, texto } = {}) => {
      if (!existeCanal('texto', canal)) return;
      texto = String(texto ?? '').trim().slice(0, MAX_TEXTO);
      if (texto) publicar(u, canal, texto);
    });

    quando('imagem', {}, async (u, { canal, dados } = {}, ack) => {
      if (!existeCanal('texto', canal)) return ack({ erro: 'Esse canal não existe mais' });
      const r = await salvarImagem(dados);
      if (r.erro) return ack(r);
      publicar(u, canal, r.url);
      ack({});
    });

    quando('msg:editar', {}, (u, { id, texto } = {}, ack) => {
      const m = sql.mensagem.get(Number(id));
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (m.conta !== u.conta) return ack({ erro: 'Só dá pra editar as suas mensagens' });
      if (m.texto.startsWith('/uploads/')) return ack({ erro: 'Imagem não dá pra editar' });
      texto = String(texto ?? '').trim().slice(0, MAX_TEXTO);
      if (!texto) return ack({ erro: 'Mensagem vazia' });
      sql.editarMensagem.run(texto, Date.now(), m.id);
      io.to('todos').emit('msg:atualizada', sql.mensagem.get(m.id));
      ack({});
    });

    quando('msg:apagar', {}, (u, id, ack) => {
      const m = sql.mensagem.get(Number(id));
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (m.conta !== u.conta && !ehAdmin()) return ack({ erro: 'Só dá pra apagar as suas mensagens' });
      sql.apagarMensagem.run(m.id);
      io.to('todos').emit('msg:apagada', { id: m.id, canal: m.canal });
      ack({});
    });

    quando('msg:fixar', { admin: true }, (u, { id, fixar } = {}, ack) => {
      const m = sql.mensagem.get(Number(id));
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      sql.fixarMensagem.run(fixar ? 1 : 0, m.id);
      io.to('todos').emit('msg:atualizada', sql.mensagem.get(m.id));
      ack({});
    });

    quando('digitando', {}, (u, canal) => {
      if (existeCanal('texto', canal)) socket.to('todos').emit('digitando', { canal, nome: u.nome });
    });

    // ---------- voz ----------
    quando('voz:entrar', {}, (u, canal, ack) => {
      if (!existeCanal('voz', canal)) return ack([]);
      u.voz = canal;
      u.camera = null;
      u.tela = null;
      const outros = [...usuarios.values()].filter((o) => o.voz === canal && o.id !== u.id).map((o) => o.id);
      emitirPresenca();
      ack(outros);
    });

    quando('voz:sair', {}, (u) => {
      Object.assign(u, { voz: null, mic: null, camera: null, tela: null });
      previas.delete(socket.id);
      emitirPresenca();
    });

    quando('estado', {}, (u, s = {}) => {
      u.mudo = !!s.mudo;
      u.surdo = !!s.surdo;
      u.mic = idDeStream(s.mic);
      u.camera = idDeStream(s.camera);
      u.tela = idDeStream(s.tela);
      if (!u.tela) previas.delete(socket.id);
      emitirPresenca();
    });

    // Repassa oferta/resposta/ICE do WebRTC entre quem está na mesma sala de voz
    quando('sinal', {}, (u, { para, dados } = {}) => {
      const alvo = usuarios.get(para);
      if (!u.voz || alvo?.voz !== u.voz) return;
      io.to(para).emit('sinal', { de: socket.id, dados });
    });

    // Miniatura de quem está ao vivo, pra prévia ao passar o mouse (até pra quem não está na call)
    quando('tela:previa', {}, (u, img) => {
      if (u.tela && typeof img === 'string' && img.length <= MAX_PREVIA && PREVIA_RE.test(img)) previas.set(socket.id, img);
    });
    quando('tela:ver-previa', {}, (u, id, ack) => ack({ img: previas.get(id) ?? null }));

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
