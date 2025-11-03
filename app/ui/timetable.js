// app/ui/timetable.js
// -------------------------------------------------------------
// Plug-and-play timetable module (no external deps beyond state+supa)
// Exposes: initTimetable()
// -------------------------------------------------------------

import { state, saveLocal } from '../state.js';
import { supa } from '../supa.js';

// --- Basic config: adjust if your school uses different layout ---
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];   // 5-day week
const SLOTS_PER_DAY = 8;                            // lessons per day (rows)

// Keep week offset within this module (0 = current week)
let weekOffset = 0;

// Cached DOM nodes (set in init)
let $table, $label, $prevBtn, $nextBtn, $clearBtn, $loadBtn;

// -------------------------------------------------------------
// Public API
// -------------------------------------------------------------
export function initTimetable() {
  // Ensure structure exists in state
  if (!state.data.timetable || typeof state.data.timetable !== 'object') {
    state.data.timetable = {};
  }

  // Grab elements created in layout.js
  $table   = document.getElementById('timetable');
  $label   = document.getElementById('currentWeek');
  $prevBtn = document.getElementById('prevWeekBtn');
  $nextBtn = document.getElementById('nextWeekBtn');
  $clearBtn= document.getElementById('clearTT');
  $loadBtn = document.getElementById('loadTT');

  // Wire controls
  $prevBtn?.addEventListener('click', () => changeWeek(-1));
  $nextBtn?.addEventListener('click', () => changeWeek(+1));
  $clearBtn?.addEventListener('click', clearTimetable);
  $loadBtn?.addEventListener('click', loadSampleTimetable);

  // First render
  updateCurrentWeekDisplay();
  renderTimetable();

  // Try loading from Supabase (non-blocking). Local state is shown first.
  loadTimetableFromSupabase().catch(() => {
    // Silently ignore if not configured or table missing.
  });
}

// -------------------------------------------------------------
// Rendering
// -------------------------------------------------------------
function renderTimetable() {
  if (!$table) return;

  const weekKey = getWeekKey(weekOffset);
  const week = ensureWeekMatrix(weekKey);

  // Build table HTML
  let html = '';
  html += '<thead><tr><th style="width:72px;">#</th>';
  for (const d of DAYS) html += `<th>${escapeHtml(d)}</th>`;
  html += '</tr></thead><tbody>';

  for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
    html += `<tr><th>${slot + 1}</th>`;
    for (let day = 0; day < DAYS.length; day++) {
      const val = week[day][slot] || '';
      html += `<td data-day="${day}" data-slot="${slot}" class="tt-cell">${escapeHtml(val)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody>';

  $table.innerHTML = html;

  // Click-to-edit (parents only)
  const cells = $table.querySelectorAll('.tt-cell');
  cells.forEach((td) => {
    td.addEventListener('click', async (e) => {
      if (state.role !== 'parent') return; // only in Parent mode
      const day = Number(td.getAttribute('data-day'));
      const slot = Number(td.getAttribute('data-slot'));
      const current = week[day][slot] || '';
      const next = prompt('Subject (leave empty to clear):', current) ?? current;
      const trimmed = next.trim();

      // Update local state
      week[day][slot] = trimmed || '';
      state.data.timetable[weekKey] = week;
      saveLocal();

      // Update cell UI immediately
      td.textContent = trimmed;

      // Persist remotely (best effort)
      try {
        if (trimmed) {
          const subjId = await upsertSubjectByName(trimmed);
          await saveTimetableCellToDB({ weekKey, day, slot, subject_name: trimmed, subject_id: subjId });
        } else {
          await deleteScheduleEntry({ weekKey, day, slot });
        }
      } catch (err) {
        console.warn('Timetable remote save failed:', err?.message || err);
      }
    });
  });
}

function updateCurrentWeekDisplay() {
  if (!$label) return;
  const { start, end } = getWeekRange(weekOffset);
  const fmt = (d) =>
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(',', '');
  const year = start.getFullYear();
  const sameYear = start.getFullYear() === end.getFullYear();
  const range = `${fmt(start)}${sameYear ? '' : ' ' + year} – ${fmt(end)} ${end.getFullYear()}`;
  $label.textContent = `Week: ${range}`;
}

function changeWeek(delta) {
  weekOffset += delta;
  updateCurrentWeekDisplay();
  renderTimetable();
}

// -------------------------------------------------------------
// Local data helpers
// -------------------------------------------------------------
function ensureWeekMatrix(weekKey) {
  // matrix[day][slot] => string subject
  if (!state.data.timetable[weekKey]) {
    const m = Array.from({ length: DAYS.length }, () => Array(SLOTS_PER_DAY).fill(''));
    state.data.timetable[weekKey] = m;
  }
  return state.data.timetable[weekKey];
}

function clearTimetable() {
  if (state.role !== 'parent') return;
  const weekKey = getWeekKey(weekOffset);
  if (!confirm('Delete the entire study plan for this week?')) return;

  state.data.timetable[weekKey] = Array.from({ length: DAYS.length }, () => Array(SLOTS_PER_DAY).fill(''));
  saveLocal();
  renderTimetable();

  // Best effort remote clear
  deleteWholeWeekFromDB(weekKey).catch(() => {});
}

function loadSampleTimetable() {
  if (state.role !== 'parent') return;
  const weekKey = getWeekKey(weekOffset);

  // Simple example template — adjust to your needs
  const template = [
    // Mon..Fri columns per row
    ['Math', 'English', 'Biology', 'History', 'PE', '', '', ''],
    ['Physics', 'Math', 'Chemistry', 'Geography', 'English', '', '', ''],
    ['IT', 'German', 'Math', 'History', 'Art', '', '', ''],
    ['English', 'Biology', 'Physics', 'Math', 'Music', '', '', ''],
    ['Chemistry', 'PE', 'German', 'English', 'IT', '', '', ''],
  ];

  const week = ensureWeekMatrix(weekKey);
  for (let day = 0; day < DAYS.length; day++) {
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      week[day][slot] = template[day]?.[slot] || '';
    }
  }
  state.data.timetable[weekKey] = week;
  saveLocal();
  renderTimetable();

  // Push to DB (best effort, fire-and-forget)
  syncWholeWeekToDB(weekKey, week).catch(() => {});
}

// -------------------------------------------------------------
// Supabase (best-effort; safe if not configured)
// Tables (suggested):
//   - subjects: { id uuid, name text unique }
//   - schedule: { id uuid, user_id uuid, week_key text, day int, slot int, subject_id uuid, subject_name text }
// Replace names to match your schema if needed.
// -------------------------------------------------------------
async function loadTimetableFromSupabase() {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  // Only load the visible week (fast path). You can extend to preload prev/next.
  const weekKey = getWeekKey(weekOffset);
  const { data, error } = await client
    .from('schedule')
    .select('day, slot, subject_name')
    .eq('user_id', user.id)
    .eq('week_key', weekKey);

  if (error) throw error;

  const week = ensureWeekMatrix(weekKey);
  // Fill with blanks first
  for (let d = 0; d < DAYS.length; d++) for (let s = 0; s < SLOTS_PER_DAY; s++) week[d][s] = '';

  for (const row of data || []) {
    const { day, slot, subject_name } = row;
    if (isFinite(day) && isFinite(slot) && week[day]?.[slot] !== undefined) {
      week[day][slot] = subject_name || '';
    }
  }
  state.data.timetable[weekKey] = week;
  saveLocal();
  renderTimetable();
}

async function upsertSubjectByName(name) {
  const client = supa?.client;
  if (!client || !name) return null;

  // Try to find existing subject
  let { data: found, error: findErr } = await client
    .from('subjects')
    .select('id,name')
    .ilike('name', name)
    .limit(1)
    .maybeSingle();

  if (findErr && findErr.code !== 'PGRST116') throw findErr; // ignore "no rows"

  if (found?.id) return found.id;

  // Insert new one
  const { data: ins, error: insErr } = await client
    .from('subjects')
    .insert({ name })
    .select('id')
    .single();

  if (insErr) throw insErr;
  return ins?.id || null;
}

async function saveTimetableCellToDB({ weekKey, day, slot, subject_name, subject_id }) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  // Upsert on (user_id, week_key, day, slot)
  const { error } = await client
    .from('schedule')
    .upsert(
      {
        user_id: user.id,
        week_key: weekKey,
        day,
        slot,
        subject_id: subject_id || null,
        subject_name: subject_name || null,
      },
      { onConflict: 'user_id,week_key,day,slot' }
    );

  if (error) throw error;
}

async function deleteScheduleEntry({ weekKey, day, slot }) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  const { error } = await client
    .from('schedule')
    .delete()
    .eq('user_id', user.id)
    .eq('week_key', weekKey)
    .eq('day', day)
    .eq('slot', slot);

  if (error) throw error;
}

async function deleteWholeWeekFromDB(weekKey) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  await client
    .from('schedule')
    .delete()
    .eq('user_id', user.id)
    .eq('week_key', weekKey);
}

async function syncWholeWeekToDB(weekKey, matrix) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  // Flatten matrix to rows; ignore empty cells
  const rows = [];
  for (let d = 0; d < DAYS.length; d++) {
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const name = (matrix[d][s] || '').trim();
      if (!name) continue;
      rows.push({ day: d, slot: s, subject_name: name });
    }
  }

  // Upsert in small batches to be safe
  for (const row of rows) {
    let subjId = null;
    try { subjId = await upsertSubjectByName(row.subject_name); } catch {}
    await saveTimetableCellToDB({
      weekKey,
      day: row.day,
      slot: row.slot,
      subject_name: row.subject_name,
      subject_id: subjId
    });
  }
}

// -------------------------------------------------------------
// Week helpers
// -------------------------------------------------------------
function getWeekKey(offset = 0) {
  const monday = getMondayOfISOWeek(offset);
  const { year, week } = getISOYearWeek(monday);
  // Example key: "2025-W45"
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getWeekRange(offset = 0) {
  const monday = getMondayOfISOWeek(offset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

function getMondayOfISOWeek(offset = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // Get current monday
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -6 : 1 - day); // days to go back to Monday
  d.setDate(d.getDate() + diff);
  // Apply week offset
  d.setDate(d.getDate() + offset * 7);
  return d;
}

function getISOYearWeek(date) {
  // ISO week number algorithm
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Thursday in current week decides the year
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

// -------------------------------------------------------------
// Utils
// -------------------------------------------------------------
function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}