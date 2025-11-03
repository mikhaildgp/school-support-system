import { renderLayout } from './ui/layout.js';

function init() {
  const root = document.getElementById('app');
  if (!root) return;
  renderLayout(root);
  import('./legacy-app.js').catch((err) => {
    const el = document.getElementById('diagStatus');
    if (el) el.textContent = '❌ Failed to load app';
    console.error('Legacy app load error', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
