// app/system.js
// ---------------------------------------------------------------------
// System bootstrap: week navigation, weekly statistics, basic diagnostics
// Works with modules: state.js, supa.js, timetable.js, homework.js, tasks.js, subjects.js
// Exported API:
//   - initSystem()
//   - computeWeeklyStats(weekStart) -> object
//   - runDiagnostics() -> array of {level, message, hint?}
//
// Optional HTML hooks (rendered if present):
//   - #weekSelect (input[type="week"] or text input)
//   - #prevWeekBtn, #nextWeekBtn, #thisWeekBtn
//   - #statsPanel
//   - #diagnosticsPanel
// ---------------------------------------------------------------------

import { state, saveLocal } from '../state.js';
import { supa } from '../supa.js';

// Public API -----------------------------------------------------------
export function initSystem() {
  ensureStateShape();

  // 1) Week picker wiring
  wireWeekPicker();

  // 2) First render (this week by default)
  const start = getWeekStart(state.ui?.selectedWeekStart || new Date());
  state.ui = state.ui || {};
  state.ui.selectedWeekStart = start.toISOString();
  saveLocal();

  renderAll();

  // 3) Expose handy globals for quick debugging in console / onclick attributes
  window.recomputeStats = () => {
    renderStats();
  };
  window.runDiagnostics = () => {
    renderDiagnostics();
  };
}

export function computeWeeklyStats(weekStartDate) {
  const wkStart = getWeekStart(weekStartDate);
  const wkEnd = addDays(wkStart, 7);

  // Safeguard datasets
  const tasks = Array.isArray(state.data?.tasks) ? state.data.tasks : [];
  const homework = Array.isArray(state.data?.homework) ? state.data.homework : [];
  const sessions = Array.isArray(state.data?.timetable) ? state.data.timetable : [];
  const subjects = Array.isArray(state.data?.subjects) ? state.data.subjects : [];

  // ---- Tasks summary (by status)
  const taskSummary = summarizeTasks(tasks);

  // ---- Homework summary (due this week, overdue, completed)
  const hwSummary = summarizeHomework(homework, wkStart, wkEnd);

  // ---- Study time from timetable (minutes per subject + total)
  const timeSummary = summarizeStudyTime(sessions, wkStart, wkEnd);

  // ---- Subject ratings (average per subject + overall)
  const ratingSummary = summarizeRatings(subjects);

  return {
    week: {
      startISO: wkStart.toISOString(),
      endISO: wkEnd.toISOString(),
      label: formatWeekLabel(wkStart),
    },
    tasks: taskSummary,
    homework: hwSummary,
    studyTime: timeSummary,
    ratings: ratingSummary,
  };
}

export function runDiagnostics() {
  const issues = [];

  // Auth / Supabase
  if (state.user && !supa?.client) {
    issues.push({
      level: 'warning',
      message: 'You appear logged in, but Supabase client is not ready.',
      hint: 'Check supa.js initialization and URL/key values.',
    });
  }
  if (!state.user) {
    issues.push({
      level: 'info',
      message: 'No authenticated user — working in offline/local mode.',
      hint: 'Sign in to enable syncing and multi-device data.',
    });
  }

  // Data presence
  const data = state.data || {};
  const hasAnyData =
    (data.tasks && data.tasks.length) ||
    (data.homework && data.homework.length) ||
    (data.timetable && data.timetable.length) ||
    (data.subjects && data.subjects.length);
  if (!hasAnyData) {
    issues.push({
      level: 'info',
      message: 'No data found yet.',
      hint: 'Create at least one task, homework item, timetable session, or subject.',
    });
  }

  // Cross-links sanity
  const subjectsById = new Set((data.subjects || []).map((s) => String(s.id)));
  const orphanHW = (data.homework || []).filter(
    (h) => h.subject_id != null && !subjectsById.has(String(h.subject_id))
  );
  if (orphanHW.length) {
    issues.push({
      level: 'warning',
      message: `Found ${orphanHW.length} homework item(s) linked to missing subjects.`,
      hint: 'Open Subjects and ensure subject IDs match homework.subject_id.',
    });
  }

  // Timetable subject coverage
  const sessionsWithUnknownSubject = (data.timetable || []).filter(
    (s) => s.subject_id && !subjectsById.has(String(s.subject_id))
  );
  if (sessionsWithUnknownSubject.length) {
    issues.push({
      level: 'warning',
      message: `Found ${sessionsWithUnknownSubject.length} timetable session(s) with unknown subject_id.`,
      hint: 'Either create the subject or remove the subject_id from those sessions.',
    });
  }

  // Storage size (rough localStorage pressure indicator)
  try {
    const bytes = new Blob([JSON.stringify(state)]).size;
    if (bytes > 2_000_000) {
      issues.push({
        level: 'warning',
        message: `Large local dataset (~${Math.round(bytes / 1024)} KB).`,
        hint: 'Consider archiving old items or relying on server data to reduce local size.',
      });
    }
  } catch {
    // ignore
  }

  // Last sync age (if present)
  if (state.lastSyncAt) {
    const last = new Date(state.lastSyncAt);
    const hours = Math.round((Date.now() - last.getTime()) / (1000 * 60 * 60));
    if (hours > 72 && state.user) {
      issues.push({
        level: 'info',
        message: `Last sync was ${hours} hour(s) ago.`,
        hint: 'Trigger a manual sync in your UI, or check network/auth.',
      });
    }
  }

  // Basic shape checks
  ['tasks', 'homework', 'timetable', 'subjects'].forEach((k) => {
    if (state.data && state.data[k] && !Array.isArray(state.data[k])) {
      issues.push({
        level: 'error',
        message: `state.data.${k} is not an array.`,
        hint: 'Reset or reinitialize your local data structure.',
      });
    }
  });

  // Everything looks ok?
  if (!issues.length) {
    issues.push({
      level: 'success',
      message: 'All basic checks passed.',
    });
  }

  return issues;
}

// Internal: UI wiring & rendering --------------------------------------
function renderAll() {
  renderStats();
  renderDiagnostics();
}

function renderStats() {
  const panel = document.getElementById('statsPanel');
  if (!panel) return;

  const weekStart = getSelectedWeekStart();
  const stats = computeWeeklyStats(weekStart);

  panel.innerHTML = `
    <div class="card" style="padding:14px;border-radius:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong>Weekly Overview</strong>
        <span style="opacity:.7">${stats.week.label}</span>
      </div>

      ${renderTasksBlock(stats.tasks)}
      ${renderHomeworkBlock(stats.homework)}
      ${renderTimeBlock(stats.studyTime)}
      ${renderRatingsBlock(stats.ratings)}
    </div>
  `;
}

function renderDiagnostics() {
  const box = document.getElementById('diagnosticsPanel');
  if (!box) return;

  const items = runDiagnostics();
  box.innerHTML = items
    .map((it) => {
      const color =
        it.level === 'error'
          ? '#ef4444'
          : it.level === 'warning'
          ? '#f59e0b'
          : it.level === 'success'
          ? '#22c55e'
          : '#6b7280';
      return `
        <div class="diag-item" style="border-left:4px solid ${color};padding:8px 10px;margin:8px 0;background:#fff;border-radius:8px;">
          <div style="font-weight:600;color:${color};text-transform:capitalize">${it.level}</div>
          <div>${escapeHtml(it.message || '')}</div>
          ${it.hint ? `<div style="opacity:.8;font-size:.9em;margin-top:4px;"><em>Hint:</em> ${escapeHtml(it.hint)}</div>` : ''}
        </div>`;
    })
    .join('') || `<div style="opacity:.7;">No diagnostics available.</div>`;
}

function renderTasksBlock(t) {
  return `
    <div style="margin:8px 0;">
      <div style="font-weight:600;margin-bottom:4px;">Tasks</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;">
        ${statPill('Total', t.total)}
        ${statPill('Open', t.open)}
        ${statPill('In Progress', t.inProgress)}
        ${statPill('Done', t.done)}
      </div>
    </div>
  `;
}

function renderHomeworkBlock(h) {
  return `
    <div style="margin:8px 0;">
      <div style="font-weight:600;margin-bottom:4px;">Homework</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        ${statPill('Due this week', h.dueThisWeek)}
        ${statPill('Overdue', h.overdue)}
        ${statPill('Completed', h.completed)}
      </div>
    </div>
  `;
}

function renderTimeBlock(s) {
  const totalH = (s.totalMinutes / 60) || 0;
  const bySubject = Object.entries(s.bySubject || {});
  return `
    <div style="margin:8px 0;">
      <div style="font-weight:600;margin-bottom:4px;">Study Time</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        ${statPill('Total hours', totalH.toFixed(1))}
        ${bySubject.map(([name, mins]) => statPill(name, (mins / 60).toFixed(1) + ' h')).join('')}
      </div>
    </div>
  `;
}

function renderRatingsBlock(r) {
  const avg = isFinite(r.overallAverage) ? r.overallAverage.toFixed(2) : '—';
  return `
    <div style="margin:8px 0;">
      <div style="font-weight:600;margin-bottom:4px;">Subject Ratings</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        ${statPill('Overall Avg (1–5)', avg)}
        ${Object.entries(r.bySubject || {})
          .map(([name, val]) => statPill(name, (val || 0).toFixed(2)))
          .join('')}
      </div>
    </div>
  `;
}

function statPill(label, value) {
  return `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
      <div style="font-size:.85em;opacity:.75;">${escapeHtml(label)}</div>
      <div style="font-weight:700;">${escapeHtml(String(value))}</div>
    </div>
  `;
}

// Week picker -----------------------------------------------------------
function wireWeekPicker() {
  const input = document.getElementById('weekSelect');
  const prevBtn = document.getElementById('prevWeekBtn');
  const nextBtn = document.getElementById('nextWeekBtn');
  const thisBtn = document.getElementById('thisWeekBtn');

  if (input) {
    // Accepts either <input type="week"> value (YYYY-W##) or free text "YYYY-MM-DD"
    const selected = getSelectedWeekStart();
    // For <input type="week"> we set the week-string
    input.value = toWeekInputValue(selected);

    input.addEventListener('change', () => {
      const date = parseWeekInput(input.value) || new Date();
      state.ui.selectedWeekStart = getWeekStart(date).toISOString();
      saveLocal();
      renderAll();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const d = addDays(getSelectedWeekStart(), -7);
      state.ui.selectedWeekStart = getWeekStart(d).toISOString();
      saveLocal();
      syncWeekInput();
      renderAll();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const d = addDays(getSelectedWeekStart(), 7);
      state.ui.selectedWeekStart = getWeekStart(d).toISOString();
      saveLocal();
      syncWeekInput();
      renderAll();
    });
  }
  if (thisBtn) {
    thisBtn.addEventListener('click', () => {
      const d = getWeekStart(new Date());
      state.ui.selectedWeekStart = d.toISOString();
      saveLocal();
      syncWeekInput();
      renderAll();
    });
  }
}

function syncWeekInput() {
  const input = document.getElementById('weekSelect');
  if (!input) return;
  input.value = toWeekInputValue(getSelectedWeekStart());
}

function getSelectedWeekStart() {
  const iso = state.ui?.selectedWeekStart;
  return iso ? new Date(iso) : getWeekStart(new Date());
}

// Summaries -------------------------------------------------------------
function summarizeTasks(tasks) {
  const total = tasks.length;
  let open = 0,
    inProgress = 0,
    done = 0;

  for (const t of tasks) {
    const s = (t.status || '').toLowerCase();
    if (s === 'done' || s === 'completed' || s === 'complete') done++;
    else if (s === 'in_progress' || s === 'in progress' || s === 'doing') inProgress++;
    else open++;
  }
  return { total, open, inProgress, done };
}

function summarizeHomework(items, wkStart, wkEnd) {
  let dueThisWeek = 0,
    overdue = 0,
    completed = 0;

  const now = new Date();
  for (const h of items) {
    const done = !!h.completed || !!h.is_done;
    if (done) {
      completed++;
      continue;
    }
    const due = parseDate(h.due_date || h.due || h.deadline);
    if (!due) continue;
    if (due >= wkStart && due < wkEnd) dueThisWeek++;
    if (due < startOfDay(now)) overdue++;
  }
  return { dueThisWeek, overdue, completed };
}

function summarizeStudyTime(sessions, wkStart, wkEnd) {
  const bySubject = {};
  let totalMinutes = 0;

  for (const s of sessions) {
    const start = parseDateTime(s.start || s.start_at || s.date_start);
    const end = parseDateTime(s.end || s.end_at || s.date_end);
    if (!start || !end) continue;
    if (end <= wkStart || start >= wkEnd) continue; // outside week

    const mins = Math.max(0, (end - start) / (1000 * 60));
    const name = (s.subject_name || s.subject || 'Other').toString();
    bySubject[name] = (bySubject[name] || 0) + mins;
    totalMinutes += mins;
  }
  return { totalMinutes, bySubject };
}

function summarizeRatings(subjects) {
  const bySubject = {};
  let total = 0;
  let count = 0;

  for (const s of subjects) {
    const arr = (s.themes || []).map((t) => toNumber(t.self_assessment));
    if (!arr.length) continue;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    bySubject[s.name || `Subject ${s.id}`] = avg;
    total += avg;
    count++;
  }

  const overallAverage = count ? total / count : NaN;
  return { bySubject, overallAverage };
}

// Helpers: weeks, dates, numbers ---------------------------------------
function getWeekStart(d) {
  const x = startOfDay(d);
  // Monday as week start (ISO-like)
  const day = x.getDay(); // 0=Sun, 1=Mon,... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

function formatWeekLabel(weekStart) {
  const ws = getWeekStart(weekStart);
  const we = addDays(ws, 6);
  return `${fmt(ws)} – ${fmt(we)}`;
}

function toWeekInputValue(d) {
  // yyyy-Www format for <input type="week">
  const date = new Date(d);
  const year = date.getUTCFullYear();
  const week = isoWeekNumber(date);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function parseWeekInput(value) {
  // Accept "YYYY-W##" (type=week) or "YYYY-MM-DD"
  if (!value) return null;

  // type=week
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (m) {
    const year = Number(m[1]);
    const wk = Number(m[2]);
    return weekStartFromISO(year, wk);
  }

  // date
  const d = parseDate(value);
  return d || null;
}

function weekStartFromISO(year, isoWeek) {
  // ISO week 1 is the week with the first Thursday of the year
  const simple = new Date(Date.UTC(year, 0, 1 + (isoWeek - 1) * 7));
  const dow = simple.getUTCDay();
  const ISOweekStart = new Date(simple);
  const diff = (dow <= 4 ? dow - 1 : dow - 8); // Monday-based
  ISOweekStart.setUTCDate(simple.getUTCDate() - diff);
  return ISOweekStart;
}

function isoWeekNumber(d) {
  // Copy date object
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  // Year of the week
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function fmt(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const dd = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseDateTime(s) {
  return parseDate(s);
}

function toNumber(v, d = 0) {
  const n = Number(v);
  return isNaN(n) ? d : n;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureStateShape() {
  state.ui = state.ui || {};
  state.data = state.data || {};
  state.data.tasks = Array.isArray(state.data.tasks) ? state.data.tasks : [];
  state.data.homework = Array.isArray(state.data.homework) ? state.data.homework : [];
  state.data.timetable = Array.isArray(state.data.timetable) ? state.data.timetable : [];
  state.data.subjects = Array.isArray(state.data.subjects) ? state.data.subjects : [];
}
// ---------------------------------------------------------------------