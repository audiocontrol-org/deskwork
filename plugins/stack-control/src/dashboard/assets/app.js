// Fleet Dashboard — vanilla client (zero-build). Talks to the plane's read-only
// /v1/instances* API with the server-injected token. Grid (home) + instance
// detail (hash routing); live via a fetch-streamed SSE reader.
//
// This is a validation-first build: auth is a crude injected token, deferred by
// design. See docs/superpowers/specs/2026-07-19-fleet-dashboard-design.md.

(() => {
  'use strict';

  const config = readConfig();
  const apiBase = config.apiBase || '';
  const token = config.token || null;

  /** @type {Map<string, object>} id -> InstanceState (session memory). */
  const instances = new Map();
  let showAll = false;
  let streamAbort = null;
  let reconnectFails = 0;

  // --- config / auth -------------------------------------------------------
  function readConfig() {
    const el = document.getElementById('dashboard-config');
    if (!el || !el.textContent) return {};
    try {
      return JSON.parse(el.textContent);
    } catch {
      return {};
    }
  }

  function authHeaders() {
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  // --- time formatting (client re-formats server timestamps ONLY) ----------
  function relativeTime(iso) {
    if (!iso) return '—';
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return '—';
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
  }

  function formatMs(ms) {
    if (typeof ms !== 'number' || ms <= 0) return '0s';
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m ${rem}s` : `${m}m`;
  }

  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, (c) => {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // --- state helpers -------------------------------------------------------
  function isActive(inst) {
    return inst.connection === 'attached' || inst.liveness === 'live' || inst.liveness === 'stale';
  }

  function dotClass(inst) {
    if (inst.connection === 'disconnected') return 'gone';
    return inst.liveness === 'live' ? 'live' : inst.liveness === 'stale' ? 'stale' : 'gone';
  }

  function visibleInstances() {
    const list = [...instances.values()].filter((i) => showAll || isActive(i));
    const rank = { live: 0, stale: 1, gone: 2 };
    list.sort((a, b) => {
      const r = (rank[a.liveness] ?? 3) - (rank[b.liveness] ?? 3);
      if (r !== 0) return r;
      return (Date.parse(b.lastActivityAt || 0) || 0) - (Date.parse(a.lastActivityAt || 0) || 0);
    });
    return list;
  }

  // --- rendering: grid -----------------------------------------------------
  function renderGrid() {
    const body = document.getElementById('grid-body');
    const empty = document.getElementById('grid-empty');
    const rows = visibleInstances();
    empty.hidden = rows.length > 0;
    body.innerHTML = rows.map(gridRow).join('');
    for (const tr of body.querySelectorAll('tr[data-id]')) {
      tr.addEventListener('click', () => {
        location.hash = `#/instances/${encodeURIComponent(tr.getAttribute('data-id'))}`;
      });
    }
  }

  function gridRow(inst) {
    const bearing = inst.currentBearing
      ? `${escapeHtml(inst.currentBearing.phase)} · <span class="muted">${escapeHtml(inst.currentBearing.item)}</span>`
      : '<span class="muted">—</span>';
    const activity = inst.lastActivity
      ? `${escapeHtml(inst.lastActivity)} <span class="muted">· ${relativeTime(inst.lastActivityAt)}</span>`
      : `<span class="muted">${relativeTime(inst.lastActivityAt)}</span>`;
    const goneCls = inst.liveness === 'gone' || inst.connection === 'disconnected' ? ' class="is-gone"' : '';
    return (
      `<tr data-id="${escapeHtml(inst.id)}"${goneCls}>` +
      `<td><span class="dot ${dotClass(inst)}"></span>` +
      `<span class="state-label">${escapeHtml(inst.connection)} · ${escapeHtml(inst.liveness)}</span></td>` +
      `<td class="mono">${escapeHtml(inst.id)}</td>` +
      `<td>${bearing}</td>` +
      `<td>${activity}</td>` +
      `<td class="num">${inst.sessionsStarted ?? 0}/${inst.sessionsEnded ?? 0}</td>` +
      `</tr>`
    );
  }

  // --- rendering: detail ---------------------------------------------------
  async function renderDetail(id) {
    const view = document.getElementById('detail-body');
    view.innerHTML = '<p class="empty">Loading…</p>';
    let payload;
    try {
      const res = await fetch(`${apiBase}/v1/instances/${encodeURIComponent(id)}`, {
        headers: authHeaders(),
      });
      if (res.status === 404) {
        view.innerHTML = `<p class="empty">No instance <span class="mono">${escapeHtml(id)}</span> found.</p>`;
        return;
      }
      if (!res.ok) throw new Error(`detail ${res.status}`);
      payload = await res.json();
    } catch {
      view.innerHTML = '<p class="empty">Could not load instance detail.</p>';
      return;
    }
    if (!payload || payload.found === false || !payload.instance) {
      view.innerHTML = `<p class="empty">No instance <span class="mono">${escapeHtml(id)}</span> found.</p>`;
      return;
    }
    const inst = payload.instance;
    const activity = Array.isArray(payload.recentActivity) ? payload.recentActivity : inst.recentActivity || [];
    view.innerHTML = detailHtml(inst, activity);
  }

  function detailHtml(inst, activity) {
    const bearing = inst.currentBearing
      ? `${escapeHtml(inst.currentBearing.phase)} · <span class="muted">${escapeHtml(inst.currentBearing.item)}</span>`
      : '<span class="muted">no current phase</span>';
    const cards = [
      ['Connection', escapeHtml(inst.connection)],
      ['Liveness', escapeHtml(inst.liveness)],
      ['Sessions', `${inst.sessionsStarted ?? 0} <span class="muted">started</span> / ${inst.sessionsEnded ?? 0} <span class="muted">ended</span>`],
      ['Last heartbeat', relativeTime(inst.lastHeartbeatAt)],
      ['Last activity', relativeTime(inst.lastActivityAt)],
      ['First seen', relativeTime(inst.firstSeenAt)],
    ]
      .map(([k, v]) => `<div class="card"><div class="k">${k}</div><div class="v">${v}</div></div>`)
      .join('');

    return (
      `<div class="detail-head"><h2 class="mono">${escapeHtml(inst.id)}</h2>` +
      `<span class="state-label"><span class="dot ${dotClass(inst)}"></span>${escapeHtml(inst.connection)} · ${escapeHtml(inst.liveness)}</span></div>` +
      `<div class="muted">Current bearing: ${bearing}</div>` +
      `<div class="detail-grid">${cards}</div>` +
      phaseBarsHtml(inst.phaseDurations) +
      activityHtml(activity)
    );
  }

  function phaseBarsHtml(durations) {
    const entries = Object.entries(durations || {});
    if (entries.length === 0) {
      return '<div class="section-title">Phase durations (completed)</div><p class="muted">No completed phases yet.</p>';
    }
    const max = Math.max(...entries.map(([, ms]) => ms), 1);
    const rows = entries
      .sort((a, b) => b[1] - a[1])
      .map(([phase, ms]) => {
        const pct = Math.round((ms / max) * 100);
        return (
          `<div class="bar-row"><div class="mono">${escapeHtml(phase)}</div>` +
          `<div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>` +
          `<div class="num">${formatMs(ms)}</div></div>`
        );
      })
      .join('');
    return `<div class="section-title">Phase durations (completed)</div><div class="bars">${rows}</div>`;
  }

  function activityHtml(activity) {
    if (!activity || activity.length === 0) {
      return '<div class="section-title">Recent activity</div><p class="muted">No activity recorded.</p>';
    }
    const rows = activity
      .map((item) => {
        const obj = item && typeof item === 'object' ? item : {};
        const type = 'type' in obj ? obj.type : String(item);
        const when = 'wallClock' in obj ? obj.wallClock : null;
        const detail = 'detail' in obj && obj.detail ? obj.detail : null;
        const what = detail
          ? `${escapeHtml(type)} <span class="muted">· ${escapeHtml(detail)}</span>`
          : escapeHtml(type);
        return (
          `<div class="activity-row"><div class="t">${relativeTime(when)}</div>` +
          `<div class="mono">${what}</div></div>`
        );
      })
      .join('');
    return `<div class="section-title">Recent activity (newest first)</div><div class="activity">${rows}</div>`;
  }

  // --- routing -------------------------------------------------------------
  function currentRoute() {
    const m = /^#\/instances\/(.+)$/.exec(location.hash);
    return m ? { view: 'detail', id: decodeURIComponent(m[1]) } : { view: 'grid' };
  }

  function route() {
    const r = currentRoute();
    const gridView = document.getElementById('grid-view');
    const detailView = document.getElementById('detail-view');
    if (r.view === 'detail') {
      gridView.hidden = true;
      detailView.hidden = false;
      renderDetail(r.id);
    } else {
      detailView.hidden = true;
      gridView.hidden = false;
      renderGrid();
    }
  }

  // --- live stream (fetch-streamed SSE) ------------------------------------
  function applyDelta(delta) {
    if (!delta || typeof delta !== 'object') return;
    if (delta.kind === 'instance-upserted' && delta.instance && delta.instance.id) {
      instances.set(delta.instance.id, delta.instance);
    } else if (delta.kind === 'instance-removed' && delta.id) {
      instances.delete(delta.id);
    }
  }

  function handleSseBlock(block) {
    let event = 'message';
    const data = [];
    for (const line of block.split('\n')) {
      if (line.startsWith(':')) continue; // keepalive / comment
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (event !== 'instance-delta' || data.length === 0) return;
    try {
      applyDelta(JSON.parse(data.join('\n')));
      if (currentRoute().view === 'grid') renderGrid();
    } catch {
      /* skip a malformed frame; the stream stays alive */
    }
  }

  function setStatus(state, text) {
    const el = document.getElementById('stream-status');
    el.setAttribute('data-state', state);
    el.textContent = text || state;
  }

  async function streamLoop() {
    const controller = new AbortController();
    streamAbort = controller;
    setStatus('connecting', 'connecting…');
    try {
      const res = await fetch(`${apiBase}/v1/instances/stream`, {
        headers: authHeaders(),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      setStatus('connected', 'live');
      reconnectFails = 0;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          handleSseBlock(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
        }
      }
      throw new Error('stream ended');
    } catch (err) {
      if (controller.signal.aborted) return;
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    reconnectFails += 1;
    if (reconnectFails >= 3) setStatus('degraded', 'live updates unavailable — data may be stale');
    else setStatus('connecting', 'reconnecting…');
    const backoff = Math.min(1000 * 2 ** reconnectFails, 15000);
    const jitter = Math.floor(backoff * 0.25 * Math.random());
    setTimeout(streamLoop, backoff + jitter);
  }

  // --- initial snapshot (fast first paint) ---------------------------------
  async function loadSnapshot() {
    try {
      const res = await fetch(`${apiBase}/v1/instances?include=all`, { headers: authHeaders() });
      if (!res.ok) return;
      const payload = await res.json();
      const list = payload && Array.isArray(payload.instances) ? payload.instances : [];
      for (const inst of list) {
        if (inst && inst.id) instances.set(inst.id, inst);
      }
      if (currentRoute().view === 'grid') renderGrid();
    } catch {
      /* the stream will populate; first paint is best-effort */
    }
  }

  // --- boot ----------------------------------------------------------------
  document.getElementById('show-all').addEventListener('change', (e) => {
    showAll = e.target.checked;
    if (currentRoute().view === 'grid') renderGrid();
  });
  document.getElementById('back-to-grid').addEventListener('click', () => {
    location.hash = '';
  });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', () => streamAbort && streamAbort.abort());
  // Relative-time labels drift without new events — repaint the visible view on a
  // low-frequency timer (re-formats server timestamps only; never re-derives state).
  setInterval(() => {
    if (currentRoute().view === 'grid') renderGrid();
  }, 5000);

  loadSnapshot();
  streamLoop();
  route();
})();
