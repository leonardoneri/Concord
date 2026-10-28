// "Jogando X", igual o Discord: olha os programas abertos (com janela) e reconhece jogos.
// Vale um jogo da lista abaixo ou qualquer coisa instalada na pasta de jogos da Steam, Epic, Riot, Xbox, GOG…
import { app } from 'electron';
import { execFile } from 'node:child_process';

const INTERVALO = 15_000;

// nome do .exe (minúsculo, sem .exe) -> nome do jogo
const CONHECIDOS = {
  cs2: 'Counter-Strike 2',
  csgo: 'Counter-Strike: Global Offensive',
  'valorant-win64-shipping': 'VALORANT',
  'league of legends': 'League of Legends',
  'fortniteclient-win64-shipping': 'Fortnite',
  gta5: 'Grand Theft Auto V',
  gta5_enhanced: 'Grand Theft Auto V',
  playgtav: 'Grand Theft Auto V',
  rdr2: 'Red Dead Redemption 2',
  rocketleague: 'Rocket League',
  r5apex: 'Apex Legends',
  r5apex_dx12: 'Apex Legends',
  dota2: 'Dota 2',
  overwatch: 'Overwatch 2',
  rainbowsix: 'Rainbow Six Siege',
  rainbowsix_vulkan: 'Rainbow Six Siege',
  rainbowsix_be: 'Rainbow Six Siege',
  eldenring: 'Elden Ring',
  'minecraft.windows': 'Minecraft',
  minecraft: 'Minecraft',
  robloxplayerbeta: 'Roblox',
  tslgame: 'PUBG: BATTLEGROUNDS',
  'deadbydaylight-win64-shipping': 'Dead by Daylight',
  'marvel-win64-shipping': 'Marvel Rivals',
  fallguys_client_game: 'Fall Guys',
  amongus: 'Among Us',
  terraria: 'Terraria',
  'stardew valley': 'Stardew Valley',
  helldivers2: 'HELLDIVERS 2',
  cyberpunk2077: 'Cyberpunk 2077',
  eurotrucks2: 'Euro Truck Simulator 2',
  'lethal company': 'Lethal Company',
  phasmophobia: 'Phasmophobia',
  repo: 'R.E.P.O.',
  witcher3: 'The Witcher 3',
  'cod': 'Call of Duty',
  'cod24-cod': 'Call of Duty',
  'sotgame': 'Sea of Thieves',
  'fc25': 'EA SPORTS FC 25',
  'fc26': 'EA SPORTS FC 26',
  'hollow knight': 'Hollow Knight',
  'baldurs gate 3': "Baldur's Gate 3",
  bg3: "Baldur's Gate 3",
  bg3_dx11: "Baldur's Gate 3",
  'pathofexile': 'Path of Exile',
  'pathofexile2': 'Path of Exile 2',
  'wow': 'World of Warcraft',
  'hearthstone': 'Hearthstone',
  'diablo iv': 'Diablo IV',
  'thefinals': 'THE FINALS',
  'palworld-win64-shipping': 'Palworld',
  'valheim': 'Valheim',
  'rust': 'Rust',
  'factorio': 'Factorio',
  'deeprockgalactic': 'Deep Rock Galactic',
};
// Pastas das lojas: o nome do jogo é a pasta logo depois delas
const PASTAS = [
  /steamapps[\\/]common[\\/]([^\\/]+)/i,
  /epic games[\\/]([^\\/]+)/i,
  /riot games[\\/]([^\\/]+)/i,
  /xboxgames[\\/]([^\\/]+)/i,
  /gog galaxy[\\/]games[\\/]([^\\/]+)/i,
  /ubisoft game launcher[\\/]games[\\/]([^\\/]+)/i,
  /ea games[\\/]([^\\/]+)/i,
];
// lojas, launchers e ajudantes que ficam nessas pastas mas não são o jogo
const IGNORAR = /launcher|crash|anticheat|easyanticheat|battleye|steamwebhelper|riot client|riotclient|bootstrap|setup|update|redist|helper|epic online services|overlay|^unins/i;

function listarJanelas() {
  const comando = 'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.Path } | '
    + 'ForEach-Object { [pscustomobject]@{ n = $_.ProcessName; p = $_.Path; t = $_.MainWindowTitle } } | ConvertTo-Json -Compress';
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], { windowsHide: true, timeout: 10_000, maxBuffer: 4 << 20 }, (err, saida) => {
      if (err) return resolve([]);
      try {
        const lista = JSON.parse(saida || '[]');
        resolve(Array.isArray(lista) ? lista : [lista]);
      } catch {
        resolve([]);
      }
    });
  });
}

// { nome, caminho } do jogo aberto, ou null
export function acharJogo(janelas) {
  let achado = null;
  for (const { n, p, t } of janelas) {
    const exe = String(n ?? '').toLowerCase();
    if (!p || p.toLowerCase() === process.execPath.toLowerCase()) continue;
    if (CONHECIDOS[exe]) return { nome: CONHECIDOS[exe], caminho: p };
    if (exe === 'javaw' && /^minecraft/i.test(t ?? '')) return { nome: 'Minecraft', caminho: p };
    if (achado || IGNORAR.test(exe)) continue;
    for (const re of PASTAS) {
      const pasta = p.match(re)?.[1];
      if (pasta && !IGNORAR.test(pasta)) {
        achado = { nome: pasta, caminho: p };
        break;
      }
    }
  }
  return achado;
}

// Avisa `aoMudar({ nome, icone })` (ou null) quando o jogo aberto muda
export function vigiarJogos(aoMudar) {
  if (process.platform !== 'win32') return { atual: () => null };
  let atual = null;
  const verificar = async () => {
    const jogo = acharJogo(await listarJanelas());
    if (jogo?.nome === atual?.nome) return;
    let icone = null;
    if (jogo) {
      try {
        icone = (await app.getFileIcon(jogo.caminho, { size: 'normal' })).toDataURL();
      } catch {}
    }
    atual = jogo ? { nome: jogo.nome, icone } : null;
    aoMudar(atual);
  };
  verificar();
  setInterval(verificar, INTERVALO);
  return { atual: () => atual };
}
