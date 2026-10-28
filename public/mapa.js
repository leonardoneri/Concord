// ---------- mapa da chamada: sala em pixel art, cada um com seu boneco, áudio por proximidade ----------
// Tudo é desenhado aqui mesmo (tiles e bonecos em código), sem imagem de fora.
// Usa as coisas do app.js: estado, socket, peers, falando, $, el, avisar, renderGrid, atualizarAudios...

const T = 16; // pixels de um tile no desenho (a tela amplia 2x a 4x)
// , grama   * flor     : caminho  T árvore   ~ água    # parede   . madeira  _ azulejo  = tapete  + porta
// S sofá    V TV       M mesa     h cadeira  P planta  L estante  A fliperama Q sinuca  G geladeira
// F fogão   B balcão   b banco    o fogueira d puff
const MAPA = [
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
const MAPA_L = MAPA[0].length;
const MAPA_A = MAPA.length;
const BLOQUEIA = new Set('T~#SVMPLAQGFBbo');
const PISOS = new Set('.,_=*:');
// áreas fechadas: quem está dentro só ouve (e só é ouvido por) quem está na mesma área
const ZONAS = [
  { nome: 'Sala de reunião', x0: 16, y0: 9, x1: 26, y1: 15 },
  { nome: 'Fogueira', x0: 33, y0: 13, x1: 37, y1: 17 },
];
const NASCER = { x: 8.5, y: 18.6 }; // na frente da porta da casa
const PERTO = 2.5; // até aqui (em tiles) ouve com volume cheio
const LONGE = 7; // daqui pra frente não ouve mais
const VELOCIDADE = 5; // tiles por segundo
const EMOTES_MAPA = ['👋', '😂', '❤️', '👍', '🎉'];

const tileEm = (x, y) => MAPA[y]?.[x] ?? 'T';
const livreTile = (x, y) => !BLOQUEIA.has(tileEm(x, y));
const zonaEm = (p) => ZONAS.find((z) => p.x >= z.x0 && p.x < z.x1 + 1 && p.y >= z.y0 && p.y < z.y1 + 1) ?? null;

// número "aleatório" fixo por tile (o desenho não muda a cada vez que abre)
function rnd(x, y, i = 0) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(i, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------- tiles ----------
function pisoDe(tx, ty) {
  for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0], [1, 1], [-1, -1]]) {
    const c = tileEm(tx + dx, ty + dy);
    if (PISOS.has(c)) return c === '*' ? ',' : c;
  }
  return '.';
}

function pintarTile(c, ch, tx, ty) {
  const X = tx * T;
  const Y = ty * T;
  const p = (cor, x, y, w = 1, h = 1) => { c.fillStyle = cor; c.fillRect(X + x, Y + y, w, h); };
  const viz = (dx, dy) => tileEm(tx + dx, ty + dy);
  const r = (i) => rnd(tx, ty, i);
  const piso = () => pintarTile(c, pisoDe(tx, ty), tx, ty);
  switch (ch) {
    case ',':
    case 'T':
    case 'b':
    case 'o':
      p('#5d9e4b', 0, 0, 16, 16);
      for (let i = 0; i < 7; i++) p(r(i) > 0.5 ? '#4e8a3f' : '#6fb35a', (r(i + 10) * 15) | 0, (r(i + 20) * 14) | 0, 1, 2);
      if (ch === 'T') {
        p('rgba(0,0,0,.22)', 2, 10, 12, 5);
        p('#6b4423', 6, 7, 4, 8);
        p('#8a5a32', 6, 7, 1, 8);
      } else if (ch === 'b') {
        p('#5e3c20', 2, 11, 2, 4);
        p('#5e3c20', 12, 11, 2, 4);
        p('#8a5a32', 1, 5, 14, 3);
        p('#a06a3c', 1, 5, 14, 1);
        p('#8a5a32', 1, 9, 14, 3);
        p('#a06a3c', 1, 9, 14, 1);
      } else if (ch === 'o') {
        p('#7d7d86', 2, 9, 12, 5);
        p('#9a9aa4', 3, 9, 10, 1);
        p('#4a3020', 3, 10, 10, 3);
        p('#6b4423', 4, 10, 8, 2);
      }
      break;
    case '*':
      pintarTile(c, ',', tx, ty);
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
    case '#': {
      const frente = !['#'].includes(viz(0, 1));
      if (frente) {
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
    }
    case 'S': {
      piso();
      p('rgba(0,0,0,.2)', 0, 13, 16, 2);
      p('#3e5c9e', 0, 1, 16, 6);
      p('#4f70b8', 0, 6, 16, 7);
      p('#6a8ad0', 1, 7, 14, 2);
      p('#34508c', 0, 12, 16, 1);
      if (viz(-1, 0) !== 'S') p('#344f88', 0, 2, 3, 11);
      if (viz(1, 0) !== 'S') p('#344f88', 13, 2, 3, 11);
      break;
    }
    case 'V': {
      piso();
      const l = viz(-1, 0) !== 'V' ? 1 : 0;
      const d = viz(1, 0) !== 'V' ? 15 : 16;
      p('#5a3e2a', l, 10, d - l, 5);
      p('#7a5638', l, 10, d - l, 1);
      p('#0f0f16', l, 1, d - l, 9);
      p('#1f2c4a', l + (l ? 1 : 0), 2, d - l - (l ? 1 : 0) - (d === 15 ? 1 : 0), 7);
      break;
    }
    case 'M': {
      piso();
      p('#a8703f', 0, 0, 16, 16);
      p('#bf8550', 0, 1, 16, 1);
      if (viz(0, -1) !== 'M') p('#7a4c28', 0, 0, 16, 2);
      if (viz(-1, 0) !== 'M') p('#7a4c28', 0, 0, 2, 16);
      if (viz(1, 0) !== 'M') p('#7a4c28', 14, 0, 2, 16);
      if (viz(0, 1) !== 'M') p('#6a3e1e', 0, 12, 16, 4);
      break;
    }
    case 'h': {
      piso();
      p('rgba(0,0,0,.18)', 4, 12, 8, 2);
      p('#7a4a2a', 4, 4, 8, 8);
      p('#93603a', 5, 5, 6, 6);
      if (viz(0, 1) === 'M') p('#5e3820', 4, 2, 8, 3);
      else if (viz(0, -1) === 'M') p('#5e3820', 4, 11, 8, 3);
      else if (viz(1, 0) === 'M') p('#5e3820', 2, 4, 3, 8);
      else p('#5e3820', 11, 4, 3, 8);
      break;
    }
    case 'P':
      piso();
      p('rgba(0,0,0,.2)', 4, 13, 8, 2);
      p('#b0603a', 5, 10, 6, 5);
      p('#c87444', 5, 10, 6, 1);
      p('#2e7238', 3, 3, 10, 8);
      p('#3c8f45', 4, 2, 8, 7);
      p('#56b05c', 5, 3, 3, 3);
      p('#56b05c', 9, 5, 2, 2);
      break;
    case 'L': {
      piso();
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
      piso();
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
      piso();
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
      piso();
      p('#9aa4aa', 2, 0, 12, 16);
      p('#dfe6ea', 3, 0, 10, 15);
      p('#b8c2c8', 3, 6, 10, 1);
      p('#8a949a', 11, 2, 1, 3);
      p('#8a949a', 11, 8, 1, 4);
      break;
    case 'F':
      piso();
      p('#6a6f78', 0, 0, 16, 15);
      p('#8a8f98', 1, 1, 14, 12);
      for (const [x, y] of [[3, 2], [9, 2], [3, 8], [9, 8]]) {
        p('#2a2a30', x, y, 4, 4);
        p('#4a4a52', x + 1, y + 1, 2, 2);
      }
      break;
    case 'B':
      piso();
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
      piso();
      p('rgba(0,0,0,.2)', 2, 12, 12, 3);
      p('#b07a28', 2, 5, 12, 9);
      p('#d89a3a', 2, 4, 12, 8);
      p('#e8b45a', 4, 5, 6, 3);
      break;
    default:
      p('#000', 0, 0, 16, 16);
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

let mapaBase = null;
let mapaTopo = null;
const animados = []; // tiles que mexem: água, fogueira, fliperama
function prepararMapa() {
  if (mapaBase) return;
  mapaBase = document.createElement('canvas');
  mapaBase.width = MAPA_L * T;
  mapaBase.height = MAPA_A * T;
  mapaTopo = document.createElement('canvas');
  mapaTopo.width = mapaBase.width;
  mapaTopo.height = mapaBase.height;
  const b = mapaBase.getContext('2d');
  const t = mapaTopo.getContext('2d');
  for (let y = 0; y < MAPA_A; y++) {
    for (let x = 0; x < MAPA_L; x++) {
      const ch = MAPA[y][x];
      pintarTile(b, ch, x, y);
      if (ch === 'T') pintarCopa(t, x, y);
      if ('~oA'.includes(ch)) animados.push({ ch, x, y });
    }
  }
  // nome das áreas fechadas escrito no chão
  for (const z of ZONAS) {
    b.fillStyle = 'rgba(255,255,255,.05)';
    b.fillRect(z.x0 * T, z.y0 * T, (z.x1 - z.x0 + 1) * T, (z.y1 - z.y0 + 1) * T);
  }
}

function pintarAnimados(c, t) {
  for (const { ch, x, y } of animados) {
    const X = x * T;
    const Y = y * T;
    if (ch === '~') {
      if (tileEm(x, y - 1) !== '~' || tileEm(x, y + 1) !== '~' || tileEm(x - 1, y) !== '~' || tileEm(x + 1, y) !== '~') continue;
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

// ---------- estado do mapa ----------
// id -> { x, y (o que aparece), alvoX, alvoY (o último que chegou), dir, anda, boneco, emote }
const pessoasMapa = new Map();
const mapa = {
  rodando: false, ultimo: 0, teclas: new Set(), caminho: null, destino: null,
  enviado: null, enviadoEm: 0, fatores: new Map(), pertoChave: '', escala: 3, travado: 0,
};
const naChamadaMapa = (id) => estado.usuarios.some((u) => u.id === id && u.voz === estado.voz);

// volume da voz de alguém conforme a distância (1 = normal, 0 = não ouve)
function fatorMapa(id) {
  if (!estado.voz || !estado.mapa || id === estado.eu?.id) return 1;
  const eu = pessoasMapa.get(estado.eu.id);
  const o = pessoasMapa.get(id);
  if (!eu || !o) return 1; // ainda não entrou no mapa (ou app antigo): ouve normal
  const za = zonaEm(eu);
  const zb = zonaEm(o);
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

function lugarParaNascer() {
  for (let tent = 0; tent < 30; tent++) {
    const x = NASCER.x + (Math.random() - 0.5) * 4;
    const y = NASCER.y + (Math.random() - 0.5) * 2;
    if (livre(x, y)) return { x, y };
  }
  return { ...NASCER };
}

// o pé do boneco cabe ali?
function livre(x, y) {
  for (const [dx, dy] of [[-0.28, -0.25], [0.28, -0.25], [-0.28, -0.02], [0.28, -0.02]]) {
    if (!livreTile(Math.floor(x + dx), Math.floor(y + dy))) return false;
  }
  return true;
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
    mapa.pertoChave = '';
    mapa.caminho = null;
    if (antes) foco = null;
    $('#painel-boneco').hidden = true;
    renderGrid();
    return;
  }
  if (!antes) foco = null;
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
  // eu ainda não estou no mapa (ou o servidor me esqueceu): entro / mando de novo onde estou
  let eu = pessoasMapa.get(estado.eu.id);
  if (!eu) {
    const pos = lugarParaNascer();
    eu = { ...pos, alvoX: pos.x, alvoY: pos.y, dir: 'baixo', anda: false, boneco: meuBonecoAgora(), emote: null };
    pessoasMapa.set(estado.eu.id, eu);
  }
  if (!vistos.has(estado.eu.id)) {
    socket.emit('mapa:boneco', meuBonecoAgora());
    enviarPosicao(true);
  }
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

// a conexão voltou no meio da chamada: o servidor pode ter esquecido o mapa (reiniciou)
function restaurarMapa() {
  const tinha = !!estado.mapa;
  socket.emit('mapa:estado', null, (dados) => {
    if (dados || !tinha) return aplicarMapa(dados);
    socket.emit('mapa:ligar', null, () => {});
  });
}

// ---------- andar ----------
const TECLAS_MAPA = {
  KeyW: 'cima', ArrowUp: 'cima', KeyS: 'baixo', ArrowDown: 'baixo',
  KeyA: 'esq', ArrowLeft: 'esq', KeyD: 'dir', ArrowRight: 'dir',
};
const mapaVisivel = () => !!estado.mapa && estado.view === 'voz' && $('#grid').classList.contains('mapa');
window.addEventListener('keydown', (e) => {
  if (!mapaVisivel() || emCampoDeTexto(e) || e.ctrlKey || e.altKey || e.metaKey) return;
  if ($('.modal:not([hidden])')) return;
  const dir = TECLAS_MAPA[e.code];
  if (dir) {
    e.preventDefault();
    mapa.teclas.add(dir);
    mapa.caminho = null;
    return;
  }
  const n = /^Digit([1-5])$/.exec(e.code)?.[1];
  if (n && !e.repeat) mandarEmote(EMOTES_MAPA[n - 1]);
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
  const k = (x, y) => y * MAPA_L + x;
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
  let falta = Infinity; // indo pelo clique: não passa do ponto
  if (!vx && !vy && mapa.caminho?.length) {
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
  prepararMapa();
  requestAnimationFrame(quadroMapa);
}

function quadroMapa(agora) {
  if (!estado.mapa) {
    mapa.rodando = false;
    return;
  }
  const dt = (agora - mapa.ultimo) / 1000;
  mapa.ultimo = agora;
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
  const eu = pessoasMapa.get(estado.eu.id);
  const s = mapa.escala;
  const vw = cv.clientWidth / s;
  const vh = cv.clientHeight / s;
  const larg = MAPA_L * T;
  const alt = MAPA_A * T;
  const centro = (pos, v, total) => (total <= v ? (total - v) / 2 : Math.min(Math.max(pos - v / 2, 0), total - v));
  return {
    x: Math.round(centro((eu?.x ?? NASCER.x) * T, vw, larg) * s) / s,
    y: Math.round(centro((eu?.y ?? NASCER.y) * T - 8, vh, alt) * s) / s,
  };
}

function desenharMapa(t) {
  const cv = $('#tela-mapa');
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  mapa.escala = Math.max(2, Math.min(4, Math.round(Math.min(h / (T * 11), w / (T * 16)))));
  const s = mapa.escala;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#101015';
  c.fillRect(0, 0, cv.width, cv.height);
  const cam = camera(cv);
  mapa.cam = cam;
  const mundo = () => c.setTransform(s * dpr, 0, 0, s * dpr, -cam.x * s * dpr, -cam.y * s * dpr);
  mundo();
  c.drawImage(mapaBase, 0, 0);
  pintarAnimados(c, t);

  const eu = pessoasMapa.get(estado.eu.id);
  const minhaZona = eu && zonaEm(eu);
  if (minhaZona) {
    const z = minhaZona;
    c.fillStyle = 'rgba(255,225,140,.10)';
    c.fillRect(z.x0 * T, z.y0 * T, (z.x1 - z.x0 + 1) * T, (z.y1 - z.y0 + 1) * T);
    c.strokeStyle = 'rgba(255,225,140,.6)';
    c.lineWidth = 1;
    c.setLineDash([3, 2]);
    c.strokeRect(z.x0 * T + 0.5, z.y0 * T + 0.5, (z.x1 - z.x0 + 1) * T - 1, (z.y1 - z.y0 + 1) * T - 1);
    c.setLineDash([]);
  }
  // nome das áreas fechadas: embaixo dos bonecos (texto na resolução da tela, pra ficar nítido)
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const tela = (wx, wy) => ({ x: (wx - cam.x) * s, y: (wy - cam.y) * s });
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = '600 11px "gg sans", "Segoe UI", system-ui, sans-serif';
  c.fillStyle = 'rgba(255,240,200,.5)';
  for (const z of ZONAS) {
    const p = tela((z.x0 + (z.x1 - z.x0 + 1) / 2) * T, (z.y1 + 1) * T - 5);
    c.fillText(`🔒 ${z.nome}`, p.x, p.y);
  }
  mundo();
  if (mapa.destino) {
    c.strokeStyle = 'rgba(255,255,255,.7)';
    c.strokeRect(mapa.destino.x * T + 2.5, mapa.destino.y * T + 2.5, T - 5, T - 5);
  }

  // quem está na chamada e no mapa, de trás pra frente (quem está mais embaixo fica na frente)
  const lista = [...pessoasMapa].filter(([id]) => id === estado.eu.id || naChamadaMapa(id)).sort((a, b) => a[1].y - b[1].y);
  for (const [id, v] of lista) {
    const px = Math.round(v.x * T);
    const py = Math.round(v.y * T);
    const fala = falando.has(id);
    c.fillStyle = 'rgba(0,0,0,.28)';
    c.fillRect(px - 5, py - 1, 10, 2);
    c.fillRect(px - 4, py - 2, 8, 4);
    if (fala) {
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

  // nomes e emojis por cima de tudo
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const [id, v] of lista) {
    const u = estado.usuarios.find((x) => x.id === id) ?? (id === estado.eu.id ? estado.eu : null);
    if (!u) continue;
    const p = tela(v.x * T, v.y * T - 23);
    const fala = falando.has(id);
    const mudo = id === estado.eu.id ? estado.mudo || estado.surdo : u.mudo || u.surdo;
    const nome = u.nome + (mudo ? ' 🔇' : '');
    c.font = '600 12px "gg sans", "Segoe UI", system-ui, sans-serif';
    const lw = c.measureText(nome).width + 10;
    c.fillStyle = 'rgba(0,0,0,.62)';
    c.beginPath();
    c.roundRect(p.x - lw / 2, p.y - 9, lw, 18, 5);
    c.fill();
    if (fala) {
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
  aviso.hidden = !minhaZona;
  if (minhaZona) aviso.textContent = `🔒 ${minhaZona.nome}: só quem está aqui dentro ouve vocês`;
}

// clique no mapa: anda até lá
$('#tela-mapa').addEventListener('mousedown', (e) => {
  const eu = pessoasMapa.get(estado.eu?.id);
  if (!eu || !mapa.cam || e.button !== 0) return;
  const r = e.currentTarget.getBoundingClientRect();
  const tx = Math.floor(((e.clientX - r.left) / mapa.escala + mapa.cam.x) / T);
  const ty = Math.floor(((e.clientY - r.top) / mapa.escala + mapa.cam.y) / T);
  if (tx < 0 || ty < 0 || tx >= MAPA_L || ty >= MAPA_A) return;
  const c = caminhoAte({ x: Math.floor(eu.x), y: Math.floor(eu.y - 0.1) }, { x: tx, y: ty });
  mapa.caminho = c;
  mapa.destino = c?.length ? c.at(-1) : null;
});

// ---------- barra do mapa e editor do boneco ----------
for (const emoji of EMOTES_MAPA) {
  const b = el('button', 'btn-emote-mapa', emoji);
  b.type = 'button';
  b.title = `Mandar ${emoji} (tecla ${EMOTES_MAPA.indexOf(emoji) + 1})`;
  b.onclick = () => { mandarEmote(emoji); $('#tela-mapa').focus(); };
  $('#emotes-mapa').append(b);
}

$('#btn-mapa').onclick = () => {
  if (estado.mapa) {
    foco = null; // estava vendo uma transmissão grande: volta pro mapa
    renderGrid();
    return $('#tela-mapa').focus();
  }
  socket.emit('mapa:ligar', null, (r) => r?.erro && avisar(r.erro));
};
$('#btn-desligar-mapa').onclick = () => {
  if (confirm('Desligar o mapa pra todo mundo da chamada? Volta todo mundo a se ouvir normal.')) socket.emit('mapa:desligar');
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
