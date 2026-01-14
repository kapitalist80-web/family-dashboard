# 🏠 Family Dashboard für Raspberry Pi

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

Ein DakBoard-ähnliches Dashboard für deinen Raspberry Pi mit Hochkant-Monitor.

![Dashboard Preview](https://via.placeholder.com/800x400/1a1a2e/ffffff?text=Family+Dashboard)

> **Speziell für Basel-Stadt**: Integrierte Abfuhr-Erinnerungen mit der offiziellen Open Data API!

## Features

✅ **Kalender-Integration**
- Google Kalender (mehrere gleichzeitig)
- iCloud Kalender
- 2-Wochen-Ansicht mit Terminen
- Farbcodierung

✅ **Wetter-Anzeige**
- Aktuelles Wetter für Basel
- 5-Tages-Prognose
- Temperatur, Luftfeuchtigkeit, Wind

✅ **🆕 Abfuhr-Erinnerungen (Basel-Stadt)**
- Automatische Integration mit der Open Data API Basel-Stadt
- Erinnerungen am Tag vor der Abfuhr
- Übersicht der nächsten Termine
- Unterstützt alle Abfuhrtypen: Kehricht, Papier, Karton, Grüngut, Metall, Sperrgut
- Konfigurierbar nach Abfuhrzone (A-H)

✅ **ÖV-Abfahrten**
- Nächste Abfahrten von umliegenden Haltestellen
- Echtzeit-Verspätungsinformationen
- Swiss Public Transport API

✅ **News-Ticker**
- SRF News RSS-Feed
- Automatische Rotation

✅ **Hintergrundbilder**
- Automatischer Wechsel alle 2 Minuten
- Smooth Crossfade-Effekte

✅ **Web-Backend**
- Einstellungsseite zur Konfiguration
- Alle Einstellungen über Browser

## 🚀 Schnellstart

```bash
# Repository klonen
git clone https://github.com/DEIN-USERNAME/family-dashboard.git
cd family-dashboard

# Abhängigkeiten installieren
npm install

# Konfiguration erstellen
cp .env.example .env
nano .env  # API-Key eintragen

# Server starten
npm start
```

Öffne dann http://localhost:3000 im Browser.

---

## 📦 Installation auf Raspberry Pi

### 1. Voraussetzungen

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Node.js 18+ installieren
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git
```

### 2. Projekt einrichten

```bash
# Repository klonen
cd ~
git clone https://github.com/DEIN-USERNAME/family-dashboard.git
cd family-dashboard

# Abhängigkeiten installieren
npm install

# Konfiguration erstellen
cp .env.example .env
nano .env
```

### 3. Konfiguration

```bash
# .env Datei erstellen
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
pm2 startup  # Folge den Anweisungen
```

### 5. Kiosk-Modus einrichten (optional)

```bash
# Automatisches Setup-Script ausführen
chmod +x setup-kiosk.sh
./setup-kiosk.sh
```

Oder manuell: Füge in `~/.config/lxsession/LXDE-pi/autostart` hinzu:

```
@xset s off
@xset -dpms
@chromium-browser --kiosk --app=http://localhost:3000
```

### 6. Monitor drehen (Hochformat)

```bash
sudo nano /boot/firmware/config.txt
# Füge hinzu: display_hdmi_rotate=1
sudo reboot
```

---

## Abfuhr-Einstellungen (Basel-Stadt)

Das Dashboard integriert die offizielle Open Data API des Kantons Basel-Stadt für Abfuhrtermine.

### Konfiguration

1. Öffne die Einstellungen: `http://localhost:3000/settings`
2. Im Abschnitt "Abfuhr-Einstellungen":
   - Wähle deine **Abfuhrzone** (A-H)
   - Stelle ein, wie viele **Tage vorher** die Erinnerung erscheinen soll
   - Wähle die **Abfuhrtypen**, die angezeigt werden sollen

### Abfuhrzonen Basel-Stadt

| Zone | Quartiere |
|------|-----------|
| A | Altstadt Grossbasel, Vorstädte, Am Ring |
| B | Clara, Wettstein, Hirzbrunnen |
| C | Breite, St. Alban, Gundeldingen |
| D | Bruderholz, Bachletten |
| E | Gotthelf, Iselin, St. Johann |
| F | Matthäus, Klybeck, Kleinhüningen |
| G | Rosental, Erlenmatt |
| H | Riehen, Bettingen |

### Zone nachschlagen

Deine genaue Zone findest du unter: https://www.geo.bs.ch/abfuhrzonen

### Anzeige im Dashboard

- **Erinnerungs-Banner**: Erscheint am Tag vor der Abfuhr oben im Dashboard
- **Abfuhr-Panel**: Zeigt die nächsten Termine rechts oben

### API-Datenquelle

Die Daten stammen von der offiziellen Open Data Plattform:
https://data.bs.ch/explore/dataset/100096/

## Verwendung

- **Dashboard**: http://localhost:3000
- **Einstellungen**: http://localhost:3000/settings

## API-Endpunkte

### Abfuhr

| Endpunkt | Beschreibung |
|----------|--------------|
| `GET /api/abfuhr` | Nächste Abfuhrtermine und Erinnerungen |
| `POST /api/abfuhr/config` | Abfuhr-Einstellungen aktualisieren |
| `GET /api/abfuhr/zones` | Verfügbare Abfuhrzonen |
| `POST /api/abfuhr/refresh` | Cache aktualisieren |

### Weitere

| Endpunkt | Beschreibung |
|----------|--------------|
| `GET /api/weather` | Wetterdaten |
| `GET /api/calendars` | Kalendertermine |
| `GET /api/transport` | ÖV-Abfahrten |
| `GET /api/news` | News-Feed |
| `GET /api/config` | Konfiguration abrufen |
| `POST /api/config` | Konfiguration speichern |

## Fehlerbehebung

### Abfuhr-Daten werden nicht angezeigt

1. Prüfe die Netzwerkverbindung zum Internet
2. Stelle sicher, dass die API `data.bs.ch` erreichbar ist
3. Klicke auf "Cache aktualisieren" in den Einstellungen
4. Prüfe die Server-Logs: `pm2 logs family-dashboard`

### Falsche Zone

1. Gehe zu https://www.geo.bs.ch/abfuhrzonen
2. Gib deine Adresse ein
3. Notiere die angezeigte Zone
4. Ändere die Zone in den Dashboard-Einstellungen

## Technologie-Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript
- **Kalender**: node-ical (iCal/CalDAV Parser)
- **Wetter**: OpenWeatherMap API
- **Abfuhr**: Open Data Basel-Stadt API
- **ÖV**: Swiss Public Transport API

## Lizenz

MIT

## 📝 Changelog

### v1.1.0
- 🆕 Integration der Basel-Stadt Abfuhr-API
- 🆕 Erinnerungs-Banner für Abfuhrtage
- 🆕 Panel mit nächsten Abfuhrterminen
- 🆕 Konfigurierbare Abfuhrtypen und Zonen
- 🆕 Cache für API-Anfragen

### v1.0.0
- Initial Release
- Kalender-Integration (Google, iCloud)
- Wetter-Anzeige
- ÖV-Abfahrten
- News-Ticker

---

## 🙏 Credits & Datenquellen

- **Abfuhrdaten**: [Open Data Basel-Stadt](https://data.bs.ch/explore/dataset/100096/)
- **Wetter**: [OpenWeatherMap](https://openweathermap.org/)
- **ÖV-Daten**: [Swiss Public Transport API](https://transport.opendata.ch/)
- **News**: [SRF News RSS](https://www.srf.ch/)

---

## 🤝 Contributing

Beiträge sind willkommen! Bitte erstelle einen Pull Request oder öffne ein Issue.

---

## ⭐ Star History

Wenn dir dieses Projekt gefällt, gib ihm einen Stern! ⭐
