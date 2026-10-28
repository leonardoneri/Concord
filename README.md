# 🎮 Concord

O contrário do Discord. 😄

O Concord é um app feito pra galera jogar junto: servidores com canais de texto, chamada de voz, câmera e compartilhamento de tela com até 60 fps, sem mensalidade.

## Instalar

1. **[Baixe o Concord](https://github.com/leonardoneri/Concord/releases/latest/download/Concord-Setup.exe)**
2. Abra o `Concord-Setup.exe`. Ele instala sozinho e já abre o app.
3. Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações → Executar assim mesmo**. O aviso aparece só porque o app não tem assinatura paga da Microsoft.

Pronto. Você só instala uma vez: quando sair versão nova, aparece um botão verde na barra da esquerda. Clique nele pra reiniciar já atualizado, ou deixe que ela instala sozinha da próxima vez que fechar o app.

## Primeiro uso

1. Abra o app e clique em **Criar conta**. Se te mandaram um convite, cole o código dele em **Código de convite**.
2. Depois de entrar:
   - **Quer um servidor pra sua galera?** Clique em **Criar meu servidor**. Você vira o dono e já aparece o link de convite pra mandar pros amigos.
   - **Te convidaram?** Clique no **+** da barra da esquerda → **Entrar num servidor** e cole o código ou o link.

Pra convidar mais gente depois, clique no nome do servidor (no topo) → **Convidar pessoas**.

Não quer instalar? Dá pra abrir o link do convite direto no Chrome ou no Edge. Só o compartilhamento de tela funciona melhor pelo app.

## Dicas

- **Responder, reagir e marcar:** passe o mouse numa mensagem pra responder ou reagir com emoji. Digite `@` pra marcar alguém (ou `@todos`).
- **Mensagem direta:** clique no nome de alguém → **Mandar mensagem**. As conversas ficam no balão no topo da barra da esquerda.
- **Status:** clique no seu nome, embaixo à esquerda, pra ficar ausente, não perturbe (sem notificação) ou invisível, e escrever um status tipo "Jogando CS2".
- **Buscar:** caixa de busca no topo, ou Ctrl+F.
- **Arquivos:** clique no + ao lado do chat, cole com Ctrl+V ou arraste. Até 25 MB (vídeos tocam direto no chat).
- **Apertar pra falar e atalhos:** em **Configurações → Voz e atalhos**. Dá pra usar o botão lateral do mouse. No app, funciona até dentro do jogo.
- **Microfone com barulho?** Em **Configurações → Supressão de ruído**, escolha **Forte**: tira teclado, ventilador e barulho de fundo.

## Pra quem mexe no código

`npm test` roda os testes do servidor (contas, servidores, mensagens, DMs, arquivos, backup).
