#!/usr/bin/env bash
# Build and (re)install the Pixel Murim game server as a systemd service on Ubuntu.
# Run from the repository checkout on the server:   bash server/install.sh
# Running it again after "git pull" updates the server; player ratings are kept.
set -euo pipefail

cd "$(dirname "$0")"
source "$HOME/.cargo/env" 2>/dev/null || true

echo "== building (a few minutes on the free 1 GB server)"
cargo build --release

echo "== installing"
sudo install -m 755 target/release/pixel-murim-server /usr/local/bin/pixel-murim-server
sudo mkdir -p /var/lib/pixel-murim
sudo chown "$USER" /var/lib/pixel-murim

sudo tee /etc/systemd/system/pixel-murim.service > /dev/null <<EOF
[Unit]
Description=Pixel Murim game server (UDP 47700)
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
ExecStart=/usr/local/bin/pixel-murim-server --port 47700 --db /var/lib/pixel-murim/players.tsv
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pixel-murim > /dev/null 2>&1
sudo systemctl restart pixel-murim
sleep 1
sudo systemctl --no-pager --lines=5 status pixel-murim || true
echo
echo "== done. Live log:  journalctl -u pixel-murim -f"
