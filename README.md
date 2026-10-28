# 🎮 Concord

O contrário do Discord: um app caseiro pra jogar com os amigos (o servidor da galera é o **Amiguinhos Gamer**): chat por canais, chamada de voz, câmera e compartilhamento de tela.

## Baixar

**[⬇️ Baixar o Concord](https://github.com/leonardoneri/Concord/releases/latest/download/Concord-Setup.exe)**. Instale uma vez; depois o app avisa sozinho quando sai versão nova, e é só clicar em **Atualizar agora**.

## Passo a passo

### Quem cria o servidor (só uma pessoa)

1. Instale e abra o **Concord** (link lá em cima).
2. Clique em **Criar servidor e entrar**. Na primeira vez demora um pouco porque o app baixa o conector do link.
3. Escolha seu nome.
4. Clique no ícone de **Convidar** (bonequinho com +) e depois em **Copiar**. Mande o link no grupo.

Seu PC precisa ficar com o app aberto enquanto a galera usa. O link muda toda vez que você cria o servidor de novo.

### Quem vai entrar (mande isso pros amigos)

> **Opção 1, sem instalar nada:** abra o link que mandei no Chrome ou no Edge, escolha um nome e pronto. Quando entrar na chamada, permita o microfone.
>
> **Opção 2, com o app (melhor pra compartilhar tela):** instale o app por este link: https://github.com/leonardoneri/Concord/releases/latest/download/Concord-Setup.exe. Abra, cole o link em **Entrar com convite** e clique em **Entrar**.
>
> Se aparecer "O Windows protegeu o computador", clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não é assinado.

Da próxima vez, o app já lembra seu nome e tem um botão **Entrar de novo**.

## Recursos

- Visual no estilo Discord: canais de texto e voz, lista de membros, painel "Voz conectada"
- Chat com histórico, "digitando...", links, prévia de imagens e notificação do Windows
- Mandar imagem: cole com `Ctrl+V`, arraste pro chat ou clique no **+** (até 10 MB)
- Chamada com indicador de quem está falando, sons de entrar e sair, mutar (`Ctrl+Shift+M`) e desativar áudio (`Ctrl+Shift+D`). No app, os atalhos funcionam até com o jogo em foco
- Se o link público cair, o app cria outro sozinho e avisa o link novo
- Câmera e compartilhamento de tela com escolha de janela ou tela inteira, com opção de incluir o som do PC
- Volume por pessoa, tela cheia com duplo clique, escolha de microfone, câmera e saída de áudio (clique no seu nome)

## Deu ruim?

| Problema | O que fazer |
|---|---|
| "Não consegui conectar em…" | O servidor foi fechado ou o link mudou. Peça o link novo. |
| Entra no chat mas não ouve ninguém, ou aparece "Não deu pra conectar a chamada" | A rede de alguém bloqueia a chamada direta (comum em 4G). Quem hospeda coloca um servidor **TURN** em *Opções avançadas* (dá pra criar um grátis no metered.ca ou em serviços parecidos). |
| Não aparece o botão de compartilhar tela no celular | O navegador do celular não deixa. Use o PC. |
| A galera ouve eco quando eu compartilho a tela | Desmarque "Incluir som do PC" no seletor de tela. |
| Quero que só meus amigos entrem | Coloque uma senha em *Opções avançadas* e passe junto com o link. |

**Sem internet aberta** (todo mundo na mesma rede, ou usando Radmin VPN/Hamachi): desmarque "Criar link pra amigos pela internet". O convite vai mostrar o IP local. Nesse modo os amigos precisam usar o app, e o Windows pergunta sobre o firewall: aceite.

## Para desenvolvedores

```powershell
npm install
npm start                 # abre o app a partir do código
npm run dist              # gera dist\Concord-Setup.exe (só no seu PC, não publica)
npm run publicar          # gera e publica no GitHub Releases (precisa do GH_TOKEN, veja abaixo)
npm run servidor          # só o servidor (pra rodar numa VPS). Variáveis: PORT, SENHA, TURN_URL, TURN_USER, TURN_PASS
npx electron scripts/gerar-icone.mjs   # regera o ícone
```

- Os canais ficam em `CANAIS_TEXTO` e `CANAIS_VOZ` no `server.js`.
- O histórico do chat de quem hospeda fica em `%APPDATA%\concord\dados\chat.db`, e as imagens em `dados\uploads`.
- O link público usa o Quick Tunnel do Cloudflare (`cloudflared`, baixado pra `%APPDATA%\concord\bin`).
- A chamada é P2P (mesh): funciona bem até umas 5 ou 6 pessoas com vídeo ou tela.

### Lançar uma atualização

1. Aumente a `version` no `package.json` (ex.: `1.0.0` → `1.0.1`). Sem isso o app da galera não percebe que tem versão nova.
2. Publique:
   ```powershell
   $env:GH_TOKEN = "seu-token"   # token do GitHub com permissão de escrever em Contents
   npm run publicar
   ```
3. Pronto: em até 4 horas (ou ao abrir o app) cada um recebe o aviso de atualização.

Só a versão instalada se atualiza sozinha. Mudanças em `public/` e `server.js` chegam pra galera assim que quem hospeda atualiza; mudanças em `electron/` precisam que cada um atualize.
