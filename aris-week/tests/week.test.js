const test = require('node:test');
const assert = require('node:assert');
const week = require('../src/week');

test('startOfWeek liefert immer den Montag', () => {
  assert.strictEqual(week.toISODate(week.startOfWeek(new Date(2026, 8, 11))), '2026-09-07'); // Freitag
  assert.strictEqual(week.toISODate(week.startOfWeek(new Date(2026, 8, 13))), '2026-09-07'); // Sonntag
  assert.strictEqual(week.toISODate(week.startOfWeek(new Date(2026, 8, 14))), '2026-09-14'); // Montag
});

test('toISODate verwendet die lokale Zeitzone', () => {
  assert.strictEqual(week.toISODate(new Date(2026, 0, 1, 23, 30)), '2026-01-01');
});

test('isoWeekNumber folgt ISO 8601', () => {
  assert.strictEqual(week.isoWeekNumber(new Date(2026, 0, 1)), 1);
  assert.strictEqual(week.isoWeekNumber(new Date(2026, 8, 11)), 37);
});

test('resolveWeekStart wechselt am Freitagabend auf die naechste Woche', () => {
  const display = { rolloverWeekday: 5, rolloverHour: 17 };
  const fridayMorning = new Date(2026, 8, 11, 9, 0);
  const fridayEvening = new Date(2026, 8, 11, 18, 0);
  const sunday = new Date(2026, 8, 13, 9, 0);

  assert.strictEqual(week.toISODate(week.resolveWeekStart(fridayMorning, display)), '2026-09-07');
  assert.strictEqual(week.toISODate(week.resolveWeekStart(fridayEvening, display)), '2026-09-14');
  assert.strictEqual(week.toISODate(week.resolveWeekStart(sunday, display)), '2026-09-14');
});

test('resolveWeekStart kann abgeschaltet werden und beachtet das Offset', () => {
  const off = { rolloverWeekday: -1 };
  assert.strictEqual(week.toISODate(week.resolveWeekStart(new Date(2026, 8, 13), off)), '2026-09-07');
  assert.strictEqual(week.toISODate(week.resolveWeekStart(new Date(2026, 8, 8), off, 1)), '2026-09-14');
  assert.strictEqual(week.toISODate(week.resolveWeekStart(new Date(2026, 8, 8), off, -1)), '2026-08-31');
});

test('buildWeekDays liefert 5 oder 7 Tage und markiert heute', () => {
  const start = new Date(2026, 8, 7);
  const workdays = week.buildWeekDays(start, { today: new Date(2026, 8, 9, 12, 0) });
  assert.strictEqual(workdays.length, 5);
  assert.strictEqual(workdays[0].weekdayKey, 'monday');
  assert.strictEqual(workdays[2].isToday, true);
  assert.strictEqual(workdays[0].isToday, false);

  const fullWeek = week.buildWeekDays(start, { showWeekend: true, today: start });
  assert.strictEqual(fullWeek.length, 7);
  assert.strictEqual(fullWeek[6].isWeekend, true);
});

test('parseTimeToMinutes akzeptiert nur gueltige Uhrzeiten', () => {
  assert.strictEqual(week.parseTimeToMinutes('08:15'), 495);
  assert.strictEqual(week.parseTimeToMinutes('7:05'), 425);
  assert.strictEqual(week.parseTimeToMinutes('25:00'), null);
  assert.strictEqual(week.parseTimeToMinutes('08.15'), null);
  assert.strictEqual(week.parseTimeToMinutes(undefined), null);
});
