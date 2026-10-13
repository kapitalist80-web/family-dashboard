#!/usr/bin/env bash
# Einrichtung auf dem Raspberry Pi:
#   - Abhaengigkeiten installieren
#   - systemd-Dienst fuer den Server einrichten
#   - Chromium im Kiosk-Modus automatisch starten
#   - Bildschirmschoner und Mauszeiger abschalten
#
# Aufruf:  ./setup-pi.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_USER="${SUDO_USER:-$USER}"
PORT="${PORT:-3100}"
SERVICE_NAME="aris-stundenplan"

info()  { printf '\033[1;36m==> %s\033[0m\n' "$1"; }
warn()  { printf '\033[1;33m!!  %s\033[0m\n' "$1"; }

if [[ $EUID -eq 0 ]]; then
  warn "Bitte ohne sudo starten – das Skript fragt selbst nach Rechten."
  exit 1
fi

info "Node.js pruefen"
if ! command -v node >/dev/null 2>&1; then
  warn "Node.js fehlt. Installation:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt install -y nodejs"
  exit 1
fi
node -v

info "Abhaengigkeiten installieren"
cd "$APP_DIR"
npm install --omit=dev

if [[ ! -f "$APP_DIR/config.json" ]]; then
  info "Startkonfiguration anlegen (config.example.json -> config.json)"
  cp "$APP_DIR/config.example.json" "$APP_DIR/config.json"
fi

info "systemd-Dienst einrichten"
sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" >/dev/null <<UNIT
[Unit]
Description=Stundenplan- und Kalenderanzeige
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=NODE_ENV=production
Environment=TZ=$(cat /etc/timezone 2>/dev/null || echo Europe/Zurich)
Environment=PORT=${PORT}
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"
sudo systemctl --no-pager --lines=5 status "${SERVICE_NAME}" || true

info "Kiosk-Autostart einrichten"
mkdir -p "$HOME/.config/autostart"
cat > "$HOME/.config/autostart/${SERVICE_NAME}-kiosk.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Stundenplan Kiosk
Exec=/bin/bash -c 'sleep 8; chromium-browser --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --check-for-update-interval=31536000 --hide-scrollbars --incognito --app=http://localhost:${PORT}'
X-GNOME-Autostart-enabled=true
DESKTOP

# Bildschirmschoner/Energiesparen aus (X11); unter Wayland uebernimmt das der Compositor
cat > "$HOME/.config/autostart/${SERVICE_NAME}-noblank.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Bildschirm wach halten
Exec=/bin/bash -c 'command -v xset >/dev/null && xset s off -dpms s noblank || true'
X-GNOME-Autostart-enabled=true
DESKTOP

info "Fertig."
echo
echo "  Anzeige:        http://localhost:${PORT}"
echo "  Einstellungen:  http://localhost:${PORT}/settings"
echo "  Logs:           journalctl -u ${SERVICE_NAME} -f"
echo
echo "Nach einem Neustart startet der Bildschirm direkt im Kiosk-Modus."
