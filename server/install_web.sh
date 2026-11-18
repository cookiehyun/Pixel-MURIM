#!/usr/bin/env bash
# Web players: HTTPS / secure WebSocket in front of the game server.
#   bash server/install_web.sh pixelmurim.duckdns.org
# 1. (re)installs the game server with its WebSocket port (127.0.0.1:47701, see install.sh)
# 2. installs Caddy, which gets a free TLS certificate for the domain and forwards wss:// to it
# 3. opens TCP 80 / 443 in this machine's firewall (also open them in the Oracle Cloud security list!)
set -euo pipefail
DOMAIN="${1:?usage: bash server/install_web.sh <domain, e.g. pixelmurim.duckdns.org>}"
cd "$(dirname "$0")"

bash ./install.sh

if ! command -v caddy > /dev/null; then
  echo "== installing caddy"
  sudo apt-get update -q
  sudo apt-get install -y -q debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list > /dev/null
  sudo apt-get update -q
  sudo apt-get install -y -q caddy
fi

echo "== caddy config for $DOMAIN"
sudo tee /etc/caddy/Caddyfile > /dev/null <<CFG
$DOMAIN {
    reverse_proxy 127.0.0.1:47701
}
CFG

echo "== firewall: TCP 80, 443"
for p in 80 443; do
  if ! sudo iptables -C INPUT -p tcp --dport $p -j ACCEPT 2> /dev/null; then
    sudo iptables -I INPUT 5 -p tcp --dport $p -j ACCEPT
  fi
done
if command -v netfilter-persistent > /dev/null; then sudo netfilter-persistent save > /dev/null; fi

sudo systemctl enable caddy > /dev/null 2>&1
sudo systemctl restart caddy
sleep 3
sudo systemctl --no-pager --lines=8 status caddy || true
echo
echo "== done. Check from any browser:  https://$DOMAIN  (\"400\" or a blank page is fine: it only speaks WebSocket)"
echo "   Caddy log:  journalctl -u caddy -f      game server log:  journalctl -u pixel-murim -f"
