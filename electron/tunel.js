// Link público via "Quick Tunnel" do Cloudflare (grátis, sem conta).
// Na primeira vez baixa o cloudflared oficial pra pasta do app.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BINARIOS = {
  win32: 'cloudflared-windows-amd64.exe',
  linux: 'cloudflared-linux-amd64',
};

export async function garantirCloudflared(pasta, aoProgresso) {
  const nome = BINARIOS[process.platform];
  if (!nome) throw new Error('link público ainda não funciona nesse sistema');
  const destino = path.join(pasta, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(destino)) return destino;

  const res = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${nome}`);
  if (!res.ok) throw new Error(`não consegui baixar o conector (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const partes = [];
  let baixado = 0;
  let ultimo = -1;
  for await (const parte of res.body) {
    partes.push(parte);
    baixado += parte.length;
    const pct = total ? Math.floor((baixado / total) * 100) : 0;
    if (pct !== ultimo) aoProgresso?.(pct);
    ultimo = pct;
  }
  fs.mkdirSync(pasta, { recursive: true });
  const temp = `${destino}.baixando`;
  fs.writeFileSync(temp, Buffer.concat(partes), { mode: 0o755 });
  fs.renameSync(temp, destino);
  return destino;
}

/** Abre o túnel e resolve com { url, fechar } quando o link já está funcionando. */
export function abrirTunel(exe, porta, aoCair) {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${porta}`], { windowsHide: true });
    let log = '';
    let url = null;
    let pronto = false;
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('demorou demais pra criar o link (internet bloqueando?)'));
    }, 45000);

    const ler = (dados) => {
      if (pronto) return;
      log = (log + dados).slice(-20000);
      url ??= log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;
      // só entrega o link depois que a conexão com o Cloudflare foi registrada
      if (url && /Registered tunnel connection/i.test(log)) {
        pronto = true;
        clearTimeout(timer);
        resolve({ url, fechar: () => proc.kill() });
      }
    };
    proc.stdout.on('data', ler);
    proc.stderr.on('data', ler);
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on('exit', (codigo) => {
      clearTimeout(timer);
      if (pronto) aoCair?.();
      else reject(new Error(`o conector fechou (código ${codigo})`));
    });
  });
}
