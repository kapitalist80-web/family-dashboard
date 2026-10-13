/* Wochenansicht: Stundenplan + Kalender fuer das Raspberry Pi Display (800 x 480) */

(function () {
  'use strict';

  var RETURN_TO_CURRENT_MS = 2 * 60 * 1000; // nach Antippen zurueck zur aktuellen Woche
  var TICK_MS = 10 * 1000;
  var BREAK_MIN_MINUTES = 30;

  var state = {
    offset: 0,
    data: null,
    locale: 'de-CH',
    timezone: null,
    refreshMs: 15 * 60 * 1000,
    lastInteraction: 0,
    failedLoads: 0
  };

  var el = {
    week: document.getElementById('week'),
    childName: document.getElementById('childName'),
    childDot: document.getElementById('childDot'),
    weekRange: document.getElementById('weekRange'),
    weekNumber: document.getElementById('weekNumber'),
    clock: document.getElementById('clock'),
    todayLabel: document.getElementById('todayLabel'),
    statusText: document.getElementById('statusText'),
    statusWarn: document.getElementById('statusWarn'),
    night: document.getElementById('night'),
    prev: document.getElementById('prevWeek'),
    next: document.getElementById('nextWeek'),
    current: document.getElementById('currentWeek')
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function parseTime(value) {
    if (typeof value !== 'string') return null;
    var match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  // Formatierung immer in der konfigurierten Zeitzone – unabhaengig davon,
  // wie der Browser auf dem Pi eingestellt ist.
  function withZone(options) {
    if (!state.timezone) return options;
    var copy = {};
    for (var key in options) {
      if (Object.prototype.hasOwnProperty.call(options, key)) copy[key] = options[key];
    }
    copy.timeZone = state.timezone;
    return copy;
  }

  function minutesNow(date) {
    if (!state.timezone) return date.getHours() * 60 + date.getMinutes();
    var parts = new Intl.DateTimeFormat('de-CH', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: state.timezone
    }).format(date).split(':');
    return Number(parts[0]) % 24 * 60 + Number(parts[1]);
  }

  function formatTime(value) {
    return new Date(value).toLocaleTimeString(state.locale, withZone({ hour: '2-digit', minute: '2-digit' }));
  }

  function plural(count, singular, pluralForm) {
    return count + ' ' + (count === 1 ? singular : pluralForm);
  }

  function formatRange(startIso, endIso) {
    // Mittags ansetzen, damit eine Zeitzonen-Umrechnung nie einen Tag verschiebt
    var start = new Date(startIso + 'T12:00:00');
    var end = new Date(endIso + 'T12:00:00');
    var sameMonth = start.getMonth() === end.getMonth();
    var startText = start.toLocaleDateString(state.locale, withZone(sameMonth
      ? { day: 'numeric' }
      : { day: 'numeric', month: 'short' }));
    var endText = end.toLocaleDateString(state.locale, withZone({ day: 'numeric', month: 'long' }));
    return startText + '. – ' + endText;
  }

  /* ---------- Rendern ---------- */

  function lessonClass(lesson, day, now) {
    var classes = ['lesson'];
    if (lesson.status === 'cancelled') classes.push('cancelled');
    if (lesson.status === 'changed') classes.push('changed');

    if (day.isToday) {
      var start = parseTime(lesson.start);
      var end = parseTime(lesson.end);
      var current = minutesNow(now);
      if (start !== null && end !== null) {
        if (current >= start && current < end) classes.push('now');
        else if (current >= end) classes.push('past');
      } else if (end !== null && current >= end) {
        classes.push('past');
      }
    }
    return classes.join(' ');
  }

  function renderLesson(lesson, day, now) {
    var meta = [lesson.room, lesson.teacher, lesson.note].filter(Boolean).join(' · ');
    var html = '<div class="' + lessonClass(lesson, day, now) + '">';
    html += '<span class="time">' + escapeHtml(lesson.start || '') + '</span>';
    html += '<span class="subject">' + escapeHtml(lesson.subject || '—') + '</span>';
    if (meta) html += '<span class="meta">' + escapeHtml(meta) + '</span>';
    html += '</div>';
    return html;
  }

  function renderBreak(previous, lesson) {
    var previousEnd = parseTime(previous.end);
    var nextStart = parseTime(lesson.start);
    if (previousEnd === null || nextStart === null) return '';
    var gap = nextStart - previousEnd;
    if (gap < BREAK_MIN_MINUTES) return '';
    // Lange Luecke ueber die Mittagszeit als Mittag beschriften, sonst als Pause
    var isLunch = gap >= 45 && previousEnd >= 11 * 60 && previousEnd <= 14 * 60;
    var label = isLunch ? 'Mittag' : 'Pause';
    return '<div class="break">' + label + ' ' + escapeHtml(previous.end) + '–' + escapeHtml(lesson.start) + '</div>';
  }

  function renderEvent(event) {
    var time = '';
    if (event.allDay) {
      time = event.multiDay ? '<span class="etime">Tag ' + event.dayIndex + '/' + event.totalDays + '</span>' : '';
    } else if (event.dayIndex === 1) {
      time = '<span class="etime">' + escapeHtml(formatTime(event.start)) + '</span>';
    }
    var color = escapeHtml(event.color || '#38bdf8');
    return '<div class="event" style="--c:' + color + '">' +
      time + '<span class="etitle">' + escapeHtml(event.title) + '</span>' +
      '</div>';
  }

  function renderDay(day, now) {
    var classes = 'day' + (day.isToday ? ' today' : '') + (day.isWeekend ? ' weekend' : '');
    var html = '<section class="' + classes + '">';
    html += '<div class="day-head"><span class="dow">' + escapeHtml(day.weekdayShort) + '</span>';
    html += '<span class="dom">' + escapeHtml(day.dayLabel) + '</span></div>';

    var hasLessons = day.lessons.length > 0;
    html += '<div class="day-body' + (hasLessons ? '' : ' no-lessons') + '">';

    for (var i = 0; i < day.lessons.length; i++) {
      if (i > 0) html += renderBreak(day.lessons[i - 1], day.lessons[i]);
      html += renderLesson(day.lessons[i], day, now);
    }

    var extras = '';
    for (var n = 0; n < day.notes.length; n++) {
      extras += '<div class="note">' + escapeHtml(day.notes[n]) + '</div>';
    }
    for (var e = 0; e < day.events.length; e++) {
      extras += renderEvent(day.events[e]);
    }
    if (extras) html += '<div class="events">' + extras + '</div>';

    if (!hasLessons && !extras) {
      html += '<div class="empty">' + (day.isWeekend ? 'Wochenende' : 'kein Unterricht') + '</div>';
    }

    html += '</div></section>';
    return html;
  }

  // Schriftgroesse stufenweise verkleinern, bis die Woche ohne Scrollen passt
  function fitDensity() {
    var steps = ['', 'tight', 'dense'];
    for (var i = 0; i < steps.length; i++) {
      el.week.classList.remove('tight', 'dense');
      if (steps[i]) el.week.classList.add(steps[i]);
      var bodies = el.week.querySelectorAll('.day-body');
      var overflows = false;
      for (var b = 0; b < bodies.length; b++) {
        if (bodies[b].scrollHeight > bodies[b].clientHeight + 1) {
          overflows = true;
          break;
        }
      }
      if (!overflows) return;
    }
  }

  function weekHint(data) {
    if (data.isCurrentWeek) return '';
    var shown = new Date(data.weekStart + 'T12:00:00');
    var current = new Date();
    var diffWeeks = Math.round((shown - current) / (7 * 24 * 60 * 60 * 1000));
    if (diffWeeks === 0) return ' · nächste Woche';
    return diffWeeks > 0 ? ' · Vorschau' : ' · Rückblick';
  }

  function render() {
    var data = state.data;
    if (!data) return;
    var now = new Date();

    el.childName.textContent = data.child.name || 'Stundenplan';
    el.childDot.style.background = data.child.color || '#38bdf8';
    el.childDot.style.boxShadow = '0 0 10px ' + (data.child.color || '#38bdf8');

    el.weekRange.textContent = formatRange(data.weekStart, data.weekEnd);
    el.weekNumber.textContent = 'KW ' + data.weekNumber + weekHint(data);
    el.current.classList.toggle('hidden', !!data.isCurrentWeek);

    el.week.classList.toggle('weekend', data.days.length > 5);

    var html = '';
    for (var i = 0; i < data.days.length; i++) {
      html += renderDay(data.days[i], now);
    }
    el.week.innerHTML = html;
    fitDensity();

    var warnings = [];
    if (data.calendarErrors && data.calendarErrors.length) {
      warnings.push(data.calendarErrors.length + ' Kalender nicht erreichbar');
    }
    if (state.failedLoads > 0) {
      warnings.push('Daten vom ' + formatTime(data.updatedAt));
    }
    el.statusWarn.textContent = warnings.join(' · ');

    var lessonCount = data.days.reduce(function (sum, day) { return sum + day.lessons.length; }, 0);
    var eventCount = data.days.reduce(function (sum, day) { return sum + day.events.length; }, 0);
    el.statusText.textContent = plural(lessonCount, 'Lektion', 'Lektionen') + ' · ' +
      plural(eventCount, 'Termin', 'Termine') + ' · Stand ' + formatTime(data.updatedAt);

    if (lessonCount === 0 && eventCount === 0) {
      el.statusText.textContent = 'Noch nichts eingerichtet – Einstellungen unter /settings öffnen';
    }
  }

  /* ---------- Daten ---------- */

  function load(force) {
    var url = '/api/week?offset=' + state.offset + (force ? '&force=1' : '');
    return fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
      })
      .then(function (data) {
        state.data = data;
        state.failedLoads = 0;
        if (data.display) {
          state.locale = data.display.locale || state.locale;
          state.timezone = data.display.timezone || null;
          var minutes = Number(data.display.refreshMinutes);
          if (minutes > 0) state.refreshMs = minutes * 60 * 1000;
        }
        // Uhr direkt mit der konfigurierten Zeitzone nachziehen
        updateClock();
        render();
      })
      .catch(function (error) {
        state.failedLoads++;
        console.error('Laden fehlgeschlagen:', error.message);
        el.statusWarn.textContent = 'Keine Verbindung zum Server (' + state.failedLoads + ')';
      });
  }

  /* ---------- Uhr, Nachtmodus, Navigation ---------- */

  function updateClock() {
    var now = new Date();
    el.clock.textContent = now.toLocaleTimeString(state.locale, withZone({ hour: '2-digit', minute: '2-digit' }));
    el.todayLabel.textContent = now.toLocaleDateString(state.locale, withZone({
      weekday: 'long', day: 'numeric', month: 'long'
    }));
  }

  function updateNightMode() {
    var display = state.data && state.data.display;
    var night = display && display.nightMode;
    if (!night || !night.enabled) {
      el.night.style.opacity = 0;
      return;
    }
    var from = parseTime(night.from);
    var to = parseTime(night.to);
    if (from === null || to === null) return;

    var current = minutesNow(new Date());
    var isNight = from <= to ? (current >= from && current < to) : (current >= from || current < to);
    var dim = Math.min(Math.max(Number(night.dim) || 0.75, 0), 0.95);
    el.night.style.opacity = isNight ? dim : 0;
  }

  function goto(offset) {
    state.offset = offset;
    state.lastInteraction = Date.now();
    load(false);
  }

  function bindNavigation() {
    el.prev.addEventListener('click', function () { goto(state.offset - 1); });
    el.next.addEventListener('click', function () { goto(state.offset + 1); });
    el.current.addEventListener('click', function () { goto(0); });

    // Wischen auf dem Touchscreen
    var touchStartX = null;
    var touchStartY = null;
    document.addEventListener('touchstart', function (event) {
      touchStartX = event.changedTouches[0].clientX;
      touchStartY = event.changedTouches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', function (event) {
      if (touchStartX === null) return;
      var deltaX = event.changedTouches[0].clientX - touchStartX;
      var deltaY = event.changedTouches[0].clientY - touchStartY;
      touchStartX = null;
      if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        goto(state.offset + (deltaX < 0 ? 1 : -1));
      }
    }, { passive: true });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') goto(state.offset - 1);
      if (event.key === 'ArrowRight') goto(state.offset + 1);
      if (event.key === 'Home' || event.key === 'Escape') goto(0);
      if (event.key === 'r' || event.key === 'R') load(true);
      // Mauszeiger nur bei Bedarf einblenden (Kiosk zeigt ihn sonst nie)
      if (event.key === 'm' || event.key === 'M') document.body.classList.toggle('with-cursor');
    });
  }

  function tick() {
    updateClock();
    updateNightMode();
    // Ohne Bedienung zurueck auf die laufende Woche
    if (state.offset !== 0 && Date.now() - state.lastInteraction > RETURN_TO_CURRENT_MS) {
      goto(0);
      return;
    }
    render();
  }

  function scheduleReload() {
    setTimeout(function run() {
      load(false).then(function () {
        setTimeout(run, state.refreshMs);
      });
    }, state.refreshMs);
  }

  function init() {
    bindNavigation();
    updateClock();
    load(false).then(function () {
      updateNightMode();
      scheduleReload();
    });
    setInterval(tick, TICK_MS);
    // Nach Mitternacht sicher auf den neuen Tag umstellen
    setInterval(function () {
      if (new Date().getHours() === 0 && new Date().getMinutes() < 2) load(false);
    }, 60 * 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
