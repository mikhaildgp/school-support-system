// app/supa.js
// Uses the Supabase CDN loaded in index.html and the globals from supabase_config.js

export const supa = (() => {
  // --- Safety checks ---
  if (!window.SUPABASE_CONFIG && !window.__SUPA__) {
    throw new Error('Supabase config not found. Make sure <script src="supabase_config.js"></script> is loaded BEFORE app/main.js.');
  }
  const CFG = window.SUPABASE_CONFIG || window.__SUPA__;

  if (!window.supabase?.createClient) {
    throw new Error('Supabase CDN not available. Ensure @supabase/supabase-js@2 is loaded in index.html before this module.');
  }

  // --- Client ---
  const client = window.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // handle magic links / OAuth redirects
    },
  });

  // --- Small utilities ---
  async function getSession() {
    const { data: { session }, error } = await client.auth.getSession();
    if (error) console.warn('getSession error:', error);
    return session || null;
  }

  async function getUser() {
    const { data: { user }, error } = await client.auth.getUser();
    if (error) console.warn('getUser error:', error);
    return user || null;
  }

  async function getRole(userId) {
    if (!userId) return 'student';
    const { data, error } = await client
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (error) {
      console.warn('getRole error:', error);
      return 'student';
    }
    // Normalize: "admin" in DB becomes "parent" in UI; else pass-through with default "student"
    return (data?.role === 'admin') ? 'parent' : (data?.role || 'student');
  }

  // --- Auth helpers you may want soon ---
  async function signInWithEmail(email) {
    // Passwordless magic-link by default; switch to OTP/password if you prefer later
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: CFG.emailRedirectTo }
    });
    if (error) throw error;
    return true;
  }

  async function signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    return true;
  }

  // subscribe to auth state changes (optional wiring in main.js)
  function onAuthStateChange(cb) {
    const { data: sub } = client.auth.onAuthStateChange((event, session) => cb?.(event, session));
    return () => sub.subscription?.unsubscribe?.();
  }

  // Example RPC passthrough used in your main.js
  async function checkParentPassword(pw) {
    const { data, error } = await client.rpc('check_parent_password', { pw });
    if (error) throw error;
    return !!data;
  }

  return {
    client,
    // session / user / role
    getSession,
    getUser,
    getRole,
    // auth
    signInWithEmail,
    signOut,
    onAuthStateChange,
    // rpc
    checkParentPassword,
  };
})();