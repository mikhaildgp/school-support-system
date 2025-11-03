// app/ui/subjects.js
// -------------------------------------------------------------
// Plug-and-play Subjects & Themes module
// Exposes: initSubjects()
// Tables assumed: subjects(id, name), themes(id, subject_id, title, description, self_assessment)
// -------------------------------------------------------------

import { state, saveLocal } from '../state.js';
import { supa } from '../supa.js';

export function initSubjects() {
  if (!Array.isArray(state.data.subjects)) state.data.subjects = [];

  renderSubjects();

  // Try to load from Supabase in background
  loadSubjectsFromSupabase().catch(() => {});
}

// -------------------------------------------------------------
// Rendering
// -------------------------------------------------------------
function renderSubjects() {
  const container = document.getElementById('subjectsList');
  if (!container) return;
  container.innerHTML = '';

  for (const subject of state.data.subjects) {
    const subjEl = document.createElement('div');
    subjEl.className = 'subject-item';

    const themesHTML = (subject.themes || [])
      .map((theme) => renderThemeBlock(subject, theme))
      .join('');

    const canAddTheme = state.role === 'parent' || state.role === 'student';
    const addRow = canAddTheme
      ? `
      <div style="margin-top:8px;">
        <a href="javascript:void(0)" onclick="window.addThemeUI?.('${subject.id}')"
           style="font-size:0.85em; color:#667eea; text-decoration:underline;">+ Add Theme</a>
        <div id="addThemeRow-${subject.id}" style="display:none;margin-top:6px;">
          <input type="text" class="input-field" id="newTheme-${subject.id}" placeholder="Theme title" style="width:70%;">
          <button class="add-button" style="padding:4px 10px;font-size:.8em;"
                  onclick="window.addThemeForSubject?.('${subject.id}')">Add</button>
        </div>
      </div>`
      : '';

    subjEl.innerHTML = `
      <div class="subject-item-name">${escapeHtml(subject.name || '')}</div>
      ${themesHTML}
      ${addRow}
    `;
    container.appendChild(subjEl);

    // Render photos asynchronously (no blocking)
    for (const th of subject.themes || []) {
      renderThemePhotos(th.id);
    }
  }
}

// Renders a single theme block as HTML string
function renderThemeBlock(subject, theme) {
  const ratingPct = ratingToPercent(theme.self_assessment);
  const desc = escapeHtml(theme.description || '');
  const editable = state.role === 'parent' || state.role === 'student';

  return `
  <div class="theme-item">
    <div class="theme-top">
      <strong>${escapeHtml(theme.title || '')}</strong>
      <span class="theme-rating">${ratingPct}%</span>
    </div>

    <div class="progress-bar">
      <div class="progress-fill" style="width:${ratingPct}%"></div>
    </div>

    ${
      editable
        ? `
      <input type="range" min="1" max="5" step="1" value="${
        theme.self_assessment || 1
      }" onchange="window.updateThemeRating?.('${subject.id}', '${theme.id}', this.value)">
      <textarea class="input-field" rows="2" placeholder="Add description..."
                onchange="window.updateThemeDescription?.('${theme.id}', this.value)">${desc}</textarea>
      `
        : `<p style="margin:4px 0 8px 0;font-size:.9em;opacity:.8">${desc || '—'}</p>`
    }

    <div id="theme-photos-${theme.id}" class="photo-gallery"></div>

    ${
      editable
        ? `<input type="file" id="photoInput-${theme.id}" class="photo-input" accept="image/*"
             onchange="window.handleThemePhotoUpload?.('${theme.id}', this)">
           <button class="photo-button" onclick="document.getElementById('photoInput-${theme.id}').click()">📷 Upload Photo</button>`
        : ''
    }
  </div>`;
}

// -------------------------------------------------------------
// CRUD Operations
// -------------------------------------------------------------
export async function loadSubjectsFromSupabase() {
  const client = supa?.client;
  const user = state?.user;
  if (!client || !user) return;

  const { data, error } = await client
    .from('subjects')
    .select('id, name, themes(id, title, description, self_assessment)')
    .order('name', { ascending: true });

  if (error) {
    console.error('Error loading subjects:', error);
    return;
  }

  state.data.subjects = (data || []).map((s) => ({
    id: s.id,
    name: s.name,
    themes: (s.themes || []).map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description || '',
      self_assessment: t.self_assessment || 0,
    })),
  }));
  saveLocal();
  renderSubjects();
}

export async function updateThemeRating(subjectId, themeId, rating) {
  rating = clampRating(rating);

  const subj = state.data.subjects.find((s) => s.id === subjectId);
  const theme = subj?.themes?.find((t) => t.id === themeId);
  if (!theme) return alert('Theme not found');

  theme.self_assessment = rating;
  saveLocal();
  renderSubjects();

  try {
    const { error } = await supa.client
      .from('themes')
      .update({ self_assessment: rating })
      .eq('id', themeId);
    if (error) throw error;
  } catch (err) {
    console.error('❌ Failed to update theme rating', err);
  }
}

export async function updateThemeDescription(themeId, value) {
  const desc = value.trim();
  const found = findThemeById(themeId);
  if (!found) return;

  found.description = desc;
  saveLocal();
  renderSubjects();

  try {
    const { error } = await supa.client
      .from('themes')
      .update({ description: desc })
      .eq('id', themeId);
    if (error) throw error;
  } catch (err) {
    console.error('❌ Failed to update description', err);
  }
}

// Add new theme for a subject
export async function addThemeForSubject(subjectId) {
  const input = document.getElementById(`newTheme-${subjectId}`);
  if (!input) return;
  const title = input.value.trim();
  if (!title) return;

  const subj = state.data.subjects.find((s) => s.id === subjectId);
  if (!subj) return;

  const newTheme = {
    id: uid(),
    title,
    description: '',
    self_assessment: 1,
  };
  subj.themes = subj.themes || [];
  subj.themes.push(newTheme);
  saveLocal();
  renderSubjects();

  input.value = '';

  try {
    const { data, error } = await supa.client
      .from('themes')
      .insert({ subject_id: subjectId, title })
      .select('id')
      .single();
    if (!error && data?.id) newTheme.id = data.id;
  } catch (err) {
    console.warn('Add theme (remote) failed:', err);
  }
}

// Add UI toggle
export function addThemeUI(subjectId) {
  const row = document.getElementById(`addThemeRow-${subjectId}`);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? 'flex' : 'none';
}

// -------------------------------------------------------------
// Optional: Theme Photos (safe stubs)
// -------------------------------------------------------------
export async function handleThemePhotoUpload(themeId, inputEl) {
  const file = inputEl.files?.[0];
  inputEl.value = '';
  if (!file) return;
  alert('📷 Theme photo upload is not yet implemented.');
}

export async function renderThemePhotos(themeId) {
  const gallery = document.getElementById(`theme-photos-${themeId}`);
  if (gallery) gallery.innerHTML = '';
  // (Add implementation later)
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------
function findThemeById(id) {
  for (const s of state.data.subjects) {
    const t = s.themes?.find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

function ratingToPercent(val) {
  const n = Number(val) || 0;
  return Math.round((n / 5) * 100);
}

function clampRating(v) {
  v = Number(v);
  if (isNaN(v)) return 1;
  return Math.min(5, Math.max(1, v));
}

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