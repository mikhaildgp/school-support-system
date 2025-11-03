// supabase_config.js — unified client config (sandbox + production)

(function () {
  const host = (window.location.hostname || '').toLowerCase();

  // Detect sandbox/preview/local
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  const isKnownSandboxHost = host.includes('ppdzexhzviketnzansfj'); // your sandbox project host
  const isPreviewHost = /(-git-|preview|sandbox|vercel\.app)/.test(host);
  const isSandbox = isLocal || isKnownSandboxHost || isPreviewHost;

  // Safer origin (handles file:// and odd cases)
  const origin = (window.location.origin && window.location.origin !== 'null')
    ? window.location.origin
    : (isLocal ? 'http://localhost:3000' : 'https://' + host);

  // --- CONFIGS ---
  const SANDBOX = Object.freeze({
    url: 'https://ppdzexhzviketnzansfj.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZHpleGh6dmlrZXRuemFuc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MTI2NjEsImV4cCI6MjA3NTI4ODY2MX0.xp3oXSxZGPSfsMEWYeLf5HNH4GE88tQPl01xkDc24Wo',
    emailRedirectTo: origin + '/index.html'
  });

  const PRODUCTION = Object.freeze({
    url: 'https://bnhctfyinoxhckucsthd.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuaGN0Znlpbm94aGNrdWNzdGhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU1Nzk4NDQsImV4cCI6MjA1MTE1NTg0NH0.xb5p0l_aMqZqH4cW9lK0eYJYT7xN8LZ_Jq3K2YhH9kA',
    emailRedirectTo: origin + '/index.html'
  });

  const cfg = Object.freeze(isSandbox ? SANDBOX : PRODUCTION);

  // Expose under BOTH names to avoid mismatches
  window.SUPABASE_CONFIG = cfg;
  window.__SUPA__ = cfg;

  // Helpful console logs (remove in prod if you want)
  console.log('🔧 Supabase Env:', isSandbox ? 'SANDBOX' : 'PRODUCTION');
  console.log('📍 Hostname:', host);
  console.log('🔗 API URL:', cfg.url);
})();