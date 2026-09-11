const express = require('express');
const configStore = require('./config');
const calendarService = require('./calendar');
const { lessonsForDay, lessonBounds, sortByStart, normalizeLesson } = require('./timetable');
const {
  resolveWeekStart,
  buildWeekDays,
  startOfWeek,
  endOfDay,
  toISODate,
  isoWeekNumber,
  parseTimeToMinutes
} = require('./week');

const VALID_EXCEPTION_TYPES = ['cancelled', 'changed', 'info'];

function nextId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Wochenansicht: Stundenplan + Kalendertermine pro Tag
async function buildWeek({ offset = 0, now = new Date(), force = false } = {}) {
  const config = configStore.get();
  const weekStart = resolveWeekStart(now, config.display, offset);
  const days = buildWeekDays(weekStart, {
    showWeekend: !!config.display.showWeekend,
    today: now
  });

  const rangeStart = weekStart;
  const rangeEnd = endOfDay(days[days.length - 1].date);
  const { events, errors } = await calendarService.getEvents(
    config.calendars,
    rangeStart,
    rangeEnd,
    { force }
  );

  const eventsByDay = new Map(days.map(day => [day.iso, []]));
  for (const event of events) {
    for (const slot of calendarService.splitEventIntoDays(event)) {
      const bucket = eventsByDay.get(slot.iso);
      if (!bucket) continue;
      bucket.push({
        id: `${event.id}_${slot.dayIndex}`,
        title: event.title,
        location: event.location,
        start: event.start,
        end: event.end,
        allDay: event.allDay,
        calendar: event.calendar,
        color: event.color,
        multiDay: slot.totalDays > 1,
        dayIndex: slot.dayIndex,
        totalDays: slot.totalDays
      });
    }
  }

  const enrichedDays = days.map(day => {
    const { lessons, notes } = lessonsForDay(config, day);
    const dayEvents = (eventsByDay.get(day.iso) || []).sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return new Date(a.start) - new Date(b.start);
    });
    return { ...day, lessons, notes, events: dayEvents };
  });

  const currentWeekStart = startOfWeek(now);
  return {
    child: config.child,
    display: config.display,
    offset,
    weekStart: toISODate(weekStart),
    weekEnd: toISODate(days[days.length - 1].date),
    weekNumber: isoWeekNumber(weekStart),
    isCurrentWeek: weekStart.getTime() === currentWeekStart.getTime(),
    days: enrichedDays,
    bounds: lessonBounds(enrichedDays),
    calendarErrors: errors,
    updatedAt: new Date().toISOString()
  };
}

function sanitizeLessons(rawLessons) {
  if (!Array.isArray(rawLessons)) return [];
  const lessons = rawLessons
    .filter(lesson => lesson && (lesson.subject || lesson.start))
    .map((lesson, index) => {
      const normalized = normalizeLesson(lesson, index);
      normalized.id = lesson.id || nextId();
      if (normalized.start && parseTimeToMinutes(normalized.start) === null) normalized.start = '';
      if (normalized.end && parseTimeToMinutes(normalized.end) === null) normalized.end = '';
      delete normalized.status;
      return normalized;
    });
  return sortByStart(lessons);
}

function createRouter() {
  const router = express.Router();

  router.get('/week', async (req, res) => {
    try {
      const offset = Number.parseInt(req.query.offset, 10) || 0;
      const force = req.query.force === '1' || req.query.force === 'true';
      const week = await buildWeek({ offset, force });
      res.json(week);
    } catch (error) {
      console.error('Fehler beim Aufbau der Wochenansicht:', error);
      res.status(500).json({ error: 'Wochenansicht konnte nicht geladen werden' });
    }
  });

  router.get('/config', (req, res) => {
    res.json(configStore.get());
  });

  router.put('/config', (req, res) => {
    const config = configStore.get();
    const { child, display } = req.body || {};
    if (child && typeof child === 'object') {
      config.child = { ...config.child, ...child };
    }
    if (display && typeof display === 'object') {
      config.display = {
        ...config.display,
        ...display,
        nightMode: { ...config.display.nightMode, ...(display.nightMode || {}) }
      };
    }
    configStore.save();
    res.json({ success: true, config });
  });

  router.get('/calendars', (req, res) => {
    res.json(configStore.get().calendars);
  });

  router.post('/calendars', (req, res) => {
    const { name, url, color } = req.body || {};
    if (!url) return res.status(400).json({ error: 'URL erforderlich' });

    const calendar = {
      id: nextId(),
      name: name || 'Kalender',
      url: calendarService.normalizeUrl(url),
      color: color || '#38bdf8',
      enabled: true
    };
    configStore.get().calendars.push(calendar);
    configStore.save();
    calendarService.clearCache();
    res.json({ success: true, calendar });
  });

  router.put('/calendars/:id', (req, res) => {
    const calendar = configStore.get().calendars.find(item => item.id === req.params.id);
    if (!calendar) return res.status(404).json({ error: 'Kalender nicht gefunden' });

    const { name, url, color, enabled } = req.body || {};
    if (typeof name === 'string') calendar.name = name;
    if (typeof url === 'string' && url) calendar.url = calendarService.normalizeUrl(url);
    if (typeof color === 'string') calendar.color = color;
    if (typeof enabled === 'boolean') calendar.enabled = enabled;

    configStore.save();
    calendarService.clearCache();
    res.json({ success: true, calendar });
  });

  router.delete('/calendars/:id', (req, res) => {
    const config = configStore.get();
    config.calendars = config.calendars.filter(item => item.id !== req.params.id);
    configStore.save();
    calendarService.clearCache();
    res.json({ success: true });
  });

  router.get('/timetable', (req, res) => {
    res.json(configStore.get().timetable);
  });

  router.put('/timetable', (req, res) => {
    const config = configStore.get();
    const incoming = req.body || {};
    const timetable = configStore.emptyTimetable();
    for (const key of Object.keys(timetable)) {
      timetable[key] = sanitizeLessons(incoming[key]);
    }
    config.timetable = timetable;
    configStore.save();
    res.json({ success: true, timetable });
  });

  router.get('/exceptions', (req, res) => {
    res.json(configStore.get().exceptions);
  });

  router.post('/exceptions', (req, res) => {
    const { date, type, subject, text } = req.body || {};
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Datum im Format YYYY-MM-DD erforderlich' });
    }
    if (!VALID_EXCEPTION_TYPES.includes(type)) {
      return res.status(400).json({ error: `Typ muss ${VALID_EXCEPTION_TYPES.join(', ')} sein` });
    }

    const exception = {
      id: nextId(),
      date,
      type,
      subject: subject || '',
      text: text || ''
    };
    configStore.get().exceptions.push(exception);
    configStore.save();
    res.json({ success: true, exception });
  });

  router.delete('/exceptions/:id', (req, res) => {
    const config = configStore.get();
    config.exceptions = config.exceptions.filter(item => item.id !== req.params.id);
    configStore.save();
    res.json({ success: true });
  });

  // Vergangene Ausnahmen aufraeumen
  router.post('/exceptions/cleanup', (req, res) => {
    const config = configStore.get();
    const today = toISODate(new Date());
    const before = config.exceptions.length;
    config.exceptions = config.exceptions.filter(item => item.date >= today);
    configStore.save();
    res.json({ success: true, removed: before - config.exceptions.length });
  });

  router.post('/refresh', (req, res) => {
    calendarService.clearCache();
    res.json({ success: true });
  });

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  return router;
}

module.exports = { createRouter, buildWeek, sanitizeLessons };
