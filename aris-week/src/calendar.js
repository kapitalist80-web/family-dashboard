const ical = require('node-ical');
const { RRule } = require('rrule');
const { startOfDay, addDays, MS_PER_DAY } = require('./week');

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // url -> { fetchedAt, data }

function normalizeUrl(url) {
  return String(url).replace(/^webcal:\/\//i, 'https://');
}

function clearCache() {
  cache.clear();
}

async function fetchCalendarData(url, { force = false } = {}) {
  const key = normalizeUrl(url);
  const cached = cache.get(key);
  if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  const data = await ical.async.fromURL(key);
  cache.set(key, { fetchedAt: Date.now(), data });
  return data;
}

function isAllDay(event) {
  return event.datetype === 'date' || (event.start && event.start.dateOnly === true);
}

function toRRule(rule) {
  if (!rule) return null;
  if (typeof rule.between === 'function') return rule;
  if (typeof rule === 'string') return RRule.fromString(rule);
  if (rule.options) return new RRule(rule.options);
  if (rule.origOptions) return new RRule(rule.origOptions);
  return null;
}

function isExcluded(event, instanceStart) {
  if (!event.exdate) return false;
  // node-ical liefert EXDATE je nach Kalender als Date, Array oder als
  // Objekt mit Datums-Schluesseln – Object.values deckt alle Varianten ab.
  const values = event.exdate instanceof Date ? [event.exdate] : Object.values(event.exdate);
  return values.some(exdate => new Date(exdate).toDateString() === instanceStart.toDateString());
}

// Einzelnen VEVENT (inkl. Serien) auf Instanzen im Zeitraum abbilden
function expandEvent(event, rangeStart, rangeEnd) {
  if (!event.start) return [];

  const allDay = isAllDay(event);
  const originalStart = new Date(event.start);
  const originalEnd = event.end ? new Date(event.end) : new Date(originalStart.getTime() + 60 * 60 * 1000);
  const duration = Math.max(originalEnd - originalStart, 0);

  const base = {
    uid: event.uid || event.summary || 'event',
    title: event.summary || '(ohne Titel)',
    location: event.location || '',
    allDay
  };

  const rule = toRRule(event.rrule);
  if (!rule) {
    if (originalEnd <= rangeStart || originalStart >= rangeEnd) return [];
    return [{ ...base, start: originalStart, end: originalEnd }];
  }

  const instances = [];
  // Etwas frueher suchen, damit mehrtaegige Serien am Rand nicht verloren gehen
  const searchStart = new Date(rangeStart.getTime() - duration - MS_PER_DAY);
  let dates = [];
  try {
    dates = rule.between(searchStart, rangeEnd, true);
  } catch (error) {
    console.error(`RRULE-Fehler bei "${base.title}":`, error.message);
    return originalEnd <= rangeStart || originalStart >= rangeEnd
      ? []
      : [{ ...base, start: originalStart, end: originalEnd }];
  }

  const overrides = event.recurrences || {};

  for (const date of dates) {
    let instanceStart = new Date(date);
    let instanceEnd = new Date(instanceStart.getTime() + duration);
    let title = base.title;
    let location = base.location;

    // Einzeln verschobene/geaenderte Termine einer Serie
    const overrideKey = Object.keys(overrides).find(
      key => new Date(key).toDateString() === instanceStart.toDateString()
    );
    if (overrideKey) {
      const override = overrides[overrideKey];
      if (override.summary === undefined && override.start === undefined) continue;
      if (override.start) instanceStart = new Date(override.start);
      if (override.end) instanceEnd = new Date(override.end);
      else instanceEnd = new Date(instanceStart.getTime() + duration);
      if (override.summary) title = override.summary;
      if (override.location) location = override.location;
    } else if (isExcluded(event, instanceStart)) {
      continue;
    }

    if (instanceEnd <= rangeStart || instanceStart >= rangeEnd) continue;
    instances.push({ ...base, title, location, start: instanceStart, end: instanceEnd });
  }

  return instances;
}

// Termin auf die Tage verteilen, die er beruehrt
function splitEventIntoDays(event) {
  const days = [];
  const start = new Date(event.start);
  const end = new Date(event.end);

  // Bei ganztaegigen Terminen ist das Ende exklusiv (00:00 des Folgetags)
  const lastMoment = event.allDay ? new Date(end.getTime() - 1) : end;
  const firstDay = startOfDay(start);
  const lastDay = startOfDay(lastMoment < start ? start : lastMoment);
  const dayCount = Math.round((lastDay - firstDay) / MS_PER_DAY);

  for (let i = 0; i <= dayCount; i++) {
    const day = addDays(firstDay, i);
    days.push({
      iso: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`,
      dayIndex: i + 1,
      totalDays: dayCount + 1
    });
  }
  return days;
}

// Alle aktiven Kalender einlesen und Termine im Zeitraum liefern
async function getEvents(calendars, rangeStart, rangeEnd, { force = false } = {}) {
  const events = [];
  const errors = [];

  for (const calendar of calendars || []) {
    if (!calendar || calendar.enabled === false || !calendar.url) continue;
    try {
      const data = await fetchCalendarData(calendar.url, { force });
      for (const key of Object.keys(data)) {
        const entry = data[key];
        if (!entry || entry.type !== 'VEVENT') continue;
        for (const instance of expandEvent(entry, rangeStart, rangeEnd)) {
          events.push({
            id: `${calendar.id || 'cal'}_${instance.uid}_${instance.start.getTime()}`,
            title: instance.title,
            location: instance.location,
            start: instance.start,
            end: instance.end,
            allDay: instance.allDay,
            calendar: calendar.name || 'Kalender',
            color: calendar.color || '#38bdf8'
          });
        }
      }
    } catch (error) {
      console.error(`Kalender "${calendar.name || calendar.url}" nicht erreichbar:`, error.message);
      errors.push({ calendar: calendar.name || calendar.url, message: error.message });
    }
  }

  events.sort((a, b) => a.start - b.start);
  return { events, errors };
}

module.exports = {
  CACHE_TTL_MS,
  normalizeUrl,
  clearCache,
  expandEvent,
  splitEventIntoDays,
  getEvents
};
