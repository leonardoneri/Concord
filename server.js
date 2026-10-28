import express from 'express';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import dns from 'node:dns';
import net from 'node:net';
import https from 'node:https';
import httpComum from 'node:http';
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
const MAX_SOM = 1024 * 1024; // soundboard: sons curtos
const MAX_EMOJI = 256 * 1024; // emoji do servidor (imagem pequena)
const MAX_EMOJIS = 60; // por servidor
const MAX_CARGOS = 20; // por servidor
const COR_RE = /^#[0-9a-f]{6}$/i;
const EMOJI_NOME_RE = /^[a-z0-9_]{2,32}$/;
const EMOJI_CUSTOM_RE = /^:([a-z0-9_]{2,32}):$/;
const DURA_EVENTO = 3 * 60 * 60 * 1000; // evento some da lista 3 h depois de começar
const MAX_EVENTOS = 30; // eventos marcados ao mesmo tempo por servidor
const MAX_SONS = 48; // por servidor
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

// ---------- mapa da chamada (sala pixel art com áudio por proximidade) ----------
const MAPA_MAX = 64; // tamanho máximo do mapa em tiles (o desenho fica no app)
// opções do boneco: quantas escolhas tem cada parte
const BONECO = { pele: 6, cabelo: 6, corCabelo: 8, roupa: 10, calca: 5 };
function limparBoneco(b) {
  if (typeof b !== 'object' || b === null) return null;
  const limpo = {};
  for (const [k, n] of Object.entries(BONECO)) {
    const v = Number(b[k]);
    limpo[k] = Number.isInteger(v) && v >= 0 && v < n ? v : 0;
  }
  return limpo;
}

// ---------- títulos do YouTube (pra fila do "assistir junto") ----------
const MAX_FILA = 200;
const titulosYoutube = new Map(); // id do vídeo -> título (null = privado/apagado)
async function tituloYoutube(id) {
  if (titulosYoutube.has(id)) return titulosYoutube.get(id);
  if (process.env.CONCORD_SEM_TITULOS) return null;
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const titulo = r.ok ? String((await r.json()).title ?? '').slice(0, 200) || null : null;
    titulosYoutube.set(id, titulo);
    if (titulosYoutube.size > 5000) titulosYoutube.delete(titulosYoutube.keys().next().value);
    return titulo;
  } catch {
    return null; // sem internet agora: tenta de novo numa próxima vez
  }
}

// ---------- prévia de links (título, descrição e imagem da página) ----------
// O servidor é quem abre a página, então nunca pode ir pra rede interna (localhost, 10.x, 192.168.x…)
const IPS_INTERNOS = new net.BlockList();
for (const [ip, n] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 3]]) IPS_INTERNOS.addSubnet(ip, n, 'ipv4');
for (const [ip, n] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) IPS_INTERNOS.addSubnet(ip, n, 'ipv6');
function ipInterno(ip) {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  if (v4) ip = v4;
  return IPS_INTERNOS.check(ip, net.isIPv6(ip) ? 'ipv6' : 'ipv4');
}
// resolve o nome e recusa IP interno na hora de conectar (vale também pros redirecionamentos)
function lookupSeguro(host, opcoes, cb) {
  dns.lookup(host, { ...opcoes, all: true }, (err, ips) => {
    if (err) return cb(err);
    if (!ips.length || ips.some((x) => ipInterno(x.address))) return cb(new Error('endereço interno'));
    if (opcoes?.all) cb(null, ips);
    else cb(null, ips[0].address, ips[0].family);
  });
}
const MAX_PAGINA = 768 * 1024;
function baixarPagina(url, saltos = 4) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { return reject(new Error('link inválido')); }
    if (!['http:', 'https:'].includes(u.protocol) || (u.port && !['80', '443'].includes(u.port))) return reject(new Error('link não suportado'));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && ipInterno(u.hostname.replace(/^\[|\]$/g, ''))) return reject(new Error('endereço interno'));
    const req = (u.protocol === 'https:' ? https : httpComum).get(u, {
      lookup: lookupSeguro, timeout: 6000,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ConcordBot/1.0; prévia de links)', accept: 'text/html,application/xhtml+xml', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5' },
    }, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
        r.resume();
        if (!saltos) return reject(new Error('redirecionamentos demais'));
        return resolve(baixarPagina(new URL(r.headers.location, u).href, saltos - 1));
      }
      if (r.statusCode !== 200 || !/text\/html|application\/xhtml/i.test(r.headers['content-type'] ?? '')) {
        r.resume();
        return reject(new Error(`resposta ${r.statusCode}`));
      }
      const partes = [];
      let tamanho = 0;
      const fim = () => {
        const buf = Buffer.concat(partes);
        const charset = /charset=["']?([\w-]+)/i.exec(r.headers['content-type'] ?? '')?.[1]
          ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.toString('latin1', 0, 4096))?.[1] ?? 'utf-8';
        let html;
        try { html = new TextDecoder(charset).decode(buf); } catch { html = buf.toString('utf8'); }
        resolve({ html, url: u.href });
      };
      r.on('data', (d) => {
        partes.push(d);
        tamanho += d.length;
        // as tags que interessam ficam no <head>: não precisa da página inteira
        if (tamanho > MAX_PAGINA) { r.destroy(); fim(); }
      });
      r.on('end', fim);
      r.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('demorou demais')));
    req.on('error', reject);
  });
}
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const desescapar = (t) => t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') {
    const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
    return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  }
  return ENTIDADES[e.toLowerCase()] ?? m;
});
const textoLimpo = (t, max) => {
  t = desescapar(String(t ?? '')).replace(/[\p{C}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
function lerMetaTags(html, base) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attr = {};
    for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) attr[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    const chave = (attr.property ?? attr.name ?? '').toLowerCase();
    if (chave && attr.content != null && !(chave in meta)) meta[chave] = attr.content;
  }
  const titulo = meta['og:title'] ?? meta['twitter:title'] ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  if (!titulo?.trim()) return null;
  let imagem = meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? meta['twitter:image:src'];
  try { imagem = imagem ? new URL(desescapar(imagem.trim()), base).href : null; } catch { imagem = null; }
  const cor = meta['theme-color'];
  return {
    site: textoLimpo(meta['og:site_name'] ?? new URL(base).hostname.replace(/^www\./, ''), 60),
    titulo: textoLimpo(titulo, 200),
    descricao: textoLimpo(meta['og:description'] ?? meta['twitter:description'] ?? meta.description ?? '', 300) || null,
    imagem: imagem?.startsWith('https://') && imagem.length < 1000 ? imagem : null,
    // imagem pequena (ícone, logo) vai do lado; foto/print vai grande embaixo
    grande: (meta['twitter:card'] ?? '') === 'summary_large_image' || Number(meta['og:image:width']) >= 400,
    cor: /^#[0-9a-f]{6}$/i.test(cor ?? '') ? cor : null,
  };
}
const idYoutube = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    const id = host === 'youtu.be' ? u.pathname.slice(1, 12)
      : host === 'youtube.com' ? (u.searchParams.get('v') ?? /^\/(?:shorts|live|embed)\/([\w-]{11})/.exec(u.pathname)?.[1]) : null;
    return /^[\w-]{11}$/.test(id ?? '') ? id : null;
  } catch { return null; }
};
async function buscarPrevia(url) {
  const yt = idYoutube(url);
  if (yt) {
    // YouTube: o oEmbed é mais confiável que a página (que às vezes cai na tela de cookies)
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${yt}`)}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const d = await r.json();
    return { site: 'YouTube', titulo: textoLimpo(d.title, 200), descricao: d.author_name ? textoLimpo(d.author_name, 100) : null,
      imagem: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`, grande: true, cor: '#ff0000', youtube: yt };
  }
  const { html, url: final } = await baixarPagina(url);
  const fimHead = html.search(/<\/head>|<body/i);
  return lerMetaTags(fimHead > 0 ? html.slice(0, fimHead) : html, final);
}
const cachePrevias = new Map(); // url -> { em, previa | promessa }
function previaDoLink(url) {
  const guardado = cachePrevias.get(url);
  if (guardado && Date.now() - guardado.em < (guardado.previa === null ? 10 * 60e3 : 6 * 3600e3)) return guardado.promessa;
  const promessa = buscarPrevia(url).catch(() => null);
  const item = { em: Date.now(), promessa, previa: undefined };
  promessa.then((previa) => (item.previa = previa));
  cachePrevias.set(url, item);
  if (cachePrevias.size > 2000) cachePrevias.delete(cachePrevias.keys().next().value);
  return promessa;
}

// ---------- GIFs: Tenor (TENOR_KEY) ou GIPHY (GIPHY_KEY), com cache curto pra economizar a cota ----------
const chaveGif = () => ({ tenor: process.env.TENOR_KEY || '', giphy: process.env.GIPHY_KEY || '' });
const cacheGifs = new Map(); // termo -> { em, gifs }
async function buscarGifs(termo) {
  const GIF_CHAVE = chaveGif();
  const chave = `${GIF_CHAVE.tenor ? 't' : 'g'}:${termo.toLowerCase()}`;
  const guardado = cacheGifs.get(chave);
  if (guardado && Date.now() - guardado.em < 10 * 60e3) return guardado.gifs;
  let gifs;
  if (GIF_CHAVE.tenor) {
    const q = new URLSearchParams({ key: GIF_CHAVE.tenor, client_key: 'concord', limit: '30', contentfilter: 'medium', locale: 'pt_BR', media_filter: 'gif,tinygif' });
    if (termo) q.set('q', termo);
    const r = await fetch(`https://tenor.googleapis.com/v2/${termo ? 'search' : 'featured'}?${q}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Tenor ${r.status}`);
    gifs = (await r.json()).results.map((g) => ({
      url: g.media_formats.gif?.url, previa: g.media_formats.tinygif?.url ?? g.media_formats.gif?.url,
      largura: g.media_formats.tinygif?.dims?.[0], altura: g.media_formats.tinygif?.dims?.[1], titulo: g.content_description ?? '',
    }));
  } else {
    const q = new URLSearchParams({ api_key: GIF_CHAVE.giphy, limit: '30', rating: 'pg-13', lang: 'pt' });
    if (termo) q.set('q', termo);
    const r = await fetch(`https://api.giphy.com/v1/gifs/${termo ? 'search' : 'trending'}?${q}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`GIPHY ${r.status}`);
    gifs = (await r.json()).data.map((g) => ({
      url: g.images.downsized?.url ?? g.images.original?.url, previa: g.images.fixed_width?.url,
      largura: Number(g.images.fixed_width?.width), altura: Number(g.images.fixed_width?.height), titulo: g.title ?? '',
    }));
  }
  // só links https de imagem (é isso que vai pro chat)
  gifs = gifs.filter((g) => /^https:\/\/[^\s<]+$/.test(g.url ?? '') && /^https:\/\/[^\s<]+$/.test(g.previa ?? ''));
  cacheGifs.set(chave, { em: Date.now(), gifs });
  if (cacheGifs.size > 300) cacheGifs.delete(cacheGifs.keys().next().value);
  return gifs;
}

// Formato do som pela assinatura (mp3, ogg, wav, m4a, webm)
function extensaoDoSom(buf) {
  const h = buf.subarray(0, 12);
  if (h.toString('ascii', 0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'mp3';
  if (h.toString('ascii', 0, 4) === 'OggS') return 'ogg';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WAVE') return 'wav';
  if (h.toString('ascii', 4, 8) === 'ftyp') return 'm4a';
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'webm';
  return null;
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
    CREATE TABLE IF NOT EXISTS cargos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      servidor INTEGER NOT NULL,
      nome TEXT NOT NULL,
      cor TEXT NOT NULL,
      posicao INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS membro_cargos (
      servidor INTEGER NOT NULL,
      conta INTEGER NOT NULL,
      cargo INTEGER NOT NULL,
      PRIMARY KEY (conta, cargo)
    );
    CREATE TABLE IF NOT EXISTS canal_cargos (
      canal INTEGER NOT NULL,
      cargo INTEGER NOT NULL,
      PRIMARY KEY (canal, cargo)
    );
    CREATE TABLE IF NOT EXISTS emojis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      servidor INTEGER NOT NULL,
      nome TEXT NOT NULL,
      url TEXT NOT NULL,
      conta INTEGER NOT NULL,
      criado_em INTEGER NOT NULL,
      UNIQUE (servidor, nome)
    );
    CREATE TABLE IF NOT EXISTS eventos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      servidor INTEGER NOT NULL,
      titulo TEXT NOT NULL,
      descricao TEXT NOT NULL DEFAULT '',
      inicio INTEGER NOT NULL,
      canal INTEGER,
      conta INTEGER NOT NULL,
      criado_em INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS presencas (
      evento INTEGER NOT NULL,
      conta INTEGER NOT NULL,
      PRIMARY KEY (evento, conta)
    );
    CREATE TABLE IF NOT EXISTS votos (
      mensagem INTEGER NOT NULL,
      conta INTEGER NOT NULL,
      opcao INTEGER NOT NULL,
      PRIMARY KEY (mensagem, conta, opcao)
    );
    CREATE TABLE IF NOT EXISTS sons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      servidor INTEGER NOT NULL,
      nome TEXT NOT NULL,
      emoji TEXT NOT NULL,
      url TEXT NOT NULL,
      conta INTEGER NOT NULL,
      criado_em INTEGER NOT NULL
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
    mensagens: { conta: 'INTEGER', editado_em: 'INTEGER', fixada: 'INTEGER NOT NULL DEFAULT 0', canal_id: 'INTEGER', resposta: 'INTEGER', enquete: 'TEXT' },
    canais: { servidor: 'INTEGER', privado: 'INTEGER NOT NULL DEFAULT 0' },
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
    sonsDo: db.prepare('SELECT id, nome, emoji, url, conta FROM sons WHERE servidor = ? ORDER BY id'),
    som: db.prepare('SELECT * FROM sons WHERE id = ?'),
    contarSons: db.prepare('SELECT COUNT(*) AS n FROM sons WHERE servidor = ?'),
    criarSom: db.prepare('INSERT INTO sons (servidor, nome, emoji, url, conta, criado_em) VALUES (?, ?, ?, ?, ?, ?)'),
    apagarSom: db.prepare('DELETE FROM sons WHERE id = ?'),
    apagarSonsDo: db.prepare('DELETE FROM sons WHERE servidor = ?'),
    // cargos (ordem = posicao: o primeiro é o "mais alto", que dá a cor do nome)
    cargosDo: db.prepare('SELECT id, nome, cor FROM cargos WHERE servidor = ? ORDER BY posicao, id'),
    cargo: db.prepare('SELECT * FROM cargos WHERE id = ?'),
    criarCargo: db.prepare('INSERT INTO cargos (servidor, nome, cor, posicao) VALUES (?, ?, ?, (SELECT COALESCE(MAX(posicao), -1) + 1 FROM cargos WHERE servidor = ?))'),
    editarCargo: db.prepare('UPDATE cargos SET nome = ?, cor = ? WHERE id = ?'),
    posicaoCargo: db.prepare('UPDATE cargos SET posicao = ? WHERE id = ?'),
    apagarCargo: db.prepare('DELETE FROM cargos WHERE id = ?'),
    tirarCargoDeTodos: db.prepare('DELETE FROM membro_cargos WHERE cargo = ?'),
    tirarCargoDosCanais: db.prepare('DELETE FROM canal_cargos WHERE cargo = ?'),
    cargosDosMembros: db.prepare(`SELECT mc.conta, mc.cargo FROM membro_cargos mc JOIN cargos c ON c.id = mc.cargo
      WHERE mc.servidor = ? ORDER BY c.posicao, c.id`),
    darCargo: db.prepare('INSERT OR IGNORE INTO membro_cargos (servidor, conta, cargo) VALUES (?, ?, ?)'),
    tirarCargo: db.prepare('DELETE FROM membro_cargos WHERE conta = ? AND cargo = ?'),
    tirarCargosDe: db.prepare('DELETE FROM membro_cargos WHERE servidor = ? AND conta = ?'),
    apagarCargosDo: db.prepare('DELETE FROM cargos WHERE servidor = ?'),
    apagarMembroCargosDo: db.prepare('DELETE FROM membro_cargos WHERE servidor = ?'),
    // canais privados: quem tem um dos cargos liberados (admins sempre veem)
    cargosDoCanal: db.prepare('SELECT cargo FROM canal_cargos WHERE canal = ?'),
    liberarCanal: db.prepare('INSERT OR IGNORE INTO canal_cargos (canal, cargo) VALUES (?, ?)'),
    limparAcessoDoCanal: db.prepare('DELETE FROM canal_cargos WHERE canal = ?'),
    privarCanal: db.prepare('UPDATE canais SET privado = ? WHERE id = ?'),
    temAcesso: db.prepare('SELECT 1 FROM canal_cargos cc JOIN membro_cargos mc ON mc.cargo = cc.cargo WHERE cc.canal = ? AND mc.conta = ?'),
    emojisDo: db.prepare('SELECT nome, url FROM emojis WHERE servidor = ? ORDER BY nome'),
    emojiDo: db.prepare('SELECT * FROM emojis WHERE servidor = ? AND nome = ?'),
    contarEmojis: db.prepare('SELECT COUNT(*) AS n FROM emojis WHERE servidor = ?'),
    criarEmoji: db.prepare('INSERT INTO emojis (servidor, nome, url, conta, criado_em) VALUES (?, ?, ?, ?, ?)'),
    apagarEmoji: db.prepare('DELETE FROM emojis WHERE id = ?'),
    apagarEmojisDo: db.prepare('DELETE FROM emojis WHERE servidor = ?'),
    // eventos que ainda não acabaram (some 3 h depois de começar)
    eventosDo: db.prepare('SELECT * FROM eventos WHERE servidor = ? AND inicio > ? ORDER BY inicio'),
    evento: db.prepare('SELECT * FROM eventos WHERE id = ?'),
    contarEventos: db.prepare('SELECT COUNT(*) AS n FROM eventos WHERE servidor = ? AND inicio > ?'),
    criarEvento: db.prepare('INSERT INTO eventos (servidor, titulo, descricao, inicio, canal, conta, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    apagarEvento: db.prepare('DELETE FROM eventos WHERE id = ?'),
    apagarEventosDo: db.prepare('DELETE FROM eventos WHERE servidor = ?'),
    presencasDe: db.prepare('SELECT conta FROM presencas WHERE evento = ? ORDER BY rowid'),
    temPresenca: db.prepare('SELECT 1 FROM presencas WHERE evento = ? AND conta = ?'),
    confirmar: db.prepare('INSERT OR IGNORE INTO presencas (evento, conta) VALUES (?, ?)'),
    desconfirmar: db.prepare('DELETE FROM presencas WHERE evento = ? AND conta = ?'),
    apagarPresencas: db.prepare('DELETE FROM presencas WHERE evento = ?'),
    meusEventos: db.prepare(`SELECT e.* FROM eventos e JOIN presencas p ON p.evento = e.id JOIN membros m ON m.servidor = e.servidor AND m.conta = p.conta
      WHERE p.conta = ? AND e.inicio > ? ORDER BY e.inicio`),
    temReacao: db.prepare('SELECT 1 FROM reacoes WHERE mensagem = ? AND conta = ? AND emoji = ?'),
    emojisDiferentes: db.prepare('SELECT COUNT(DISTINCT emoji) AS n FROM reacoes WHERE mensagem = ?'),
    reagir: db.prepare('INSERT INTO reacoes (mensagem, conta, emoji) VALUES (?, ?, ?)'),
    desreagir: db.prepare('DELETE FROM reacoes WHERE mensagem = ? AND conta = ? AND emoji = ?'),
    apagarReacoes: db.prepare('DELETE FROM reacoes WHERE mensagem = ?'),
    votosDe: db.prepare('SELECT conta, opcao FROM votos WHERE mensagem = ? ORDER BY rowid'),
    votar: db.prepare('INSERT OR IGNORE INTO votos (mensagem, conta, opcao) VALUES (?, ?, ?)'),
    desvotar: db.prepare('DELETE FROM votos WHERE mensagem = ? AND conta = ? AND opcao = ?'),
    desvotarTudo: db.prepare('DELETE FROM votos WHERE mensagem = ? AND conta = ?'),
    apagarVotos: db.prepare('DELETE FROM votos WHERE mensagem = ?'),
    criarEnquete: db.prepare('INSERT INTO mensagens (canal, canal_id, autor, cor, texto, criado_em, conta, enquete) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    apagarReacoesDoCanal: db.prepare('DELETE FROM reacoes WHERE mensagem IN (SELECT id FROM mensagens WHERE canal_id = ?)'),
    apagarVotosDoCanal: db.prepare('DELETE FROM votos WHERE mensagem IN (SELECT id FROM mensagens WHERE canal_id = ?)'),
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
  // `conta`: só os canais que essa pessoa pode ver (canais privados)
  function estadoServidor(id, conta) {
    const s = sql.servidor.get(id);
    return {
      ...resumoServidor(s),
      convite: s.convite,
      canais: sql.canaisDo.all(id).filter((c) => podeVerCanal(c, conta)).map(({ id: cid, tipo, nome, topico, privado }) => ({
        id: cid, tipo, nome, topico, privado: !!privado, cargos: privado ? sql.cargosDoCanal.all(cid).map((x) => x.cargo) : [],
      })),
      cargos: sql.cargosDo.all(id),
      eventos: sql.eventosDo.all(id, Date.now() - DURA_EVENTO).map(eventoPublico),
      emojis: sql.emojisDo.all(id),
    };
  }
  function eventoPublico(e) {
    return {
      id: e.id, servidor: e.servidor, titulo: e.titulo, descricao: e.descricao, inicio: e.inicio, canal: e.canal,
      conta: e.conta, autor: sql.contaPorId.get(e.conta)?.nome ?? 'alguém',
      confirmados: sql.presencasDe.all(e.id).map((p) => p.conta),
    };
  }
  function perfisDo(id) {
    const dono = sql.servidor.get(id)?.dono;
    const cargos = new Map();
    for (const { conta, cargo } of sql.cargosDosMembros.all(id)) {
      if (!cargos.has(conta)) cargos.set(conta, []);
      cargos.get(conta).push(cargo);
    }
    return sql.perfis.all(id).map((p) => ({
      ...p, cor: corDaConta(p), admin: !!p.admin || p.id === dono, dono: p.id === dono, cargos: cargos.get(p.id) ?? [],
    }));
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
    resposta: respostaDe(m.resposta), reacoes: reacoesDe(m.id), enquete: enqueteDe(m),
  });
  // { pergunta, multipla, opcoes: [{ texto, contas }] } com quem votou em cada opção
  function enqueteDe(m) {
    if (!m.enquete) return undefined;
    let e;
    try {
      e = JSON.parse(m.enquete);
    } catch {
      return undefined;
    }
    const opcoes = e.opcoes.map((texto) => ({ texto, contas: [] }));
    for (const v of sql.votosDe.all(m.id)) opcoes[v.opcao]?.contas.push(v.conta);
    return { pergunta: e.pergunta, multipla: !!e.multipla, opcoes };
  }

  // ---------- conversas diretas ----------
  const ehDm = (c) => c.tipo === 'dm';
  const contasDoDm = (c) => c.nome.split(':').map(Number);
  const nomeDm = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
  const podeVerCanal = (c, conta) => {
    if (ehDm(c)) return contasDoDm(c).includes(conta);
    if (!ehMembro(c.servidor, conta)) return false;
    return !c.privado || ehAdminDe(c.servidor, conta) || !!sql.temAcesso.get(c.id, conta);
  };
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
  // "Assistir junto": canal de voz -> { video, por, tocando, posicao, em } (posicao em segundos no instante `em`)
  const assistindo = new Map();
  // canais de voz com o mapa ligado (a posição e o boneco ficam em cada usuário: u.pos, u.boneco)
  const mapas = new Set();
  const sala = (srv) => `s:${srv}`;

  // Cada um vê quem é do servidor aberto + quem está na mesma call (que pode ser de outro servidor)
  const publico = ({ id, conta, nome, cor, voz, mudo, surdo, mic, camera, tela, status, statusTexto, jogo, rede }) =>
    ({ id, conta, nome, cor, voz, mudo, surdo, mic, camera, tela, status, statusTexto, jogo, rede });
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
  // cada um recebe só os canais que pode ver
  function emitirServidor(srv) {
    const porConta = new Map();
    for (const sid of io.sockets.adapter.rooms.get(sala(srv)) ?? []) {
      const u = usuarios.get(sid);
      if (!u) continue;
      if (!porConta.has(u.conta)) porConta.set(u.conta, estadoServidor(srv, u.conta));
      io.to(sid).emit('servidor', porConta.get(u.conta));
    }
  }
  // cargos/admin/canal privado mudaram: atualiza a lista de canais e tira da call quem perdeu acesso à sala
  function acessoMudou(srv) {
    emitirServidor(srv);
    const privadas = canaisDe(srv, 'voz').filter((c) => c.privado);
    tirarDaVoz((o) => privadas.some((c) => c.id === o.voz && !podeVerCanal(c, o.conta)));
    limparAssistir();
    emitirPresenca();
  }
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
    sql.tirarCargosDe.run(srv, conta);
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
    } else if (c.privado) {
      for (const sid of io.sockets.adapter.rooms.get(sala(c.servidor)) ?? []) {
        const u = usuarios.get(sid);
        if (sid !== semSocket && u && podeVerCanal(c, u.conta)) io.to(sid).emit(evento, dados);
      }
    } else if (semSocket) {
      io.sockets.sockets.get(semSocket)?.to(sala(c.servidor)).emit(evento, dados);
    } else {
      io.to(sala(c.servidor)).emit(evento, dados);
    }
  }

  // Tira da call quem estava num canal de voz que deixou de existir / que a pessoa não pode mais ver
  // Estado do "assistir junto" com a posição de agora (quem recebe não precisa acertar relógio)
  // a = { fila: [{ video, titulo, por }], atual (índice na fila), tocando, posicao, em }
  function assistirPublico(canal) {
    const a = assistindo.get(canal);
    if (!a) return null;
    const posicao = a.tocando ? a.posicao + (Date.now() - a.em) / 1000 : a.posicao;
    const item = a.fila[a.atual];
    return {
      video: item.video, titulo: item.titulo ?? null, por: item.por, tocando: a.tocando, posicao, atual: a.atual,
      fila: a.fila.map(({ video, titulo, por }) => ({ video, titulo: titulo ?? null, por })),
    };
  }
  // títulos dos vídeos da fila chegam aos poucos (oEmbed do YouTube não precisa de chave)
  async function buscarTitulos(canal) {
    const a = assistindo.get(canal);
    if (!a || a.buscandoTitulos) return;
    a.buscandoTitulos = true;
    try {
      let novos = 0;
      for (let i = 0; i < a.fila.length; i++) {
        if (a.fila[i].titulo !== undefined) continue;
        a.fila[i].titulo = await tituloYoutube(a.fila[i].video);
        if (assistindo.get(canal) !== a) return;
        if (++novos % 10 === 0) emitirAssistir(canal);
      }
      if (novos) emitirAssistir(canal);
    } finally {
      a.buscandoTitulos = false;
    }
  }
  function emitirAssistir(canal) {
    const dados = assistirPublico(canal);
    for (const o of usuarios.values()) if (o.voz === canal) io.to(o.socket).emit('assistir', dados);
  }
  // sala vazia: para o vídeo (e desliga o mapa)
  function limparAssistir() {
    for (const canal of assistindo.keys()) {
      if (![...usuarios.values()].some((o) => o.voz === canal)) assistindo.delete(canal);
    }
    for (const canal of mapas) {
      if (![...usuarios.values()].some((o) => o.voz === canal)) mapas.delete(canal);
    }
  }

  // mapa: quem está na sala, onde está e com que boneco
  function mapaPublico(canal) {
    if (!mapas.has(canal)) return null;
    const pessoas = [...usuarios.values()].filter((o) => o.voz === canal && o.pos)
      .map((o) => ({ id: o.id, ...o.pos, boneco: o.boneco ?? null }));
    return { pessoas };
  }
  function emitirMapa(canal, semSocket = null) {
    const dados = mapaPublico(canal);
    for (const o of usuarios.values()) if (o.voz === canal && o.socket !== semSocket) io.to(o.socket).emit('mapa', dados);
  }

  function tirarDaVoz(filtro) {
    for (const o of usuarios.values()) {
      if (o.voz != null && filtro(o)) {
        Object.assign(o, { voz: null, mic: null, camera: null, tela: null, pos: null });
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
        // eventos que eu confirmei (de todos os servidores), pros lembretes
        eventos: sql.meusEventos.all(conta.id, Date.now() - DURA_EVENTO).map(eventoPublico),
        voz,
      });
      emitirPresenca();
    });

    // ---------- servidores ----------
    quando('servidor:abrir', (u, id, ack) => {
      id = Number(id);
      if (!ehMembro(id, u.conta)) return ack({ erro: 'Você não está nesse servidor' });
      u.servidor = id;
      ack({ servidor: estadoServidor(id, u.conta), perfis: perfisDo(id) });
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
        sql.limparAcessoDoCanal.run(c.id);
        sql.apagarReacoesDoCanal.run(c.id);
        sql.apagarVotosDoCanal.run(c.id);
        sql.apagarMensagensDoCanal.run(c.id);
        sql.apagarCanal.run(c.id);
      });
      sql.apagarMembros.run(s.id);
      sql.apagarServidor.run(s.id);
      sql.apagarSonsDo.run(s.id);
      sql.apagarEmojisDo.run(s.id);
      sql.apagarCargosDo.run(s.id);
      sql.apagarMembroCargosDo.run(s.id);
      sql.apagarEventosDo.run(s.id);
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
      acessoMudou(srv);
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

    // privado = só admins e quem tem um dos `cargos` vê o canal
    quando('canal:acesso', (u, { id, privado, cargos } = {}, ack) => {
      const canal = canalDoAdmin(u, id);
      if (!canal) return ack({ erro: 'Só admin pode fazer isso' });
      const validos = new Set(sql.cargosDo.all(canal.servidor).map((c) => c.id));
      sql.privarCanal.run(privado ? 1 : 0, canal.id);
      sql.limparAcessoDoCanal.run(canal.id);
      if (privado) for (const c of Array.isArray(cargos) ? cargos : []) if (validos.has(Number(c))) sql.liberarCanal.run(canal.id, Number(c));
      acessoMudou(canal.servidor);
      ack({});
    });

    // ---------- cargos (nome colorido; liberam canais privados) ----------
    const cargoDoServidor = (id, srv) => {
      const c = sql.cargo.get(Number(id));
      return c?.servidor === srv ? c : null;
    };
    const mudouCargos = (srv) => {
      emitirPerfis(srv);
      acessoMudou(srv);
    };
    quandoAdmin('cargo:criar', (u, { nome, cor } = {}, ack, srv) => {
      nome = limparLinha(nome, 24);
      if (!nome) return ack({ erro: 'Dá um nome pro cargo' });
      if (!COR_RE.test(cor ?? '')) return ack({ erro: 'Cor inválida' });
      const lista = sql.cargosDo.all(srv);
      if (lista.length >= MAX_CARGOS) return ack({ erro: `Limite de ${MAX_CARGOS} cargos` });
      if (lista.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) return ack({ erro: `Já existe o cargo "${nome}"` });
      const { lastInsertRowid } = sql.criarCargo.run(srv, nome, cor, srv);
      mudouCargos(srv);
      ack({ id: Number(lastInsertRowid) });
    });
    quandoAdmin('cargo:editar', (u, { id, nome, cor } = {}, ack, srv) => {
      const c = cargoDoServidor(id, srv);
      if (!c) return ack({ erro: 'Cargo não encontrado' });
      nome = nome == null ? c.nome : limparLinha(nome, 24);
      cor = cor ?? c.cor;
      if (!nome) return ack({ erro: 'Dá um nome pro cargo' });
      if (!COR_RE.test(cor)) return ack({ erro: 'Cor inválida' });
      if (sql.cargosDo.all(srv).some((x) => x.id !== c.id && x.nome.toLowerCase() === nome.toLowerCase())) return ack({ erro: `Já existe o cargo "${nome}"` });
      sql.editarCargo.run(nome, cor, c.id);
      mudouCargos(srv);
      ack({});
    });
    quandoAdmin('cargo:mover', (u, { id, direcao } = {}, ack, srv) => {
      const lista = sql.cargosDo.all(srv);
      const i = lista.findIndex((c) => c.id === Number(id));
      const j = i + (direcao < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= lista.length) return ack({});
      [lista[i], lista[j]] = [lista[j], lista[i]];
      lista.forEach((c, pos) => sql.posicaoCargo.run(pos, c.id));
      mudouCargos(srv);
      ack({});
    });
    quandoAdmin('cargo:apagar', (u, id, ack, srv) => {
      const c = cargoDoServidor(id, srv);
      if (!c) return ack({});
      sql.tirarCargoDeTodos.run(c.id);
      sql.tirarCargoDosCanais.run(c.id);
      sql.apagarCargo.run(c.id);
      mudouCargos(srv);
      ack({});
    });
    quandoAdmin('cargo:dar', (u, { conta, cargo, dar } = {}, ack, srv) => {
      conta = Number(conta);
      const c = cargoDoServidor(cargo, srv);
      if (!c) return ack({ erro: 'Cargo não encontrado' });
      if (!ehMembro(srv, conta)) return ack({ erro: 'Essa pessoa não está no servidor' });
      if (dar) sql.darCargo.run(srv, conta, c.id);
      else sql.tirarCargo.run(conta, c.id);
      mudouCargos(srv);
      ack({});
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
      sql.limparAcessoDoCanal.run(canal.id);
      if (canal.tipo === 'texto') {
        sql.apagarReacoesDoCanal.run(canal.id);
        sql.apagarVotosDoCanal.run(canal.id);
        sql.apagarMensagensDoCanal.run(canal.id);
      } else {
        tirarDaVoz((o) => o.voz === canal.id);
      }
      emitirNoCanal(canal, 'canal:apagado', { id: canal.id, tipo: canal.tipo, nome: canal.nome, servidor: canal.servidor });
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
      const canais = u.servidor === 'dm' ? dmsDa(u.conta) : u.servidor ? canaisDe(u.servidor, 'texto').filter((c) => podeVerCanal(c, u.conta)) : [];
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
      if (m.enquete) return ack({ erro: 'Enquete não dá pra editar (apague e crie outra)' });
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
      sql.apagarVotos.run(m.id);
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
      const custom = emoji.match(EMOJI_CUSTOM_RE);
      const valido = custom ? !!(c.servidor && sql.emojiDo.get(c.servidor, custom[1])) : emoji.length <= 32 && EMOJI_RE.test(emoji);
      if (!valido) return ack({ erro: 'Emoji inválido' });
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

    // ---------- eventos agendados ----------
    quando('evento:criar', (u, { servidor: srv, titulo, descricao, inicio, canal } = {}, ack) => {
      srv = Number(srv);
      if (!ehMembro(srv, u.conta)) return ack({ erro: 'Você não está nesse servidor' });
      if (sql.contarEventos.get(srv, Date.now() - DURA_EVENTO).n >= MAX_EVENTOS) return ack({ erro: 'Muitos eventos marcados nesse servidor' });
      titulo = limparLinha(titulo, 80);
      if (!titulo) return ack({ erro: 'Dá um nome pro evento' });
      descricao = String(descricao ?? '').replace(/[^\P{C}\n]/gu, '').trim().slice(0, 500);
      inicio = Number(inicio);
      if (!Number.isFinite(inicio) || inicio < Date.now() - 60_000) return ack({ erro: 'Escolhe uma data e hora no futuro' });
      if (inicio > Date.now() + 366 * 24 * 3600 * 1000) return ack({ erro: 'No máximo daqui a um ano' });
      const salaVoz = canal ? sql.canal.get(Number(canal)) : null;
      const canalOk = salaVoz && salaVoz.servidor === srv && salaVoz.tipo === 'voz' ? salaVoz.id : null;
      const { lastInsertRowid } = sql.criarEvento.run(srv, titulo, descricao, Math.round(inicio), canalOk, u.conta, Date.now());
      sql.confirmar.run(Number(lastInsertRowid), u.conta); // quem cria já vai
      emitirServidor(srv);
      io.to(sala(srv)).emit('evento:novo', eventoPublico(sql.evento.get(Number(lastInsertRowid))));
      ack({ id: Number(lastInsertRowid) });
    });
    quando('evento:confirmar', (u, id, ack) => {
      const e = sql.evento.get(Number(id));
      if (!e || !ehMembro(e.servidor, u.conta)) return ack({ erro: 'Evento não encontrado' });
      if (sql.temPresenca.get(e.id, u.conta)) sql.desconfirmar.run(e.id, u.conta);
      else sql.confirmar.run(e.id, u.conta);
      emitirServidor(e.servidor);
      ack({});
    });
    quando('evento:apagar', (u, id, ack) => {
      const e = sql.evento.get(Number(id));
      if (!e) return ack({});
      if (e.conta !== u.conta && !ehAdminDe(e.servidor, u.conta)) return ack({ erro: 'Só quem criou ou um admin pode cancelar' });
      sql.apagarPresencas.run(e.id);
      sql.apagarEvento.run(e.id);
      emitirServidor(e.servidor);
      ack({});
    });

    // ---------- emojis do servidor (admins sobem, todo mundo usa) ----------
    quandoAdmin('emoji:enviar', async (u, { nome, dados } = {}, ack, srv) => {
      nome = String(nome ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (!EMOJI_NOME_RE.test(nome)) return ack({ erro: 'Nome de 2 a 32 letras, números ou _ (ex.: leo_rindo)' });
      if (sql.emojiDo.get(srv, nome)) return ack({ erro: `Já existe o :${nome}:` });
      if (sql.contarEmojis.get(srv).n >= MAX_EMOJIS) return ack({ erro: `O servidor já tem ${MAX_EMOJIS} emojis` });
      if (!Buffer.isBuffer(dados) || !dados.length) return ack({ erro: 'Imagem vazia' });
      if (dados.length > MAX_EMOJI) return ack({ erro: 'Imagem grande demais pra emoji (máx. 256 KB)' });
      if (!extensaoDaImagem(dados)) return ack({ erro: 'Use PNG, JPG, GIF ou WebP' });
      const r = await salvarImagem(dados);
      if (r.erro) return ack(r);
      sql.criarEmoji.run(srv, nome, r.url, u.conta, Date.now());
      emitirServidor(srv);
      ack({ nome });
    });
    quandoAdmin('emoji:apagar', (u, nome, ack, srv) => {
      const e = sql.emojiDo.get(srv, String(nome ?? ''));
      if (!e) return ack({});
      sql.apagarEmoji.run(e.id);
      emitirServidor(srv);
      ack({});
    });

    // ---------- GIFs (o servidor busca, pra chave da API não ir pros clientes) ----------
    let ultimaBuscaGif = 0;
    quando('gifs:buscar', async (u, termo, ack) => {
      const GIF_CHAVE = chaveGif();
      if (!GIF_CHAVE.tenor && !GIF_CHAVE.giphy) return ack({ erro: 'semChave' });
      if (Date.now() - ultimaBuscaGif < 400) return ack({ erro: 'Calma' });
      ultimaBuscaGif = Date.now();
      termo = limparLinha(termo, 60);
      try {
        ack({ gifs: await buscarGifs(termo), fonte: GIF_CHAVE.tenor ? 'Tenor' : 'GIPHY' });
      } catch (err) {
        console.error('Busca de GIF', err.message);
        ack({ erro: 'A busca de GIF não respondeu agora. Tenta de novo.' });
      }
    });

    // ---------- prévia de links ----------
    let previasPedidas = [];
    quando('link:previa', async (u, url, ack) => {
      if (typeof url !== 'string' || url.length > 1000 || !/^https?:\/\/[^\s<]+$/.test(url)) return ack(null);
      // o mesmo link já buscado não conta; link novo: no máx. 30 por minuto por conexão
      if (!cachePrevias.has(url)) {
        previasPedidas = previasPedidas.filter((t) => Date.now() - t < 60e3);
        if (previasPedidas.length >= 30) return ack(null);
        previasPedidas.push(Date.now());
      }
      ack(await previaDoLink(url));
    });

    // ---------- sortear times com quem está na chamada ----------
    quando('times:sortear', (u, { canal, times } = {}, ack) => {
      if (u.voz == null) return ack({ erro: 'Entra numa sala de voz primeiro' });
      const voz = sql.canal.get(u.voz);
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!voz || !c || c.servidor !== voz.servidor) return ack({ erro: 'Abre um canal de texto do servidor da chamada pra mandar o resultado' });
      const nomes = new Map(); // uma vez por conta (mesmo com o app aberto em 2 lugares)
      for (const x of usuarios.values()) if (x.voz === u.voz && !nomes.has(x.conta)) nomes.set(x.conta, x.nome);
      const lista = [...nomes.values()];
      times = Math.trunc(Number(times));
      if (!(times >= 2 && times <= 4)) return ack({ erro: 'Escolhe de 2 a 4 times' });
      if (lista.length < times) return ack({ erro: `Precisa de pelo menos ${times} pessoas na chamada` });
      for (let i = lista.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [lista[i], lista[j]] = [lista[j], lista[i]];
      }
      const grupos = Array.from({ length: times }, (_, t) => lista.filter((_, i) => i % times === t));
      const texto = [`🎲 **Times sorteados** (${voz.nome})`, ...grupos.map((g, t) => `**Time ${t + 1}:** ${g.join(', ')}`)].join('\n');
      publicar(u, c, texto);
      for (const o of usuarios.values()) if (o.voz === u.voz) io.to(o.socket).emit('times', { por: u.nome, grupos });
      ack({});
    });

    // ---------- enquetes ----------
    const limparLinha = (t, max) => String(t ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, max);
    quando('enquete:criar', (u, { canal, pergunta, opcoes, multipla } = {}, ack) => {
      const c = canalDoMembro(canal, u.conta, 'texto');
      if (!c) return ack({ erro: 'Esse canal não existe mais' });
      pergunta = limparLinha(pergunta, 200);
      if (!pergunta) return ack({ erro: 'Escreve a pergunta' });
      opcoes = (Array.isArray(opcoes) ? opcoes : []).map((o) => limparLinha(o, 80)).filter(Boolean);
      opcoes = [...new Set(opcoes)].slice(0, 10);
      if (opcoes.length < 2) return ack({ erro: 'Coloca pelo menos 2 opções diferentes' });
      const enquete = JSON.stringify({ pergunta, opcoes, multipla: !!multipla });
      const { lastInsertRowid } = sql.criarEnquete.run(c.nome, c.id, u.nome, u.cor, `📊 ${pergunta}`, Date.now(), u.conta, enquete);
      emitirNoCanal(c, 'mensagem', msgPublica(sql.mensagem.get(Number(lastInsertRowid)), c.servidor));
      ack({});
    });
    quando('enquete:votar', (u, { id, opcao } = {}, ack) => {
      const { m, c } = mensagemDoMembro(id, u.conta);
      const e = m && enqueteDe(m);
      if (!e) return ack({ erro: 'Enquete não encontrada' });
      opcao = Number(opcao);
      if (!Number.isInteger(opcao) || opcao < 0 || opcao >= e.opcoes.length) return ack({ erro: 'Opção inválida' });
      // clicar de novo tira o voto; numa enquete de uma resposta só, votar troca o voto
      if (e.opcoes[opcao].contas.includes(u.conta)) sql.desvotar.run(m.id, u.conta, opcao);
      else {
        if (!e.multipla) sql.desvotarTudo.run(m.id, u.conta);
        sql.votar.run(m.id, u.conta, opcao);
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
      u.pos = null;
      previas.delete(u.id);
      const outros = [...usuarios.values()].filter((o) => o.voz === c.id && o.id !== u.id).map((o) => o.id);
      emitirPresenca();
      limparAssistir(); // se trocou de sala, a antiga pode ter ficado vazia
      ack(outros);
    });

    // ---------- soundboard: sons do servidor da sala, tocados pra todo mundo na chamada ----------
    const emitirSons = (srv) => io.to(sala(srv)).emit('sons', { servidor: srv, sons: sql.sonsDo.all(srv) });
    quando('sons:lista', (u, srv, ack) => {
      srv = Number(srv);
      if (!ehMembro(srv, u.conta)) return ack({ erro: 'Você não está nesse servidor' });
      ack({ sons: sql.sonsDo.all(srv) });
    });
    quando('som:enviar', async (u, { servidor: srv, nome, emoji, dados } = {}, ack) => {
      srv = Number(srv);
      if (!ehMembro(srv, u.conta)) return ack({ erro: 'Você não está nesse servidor' });
      if (sql.contarSons.get(srv).n >= MAX_SONS) return ack({ erro: `O servidor já tem ${MAX_SONS} sons. Apague algum antes.` });
      nome = String(nome ?? '').replace(/[\p{C}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (!nome) return ack({ erro: 'Dá um nome pro som' });
      emoji = typeof emoji === 'string' && EMOJI_RE.test(emoji) ? emoji : '🔊';
      if (!Buffer.isBuffer(dados) || !dados.length) return ack({ erro: 'Arquivo vazio' });
      if (dados.length > MAX_SOM) return ack({ erro: 'Som grande demais (máx. 1 MB, uns segundos)' });
      const ext = extensaoDoSom(dados);
      if (!ext) return ack({ erro: 'Formato não suportado (use mp3, ogg, wav ou m4a)' });
      const arquivo = `som-${randomBytes(12).toString('hex')}.${ext}`;
      try {
        await fs.promises.writeFile(path.join(pastaUploads, arquivo), dados);
      } catch {
        return ack({ erro: 'Não consegui salvar o som' });
      }
      sql.criarSom.run(srv, nome, emoji, `/uploads/${arquivo}`, u.conta, Date.now());
      emitirSons(srv);
      ack({});
    });
    quando('som:apagar', (u, id, ack) => {
      const som = sql.som.get(Number(id));
      if (!som) return ack({});
      if (som.conta !== u.conta && !ehAdminDe(som.servidor, u.conta)) return ack({ erro: 'Só quem enviou ou um admin pode apagar' });
      sql.apagarSom.run(som.id);
      fs.promises.unlink(path.join(pastaUploads, path.basename(som.url))).catch(() => {});
      emitirSons(som.servidor);
      ack({});
    });
    // `som` = id de um som do servidor, ou o nome de um som que já vem no app
    let ultimoSom = 0;
    quando('som:tocar', (u, som, ack) => {
      const c = u.voz != null && sql.canal.get(u.voz);
      if (!c) return ack({ erro: 'Entra numa sala de voz pra tocar sons' });
      if (Date.now() - ultimoSom < 1000) return ack({ erro: 'Calma, um som por vez' });
      let dados;
      if (typeof som === 'string' && /^[a-z]{1,20}$/.test(som)) {
        dados = { padrao: som };
      } else {
        const s = sql.som.get(Number(som));
        if (!s || s.servidor !== c.servidor) return ack({ erro: 'Esse som não existe mais' });
        dados = { id: s.id, url: s.url, nome: s.nome, emoji: s.emoji };
      }
      ultimoSom = Date.now();
      for (const o of usuarios.values()) if (o.voz === u.voz) io.to(o.socket).emit('som', { de: u.id, ...dados });
      ack({});
    });

    quando('voz:sair', (u) => {
      Object.assign(u, { voz: null, mic: null, camera: null, tela: null, rede: null, pos: null });
      previas.delete(u.id);
      emitirPresenca();
      limparAssistir();
    });

    // ---------- assistir junto (YouTube sincronizado na sala) ----------
    const tocarIndice = (a, i) => Object.assign(a, { atual: i, tocando: true, posicao: 0, em: Date.now() });
    // videos = ids; agora = toca já (entra logo depois do atual); senão vai pro fim da fila.
    // inicio = qual dos vídeos começa (playlist aberta num vídeo do meio)
    function adicionarVideos(u, { videos, agora, inicio } = {}, ack) {
      if (u.voz == null) return ack({ erro: 'Entra numa sala de voz primeiro' });
      if (!Array.isArray(videos) || !videos.length || !videos.every((v) => typeof v === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v))) {
        return ack({ erro: 'Link do YouTube inválido' });
      }
      const a = assistindo.get(u.voz);
      const cabe = MAX_FILA - (a?.fila.length ?? 0);
      if (cabe <= 0) return ack({ erro: `A fila já tem ${MAX_FILA} vídeos` });
      const itens = videos.slice(0, cabe).map((video) => ({ video, por: u.nome, titulo: titulosYoutube.get(video) }));
      inicio = Math.min(Math.max(0, Number(inicio) || 0), itens.length - 1);
      if (!a) {
        assistindo.set(u.voz, tocarIndice({ fila: itens }, inicio));
      } else if (agora) {
        a.fila.splice(a.atual + 1, 0, ...itens);
        tocarIndice(a, a.atual + 1 + inicio);
      } else {
        a.fila.push(...itens);
      }
      emitirAssistir(u.voz);
      buscarTitulos(u.voz);
      ack({ adicionados: itens.length, cortados: videos.length - itens.length });
    }
    quando('assistir:adicionar', adicionarVideos);
    quando('assistir:iniciar', (u, video, ack) => adicionarVideos(u, { videos: [video], agora: true }, ack));
    quando('assistir:pular', (u, i, ack) => {
      const a = u.voz != null && assistindo.get(u.voz);
      i = Number(i);
      if (!a || !Number.isInteger(i) || !a.fila[i]) return ack({ erro: 'Vídeo não está na fila' });
      tocarIndice(a, i);
      emitirAssistir(u.voz);
      ack({});
    });
    quando('assistir:remover', (u, i, ack) => {
      const a = u.voz != null && assistindo.get(u.voz);
      i = Number(i);
      if (!a || !Number.isInteger(i) || !a.fila[i]) return ack({ erro: 'Vídeo não está na fila' });
      a.fila.splice(i, 1);
      if (!a.fila.length) assistindo.delete(u.voz);
      else if (i === a.atual) tocarIndice(a, Math.min(i, a.fila.length - 1));
      else if (i < a.atual) a.atual--;
      emitirAssistir(u.voz);
      ack({});
    });
    // o vídeo acabou (todo mundo avisa; só o primeiro aviso de cada vídeo conta)
    quando('assistir:fim', (u, atual, ack) => {
      const a = u.voz != null && assistindo.get(u.voz);
      if (!a || a.atual !== Number(atual) || !a.tocando) return ack({});
      if (a.atual + 1 < a.fila.length) tocarIndice(a, a.atual + 1);
      else Object.assign(a, { tocando: false, posicao: a.posicao + (Date.now() - a.em) / 1000, em: Date.now() });
      emitirAssistir(u.voz);
      ack({});
    });
    quando('assistir:controle', (u, { tocando, posicao } = {}, ack) => {
      const a = u.voz != null && assistindo.get(u.voz);
      if (!a) return ack({ erro: 'Nada passando agora' });
      posicao = Number(posicao);
      if (!Number.isFinite(posicao) || posicao < 0 || posicao > 24 * 3600) return ack({ erro: 'Posição inválida' });
      Object.assign(a, { tocando: !!tocando, posicao, em: Date.now() });
      emitirAssistir(u.voz);
      ack({});
    });
    quando('assistir:parar', (u, _, ack) => {
      if (u.voz != null && assistindo.delete(u.voz)) emitirAssistir(u.voz);
      ack({});
    });
    quando('assistir:estado', (u, _, ack) => ack(u.voz != null ? assistirPublico(u.voz) : null));

    // ---------- mapa da chamada: cada um anda com seu boneco e ouve mais alto quem está perto ----------
    quando('mapa:ligar', (u, _, ack) => {
      if (u.voz == null) return ack({ erro: 'Entra numa sala de voz primeiro' });
      mapas.add(u.voz);
      emitirMapa(u.voz);
      ack({});
    });
    quando('mapa:desligar', (u, _, ack) => {
      if (u.voz != null && mapas.delete(u.voz)) {
        for (const o of usuarios.values()) if (o.voz === u.voz) o.pos = null;
        emitirMapa(u.voz);
      }
      ack({});
    });
    quando('mapa:estado', (u, _, ack) => ack(u.voz != null ? mapaPublico(u.voz) : null));
    quando('mapa:boneco', (u, b, ack) => {
      const boneco = limparBoneco(b);
      if (!boneco) return ack({ erro: 'Boneco inválido' });
      u.boneco = boneco;
      if (u.voz != null && mapas.has(u.voz) && u.pos) {
        for (const o of usuarios.values()) if (o.voz === u.voz && o.id !== u.id) io.to(o.socket).emit('mapa:boneco', { id: u.id, boneco });
      }
      ack({});
    });
    // posição em tiles (pode ser quebrada), direção e se está andando; vai pra sala sem esperar confirmação
    let ultimoPasso = 0;
    quando('mapa:mover', (u, { x, y, dir, anda } = {}) => {
      if (u.voz == null || !mapas.has(u.voz)) return;
      x = Number(x);
      y = Number(y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > MAPA_MAX || y > MAPA_MAX) return;
      if (!['baixo', 'cima', 'esq', 'dir'].includes(dir)) dir = 'baixo';
      const primeira = !u.pos;
      u.pos = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, dir, anda: !!anda };
      if (primeira) return emitirMapa(u.voz); // chegou no mapa: todo mundo recebe a lista com ele
      if (Date.now() - ultimoPasso < 40) return; // o cliente manda ~12 por segundo; mais que isso é descartado
      ultimoPasso = Date.now();
      for (const o of usuarios.values()) {
        if (o.voz === u.voz && o.id !== u.id) io.to(o.socket).volatile.emit('mapa:pos', { id: u.id, ...u.pos });
      }
    });
    // emoji em cima do boneco por uns segundos
    let ultimoEmote = 0;
    quando('mapa:emote', (u, emoji, ack) => {
      if (u.voz == null || !mapas.has(u.voz)) return ack({});
      if (typeof emoji !== 'string' || !EMOJI_RE.test(emoji)) return ack({ erro: 'Emoji inválido' });
      if (Date.now() - ultimoEmote < 700) return ack({});
      ultimoEmote = Date.now();
      for (const o of usuarios.values()) if (o.voz === u.voz) io.to(o.socket).emit('mapa:emote', { id: u.id, emoji });
      ack({});
    });

    // qualidade da conexão da pessoa na chamada (ela mesma mede com quem está na sala)
    quando('rede', (u, r) => {
      if (u.voz == null) return;
      const ping = Math.round(Number(r?.ping));
      const perda = Math.round(Number(r?.perda) * 10) / 10;
      const novo = Number.isFinite(ping) && Number.isFinite(perda)
        ? { ping: Math.min(Math.max(ping, 0), 9999), perda: Math.min(Math.max(perda, 0), 100) }
        : null;
      if (JSON.stringify(novo) === JSON.stringify(u.rede ?? null)) return;
      u.rede = novo;
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
      // dá um tempo: pode ser só o servidor/conexão voltando (o vídeo continua pra quem reconectar)
      setTimeout(limparAssistir, 90_000);
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
