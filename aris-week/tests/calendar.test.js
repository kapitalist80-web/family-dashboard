const test = require('node:test');
const assert = require('node:assert');
const ical = require('node-ical');
const { expandEvent, splitEventIntoDays, normalizeUrl } = require('../src/calendar');

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Test//Stundenplan//DE',
  'BEGIN:VEVENT',
  'UID:einzel',
  'SUMMARY:Zahnarzt',
  'DTSTART:20260908T140000',
  'DTEND:20260908T150000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:serie',
  'SUMMARY:Klavierstunde',
  'DTSTART:20260901T170000',
  'DTEND:20260901T175000',
  'RRULE:FREQ=WEEKLY;COUNT=10',
  'EXDATE:20260915T170000',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:ferien',
  'SUMMARY:Herbstferien',
  'DTSTART;VALUE=DATE:20260907',
  'DTEND;VALUE=DATE:20260910',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

const parsed = ical.sync.parseICS(ICS);
const weekStart = new Date(2026, 8, 7, 0, 0, 0);
const weekEnd = new Date(2026, 8, 13, 23, 59, 59);

test('webcal-Adressen werden zu https', () => {
  assert.strictEqual(normalizeUrl('webcal://example.com/a.ics'), 'https://example.com/a.ics');
  assert.strictEqual(normalizeUrl('https://example.com/a.ics'), 'https://example.com/a.ics');
});

test('Einzeltermin wird nur im passenden Zeitraum geliefert', () => {
  const inRange = expandEvent(parsed.einzel, weekStart, weekEnd);
  assert.strictEqual(inRange.length, 1);
  assert.strictEqual(inRange[0].title, 'Zahnarzt');

  const other = expandEvent(parsed.einzel, new Date(2026, 8, 14), new Date(2026, 8, 20));
  assert.strictEqual(other.length, 0);
});

test('Wochenserie liefert genau einen Termin pro Woche', () => {
  const instances = expandEvent(parsed.serie, weekStart, weekEnd);
  assert.strictEqual(instances.length, 1);
  assert.strictEqual(instances[0].start.getDate(), 8);
  assert.strictEqual(instances[0].start.getHours(), 17);
});

test('EXDATE entfernt einzelne Termine einer Serie', () => {
  const instances = expandEvent(parsed.serie, new Date(2026, 8, 14), new Date(2026, 8, 20, 23, 59));
  assert.strictEqual(instances.length, 0);
});

test('Ganztagestermine erkennen das exklusive Ende', () => {
  const instances = expandEvent(parsed.ferien, weekStart, weekEnd);
  assert.strictEqual(instances.length, 1);
  assert.strictEqual(instances[0].allDay, true);

  const days = splitEventIntoDays(instances[0]);
  assert.deepStrictEqual(days.map(day => day.iso), ['2026-09-07', '2026-09-08', '2026-09-09']);
  assert.deepStrictEqual(days.map(day => day.dayIndex), [1, 2, 3]);
  assert.strictEqual(days[0].totalDays, 3);
});

test('Eintaegige Termine belegen genau einen Tag', () => {
  const [event] = expandEvent(parsed.einzel, weekStart, weekEnd);
  assert.deepStrictEqual(splitEventIntoDays(event).map(day => day.iso), ['2026-09-08']);
});
