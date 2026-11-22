/*
  SFX Composer — Usage Analytics (local-first)

  Full content-area overlay like Browser / AI SFX.
  Tracks real user actions only: preview, successful timeline import,
  favorite add/remove, category access. Persists in localStorage.
  No network. No fabricated numbers.
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'sfxAnalyticsEvents';
  var MAX_EVENTS = 5000;
  var DEBOUNCE_PLAY_MS = 800;

  var ICON = {
    chart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 17V9M12 17v-6M16 17v-3"/></svg>',
    back:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    import:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 11l4 4 4-4M5 19h14"/></svg>'
  };

  /* ------------------------------------------------------------------ *
   * Storage
   * ------------------------------------------------------------------ */
  function loadEvents() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function saveEvents(list) {
    try {
      if (list.length > MAX_EVENTS) list = list.slice(list.length - MAX_EVENTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      /* quota — drop oldest half and retry once */
      try {
        list = list.slice(Math.floor(list.length / 2));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      } catch (e2) {}
    }
  }

  var recentPlayKeys = Object.create(null);

  function stableId(payload) {
    if (!payload) return '';
    if (payload.id) return String(payload.id);
    if (payload.path) return String(payload.path);
    if (payload.name) return String(payload.name);
    return '';
  }

  function baseName(pathOrName) {
    if (!pathOrName) return 'Unknown';
    var s = String(pathOrName).replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function guessCategory(name) {
    var n = String(name || '').toLowerCase();
    var rules = [
      ['whoosh', /whoosh|swish|swoosh/],
      ['impact', /impact|hit|bang|boom|crash|thud/],
      ['foley', /foley|footstep|cloth|rustle|prop/],
      ['glitch', /glitch|digital|static|corrupt/],
      ['human', /voice|vocal|breath|crowd|human|speech/],
      ['granular', /granular|grain|texture/],
      ['transition', /transition|riser|riser|sweep|drone/],
      ['ui', /click|ui |button|menu|beep|notification/],
      ['nature', /rain|wind|water|bird|forest|nature/],
      ['sci-fi', /sci-?fi|laser|space|alien|futur/]
    ];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][1].test(n)) return rules[i][0];
    }
    // folder hint: "Whoosh/foo.wav"
    var parts = String(name || '').replace(/\\/g, '/').split('/');
    if (parts.length > 1) {
      var folder = parts[parts.length - 2].toLowerCase();
      if (folder && folder.length < 24) return folder;
    }
    return 'uncategorized';
  }

  /**
   * Track a real user event.
   * type: sound_played | sound_imported | sound_favorited | sound_unfavorited | category_accessed
   */
  function track(type, payload) {
    payload = payload || {};
    var id = stableId(payload);
    var name = payload.name || baseName(payload.path || id) || 'Unknown';
    var category = payload.category || guessCategory(payload.path || name);

    // Debounce rapid repeated previews of the same sound (UI re-renders)
    if (type === 'sound_played') {
      var key = id || name;
      var now = Date.now();
      if (recentPlayKeys[key] && now - recentPlayKeys[key] < DEBOUNCE_PLAY_MS) return;
      recentPlayKeys[key] = now;
    }

    // Only count successful timeline placements for imports
    if (type === 'sound_imported' && payload.placed === false) return;

    var events = loadEvents();
    events.push({
      t: Date.now(),
      type: type,
      id: id,
      name: name,
      category: category,
      placed: payload.placed === true
    });
    saveEvents(events);

    if (panel && panel.classList.contains('is-open')) {
      try {
        render();
      } catch (e) {}
    }
  }

  function clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    recentPlayKeys = Object.create(null);
    if (panel && panel.classList.contains('is-open')) render();
  }

  /* ------------------------------------------------------------------ *
   * Aggregations
   * ------------------------------------------------------------------ */
  function startOfDay(ts) {
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function filterRange(events, rangeKey) {
    if (rangeKey === 'all') return events.slice();
    var days = rangeKey === '7' ? 7 : rangeKey === '30' ? 30 : rangeKey === '90' ? 90 : 0;
    if (!days) return events.slice();
    var cut = Date.now() - days * 86400000;
    return events.filter(function (e) {
      return e.t >= cut;
    });
  }

  function compute(rangeKey) {
    var events = filterRange(loadEvents(), rangeKey);
    var plays = 0;
    var imports = 0;
    var bySound = Object.create(null);
    var byCat = Object.create(null);
    var byDay = Object.create(null);
    var recent = [];

    events.forEach(function (e) {
      var day = startOfDay(e.t);
      if (!byDay[day]) byDay[day] = { plays: 0, imports: 0 };

      if (e.type === 'sound_played') {
        plays += 1;
        byDay[day].plays += 1;
      } else if (e.type === 'sound_imported') {
        imports += 1;
        byDay[day].imports += 1;
      }

      if (e.type === 'sound_played' || e.type === 'sound_imported') {
        var sid = e.id || e.name;
        if (!bySound[sid]) {
          bySound[sid] = { id: sid, name: e.name, plays: 0, imports: 0, last: 0, category: e.category };
        }
        var s = bySound[sid];
        if (e.type === 'sound_played') s.plays += 1;
        if (e.type === 'sound_imported') s.imports += 1;
        if (e.t > s.last) s.last = e.t;
        if (e.name) s.name = e.name;
        if (e.category) s.category = e.category;
      }

      if (e.category && (e.type === 'sound_played' || e.type === 'sound_imported' || e.type === 'category_accessed')) {
        byCat[e.category] = (byCat[e.category] || 0) + 1;
      }

      if (
        e.type === 'sound_played' ||
        e.type === 'sound_imported' ||
        e.type === 'sound_favorited' ||
        e.type === 'sound_unfavorited'
      ) {
        recent.push(e);
      }
    });

    var soundList = Object.keys(bySound).map(function (k) {
      return bySound[k];
    });
    var catList = Object.keys(byCat).map(function (k) {
      return { name: k, count: byCat[k] };
    });
    catList.sort(function (a, b) {
      return b.count - a.count;
    });

    var topCat = catList.length ? catList[0].name : '—';
    var uniqueSounds = soundList.length;

    // Daily series for chart (fill gaps)
    var daysBack = rangeKey === '7' ? 7 : rangeKey === '30' ? 30 : rangeKey === '90' ? 90 : 30;
    if (rangeKey === 'all' && events.length) {
      var oldest = events[0].t;
      for (var i = 0; i < events.length; i++) if (events[i].t < oldest) oldest = events[i].t;
      daysBack = Math.min(180, Math.max(7, Math.ceil((Date.now() - oldest) / 86400000) + 1));
    }
    var series = [];
    var today = startOfDay(Date.now());
    for (var d = daysBack - 1; d >= 0; d--) {
      var ts = today - d * 86400000;
      var row = byDay[ts] || { plays: 0, imports: 0 };
      series.push({ t: ts, plays: row.plays, imports: row.imports });
    }

    recent.sort(function (a, b) {
      return b.t - a.t;
    });
    recent = recent.slice(0, 40);

    return {
      plays: plays,
      imports: imports,
      topCategory: topCat,
      uniqueSounds: uniqueSounds,
      sounds: soundList,
      categories: catList,
      series: series,
      recent: recent,
      totalEvents: events.length
    };
  }

  /* ------------------------------------------------------------------ *
   * Auto-instrumentation (non-blocking)
   * ------------------------------------------------------------------ */
  function wrapAudioService() {
    var s = window.__sfxServices;
    if (!s || !s.audio || s.audio.__sfxAnalyticsWrapped) return;
    var audio = s.audio;
    if (typeof audio.playNow === 'function') {
      var orig = audio.playNow.bind(audio);
      audio.playNow = function (pathOrId) {
        try {
          track('sound_played', {
            path: typeof pathOrId === 'string' ? pathOrId : pathOrId && pathOrId.path,
            id: typeof pathOrId === 'string' ? pathOrId : pathOrId && (pathOrId.id || pathOrId.path),
            name: typeof pathOrId === 'object' && pathOrId && pathOrId.name
          });
        } catch (e) {}
        return orig(pathOrId);
      };
      audio.__sfxAnalyticsWrapped = true;
    }
  }

  function installHooks() {
    wrapAudioService();
    // Public API for other modules (browser-tab, ai-assistant, future library hooks)
    window.__sfxAnalytics = window.__sfxAnalytics || {};
    window.__sfxAnalytics.track = track;
    window.__sfxAnalytics.clear = clearAll;
    window.__sfxAnalytics.compute = compute;
  }

  // Poll briefly until services appear, then wrap
  (function waitServices() {
    installHooks();
    var n = 0;
    var iv = setInterval(function () {
      wrapAudioService();
      if (window.__sfxServices && window.__sfxServices.audio && window.__sfxServices.audio.__sfxAnalyticsWrapped) {
        clearInterval(iv);
      } else if (++n > 100) {
        clearInterval(iv);
      }
    }, 200);
  })();

  /* ------------------------------------------------------------------ *
   * UI
   * ------------------------------------------------------------------ */
  var panel = null;
  var bodyEl = null;
  var rangeKey = '30';
  var soundSort = 'plays'; // plays | imports

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function formatDate(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return 'Today ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
  }

  function formatDayLabel(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  function setOpen(opening) {
    if (!panel) build();
    if (opening) {
      panel.classList.add('is-open');
      render();
    } else {
      panel.classList.remove('is-open');
    }
    if (window.__sfxHeaderMenu && window.__sfxHeaderMenu.refresh) {
      try {
        window.__sfxHeaderMenu.refresh();
      } catch (e) {}
    }
  }

  function build() {
    if (panel) return;
    panel = el('div', 'sfx-an');
    panel.id = 'sfx-analytics';

    var header = el('div', 'sfx-an__header');
    var back = el('button', 'sfx-an__back');
    back.type = 'button';
    back.innerHTML = ICON.back + '<span>Back</span>';
    back.addEventListener('click', function () {
      setOpen(false);
    });
    header.appendChild(back);
    header.appendChild(el('div', 'sfx-an__title', 'Analytics'));
    var clearBtn = el('button', 'sfx-an__clear');
    clearBtn.type = 'button';
    clearBtn.title = 'Clear all analytics data';
    clearBtn.innerHTML = ICON.trash + '<span>Clear data</span>';
    clearBtn.addEventListener('click', function () {
      if (window.confirm('Clear all local analytics data? This cannot be undone.')) {
        clearAll();
      }
    });
    header.appendChild(clearBtn);
    panel.appendChild(header);

    bodyEl = el('div', 'sfx-an__body');
    panel.appendChild(bodyEl);
    document.body.appendChild(panel);

    window.__sfxAnalytics = window.__sfxAnalytics || {};
    window.__sfxAnalytics.isOpen = function () {
      return panel.classList.contains('is-open');
    };
    window.__sfxAnalytics.setOpen = setOpen;
    window.__sfxAnalytics.track = track;
    window.__sfxAnalytics.clear = clearAll;
  }

  function statCard(label, value, sub) {
    var c = el('div', 'sfx-an__stat');
    c.appendChild(el('div', 'sfx-an__stat-label', label));
    c.appendChild(el('div', 'sfx-an__stat-value', String(value)));
    if (sub) c.appendChild(el('div', 'sfx-an__stat-sub', sub));
    return c;
  }

  function renderChart(series) {
    var wrap = el('div', 'sfx-an__chart');
    var max = 1;
    series.forEach(function (r) {
      if (r.plays > max) max = r.plays;
      if (r.imports > max) max = r.imports;
    });
    var svgNS = 'http://www.w3.org/2000/svg';
    var w = 600;
    var h = 140;
    var padL = 28;
    var padR = 8;
    var padT = 12;
    var padB = 24;
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.setAttribute('class', 'sfx-an__svg');
    svg.setAttribute('preserveAspectRatio', 'none');

    function yScale(v) {
      return padT + (h - padT - padB) * (1 - v / max);
    }
    function xScale(i) {
      var n = Math.max(1, series.length - 1);
      return padL + ((w - padL - padR) * i) / n;
    }

    // grid
    for (var g = 0; g < 4; g++) {
      var gy = padT + ((h - padT - padB) * g) / 3;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', padL);
      line.setAttribute('x2', w - padR);
      line.setAttribute('y1', gy);
      line.setAttribute('y2', gy);
      line.setAttribute('class', 'sfx-an__grid');
      svg.appendChild(line);
    }

    function polyline(key, cls) {
      var pts = series
        .map(function (r, i) {
          return xScale(i) + ',' + yScale(r[key]);
        })
        .join(' ');
      var pl = document.createElementNS(svgNS, 'polyline');
      pl.setAttribute('points', pts);
      pl.setAttribute('class', cls);
      pl.setAttribute('fill', 'none');
      svg.appendChild(pl);
    }
    polyline('plays', 'sfx-an__line sfx-an__line--plays');
    polyline('imports', 'sfx-an__line sfx-an__line--imports');

    // x labels (sparse)
    var step = Math.max(1, Math.floor(series.length / 6));
    for (var i = 0; i < series.length; i += step) {
      var tx = document.createElementNS(svgNS, 'text');
      tx.setAttribute('x', xScale(i));
      tx.setAttribute('y', h - 6);
      tx.setAttribute('class', 'sfx-an__axis');
      tx.setAttribute('text-anchor', 'middle');
      tx.textContent = formatDayLabel(series[i].t);
      svg.appendChild(tx);
    }

    wrap.appendChild(svg);
    var legend = el('div', 'sfx-an__legend');
    legend.innerHTML =
      '<span class="sfx-an__swatch sfx-an__swatch--plays"></span> Previews ' +
      '<span class="sfx-an__swatch sfx-an__swatch--imports"></span> Timeline imports';
    wrap.appendChild(legend);
    return wrap;
  }

  function render() {
    if (!bodyEl) return;
    bodyEl.innerHTML = '';
    var data = compute(rangeKey);

    // Range filters
    var filters = el('div', 'sfx-an__filters');
    [
      ['7', 'Last 7 days'],
      ['30', 'Last 30 days'],
      ['90', 'Last 90 days'],
      ['all', 'All time']
    ].forEach(function (opt) {
      var b = el('button', 'sfx-an__chip' + (rangeKey === opt[0] ? ' is-active' : ''), opt[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        rangeKey = opt[0];
        render();
      });
      filters.appendChild(b);
    });
    bodyEl.appendChild(filters);

    if (data.totalEvents === 0) {
      var empty = el('div', 'sfx-an__empty');
      empty.appendChild(el('div', 'sfx-an__empty-icon')).innerHTML = ICON.chart;
      empty.appendChild(el('h2', 'sfx-an__empty-title', 'Your sound design journey starts here.'));
      empty.appendChild(
        el(
          'p',
          'sfx-an__empty-text',
          'Preview and import sounds from your library or the Browser. Analytics will appear here automatically — stored only on this computer.'
        )
      );
      bodyEl.appendChild(empty);
      return;
    }

    // Stats
    var stats = el('div', 'sfx-an__stats');
    stats.appendChild(statCard('Total Sounds Played', data.plays, 'Previews'));
    stats.appendChild(statCard('Timeline Imports', data.imports, 'Successful placements'));
    stats.appendChild(statCard('Most Used Category', data.topCategory, 'By activity'));
    stats.appendChild(statCard('Unique Sounds Used', data.uniqueSounds, 'Distinct files'));
    bodyEl.appendChild(stats);

    // Activity chart
    var section1 = el('section', 'sfx-an__section');
    section1.appendChild(el('h3', 'sfx-an__h', 'Activity overview'));
    section1.appendChild(renderChart(data.series));
    bodyEl.appendChild(section1);

    // Most used sounds
    var section2 = el('section', 'sfx-an__section');
    var head2 = el('div', 'sfx-an__section-head');
    head2.appendChild(el('h3', 'sfx-an__h', 'Most used sounds'));
    var sortWrap = el('div', 'sfx-an__filters');
    [
      ['plays', 'Most played'],
      ['imports', 'Most imported']
    ].forEach(function (opt) {
      var b = el('button', 'sfx-an__chip sfx-an__chip--sm' + (soundSort === opt[0] ? ' is-active' : ''), opt[1]);
      b.type = 'button';
      b.addEventListener('click', function () {
        soundSort = opt[0];
        render();
      });
      sortWrap.appendChild(b);
    });
    head2.appendChild(sortWrap);
    section2.appendChild(head2);

    var sounds = data.sounds.slice().sort(function (a, b) {
      if (soundSort === 'imports') return b.imports - a.imports || b.plays - a.plays;
      return b.plays - a.plays || b.imports - a.imports;
    });
    if (!sounds.length) {
      section2.appendChild(el('p', 'sfx-an__muted', 'No sound activity in this range.'));
    } else {
      var table = el('div', 'sfx-an__table');
      var thr = el('div', 'sfx-an__tr sfx-an__tr--head');
      ['Sound', 'Played', 'Imported', 'Last used'].forEach(function (h) {
        thr.appendChild(el('div', 'sfx-an__td', h));
      });
      table.appendChild(thr);
      sounds.slice(0, 25).forEach(function (s) {
        var tr = el('div', 'sfx-an__tr');
        tr.appendChild(el('div', 'sfx-an__td sfx-an__td--name', s.name));
        tr.appendChild(el('div', 'sfx-an__td', String(s.plays)));
        tr.appendChild(el('div', 'sfx-an__td', String(s.imports)));
        tr.appendChild(el('div', 'sfx-an__td sfx-an__td--muted', formatDate(s.last)));
        table.appendChild(tr);
      });
      section2.appendChild(table);
    }
    bodyEl.appendChild(section2);

    // Categories
    var section3 = el('section', 'sfx-an__section');
    section3.appendChild(el('h3', 'sfx-an__h', 'Category analytics'));
    if (!data.categories.length) {
      section3.appendChild(el('p', 'sfx-an__muted', 'No category data yet.'));
    } else {
      var maxC = data.categories[0].count || 1;
      var bars = el('div', 'sfx-an__bars');
      data.categories.slice(0, 10).forEach(function (c) {
        var row = el('div', 'sfx-an__bar-row');
        row.appendChild(el('div', 'sfx-an__bar-label', c.name));
        var track = el('div', 'sfx-an__bar-track');
        var fill = el('div', 'sfx-an__bar-fill');
        fill.style.width = Math.max(4, Math.round((c.count / maxC) * 100)) + '%';
        track.appendChild(fill);
        row.appendChild(track);
        var pct = Math.round((c.count / (data.plays + data.imports || 1)) * 100);
        row.appendChild(el('div', 'sfx-an__bar-meta', c.count + ' · ' + pct + '%'));
        bars.appendChild(row);
      });
      section3.appendChild(bars);
    }
    bodyEl.appendChild(section3);

    // Recent activity
    var section4 = el('section', 'sfx-an__section');
    section4.appendChild(el('h3', 'sfx-an__h', 'Recent activity'));
    if (!data.recent.length) {
      section4.appendChild(el('p', 'sfx-an__muted', 'No recent activity.'));
    } else {
      var list = el('div', 'sfx-an__activity');
      data.recent.forEach(function (e) {
        var row = el('div', 'sfx-an__act');
        var label =
          e.type === 'sound_played'
            ? 'Previewed'
            : e.type === 'sound_imported'
              ? 'Imported to timeline'
              : e.type === 'sound_favorited'
                ? 'Favourite added'
                : e.type === 'sound_unfavorited'
                  ? 'Favourite removed'
                  : e.type;
        row.appendChild(el('div', 'sfx-an__act-type', label));
        row.appendChild(el('div', 'sfx-an__act-name', e.name || '—'));
        row.appendChild(el('div', 'sfx-an__act-time', formatDate(e.t)));
        list.appendChild(row);
      });
      section4.appendChild(list);
    }
    bodyEl.appendChild(section4);
  }

  /* boot */
  function start() {
    build();
    installHooks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
