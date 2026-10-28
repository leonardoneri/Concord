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
const VERSAO = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;

function corDoNome(nome) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.codePointAt(0)) % 360;
  return `hsl(${h} 65% 55%)`;
}
const corDaConta = (conta) => conta.cor || corDoNome(conta.nome);

const idDeStream = (v) => (typeof v === 'string' && v.length <= 100 ? v : null);

const MAX_IMAGEM = 10 * 1024 * 1024;
const MAX_ARQUIVO = 25 * 1024 * 1024; // outros arquivos (vídeo, zip…)
const MAX_REACOES_DIFERENTES = 20; // emojis diferentes por mensagem
const PAGINA = 50; // mensagens por vez no histórico
const BACKUPS_MANTIDOS = 7; // um por dia
const STATUS = ['online', 'ausente', 'ocupado', 'invisivel'];
// Um emoji (com tom de pele, variação e combinações tipo 👨‍👩‍👧)
const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3)(?:\uFE0F|[\u{1F3FB}-\u{1F3FF}]|\u200D\p{Extended_Pictographic}\uFE0F?)*$/u;
// Arquivos que o navegador mostra direto; o resto sempre baixa (nunca abre como página)
const EXT_EXIBIVEIS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'mp3', 'ogg', 'wav', 'm4a', 'pdf', 'txt']);

function limparNomeArquivo(nome) {
  nome = String(nome ?? '').replace(/[\p{C}/\\:*?"<>|]/gu, '_').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  if (!nome) nome = 'arquivo';
  if ([...nome].length > 100) {
    const ext = nome.match(/\.[\p{L}\p{N}]{1,8}$/u)?.[0] ?? '';
    nome = [...nome].slice(0, 100 - ext.length).join('') + ext;
  }
  return nome;
}
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
    CREATE TABLE IF NOT EXISTS reacoes (
      mensagem INTEGER NOT NULL,
      conta INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      PRIMARY KEY (mensagem, conta, emoji)
    );
  `);
  // Colunas que chegaram depois: bancos antigos ganham elas sem perder nada
  const colunasNovas = {
    contas: {
      nome: 'TEXT', cor: 'TEXT', avatar: 'TEXT', bio: "TEXT NOT NULL DEFAULT ''", admin: 'INTEGER NOT NULL DEFAULT 0',
      status: "TEXT NOT NULL DEFAULT 'online'", status_texto: "TEXT NOT NULL DEFAULT ''",
    },
    mensagens: { conta: 'INTEGER', editado_em: 'INTEGER', fixada: 'INTEGER NOT NULL DEFAULT 0', canal_id: 'INTEGER', resposta: 'INTEGER' },
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
    CREATE INDEX IF NOT EXISTS idx_canais_tipo_nome ON canais (tipo, nome);
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
    trocarStatus: db.prepare('UPDATE contas SET status = ?, status_texto = ? WHERE id = ?'),
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

    inserirMensagem: db.prepare('INSERT INTO mensagens (canal, canal_id, autor, cor, texto, criado_em, conta, resposta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    historico: db.prepare(`SELECT * FROM (SELECT * FROM mensagens WHERE canal_id = ? ORDER BY id DESC LIMIT ${PAGINA}) ORDER BY id`),
    historicoAntes: db.prepare(`SELECT * FROM (SELECT * FROM mensagens WHERE canal_id = ? AND id < ? ORDER BY id DESC LIMIT ${PAGINA}) ORDER BY id`),
    buscar: db.prepare(`SELECT m.* FROM mensagens m JOIN json_each(?) c ON c.value = m.canal_id
      WHERE m.texto LIKE ? ESCAPE '\\' AND m.texto NOT LIKE '/uploads/%' ORDER BY m.id DESC LIMIT 25`),
    reacoes: db.prepare('SELECT emoji, conta FROM reacoes WHERE mensagem = ? ORDER BY rowid'),
    temReacao: db.prepare('SELECT 1 FROM reacoes WHERE mensagem = ? AND conta = ? AND emoji = ?'),
    emojisDiferentes: db.prepare('SELECT COUNT(DISTINCT emoji) AS n FROM reacoes WHERE mensagem = ?'),
    reagir: db.prepare('INSERT INTO reacoes (mensagem, conta, emoji) VALUES (?, ?, ?)'),
    desreagir: db.prepare('DELETE FROM reacoes WHERE mensagem = ? AND conta = ? AND emoji = ?'),
    apagarReacoes: db.prepare('DELETE FROM reacoes WHERE mensagem = ?'),
    apagarReacoesDoCanal: db.prepare('DELETE FROM reacoes WHERE mensagem IN (SELECT id FROM mensagens WHERE canal_id = ?)'),
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

    // conversa direta: canal tipo 'dm' sem servidor, nome "menorId:maiorId"
    dmPorNome: db.prepare("SELECT * FROM canais WHERE tipo = 'dm' AND nome = ?"),
    criarDm: db.prepare("INSERT INTO canais (servidor, tipo, nome, topico, posicao) VALUES (NULL, 'dm', ?, '', 0)"),
    dmsDa: db.prepare(`SELECT c.*, (SELECT MAX(criado_em) FROM mensagens WHERE canal_id = c.id) AS ultima FROM canais c
      WHERE c.tipo = 'dm' AND (c.nome LIKE ? OR c.nome LIKE ?)`),
    compartilhamServidor: db.prepare('SELECT 1 FROM membros a JOIN membros b ON a.servidor = b.servidor WHERE a.conta = ? AND b.conta = ?'),
  };
  const limitador = criarLimitador();

  // Cópia do banco uma vez por dia (pasta backups/), guardando as últimas 7
  const pastaBackups = path.join(pastaDados, 'backups');
  function fazerBackup() {
    try {
      fs.mkdirSync(pastaBackups, { recursive: true });
      const arquivo = path.join(pastaBackups, `chat-${new Date().toISOString().slice(0, 10)}.db`);
      if (!fs.existsSync(arquivo)) db.exec(`VACUUM INTO '${arquivo.replace(/'/g, "''")}'`);
      const antigos = fs.readdirSync(pastaBackups).filter((f) => /^chat-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -BACKUPS_MANTIDOS);
      antigos.forEach((f) => fs.rmSync(path.join(pastaBackups, f)));
    } catch (err) {
      console.error('Erro no backup', err);
    }
  }
  fazerBackup();
  const timerBackup = setInterval(fazerBackup, 60 * 60 * 1000); // confere de hora em hora

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

  // Qualquer arquivo: fica em /uploads/<pasta>/<nome original>
  async function salvarArquivo(nome, dados) {
    if (!Buffer.isBuffer(dados) || !dados.length) return { erro: 'Arquivo vazio' };
    if (dados.length > MAX_ARQUIVO) return { erro: 'Arquivo grande demais (máx. 25 MB)' };
    if (extensaoDaImagem(dados) && dados.length <= MAX_IMAGEM) return salvarImagem(dados);
    const pasta = randomBytes(12).toString('hex');
    const limpo = limparNomeArquivo(nome);
    try {
      await fs.promises.mkdir(path.join(pastaUploads, pasta));
      await fs.promises.writeFile(path.join(pastaUploads, pasta, limpo), dados);
    } catch {
      return { erro: 'Não consegui salvar o arquivo' };
    }
    return { url: `/uploads/${pasta}/${encodeURIComponent(limpo)}` };
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
    const tipoOk = !tipo || c?.tipo === tipo || (tipo === 'texto' && c?.tipo === 'dm');
    if (!c || !tipoOk || !podeVerCanal(c, conta)) return null;
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
  function reacoesDe(id) {
    const porEmoji = new Map();
    for (const r of sql.reacoes.all(id)) {
      if (!porEmoji.has(r.emoji)) porEmoji.set(r.emoji, []);
      porEmoji.get(r.emoji).push(r.conta);
    }
    return [...porEmoji].map(([emoji, contas]) => ({ emoji, contas }));
  }
  function respostaDe(id) {
    if (!id) return null;
    const r = sql.mensagem.get(id);
    return r ? { id: r.id, autor: r.autor, conta: r.conta, texto: r.texto.slice(0, 200) } : { id, apagada: true };
  }
  // Mensagem como o cliente vê: `canal` é o id do canal (servidor null = conversa direta)
  const msgPublica = (m, servidor = sql.canal.get(m.canal_id)?.servidor ?? null) => ({
    id: m.id, canal: m.canal_id, servidor, autor: m.autor, cor: m.cor, texto: m.texto,
    criado_em: m.criado_em, conta: m.conta, editado_em: m.editado_em, fixada: m.fixada,
    resposta: respostaDe(m.resposta), reacoes: reacoesDe(m.id),
  });

  // ---------- conversas diretas ----------
  const ehDm = (c) => c.tipo === 'dm';
  const contasDoDm = (c) => c.nome.split(':').map(Number);
  const nomeDm = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const podeVerCanal = (c, conta) => (ehDm(c) ? contasDoDm(c).includes(conta) : ehMembro(c.servidor, conta));
  const perfilBasico = (c) => c && { id: c.id, nome: c.nome, cor: corDaConta(c), avatar: c.avatar, bio: c.bio };
  const dmsDa = (conta) => sql.dmsDa.all(`${conta}:%`, `%:${conta}`);
  function dmPublico(c, conta) {
    const outro = contasDoDm(c).find((x) => x !== conta) ?? conta;
    return { id: c.id, outro: perfilBasico(sql.contaPorId.get(outro)), ultima: c.ultima ?? null };
  }

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
  // supressão de ruído forte (RNNoise) que roda no navegador
  app.use('/vendor/ruido', express.static(path.join(raiz, 'node_modules/@sapphi-red/web-noise-suppressor/dist'), { maxAge: '7d' }));
  app.use('/uploads', express.static(pastaUploads, {
    maxAge: '30d',
    immutable: true,
    setHeaders: (res, arquivo) => {
      // arquivo enviado nunca roda como página do site (nada de HTML/SVG com script)
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self'; media-src 'self'");
      const ext = path.extname(arquivo).slice(1).toLowerCase();
      if (!EXT_EXIBIVEIS.has(ext)) {
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(arquivo))}`);
      }
    },
  }));

  const http = createServer(app);
  const io = new Server(http, { maxHttpBufferSize: MAX_ARQUIVO + 64 * 1024 });

  // socket.id -> usuário. O `id` do usuário é a sessão da aba (não o socket): continua o mesmo quando
  // a conexão cai e volta (ex.: servidor reiniciando), então a chamada WebRTC não precisa recomeçar
  const usuarios = new Map();
  const previas = new Map(); // id do usuário -> miniatura da tela que a pessoa está transmitindo
  const sala = (srv) => `s:${srv}`;

  // Cada um vê quem é do servidor aberto + quem está na mesma call (que pode ser de outro servidor)
  const publico = ({ id, conta, nome, cor, voz, mudo, surdo, mic, camera, tela, status, statusTexto, jogo }) =>
    ({ id, conta, nome, cor, voz, mudo, surdo, mic, camera, tela, status, statusTexto, jogo });
  // eu.servidor = id do servidor aberto, ou 'dm' vendo as conversas diretas
  function emitirPresenca() {
    const membrosDe = new Map();
    const membrosDoServidor = (srv) => {
      if (!membrosDe.has(srv)) membrosDe.set(srv, new Set(sql.contasMembros.all(srv).map((m) => m.conta)));
      return membrosDe.get(srv);
    };
    const todos = [...usuarios.values()];
    for (const eu of todos) {
      let membros = new Set();
      if (eu.servidor === 'dm') membros = new Set([eu.conta, ...dmsDa(eu.conta).flatMap(contasDoDm)]);
      else if (eu.servidor) membros = membrosDoServidor(eu.servidor);
      const naCall = (o) => eu.voz != null && o.voz === eu.voz;
      // invisível: some da lista dos outros, menos de quem está na mesma call (precisa pra chamada funcionar)
      const lista = todos.filter((o) => naCall(o) || (membros.has(o.conta) && (o.status !== 'invisivel' || o.id === eu.id)));
      io.to(eu.socket).emit('presenca', lista.map(publico));
    }
  }
  const emitirServidor = (srv) => io.to(sala(srv)).emit('servidor', estadoServidor(srv));
  const emitirPerfis = (srv) => io.to(sala(srv)).emit('perfis', { servidor: srv, perfis: perfisDo(srv) });
  const emitirPerfisDaConta = (conta) => sql.servidoresDa.all(conta).forEach((s) => emitirPerfis(s.id));
  const socketsDaConta = (conta) => [...usuarios.values()].filter((u) => u.conta === conta).map((u) => io.sockets.sockets.get(u.socket)).filter(Boolean);
  // Lista de servidores (barra da esquerda) de uma conta
  function emitirServidores(conta) {
    const lista = sql.servidoresDa.all(conta).map(resumoServidor);
    socketsDaConta(conta).forEach((s) => s.emit('servidores', lista));
  }
  // Tira alguém do servidor (saiu ou foi expulso)
  function removerMembro(srv, conta) {
    sql.sairServidor.run(srv, conta);
    socketsDaConta(conta).forEach((so) => so.leave(sala(srv)));
    const canaisVoz = new Set(canaisDe(srv, 'voz').map((c) => c.id));
    tirarDaVoz((o) => o.conta === conta && canaisVoz.has(o.voz));
    for (const o of usuarios.values()) if (o.conta === conta && o.servidor === srv) o.servidor = null;
    emitirServidores(conta);
    emitirPerfis(srv);
    emitirPresenca();
  }
  // Manda um evento pra quem vê o canal (servidor inteiro, ou as duas pessoas da DM)
  function emitirNoCanal(c, evento, dados, semSocket = null) {
    if (ehDm(c)) {
      for (const conta of contasDoDm(c)) socketsDaConta(conta).forEach((so) => so.id !== semSocket && so.emit(evento, dados));
    } else if (semSocket) {
      io.sockets.sockets.get(semSocket)?.to(sala(c.servidor)).emit(evento, dados);
    } else {
      io.to(sala(c.servidor)).emit(evento, dados);
    }
  }

  // Tira da call quem estava num canal de voz que deixou de existir / que a pessoa não pode mais ver
  function tirarDaVoz(filtro) {
    for (const o of usuarios.values()) {
      if (o.voz != null && filtro(o)) {
        Object.assign(o, { voz: null, mic: null, camera: null, tela: null });
        previas.delete(o.id);
        io.to(o.socket).emit('voz:expulso');
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

    socket.on('entrar', ({ token, sessao, voltar } = {}, ack) => {
      if (typeof ack !== 'function') return;
      const conta = typeof token === 'string' && sql.contaPorToken.get(hashToken(token));
      if (!conta) return ack({ erro: 'Sua sessão expirou. Entra de novo.', sessaoInvalida: true });
      // id escolhido pela aba; se for inválido ou de outra conta, usa o do socket
      let id = typeof sessao === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(sessao) ? sessao : socket.id;
      if ([...usuarios.values()].some((o) => o.id === id && o.conta !== conta.id)) id = socket.id;

      // A mesma conta aberta em outro lugar (ou reconectando antes do servidor perceber a queda): derruba a velha
      for (const o of [...usuarios.values()]) {
        if (o.conta === conta.id && o.socket !== socket.id) {
          usuarios.delete(o.socket);
          previas.delete(o.id);
          io.sockets.sockets.get(o.socket)?.disconnect(true);
        }
      }

      usuarios.set(socket.id, {
        conta: conta.id,
        id,
        socket: socket.id,
        nome: conta.nome,
        cor: corDaConta(conta),
        servidor: null, // servidor aberto na tela ('dm' = conversas diretas)
        status: STATUS.includes(conta.status) ? conta.status : 'online',
        statusTexto: conta.status_texto ?? '',
        jogo: null,
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
      // reconectou no meio de uma chamada (ex.: servidor reiniciou): volta direto pra sala, do jeito que estava
      let voz;
      if (voltar && typeof voltar === 'object') {
        const c = canalDoMembro(voltar.voz, conta.id, 'voz');
        voz = null;
        if (c) {
          Object.assign(usuarios.get(socket.id), {
            voz: c.id, mudo: !!voltar.mudo, surdo: !!voltar.surdo,
            mic: idDeStream(voltar.mic), camera: idDeStream(voltar.camera), tela: idDeStream(voltar.tela),
          });
          voz = { outros: [...usuarios.values()].filter((o) => o.voz === c.id && o.id !== id).map((o) => o.id) };
        }
      }
      ack({
        id,
        conta: conta.id,
        nome: conta.nome,
        usuario: conta.usuario,
        status: conta.status,
        statusTexto: conta.status_texto,
        prefs: JSON.parse(conta.prefs),
        servidores: servidores.map(resumoServidor),
        iceServers: ICE_SERVERS,
        versao: VERSAO,
        voz,
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
      removerMembro(s.id, u.conta);
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
        sql.apagarReacoesDoCanal.run(c.id);
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

    quandoAdmin('membro:expulsar', (u, { conta } = {}, ack, srv) => {
      conta = Number(conta);
      const s = sql.servidor.get(srv);
      const alvo = sql.membro.get(srv, conta);
      if (!alvo) return ack({ erro: 'Essa pessoa não está no servidor' });
      if (conta === u.conta) return ack({ erro: 'Pra sair, use "Sair do servidor"' });
      if (conta === s.dono) return ack({ erro: 'O dono não pode ser expulso' });
      if (alvo.admin && u.conta !== s.dono) return ack({ erro: 'Só o dono pode expulsar um admin' });
      socketsDaConta(conta).forEach((so) => so.emit('servidor:expulso', { id: srv, nome: s.nome }));
      removerMembro(srv, conta);
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

    // ---------- status ----------
    quando('status', (u, { status, texto } = {}, ack) => {
      if (!STATUS.includes(status)) return ack({ erro: 'Status inválido' });
      texto = String(texto ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
      sql.trocarStatus.run(status, texto, u.conta);
      Object.assign(u, { status, statusTexto: texto });
      emitirPresenca();
      ack({});
    });

    // ---------- jogando agora (o app desktop detecta) ----------
    quando('jogo', (u, jogo, ack) => {
      const nome = typeof jogo?.nome === 'string' ? jogo.nome.replace(/[\p{C}]/gu, '').trim().slice(0, 60) : '';
      // ícone pequeno do .exe; só PNG em data URL, sem nada que o navegador execute
      const icone = typeof jogo?.icone === 'string' && jogo.icone.length < 12_000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(jogo.icone) ? jogo.icone : null;
      const novo = nome ? { nome, icone } : null;
      if (novo?.nome === u.jogo?.nome && novo?.icone === u.jogo?.icone) return ack({});
      u.jogo = novo;
      emitirPresenca();
      ack({});
    });

    // ---------- conversas diretas ----------
    quando('dm:lista', (u, _, ack) => {
      u.servidor = 'dm';
      const lista = dmsDa(u.conta).map((c) => dmPublico(c, u.conta)).sort((a, b) => (b.ultima ?? 0) - (a.ultima ?? 0));
      ack({ dms: lista, eu: perfilBasico(sql.contaPorId.get(u.conta)) });
      emitirPresenca();
    });

    quando('dm:abrir', (u, { conta } = {}, ack) => {
      conta = Number(conta);
      const outro = sql.contaPorId.get(conta);
      if (!outro || conta === u.conta) return ack({ erro: 'Pessoa não encontrada' });
      let c = sql.dmPorNome.get(nomeDm(u.conta, conta));
      if (!c) {
        // só cria conversa com quem está em algum servidor seu
        if (!sql.compartilhamServidor.get(u.conta, conta)) return ack({ erro: 'Vocês precisam estar num mesmo servidor' });
        c = sql.canal.get(Number(sql.criarDm.run(nomeDm(u.conta, conta)).lastInsertRowid));
      }
      ack({ dm: dmPublico(c, u.conta) });
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
      if (canal.tipo === 'texto') {
        sql.apagarReacoesDoCanal.run(canal.id);
        sql.apagarMensagensDoCanal.run(canal.id);
      } else {
        tirarDaVoz((o) => o.voz === canal.id);
      }
      io.to(sala(canal.servidor)).emit('canal:apagado', { id: canal.id, tipo: canal.tipo, nome: canal.nome, servidor: canal.servidor });
      emitirServidor(canal.servidor);
      emitirPresenca();
      ack({});
    });

    // ---------- chat ----------
    // historico(canal) = mais recentes; historico({ canal, antes }) = a página anterior a essa mensagem
    quando('historico', (u, pedido, ack) => {
      const { canal, antes } = typeof pedido === 'object' && pedido !== null ? pedido : { canal: pedido };
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!c) return ack([]);
      const linhas = antes ? sql.historicoAntes.all(c.id, Number(antes)) : sql.historico.all(c.id);
      ack(linhas.map((m) => msgPublica(m, c.servidor)));
    });

    // Busca no servidor aberto (ou nas suas DMs)
    quando('buscar', (u, { termo } = {}, ack) => {
      termo = String(termo ?? '').trim();
      if ([...termo].length < 2) return ack({ erro: 'Digite pelo menos 2 letras' });
      const canais = u.servidor === 'dm' ? dmsDa(u.conta) : u.servidor ? canaisDe(u.servidor, 'texto') : [];
      const ids = JSON.stringify(canais.map((c) => c.id));
      const padrao = `%${termo.slice(0, 100).replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
      ack({ resultados: sql.buscar.all(ids, padrao).map((m) => msgPublica(m)) });
    });

    quando('fixadas', (u, canal, ack) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      ack(c ? sql.fixadas.all(c.id).map((m) => msgPublica(m, c.servidor)) : []);
    });

    function publicar(u, c, texto, resposta = null) {
      // só responde mensagem do mesmo canal
      if (resposta && sql.mensagem.get(Number(resposta))?.canal_id !== c.id) resposta = null;
      const { lastInsertRowid } = sql.inserirMensagem.run(c.nome, c.id, u.nome, u.cor, texto, Date.now(), u.conta, resposta ? Number(resposta) : null);
      emitirNoCanal(c, 'mensagem', msgPublica(sql.mensagem.get(Number(lastInsertRowid)), c.servidor));
    }

    quando('mensagem', (u, { canal, texto, resposta } = {}) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!c) return;
      texto = String(texto ?? '').trim().slice(0, MAX_TEXTO);
      if (texto) publicar(u, c, texto, resposta);
    });

    quando('arquivo', async (u, { canal, nome, dados, resposta } = {}, ack) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!c) return ack({ erro: 'Esse canal não existe mais' });
      const r = await salvarArquivo(nome, dados);
      if (r.erro) return ack(r);
      publicar(u, c, r.url, resposta);
      ack({});
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
      return c && podeVerCanal(c, conta) ? { m, c } : {};
    }

    quando('msg:editar', (u, { id, texto } = {}, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (m.conta !== u.conta) return ack({ erro: 'Só dá pra editar as suas mensagens' });
      if (m.texto.startsWith('/uploads/')) return ack({ erro: 'Arquivo não dá pra editar' });
      texto = String(texto ?? '').trim().slice(0, MAX_TEXTO);
      if (!texto) return ack({ erro: 'Mensagem vazia' });
      sql.editarMensagem.run(texto, Date.now(), m.id);
      emitirNoCanal(c, 'msg:atualizada', msgPublica(sql.mensagem.get(m.id), c.servidor));
      ack({});
    });

    quando('msg:apagar', (u, id, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (m.conta !== u.conta && !ehAdminDe(c.servidor, u.conta)) return ack({ erro: 'Só dá pra apagar as suas mensagens' });
      sql.apagarMensagem.run(m.id);
      sql.apagarReacoes.run(m.id);
      emitirNoCanal(c, 'msg:apagada', { id: m.id, canal: c.id, servidor: c.servidor });
      ack({});
    });

    quando('msg:fixar', (u, { id, fixar } = {}, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      if (!ehDm(c) && !ehAdminDe(c.servidor, u.conta)) return ack({ erro: 'Só admin pode fazer isso' });
      sql.fixarMensagem.run(fixar ? 1 : 0, m.id);
      emitirNoCanal(c, 'msg:atualizada', msgPublica(sql.mensagem.get(m.id), c.servidor));
      ack({});
    });

    quando('msg:reagir', (u, { id, emoji } = {}, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      if (!m) return ack({ erro: 'Mensagem não encontrada' });
      emoji = String(emoji ?? '');
      if (emoji.length > 32 || !EMOJI_RE.test(emoji)) return ack({ erro: 'Emoji inválido' });
      if (sql.temReacao.get(m.id, u.conta, emoji)) {
        sql.desreagir.run(m.id, u.conta, emoji);
      } else {
        const jaTem = sql.reacoes.all(m.id).some((r) => r.emoji === emoji);
        if (!jaTem && sql.emojisDiferentes.get(m.id).n >= MAX_REACOES_DIFERENTES) return ack({ erro: 'Essa mensagem já tem emojis demais' });
        sql.reagir.run(m.id, u.conta, emoji);
      }
      emitirNoCanal(c, 'msg:atualizada', msgPublica(sql.mensagem.get(m.id), c.servidor));
      ack({});
    });

    quando('digitando', (u, canal) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (c) emitirNoCanal(c, 'digitando', { canal: c.id, nome: u.nome }, socket.id);
    });

    // ---------- voz ----------
    quando('voz:entrar', (u, canal, ack) => {
      const c = canalDoMembro(canal, u.conta, 'voz');
      if (!c) return ack(null);
      u.voz = c.id;
      u.camera = null;
      u.tela = null;
      previas.delete(u.id);
      const outros = [...usuarios.values()].filter((o) => o.voz === c.id && o.id !== u.id).map((o) => o.id);
      emitirPresenca();
      ack(outros);
    });

    quando('voz:sair', (u) => {
      Object.assign(u, { voz: null, mic: null, camera: null, tela: null });
      previas.delete(u.id);
      emitirPresenca();
    });

    quando('estado', (u, s = {}) => {
      u.mudo = !!s.mudo;
      u.surdo = !!s.surdo;
      u.mic = idDeStream(s.mic);
      u.camera = idDeStream(s.camera);
      u.tela = idDeStream(s.tela);
      if (!u.tela) previas.delete(u.id);
      emitirPresenca();
    });

    // Repassa oferta/resposta/ICE do WebRTC entre quem está na mesma sala de voz
    quando('sinal', (u, { para, dados } = {}) => {
      const alvo = [...usuarios.values()].find((o) => o.id === para);
      if (u.voz == null || alvo?.voz !== u.voz) return;
      io.to(alvo.socket).emit('sinal', { de: u.id, dados });
    });

    // Miniatura de quem está ao vivo, pra prévia ao passar o mouse (até pra quem não está na call)
    quando('tela:previa', (u, img) => {
      if (u.tela && typeof img === 'string' && img.length <= MAX_PREVIA && PREVIA_RE.test(img)) previas.set(u.id, img);
    });
    quando('tela:ver-previa', (u, id, ack) => ack({ img: previas.get(id) ?? null }));

    socket.on('disconnect', () => {
      const u = eu();
      if (!u) return;
      usuarios.delete(socket.id);
      previas.delete(u.id);
      emitirPresenca();
    });
  });

  return new Promise((resolve, reject) => {
    http.once('error', reject);
    http.listen(porta, host, () => {
      resolve({
        porta,
        host,
        // só resolve depois que a porta foi liberada (dá pra subir de novo na mesma porta logo em seguida)
        fechar: () => new Promise((r) => io.close(() => { clearInterval(timerBackup); db.close(); r(); })),
      });
    });
  });
}

// Bancos da época de um servidor só: tudo vira o primeiro servidor, e o admin mais antigo vira o dono
function migrarServidorUnico(db, novoConvite) {
  if (!db.prepare("SELECT 1 FROM canais WHERE servidor IS NULL AND tipo != 'dm'").get()) return;
  const config = (chave) => db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave)?.valor ?? null;
  const dono = db.prepare('SELECT MIN(id) AS id FROM contas WHERE admin = 1').get().id
    ?? db.prepare('SELECT MIN(id) AS id FROM contas').get().id;
  db.exec('BEGIN');
  try {
    const { lastInsertRowid } = db.prepare('INSERT INTO servidores (nome, icone, dono, convite, criado_em) VALUES (?, ?, ?, ?, ?)')
      .run(config('nome') ?? NOME_SERVIDOR_PADRAO, config('icone'), dono, novoConvite(), Date.now());
    const id = Number(lastInsertRowid);
    db.prepare("UPDATE canais SET servidor = ? WHERE servidor IS NULL AND tipo != 'dm'").run(id);
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
