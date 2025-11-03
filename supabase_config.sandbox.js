// supabase_config.sandbox.js — local sandbox Supabase client config
//
// This file points the app to the ppdzexhzviketnzansfj Supabase project.
// Keep it out of production builds; only include it when running the sandbox branch.
window.SUPABASE_CONFIG = (function(){
  const url = 'https://ppdzexhzviketnzansfj.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwZHpleGh6dmlrZXRuemFuc2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk3MTI2NjEsImV4cCI6MjA3NTI4ODY2MX0.xp3oXSxZGPSfsMEWYeLf5HNH4GE88tQPl01xkDc24Wo';

  return {
    url,
    anonKey,
    emailRedirectTo: location.origin + '/index.html'
  };
})();
