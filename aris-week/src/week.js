const { WEEKDAY_KEYS } = require('./config');

const WEEKDAY_LONG_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAY_SHORT_DE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Montag der Woche, in der `date` liegt
function startOfWeek(date) {
  const result = startOfDay(date);
  const isoDay = result.getDay() === 0 ? 7 : result.getDay();
  return addDays(result, 1 - isoDay);
}

// Lokales Datum als YYYY-MM-DD (nicht UTC – toISOString waere verschoben)
function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Kalenderwoche nach ISO 8601
function isoWeekNumber(date) {
  const target = startOfDay(date);
  const isoDay = target.getDay() === 0 ? 7 : target.getDay();
  // Auf den Donnerstag derselben Woche springen
  target.setDate(target.getDate() + 4 - isoDay);
  const yearStart = new Date(target.getFullYear(), 0, 1);
  return Math.ceil(((target - yearStart) / MS_PER_DAY + 1) / 7);
}

function sameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

// Welche Woche wird angezeigt? Gegen Wochenende automatisch die naechste.
// `offset` ist die manuelle Navigation (-1 = Woche zurueck, +1 = Woche vor).
function resolveWeekStart(now, displayConfig = {}, offset = 0) {
  const rolloverWeekday = Number.isInteger(displayConfig.rolloverWeekday)
    ? displayConfig.rolloverWeekday
    : 5;
  const rolloverHour = Number.isInteger(displayConfig.rolloverHour)
    ? displayConfig.rolloverHour
    : 17;

  let weekStart = startOfWeek(now);

  if (rolloverWeekday >= 0 && rolloverWeekday <= 6) {
    const isoToday = now.getDay() === 0 ? 7 : now.getDay();
    const isoRollover = rolloverWeekday === 0 ? 7 : rolloverWeekday;
    const reached = isoToday > isoRollover
      || (isoToday === isoRollover && now.getHours() >= rolloverHour);
    if (reached) weekStart = addDays(weekStart, 7);
  }

  return addDays(weekStart, offset * 7);
}

// Tagesgeruest der angezeigten Woche (5 oder 7 Spalten)
function buildWeekDays(weekStart, { showWeekend = false, today = new Date() } = {}) {
  const dayCount = showWeekend ? 7 : 5;
  const days = [];
  for (let i = 0; i < dayCount; i++) {
    const date = addDays(weekStart, i);
    days.push({
      date,
      iso: toISODate(date),
      weekdayKey: WEEKDAY_KEYS[date.getDay()],
      weekdayLong: WEEKDAY_LONG_DE[date.getDay()],
      weekdayShort: WEEKDAY_SHORT_DE[date.getDay()],
      dayLabel: `${date.getDate()}.${date.getMonth() + 1}.`,
      isToday: sameDay(date, today),
      isWeekend: date.getDay() === 0 || date.getDay() === 6
    });
  }
  return days;
}

// "08:15" -> 495; ungueltige Werte -> null
function parseTimeToMinutes(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

module.exports = {
  MS_PER_DAY,
  WEEKDAY_LONG_DE,
  WEEKDAY_SHORT_DE,
  startOfDay,
  endOfDay,
  addDays,
  startOfWeek,
  toISODate,
  isoWeekNumber,
  sameDay,
  resolveWeekStart,
  buildWeekDays,
  parseTimeToMinutes
};
