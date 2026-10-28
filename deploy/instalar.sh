#!/usr/bin/env bash
# Instala (ou atualiza) o servidor do Concord numa VM Ubuntu, como a grátis da Oracle Cloud.
#
#   curl -fsSL https://raw.githubusercontent.com/leonardoneri/Concord/main/deploy/instalar.sh | sudo bash
#
# Instala: Node 22, o servidor do Concord (serviço "concord"), Caddy (HTTPS automático no
# endereço <ip>.sslip.io) e coturn (TURN, pra chamada funcionar até no 4G).
# Rodar de novo atualiza o Concord pra última versão do GitHub, sem perder chat nem senha.
set -euo pipefail

REPO=https://github.com/leonardoneri/Concord.git
APP=/opt/concord
DADOS=/var/lib/concord
ENV=/etc/concord.env
TURN_PORTAS=49160:49200

[ "$(id -u)" = 0 ] || { echo "Rode com sudo."; exit 1; }
passo() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }

# Máquinas pequenas (a Micro grátis da Oracle tem 1 GB): cria 2 GB de swap pra instalação não travar
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && ! swapon --show | grep -q .; then
  passo "Criando swap (máquina com pouca memória)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

passo "Instalando pacotes"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl git gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent coturn >/dev/null
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy >/dev/null
fi

passo "Descobrindo o endereço"
IP_PUBLICO=$(curl -fsS4 https://api.ipify.org)
IP_PRIVADO=$(hostname -I | awk '{print $1}')
DOMINIO="${IP_PUBLICO//./-}.sslip.io"
echo "IP público: $IP_PUBLICO  →  https://$DOMINIO"

passo "Configuração (senha e TURN)"
if [ ! -f "$ENV" ]; then
  SENHA=${SENHA:-}
  if [ -z "$SENHA" ] && [ -r /dev/tty ]; then
    read -r -p "Senha pra entrar no servidor (Enter = sem senha): " SENHA < /dev/tty || true
  fi
  TURN_SENHA=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
  cat > "$ENV" <<EOF
PORT=3000
HOST=127.0.0.1
DADOS=$DADOS
SENHA=$SENHA
TURN_URL=turn:$DOMINIO:3478?transport=udp,turn:$DOMINIO:3478?transport=tcp
TURN_USER=concord
TURN_PASS=$TURN_SENHA
EOF
  chmod 600 "$ENV"
  echo "Salvo em $ENV (pra trocar a senha depois: sudo nano $ENV && sudo systemctl restart concord)"
else
  echo "Mantendo $ENV que já existe"
fi
# shellcheck disable=SC1090
. "$ENV"

passo "Baixando o Concord"
id concord >/dev/null 2>&1 || useradd --system --home "$DADOS" --shell /usr/sbin/nologin concord
mkdir -p "$DADOS" && chown concord:concord "$DADOS"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q --depth 1 origin main && git -C "$APP" reset -q --hard origin/main
else
  git clone -q --depth 1 "$REPO" "$APP"
fi
# só o que o servidor usa (sem Electron)
(cd "$APP" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --omit=dev --omit=optional --no-audit --no-fund --loglevel=error)

cat > /etc/systemd/system/concord.service <<EOF
[Unit]
Description=Concord (chat e chamada da galera)
After=network-online.target
Wants=network-online.target

[Service]
User=concord
WorkingDirectory=$APP
EnvironmentFile=$ENV
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

passo "HTTPS (Caddy)"
cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
	reverse_proxy 127.0.0.1:3000
}
EOF

passo "TURN (coturn)"
cat > /etc/turnserver.conf <<EOF
listening-port=3478
listening-ip=$IP_PRIVADO
relay-ip=$IP_PRIVADO
external-ip=$IP_PUBLICO/$IP_PRIVADO
min-port=${TURN_PORTAS%:*}
max-port=${TURN_PORTAS#*:}
realm=$DOMINIO
fingerprint
lt-cred-mech
user=$TURN_USER:$TURN_PASS
no-cli
no-tls
no-dtls
no-multicast-peers
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
EOF
sed -i 's/^#\?TURNSERVER_ENABLED=.*/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true

passo "Firewall da máquina"
# As imagens Ubuntu da Oracle bloqueiam tudo menos SSH no iptables: libera o que o Concord usa
# (insere antes do primeiro REJECT; se não tiver REJECT, só acrescenta no fim)
liberar() {
  iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null && return
  local pos
  pos=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" {print $1; exit}')
  if [ -n "$pos" ]; then iptables -I INPUT "$pos" -p "$1" --dport "$2" -j ACCEPT; else iptables -A INPUT -p "$1" --dport "$2" -j ACCEPT; fi
}
liberar tcp 80; liberar tcp 443; liberar udp 443
liberar tcp 3478; liberar udp 3478; liberar udp "$TURN_PORTAS"
netfilter-persistent save >/dev/null

passo "Ligando tudo"
systemctl daemon-reload
systemctl enable -q concord caddy coturn
systemctl restart concord coturn caddy
sleep 3
if curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  echo "Concord rodando."
else
  echo "O Concord não respondeu. Veja: sudo journalctl -u concord -n 50"; exit 1
fi

printf '\n\033[1;32mPronto!\033[0m Endereço do servidor:\n\n    https://%s\n\n' "$DOMINIO"
echo "Se não abrir, confira se as portas estão liberadas na Security List da Oracle (veja o passo a passo)."
echo "Pra atualizar o servidor no futuro, rode este mesmo comando de novo."
