// main.js
import { supa } from './supa.js';
import { state, saveLocal, loadLocalIfNeeded } from './state.js';
import { renderLayout } from './ui/layout.js';
import { initSystem } from './app/system.js'; // ✅ new

function setDate(el) {
  const today = new Date();
  const options = { weekday:'long', year:'numeric', month:'long', day:'numeric' };
  el.textContent = today.toLocaleDateString('en-US', options);
}

async function boot() {
  const root = document.getElementById('app');
  renderLayout(root);

  // diag helpers
  const diag = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  diag('diagUrl', location.pathname);

  // --- Auth/session
  const session = await supa.getSession();
  diag('diagSess', session ? 'ok' : 'none');

  if (!session) {
    // No session → keep your original behavior
    location.href = 'index.html';
    return;
  }

  state.user = session.user;
  diag('diagUser', session.user?.email || session.user?.id || 'ok');

  // --- Role
  state.role = await supa.getRole(session.user.id);
  diag('diagRole', state.role);

  // --- Date in header
  const dateEl = document.getElementById('currentDate');
  if (dateEl) setDate(dateEl);

  // --- Data bootstrap (local fallback first)
  loadLocalIfNeeded();

  // --- NEW: wire system (week picker, stats panel, diagnostics)
  // This is safe if the hooks are missing—it just skips them gracefully.
  initSystem();

  // --- Show/Hide controls by role
  const adminControls = document.querySelectorAll('.admin-controls');
  const studentControls = document.querySelectorAll('.student-controls');
  adminControls.forEach(el => el.style.display = (state.role === 'parent') ? 'block' : 'none');
  studentControls.forEach(el => el.style.display = (state.role === 'student') ? 'block' : 'none');

  // --- Simple auth UI wiring
  const adminAccessBtn = document.getElementById('adminAccessBtn');
  const loginSection = document.getElementById('loginSection');
  const loginBtn = document.getElementById('loginBtn');
  const cancelLoginBtn = document.getElementById('cancelLoginBtn');

  if (adminAccessBtn && loginSection) {
    adminAccessBtn.onclick = () => {
      loginSection.style.display = (loginSection.style.display === 'block') ? 'none' : 'block';
    };
  }
  if (cancelLoginBtn && loginSection) {
    cancelLoginBtn.onclick = () => { loginSection.style.display = 'none'; };
  }
  if (loginBtn && loginSection) {
    loginBtn.onclick = async () => {
      const pwInput = document.getElementById('adminPassword');
      const pw = (pwInput?.value || '').trim();
      const { data, error } = await supa.client.rpc('check_parent_password', { pw });
      if (!error && data === true) {
        state.role = 'parent';
        const ri = document.getElementById('roleIndicator');
        if (ri) ri.textContent = '👨‍👩‍👧‍👦 Parent Mode';
        adminControls.forEach(el => el.style.display = 'block');
        studentControls.forEach(el => el.style.display = 'none');
        loginSection.style.display = 'none';
        alert('✅ Parent mode activated!');
      } else {
        alert('❌ Incorrect password');
      }
    };
  }

  // Optional: keep state snappy if another tab edits it
  window.addEventListener('storage', (e) => {
    if (e.key === 'app_state') {
      // Reload local cache and re-render system panels
      loadLocalIfNeeded();
      initSystem(); // idempotent re-wire and re-render
    }
  });
}

boot().catch(e => {
  const el = document.getElementById('diagStatus');
  if (el) el.textContent = '❌ ' + (e.message || e);
  console.error(e);
});