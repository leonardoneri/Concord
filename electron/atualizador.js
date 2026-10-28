// Atualização automática pelo GitHub Releases (só na versão instalada).
// Baixa em segundo plano e, quando termina, o app mostra um botão verde (igual o Discord):
// clicar reinicia já atualizado; sem clicar, instala quando fechar o app.
import { app, ipcMain } from 'electron';
import updater from 'electron-updater';

const { autoUpdater } = updater;
const INTERVALO = 10 * 60 * 1000; // procura de novo a cada 10 minutos, com o app aberto

export function iniciarAtualizador({ janela }) {
  // a página pergunta ao carregar (e depois de um F5), então o estado fica guardado aqui
  let pronta = null; // { versao } quando a atualização já foi baixada
  ipcMain.handle('desktop:atualizacao', () => pronta);
  ipcMain.handle('desktop:atualizar', () => {
    if (pronta) autoUpdater.quitAndInstall(true, true);
  });
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('download-progress', ({ percent }) => janela()?.setProgressBar(percent / 100));
  autoUpdater.on('error', (err) => {
    janela()?.setProgressBar(-1);
    console.error('Erro ao atualizar', err);
  });

  autoUpdater.on('update-downloaded', ({ version }) => {
    janela()?.setProgressBar(-1);
    pronta = { versao: version };
    janela()?.webContents.send('desktop:atualizacao', pronta);
  });

  const procurar = () => autoUpdater.checkForUpdates().catch((err) => console.error('Erro ao procurar atualização', err));
  procurar();
  setInterval(procurar, INTERVALO);
}
