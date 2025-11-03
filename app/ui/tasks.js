// app/ui/tasks.js
// -------------------------------------------------------------
// Plug-and-play Tasks module (no external deps beyond state+supa)
// Exposes: initTasks()
// Expect the HTML to have:
//
// <form id="taskForm">
//   <input  id="tTitle" placeholder="Task title" required>
//   <input  id="tTag"   placeholder="Tag/Project (optional)">
//   <select id="tPriority">
//     <option value="M">Medium</option>
//     <option value="H">High</option>
//     <option value="L">Low</option>
//   </select>
//   <input  id="tDue" type="date">
//   <textarea id="tNotes" placeholder="Notes (optional)"></textarea>
//   <button id="tAdd" type="submit">Add</button>
// </form>
//
// <div class="t-toolbar">
//   <select id="tFilterStatus">
//     <option value="all">All</option>
//     <option value="open">Open</option>
//     <option value="done">Done</option>
//   </select>
//   <select id="tFilterPriority">
//     <option value="all">All priorities</option>
//     <option value="H">High</option>
//     <option value="M">Medium</option>
//     <option value="L">Low</option>
//   </select>
//   <input id="tFilterTag" placeholder="Filter by tag/project">
//   <input id="tSearch" placeholder="Search title/notes">
//   <button id="tClearDone">Clear done</button>
//   <button id="tLoadSample">Load sample</button>
// </div>
//
// <ul id="tList" class="t-list"></ul>
//
// -------------------------------------------------------------

import { state, saveLocal } from '../state.js';
import { supa } from '../supa.js';

let $form, $title, $tag, $priority, $due, $notes, $list;
let $filterStatus, $filterPriority, $filterTag, $search, $clearDone, $loadSample;

export function initTasks() {
  if (!Array.isArray(state.data.tasks)) state.data.tasks = [];

  // Cache DOM
  $form           = document.getElementById('taskForm');
  $title          = document.getElementById('tTitle');
  $tag            = document.getElementById('tTag');
  $priority       = document.getElementById('tPriority');
  $due            = document.getElementById('tDue');
  $notes          = document.getElementById('tNotes');
  $list           = document.getElementById('tList');

  $filterStatus   = document.getElementById('tFilterStatus');
  $filterPriority = document.getElementById('tFilterPriority');
  $filterTag      = document.getElementById('tFilterTag');
  $search         = document.getElementById('tSearch');
  $clearDone      = document.getElementById('tClearDone');
  $loadSample     = document.getElementById('tLoadSample');

  // Events
  $form?.addEventListener('submit', onAdd);
  $filterStatus?.addEventListener('change', render);
  $filterPriority?.addEventListener('change', render);
  $filterTag?.addEventListener('input', debounce(render, 150));
  $search?.addEventListener('input', debounce(render, 150));
  $clearDone?.addEventListener('click', clearDone);
  $loadSample?.addEventListener('click', loadSample);

  // First render from local
  render();

  // Best-effort remote sync
  loadTasksFromSupabase().catch(() => {});
}

// -------------------------------------------------------------
// Event handlers
// -------------------------------------------------------------
async function onAdd(e) {
  e?.preventDefault?.();

  const task = {
    id: uid(),
    title: ($title?.value || '').trim(),
    tag: ($tag?.value || '').trim(),
    priority: normalizePriority($priority?.value || 'M'), // H/M/L
    due: normalizeDate($due?.value),
    notes: ($notes?.value || '').trim(),
    done: false,
    created_at: new Date().toISOString(),
    remote_id: null,
  };

  if (!task.title) {
    alert('Please enter a task title');
    return;
  }

  state.data.tasks.push(task);
  saveLocal();
  render();

  if ($form) $form.reset();

  try {
    const rid = await upsertTaskToDB(task);
    if (rid) {
      task.remote_id = rid;
      saveLocal();
    }
  } catch (err) {
    console.warn('Task save failed:', err?.message || err);
  }
}

function onToggleDone(id) {
  const item = state.data.tasks.find((x) => x.id === id);
  if (!item) return;

  item.done = !item.done;
  saveLocal();
  render();
  upsertTaskToDB(item).catch(() => {});
}

function onEdit(id) {
  if (state.role !== 'parent') return; // keep editing to Parent mode for now
  const t = state.data.tasks.find((x) => x.id === id);
  if (!t) return;

  const title = prompt('Title:', t.title);
  if (title === null) return;

  const tag = prompt('Tag/Project:', t.tag ?? '');
  if (tag === null) return;

  const pr = prompt('Priority (H/M/L):', t.priority);
  if (pr === null) return;

  const due = prompt('Due (YYYY-MM-DD):', t.due ?? '');
  if (due === null) return;

  const notes = prompt('Notes:', t.notes ?? '');
  if (notes === null) return;

  t.title = (title || '').trim();
  t.tag = (tag || '').trim();
  t.priority = normalizePriority(pr || 'M');
  t.due = normalizeDate(due || '');
  t.notes = (notes || '').trim();

  saveLocal();
  render();
  upsertTaskToDB(t).catch(() => {});
}

function onDelete(id) {
  const idx = state.data.tasks.findIndex((x) => x.id === id);
  if (idx === -1) return;

  const t = state.data.tasks[idx];
  if (!confirm('Delete this task?')) return;

  state.data.tasks.splice(idx, 1);
  saveLocal();
  render();
  deleteTaskFromDB(t).catch(() => {});
}

// -------------------------------------------------------------
// Actions
// -------------------------------------------------------------
function clearDone() {
  const keep = [];
  const removed = [];
  for (const t of state.data.tasks) {
    if (t.done) removed.push(t);
    else keep.push(t);
  }
  state.data.tasks = keep;
  saveLocal();
  render();
  Promise.allSettled(removed.map(deleteTaskFromDB)).catch(() => {});
}

function loadSample() {
  if (state.role !== 'parent') return;
  const today = new Date();
  const inDays = (n) => toInputDate(addDays(today, n));

  const sample = [
    { title: 'Buy geometry set',      tag: 'School', priority: 'M', due: inDays(1), notes: '' },
    { title: 'Print biology slides',  tag: 'Biology', priority: 'H', due: inDays(2), notes: 'Ask teacher for PDF' },
    { title: 'Clean backpack',        tag: 'Home', priority: 'L', due: '', notes: '' },
  ];

  for (const s of sample) {
    state.data.tasks.push({
      id: uid(),
      title: s.title,
      tag: s.tag,
      priority: normalizePriority(s.priority),
      due: s.due,
      notes: s.notes,
      done: false,
      created_at: new Date().toISOString(),
      remote_id: null,
    });
  }
  saveLocal();
  render();
  Promise.allSettled(state.data.tasks.map(upsertTaskToDB)).catch(() => {});
}

// -------------------------------------------------------------
// Rendering
// -------------------------------------------------------------
function render() {
  if (!$list) return;

  const status = $filterStatus?.value || 'all';
  const pflt = $filterPriority?.value || 'all';
  const tagflt = ($filterTag?.value || '').trim().toLowerCase();
  const q = ($search?.value || '').trim().toLowerCase();

  let items = state.data.tasks.slice();

  if (status === 'open') items = items.filter((x) => !x.done);
  else if (status === 'done') items = items.filter((x) => x.done);

  if (pflt !== 'all') items = items.filter((x) => (x.priority || 'M') === pflt);
  if (tagflt) items = items.filter((x) => (x.tag || '').toLowerCase().includes(tagflt));
  if (q) {
    items = items.filter((x) =>
      (x.title || '').toLowerCase().includes(q) ||
      (x.notes || '').toLowerCase().includes(q)
    );
  }

  // Sort: open first -> priority (H > M > L) -> due (earliest first, empty last) -> title
  const prioRank = { H: 0, M: 1, L: 2 };
  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pa = prioRank[a.priority || 'M'];
    const pb = prioRank[b.priority || 'M'];
    if (pa !== pb) return pa - pb;
    const da = a.due ? new Date(a.due).getTime() : Number.MAX_SAFE_INTEGER;
    const db = b.due ? new Date(b.due).getTime() : Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    return (a.title || '').localeCompare(b.title || '');
  });

  if (!items.length) {
    $list.innerHTML = `<li class="t-empty">No tasks yet.</li>`;
    return;
  }

  const rows = items.map((x) => {
    const due = x.due ? fmtDateShort(x.due) : '—';
    const cls = ['t-item'];
    if (x.done) cls.push('is-done');
    if (x.priority) cls.push(`prio-${x.priority}`);

    return `
<li class="${cls.join(' ')}" data-id="${x.id}">
  <label class="t-check">
    <input type="checkbox" ${x.done ? 'checked' : ''} data-act="toggle">
    <span></span>
  </label>
  <div class="t-main">
    <div class="t-top">
      <span class="t-title">${escapeHtml(x.title)}</span>
      <span class="t-due" title="${escapeHtml(x.due || '')}">${escapeHtml(due)}</span>
    </div>
    <div class="t-meta">
      <span class="t-tag">${escapeHtml(x.tag || '')}</span>
      <span class="t-prio prio-${x.priority}" title="Priority">${prioLabel(x.priority)}</span>
      ${x.notes ? `<span class="t-notes">· ${escapeHtml(x.notes)}</span>` : ''}
    </div>
  </div>
  <div class="t-actions">
    ${state.role === 'parent' ? `<button data-act="edit" title="Edit">✎</button>` : ''}
    <button data-act="delete" title="Delete">🗑</button>
  </div>
</li>`;
  });

  $list.innerHTML = rows.join('');

  // Row actions
  $list.onclick = (ev) => {
    const li = ev.target.closest('li.t-item');
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
// Suggested table: tasks
// Columns:
//   id uuid (PK)
//   user_id uuid
//   local_id text
//   title text
//   tag text
//   priority text   -- 'H' | 'M' | 'L'
//   due date
//   notes text
//   done boolean
//   created_at timestamptz
// Unique index on (user_id, local_id) recommended.
// -------------------------------------------------------------
async function loadTasksFromSupabase() {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  const { data, error } = await client
    .from('tasks')
    .select('id, local_id, title, tag, priority, due, notes, done, created_at')
    .eq('user_id', user.id)
    .order('done', { ascending: true })
    .order('priority', { ascending: true })
    .order('due', { ascending: true })
    .limit(500);

  if (error) throw error;

  const byLocal = Object.create(null);
  for (const r of data || []) byLocal[r.local_id] = r;

  const merged = [];
  const seen = new Set();

  for (const r of data || []) {
    merged.push({
      id: r.local_id || uid(),
      remote_id: r.id,
      title: r.title || '',
      tag: r.tag || '',
      priority: normalizePriority(r.priority || 'M'),
      due: normalizeDate(r.due || ''),
      notes: r.notes || '',
      done: !!r.done,
      created_at: r.created_at || new Date().toISOString(),
    });
    seen.add(r.local_id);
  }

  for (const l of state.data.tasks) {
    if (l.id && !seen.has(l.id)) merged.push(l);
  }

  state.data.tasks = merged;
  saveLocal();
  render();
}

async function upsertTaskToDB(t) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return null;

  const payload = {
    user_id: user.id,
    local_id: t.id,
    title: t.title || null,
    tag: t.tag || null,
    priority: normalizePriority(t.priority || 'M'),
    due: t.due || null,
    notes: t.notes || null,
    done: !!t.done,
    created_at: t.created_at || new Date().toISOString(),
  };

  const { data, error } = await client
    .from('tasks')
    .upsert(payload, { onConflict: 'user_id,local_id' })
    .select('id')
    .single();

  if (error) throw error;
  return data?.id || null;
}

async function deleteTaskFromDB(t) {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  if (t.remote_id) {
    await client.from('tasks').delete().eq('id', t.remote_id).eq('user_id', user.id);
  } else {
    await client.from('tasks').delete().eq('user_id', user.id).eq('local_id', t.id);
  }
}

// -------------------------------------------------------------
// Utils
// -------------------------------------------------------------
function uid() {
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

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function fmtDateShort(s) {
  try {
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).replace(',', '');
  } catch {
    return s || '—';
  }
}

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
}

function normalizePriority(p) {
  const x = String(p || 'M').toUpperCase();
  return x === 'H' || x === 'L' ? x : 'M';
}

function prioLabel(p) {
  const x = normalizePriority(p);
  return x === 'H' ? 'High' : x === 'L' ? 'Low' : 'Medium';
}