// Atualização automática pelo GitHub Releases (só funciona na versão instalada, não na portátil).
// Baixa em segundo plano e, quando termina, pergunta se quer reiniciar pra atualizar.
import { app, dialog } from 'electron';
import updater from 'electron-updater';

const { autoUpdater } = updater;
const INTERVALO = 4 * 60 * 60 * 1000; // procura de novo a cada 4 horas

export function iniciarAtualizador({ janela, hospedando }) {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true; // se clicar "Depois", instala quando fechar o app
  let perguntou = false;

  autoUpdater.on('download-progress', ({ percent }) => janela()?.setProgressBar(percent / 100));
  autoUpdater.on('error', (err) => {
    janela()?.setProgressBar(-1);
    console.error('Erro ao atualizar', err);
  });

  autoUpdater.on('update-downloaded', async ({ version }) => {
    const j = janela();
    j?.setProgressBar(-1);
    if (perguntou) return;
    perguntou = true;
    const { response } = await dialog.showMessageBox(j, {
      type: 'info',
      title: 'Atualização disponível',
      message: `A versão ${version} do Amiguinhos Gamer está pronta.`,
      detail: hospedando()
        ? 'Você está hospedando: a galera cai por alguns segundos e o link de convite muda. Se preferir, clique em "Depois" e ela instala quando você fechar o app.'
        : 'O app reinicia rapidinho. Se preferir, clique em "Depois" e ela instala quando você fechar o app.',
      buttons: ['Atualizar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (response === 0) autoUpdater.quitAndInstall(true, true);
  });

  const procurar = () => autoUpdater.checkForUpdates().catch((err) => console.error('Erro ao procurar atualização', err));
  procurar();
  setInterval(procurar, INTERVALO);
}
