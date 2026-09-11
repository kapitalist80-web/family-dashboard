/* Einstellungsseite: Stundenplan, Kalender, Ausnahmen */

(function () {
  'use strict';

  var DAYS = [
    { key: 'monday', label: 'Montag' },
    { key: 'tuesday', label: 'Dienstag' },
    { key: 'wednesday', label: 'Mittwoch' },
    { key: 'thursday', label: 'Donnerstag' },
    { key: 'friday', label: 'Freitag' },
    { key: 'saturday', label: 'Samstag' },
    { key: 'sunday', label: 'Sonntag' }
  ];

  var EXCEPTION_LABELS = {
    cancelled: 'Fällt aus',
    changed: 'Geändert',
    info: 'Hinweis'
  };

  var config = null;
  var timetable = {};
  var activeDay = 'monday';

  function $(id) {
    return document.getElementById(id);
  }

  function toast(message, isError) {
    var node = $('toast');
    node.textContent = message;
    node.classList.toggle('error', !!isError);
    node.classList.add('show');
    clearTimeout(node._timer);
    node._timer = setTimeout(function () {
      node.classList.remove('show');
    }, 2600);
  }

  function api(path, options) {
    return fetch('/api' + path, options).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) throw new Error(body.error || ('HTTP ' + response.status));
        return body;
      });
    });
  }

  function send(path, method, payload) {
    return api(path, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  /* ---------- Kind & Anzeige ---------- */

  function fillDisplayForm() {
    $('childName').value = config.child.name || '';
    $('childColor').value = config.child.color || '#38bdf8';
    $('locale').value = config.display.locale || 'de-CH';
    $('timezone').value = config.display.timezone || 'Europe/Zurich';
    $('refreshMinutes').value = config.display.refreshMinutes;
    $('showWeekend').checked = !!config.display.showWeekend;
    $('rolloverWeekday').value = String(
      typeof config.display.rolloverWeekday === 'number' ? config.display.rolloverWeekday : 5
    );
    $('rolloverHour').value = config.display.rolloverHour;

    var night = config.display.nightMode || {};
    $('nightEnabled').checked = !!night.enabled;
    $('nightFrom').value = night.from || '21:00';
    $('nightTo').value = night.to || '06:30';
    $('nightDim').value = typeof night.dim === 'number' ? night.dim : 0.75;
  }

  function saveDisplay() {
    var payload = {
      child: {
        name: $('childName').value.trim() || 'Stundenplan',
        color: $('childColor').value
      },
      display: {
        locale: $('locale').value.trim() || 'de-CH',
        timezone: $('timezone').value.trim() || 'Europe/Zurich',
        refreshMinutes: Number($('refreshMinutes').value) || 15,
        showWeekend: $('showWeekend').checked,
        rolloverWeekday: Number($('rolloverWeekday').value),
        rolloverHour: Number($('rolloverHour').value) || 0,
        nightMode: {
          enabled: $('nightEnabled').checked,
          from: $('nightFrom').value || '21:00',
          to: $('nightTo').value || '06:30',
          dim: Number($('nightDim').value) || 0
        }
      }
    };

    send('/config', 'PUT', payload)
      .then(function (result) {
        config = result.config;
        toast('Einstellungen gespeichert');
      })
      .catch(function (error) { toast(error.message, true); });
  }

  /* ---------- Stundenplan ---------- */

  function renderTabs() {
    var tabs = $('dayTabs');
    tabs.innerHTML = '';
    DAYS.forEach(function (day) {
      var button = document.createElement('button');
      var count = (timetable[day.key] || []).length;
      button.type = 'button';
      button.textContent = day.label + (count ? ' (' + count + ')' : '');
      button.className = day.key === activeDay ? 'active' : '';
      button.addEventListener('click', function () {
        collectLessons();
        activeDay = day.key;
        renderTabs();
        renderLessons();
      });
      tabs.appendChild(button);
    });

    var target = $('copyTarget');
    target.innerHTML = '';
    DAYS.filter(function (day) { return day.key !== activeDay; }).forEach(function (day) {
      var option = document.createElement('option');
      option.value = day.key;
      option.textContent = day.label;
      target.appendChild(option);
    });
  }

  function lessonRow(lesson) {
    var row = document.createElement('tr');
    row.innerHTML =
      '<td class="narrow"><input type="time" data-key="start"></td>' +
      '<td class="narrow"><input type="time" data-key="end"></td>' +
      '<td><input type="text" data-key="subject" placeholder="Fach"></td>' +
      '<td class="room"><input type="text" data-key="room" placeholder="Raum"></td>' +
      '<td class="teacher"><input type="text" data-key="teacher" placeholder="Lehrperson"></td>' +
      '<td><input type="text" data-key="note" placeholder="Notiz"></td>' +
      '<td class="tiny"><button type="button" class="small danger" title="Zeile löschen">&times;</button></td>';

    ['start', 'end', 'subject', 'room', 'teacher', 'note'].forEach(function (key) {
      row.querySelector('[data-key="' + key + '"]').value = lesson[key] || '';
    });
    row.querySelector('button').addEventListener('click', function () {
      row.remove();
    });
    return row;
  }

  function renderLessons() {
    var body = $('lessonRows');
    body.innerHTML = '';
    (timetable[activeDay] || []).forEach(function (lesson) {
      body.appendChild(lessonRow(lesson));
    });
    if (!body.children.length) body.appendChild(lessonRow({}));
  }

  // Formularzeilen zurueck in das Datenmodell schreiben
  function collectLessons() {
    var lessons = [];
    var rows = $('lessonRows').querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) {
      var lesson = {};
      var inputs = rows[i].querySelectorAll('input');
      for (var j = 0; j < inputs.length; j++) {
        lesson[inputs[j].dataset.key] = inputs[j].value.trim();
      }
      if (lesson.subject || lesson.start) lessons.push(lesson);
    }
    timetable[activeDay] = lessons;
    return lessons;
  }

  function saveTimetable() {
    collectLessons();
    send('/timetable', 'PUT', timetable)
      .then(function (result) {
        timetable = result.timetable;
        renderTabs();
        renderLessons();
        toast('Stundenplan gespeichert');
      })
      .catch(function (error) { toast(error.message, true); });
  }

  function copyDay() {
    collectLessons();
    var target = $('copyTarget').value;
    if (!target) return;
    timetable[target] = (timetable[activeDay] || []).map(function (lesson) {
      var copy = {};
      Object.keys(lesson).forEach(function (key) {
        if (key !== 'id') copy[key] = lesson[key];
      });
      return copy;
    });
    renderTabs();
    toast('Kopiert – nicht vergessen zu speichern');
  }

  /* ---------- Kalender ---------- */

  function renderCalendars() {
    var list = $('calendarList');
    list.innerHTML = '';
    if (!config.calendars.length) {
      list.innerHTML = '<li><span class="muted">Noch kein Kalender hinterlegt.</span></li>';
      return;
    }

    config.calendars.forEach(function (calendar) {
      var item = document.createElement('li');

      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = calendar.color || '#38bdf8';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = calendar.name;

      var url = document.createElement('span');
      url.className = 'url';
      url.textContent = calendar.url;

      var spacer = document.createElement('span');
      spacer.className = 'spacer';

      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'small ghost';
      toggle.textContent = calendar.enabled === false ? 'aus' : 'an';
      toggle.addEventListener('click', function () {
        send('/calendars/' + calendar.id, 'PUT', { enabled: calendar.enabled === false })
          .then(reload)
          .catch(function (error) { toast(error.message, true); });
      });

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'small danger';
      remove.textContent = 'Löschen';
      remove.addEventListener('click', function () {
        if (!confirm('Kalender "' + calendar.name + '" entfernen?')) return;
        api('/calendars/' + calendar.id, { method: 'DELETE' })
          .then(reload)
          .catch(function (error) { toast(error.message, true); });
      });

      item.append(swatch, name, url, spacer, toggle, remove);
      list.appendChild(item);
    });
  }

  function addCalendar() {
    var url = $('calUrl').value.trim();
    if (!url) return toast('Bitte eine iCal-URL angeben', true);

    send('/calendars', 'POST', {
      name: $('calName').value.trim() || 'Kalender',
      url: url,
      color: $('calColor').value
    })
      .then(function () {
        $('calName').value = '';
        $('calUrl').value = '';
        return reload();
      })
      .then(function () { toast('Kalender hinzugefügt'); })
      .catch(function (error) { toast(error.message, true); });
  }

  /* ---------- Ausnahmen ---------- */

  function renderExceptions() {
    var list = $('exceptionList');
    list.innerHTML = '';
    var items = config.exceptions.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : 1;
    });

    if (!items.length) {
      list.innerHTML = '<li><span class="muted">Keine Ausnahmen erfasst.</span></li>';
      return;
    }

    items.forEach(function (exception) {
      var item = document.createElement('li');

      var date = document.createElement('span');
      date.className = 'name';
      date.textContent = exception.date;

      var type = document.createElement('span');
      type.textContent = EXCEPTION_LABELS[exception.type] || exception.type;

      var detail = document.createElement('span');
      detail.className = 'url';
      detail.textContent = [exception.subject, exception.text].filter(Boolean).join(' – ');

      var spacer = document.createElement('span');
      spacer.className = 'spacer';

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'small danger';
      remove.textContent = 'Löschen';
      remove.addEventListener('click', function () {
        api('/exceptions/' + exception.id, { method: 'DELETE' })
          .then(reload)
          .catch(function (error) { toast(error.message, true); });
      });

      item.append(date, type, detail, spacer, remove);
      list.appendChild(item);
    });
  }

  function addException() {
    send('/exceptions', 'POST', {
      date: $('excDate').value,
      type: $('excType').value,
      subject: $('excSubject').value.trim(),
      text: $('excText').value.trim()
    })
      .then(function () {
        $('excSubject').value = '';
        $('excText').value = '';
        return reload();
      })
      .then(function () { toast('Ausnahme gespeichert'); })
      .catch(function (error) { toast(error.message, true); });
  }

  /* ---------- Import / Export ---------- */

  function exportConfig() {
    var blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'stundenplan-config.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function importConfig(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (error) {
        return toast('Datei ist kein gültiges JSON', true);
      }

      var steps = [];
      if (parsed.child || parsed.display) {
        steps.push(send('/config', 'PUT', { child: parsed.child, display: parsed.display }));
      }
      if (parsed.timetable) steps.push(send('/timetable', 'PUT', parsed.timetable));

      Promise.all(steps)
        .then(reload)
        .then(function () { toast('Import übernommen (Kalender bitte prüfen)'); })
        .catch(function (error) { toast(error.message, true); });
    };
    reader.readAsText(file);
  }

  /* ---------- Start ---------- */

  function reload() {
    return api('/config').then(function (data) {
      config = data;
      timetable = data.timetable || {};
      DAYS.forEach(function (day) {
        if (!Array.isArray(timetable[day.key])) timetable[day.key] = [];
      });
      fillDisplayForm();
      renderTabs();
      renderLessons();
      renderCalendars();
      renderExceptions();
    });
  }

  function init() {
    $('saveDisplay').addEventListener('click', saveDisplay);
    $('addLesson').addEventListener('click', function () {
      $('lessonRows').appendChild(lessonRow({}));
    });
    $('saveTimetable').addEventListener('click', saveTimetable);
    $('copyDay').addEventListener('click', copyDay);
    $('addCalendar').addEventListener('click', addCalendar);
    $('addException').addEventListener('click', addException);
    $('cleanupExceptions').addEventListener('click', function () {
      send('/exceptions/cleanup', 'POST', {})
        .then(function (result) {
          return reload().then(function () {
            toast(result.removed + ' alte Ausnahme(n) entfernt');
          });
        })
        .catch(function (error) { toast(error.message, true); });
    });
    $('exportConfig').addEventListener('click', exportConfig);
    $('importConfig').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (event) {
      if (event.target.files[0]) importConfig(event.target.files[0]);
      event.target.value = '';
    });

    $('excDate').value = new Date().toISOString().slice(0, 10);
    reload().catch(function (error) { toast(error.message, true); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
