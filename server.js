import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
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
 * Se `senha` não for vazia, todo mundo precisa dela pra entrar.
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
  `);
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
    io.to('todos').emit('presenca', [...usuarios.values()].map(({ sessao, ...u }) => u));
  }

  io.on('connection', (socket) => {
    const eu = () => usuarios.get(socket.id);

    socket.on('entrar', ({ nome, senha: tentativa, sessao } = {}, ack) => {
      if (typeof ack !== 'function') return;
      nome = String(nome ?? '').trim().slice(0, 32);
      sessao = String(sessao ?? '').slice(0, 64);
      if (!nome) return ack({ erro: 'Escolhe um nome aí' });
      if (senha && tentativa !== senha) return ack({ erro: 'Senha errada' });

      const repetido = [...usuarios.values()].find(
        (o) => o.id !== socket.id && o.nome.toLowerCase() === nome.toLowerCase()
      );
      if (repetido) {
        // Mesmo navegador/app reconectando antes do servidor perceber a queda: derruba a conexão velha
        if (sessao && repetido.sessao === sessao) {
          usuarios.delete(repetido.id);
          io.sockets.sockets.get(repetido.id)?.disconnect(true);
        } else {
          return ack({ erro: `Já tem alguém online como "${repetido.nome}". Escolhe outro nome.` });
        }
      }

      usuarios.set(socket.id, {
        sessao,
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
      ack({ id: socket.id, canaisTexto: CANAIS_TEXTO, canaisVoz: CANAIS_VOZ, iceServers: ICE_SERVERS });
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
  await iniciarServidor({ porta, senha });
  console.log(`Amiguinhos Gamer rodando em http://localhost:${porta}`);
  if (senha) console.log('Senha de entrada ativada.');
}
