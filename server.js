const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Konfiguration aus Datei laden oder Standard verwenden
let config = {
  weather: {
    apiKey: process.env.WEATHER_API_KEY || '',
    city: process.env.WEATHER_CITY || 'Basel',
    country: process.env.WEATHER_COUNTRY || 'CH',
    lat: process.env.WEATHER_LAT || 47.5596,
    lon: process.env.WEATHER_LON || 7.5886
  },
  calendars: {
    google: [],
    icloud: []
  },
  images: {
    changeInterval: parseInt(process.env.IMAGE_CHANGE_INTERVAL) || 120000,
    sources: []
  },
  transport: {
    enabled: true,
    // Koordinaten Rotbergerstrasse 16, Basel
    lat: 47.5417,
    lon: 7.6028,
    stations: [], // Wird automatisch gefüllt oder manuell konfiguriert
    limit: 5 // Anzahl Abfahrten pro Haltestelle
  },
  // NEU: Abfuhr-Konfiguration für Basel-Stadt
  abfuhr: {
    enabled: true,
    zone: 'A', // Abfuhrzone A-H (kann in Settings geändert werden)
    reminderDaysBefore: 1, // Erinnerung X Tage vor Abfuhr
    showTypes: ['Kehricht', 'Papier', 'Karton', 'Grüngut', 'Metall', 'Sperrgut'] // Welche Abfuhrtypen angezeigt werden
  },
  // NEU: Stundenplan-Konfiguration
  schedule: {
    enabled: true,
    children: []
    // Beispiel-Kind:
    // {
    //   id: '1234567890',
    //   name: 'Max',
    //   color: '#4ade80',
    //   timetable: {
    //     monday:    { morningStart: '08:00', morningSubjects: ['Mathe','Deutsch','NMG'], lunchStart: '12:00', afternoonStart: '13:30', afternoonSubjects: ['Sport','Musik'] },
    //     tuesday:   { morningStart: '08:00', morningSubjects: ['Franz','Mathe','BG'], lunchStart: '11:50' },
    //     ...
    //   }
    // }
  },
  display: {
    locale: process.env.LOCALE || 'de-CH',
    timezone: process.env.TIMEZONE || 'Europe/Zurich'
  }
};

// Konfiguration laden
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      const savedConfig = JSON.parse(data);
      config = { ...config, ...savedConfig };
      // Stelle sicher, dass abfuhr-Konfiguration existiert (für Updates von älteren Versionen)
      if (!config.abfuhr) {
        config.abfuhr = {
          enabled: true,
          zone: 'A',
          reminderDaysBefore: 1,
          showTypes: ['Kehricht', 'Papier', 'Karton', 'Grüngut', 'Metall', 'Sperrgut']
        };
      }
      // Stelle sicher, dass schedule-Konfiguration existiert
      if (!config.schedule) {
        config.schedule = { enabled: true, children: [] };
      }
      console.log('Konfiguration geladen aus config.json');
    }
  } catch (error) {
    console.error('Fehler beim Laden der Konfiguration:', error);
  }
}

// Konfiguration speichern
function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('Konfiguration gespeichert in config.json');
  } catch (error) {
    console.error('Fehler beim Speichern der Konfiguration:', error);
  }
}

// Beim Start laden
loadConfig();

// API Routes

// Wetter-Daten abrufen
app.get('/api/weather', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const { lat, lon, apiKey } = config.weather;
    
    if (!apiKey) {
      return res.json({ error: 'API-Schlüssel nicht konfiguriert' });
    }

    // Aktuelles Wetter
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=de`;
    const currentResponse = await fetch(currentUrl);
    const currentData = await currentResponse.json();

    // 5-Tages-Prognose
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=de`;
    const forecastResponse = await fetch(forecastUrl);
    const forecastData = await forecastResponse.json();

    res.json({
      current: {
        temp: Math.round(currentData.main.temp),
        feels_like: Math.round(currentData.main.feels_like),
        humidity: currentData.main.humidity,
        description: currentData.weather[0].description,
        icon: currentData.weather[0].icon,
        wind: currentData.wind.speed
      },
      forecast: forecastData.list
        .filter((item, index) => index % 8 === 0) // Jeden Tag um 12:00
        .slice(0, 5)
        .map(item => ({
          date: new Date(item.dt * 1000),
          temp: Math.round(item.main.temp),
          temp_min: Math.round(item.main.temp_min),
          temp_max: Math.round(item.main.temp_max),
          icon: item.weather[0].icon,
          description: item.weather[0].description,
          rain: item.rain ? item.rain['3h'] : 0
        }))
    });
  } catch (error) {
    console.error('Wetter-Fehler:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Wetterdaten' });
  }
});

// Kalender-Daten abrufen
app.get('/api/calendars', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const ical = require('node-ical');
    const RRule = require('rrule').RRule;
    const events = [];

    // Zeitraum für die Abfrage: 1 Woche zurück bis 2 Monate voraus
    const rangeStart = new Date();
    rangeStart.setDate(rangeStart.getDate() - 7);
    rangeStart.setHours(0, 0, 0, 0);
    
    const rangeEnd = new Date();
    rangeEnd.setMonth(rangeEnd.getMonth() + 2);
    rangeEnd.setHours(23, 59, 59, 999);

    // Hilfsfunktion: webcal zu https konvertieren
    const normalizeUrl = (url) => {
      return url.replace(/^webcal:\/\//i, 'https://');
    };

    // Hilfsfunktion: Event für einen bestimmten Tag erstellen
    const createEventInstance = (event, instanceStart, instanceEnd, calendar, color) => {
      const isAllDay = event.start && event.start.dateOnly === true;
      return {
        id: `${event.uid}_${instanceStart.getTime()}`,
        title: event.summary,
        start: instanceStart,
        end: instanceEnd,
        allDay: isAllDay,
        calendar: calendar.name,
        color: color
      };
    };

    // Hilfsfunktion: Mehrtägige Events in einzelne Tage aufteilen
    const expandMultiDayEvent = (event, calendar, color) => {
      const expandedEvents = [];
      const start = new Date(event.start);
      const end = new Date(event.end);
      const isAllDay = event.start && event.start.dateOnly === true;
      
      // Bei ganztägigen Events: Ende ist exklusiv (00:00 des Folgetages)
      // Korrigiere das Ende für die Berechnung
      const effectiveEnd = new Date(end);
      if (isAllDay) {
        effectiveEnd.setDate(effectiveEnd.getDate() - 1);
      }
      
      // Berechne Anzahl der Tage
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());
      const daysDiff = Math.floor((endDay - startDay) / (1000 * 60 * 60 * 24));
      
      if (daysDiff <= 0) {
        // Eintägiges Event
        expandedEvents.push(createEventInstance(event, start, end, calendar, color));
      } else {
        // Mehrtägiges Event: Für jeden Tag einen Eintrag erstellen
        for (let i = 0; i <= daysDiff; i++) {
          const dayStart = new Date(startDay);
          dayStart.setDate(startDay.getDate() + i);
          
          let instanceStart, instanceEnd;
          
          if (isAllDay) {
            instanceStart = new Date(dayStart);
            instanceEnd = new Date(dayStart);
            instanceEnd.setDate(instanceEnd.getDate() + 1);
          } else {
            if (i === 0) {
              // Erster Tag: Original-Startzeit
              instanceStart = new Date(start);
            } else {
              instanceStart = new Date(dayStart);
              instanceStart.setHours(0, 0, 0, 0);
            }
            
            if (i === daysDiff) {
              // Letzter Tag: Original-Endzeit
              instanceEnd = new Date(end);
            } else {
              instanceEnd = new Date(dayStart);
              instanceEnd.setHours(23, 59, 59, 999);
            }
          }
          
          // Nur Events im gewünschten Zeitraum hinzufügen
          if (instanceStart >= rangeStart && instanceStart <= rangeEnd) {
            const instance = createEventInstance(event, instanceStart, instanceEnd, calendar, color);
            instance.multiDay = true;
            instance.dayIndex = i + 1;
            instance.totalDays = daysDiff + 1;
            expandedEvents.push(instance);
          }
        }
      }
      
      return expandedEvents;
    };

    // Hilfsfunktion: Wiederkehrende Events expandieren
    const expandRecurringEvent = (event, calendar, color) => {
      const expandedEvents = [];
      
      if (!event.rrule) {
        return expandMultiDayEvent(event, calendar, color);
      }
      
      try {
        // RRule aus dem Event extrahieren
        let rrule;
        if (typeof event.rrule === 'string') {
          rrule = RRule.fromString(event.rrule);
        } else if (event.rrule.options) {
          // node-ical liefert manchmal ein RRule-Objekt
          rrule = new RRule(event.rrule.options);
        } else if (event.rrule.origOptions) {
          rrule = new RRule(event.rrule.origOptions);
        } else {
          // Falls rrule ein fertiges RRule-Objekt ist
          rrule = event.rrule;
        }
        
        // Alle Instanzen im Zeitraum berechnen
        const instances = rrule.between(rangeStart, rangeEnd, true);
        
        // Event-Dauer berechnen
        const originalStart = new Date(event.start);
        const originalEnd = new Date(event.end);
        const duration = originalEnd - originalStart;
        
        for (const instanceDate of instances) {
          const instanceStart = new Date(instanceDate);
          const instanceEnd = new Date(instanceStart.getTime() + duration);
          
          // Prüfe ob diese Instanz durch eine Exception überschrieben wird
          if (event.exdate) {
            const exdates = Array.isArray(event.exdate) ? event.exdate : [event.exdate];
            const isExcluded = exdates.some(exdate => {
              const exDate = new Date(exdate);
              return exDate.toDateString() === instanceStart.toDateString();
            });
            if (isExcluded) continue;
          }
          
          // Für mehrtägige wiederkehrende Events
          const tempEvent = { ...event, start: instanceStart, end: instanceEnd };
          const dayExpanded = expandMultiDayEvent(tempEvent, calendar, color);
          expandedEvents.push(...dayExpanded);
        }
      } catch (err) {
        console.error(`Fehler beim Expandieren von RRULE für "${event.summary}":`, err.message);
        // Fallback: Event als einzelnes Event behandeln
        return expandMultiDayEvent(event, calendar, color);
      }
      
      return expandedEvents;
    };

    // Kalender verarbeiten (für beide Typen)
    const processCalendar = async (calendar, defaultColor) => {
      if (!calendar.enabled || !calendar.url) return;
      
      try {
        const normalizedUrl = normalizeUrl(calendar.url);
        const data = await ical.async.fromURL(normalizedUrl);
        
        for (const k in data) {
          const event = data[k];
          if (event.type === 'VEVENT') {
            const color = calendar.color || defaultColor;
            const expandedEvents = expandRecurringEvent(event, calendar, color);
            events.push(...expandedEvents);
          }
        }
      } catch (err) {
        console.error(`Fehler bei Kalender ${calendar.name}:`, err.message);
      }
    };

    // Google Kalender abrufen
    for (const calendar of config.calendars.google) {
      await processCalendar(calendar, '#4285f4');
    }

    // iCloud Kalender abrufen
    for (const calendar of config.calendars.icloud) {
      await processCalendar(calendar, '#ff2d55');
    }

    // Events nach Startdatum sortieren
    events.sort((a, b) => new Date(a.start) - new Date(b.start));

    res.json(events);
  } catch (error) {
    console.error('Kalender-Fehler:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Kalender' });
  }
});

// ============================================
// NEU: Abfuhrtermine Basel-Stadt API
// ============================================

// Cache für Abfuhrtermine (wird einmal täglich aktualisiert)
let abfuhrCache = {
  data: [],
  zone: '',
  lastUpdate: 0,
  cacheTime: 6 * 60 * 60 * 1000 // 6 Stunden Cache
};

// Abfuhrtermine von Basel Open Data API abrufen
app.get('/api/abfuhr', async (req, res) => {
  try {
    if (!config.abfuhr || !config.abfuhr.enabled) {
      return res.json({ enabled: false, reminders: [], upcoming: [] });
    }

    const fetch = (await import('node-fetch')).default;
    const zone = config.abfuhr.zone || 'A';
    const reminderDays = config.abfuhr.reminderDaysBefore || 1;
    const showTypes = config.abfuhr.showTypes || ['Kehricht', 'Papier', 'Karton', 'Grüngut', 'Metall', 'Sperrgut'];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Prüfe Cache (auch Zone prüfen - bei Zonenwechsel neu laden)
    let abfuhrData = [];
    const cacheValid = abfuhrCache.data.length > 0 && 
                       abfuhrCache.zone === zone &&
                       (Date.now() - abfuhrCache.lastUpdate) < abfuhrCache.cacheTime;
    
    if (cacheValid) {
      abfuhrData = abfuhrCache.data;
      console.log('Verwende gecachte Abfuhrdaten für Zone', zone);
    } else {
      // Lade Daten von Basel Open Data API
      // API Dokumentation: https://data.bs.ch/explore/dataset/100096/
      // Format: refine=zone:"GUF"&refine=termin:"2026"
      const currentYear = now.getFullYear();
      
      // API URL mit Zone und Jahr Filter
      // Ohne select Parameter um alle Felder zu bekommen (termin, art, zone, gebiet)
      const apiUrl = `https://data.bs.ch/api/explore/v2.1/catalog/datasets/100096/records?limit=100&refine=zone%3A%22${zone}%22&refine=termin%3A%22${currentYear}%22&order_by=termin`;
      
      try {
        console.log('Lade Abfuhrdaten von API:', apiUrl);
        const response = await fetch(apiUrl, {
          timeout: 15000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'FamilyDashboard/1.1'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('API Antwort erhalten, total_count:', data.total_count);
          
          if (data.results && data.results.length > 0) {
            // Debug: Zeige erstes Ergebnis
            console.log('Erstes Ergebnis:', JSON.stringify(data.results[0]));
            
            abfuhrData = data.results.map(record => ({
              // Feldnamen aus der API: termin, art, zone, gebiet
              date: record.termin,
              type: record.art || 'Unbekannt',
              zone: record.zone,
              area: record.gebiet || ''
            }));
            
            // Cache aktualisieren
            abfuhrCache.data = abfuhrData;
            abfuhrCache.zone = zone;
            abfuhrCache.lastUpdate = Date.now();
            console.log(`${abfuhrData.length} Abfuhrtermine geladen für Zone ${zone}`);
          } else {
            console.log('Keine Ergebnisse in API-Antwort');
          }
        } else {
          const errorText = await response.text();
          console.error('API-Fehler:', response.status, response.statusText, errorText);
        }
      } catch (apiError) {
        console.error('Fehler beim Abrufen der Abfuhr-API:', apiError.message);
        // Fallback: Verwende gecachte Daten falls vorhanden
        if (abfuhrCache.data.length > 0) {
          abfuhrData = abfuhrCache.data;
          console.log('Verwende alte gecachte Daten nach API-Fehler');
        }
      }
    }

    // Filtere nach angezeigten Typen und zukünftigen/heutigen Terminen
    const filteredData = abfuhrData.filter(item => {
      if (!item.date || !item.type) return false;
      
      const itemDate = new Date(item.date);
      const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      
      // Heute und zukünftige Termine
      const isCurrentOrFuture = itemDateOnly >= today;
      
      // Typ-Filter: Prüfe ob einer der showTypes im art-Feld enthalten ist
      // API liefert z.B. "Papierabfuhr", "Kehrichtabfuhr", etc.
      const typeMatches = showTypes.some(type => 
        item.type.toLowerCase().includes(type.toLowerCase())
      );
      
      return isCurrentOrFuture && typeMatches;
    });

    // Sortiere nach Datum
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Finde Erinnerungen (Abfuhren in X Tagen)
    const reminderDate = new Date(today);
    reminderDate.setDate(reminderDate.getDate() + reminderDays);
    
    const reminders = filteredData.filter(item => {
      const itemDate = new Date(item.date);
      const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      return itemDateOnly.getTime() === reminderDate.getTime();
    });

    // Finde auch heutige Abfuhren (für "Heute ist Abfuhrtag")
    const todayItems = filteredData.filter(item => {
      const itemDate = new Date(item.date);
      const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      return itemDateOnly.getTime() === today.getTime();
    });

    // Nächste 3 Abfuhren
    const upcoming = filteredData.slice(0, 3).map(item => {
      const itemDate = new Date(item.date);
      const itemDateOnly = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate());
      const daysUntil = Math.round((itemDateOnly - today) / (1000 * 60 * 60 * 24));
      
      return {
        ...item,
        dateFormatted: itemDate.toLocaleDateString('de-CH', {
          weekday: 'short',
          day: 'numeric',
          month: 'short'
        }),
        daysUntil: daysUntil
      };
    });

    res.json({
      enabled: true,
      zone: zone,
      reminders: reminders.map(item => ({
        ...item,
        dateFormatted: new Date(item.date).toLocaleDateString('de-CH', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        })
      })),
      todayItems: todayItems.map(item => ({
        ...item,
        dateFormatted: 'Heute'
      })),
      upcoming: upcoming,
      totalLoaded: abfuhrData.length,
      lastUpdate: abfuhrCache.lastUpdate ? new Date(abfuhrCache.lastUpdate).toISOString() : null
    });

  } catch (error) {
    console.error('Abfuhr-Fehler:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Abfuhrtermine' });
  }
});

// Abfuhr-Konfiguration aktualisieren
app.post('/api/abfuhr/config', (req, res) => {
  const { enabled, zone, reminderDaysBefore, showTypes } = req.body;
  
  if (!config.abfuhr) {
    config.abfuhr = {};
  }
  
  if (typeof enabled !== 'undefined') config.abfuhr.enabled = enabled;
  if (zone) {
    config.abfuhr.zone = zone.toUpperCase();
    // Cache invalidieren bei Zonenwechsel
    abfuhrCache.lastUpdate = 0;
  }
  if (typeof reminderDaysBefore !== 'undefined') config.abfuhr.reminderDaysBefore = parseInt(reminderDaysBefore);
  if (showTypes) config.abfuhr.showTypes = showTypes;
  
  saveConfig();
  res.json({ success: true, abfuhr: config.abfuhr });
});

// Verfügbare Abfuhrzonen abrufen
app.get('/api/abfuhr/zones', (req, res) => {
  // Basel-Stadt Abfuhrzonen (IDs wie in der API verwendet)
  const zones = [
    { id: 'A', name: 'Zone A', description: 'Altstadt Grossbasel, Vorstädte, Am Ring' },
    { id: 'B', name: 'Zone B', description: 'Clara, Wettstein, Hirzbrunnen' },
    { id: 'C', name: 'Zone C', description: 'Breite, St. Alban, Gundeldingen' },
    { id: 'D', name: 'Zone D', description: 'Bruderholz, Bachletten' },
    { id: 'E', name: 'Zone E', description: 'Gotthelf, Iselin, St. Johann' },
    { id: 'F', name: 'Zone F', description: 'Matthäus, Klybeck, Kleinhüningen' },
    { id: 'G', name: 'Zone G', description: 'Rosental, Erlenmatt' },
    { id: 'GUF', name: 'Zone GUF', description: 'Rosental Unterflur' },
    { id: 'H', name: 'Zone H', description: 'Riehen, Bettingen' }
  ];
  res.json(zones);
});

// Cache manuell leeren
app.post('/api/abfuhr/refresh', (req, res) => {
  abfuhrCache.lastUpdate = 0;
  abfuhrCache.data = [];
  abfuhrCache.zone = '';
  console.log('Abfuhr-Cache manuell geleert');
  res.json({ success: true, message: 'Cache geleert' });
});

// ============================================
// Ende Abfuhr-API
// ============================================

// ============================================
// NEU: Stundenplan-API
// ============================================

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_NAMES_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

// Stundenplan für heute abrufen
app.get('/api/schedule', (req, res) => {
  try {
    if (!config.schedule || !config.schedule.enabled) {
      return res.json({ enabled: false, children: [] });
    }

    const now = new Date();
    const dayIndex = now.getDay(); // 0=Sonntag, 1=Montag, ...
    const dayKey = WEEKDAY_KEYS[dayIndex];
    const dayName = WEEKDAY_NAMES_DE[dayIndex];

    // Am Wochenende: Zeige Montag
    const isWeekend = dayIndex === 0 || dayIndex === 6;
    const displayDayKey = isWeekend ? 'monday' : dayKey;
    const displayDayName = isWeekend ? 'Montag' : dayName;

    const children = (config.schedule.children || []).map(child => {
      const daySchedule = child.timetable ? child.timetable[displayDayKey] : null;
      return {
        id: child.id,
        name: child.name,
        color: child.color || '#4ade80',
        schedule: daySchedule || null
      };
    });

    res.json({
      enabled: true,
      dayName: displayDayName,
      dayKey: displayDayKey,
      isWeekend: isWeekend,
      children: children
    });
  } catch (error) {
    console.error('Stundenplan-Fehler:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen des Stundenplans' });
  }
});

// Stundenplan-Konfiguration aktualisieren (ein/aus)
app.post('/api/schedule/config', (req, res) => {
  const { enabled } = req.body;
  if (!config.schedule) {
    config.schedule = { enabled: true, children: [] };
  }
  if (typeof enabled !== 'undefined') config.schedule.enabled = enabled;
  saveConfig();
  res.json({ success: true, schedule: config.schedule });
});

// Kind hinzufügen
app.post('/api/schedule/child/add', (req, res) => {
  const { name, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });

  if (!config.schedule) config.schedule = { enabled: true, children: [] };

  const child = {
    id: Date.now().toString(),
    name,
    color: color || '#4ade80',
    timetable: {}
  };
  config.schedule.children.push(child);
  saveConfig();
  res.json({ success: true, child });
});

// Kind löschen
app.delete('/api/schedule/child/:id', (req, res) => {
  const { id } = req.params;
  if (!config.schedule) return res.json({ success: true });
  config.schedule.children = config.schedule.children.filter(c => c.id !== id);
  saveConfig();
  res.json({ success: true });
});

// Stundenplan eines Kindes aktualisieren
app.put('/api/schedule/child/:id', (req, res) => {
  const { id } = req.params;
  const { name, color, timetable } = req.body;

  if (!config.schedule) return res.status(404).json({ error: 'Keine Schedule-Konfiguration' });
  const child = config.schedule.children.find(c => c.id === id);
  if (!child) return res.status(404).json({ error: 'Kind nicht gefunden' });

  if (name) child.name = name;
  if (color) child.color = color;
  if (timetable) child.timetable = timetable;

  saveConfig();
  res.json({ success: true, child });
});

// ============================================
// Ende Stundenplan-API
// ============================================

// Konfiguration abrufen
app.get('/api/config', (req, res) => {
  res.json(config);
});

// Konfiguration aktualisieren
app.post('/api/config', (req, res) => {
  config = { ...config, ...req.body };
  saveConfig();
  res.json({ success: true, config });
});

// Kalender hinzufügen
app.post('/api/calendars/add', (req, res) => {
  const { type, name, url, color } = req.body;
  const calendar = {
    id: Date.now().toString(),
    name,
    url,
    color,
    enabled: true
  };

  if (type === 'google') {
    config.calendars.google.push(calendar);
  } else if (type === 'icloud') {
    config.calendars.icloud.push(calendar);
  }

  saveConfig();
  res.json({ success: true, calendar });
});

// Kalender löschen
app.delete('/api/calendars/:type/:id', (req, res) => {
  const { type, id } = req.params;
  
  if (type === 'google') {
    config.calendars.google = config.calendars.google.filter(c => c.id !== id);
  } else if (type === 'icloud') {
    config.calendars.icloud = config.calendars.icloud.filter(c => c.id !== id);
  }

  saveConfig();
  res.json({ success: true });
});

// Bildquellen
let imagesCache = [];
let lastImageCheck = 0;
const IMAGE_CACHE_TIME = 5 * 60 * 1000; // 5 Minuten Cache

app.get('/api/images', async (req, res) => {
  try {
    // Prüfe ob Cache noch gültig
    const now = Date.now();
    if (imagesCache.length > 0 && (now - lastImageCheck) < IMAGE_CACHE_TIME) {
      return res.json(imagesCache);
    }

    const images = [];
    
    // iCloud Shared Album URLs
    for (const source of config.images.sources) {
      if (source.enabled) {
        if (source.type === 'icloud_shared') {
          // Extrahiere Token aus iCloud URL
          const match = source.url.match(/#([A-Za-z0-9]+)/);
          if (match) {
            const token = match[1];
            console.log('Lade iCloud Album, Token:', token);
            
            try {
              const fetch = (await import('node-fetch')).default;
              
              // Lade die öffentliche Webseite
              const webUrl = `https://www.icloud.com/sharedalbum/#${token}`;
              console.log('Lade Webseite:', webUrl);
              
              const response = await fetch(webUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
              });
              
              if (response.ok) {
                const html = await response.text();
                
                // Suche nach Foto-URLs im HTML
                // iCloud bettet die Foto-Daten im Script-Tag ein
                const scriptMatch = html.match(/window\.photos\s*=\s*(\[[\s\S]*?\]);/);
                if (scriptMatch) {
                  try {
                    const photosData = JSON.parse(scriptMatch[1]);
                    photosData.forEach(photo => {
                      if (photo.derivatives && photo.derivatives.length > 0) {
                        // Höchste Auflösung wählen
                        const derivative = photo.derivatives[photo.derivatives.length - 1];
                        images.push({
                          url: derivative.url,
                          source: source.name || 'iCloud Album'
                        });
                      }
                    });
                    console.log(`${images.length} Fotos aus iCloud Album extrahiert`);
                  } catch (parseErr) {
                    console.error('Fehler beim Parsen der Foto-Daten:', parseErr.message);
                  }
                }
                
                // Alternative: Suche direkt nach Bild-URLs
                if (images.length === 0) {
                  const urlMatches = html.match(/https:\/\/cvws\.icloud-content\.com\/[^"'\s]+/g);
                  if (urlMatches) {
                    // Entferne Duplikate
                    const uniqueUrls = [...new Set(urlMatches)];
                    uniqueUrls.forEach(url => {
                      images.push({
                        url: url,
                        source: source.name || 'iCloud Album'
                      });
                    });
                    console.log(`${images.length} Foto-URLs aus HTML extrahiert`);
                  }
                }
              }
            } catch (err) {
              console.error('Fehler beim Laden des iCloud Albums:', err.message);
            }
          }
        } else if (source.type === 'url') {
          images.push({
            url: source.url,
            source: source.name || 'Bild'
          });
        } else if (source.type === 'local_folder') {
          // Lokaler Ordner auf dem Pi
          if (source.path) {
            try {
              const fs = require('fs');
              const path = require('path');
              const fullPath = path.resolve(source.path);
              
              if (fs.existsSync(fullPath)) {
                const files = fs.readdirSync(fullPath);
                files.forEach(file => {
                  const ext = path.extname(file).toLowerCase();
                  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                    images.push({
                      url: `/local-images/${path.basename(file)}`,
                      source: source.name || 'Lokal'
                    });
                  }
                });
              }
            } catch (err) {
              console.error('Fehler beim Laden lokaler Bilder:', err.message);
            }
          }
        }
      }
    }
    
    // Falls keine Bilder, verwende Beispielbilder
    if (images.length === 0) {
      console.log('Keine Bilder gefunden, verwende Beispielbilder');
      images.push(
        { url: 'https://picsum.photos/1080/1920?random=1', source: 'Beispiel' },
        { url: 'https://picsum.photos/1080/1920?random=2', source: 'Beispiel' },
        { url: 'https://picsum.photos/1080/1920?random=3', source: 'Beispiel' }
      );
    }
    
    // Cache aktualisieren
    imagesCache = images;
    lastImageCheck = now;
    
    console.log(`Sende ${images.length} Bilder zurück`);
    res.json(images);
  } catch (error) {
    console.error('Fehler beim Laden der Bilder:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Bilder' });
  }
});

app.post('/api/images/add', (req, res) => {
  const { url, type, name, path } = req.body;
  const source = {
    id: Date.now().toString(),
    url,
    path,
    type,
    name: name || 'Bildquelle',
    enabled: true
  };
  config.images.sources.push(source);
  saveConfig();
  res.json({ success: true, source });
});

app.delete('/api/images/:id', (req, res) => {
  const { id } = req.params;
  config.images.sources = config.images.sources.filter(s => s.id !== id);
  saveConfig();
  res.json({ success: true });
});

// Serve lokale Bilder
app.get('/local-images/:filename', (req, res) => {
  const filename = req.params.filename;
  // Finde den konfigurierten Pfad
  const localSource = config.images.sources.find(s => s.type === 'local_folder');
  if (localSource && localSource.path) {
    const filePath = path.join(localSource.path, filename);
    res.sendFile(filePath);
  } else {
    res.status(404).send('Bildquelle nicht konfiguriert');
  }
});

// News von RSS Feed
app.get('/api/news', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://www.srf.ch/news/bnf/rss/19032223');
    const xml = await response.text();
    
    // Parse RSS Feed (einfaches XML-Parsing)
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const titleRegex = /<title><!\[CDATA\[(.*?)\]\]><\/title>/;
    const linkRegex = /<link>(.*?)<\/link>/;
    
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const titleMatch = titleRegex.exec(itemXml);
      const linkMatch = linkRegex.exec(itemXml);
      
      if (titleMatch) {
        items.push({
          title: titleMatch[1],
          link: linkMatch ? linkMatch[1] : ''
        });
      }
    }
    
    // Limitiere auf 20 neueste News
    res.json(items.slice(0, 20));
  } catch (error) {
    console.error('Fehler beim Laden der News:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der News' });
  }
});

// ÖV-Abfahrten (Swiss Public Transport API)
app.get('/api/transport', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const TRANSPORT_API = 'https://transport.opendata.ch/v1';
    
    if (!config.transport || !config.transport.enabled) {
      return res.json({ enabled: false, stations: [] });
    }

    let stations = config.transport.stations || [];
    
    // Falls keine Haltestellen konfiguriert, suche die nächsten basierend auf Koordinaten
    if (stations.length === 0 && config.transport.lat && config.transport.lon) {
      try {
        const locationUrl = `${TRANSPORT_API}/locations?x=${config.transport.lat}&y=${config.transport.lon}&type=station`;
        const locationResponse = await fetch(locationUrl);
        const locationData = await locationResponse.json();
        
        if (locationData.stations && locationData.stations.length > 0) {
          // Nehme die nächsten 3 Haltestellen
          stations = locationData.stations.slice(0, 3).map(s => ({
            id: s.id,
            name: s.name,
            distance: s.distance
          }));
          
          // Speichere die gefundenen Haltestellen in der Konfiguration
          config.transport.stations = stations;
          saveConfig();
          console.log('Gefundene Haltestellen:', stations.map(s => s.name).join(', '));
        }
      } catch (err) {
        console.error('Fehler beim Suchen der Haltestellen:', err.message);
      }
    }

    // Falls immer noch keine Haltestellen, verwende Standard für Rotbergerstrasse Basel
    if (stations.length === 0) {
      stations = [
        { id: '8500096', name: 'Basel, Kannenfeldplatz' },
        { id: '8500097', name: 'Basel, Schützenhaus' }
      ];
    }

    const limit = config.transport.limit || 5;
    const result = [];

    // Für jede Haltestelle die Abfahrten abrufen
    for (const station of stations) {
      try {
        const stationParam = station.id ? `id=${station.id}` : `station=${encodeURIComponent(station.name)}`;
        const boardUrl = `${TRANSPORT_API}/stationboard?${stationParam}&limit=${limit}`;
        const boardResponse = await fetch(boardUrl);
        const boardData = await boardResponse.json();

        if (boardData.stationboard && boardData.stationboard.length > 0) {
          const departures = boardData.stationboard.map(journey => {
            const departure = new Date(journey.stop.departure);
            const prognosis = journey.stop.prognosis;
            let delay = null;
            let actualDeparture = departure;
            
            if (prognosis && prognosis.departure) {
              actualDeparture = new Date(prognosis.departure);
              delay = Math.round((actualDeparture - departure) / 60000); // Verspätung in Minuten
            }

            return {
              line: journey.category + ' ' + journey.number,
              category: journey.category,
              number: journey.number,
              destination: journey.to,
              departure: departure.toISOString(),
              departureTime: departure.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }),
              actualDeparture: actualDeparture.toISOString(),
              actualTime: actualDeparture.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }),
              delay: delay,
              platform: journey.stop.platform || '',
              operator: journey.operator
            };
          });

          result.push({
            station: {
              id: boardData.station?.id || station.id,
              name: boardData.station?.name || station.name,
              distance: station.distance
            },
            departures: departures
          });
        }
      } catch (err) {
        console.error(`Fehler beim Abrufen der Abfahrten für ${station.name}:`, err.message);
      }
    }

    res.json({
      enabled: true,
      stations: result,
      lastUpdate: new Date().toISOString()
    });

  } catch (error) {
    console.error('Transport-Fehler:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der ÖV-Daten' });
  }
});

// Transport-Konfiguration aktualisieren
app.post('/api/transport/config', (req, res) => {
  const { enabled, lat, lon, stations, limit } = req.body;
  
  if (!config.transport) {
    config.transport = {};
  }
  
  if (typeof enabled !== 'undefined') config.transport.enabled = enabled;
  if (lat) config.transport.lat = lat;
  if (lon) config.transport.lon = lon;
  if (stations) config.transport.stations = stations;
  if (limit) config.transport.limit = limit;
  
  saveConfig();
  res.json({ success: true, transport: config.transport });
});

// Haltestellen suchen
app.get('/api/transport/search', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const { query, lat, lon } = req.query;
    
    let url;
    if (query) {
      url = `https://transport.opendata.ch/v1/locations?query=${encodeURIComponent(query)}&type=station`;
    } else if (lat && lon) {
      url = `https://transport.opendata.ch/v1/locations?x=${lat}&y=${lon}&type=station`;
    } else {
      return res.status(400).json({ error: 'Query oder Koordinaten erforderlich' });
    }
    
    const response = await fetch(url);
    const data = await response.json();
    
    res.json(data.stations || []);
  } catch (error) {
    console.error('Fehler bei Haltestellensuche:', error);
    res.status(500).json({ error: 'Fehler bei der Suche' });
  }
});

// Dashboard anzeigen
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Settings-Seite
app.get('/settings', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.listen(PORT, () => {
  console.log(`Family Dashboard läuft auf http://localhost:${PORT}`);
  console.log(`Einstellungen: http://localhost:${PORT}/settings`);
});
