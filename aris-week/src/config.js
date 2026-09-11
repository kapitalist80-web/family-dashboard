const fs = require('fs');
const path = require('path');

const CONFIG_FILE = process.env.CONFIG_FILE
  ? path.resolve(process.env.CONFIG_FILE)
  : path.join(__dirname, '..', 'config.json');

const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function emptyTimetable() {
  const timetable = {};
  for (const key of WEEKDAY_KEYS) timetable[key] = [];
  return timetable;
}

function defaultConfig() {
  return {
    child: {
      name: process.env.CHILD_NAME || 'Aris',
      color: '#38bdf8'
    },
    display: {
      locale: process.env.LOCALE || 'de-CH',
      timezone: process.env.TIMEZONE || 'Europe/Zurich',
      // Samstag/Sonntag zusaetzlich anzeigen (5 oder 7 Spalten)
      showWeekend: false,
      // Wie oft die Daten neu geladen werden (Minuten)
      refreshMinutes: 15,
      // Ab wann auf die naechste Woche umgeschaltet wird
      // 5 = Freitag, 6 = Samstag, 0 = Sonntag
      rolloverWeekday: 5,
      rolloverHour: 17,
      // Bildschirm nachts abdunkeln (rein visuell, ohne Root-Rechte)
      nightMode: {
        enabled: true,
        from: '21:00',
        to: '06:30',
        dim: 0.75
      }
    },
    // { id, name, url, color, enabled }
    calendars: [],
    // { id, start, end, subject, room, teacher, note } je Wochentag
    timetable: emptyTimetable(),
    // { id, date: 'YYYY-MM-DD', type: 'cancelled'|'changed'|'info', subject, text }
    exceptions: []
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Fehlende Felder aus den Defaults ergaenzen (fuer Updates aelterer config.json)
function mergeDefaults(target, defaults) {
  const result = isPlainObject(target) ? { ...target } : {};
  for (const [key, fallback] of Object.entries(defaults)) {
    if (isPlainObject(fallback)) {
      result[key] = mergeDefaults(result[key], fallback);
    } else if (typeof result[key] === 'undefined') {
      result[key] = Array.isArray(fallback) ? [...fallback] : fallback;
    }
  }
  return result;
}

let config = defaultConfig();

function load() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = mergeDefaults(saved, defaultConfig());
      config.timetable = mergeDefaults(config.timetable, emptyTimetable());
      console.log(`Konfiguration geladen: ${CONFIG_FILE}`);
    } else {
      console.log('Keine config.json gefunden – Standardkonfiguration wird verwendet.');
    }
  } catch (error) {
    console.error('Fehler beim Laden der Konfiguration:', error.message);
  }
  return config;
}

function save() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Fehler beim Speichern der Konfiguration:', error.message);
    return false;
  }
}

function get() {
  return config;
}

function set(next) {
  config = mergeDefaults(next, defaultConfig());
  config.timetable = mergeDefaults(config.timetable, emptyTimetable());
  return config;
}

module.exports = {
  CONFIG_FILE,
  WEEKDAY_KEYS,
  defaultConfig,
  emptyTimetable,
  mergeDefaults,
  load,
  save,
  get,
  set
};
