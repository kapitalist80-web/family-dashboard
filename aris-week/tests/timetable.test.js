const test = require('node:test');
const assert = require('node:assert');
const { lessonsForDay, lessonBounds, sortByStart } = require('../src/timetable');

const day = {
  iso: '2026-09-08',
  weekdayKey: 'tuesday'
};

function baseConfig(exceptions = []) {
  return {
    timetable: {
      tuesday: [
        { id: 'b', start: '09:50', end: '10:35', subject: 'Sport', room: 'Halle' },
        { id: 'a', start: '08:00', end: '08:45', subject: 'Mathematik', room: 'B12' }
      ]
    },
    exceptions
  };
}

test('Lektionen werden nach Startzeit sortiert', () => {
  const { lessons } = lessonsForDay(baseConfig(), day);
  assert.deepStrictEqual(lessons.map(l => l.subject), ['Mathematik', 'Sport']);
  assert.strictEqual(lessons[0].status, 'normal');
});

test('Lektionen ohne Zeit stehen am Ende', () => {
  const sorted = sortByStart([{ start: '' }, { start: '08:00', subject: 'Mathe' }]);
  assert.strictEqual(sorted[0].subject, 'Mathe');
});

test('Ausfall markiert nur das passende Fach', () => {
  const config = baseConfig([
    { id: 'x', date: '2026-09-08', type: 'cancelled', subject: 'Sport', text: 'Halle gesperrt' }
  ]);
  const { lessons, notes } = lessonsForDay(config, day);
  assert.strictEqual(lessons[0].status, 'normal');
  assert.strictEqual(lessons[1].status, 'cancelled');
  assert.strictEqual(lessons[1].note, 'Halle gesperrt');
  assert.deepStrictEqual(notes, []);
});

test('Ausnahme ohne Fach betrifft den ganzen Tag', () => {
  const config = baseConfig([{ id: 'x', date: '2026-09-08', type: 'cancelled', text: 'Schulreise' }]);
  const { lessons } = lessonsForDay(config, day);
  assert.deepStrictEqual(lessons.map(l => l.status), ['cancelled', 'cancelled']);
});

test('Hinweise und nicht zuordenbare Ausnahmen werden als Notiz gezeigt', () => {
  const config = baseConfig([
    { id: 'x', date: '2026-09-08', type: 'info', text: 'Turnschuhe mitnehmen' },
    { id: 'y', date: '2026-09-08', type: 'changed', subject: 'Chemie', text: 'Ersatz' }
  ]);
  const { notes } = lessonsForDay(config, day);
  assert.deepStrictEqual(notes, ['Turnschuhe mitnehmen', 'Ersatz']);
});

test('Ausnahmen anderer Tage bleiben unbeachtet', () => {
  const config = baseConfig([{ id: 'x', date: '2026-09-09', type: 'cancelled' }]);
  const { lessons, notes } = lessonsForDay(config, day);
  assert.deepStrictEqual(lessons.map(l => l.status), ['normal', 'normal']);
  assert.deepStrictEqual(notes, []);
});

test('Tage ohne Eintraege liefern eine leere Liste', () => {
  const { lessons } = lessonsForDay(baseConfig(), { iso: '2026-09-09', weekdayKey: 'wednesday' });
  assert.deepStrictEqual(lessons, []);
});

test('lessonBounds findet erste und letzte Lektion der Woche', () => {
  const days = [
    { lessons: [{ start: '08:00', end: '08:45' }] },
    { lessons: [{ start: '07:30', end: '15:10' }] }
  ];
  assert.deepStrictEqual(lessonBounds(days), { firstMinute: 450, lastMinute: 910 });
});
