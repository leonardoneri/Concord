// Gera electron/icone.png (256x256) a partir do SVG abaixo.
// Uso: npx electron scripts/gerar-icone.mjs
import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'icone.png');

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5865f2"/>
      <stop offset="1" stop-color="#9b59f5"/>
    </linearGradient>
  </defs>
  <rect x="8" y="8" width="240" height="240" rx="64" fill="url(#g)"/>
  <path fill="#fff" d="M84 76h88c26 0 46 19 50 45l9 48c4 22-21 37-38 22l-25-23h-80l-25 23c-17 15-42 0-38-22l9-48c4-26 24-45 50-45z"/>
  <rect x="68" y="113" width="40" height="13" rx="6" fill="#6d5ff4"/>
  <rect x="81.5" y="99.5" width="13" height="40" rx="6" fill="#6d5ff4"/>
  <circle cx="170" cy="106" r="9" fill="#6d5ff4"/>
  <circle cx="190" cy="126" r="9" fill="#6d5ff4"/>
  <circle cx="150" cy="126" r="9" fill="#6d5ff4"/>
  <circle cx="170" cy="146" r="9" fill="#6d5ff4"/>
</svg>`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 256, height: 256, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  const html = `<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(SVG).toString('base64')}" width="256" height="256"></body></html>`;
  await w.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
  await new Promise((r) => setTimeout(r, 500));
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 256, height: 256 });
  fs.writeFileSync(destino, img.resize({ width: 256, height: 256 }).toPNG());
  console.log('ícone salvo em', destino);
  app.exit(0);
});
