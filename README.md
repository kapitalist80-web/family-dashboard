# Familienkalender Dashboard für Raspberry Pi

Ein DakBoard-ähnliches Dashboard für deinen Raspberry Pi mit Hochkant-Monitor.

## Features

✅ **Kalender-Integration**
- Google Kalender (mehrere gleichzeitig)
- iCloud Kalender
- Monatsansicht mit Terminen
- Farbcodierung

✅ **Wetter-Anzeige**
- Aktuelles Wetter für Basel
- 5-Tages-Prognose
- Temperatur, Luftfeuchtigkeit, Wind

✅ **Hintergrundbilder**
- Automatischer Wechsel alle 2 Minuten
- Smooth Crossfade-Effekte

✅ **Web-Backend**
- Einstellungsseite zur Konfiguration
- Kalender hinzufügen/entfernen
- Wetter-Einstellungen
- Anzeige-Optionen

## Installation auf Raspberry Pi

### 1. Voraussetzungen

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Node.js installieren (falls noch nicht vorhanden)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Git installieren
sudo apt install -y git
```

### 2. Projekt einrichten

```bash
# Projekt-Verzeichnis erstellen
cd /home/pi
mkdir family-dashboard
cd family-dashboard

# Dateien kopieren (lade das Projekt herunter und kopiere alle Dateien)
# Oder klone das Repository wenn verfügbar

# Abhängigkeiten installieren
npm install
```

### 3. Konfiguration

```bash
# .env Datei erstellen
cp .env.example .env
nano .env
```

Trage folgende Informationen ein:

```env
# OpenWeatherMap API-Schlüssel (kostenlos unter https://openweathermap.org/api)
WEATHER_API_KEY=dein_api_schlüssel

# Rest kann so bleiben für Basel
WEATHER_CITY=Basel
WEATHER_COUNTRY=CH
WEATHER_LAT=47.5596
WEATHER_LON=7.5886
```

### 4. Server starten

```bash
# Manuell starten
npm start

# Als Hintergrunddienst (mit PM2)
sudo npm install -g pm2
pm2 start server.js --name family-dashboard
pm2 save
pm2 startup
```

### 5. Autostart beim Booten

```bash
# Chromium im Kiosk-Modus automatisch starten
nano ~/.config/lxsession/LXDE-pi/autostart
```

Füge hinzu:

```
@chromium-browser --kiosk --app=http://localhost:3000 --start-fullscreen --display=:0
@xset s off
@xset -dpms
@xset s noblank
```

### 6. Monitor hochkant einstellen

```bash
# Für DSI/HDMI-Monitor
sudo nano /boot/config.txt
```

Füge hinzu:

```
# Display drehen (90° nach rechts)
display_rotate=1

# Oder für neuere Raspberry Pi:
display_hdmi_rotate=1
```

Neustart: `sudo reboot`

## Kalender einrichten

### Google Kalender

1. Öffne [Google Calendar](https://calendar.google.com)
2. Klicke auf die drei Punkte neben dem Kalender → "Einstellungen und Freigabe"
3. Scrolle zu "Kalenderadresse"
4. Kopiere die "Geheime Adresse im iCal-Format"
5. Füge sie im Dashboard unter http://localhost:3000/settings ein

### iCloud Kalender

1. Gehe zu [iCloud.com/calendar](https://www.icloud.com/calendar)
2. Klicke auf das Teilen-Symbol neben dem Kalender
3. Aktiviere "Öffentlicher Kalender"
4. Kopiere die Webcal-URL
5. Ändere `webcal://` zu `https://`
6. Füge die URL im Dashboard ein

## Verwendung

- **Dashboard**: http://localhost:3000
- **Einstellungen**: http://localhost:3000/settings

## Fehlerbehebung

### Wetter wird nicht angezeigt
- Prüfe ob der OpenWeatherMap API-Schlüssel korrekt ist
- Es kann bis zu 2 Stunden dauern bis ein neuer API-Schlüssel aktiv ist

### Kalender zeigt keine Termine
- Prüfe ob die iCal-URLs korrekt sind
- Google: URL muss mit `https://calendar.google.com/calendar/ical/` beginnen
- iCloud: URL muss mit `https://` (nicht `webcal://`) beginnen

### Bildschirm schaltet sich aus
```bash
# Screensaver deaktivieren
sudo nano /etc/lightdm/lightdm.conf

# Unter [Seat:*] hinzufügen:
xserver-command=X -s 0 -dpms
```

### Server startet nicht automatisch
```bash
# PM2 Logs prüfen
pm2 logs family-dashboard

# PM2 Status
pm2 status
```

## Verbesserungen & Erweiterungen

Mögliche zukünftige Features:

- [ ] iCloud Shared Album Integration
- [ ] Lokale Bildordner
- [ ] Google Fotos Integration
- [ ] News-Feed
- [ ] ÖPNV-Verbindungen
- [ ] Geburtstagserinnerungen
- [ ] Einkaufsliste
- [ ] Persistente Konfiguration (JSON/SQLite)
- [ ] Multi-User-Support

## Technologie-Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript
- **Kalender**: node-ical (iCal/CalDAV Parser)
- **Wetter**: OpenWeatherMap API

## Lizenz

MIT

## Credits

Inspiriert von DakBoard - erstellt für persönliche Nutzung auf Raspberry Pi.
