// app/ui/homework.js
// -------------------------------------------------------------
// Plug-and-play Homework module (no external deps beyond state+supa)
// Exposes: initHomework()
// Expect the HTML to have:
//
// <form id="hwForm">
//   <input id="hwTitle"   placeholder="Title" required>
//   <input id="hwSubject" placeholder="Subject">
//   <input id="hwDue"     type="date">
//   <textarea id="hwNotes" placeholder="Notes (optional)"></textarea>
//   <button id="hwAdd" type="submit">Add</button>
// </form>
//
// <div class="hw-toolbar">
//   <select id="hwFilterStatus">
//     <option value="all">All</option>
//     <option value="open">Open</option>
//     <option value="done">Done</option>
//   </select>
//   <input id="hwFilterSubject" placeholder="Filter by subject">
//   <input id="hwSearch" placeholder="Search title/notes">
//   <button id="hwClearDone">Clear done</button>
//   <button id="hwLoadSample">Load sample</button>
// </div>
//
// <ul id="hwList" class="hw-list"></ul>
//
// -------------------------------------------------------------

import { state, saveLocal } from '../state.js';
import { supa } from '../supa.js';

let $form, $title, $subject, $due, $notes, $list;
let $filterStatus, $filterSubject, $search, $clearDone, $loadSample;

export function initHomework() {
  // Ensure structure exists in state
  if (!Array.isArray(state.data.homework)) state.data.homework = [];

  // Cache DOM
  $form          = document.getElementById('hwForm');
  $title         = document.getElementById('hwTitle');
  $subject       = document.getElementById('hwSubject');
  $due           = document.getElementById('hwDue');
  $notes         = document.getElementById('hwNotes');
  $list          = document.getElementById('hwList');

  $filterStatus  = document.getElementById('hwFilterStatus');
  $filterSubject = document.getElementById('hwFilterSubject');
  $search        = document.getElementById('hwSearch');
  $clearDone     = document.getElementById('hwClearDone');
  $loadSample    = document.getElementById('hwLoadSample');

  // Wire events
  $form?.addEventListener('submit', onAdd);
  $filterStatus?.addEventListener('change', render);
  $filterSubject?.addEventListener('input', debounce(render, 150));
  $search?.addEventListener('input', debounce(render, 150));
  $clearDone?.addEventListener('click', clearDone);
  $loadSample?.addEventListener('click', loadSample);

  // First render from local
  render();

  // Try load from Supabase (non-blocking)
  loadHomeworksFromSupabase().catch(() => {});
}

// -------------------------------------------------------------
// Event handlers
// -------------------------------------------------------------
async function onAdd(e) {
  e?.preventDefault?.();

  const hw = {
    id: uid(),
    title: ($title?.value || '').trim(),
    subject: ($subject?.value || '').trim(),
    due: normalizeDate($due?.value),
    notes: ($notes?.value || '').trim(),
    done: false,
    created_at: new Date().toISOString(),
    remote_id: null, // set after Supabase insert
  };

  if (!hw.title) {
    alert('Please enter a title');
    return;
  }

  state.data.homework.push(hw);
  saveLocal();
  render();

  // Reset form
  if ($form) $form.reset();

  // Best-effort remote save
  try {
    const rid = await upsertHomeworkToDB(hw);
    if (rid) {
      hw.remote_id = rid;
      saveLocal();
    }
  } catch (err) {
    console.warn('Homework save failed:', err?.message || err);
  }
}

function onToggleDone(id) {
  const item = state.data.homework.find((x) => x.id === id);
  if (!item) return;

  item.done = !item.done;
  saveLocal();
  render();

  // Persist remotely (best effort)
  upsertHomeworkToDB(item).catch(() => {});
}

function onEdit(id) {
  if (state.role !== 'parent') return; // edit only in Parent mode
  const item = state.data.homework.find((x) => x.id === id);
  if (!item) return;

  const t = prompt('Title:', item.title);
  if (t === null) return; // cancelled

  const s = prompt('Subject:', item.subject ?? '');
  if (s === null) return;

  const d = prompt('Due date (YYYY-MM-DD):', item.due ?? '');
  if (d === null) return;

  const n = prompt('Notes:', item.notes ?? '');
  if (n === null) return;

  item.title = (t || '').trim();
  item.subject = (s || '').trim();
  item.due = normalizeDate(d || '');
  item.notes = (n || '').trim();

  saveLocal();
  render();

  upsertHomeworkToDB(item).catch(() => {});
}

function onDelete(id) {
  const idx = state.data.homework.findIndex((x) => x.id === id);
  if (idx === -1) return;

  const item = state.data.homework[idx];
  if (!confirm('Delete this homework?')) return;

  state.data.homework.splice(idx, 1);
  saveLocal();
  render();

  deleteHomeworkFromDB(item).catch(() => {});
}

// -------------------------------------------------------------
// Actions
// -------------------------------------------------------------
function clearDone() {
  const keep = [];
  const removed = [];
  for (const hw of state.data.homework) {
    if (hw.done) removed.push(hw);
    else keep.push(hw);
  }
  state.data.homework = keep;
  saveLocal();
  render();

  // Best effort remote deletes
  Promise.allSettled(removed.map(deleteHomeworkFromDB)).catch(() => {});
}

function loadSample() {
  if (state.role !== 'parent') return;

  const today = new Date();
  const inDays = (n) => toInputDate(addDays(today, n));

  const sample = [
    { title: 'Math — exercise 12–18', subject: 'Math',    due: inDays(2), notes: 'Algebra — linear equations' },
    { title: 'English — read ch. 3',  subject: 'English', due: inDays(1), notes: 'Make short summary' },
    { title: 'Biology — lab prep',    subject: 'Biology', due: inDays(5), notes: 'Bring gloves' },
  ];

  for (const s of sample) {
    state.data.homework.push({
      id: uid(),
      title: s.title,
      subject: s.subject,
      due: s.due,
      notes: s.notes,
      done: false,
      created_at: new Date().toISOString(),
      remote_id: null,
    });
  }
  saveLocal();
  render();

  // Fire-and-forget remote sync
  Promise.allSettled(state.data.homework.map(upsertHomeworkToDB)).catch(() => {});
}

// -------------------------------------------------------------
// Rendering
// -------------------------------------------------------------
function render() {
  if (!$list) return;

  const status = $filterStatus?.value || 'all';
  const subjFilter = ($filterSubject?.value || '').trim().toLowerCase();
  const q = ($search?.value || '').trim().toLowerCase();

  // Filter
  let items = state.data.homework.slice();

  if (status === 'open') items = items.filter((x) => !x.done);
  else if (status === 'done') items = items.filter((x) => x.done);

  if (subjFilter) items = items.filter((x) => (x.subject || '').toLowerCase().includes(subjFilter));
  if (q) {
    items = items.filter((x) =>
      (x.title || '').toLowerCase().includes(q) ||
      (x.notes || '').toLowerCase().includes(q)
    );
  }

  // Sort: open first, then by due date (empty last), then title
  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = a.due ? new Date(a.due).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.due ? new Date(b.due).getTime() : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return (a.title || '').localeCompare(b.title || '');
  });

  // Render
  if (!items.length) {
    $list.innerHTML = `<li class="hw-empty">No homework yet.</li>`;
    return;
  }

  const rows = items.map((x) => {
    const due = x.due ? fmtDateShort(x.due) : '—';
    const cls = ['hw-item'];
    if (x.done) cls.push('is-done');

    return `
<li class="${cls.join(' ')}" data-id="${x.id}">
  <label class="hw-check">
    <input type="checkbox" ${x.done ? 'checked' : ''} data-act="toggle">
    <span></span>
  </label>
  <div class="hw-main">
    <div class="hw-top">
      <span class="hw-title">${escapeHtml(x.title)}</span>
      <span class="hw-due" title="${escapeHtml(x.due || '')}">${escapeHtml(due)}</span>
    </div>
    <div class="hw-meta">
      <span class="hw-subject">${escapeHtml(x.subject || '')}</span>
      ${x.notes ? `<span class="hw-notes">· ${escapeHtml(x.notes)}</span>` : ''}
    </div>
  </div>
  <div class="hw-actions">
    ${state.role === 'parent' ? `<button data-act="edit"  title="Edit">✎</button>` : ''}
    <button data-act="delete" title="Delete">🗑</button>
  </div>
</li>`;
  });

  $list.innerHTML = rows.join('');

  // Wire row actions (event delegation)
  $list.onclick = (ev) => {
    const li = ev.target.closest('li.hw-item');
    if (!li) return;
    const id = li.getAttribute('data-id');
    const act = ev.target.getAttribute('data-act');

    if (act === 'toggle') onToggleDone(id);
    else if (act === 'edit') onEdit(id);
    else if (act === 'delete') onDelete(id);
  };
}

// -------------------------------------------------------------
// Supabase
// Suggested table: homeworks
// Columns:
//   id uuid (PK)                 — server id
//   user_id uuid                 — owner
//   local_id text                — client-generated id (uid())
//   title text
//   subject text
//   due date
//   notes text
//   done boolean
//   created_at timestamptz
// Unique index on (user_id, local_id) recommended.
// -------------------------------------------------------------
async function loadHomeworksFromSupabase() {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  const { data, error } = await client
    .from('homeworks')
    .select('id, local_id, title, subject, due, notes, done, created_at')
    .eq('user_id', user.id)
    .order('done', { ascending: true })
    .order('due', { ascending: true })
    .limit(500);

  if (error) throw error;

  // Merge: prefer remote data; keep local items not on server yet
  const byLocalId = Object.create(null);
  for (const r of data || []) byLocalId[r.local_id] = r;

  const merged = [];
  const seenLocal = new Set();

  // Take remote rows first
  for (const r of data || []) {
    merged.push({
      id: r.local_id || uid(),          // keep using local id for UI
      remote_id: r.id,
      title: r.title || '',
      subject: r.subject || '',
      due: normalizeDate(r.due || ''),
      notes: r.notes || '',
      done: !!r.done,
      created_at: r.created_at || new Date().toISOString(),
    });
    seenLocal.add(r.local_id);
  }

  // Add locals that aren't on server yet
  for (const l of state.data.homework) {
    if (l.id && !seenLocal.has(l.id)) merged.push(l);
  }

  state.data.homework = merged;
  saveLocal();
  render();
}

async function upsertHomeworkToDB(hw) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return null;

  const payload = {
    user_id: user.id,
    local_id: hw.id,
    title: hw.title || null,
    subject: hw.subject || null,
    due: hw.due || null, // YYYY-MM-DD
    notes: hw.notes || null,
    done: !!hw.done,
    created_at: hw.created_at || new Date().toISOString(),
  };

  // Upsert by (user_id, local_id)
  const { data, error } = await client
    .from('homeworks')
    .upsert(payload, { onConflict: 'user_id,local_id' })
    .select('id')
    .single();

  if (error) throw error;
  return data?.id || null;
}

async function deleteHomeworkFromDB(hw) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  // Prefer server id; fallback to local_id filter
  if (hw.remote_id) {
    await client.from('homeworks').delete().eq('id', hw.remote_id).eq('user_id', user.id);
  } else {
    await client.from('homeworks').delete().eq('user_id', user.id).eq('local_id', hw.id);
  }
}

// -------------------------------------------------------------
// Utils
// -------------------------------------------------------------
function uid() {
  // 16-char url-safe id
  return 'xxxxxxxxxxxxxxxx'.replace(/x/g, () =>
    (Math.random() * 36 | 0).toString(36)
  );
}

function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeDate(s) {
  if (!s) return '';
  // Accept YYYY-MM-DD or Date string; return YYYY-MM-DD
  const d = typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    ? new Date(s + 'T00:00:00')
    : new Date(s);
  if (isNaN(d)) return '';
  return toInputDate(d);
}

function toInputDate(d) {
  const Y = d.getFullYear();
  const M = String(d.getMonth() + 1).padStart(2, '0');
  const D = String(d.getDate()).padStart(2, '0');
  return `${Y}-${M}-${D}`;
}

function fmtDateShort(s) {
  // s is YYYY-MM-DD
  try {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(',', '');
  } catch {
    return s || '—';
  }
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}