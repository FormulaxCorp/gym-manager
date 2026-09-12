/* Supabase Client Initialization + Auth
   Gym Member Manager — reuse project Supabase Financial Planner.
   Data gym disimpan di tabel app_data dengan prefix id "gym_..."
   (RLS per user_id sama dengan Fin Planner). */
var SUPABASE_URL = 'https://zstgiptwnqzsvgntsgtz.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpzdGdpcHR3bnF6c3ZnbnRzZ3R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjA1MTcsImV4cCI6MjA5ODQ5NjUxN30.VXQ29HsZdWobZpgfe-sxTjlraePRzeRgRJ0XnKRezOQ';
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var currentUser = null;

var Auth = {
  login: async function(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, message: error.message };
    currentUser = data.user;
    return { success: true, user: data.user };
  },

  register: async function(email, password) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { success: false, message: error.message };
    currentUser = data.user;
    return { success: true, user: data.user, needsConfirm: !data.session };
  },

  logout: async function() {
    await supabase.auth.signOut();
    currentUser = null;
  },

  isLoggedIn: function() { return currentUser !== null; },
  getUser: function() { return currentUser; },
  getUserId: function() { return currentUser ? currentUser.id : null; },
  getUserEmail: function() { return currentUser ? currentUser.email : null; },

  init: async function() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) currentUser = session.user;
    supabase.auth.onAuthStateChange(function(event, session) {
      currentUser = session ? session.user : null;
    });
    return currentUser;
  }
};

console.log('Gym Manager: Supabase + Auth initialized');
