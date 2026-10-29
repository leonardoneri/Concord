// ---------- mapa da chamada: sala em pixel art, cada um com seu boneco, áudio por proximidade ----------
// Cada sala de voz pode ter um mapa (vem do servidor). Tudo é desenhado aqui mesmo (tiles e bonecos em código).
// Usa as coisas do app.js: estado, socket, peers, falando, foco, $, el, avisar, renderGrid, atualizarAudios...

const T = 16; // pixels de um tile no desenho (a tela amplia 2x a 4x)
// O mapa tem 3 camadas, uma letra por tile (igual ao servidor):
//   chao = piso e parede, obj = móveis (' ' = nada), efe = efeitos (X bloqueia, N nasce, P palco, 1-9 área fechada)
const NOMES_CHAO = { ',': 'Grama', '*': 'Flores', ':': 'Caminho', '~': 'Água', '#': 'Parede', '.': 'Madeira', _: 'Azulejo', '=': 'Tapete', '+': 'Porta' };
const NOMES_OBJ = {
  T: 'Árvore', S: 'Sofá', V: 'TV', M: 'Mesa', h: 'Cadeira', P: 'Planta', L: 'Estante', A: 'Fliperama',
  Q: 'Sinuca', G: 'Geladeira', F: 'Fogão', B: 'Balcão', b: 'Banco', o: 'Fogueira', d: 'Puff',
};
const NOMES_EFE = { X: 'Bloqueio', N: 'Nascer', P: 'Palco', ...Object.fromEntries([...'123456789'].map((n) => [n, `Área ${n}`])) };
const BLOQ_CHAO = new Set('#~');
const BLOQ_OBJ = new Set('TSVMPLAQGFBbo');
const PERTO = 2.5; // até aqui (em tiles) ouve com volume cheio
const LONGE = 7; // daqui pra frente não ouve mais
const VELOCIDADE = 5; // tiles por segundo
const EMOTES_MAPA = ['👋', '😂', '❤️', '👍', '🎉'];

// ---------- modelos (o admin escolhe um ao pôr mapa numa sala) ----------
// A casa: uma letra só por tile; os móveis viram a camada de objetos com o piso do lado embaixo
const CASA = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T',
  'T,##########################,,,,,,,,,,*T',
  'T,#PL........LP#GFBBB_____P#,,,~~~~~,,,T',
  'T,#...SSSSS....#______hhh__#,,~~~~~~~,,T',
  'T,#..========..+______MMM__#,,~~~~~~~,,T',
  'T,#..========..#______hhh__#,,,~~~~~,,,T',
  'T,#..========..#___________#,,,,,,,,,,,T',
  'T,#..========..######+######,,,,b,b,,,,T',
  'T,#L....VV....L#P.........P#,T,,,,,,,T,T',
  'T,######+#######..hhhhhhh..#,*,,::,,,*,T',
  'T,#AAA........P#..MMMMMMM..#,,,,::,,,,,T',
  'T,#......QQQ...+.hMMMMMMMh.#,,,,::,,,,,T',
  'T,#......QQQ...#..MMMMMMM..#,,,,::,,,,,T',
  'T,#............#..hhhhhhh..#,,,,::b*b,,T',
  'T,#dd........dL#L.........L#,,,,::,o,,*T',
  'T,######++##################,,,,::b,b,,T',
  'T,,,*,,,::,,,,,,,,,,,,,,,,,,,T,,::,,,,,T',
  'T,,,,,,*::*,,,,,,,,,*,,,T,,,,,,,::,,,T,T',
  'T,,,T*,,::,,,,,,,,,,,,,,*,,,,,,,::,,,**T',
  'T,,,*,,,::::::::::::::::::::::::::,,,,,T',
  'T,,,,,,,::::::::::::::::::::::::::,,,,,T',
  'T,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,T,,T',
  'T,,T,,,,,,,,,,T,,,,,T,,,,,,,,,,,,,,,,,,T',
  'T,,,,,,,,,,,,,,,,,,,,,*,,,,,,,,,,,,,,,,T',
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
];
function modeloCasa() {
  const a = CASA.length;
  const l = CASA[0].length;
  const pisoDe = (x, y) => {
    if ('Tbo'.includes(CASA[y][x])) return ',';
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0], [1, 1], [-1, -1]]) {
      const c = CASA[y + dy]?.[x + dx];
      if (c && '.,_=*:'.includes(c)) return c === '*' ? ',' : c;
    }
    return '.';
  };
  const chao = [];
  const obj = [];
  const efe = [];
  for (let y = 0; y < a; y++) {
    let lc = '';
    let lo = '';
    let le = '';
    for (let x = 0; x < l; x++) {
      const c = CASA[y][x];
      const movel = c in NOMES_OBJ;
      lc += movel ? pisoDe(x, y) : c;
      lo += movel ? c : ' ';
      if (x >= 16 && x <= 26 && y >= 9 && y <= 15) le += '1'; // sala de reunião
      else if (x >= 33 && x <= 37 && y >= 13 && y <= 17) le += '2'; // fogueira
      else if (x >= 7 && x <= 10 && y >= 18 && y <= 19 && !movel) le += 'N'; // na frente da porta
      else le += ' ';
    }
    chao.push(lc);
    obj.push(lo);
    efe.push(le);
  }
  return { l, a, chao, obj, efe, areas: { 1: 'Sala de reunião', 2: 'Fogueira' } };
}
function modeloGramado() {
  const l = 30;
  const a = 20;
  const linhas = (f) => Array.from({ length: a }, (_, y) => Array.from({ length: l }, (_, x) => f(x, y)).join(''));
  const borda = (x, y) => x === 0 || y === 0 || x === l - 1 || y === a - 1;
  const meio = (x, y) => Math.abs(x - l / 2) < 2 && Math.abs(y - a / 2) < 2;
  return {
    l, a,
    chao: linhas(() => ','),
    obj: linhas((x, y) => (borda(x, y) ? 'T' : ' ')),
    efe: linhas((x, y) => (meio(x, y) ? 'N' : ' ')),
    areas: {},
  };
}
const MODELOS_MAPA = { casa: { nome: 'Casa', criar: modeloCasa }, gramado: { nome: 'Gramado vazio', criar: modeloGramado } };

// ---------- o mapa aberto ----------
let atual = null; // o mapa que está na tela (o da sala, ou o rascunho do editor)
const dentro = (m, x, y) => x >= 0 && y >= 0 && x < m.l && y < m.a;
const chaoEm = (m, x, y) => (dentro(m, x, y) ? m.chao[y][x] : ',');
const objEm = (m, x, y) => (dentro(m, x, y) ? m.obj[y][x] : ' ');
const efeEm = (m, x, y) => (dentro(m, x, y) ? m.efe[y][x] : ' ');
const livreTile = (x, y) => !!atual && dentro(atual, x, y) && efeEm(atual, x, y) !== 'X'
  && !BLOQ_CHAO.has(chaoEm(atual, x, y)) && !BLOQ_OBJ.has(objEm(atual, x, y));
const efeitoNoPe = (p) => (atual ? efeEm(atual, Math.floor(p.x), Math.floor(p.y - 0.1)) : ' ');
// área fechada em que a pessoa está ('1' a '9'), ou null
const areaEm = (p) => (/[1-9]/.test(efeitoNoPe(p)) ? efeitoNoPe(p) : null);
const nomeArea = (id) => atual?.areas?.[id] || `Área ${id}`;

// número "aleatório" fixo por tile (o desenho não muda a cada vez que abre)
function rnd(x, y, i = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(i, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- tiles ----------
function pintarChao(c, m, ch, tx, ty) {
  const X = tx * T;
  const Y = ty * T;
  const p = (cor, x, y, w = 1, h = 1) => { c.fillStyle = cor; c.fillRect(X + x, Y + y, w, h); };
  const viz = (dx, dy) => chaoEm(m, tx + dx, ty + dy);
  const r = (i) => rnd(tx, ty, i);
  switch (ch) {
    case ',':
      p('#5d9e4b', 0, 0, 16, 16);
      for (let i = 0; i < 7; i++) p(r(i) > 0.5 ? '#4e8a3f' : '#6fb35a', (r(i + 10) * 15) | 0, (r(i + 20) * 14) | 0, 1, 2);
      break;
    case '*':
      pintarChao(c, m, ',', tx, ty);
      for (let i = 0; i < 3; i++) {
        const cor = ['#f4f1e8', '#f2d04a', '#e87aa8', '#8fb8f0'][(r(i + 30) * 4) | 0];
        const fx = 2 + ((r(i + 40) * 11) | 0);
        const fy = 2 + ((r(i + 50) * 11) | 0);
        p(cor, fx - 1, fy, 3, 1);
        p(cor, fx, fy - 1, 1, 3);
        p('#e8a020', fx, fy);
      }
      break;
    case ':':
      p('#b8ab90', 0, 0, 16, 16);
      for (let i = 0; i < 4; i++) {
        const sx = (r(i) * 12) | 0;
        const sy = (r(i + 5) * 12) | 0;
        p('#a39678', sx, sy + 1, 4, 3);
        p('#cbbfa6', sx, sy, 4, 1);
      }
      break;
    case '~':
      p('#3a7fc2', 0, 0, 16, 16);
      p('#3373b2', 0, 10, 16, 6);
      if (viz(0, -1) !== '~') p('#d8c890', 0, 0, 16, 2);
      if (viz(0, 1) !== '~') p('#d8c890', 0, 14, 16, 2);
      if (viz(-1, 0) !== '~') p('#d8c890', 0, 0, 2, 16);
      if (viz(1, 0) !== '~') p('#d8c890', 14, 0, 2, 16);
      break;
    case '.':
    case '+':
      p('#b47c4b', 0, 0, 16, 16);
      for (let k = 0; k < 4; k++) {
        p('#c48a56', 0, k * 4, 16, 1);
        p('#9a6538', 0, k * 4 + 3, 16, 1);
        p('#9a6538', (r(k) * 16) | 0, k * 4, 1, 3);
      }
      if (ch === '+') {
        if (viz(-1, 0) === '#' || viz(1, 0) === '#') p('#7a5232', 0, 0, 16, 2);
        else p('#7a5232', 0, 0, 2, 16);
      }
      break;
    case '_':
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) p((i + j) % 2 ? '#e6e1d6' : '#c7c0b2', i * 8, j * 8, 8, 8);
      break;
    case '=':
      p('#9a3d52', 0, 0, 16, 16);
      p('#b0566a', 6, 6, 4, 4);
      p('#9a3d52', 7, 7, 2, 2);
      if (viz(0, -1) !== '=') p('#e0b860', 0, 1, 16, 1);
      if (viz(0, 1) !== '=') p('#e0b860', 0, 14, 16, 1);
      if (viz(-1, 0) !== '=') p('#e0b860', 1, 0, 1, 16);
      if (viz(1, 0) !== '=') p('#e0b860', 14, 0, 1, 16);
      break;
    case '#':
      if (viz(0, 1) !== '#') { // parede vista de frente
        p('#5b4a3e', 0, 0, 16, 5);
        p('#d9c4a6', 0, 5, 16, 9);
        for (let x = 3; x < 16; x += 4) p('#cdb795', x, 5, 1, 9);
        p('#b8a184', 0, 12, 16, 1);
        p('#6d5a48', 0, 13, 16, 3);
      } else {
        p('#5b4a3e', 0, 0, 16, 16);
        if (viz(-1, 0) !== '#') p('#7a6656', 0, 0, 2, 16);
        if (viz(1, 0) !== '#') p('#7a6656', 14, 0, 2, 16);
        if (viz(0, -1) !== '#') p('#7a6656', 0, 0, 16, 2);
      }
      break;
    default:
      p('#000', 0, 0, 16, 16);
  }
}

function pintarObj(c, m, ch, tx, ty) {
  const X = tx * T;
  const Y = ty * T;
  const p = (cor, x, y, w = 1, h = 1) => { c.fillStyle = cor; c.fillRect(X + x, Y + y, w, h); };
  const viz = (dx, dy) => objEm(m, tx + dx, ty + dy);
  const r = (i) => rnd(tx, ty, i);
  switch (ch) {
    case 'T':
      p('rgba(0,0,0,.22)', 2, 10, 12, 5);
      p('#6b4423', 6, 7, 4, 8);
      p('#8a5a32', 6, 7, 1, 8);
      break;
    case 'b':
      p('#5e3c20', 2, 11, 2, 4);
      p('#5e3c20', 12, 11, 2, 4);
      p('#8a5a32', 1, 5, 14, 3);
      p('#a06a3c', 1, 5, 14, 1);
      p('#8a5a32', 1, 9, 14, 3);
      p('#a06a3c', 1, 9, 14, 1);
      break;
    case 'o':
      p('#7d7d86', 2, 9, 12, 5);
      p('#9a9aa4', 3, 9, 10, 1);
      p('#4a3020', 3, 10, 10, 3);
      p('#6b4423', 4, 10, 8, 2);
      break;
    case 'S':
      p('rgba(0,0,0,.2)', 0, 13, 16, 2);
      p('#3e5c9e', 0, 1, 16, 6);
      p('#4f70b8', 0, 6, 16, 7);
      p('#6a8ad0', 1, 7, 14, 2);
      p('#34508c', 0, 12, 16, 1);
      if (viz(-1, 0) !== 'S') p('#344f88', 0, 2, 3, 11);
      if (viz(1, 0) !== 'S') p('#344f88', 13, 2, 3, 11);
      break;
    case 'V': {
      const l = viz(-1, 0) !== 'V' ? 1 : 0;
      const d = viz(1, 0) !== 'V' ? 15 : 16;
      p('#5a3e2a', l, 10, d - l, 5);
      p('#7a5638', l, 10, d - l, 1);
      p('#0f0f16', l, 1, d - l, 9);
      p('#1f2c4a', l + (l ? 1 : 0), 2, d - l - (l ? 1 : 0) - (d === 15 ? 1 : 0), 7);
      break;
    }
    case 'M':
      p('#a8703f', 0, 0, 16, 16);
      p('#bf8550', 0, 1, 16, 1);
      if (viz(0, -1) !== 'M') p('#7a4c28', 0, 0, 16, 2);
      if (viz(-1, 0) !== 'M') p('#7a4c28', 0, 0, 2, 16);
      if (viz(1, 0) !== 'M') p('#7a4c28', 14, 0, 2, 16);
      if (viz(0, 1) !== 'M') p('#6a3e1e', 0, 12, 16, 4);
      break;
    case 'h':
      p('rgba(0,0,0,.18)', 4, 12, 8, 2);
      p('#7a4a2a', 4, 4, 8, 8);
      p('#93603a', 5, 5, 6, 6);
      if (viz(0, 1) === 'M') p('#5e3820', 4, 2, 8, 3);
      else if (viz(0, -1) === 'M') p('#5e3820', 4, 11, 8, 3);
      else if (viz(1, 0) === 'M') p('#5e3820', 2, 4, 3, 8);
      else p('#5e3820', 11, 4, 3, 8);
      break;
    case 'P':
      p('rgba(0,0,0,.2)', 4, 13, 8, 2);
      p('#b0603a', 5, 10, 6, 5);
      p('#c87444', 5, 10, 6, 1);
      p('#2e7238', 3, 3, 10, 8);
      p('#3c8f45', 4, 2, 8, 7);
      p('#56b05c', 5, 3, 3, 3);
      p('#56b05c', 9, 5, 2, 2);
      break;
    case 'L': {
      p('#4e301b', 1, 0, 14, 15);
      p('#6a4428', 2, 1, 12, 13);
      const livros = ['#c84a4a', '#4a7ac8', '#d8b84a', '#4ab07a', '#9a5ad0', '#e8e0d0'];
      for (const prat of [1, 6]) {
        for (let x = 2, i = 0; x < 14; i++) {
          const w = r(prat * 10 + i) > 0.6 ? 2 : 1;
          const h = 4 - ((r(prat * 20 + i) * 2) | 0);
          p(livros[(r(prat * 30 + i) * livros.length) | 0], x, prat + 4 - h, Math.min(w, 14 - x), h);
          x += w;
        }
        p('#4e301b', 2, prat + 4, 12, 1);
      }
      p('#4e301b', 2, 11, 12, 1);
      break;
    }
    case 'A':
      p('rgba(0,0,0,.25)', 2, 13, 12, 2);
      p('#2f2458', 2, 1, 12, 14);
      p('#4a3a8a', 3, 1, 10, 2);
      p('#101018', 4, 3, 8, 5);
      p('#5a4aa0', 3, 9, 10, 3);
      p('#e04848', 5, 10, 2, 1);
      p('#f2c040', 9, 10, 2, 1);
      p('#1b1b24', 7, 9, 1, 2);
      break;
    case 'Q': {
      p('#2f8f50', 0, 0, 16, 16);
      p('#38a05c', 3, 3, 10, 10);
      const cima = viz(0, -1) !== 'Q';
      const baixo = viz(0, 1) !== 'Q';
      const esq = viz(-1, 0) !== 'Q';
      const dir = viz(1, 0) !== 'Q';
      if (cima) p('#6a4428', 0, 0, 16, 3);
      if (baixo) p('#6a4428', 0, 13, 16, 3);
      if (esq) p('#6a4428', 0, 0, 3, 16);
      if (dir) p('#6a4428', 13, 0, 3, 16);
      if (cima && esq) p('#111', 2, 2, 3, 3);
      if (cima && dir) p('#111', 11, 2, 3, 3);
      if (baixo && esq) p('#111', 2, 11, 3, 3);
      if (baixo && dir) p('#111', 11, 11, 3, 3);
      for (let i = 0; i < 2; i++) {
        if (r(60 + i) < 0.5) continue;
        p(['#f2f2f2', '#e04848', '#f2c040', '#4a78d8'][(r(70 + i) * 4) | 0], 4 + ((r(80 + i) * 8) | 0), 4 + ((r(90 + i) * 8) | 0), 2, 2);
      }
      break;
    }
    case 'G':
      p('#9aa4aa', 2, 0, 12, 16);
      p('#dfe6ea', 3, 0, 10, 15);
      p('#b8c2c8', 3, 6, 10, 1);
      p('#8a949a', 11, 2, 1, 3);
      p('#8a949a', 11, 8, 1, 4);
      break;
    case 'F':
      p('#6a6f78', 0, 0, 16, 15);
      p('#8a8f98', 1, 1, 14, 12);
      for (const [x, y] of [[3, 2], [9, 2], [3, 8], [9, 8]]) {
        p('#2a2a30', x, y, 4, 4);
        p('#4a4a52', x + 1, y + 1, 2, 2);
      }
      break;
    case 'B':
      p('#d8c8ae', 0, 0, 16, 10);
      p('#e8dcc6', 0, 0, 16, 1);
      p('#9a8466', 0, 10, 16, 5);
      p('#7a6650', 0, 10, 16, 1);
      p('#7a6650', 8, 11, 1, 4);
      if (tx % 3 === 0) {
        p('#8a969e', 4, 2, 8, 6);
        p('#b8c4cc', 5, 3, 6, 4);
      }
      break;
    case 'd':
      p('rgba(0,0,0,.2)', 2, 12, 12, 3);
      p('#b07a28', 2, 5, 12, 9);
      p('#d89a3a', 2, 4, 12, 8);
      p('#e8b45a', 4, 5, 6, 3);
      break;
  }
}

// copa das árvores: fica por cima dos bonecos (quem passa atrás da árvore some debaixo dela)
function pintarCopa(c, tx, ty) {
  const cx = tx * T + 8;
  const cy = ty * T;
  const bolha = (raio, cor, ox = 0, oy = 0) => {
    c.fillStyle = cor;
    for (let y = -raio; y <= raio; y++) {
      const hw = Math.round(Math.sqrt(raio * raio - y * y + raio * 0.6));
      c.fillRect(cx + ox - hw, cy + oy + y, hw * 2, 1);
    }
  };
  bolha(8, '#1d4a24');
  bolha(7, '#2f7a3a');
  bolha(4, '#43a04e', -2, -2);
  bolha(2, '#5cbc62', -3, -4);
  c.fillStyle = '#24602d';
  c.fillRect(cx - 5, cy + 5, 10, 2);
}

let mapaBase = null; // desenho pronto do mapa (refeito quando o mapa muda)
let mapaTopo = null;
let animados = []; // tiles que mexem: água, fogueira, fliperama
let caixasAreas = {}; // área -> { x0, y0, x1, y1 } (pra escrever o nome)
function prepararMapa() {
  if (mapaBase || !atual) return;
  const m = atual;
  mapaBase = document.createElement('canvas');
  mapaBase.width = m.l * T;
  mapaBase.height = m.a * T;
  mapaTopo = document.createElement('canvas');
  mapaTopo.width = mapaBase.width;
  mapaTopo.height = mapaBase.height;
  const b = mapaBase.getContext('2d');
  const t = mapaTopo.getContext('2d');
  animados = [];
  caixasAreas = {};
  for (let y = 0; y < m.a; y++) {
    for (let x = 0; x < m.l; x++) {
      const ch = m.chao[y][x];
      const o = m.obj[y][x];
      const e = m.efe[y][x];
      pintarChao(b, m, ch, x, y);
      if (o !== ' ') pintarObj(b, m, o, x, y);
      if (o === 'T') pintarCopa(t, x, y);
      if (ch === '~') animados.push({ ch, x, y });
      if (o === 'o' || o === 'A') animados.push({ ch: o, x, y });
      if (/[1-9]/.test(e)) {
        const cx = caixasAreas[e] ??= { x0: x, y0: y, x1: x, y1: y };
        Object.assign(cx, { x0: Math.min(cx.x0, x), y0: Math.min(cx.y0, y), x1: Math.max(cx.x1, x), y1: Math.max(cx.y1, y) });
        b.fillStyle = 'rgba(255,255,255,.05)';
        b.fillRect(x * T, y * T, T, T);
      }
    }
  }
}

function pintarAnimados(c, t) {
  const m = atual;
  for (const { ch, x, y } of animados) {
    const X = x * T;
    const Y = y * T;
    if (ch === '~') {
      if ([[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => chaoEm(m, x + dx, y + dy) !== '~')) continue;
      c.fillStyle = '#7ab8ea';
      for (let i = 0; i < 2; i++) {
        const fase = (t * 0.6 + rnd(x, y, i)) % 1;
        c.globalAlpha = Math.sin(fase * Math.PI);
        c.fillRect(X + 2 + ((rnd(x, y, i + 3) * 9) | 0), Y + 3 + i * 6, 4, 1);
      }
      c.globalAlpha = 1;
    } else if (ch === 'o') {
      const f = Math.floor(t * 8) % 3;
      c.fillStyle = '#d8401e';
      c.fillRect(X + 4, Y + 4 - f % 2, 8, 7 + f % 2);
      c.fillStyle = '#f2902a';
      c.fillRect(X + 5 + (f === 1 ? 1 : 0), Y + 2 + f, 5, 7 - f);
      c.fillStyle = '#fbe070';
      c.fillRect(X + 6 + (f === 2 ? 1 : 0), Y + 6, 3, 3);
      const g = c.createRadialGradient(X + 8, Y + 8, 2, X + 8, Y + 8, 40);
      g.addColorStop(0, `rgba(255,170,60,${0.22 + 0.04 * Math.sin(t * 9)})`);
      g.addColorStop(1, 'rgba(255,170,60,0)');
      c.fillStyle = g;
      c.fillRect(X - 32, Y - 32, 80, 80);
    } else {
      c.fillStyle = `hsl(${(t * 50 + x * 70) % 360} 80% 60%)`;
      c.fillRect(X + 5, Y + 4, 6, 3);
      c.fillStyle = '#f2f2f2';
      c.fillRect(X + 5 + (Math.floor(t * 4 + x) % 5), Y + 6, 1, 1);
    }
  }
}

// ---------- bonecos ----------
const PELES = ['#f6d1b5', '#eab38f', '#d39a6a', '#a86d45', '#7a4a2c', '#4f2f1d'];
const CORES_CABELO = ['#2b1d16', '#5a3a22', '#9a6232', '#e0b85a', '#ece6d8', '#b8342e', '#3b5fd0', '#d86aa8'];
const ROUPAS = ['#e04848', '#e8904a', '#e8c84a', '#5cb85c', '#3aa0a0', '#4a78d8', '#7a5ad8', '#d85aa0', '#f2f2f2', '#3a3a44'];
const CALCAS = ['#2f3e66', '#3a3a44', '#6b4a2e', '#7a7f88', '#2e5a3a'];
const ESTILOS_CABELO = ['Curto', 'Comprido', 'Careca', 'Moicano', 'Coque', 'Boné'];
const PARTES_BONECO = { pele: PELES, cabelo: ESTILOS_CABELO, corCabelo: CORES_CABELO, roupa: ROUPAS, calca: CALCAS };

// 12 x 16: h cabelo, s pele, e olho, c roupa, p calça, b sapato
const CORPO = {
  baixo: [
    '...hhhhhh...', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhsssssshh.', '.hssssssssh.', '.hsessssesh.',
    '..ssssssss..', '...ssssss...', '....cccc....', '..cccccccc..', '.sccccccccs.', '.sccccccccs.', '..pppppppp..',
  ],
  cima: [
    '...hhhhhh...', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhhhhhhhhh.', '.hhhhhhhhhh.', '.hhhhhhhhhh.',
    '..hhhhhhhh..', '...ssssss...', '....cccc....', '..cccccccc..', '.sccccccccs.', '.sccccccccs.', '..pppppppp..',
  ],
  dir: [
    '...hhhhhh...', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhhhsssssh.', '.hhhsssssss.', '.hhhssssess.',
    '..hhsssssss.', '....ssssss..', '....cccc....', '...cccccc...', '...cccscc...', '...cccscc...', '...pppppp...',
  ],
};
const PERNAS = {
  baixo: [
    ['..ppp..ppp..', '..ppp..ppp..', '..bbb..bbb..'],
    ['..ppp..ppp..', '..bbb..ppp..', '.......bbb..'],
    ['..ppp..ppp..', '..ppp..bbb..', '..bbb.......'],
  ],
  dir: [
    ['....pppp....', '....pppp....', '....bbbbb...'],
    ['...pp..pp...', '..pp....pp..', '.bb......bb.'],
    ['....pppp....', '....pp.pp...', '....bb.bb...'],
  ],
};
PERNAS.cima = PERNAS.baixo;
const PASSOS = [1, 0, 2, 0];

function bonecoPadrao(semente) {
  const n = (i, max) => Math.floor(rnd(semente, 7, i) * max);
  return { pele: n(1, PELES.length), cabelo: n(2, 2), corCabelo: n(3, 4), roupa: n(4, ROUPAS.length), calca: n(5, CALCAS.length) };
}
const bonecoValido = (b) => b && Object.entries(PARTES_BONECO).every(([k, lista]) => Number.isInteger(b[k]) && b[k] >= 0 && b[k] < lista.length);
const meuBonecoAgora = () => (bonecoValido(meuBoneco) ? meuBoneco : bonecoPadrao(estado.eu?.conta ?? 1));

function escurecer(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (s) => Math.round(((n >> s) & 255) * f);
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

const sprites = new Map();
// desenho do boneco de lado vale pros dois lados (esquerda é o espelho)
function sprite(b, dir, quadro) {
  const lado = dir === 'esq' ? 'dir' : dir;
  const chave = `${b.pele}.${b.cabelo}.${b.corCabelo}.${b.roupa}.${b.calca}:${dir}:${quadro}`;
  if (sprites.has(chave)) return sprites.get(chave);
  // 2 linhas extras em cima (coque/moicano passam da cabeça)
  const g = [[...'............'], [...'............'], ...[...CORPO[lado], ...PERNAS[lado][quadro]].map((l) => [...l])];
  const pinta = (linhas, colunas, letra, so) => {
    for (const r of linhas) for (const col of colunas) if (!so || so.includes(g[r + 2][col])) g[r + 2][col] = letra;
  };
  const faixa = (a, z) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
  const trocar = (de, para, linhas = faixa(-2, 15)) => {
    for (const r of linhas) for (let col = 0; col < 12; col++) if (g[r + 2][col] === de) g[r + 2][col] = para;
  };
  switch (b.cabelo) {
    case 1: // comprido
      if (lado === 'baixo') pinta(faixa(5, 9), [1, 10], 'h');
      else if (lado === 'cima') pinta(faixa(6, 9), faixa(2, 9), 'h');
      else { pinta(faixa(3, 9), [1, 2], 'h'); pinta(faixa(3, 7), [3], 'h'); }
      break;
    case 2: // careca
      trocar('h', 's');
      break;
    case 3: // moicano
      trocar('h', 's');
      if (lado === 'dir') pinta(faixa(-1, 1), faixa(3, 6), 'h');
      else pinta(faixa(-1, 3), [5, 6], 'h');
      break;
    case 4: // coque
      pinta([-2, -1], lado === 'dir' ? [2, 3, 4] : faixa(4, 7), 'h');
      break;
    case 5: // boné (da cor da roupa)
      trocar('h', 'k', faixa(0, 2));
      if (lado === 'baixo') pinta([3], faixa(1, 10), 'k', 'h');
      if (lado === 'dir') pinta([3], [9, 10, 11], 'k');
      break;
  }
  const roupa = ROUPAS[b.roupa];
  const cores = {
    h: CORES_CABELO[b.corCabelo], s: PELES[b.pele], e: '#1d1d24', c: roupa,
    p: CALCAS[b.calca], b: '#26262c', k: escurecer(roupa, 0.7),
  };
  const cv = document.createElement('canvas');
  cv.width = 14;
  cv.height = 20;
  const c = cv.getContext('2d');
  const cheio = (r, col) => g[r]?.[col] != null && g[r][col] !== '.';
  // contorno escuro em volta de tudo
  c.fillStyle = '#16151d';
  for (let r = -1; r <= g.length; r++) {
    for (let col = -1; col <= 12; col++) {
      if (cheio(r, col)) continue;
      if (cheio(r - 1, col) || cheio(r + 1, col) || cheio(r, col - 1) || cheio(r, col + 1)) c.fillRect(col + 1, r + 1, 1, 1);
    }
  }
  for (let r = 0; r < g.length; r++) {
    for (let col = 0; col < 12; col++) {
      const l = g[r][col];
      if (l === '.') continue;
      // sombra embaixo de cada parte (dá volume)
      c.fillStyle = 'hscp'.includes(l) && g[r + 1]?.[col] !== l ? escurecer(cores[l], 0.82) : cores[l];
      c.fillRect(col + 1, r + 1, 1, 1);
    }
  }
  let final = cv;
  if (dir === 'esq') {
    final = document.createElement('canvas');
    final.width = 14;
    final.height = 20;
    const f = final.getContext('2d');
    f.scale(-1, 1);
    f.drawImage(cv, -14, 0);
  }
  sprites.set(chave, final);
  return final;
}

// ---------- quem está no mapa ----------
// id -> { x, y (o que aparece), alvoX, alvoY (o último que chegou), dir, anda, boneco, emote }
const pessoasMapa = new Map();
const mapa = {
  rodando: false, ultimo: 0, teclas: new Set(), caminho: null, destino: null, chave: '',
  enviado: null, enviadoEm: 0, fatores: new Map(), pertoChave: '', escala: 3, travado: 0, cam: null,
};
const naChamadaMapa = (id) => estado.usuarios.some((u) => u.id === id && u.voz === estado.voz);

// volume da voz de alguém conforme a distância (1 = normal, 0 = não ouve)
function fatorMapa(id) {
  if (!estado.voz || !estado.mapa || id === estado.eu?.id) return 1;
  const eu = pessoasMapa.get(estado.eu.id);
  const o = pessoasMapa.get(id);
  if (!eu || !o) return 1; // ainda não entrou no mapa (ou app antigo): ouve normal
  if (efeitoNoPe(o) === 'P') return 1; // no palco: a sala inteira ouve
  const za = areaEm(eu);
  const zb = areaEm(o);
  if (za || zb) return za === zb ? 1 : 0;
  const d = Math.hypot(eu.x - o.x, eu.y - o.y);
  if (d <= PERTO) return 1;
  if (d >= LONGE) return 0;
  const t = (d - PERTO) / (LONGE - PERTO);
  return (1 - t) * (1 - t);
}
const pertoNoMapa = (id) => fatorMapa(id) > 0;

// mudou quem dá pra ouvir: acerta os volumes (e os quadros de vídeo de quem está perto)
function verificarProximidade() {
  if (!estado.mapa) return;
  let mudou = false;
  const perto = [];
  for (const id of peers.keys()) {
    const f = fatorMapa(id);
    if (f > 0) perto.push(id);
    if (Math.abs((mapa.fatores.get(id) ?? -1) - f) > 0.03 || (f === 0) !== (mapa.fatores.get(id) === 0)) {
      mapa.fatores.set(id, f);
      mudou = true;
    }
  }
  const chave = perto.sort().join();
  if (chave !== mapa.pertoChave) {
    mapa.pertoChave = chave;
    renderGrid(); // já acerta os áudios
  } else if (mudou) {
    atualizarAudios();
  }
}

// o pé do boneco cabe ali?
function livre(x, y) {
  for (const [dx, dy] of [[-0.28, -0.25], [0.28, -0.25], [-0.28, -0.02], [0.28, -0.02]]) {
    if (!livreTile(Math.floor(x + dx), Math.floor(y + dy))) return false;
  }
  return true;
}

// nasce num tile de "nascer"; sem nenhum, no primeiro lugar livre a partir do meio
function lugarParaNascer() {
  const m = atual;
  const pontos = [];
  for (let y = 0; y < m.a; y++) for (let x = 0; x < m.l; x++) if (m.efe[y][x] === 'N' && livreTile(x, y)) pontos.push({ x, y });
  if (pontos.length) {
    const p = pontos[Math.floor(Math.random() * pontos.length)];
    return { x: p.x + 0.5, y: p.y + 0.65 };
  }
  for (let r = 0; r < Math.max(m.l, m.a); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.floor(m.l / 2) + dx;
        const y = Math.floor(m.a / 2) + dy;
        if (livreTile(x, y)) return { x: x + 0.5, y: y + 0.65 };
      }
    }
  }
  return { x: m.l / 2, y: m.a / 2 };
}

function enviarPosicao(forcar = false) {
  const eu = pessoasMapa.get(estado.eu?.id);
  if (!eu || !estado.voz) return;
  const agora = performance.now();
  const s = `${eu.x.toFixed(2)},${eu.y.toFixed(2)},${eu.dir},${eu.anda}`;
  if (!forcar && (s === mapa.enviado || agora - mapa.enviadoEm < 80)) return;
  mapa.enviado = s;
  mapa.enviadoEm = agora;
  socket.emit('mapa:mover', { x: eu.x, y: eu.y, dir: eu.dir, anda: eu.anda });
}

function aplicarMapa(dados) {
  const antes = !!estado.mapa;
  estado.mapa = estado.voz && dados ? dados : null;
  if (!estado.mapa) {
    pessoasMapa.clear();
    mapa.fatores.clear();
    Object.assign(mapa, { pertoChave: '', caminho: null, destino: null, chave: '' });
    if (editor) fecharEditor();
    atual = null;
    mapaBase = null;
    if (antes) foco = null;
    $('#painel-boneco').hidden = true;
    renderGrid();
    return;
  }
  if (!antes) foco = null;
  // o desenho mudou (alguém salvou o editor): refaz, a não ser que eu esteja editando o meu rascunho
  const chave = JSON.stringify(dados.mapa);
  if (chave !== mapa.chave) {
    mapa.chave = chave;
    if (editor?.salvando) fecharEditor();
    if (!editor) {
      atual = dados.mapa;
      mapaBase = null;
    } else {
      avisar('Alguém salvou o mapa enquanto você editava. Se salvar, o seu substitui o dele.', 6000);
    }
  }
  const vistos = new Set();
  for (const p of dados.pessoas) {
    vistos.add(p.id);
    const eu = p.id === estado.eu.id;
    let v = pessoasMapa.get(p.id);
    if (!v) {
      v = { x: p.x, y: p.y, alvoX: p.x, alvoY: p.y, dir: p.dir, anda: p.anda, boneco: null, emote: null };
      pessoasMapa.set(p.id, v);
    } else if (!eu) {
      Object.assign(v, { alvoX: p.x, alvoY: p.y, dir: p.dir, anda: p.anda });
    }
    v.boneco = eu ? meuBonecoAgora() : bonecoValido(p.boneco) ? p.boneco : v.boneco;
  }
  for (const id of [...pessoasMapa.keys()]) if (!vistos.has(id) && id !== estado.eu.id) pessoasMapa.delete(id);
  // eu ainda não estou no mapa, ou o lugar onde eu estava virou parede: nasço de novo
  let eu = pessoasMapa.get(estado.eu.id);
  if (eu && !editor && !livre(eu.x, eu.y)) {
    pessoasMapa.delete(estado.eu.id);
    eu = null;
  }
  if (!eu) {
    const pos = lugarParaNascer();
    eu = { ...pos, alvoX: pos.x, alvoY: pos.y, dir: 'baixo', anda: false, boneco: meuBonecoAgora(), emote: null };
    pessoasMapa.set(estado.eu.id, eu);
    mapa.caminho = mapa.destino = null;
  }
  // o servidor ainda não sabe de mim (entrei agora, reconectei ou o mapa mudou): mando onde estou
  if (!vistos.has(estado.eu.id) || !livre(eu.x, eu.y)) {
    socket.emit('mapa:boneco', meuBonecoAgora());
    enviarPosicao(true);
  }
  $('#btn-editar-mapa').hidden = !dados.podeEditar || !!editor;
  iniciarLoopMapa();
  renderGrid();
  verificarProximidade();
  if (!antes) setTimeout(() => $('#tela-mapa').focus(), 50);
}

socket.on('mapa', aplicarMapa);
socket.on('mapa:pos', ({ id, x, y, dir, anda }) => {
  if (!estado.mapa || id === estado.eu?.id) return;
  let v = pessoasMapa.get(id);
  if (!v) {
    v = { x, y, alvoX: x, alvoY: y, dir, anda, boneco: null, emote: null };
    pessoasMapa.set(id, v);
  }
  Object.assign(v, { alvoX: x, alvoY: y, dir, anda });
  // janela minimizada (jogando): sem animação, mas o volume continua acompanhando
  if (document.hidden) {
    v.x = x;
    v.y = y;
    verificarProximidade();
  }
});
socket.on('mapa:boneco', ({ id, boneco }) => {
  const v = pessoasMapa.get(id);
  if (v && bonecoValido(boneco)) v.boneco = boneco;
});
socket.on('mapa:emote', ({ id, emoji }) => {
  const v = pessoasMapa.get(id);
  if (v) v.emote = { emoji, em: performance.now() };
});

// a conexão voltou no meio da chamada: pega o mapa de novo (e o servidor fica sabendo onde estou)
function restaurarMapa() {
  socket.emit('mapa:estado', null, aplicarMapa);
}

// ---------- andar ----------
const TECLAS_MAPA = {
  KeyW: 'cima', ArrowUp: 'cima', KeyS: 'baixo', ArrowDown: 'baixo',
  KeyA: 'esq', ArrowLeft: 'esq', KeyD: 'dir', ArrowRight: 'dir',
};
const mapaVisivel = () => !!estado.mapa && estado.view === 'voz' && $('#grid').classList.contains('mapa');
window.addEventListener('keydown', (e) => {
  if (!mapaVisivel() || emCampoDeTexto(e) || e.altKey || e.metaKey) return;
  if ($('.modal:not([hidden])')) return;
  if (editor && e.ctrlKey && e.code === 'KeyZ') {
    e.preventDefault();
    return desfazerEditor();
  }
  if (e.ctrlKey) return;
  const dir = TECLAS_MAPA[e.code];
  if (dir) {
    e.preventDefault();
    mapa.teclas.add(dir);
    mapa.caminho = null;
    return;
  }
  const n = /^Digit([1-5])$/.exec(e.code)?.[1];
  if (n && !e.repeat && !editor) mandarEmote(EMOTES_MAPA[n - 1]);
});
window.addEventListener('keyup', (e) => {
  const dir = TECLAS_MAPA[e.code];
  if (dir) mapa.teclas.delete(dir);
});
window.addEventListener('blur', () => mapa.teclas.clear());

function mandarEmote(emoji) {
  socket.emit('mapa:emote', emoji, (r) => r?.erro && avisar(r.erro));
}

// caminho mais curto até o tile clicado (se for móvel/parede, para do lado)
function caminhoAte(de, alvo) {
  const k = (x, y) => y * atual.l + x;
  const veio = new Map([[k(de.x, de.y), null]]);
  const fila = [de];
  const alvoLivre = livreTile(alvo.x, alvo.y);
  while (fila.length) {
    const t = fila.shift();
    const chegou = alvoLivre ? t.x === alvo.x && t.y === alvo.y : Math.abs(t.x - alvo.x) + Math.abs(t.y - alvo.y) === 1;
    if (chegou) {
      const lista = [];
      for (let c = t; c; c = veio.get(k(c.x, c.y))) lista.unshift(c);
      return lista; // começa pelo meio do tile onde está (assim não raspa na quina da parede)
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (!livreTile(n.x, n.y) || veio.has(k(n.x, n.y))) continue;
      veio.set(k(n.x, n.y), t);
      fila.push(n);
    }
  }
  return null;
}

function andar(dt) {
  const eu = pessoasMapa.get(estado.eu?.id);
  if (!eu) return;
  let vx = (mapa.teclas.has('dir') ? 1 : 0) - (mapa.teclas.has('esq') ? 1 : 0);
  let vy = (mapa.teclas.has('baixo') ? 1 : 0) - (mapa.teclas.has('cima') ? 1 : 0);
  if (editor) {
    // editando: as teclas mexem a câmera, o boneco fica parado
    const v = 320 * Math.min(dt, 0.05);
    editor.cam.x += vx * v;
    editor.cam.y += vy * v;
    vx = vy = 0;
  }
  let falta = Infinity; // indo pelo clique: não passa do ponto
  if (!vx && !vy && mapa.caminho?.length && !editor) {
    const alvo = mapa.caminho[0];
    const dx = alvo.x + 0.5 - eu.x;
    const dy = alvo.y + 0.65 - eu.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.02) {
      mapa.caminho.shift();
      if (!mapa.caminho.length) mapa.destino = null;
    } else {
      vx = dx / d;
      vy = dy / d;
      falta = d;
    }
  }
  const anda = !!(vx || vy);
  if (anda) {
    const n = Math.hypot(vx, vy);
    const passo = Math.min(Math.min(dt, 0.05) * VELOCIDADE, falta);
    const nx = eu.x + (vx / n) * passo;
    const ny = eu.y + (vy / n) * passo;
    const antes = eu.x + eu.y;
    if (livre(nx, eu.y)) eu.x = nx;
    if (livre(eu.x, ny)) eu.y = ny;
    // indo pelo clique e travou (alguém mudou o caminho, quina): desiste
    if (mapa.caminho && eu.x + eu.y === antes && ++mapa.travado > 20) mapa.caminho = mapa.destino = null;
    else mapa.travado = 0;
    eu.dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'dir' : 'esq') : vy > 0 ? 'baixo' : 'cima';
  }
  eu.alvoX = eu.x;
  eu.alvoY = eu.y;
  if (anda !== eu.anda) {
    eu.anda = anda;
    enviarPosicao(true);
  } else if (anda) {
    enviarPosicao();
  }
}

// ---------- desenhar ----------
function iniciarLoopMapa() {
  if (mapa.rodando) return;
  mapa.rodando = true;
  mapa.ultimo = performance.now();
  requestAnimationFrame(quadroMapa);
}

function quadroMapa(agora) {
  if (!estado.mapa) {
    mapa.rodando = false;
    return;
  }
  const dt = (agora - mapa.ultimo) / 1000;
  mapa.ultimo = agora;
  prepararMapa();
  andar(dt);
  for (const [id, v] of pessoasMapa) {
    if (id === estado.eu.id) continue;
    const d = Math.hypot(v.alvoX - v.x, v.alvoY - v.y);
    if (d > 4) {
      v.x = v.alvoX;
      v.y = v.alvoY;
    } else {
      const k = Math.min(1, dt * 10);
      v.x += (v.alvoX - v.x) * k;
      v.y += (v.alvoY - v.y) * k;
    }
  }
  verificarProximidade();
  if (mapaVisivel()) desenharMapa(agora / 1000);
  requestAnimationFrame(quadroMapa);
}

function camera(cv) {
  const s = mapa.escala;
  const vw = cv.clientWidth / s;
  const vh = cv.clientHeight / s;
  const larg = atual.l * T;
  const alt = atual.a * T;
  const centro = (pos, v, total) => (total <= v ? (total - v) / 2 : Math.min(Math.max(pos - v / 2, 0), total - v));
  let px;
  let py;
  if (editor) {
    // câmera livre do editor (presa pra não sumir do mapa)
    editor.cam.x = Math.min(Math.max(editor.cam.x, 0), larg);
    editor.cam.y = Math.min(Math.max(editor.cam.y, 0), alt);
    px = editor.cam.x;
    py = editor.cam.y;
  } else {
    const eu = pessoasMapa.get(estado.eu.id);
    px = (eu?.x ?? atual.l / 2) * T;
    py = (eu?.y ?? atual.a / 2) * T - 8;
  }
  return { x: Math.round(centro(px, vw, larg) * s) / s, y: Math.round(centro(py, vh, alt) * s) / s };
}

const CORES_EFE = { X: 'rgba(230,60,60,.45)', N: 'rgba(60,210,100,.45)', P: 'rgba(250,200,40,.5)' };
const corArea = (id) => `hsla(${(Number(id) * 67) % 360} 80% 60% / .35)`;

function desenharMapa(t) {
  const cv = $('#tela-mapa');
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h || !mapaBase) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  mapa.escala = editor ? editor.zoom : Math.max(2, Math.min(4, Math.round(Math.min(h / (T * 11), w / (T * 16)))));
  const s = mapa.escala;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#101015';
  c.fillRect(0, 0, cv.width, cv.height);
  const cam = camera(cv);
  mapa.cam = cam;
  const mundo = () => c.setTransform(s * dpr, 0, 0, s * dpr, -cam.x * s * dpr, -cam.y * s * dpr);
  const tela = (wx, wy) => ({ x: (wx - cam.x) * s, y: (wy - cam.y) * s });
  mundo();
  c.drawImage(mapaBase, 0, 0);
  pintarAnimados(c, t);

  const eu = pessoasMapa.get(estado.eu.id);
  const minhaArea = eu && !editor && areaEm(eu);
  if (minhaArea) {
    for (let y = 0; y < atual.a; y++) {
      for (let x = 0; x < atual.l; x++) {
        if (atual.efe[y][x] !== minhaArea) continue;
        c.fillStyle = 'rgba(255,225,140,.10)';
        c.fillRect(x * T, y * T, T, T);
      }
    }
  }
  // nome das áreas fechadas: embaixo dos bonecos (texto na resolução da tela, pra ficar nítido)
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '600 11px "gg sans", "Segoe UI", system-ui, sans-serif';
  c.fillStyle = 'rgba(255,240,200,.5)';
  for (const [id, z] of Object.entries(caixasAreas)) {
    const p = tela((z.x0 + (z.x1 - z.x0 + 1) / 2) * T, (z.y1 + 1) * T - 5);
    c.fillText(`🔒 ${nomeArea(id)}`, p.x, p.y);
  }
  mundo();
  if (mapa.destino && !editor) {
    c.strokeStyle = 'rgba(255,255,255,.7)';
    c.strokeRect(mapa.destino.x * T + 2.5, mapa.destino.y * T + 2.5, T - 5, T - 5);
  }

  // quem está na chamada e no mapa, de trás pra frente (quem está mais embaixo fica na frente)
  const lista = [...pessoasMapa].filter(([id]) => id === estado.eu.id || naChamadaMapa(id)).sort((a, b) => a[1].y - b[1].y);
  for (const [id, v] of lista) {
    const px = Math.round(v.x * T);
    const py = Math.round(v.y * T);
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.fillRect(px - 5, py - 1, 10, 2);
    c.fillRect(px - 4, py - 2, 8, 4);
    if (falando.has(id)) {
      c.fillStyle = 'rgba(35,165,90,.55)';
      c.fillRect(px - 7, py - 2, 14, 1);
      c.fillRect(px - 7, py + 2, 14, 1);
      c.fillRect(px - 8, py - 1, 1, 3);
      c.fillRect(px + 7, py - 1, 1, 3);
    }
    const andando = id === estado.eu.id ? v.anda : v.anda || Math.hypot(v.alvoX - v.x, v.alvoY - v.y) > 0.05;
    const quadro = andando ? PASSOS[Math.floor(t * 8 + (id.charCodeAt(0) % 4)) % 4] : 0;
    const b = v.boneco ?? bonecoPadrao(id.charCodeAt(0) + id.length);
    c.drawImage(sprite(b, v.dir, quadro), px - 7, py - 19 - (andando && quadro ? 1 : 0));
  }
  c.drawImage(mapaTopo, 0, 0);
  if (editor) desenharEditor(c, mundo, tela, dpr);

  // nomes e emojis por cima de tudo
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const [id, v] of lista) {
    const u = estado.usuarios.find((x) => x.id === id) ?? (id === estado.eu.id ? estado.eu : null);
    if (!u) continue;
    const p = tela(v.x * T, v.y * T - 23);
    const mudo = id === estado.eu.id ? estado.mudo || estado.surdo : u.mudo || u.surdo;
    const palco = efeitoNoPe(v) === 'P';
    const nome = (palco ? '🎤 ' : '') + u.nome + (mudo ? ' 🔇' : '');
    c.font = '600 12px "gg sans", "Segoe UI", system-ui, sans-serif';
    const lw = c.measureText(nome).width + 10;
    c.fillStyle = 'rgba(0,0,0,.62)';
    c.beginPath();
    c.roundRect(p.x - lw / 2, p.y - 9, lw, 18, 5);
    c.fill();
    if (falando.has(id)) {
      c.strokeStyle = '#23a55a';
      c.lineWidth = 2;
      c.stroke();
    }
    c.fillStyle = id === estado.eu.id ? '#fff' : '#e6e6ea';
    c.fillText(nome, p.x, p.y + 1);
    if (v.emote) {
      const idade = (performance.now() - v.emote.em) / 1000;
      if (idade > 3) {
        v.emote = null;
      } else {
        c.globalAlpha = Math.min(1, (3 - idade) * 2);
        c.font = '24px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
        c.fillText(v.emote.emoji, p.x, p.y - 22 - idade * 6);
        c.globalAlpha = 1;
      }
    }
  }
  const aviso = $('#zona-mapa');
  const noPalco = eu && !editor && efeitoNoPe(eu) === 'P';
  aviso.hidden = !minhaArea && !noPalco;
  if (noPalco) aviso.textContent = '🎤 No palco: a sala inteira está te ouvindo';
  else if (minhaArea) aviso.textContent = `🔒 ${nomeArea(minhaArea)}: só quem está aqui dentro ouve vocês`;
}

// tile do mapa embaixo do mouse
function tileDoMouse(e) {
  const r = $('#tela-mapa').getBoundingClientRect();
  return {
    x: Math.floor(((e.clientX - r.left) / mapa.escala + mapa.cam.x) / T),
    y: Math.floor(((e.clientY - r.top) / mapa.escala + mapa.cam.y) / T),
  };
}

// clique no mapa: anda até lá (no editor, pinta)
$('#tela-mapa').addEventListener('mousedown', (e) => {
  if (!atual || !mapa.cam) return;
  if (editor) return comecarPintura(e);
  const eu = pessoasMapa.get(estado.eu?.id);
  if (!eu || e.button !== 0) return;
  const alvo = tileDoMouse(e);
  if (!dentro(atual, alvo.x, alvo.y)) return;
  const c = caminhoAte({ x: Math.floor(eu.x), y: Math.floor(eu.y - 0.1) }, alvo);
  mapa.caminho = c;
  mapa.destino = c?.length ? c.at(-1) : null;
});
$('#tela-mapa').addEventListener('contextmenu', (e) => editor && e.preventDefault());

// ---------- editor (admin ou cargo construtor) ----------
// editor = { mapa (rascunho), camada, pincel, ferramenta, historico, cam, zoom, pintando, ini, fim, salvando }
let editor = null;
const VAZIO = { chao: ',', obj: ' ', efe: ' ' };
const copiaMapa = (m) => ({ ...m, chao: [...m.chao], obj: [...m.obj], efe: [...m.efe], areas: { ...m.areas } });

function abrirEditor() {
  if (!atual || editor) return;
  const eu = pessoasMapa.get(estado.eu.id);
  editor = {
    mapa: copiaMapa(atual), camada: 'chao', pincel: '#', ferramenta: 'pincel', historico: [],
    cam: { x: (eu?.x ?? atual.l / 2) * T, y: (eu?.y ?? atual.a / 2) * T }, zoom: 2,
  };
  atual = editor.mapa;
  mapaBase = null;
  mapa.caminho = mapa.destino = null;
  $('#editor-mapa').hidden = false;
  $('#btn-editar-mapa').hidden = true;
  $('#mapa').classList.add('editando');
  renderEditor();
  $('#tela-mapa').focus();
}

function fecharEditor() {
  editor = null;
  atual = estado.mapa?.mapa ?? null;
  mapaBase = null;
  $('#editor-mapa').hidden = true;
  $('#mapa').classList.remove('editando');
  $('#btn-editar-mapa').hidden = !estado.mapa?.podeEditar;
}

function trocarTile(camada, x, y, letra) {
  const m = editor.mapa;
  if (!dentro(m, x, y) || m[camada][y][x] === letra) return false;
  const linha = m[camada][y];
  m[camada][y] = linha.slice(0, x) + letra + linha.slice(x + 1);
  return true;
}
function guardarDesfazer() {
  const m = editor.mapa;
  editor.historico.push({ l: m.l, a: m.a, chao: [...m.chao], obj: [...m.obj], efe: [...m.efe], areas: { ...m.areas } });
  if (editor.historico.length > 50) editor.historico.shift();
}
function desfazerEditor() {
  const h = editor?.historico.pop();
  if (!h) return;
  Object.assign(editor.mapa, h);
  mapaBase = null;
  renderEditor();
}

// botão esquerdo pinta, direito apaga; no retângulo, arrasta e solta
function comecarPintura(e) {
  if (e.button !== 0 && e.button !== 2) return;
  e.preventDefault();
  guardarDesfazer();
  const t = tileDoMouse(e);
  editor.pintando = { apagar: e.button === 2 };
  editor.ini = t;
  editor.fim = t;
  if (editor.ferramenta === 'pincel') pintarNoEditor(t);
}
function pintarNoEditor(t) {
  const letra = editor.pintando.apagar ? VAZIO[editor.camada] : editor.pincel;
  if (trocarTile(editor.camada, t.x, t.y, letra)) mapaBase = null;
}
window.addEventListener('mousemove', (e) => {
  if (!editor?.pintando) return;
  const t = tileDoMouse(e);
  editor.fim = t;
  if (editor.ferramenta === 'pincel') pintarNoEditor(t);
});
window.addEventListener('mouseup', () => {
  if (!editor?.pintando) return;
  if (editor.ferramenta === 'retangulo') {
    const { ini, fim } = editor;
    for (let y = Math.min(ini.y, fim.y); y <= Math.max(ini.y, fim.y); y++) {
      for (let x = Math.min(ini.x, fim.x); x <= Math.max(ini.x, fim.x); x++) pintarNoEditor({ x, y });
    }
  }
  editor.pintando = null;
  renderEditor();
});
$('#tela-mapa').addEventListener('wheel', (e) => {
  if (!editor) return;
  e.preventDefault();
  editor.zoom = Math.min(4, Math.max(1, editor.zoom + (e.deltaY < 0 ? 1 : -1)));
}, { passive: false });

// grade, efeitos e o retângulo sendo desenhado (só no editor)
function desenharEditor(c, mundo, tela, dpr) {
  const m = editor.mapa;
  for (let y = 0; y < m.a; y++) {
    for (let x = 0; x < m.l; x++) {
      const e = m.efe[y][x];
      if (e === ' ') continue;
      c.fillStyle = CORES_EFE[e] ?? corArea(e);
      c.globalAlpha = editor.camada === 'efe' ? 1 : 0.45;
      c.fillRect(x * T, y * T, T, T);
      c.globalAlpha = 1;
    }
  }
  c.strokeStyle = 'rgba(255,255,255,.08)';
  c.lineWidth = 1 / mapa.escala;
  c.beginPath();
  for (let x = 0; x <= m.l; x++) { c.moveTo(x * T, 0); c.lineTo(x * T, m.a * T); }
  for (let y = 0; y <= m.a; y++) { c.moveTo(0, y * T); c.lineTo(m.l * T, y * T); }
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.5)';
  c.strokeRect(0, 0, m.l * T, m.a * T);
  if (editor.pintando && editor.ferramenta === 'retangulo') {
    const { ini, fim } = editor;
    c.strokeStyle = editor.pintando.apagar ? '#ff6b6b' : '#fff';
    c.lineWidth = 2 / mapa.escala;
    c.strokeRect(Math.min(ini.x, fim.x) * T, Math.min(ini.y, fim.y) * T, (Math.abs(fim.x - ini.x) + 1) * T, (Math.abs(fim.y - ini.y) + 1) * T);
  }
  // letra de cada efeito (na resolução da tela)
  if (editor.camada !== 'efe') return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.font = '700 10px "gg sans", "Segoe UI", system-ui, sans-serif';
  c.fillStyle = 'rgba(255,255,255,.85)';
  for (let y = 0; y < m.a; y++) {
    for (let x = 0; x < m.l; x++) {
      const e = m.efe[y][x];
      if (e === ' ') continue;
      const p = tela((x + 0.5) * T, (y + 0.5) * T);
      c.fillText(e, p.x, p.y);
    }
  }
  mundo();
}

// miniatura de um tile pra paleta
function previaTile(camada, letra) {
  const cv = el('canvas');
  cv.width = T;
  cv.height = T;
  const c = cv.getContext('2d');
  if (camada === 'efe') {
    c.fillStyle = '#3a3c42';
    c.fillRect(0, 0, T, T);
    c.fillStyle = CORES_EFE[letra] ?? corArea(letra);
    c.fillRect(0, 0, T, T);
    return cv;
  }
  const chao = camada === 'chao' ? letra : 'Tbo'.includes(letra) ? ',' : '.';
  const m = { l: 1, a: 1, chao: [chao], obj: [camada === 'obj' ? letra : ' '], efe: [' '] };
  pintarChao(c, m, chao, 0, 0);
  if (camada === 'obj') pintarObj(c, m, letra, 0, 0);
  if (letra === 'T') {
    c.save();
    c.translate(0, 8);
    pintarCopa(c, 0, 0);
    c.restore();
  }
  return cv;
}

const NOMES_CAMADA = { chao: NOMES_CHAO, obj: NOMES_OBJ, efe: NOMES_EFE };
const DICAS_EFE = {
  X: 'Ninguém passa (use pra fechar um buraco sem pôr parede)',
  N: 'Onde a galera aparece ao entrar',
  P: 'Quem pisa aqui é ouvido pela sala inteira',
};
function renderEditor() {
  if (!editor) return;
  $$('#editor-mapa [data-camada]').forEach((b) => b.classList.toggle('ativo', b.dataset.camada === editor.camada));
  $$('#editor-mapa [data-ferramenta]').forEach((b) => b.classList.toggle('ativo', b.dataset.ferramenta === editor.ferramenta));
  const paleta = $('#paleta-mapa');
  paleta.replaceChildren();
  for (const [letra, nome] of Object.entries(NOMES_CAMADA[editor.camada])) {
    const b = el('button', `tile-paleta${editor.pincel === letra ? ' ativo' : ''}`);
    b.type = 'button';
    const titulo = editor.camada === 'efe' && /[1-9]/.test(letra) ? `${nome}: ${editor.mapa.areas[letra] || 'sem nome'}` : nome;
    b.title = DICAS_EFE[letra] ? `${nome}: ${DICAS_EFE[letra]}` : titulo;
    b.append(previaTile(editor.camada, letra));
    if (editor.camada === 'efe') b.append(el('span', 'letra-paleta', letra));
    b.onclick = () => {
      editor.pincel = letra;
      renderEditor();
    };
    paleta.append(b);
  }
  // nome da área escolhida (aparece no chão e no aviso de quem entra)
  const area = editor.camada === 'efe' && /[1-9]/.test(editor.pincel);
  $('#linha-area-mapa').hidden = !area;
  if (area && document.activeElement !== $('#nome-area-mapa')) $('#nome-area-mapa').value = editor.mapa.areas[editor.pincel] ?? '';
  $('#dica-editor').textContent = editor.camada === 'efe'
    ? 'Áreas fechadas: quem está dentro só ouve quem está na mesma área. Pinte com o mesmo número.'
    : 'Clique e arraste pra pintar · botão direito apaga · WASD mexe a câmera · roda do mouse dá zoom · Ctrl+Z desfaz';
  if (document.activeElement !== $('#largura-mapa')) $('#largura-mapa').value = editor.mapa.l;
  if (document.activeElement !== $('#altura-mapa')) $('#altura-mapa').value = editor.mapa.a;
  $('#btn-desfazer-mapa').disabled = !editor.historico.length;
}

$$('#editor-mapa [data-camada]').forEach((b) => (b.onclick = () => {
  editor.camada = b.dataset.camada;
  editor.pincel = Object.keys(NOMES_CAMADA[editor.camada])[0];
  renderEditor();
}));
$$('#editor-mapa [data-ferramenta]').forEach((b) => (b.onclick = () => {
  editor.ferramenta = b.dataset.ferramenta;
  renderEditor();
}));
$('#nome-area-mapa').oninput = (e) => {
  editor.mapa.areas[editor.pincel] = e.target.value.slice(0, 24);
};
$('#btn-tamanho-mapa').onclick = () => {
  const l = Math.min(64, Math.max(8, Math.round(Number($('#largura-mapa').value) || editor.mapa.l)));
  const a = Math.min(64, Math.max(8, Math.round(Number($('#altura-mapa').value) || editor.mapa.a)));
  guardarDesfazer();
  const m = editor.mapa;
  for (const camada of ['chao', 'obj', 'efe']) {
    m[camada] = Array.from({ length: a }, (_, y) => (m[camada][y] ?? '').slice(0, l).padEnd(l, VAZIO[camada]));
  }
  Object.assign(m, { l, a });
  mapaBase = null;
  renderEditor();
};
$('#btn-desfazer-mapa').onclick = desfazerEditor;
$('#btn-cancelar-mapa').onclick = () => {
  if (editor.historico.length && !confirm('Descartar o que você mudou no mapa?')) return;
  fecharEditor();
};
$('#btn-salvar-mapa').onclick = () => {
  editor.salvando = true;
  socket.emit('mapa:salvar', editor.mapa, (r) => {
    if (!r?.erro) return avisar('Mapa salvo pra todo mundo da sala.', 3000);
    if (editor) editor.salvando = false;
    avisar(r.erro);
  });
};
$('#btn-editar-mapa').onclick = abrirEditor;

// ---------- barra do mapa e editor do boneco ----------
for (const emoji of EMOTES_MAPA) {
  const b = el('button', 'btn-emote-mapa', emoji);
  b.type = 'button';
  b.title = `Mandar ${emoji} (tecla ${EMOTES_MAPA.indexOf(emoji) + 1})`;
  b.onclick = () => { mandarEmote(emoji); $('#tela-mapa').focus(); };
  $('#emotes-mapa').append(b);
}

// estava vendo uma transmissão grande: volta pro mapa
$('#btn-mapa').onclick = () => {
  foco = null;
  renderGrid();
  $('#tela-mapa').focus();
};

function salvarBoneco(b) {
  meuBoneco = b;
  salvarStorage('boneco', b);
  sincronizarPrefs();
  const eu = pessoasMapa.get(estado.eu?.id);
  if (eu) eu.boneco = b;
  if (estado.voz) socket.emit('mapa:boneco', b);
}

function renderBoneco() {
  const b = meuBonecoAgora();
  const cv = $('#previa-boneco');
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.imageSmoothingEnabled = false;
  ['baixo', 'dir', 'cima'].forEach((d, i) => c.drawImage(sprite(b, d, 0), i * 16 + 1, 0));
  const box = $('#opcoes-boneco');
  box.replaceChildren();
  const linha = (titulo, conteudo) => {
    const l = el('div', 'linha-boneco');
    l.append(el('span', 'titulo-boneco', titulo), conteudo);
    box.append(l);
  };
  const cores = (chave, lista) => {
    const d = el('div', 'cores-boneco');
    lista.forEach((cor, i) => {
      const s = el('button', `cor-boneco${b[chave] === i ? ' ativa' : ''}`);
      s.type = 'button';
      s.style.background = cor;
      s.onclick = () => { salvarBoneco({ ...b, [chave]: i }); renderBoneco(); };
      d.append(s);
    });
    return d;
  };
  const estilo = el('div', 'estilos-boneco');
  ESTILOS_CABELO.forEach((nome, i) => {
    const s = el('button', `btn-secundario${b.cabelo === i ? ' ativo' : ''}`, nome);
    s.type = 'button';
    s.onclick = () => { salvarBoneco({ ...b, cabelo: i }); renderBoneco(); };
    estilo.append(s);
  });
  linha('Pele', cores('pele', PELES));
  linha('Cabelo', estilo);
  linha('Cor do cabelo', cores('corCabelo', CORES_CABELO));
  linha('Roupa', cores('roupa', ROUPAS));
  linha('Calça', cores('calca', CALCAS));
}

$('#btn-boneco').onclick = (e) => {
  e.stopPropagation();
  const painel = $('#painel-boneco');
  if (!painel.hidden) return fecharPopovers();
  fecharPopovers();
  renderBoneco();
  painel.hidden = false;
  const r = $('#btn-boneco').getBoundingClientRect();
  const largura = painel.getBoundingClientRect().width;
  painel.style.left = `${Math.max(8, Math.min(innerWidth - largura - 8, r.right - largura))}px`;
  painel.style.top = `${Math.max(8, r.top - painel.getBoundingClientRect().height - 10)}px`;
};
