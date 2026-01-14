#!/bin/bash
# Setup-Skript für Familienkalender Kiosk-Modus

echo "=== Familienkalender Kiosk-Modus Setup ==="
echo ""

# 1. Chromium installieren (falls nicht vorhanden)
echo "1. Prüfe Chromium Installation..."
if ! command -v chromium-browser &> /dev/null && ! command -v chromium &> /dev/null
then
    echo "Chromium nicht gefunden. Installiere..."
    sudo apt update
    if sudo apt install -y chromium 2>/dev/null; then
        echo "✓ Chromium installiert"
        sudo ln -sf /usr/bin/chromium /usr/bin/chromium-browser 2>/dev/null
    elif sudo apt install -y chromium-browser 2>/dev/null; then
        echo "✓ Chromium-browser installiert"
    else
        echo "⚠ Konnte Chromium nicht automatisch installieren"
        echo "Versuche manuell: sudo apt install chromium"
    fi
else
    echo "✓ Chromium ist bereits installiert"
fi

# 2. Autostart-Verzeichnis erstellen
echo ""
echo "2. Erstelle Autostart-Konfiguration..."
mkdir -p ~/.config/lxsession/LXDE-pi

# 3. Autostart-Datei erstellen
cat > ~/.config/lxsession/LXDE-pi/autostart << 'EOF'
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash

# Bildschirmschoner deaktivieren
@xset s off
@xset -dpms
@xset s noblank

# Cursor verstecken nach 5 Sekunden Inaktivität
@unclutter -idle 5

# Warte 15 Sekunden bis Server gestartet ist, dann öffne Chromium im Kiosk-Modus
@bash -c 'sleep 15 && (chromium-browser --kiosk --app=http://localhost:3000 --start-fullscreen --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run --disable-translate 2>/dev/null || chromium --kiosk --app=http://localhost:3000 --start-fullscreen --noerrdialogs --disable-infobars --disable-session-crashed-bubble --no-first-run --disable-translate)'
EOF

echo "✓ Autostart-Datei erstellt"

# 4. Unclutter installieren (versteckt Mauszeiger)
echo ""
echo "3. Installiere unclutter (versteckt Mauszeiger)..."
sudo apt install -y unclutter

# 5. PM2 Setup prüfen
echo ""
echo "4. Prüfe PM2 Setup..."
if pm2 list | grep -q "family-dashboard"; then
    echo "✓ PM2 ist bereits konfiguriert"
else
    echo "Konfiguriere PM2..."
    cd ~/family-dashboard
    pm2 start server.js --name family-dashboard
    pm2 save
    pm2 startup | tail -n 1 > /tmp/pm2_startup.sh
    echo ""
    echo "WICHTIG: Führe folgenden Befehl aus:"
    cat /tmp/pm2_startup.sh
    echo ""
fi

echo ""
echo "=== Setup abgeschlossen! ==="
echo ""
echo "Nächste Schritte:"
echo "1. Führe den PM2 startup Befehl aus (siehe oben)"
echo "2. Optional: Monitor im Hochformat einstellen"
echo "   sudo nano /boot/firmware/config.txt"
echo "   Füge hinzu: display_hdmi_rotate=1"
echo "3. Neustart: sudo reboot"
echo ""
echo "Nach dem Neustart:"
echo "- Server läuft automatisch"
echo "- Chromium öffnet sich im Kiosk-Modus"
echo "- Dashboard wird angezeigt"
