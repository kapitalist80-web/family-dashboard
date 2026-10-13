const { parseTimeToMinutes } = require('./week');

function normalizeLesson(raw, index) {
  return {
    id: raw.id || `l${index}`,
    start: typeof raw.start === 'string' ? raw.start : '',
    end: typeof raw.end === 'string' ? raw.end : '',
    subject: raw.subject || '',
    room: raw.room || '',
    teacher: raw.teacher || '',
    note: raw.note || '',
    status: 'normal'
  };
}

function sortByStart(lessons) {
  return lessons.slice().sort((a, b) => {
    const aStart = parseTimeToMinutes(a.start);
    const bStart = parseTimeToMinutes(b.start);
    if (aStart === null && bStart === null) return 0;
    if (aStart === null) return 1;
    if (bStart === null) return -1;
    return aStart - bStart;
  });
}

function matchesLesson(exception, lesson) {
  if (!exception.subject) return true;
  return exception.subject.trim().toLowerCase() === (lesson.subject || '').trim().toLowerCase();
}

// Stundenplan eines Wochentags inkl. Ausnahmen (Ausfall, Vertretung, Hinweise)
function lessonsForDay(config, day) {
  const timetable = config.timetable || {};
  const base = Array.isArray(timetable[day.weekdayKey]) ? timetable[day.weekdayKey] : [];
  const lessons = sortByStart(base.map(normalizeLesson));

  const exceptions = (config.exceptions || []).filter(item => item.date === day.iso);
  const notes = [];

  for (const exception of exceptions) {
    if (exception.type === 'info') {
      if (exception.text) notes.push(exception.text);
      continue;
    }
    let matched = false;
    for (const lesson of lessons) {
      if (!matchesLesson(exception, lesson)) continue;
      matched = true;
      if (exception.type === 'cancelled') {
        lesson.status = 'cancelled';
        if (exception.text) lesson.note = exception.text;
      } else if (exception.type === 'changed') {
        lesson.status = 'changed';
        if (exception.text) lesson.note = exception.text;
      }
    }
    // Ausnahme ohne passende Lektion trotzdem als Hinweis zeigen
    if (!matched && exception.text) notes.push(exception.text);
  }

  return { lessons, notes };
}

// Erste/letzte Lektion der Woche – fuer die Zeitachse im Frontend
function lessonBounds(days) {
  let min = null;
  let max = null;
  for (const day of days) {
    for (const lesson of day.lessons) {
      const start = parseTimeToMinutes(lesson.start);
      const end = parseTimeToMinutes(lesson.end);
      if (start !== null && (min === null || start < min)) min = start;
      if (end !== null && (max === null || end > max)) max = end;
    }
  }
  return { firstMinute: min, lastMinute: max };
}

module.exports = { normalizeLesson, sortByStart, lessonsForDay, lessonBounds };
