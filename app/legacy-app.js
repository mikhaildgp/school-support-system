import { supa } from './supa.js';
// Initialize Supabase client
        const supabase = supa.client;
// ---- Auth bootstrap (injected) ----
(function(){
  const $id = (id)=>document.getElementById(id);
  function logDiag(k, v){
    const el = $id(k); if (el) el.textContent = v;
  }
  async function fetchRoleAndApply(user){
    try{
      const { data: prof, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (error) { logDiag('diagRole', 'err'); return 'student'; }
      const role = prof?.role || 'student';
      logDiag('diagRole', role);
      window.currentRole = (role === 'admin') ? 'parent' : role; // normalize legacy
      if (typeof window.updateRoleDisplay === 'function') window.updateRoleDisplay();
      return window.currentRole;
    }catch(e){
      logDiag('diagRole', 'err');
      return 'student';
    }
  }

  async function boot(){
    try{
      logDiag('diagUrl', location.pathname);
      if (!window.supabase || !window.SUPABASE_CONFIG){ logDiag('diagStatus','❌ config/js'); return; }

      // If a hash token is present (rare after index.html), set it
      if (location.hash.includes('access_token')){
        const p = new URLSearchParams(location.hash.slice(1));
        const access_token = p.get('access_token');
        const refresh_token = p.get('refresh_token');
        if (access_token && refresh_token){
          await supabase.auth.setSession({ access_token, refresh_token });
          if (history.replaceState) history.replaceState({}, document.title, location.pathname);
        }
      }

      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      logDiag('diagSess', session ? 'ok' : 'none');
      // 🔍 Debug: log session role + user
      if (session) {
        console.log("🔍 Session debug:", {
          user: session.user,
          access_token: session.access_token ? "present" : "none",
          role: session.user?.role || "(no role field)"
        });
      }
      // We have a session
      logDiag('diagStatus', '✅');
      logDiag('diagUser', session.user?.email || session.user?.id || 'ok');

      const emailLocal = (session.user?.email || 'user').split('@')[0];
      const { data: existing } = await supabase
        .from('profiles')
        .select('id, role, display_name')
        .eq('id', session.user.id)
        .single();

      if (!existing) {
        // first time -> create a row with default role
        await supabase.from('profiles').insert({
          id: session.user.id,
          role: 'student',
          display_name: emailLocal
        });
      } else if (!existing.display_name) {
        // keep current role, only backfill missing display_name
        await supabase.from('profiles')
          .update({ display_name: emailLocal })
          .eq('id', session.user.id);
      }



      // Ensure role
      await fetchRoleAndApply(session.user);
      refreshDiagRole();

      // Wire auth state to keep UI fresh
      supabase.auth.onAuthStateChange(async (ev, sess) => {
        logDiag('diagSess', sess ? 'ok' : 'none');
        if (sess?.user){ 
          logDiag('diagUser', sess.user.email || sess.user.id);
          await fetchRoleAndApply(sess.user);
          refreshDiagRole();
        }
      });
    }catch(e){
      logDiag('diagStatus', '❌ ' + (e.message || e));
    }
  }
  if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();


        
        // Check authentication immediately
        (async function checkAuth() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                // Not logged in - redirect to index which will handle routing
                window.location.href = 'index.html';
                return;
            }
            // User is authenticated - continue with app initialization
        })();
        
        // Logout function
        async function logout() {
            try {
                const { error } = await supabase.auth.signOut();
                if (error) throw error;
                
                // Clear any local data
                localStorage.clear();
                
                // Redirect to index which will send to login
                window.location.href = 'index.html';
            } catch (error) {
                console.error('Logout error:', error);
                alert('Error logging out: ' + error.message);
            }
        }
        
// ---- Role bootstrap using Supabase profiles.role ----
let currentUserId = null;
async function bootstrapRole(){
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // Not logged in -> send to index page
    window.location.href = 'index.html';
    return;
  }
  currentUserId = user.id;
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (error) {
    console.error('Profile role fetch error', error);
  }
  // Default to student if missing
  currentRole = (profile && profile.role) ? profile.role : 'student';
  window.currentRole = currentRole;
  updateRoleDisplay();
}

async function refreshDiagRole(){
  try{
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const uiRole = (window.currentRole ?? (typeof currentRole !== 'undefined' ? currentRole : '')) || '';
    const dbRole = prof?.role || '(none)';
    const text = uiRole && uiRole !== dbRole ? `${uiRole} (db: ${dbRole})` : (uiRole || dbRole);
    const el = document.getElementById('diagRole');
    if (el) el.textContent = text;
  }catch(_e){}
}

// Data storage (will be populated from Supabase)
        let data = {
            subjects: [],
            homework: [],
            todayTasks: [],
            allTasks: [],
            completedTasksWeek: 0,
            completedHomeworkWeek: 0,
            timetable: {} // Will store schedule data
        };
        const themeEditMode = new Map(); // key: themeId(string) -> boolean

        function isThemeEditing(themeId){
            return themeEditMode.get(String(themeId)) === true;
        }

        function toggleThemeEdit(themeId){
            const key = String(themeId);
            themeEditMode.set(key, !isThemeEditing(key));
            // Re-render subjects only (no recursion here)
            renderSubjects();
        }

        // System Health tracking
        let systemHealth = {
            lastSync: null,
            lastError: null,
            dbConnected: false,
            storageAvailable: false,
            sessionStart: new Date(),
            syncCount: 0,
            errorCount: 0
        };

        // Authentication state
        let currentUser = null;

        // User role management
        let currentRole = 'student'; // 'student' or 'admin'
        let taskViewMode = 'today';
        let nextLocalTaskId = 0;

        // Timetable management
        let currentWeekOffset = 0;
        let selectedTimeSlot = null;
        let timeSlots = [
            '08:00-08:40',  // 1
            '08:45-09:30',  // 2
            '09:50-10:35',  // 3
            '10:35-11:20',  // 4
            '11:40-12:25',  // 5
            '12:25-13:10',  // 6
            '13:10-14:00',  // 7
            '14:00-14:45',  // 8
            '14:45-15:30'   // 9
        ];
        let weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

        // ===== DATA LAYER ABSTRACTION =====
        // Supabase data operations to replace localStorage

        // Authentication helpers
        async function getCurrentUser() {
            const { data: { user } } = await supabase.auth.getUser();
            return user;
        }

        async function ensureAuthenticated() {
            const user = await getCurrentUser();
            if (!user) {
                // Redirect to authentication if needed
                console.warn('User not authenticated');
                return false;
            }
            currentUser = user;
            return true;
        }

        // Data loading functions
        async function loadSubjectsFromSupabase() {
            const { data: subjects, error } = await supabase
                .from('subjects')
                .select('*')
                .order('created_at');
            
            if (error) {
                console.error('Error loading subjects:', error);
                return [];
            }
            
            return subjects || [];
        }

        async function loadThemesFromSupabase() {
            const { data: themes, error } = await supabase
                .from('themes')
                .select('*')
                .order('created_at');
            
            if (error) {
                console.error('Error loading themes:', error);
                return [];
            }
            
            return themes || [];
        }

        async function loadHomeworkFromSupabase() {
            const { data: homework, error } = await supabase
                .from('homework')
                .select('*, subjects(name)')
                .order('due_date');
            
            if (error) {
                console.error('Error loading homework:', error);
                return [];
            }
            
            return homework || [];
        }

        async function loadTasksFromSupabase() {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, description, due_date, status, assigned_by, approved_at, created_at')
    .order('created_at', { ascending: true });

  if (error) { console.error('Error loading tasks:', error); return []; }
  return tasks || [];
}

    async function loadTimetableFromSupabase() {
    const { data: schedule, error } = await supabase
        .from('class_schedule')
        .select('weekday, time_slot, subject_id, room, teacher, is_double, subjects(name)')
        .order('weekday', { ascending: true })
        .order('time_slot', { ascending: true });

    if (error) {
        console.error('Error loading timetable:', error);
        return {};
    }

    const timetable = {};
    const toKey = (day, uiIndex) => `${day}_${uiIndex}`;

    (schedule || []).forEach(entry => {
        const uiIndex = (entry.time_slot ?? 1) - 1; // 1-based → 0-based
        timetable[toKey(entry.weekday, uiIndex)] = {
        subject: entry.subjects?.name || entry.subject_id,
        room: entry.room || '',
        teacher: entry.teacher || '',
        isDouble: !!entry.is_double
        };
    });

    return timetable;
    }

        // Data saving functions
        async function saveSubjectToSupabase(subject) {
        const { data: { user } } = await supabase.auth.getUser();

        const payload = {
            name: subject.name,
            color: '#667eea',
            created_by: user?.id || null   // 👈 ensure attribution
        };

        const { data, error } = await supabase
            .from('subjects')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('❌ Error saving subject:', error);
            alert('Error saving subject: ' + error.message);
            return null;
        }

        return data;
        }

        async function saveThemeToSupabase(theme, subjectId) {
            const rating = clampRating(theme.rating ?? theme.progress ?? 3); // accept legacy callers
            const { data, error } = await supabase
                .from('themes')
                .insert([{
                subject_id: subjectId,
                title: theme.name,
                description: '',
                self_assessment: rating,          // ✅ 1..5 to satisfy CHECK
                created_by: currentUser?.id
                }])
                .select()
                .single();

            if (error) {
                console.error('Error saving theme:', error);
                return null;
            }
            return data;
            }
            async function updateThemeProgressInSupabase(themeId, rating) {
                rating = clampRating(rating);
                const { error } = await supabase
                    .from('themes')
                    .update({ self_assessment: rating, updated_at: new Date().toISOString() })
                    .eq('id', themeId);

                if (error) {
                    console.error('Error updating theme progress:', error);
                    return false;
                }
                return true;
                }

                async function saveHomeworkToSupabase(homework) {
                    const payload = {
                        subject_id: homework.subject_id,
                        title: homework.title,
                        description: homework.description || '',
                        due_date: homework.dueDate,
                        status: 'pending',
                        created_by: currentUser?.id
                    };
                    if (homework.theme_id) {
                        payload.theme_id = homework.theme_id;
                    }

                    const { data, error } = await supabase
                        .from('homework')
                        .insert([payload])
                        .select()
                        .single();

                    if (error) {
                        console.error('Error saving homework:', error);
                        return null;
                    }
                    return data;
                }

        async function updateHomeworkStatusInSupabase(homeworkId, status) {
            const updateData = { status };
            if (status === 'submitted') {
                updateData.submitted_at = new Date().toISOString();
            } else if (status === 'approved') {
                updateData.approved_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from('homework')
                .update(updateData)
                .eq('id', homeworkId);

            if (error) {
                console.error('Error updating homework status:', error);
                return false;
            }

            return true;
        }

        async function saveTaskToSupabase(task) {
  const { data: { user } } = await supabase.auth.getUser();

  const dueDate = task.dueDate || new Date().toISOString().split('T')[0];
  const status = task.status || 'pending';
  const isParentTask = task.adminTask && currentRole === 'parent';

  const payload = {
    title: task.text,
    description: task.description || '',
    due_date: dueDate,
    status,
    assigned_by: isParentTask ? (user?.id || null) : null,
    created_by: user?.id || null
  };

  if (status === 'approved') {
    payload.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([payload])
    .select()
    .single();

  if (error) {
    console.error('Error saving task:', error);
    return null;
  }

  recordSync(true);
  return data;
        }

        async function setTaskStatusInSupabase(taskId, status, extra = {}) {
            const updateData = { status, ...extra };

            if (status === 'approved') {
                updateData.approved_at = new Date().toISOString();
            } else {
                updateData.approved_at = null;
            }

            const { error } = await supabase
                .from('tasks')
                .update(updateData)
                .eq('id', taskId);

            if (error) {
                console.error('Error updating task status:', error);
                recordError(error, 'Task status update');
                return false;
            }

            recordSync(true);
            return true;
        }

        async function updateTaskInSupabase(taskId, updates = {}) {
            if (!taskId) return false;

            const payload = {};
            if (typeof updates.title === 'string') {
                payload.title = updates.title;
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'dueDate')) {
                payload.due_date = updates.dueDate || null;
            }
            if (typeof updates.description === 'string') {
                payload.description = updates.description;
            }
            if (Object.prototype.hasOwnProperty.call(updates, 'status')) {
                payload.status = updates.status;
            }

            if (Object.keys(payload).length === 0) {
                return true;
            }

            const { error } = await supabase
                .from('tasks')
                .update(payload)
                .eq('id', taskId);

            if (error) {
                console.error('Error updating task:', error);
                recordError(error, 'Task update');
                return false;
            }

            recordSync(true);
            return true;
        }
        async function addThemeForSubject(subjectId, themeName) {
            const clean = (themeName || '').trim();
            if (!clean) throw new Error('Empty theme name');

            // Prevent duplicates per subject (case-insensitive)
            const subj = data.subjects.find(s => s.id === subjectId);
            if (!subj) throw new Error('Subject not found');
            const exists = subj.themes.some(t => t.name.toLowerCase() === clean.toLowerCase());
            if (exists) throw new Error('This theme already exists for the subject.');

            // Default rating = 3/5
            const savedTheme = await saveThemeToSupabase({ name: clean, rating: 3 }, subjectId);
            if (!savedTheme) throw new Error('Could not save theme');

            const initialRating = clampRating(savedTheme.self_assessment ?? 3);

            // Update local model (rating + percent)
            subj.themes.push({
                id: savedTheme.id,
                name: clean,
                rating: initialRating,
                progress: ratingToPercent(initialRating)
            });

            saveData();
            renderSubjects();
            }

            // DB constraint: self_assessment must be 1..5
            function clampRating(x){
                const value = Math.round(Number(x));
                if (!Number.isFinite(value)) return 1;
                return Math.min(5, Math.max(1, value));
            }
function ratingToPercent(r){ return clampRating(r) * 20; }     // 1..5 -> 20..100
function percentToRating(p){ return clampRating(Math.round((Number(p)||0)/20)); } 

// ========================================
// HELPER: Format date as DD.MM.YYYY
// ========================================
function formatDateDMY(dateString) {
    if (!dateString) return 'No due date';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid date';
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}.${month}.${year}`;
}


        // ===== Timetable (class_schedule) helpers =====
        // DB slot bounds (align with CHECK constraint in DB)
        const DB_MIN_SLOT = 1;
        const DB_MAX_SLOT = 9; // set to 9 if your DB allows 1..9
        async function getSubjectIdByName(subjectName){
        if (!subjectName) return null;
        const cached = (data.subjects || []).find(s => s.name === subjectName);
        if (cached) return cached.id;

        // Try fetch from DB
        const { data: found, error } = await supabase
            .from('subjects')
            .select('id')
            .eq('name', subjectName)
            .single();
        if (found?.id) return found.id;

        // Create if not exists (fallback)
        const created = await saveSubjectToSupabase({ name: subjectName });
        return created?.id || null;
        }

        /**
         * Insert/update one timetable cell in DB
         * Requires a UNIQUE constraint on (weekday, time_slot) in class_schedule.
         */
         async function upsertScheduleEntry({ weekday, time_slot, subject_name, room, teacher, is_double }){
            const subject_id = await getSubjectIdByName(subject_name);
            if (!subject_id) throw new Error('Subject could not be resolved/created');

            const payload = {
                weekday,
                time_slot,
                subject_id,
                room: room || '',
                teacher: teacher || '',
                is_double: !!is_double
            };

            const { data: row, error } = await supabase
                .from('class_schedule')
                .upsert(payload, { onConflict: 'weekday,time_slot' })
                .select()
                .single();

            if (error) throw error;
            return row;
            }

            async function deleteScheduleEntry(weekday, time_slot_ui){
                const dbSlot = time_slot_ui + 1;           // 👈 convert
                if (dbSlot < DB_MIN_SLOT || dbSlot > DB_MAX_SLOT) {
                    return true;
                }
                const { error } = await supabase
                    .from('class_schedule')
                    .delete()
                    .eq('weekday', weekday)
                    .eq('time_slot', dbSlot);
                if (error) throw error;
                    return true;
}

        // Calendar and Today logic functions
        async function loadTodayFromCalendar() {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            
            try {
                // Get today's calendar entry
                const { data: calendarEntry, error: calendarError } = await supabase
                    .from('calendar')
                    .select('*')
                    .eq('date', today)
                    .single();
                
                if (calendarError) {
                    console.log('No calendar entry for today, using fallback logic');
                    return null;
                }
                
                return calendarEntry;
            } catch (error) {
                console.error('Error loading today from calendar:', error);
                return null;
            }
        }

        async function getTodaysDueTasks() {
            const today = new Date().toISOString().split('T')[0];
            
            try {
                // Get homework due today
                const { data: homework, error: homeworkError } = await supabase
                    .from('homework')
                    .select('*, subjects(name)')
                    .eq('due_date', today)
                    .neq('status', 'approved');
                
                // Get tasks due today
                const { data: tasks, error: tasksError } = await supabase
                    .from('tasks')
                    .select('*')
                    .eq('due_date', today)
                    .neq('status', 'completed');
                
                return {
                    homework: homework || [],
                    tasks: tasks || [],
                    errors: { homeworkError, tasksError }
                };
            } catch (error) {
                console.error('Error loading today\'s due items:', error);
                return { homework: [], tasks: [], errors: { error } };
            }
        }

        async function checkDailyAchievement(date = null) {
            const targetDate = date || new Date().toISOString().split('T')[0];
            const dateForCheck = new Date(`${targetDate}T00:00:00`);

            try {
                const { data: calendarEntry, error: calendarError } = await supabase
                    .from('calendar')
                    .select('is_school_day')
                    .eq('date', targetDate)
                    .maybeSingle();

                if (calendarError) {
                    console.warn('Unable to load calendar entry for daily achievement:', calendarError);
                }

                const isWeekend = [0, 6].includes(dateForCheck.getUTCDay());
                const isSchoolDay = calendarEntry?.is_school_day ?? !isWeekend;

                if (!isSchoolDay) {
                    return {
                        dailyAchievement: false,
                        details: {
                            skipped: true,
                            reason: calendarEntry ? 'calendar' : (isWeekend ? 'weekend' : 'unscheduled-day')
                        }
                    };
                }

                // Check if all homework due on this date is approved
                const { data: homeworkDue = [] } = await supabase
                    .from('homework')
                    .select('status')
                    .eq('due_date', targetDate);

                // Check if all tasks due on this date are approved or completed
                const { data: tasksDue = [] } = await supabase
                    .from('tasks')
                    .select('status')
                    .eq('due_date', targetDate);

                // Check if any theme was updated on this date
                const { data: themeUpdates = [] } = await supabase
                    .from('theme_updates')
                    .select('id')
                    .eq('calendar_date', targetDate);

                const allHomeworkApproved = homeworkDue.length === 0 ||
                    homeworkDue.every(hw => hw.status === 'approved');
                const allTasksCompleted = tasksDue.length === 0 ||
                    tasksDue.every(task => task.status === 'completed' || task.status === 'approved');
                const themeUpdated = themeUpdates.length > 0;

                return {
                    dailyAchievement: allHomeworkApproved && allTasksCompleted && themeUpdated,
                    details: {
                        allHomeworkApproved,
                        allTasksCompleted,
                        themeUpdated,
                        homeworkCount: homeworkDue.length,
                        tasksCount: tasksDue.length,
                        themeUpdatesCount: themeUpdates.length
                    }
                };
            } catch (error) {
                console.error('Error checking daily achievement:', error);
                return { dailyAchievement: false, details: null };
            }
        }

    async function recordThemeUpdate(themeId) {
    const today = new Date().toISOString().split('T')[0];

    // ✅ Log payload before the insert
    const payload = {
        theme_id: themeId,
        calendar_date: today,
        created_by: currentUser?.id
    };
    console.log("📤 Inserting theme update payload:", payload);

    try {
        const { data, error } = await supabase
            .from('theme_updates')
            .insert([payload])
            .select()
            .single();

        if (error) {
            console.error('Error recording theme update:', error);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Failed to record theme update:', error);
        return false;
    }
}

        // Photo upload functions
        async function compressImage(file, maxDimension = 1600, quality = 0.8) {
            return new Promise((resolve, reject) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                const objectUrl = URL.createObjectURL(file);

                img.onload = () => {
                    let ratio = 1;
                    const longestSide = Math.max(img.width, img.height);
                    if (longestSide > maxDimension) {
                        ratio = maxDimension / longestSide;
                    }

                    const targetWidth = Math.max(1, Math.round(img.width * ratio));
                    const targetHeight = Math.max(1, Math.round(img.height * ratio));
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    ctx.clearRect(0, 0, targetWidth, targetHeight);
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                    canvas.toBlob(blob => {
                        URL.revokeObjectURL(objectUrl);
                        resolve(blob);
                    }, 'image/jpeg', quality);
                };

                img.onerror = () => {
                    URL.revokeObjectURL(objectUrl);
                    reject(new Error('Failed to load image for compression'));
                };

                img.src = objectUrl;
            });
        }

        async function uploadHomeworkPhoto(homeworkId, file) {
    try {
        console.log('📤 Starting upload:', { homeworkId, fileName: file.name, fileSize: file.size });
        
        // Try to compress the image
        let compressedFile = null;
        try {
            compressedFile = await compressImage(file);
            console.log('✅ Image compressed');
        } catch (compressionError) {
            console.warn('⚠️ Compression failed, using original:', compressionError);
        }

        const fileToUpload = compressedFile || file;
        if (!fileToUpload) {
            throw new Error('No file available for upload');
        }

        // Generate file path: userId/homeworkId/timestamp.jpg
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const userId = currentUser?.id;
        
        if (!userId) {
            throw new Error('User not authenticated');
        }
        
        const filePath = `${userId}/${homeworkId}/${timestamp}.jpg`;
        console.log('📍 Upload path:', filePath);

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('homework-photos')
            .upload(filePath, fileToUpload, {
                cacheControl: '3600',
                upsert: false,
                contentType: fileToUpload.type || file.type || 'image/jpeg'
            });

        if (error) {
            console.error('❌ Storage upload error:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            throw error;
        }

        console.log('✅ Upload successful to storage:', data);
        console.log('📁 File path:', filePath);
        return filePath;
        
    } catch (error) {
        console.error('❌ Photo upload failed:', error);
        console.error('Stack trace:', error.stack);
        throw error;
    }
}

async function getSignedPhotoUrl(filePath) {
  try {
    if (!filePath || typeof filePath !== 'string' || !filePath.includes('/')) {
      console.warn('Skipping legacy/bad photo path:', filePath);
      return null;
    }
    const { data, error } = await supabase
      .storage
      .from('homework-photos')
      .createSignedUrl(filePath, 3600);
    if (error) {
      console.warn('Storage signed URL error for', filePath, error);
      return null;
    }
    return data?.signedUrl || null;
  } catch (e) {
    console.warn('Failed to get signed URL for', filePath, e);
    return null;
  }
}

        async function saveHomeworkPhotoPath(homeworkId, filePath) {
    try {
        console.log('💾 Saving photo path:', { homeworkId, filePath });
        
        // First, get current homework to see if it has existing photos
        const { data: homework, error: fetchError } = await supabase
            .from('homework')
            .select('photos')
            .eq('id', homeworkId)
            .single();
        
        if (fetchError) {
            console.error('❌ Error fetching homework:', fetchError);
            return false;
        }
        
        console.log('📂 Current photos in DB:', homework.photos);
        
        // 🔧 FIX: Handle NULL values properly
        let existingPhotos = [];
        if (homework.photos && Array.isArray(homework.photos)) {
            existingPhotos = homework.photos;
        } else if (homework.photos === null) {
            existingPhotos = [];
        }
        
        // Add new photo path
        const updatedPhotos = [...existingPhotos, filePath];
        console.log('📸 Updated photos array:', updatedPhotos);
        
        // Update homework record with new photo path
        const { data: updated, error: updateError } = await supabase
            .from('homework')
            .update({ photos: updatedPhotos })
            .eq('id', homeworkId)
            .select();
        
        if (updateError) {
            console.error('❌ Error saving photo path:', updateError);
            console.error('Error details:', JSON.stringify(updateError, null, 2));
            return false;
        }
        
        console.log('✅ Photo path saved successfully:', updated);
        return true;
        
    } catch (error) {
        console.error('❌ Failed to save photo path:', error);
        return false;
    }
}

                async function checkAdminPassword() {
            const input = document.getElementById('adminPassword');
            const pw = (input?.value || '').trim();
            if (!pw) { alert('Please enter the password.'); return; }

            const { data, error } = await supabase.rpc('check_parent_password', { pw });
            if (error) {
                console.error('Password check failed:', error);
                alert('❌ Error during password check');
                return;
            }

            if (data === true) {
                currentRole = 'parent';
                window.currentRole = 'parent';
                updateRoleDisplay();
                refreshDiagRole();
                const loginEl = document.getElementById('loginSection');
                if (loginEl) loginEl.style.display = 'none';
                alert('✅ Parent mode activated!');
            } else {
                alert('❌ Incorrect password');
            }

            if (input) input.value = '';
        }

        async function changeAdminPassword() {
            if (currentRole !== 'parent') {
                alert('❌ Only parents can change this password.');
                return;
            }

            const currentPw = prompt('Current parent password:', '');
            if (currentPw === null) return;

            const next = prompt('New parent password:', '');
            if (!next) return;

            try {
                const { error } = await supabase.rpc('change_parent_password', {
                    current_pw: currentPw.trim(),
                    new_pw: next.trim()
                });

                if (error) throw error;

                alert('✅ Parent password was updated.');
            } catch (error) {
                console.error('Failed to update parent password:', error);
                alert('❌ Could not update parent password. Please try again.');
            }
        }

    function toggleLoginSection(){
        const el = document.getElementById('loginSection');
        if (!el) return;
        const cur = (el.style.display || '').trim();
        el.style.display = (cur === 'none' || cur === '') ? 'block' : 'none';
    }

    function switchToStudentMode() {
        currentRole = 'student';
        window.currentRole = 'student';
        updateRoleDisplay();
        refreshDiagRole();
        }

        // Load data from Supabase (replaces localStorage)
        async function loadData() {
            try {
                // Check if user is authenticated
                const authenticated = await ensureAuthenticated();
                if (!authenticated) {
                    // Fall back to localStorage for demo purposes
                    loadDataFromLocalStorage();
                    return;
                }

                // Load all data concurrently from Supabase
                const [subjects, themes, homework, tasks, timetable] = await Promise.all([
                    loadSubjectsFromSupabase(),
                    loadThemesFromSupabase(),
                    loadHomeworkFromSupabase(),
                    loadTasksFromSupabase(),
                    loadTimetableFromSupabase()
                ]);

                // Transform data to match existing UI expectations
                data.subjects = await transformSubjectsAndThemes(subjects, themes);
                data.homework = transformHomework(homework);
                data.allTasks = transformTasks(tasks);
                refreshTaskCollections();
                data.timetable = timetable;

                // Calculate weekly stats from database
                await calculateWeeklyStats();
                
                // Record successful sync
                recordSync(true);

            } catch (error) {
                console.error('Error loading data from Supabase:', error);
                recordError(error, 'Data loading');
                // Fall back to localStorage
                loadDataFromLocalStorage();
            }
        }

        // Transform subjects and themes for UI compatibility
        async function transformSubjectsAndThemes(subjects, themes) {
            return subjects.map(subject => ({
                id: subject.id,
                name: subject.name,
                themes: themes
                .filter(theme => theme.subject_id === subject.id)
                .map(theme => {
                    const rating = clampRating(theme.self_assessment ?? 3); // default 3/5
                    return {
                    id: theme.id,
                    name: theme.title,
                    rating,                          // 1..5 (what we store)
                    progress: ratingToPercent(rating) // 20..100 (what we show)
                    };
                })
            }));
            }

        function normalizeTaskStatus(status) {
            const allowed = ['pending', 'completed', 'approved', 'awaiting_approval'];
            const clean = (status || '').toLowerCase();
            return allowed.includes(clean) ? clean : 'pending';
        }



        function assignTaskClientId(task) {
            if (!task) return null;
            if (!task.clientId) {
                nextLocalTaskId += 1;
                const localSuffix = `${Date.now()}-${nextLocalTaskId}`;
                task.clientId = task.id ? `task-${task.id}` : `local-${localSuffix}`;
            }
            return task.clientId;
        }

        function parseTaskDueDate(dueDate) {
            if (!dueDate) return null;
            const parsed = new Date(dueDate);
            return Number.isNaN(parsed.getTime()) ? null : parsed;
        }

        function toStartOfDay(date) {
            const copy = new Date(date);
            copy.setHours(0, 0, 0, 0);
            return copy;
        }

        function isDueTodayOrOverdue(task) {
            if (!task) return false;
            if (!task.dueDate) return true;
            const dueDate = parseTaskDueDate(task.dueDate);
            if (!dueDate) return true;
            const today = toStartOfDay(new Date());
            return toStartOfDay(dueDate).getTime() <= today.getTime();
        }

        function sortTasksByDueDateInPlace(tasks) {
            if (!Array.isArray(tasks)) return;
            tasks.sort((a, b) => {
                const aDue = parseTaskDueDate(a?.dueDate);
                const bDue = parseTaskDueDate(b?.dueDate);

                if (aDue && bDue && aDue.getTime() !== bDue.getTime()) {
                    return aDue.getTime() - bDue.getTime();
                }
                if (aDue && !bDue) return -1;
                if (!aDue && bDue) return 1;

                const aCreated = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bCreated = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
                if (aCreated && bCreated && aCreated !== bCreated) {
                    return aCreated - bCreated;
                }
                const aText = (a?.text || '').toLowerCase();
                const bText = (b?.text || '').toLowerCase();
                return aText.localeCompare(bText);
            });
        }

        function findTaskByClientId(clientId) {
            if (!clientId) return null;
            return data.allTasks.find(task => task.clientId === clientId);
        }

        function getTaskIndexByClientId(clientId) {
            if (!clientId) return -1;
            return data.allTasks.findIndex(task => task.clientId === clientId);
        }

        function refreshTaskCollections() {
            if (!Array.isArray(data.allTasks)) {
                data.allTasks = [];
            }
            data.allTasks.forEach(assignTaskClientId);
            sortTasksByDueDateInPlace(data.allTasks);
            data.todayTasks = data.allTasks.filter(isDueTodayOrOverdue);
        }

        // Transform homework for UI compatibility
        function transformHomework(homework) {
            return homework.map(hw => ({
                id: hw.id,
                subject: hw.subjects?.name || 'Unknown',
                subject_id: hw.subject_id,
                title: hw.title,
                dueDate: hw.due_date,
                completed: hw.status === 'approved',
                description: hw.description || '',
                status: hw.status,
                photos: Array.isArray(hw.photos) ? hw.photos : [],
                submitted_at: hw.submitted_at || null,
                approved_at: hw.approved_at || null,
                comment: hw.comment || '',
                created_at: hw.created_at || null,
                updated_at: hw.updated_at || null
            }));
        }

        // Transform tasks for UI compatibility
        function transformTasks(tasks) {
            return tasks.map(task => {
                const status = normalizeTaskStatus(task.status);
                const completed = ['completed', 'approved'].includes(status);
                const assignedBy = task.assigned_by || null;

                const normalized = {
                    id: task.id,
                    text: task.title,
                    description: task.description,
                    dueDate: task.due_date || null,
                    status,
                    completed,
                    adminTask: !!assignedBy,
                    assignedBy,
                    approvedAt: task.approved_at || null,
                    createdAt: task.created_at || null
                };
                assignTaskClientId(normalized);
                return normalized;
            });
        }

        // Phase 8: Calculate achievements using SQL views
        async function calculateWeeklyStats() {
            try {
                // Get current week's achievement data from SQL view
                const today = new Date().toISOString().split('T')[0];
                
                const { data: currentWeek, error } = await supabase
                    .from('weekly_achievements')
                    .select('*')
                    .lte('iso_week_start', today)
                    .order('iso_week_start', { ascending: false })
                    .limit(1)
                    .single();
                
                if (error) {
                    console.error('Error loading weekly achievements:', error);
                    // Fall back to old calculation
                    await calculateWeeklyStatsLegacy();
                    return;
                }
                
                // Update data with achievement-based stats
                data.completedTasksWeek = currentWeek?.week_tasks_completed || 0;
                data.completedHomeworkWeek = currentWeek?.week_homework_approved || 0;
                data.currentWeekAchievement = currentWeek;
                
            } catch (error) {
                console.error('Error in calculateWeeklyStats:', error);
                await calculateWeeklyStatsLegacy();
            }
        }

        // Legacy calculation for fallback
        async function calculateWeeklyStatsLegacy() {
            const today = new Date();
            const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            
            // Count completed tasks this week
            const { count: tasksCount } = await supabase
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('updated_at', oneWeekAgo.toISOString());
            
            // Count approved homework this week
            const { count: homeworkCount } = await supabase
                .from('homework')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'approved')
                .gte('approved_at', oneWeekAgo.toISOString());

            data.completedTasksWeek = tasksCount || 0;
            data.completedHomeworkWeek = homeworkCount || 0;
        }

        // Get today's achievement status
        async function getTodaysAchievement() {
            try {
                const today = new Date().toISOString().split('T')[0];
                
                const { data: todayAchievement, error } = await supabase
                    .from('daily_achievements')
                    .select('*')
                    .eq('date', today)
                    .single();
                
                if (error) {
                    console.log('No daily achievement data for today, using legacy calculation');
                    return await checkDailyAchievement();
                }
                
                return {
                    dailyAchievement: todayAchievement.daily_achievement === 1,
                    details: {
                        allHomeworkApproved: todayAchievement.all_hw_approved,
                        allTasksCompleted: todayAchievement.all_tasks_approved,
                        themeUpdated: todayAchievement.theme_updated,
                        homeworkDueCount: todayAchievement.homework_due_count,
                        homeworkApprovedCount: todayAchievement.homework_approved_count,
                        tasksDueCount: todayAchievement.tasks_due_count,
                        tasksCompletedCount: todayAchievement.tasks_completed_count,
                        themeUpdatesCount: todayAchievement.theme_updates_count
                    }
                };
            } catch (error) {
                console.error('Error loading today\'s achievement:', error);
                return await checkDailyAchievement();
            }
        }

        // Get recent weekly achievements
        async function getWeeklyAchievements(limit = 4) {
            try {
                const { data: weeks, error } = await supabase
                    .from('weekly_achievements')
                    .select('*')
                    .order('iso_week_start', { ascending: false })
                    .limit(limit);
                
                if (error) {
                    console.error('Error loading weekly achievements:', error);
                    return [];
                }
                
                return weeks || [];
            } catch (error) {
                console.error('Error in getWeeklyAchievements:', error);
                return [];
            }
        }

        // Fallback to localStorage (for demo/migration purposes)
        function loadDataFromLocalStorage() {
            const savedData = localStorage.getItem('schoolSystemData');
            if (savedData) {
                data = JSON.parse(savedData);
                if (!data.timetable) {
                    data.timetable = {};
                }
                if (!Array.isArray(data.allTasks)) {
                    data.allTasks = Array.isArray(data.todayTasks) ? [...data.todayTasks] : [];
                }
                if (Array.isArray(data.todayTasks)) {
                    data.todayTasks = data.todayTasks.map(task => {
                        const status = task.status || (task.completed ? 'completed' : 'pending');
                        const adminTask = !!task.adminTask;
                        return {
                            ...task,
                            adminTask,
                            status,
                            completed: status === 'completed' || status === 'approved'
                        };
                    });
                }
            } else {
                // Initialize with empty data structure
                data = {
                    subjects: [],
                    homework: [],
                    todayTasks: [],
                    allTasks: [],
                    completedTasksWeek: 0,
                    completedHomeworkWeek: 0,
                    timetable: {}
                };
            }
            refreshTaskCollections();
        }

        // Save data is now handled by individual Supabase operations
        // This is kept for compatibility but most operations go directly to Supabase
        function saveData() {
            // For backward compatibility, still save to localStorage
            localStorage.setItem('schoolSystemData', JSON.stringify(data));
        }

        // Initialize the app
        bootstrapRole();
        async function init() {
            await loadData();
            displayCurrentDate();
            updateRoleDisplay();
            renderTimetable();
            renderTodayTasks();
            renderSubjects();
            await renderHomework();
            await updateWeeklySummary();
            populateHomeworkSubjects();
            populateTimetableSubjects();

            const todayIso = new Date().toISOString().split('T')[0];
            const newTaskDueInput = document.getElementById('newTaskDueDate');
            if (newTaskDueInput && !newTaskDueInput.value) newTaskDueInput.value = todayIso;
            const adminTaskDueInput = document.getElementById('adminTaskDueDate');
            if (adminTaskDueInput && !adminTaskDueInput.value) adminTaskDueInput.value = todayIso;

            // Initialize system health monitoring
            await checkSystemHealth();
            // Set up periodic health checks (every 5 minutes)
            setInterval(updateSystemHealth, 5 * 60 * 1000);
        }
        

        function displayCurrentDate() {
            const today = new Date();
            const options = { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            };
            document.getElementById('currentDate').textContent = today.toLocaleDateString('en-US', options);
        }

        
        function updateRoleDisplay(){
            console.log('Current role in updateRoleDisplay:', currentRole);
            const roleIndicator = document.getElementById('roleIndicator');
            const adminControls = document.querySelectorAll('.admin-controls');
            const studentControls = document.querySelectorAll('.student-controls');
            const adminAccessBtn = document.getElementById('adminAccessBtn');
            const changePasswordBtn = document.getElementById('changePasswordBtn');

            if (roleIndicator) {
                roleIndicator.textContent = (currentRole === 'parent')
                ? '👨‍👩‍👧‍👦 Parent Mode'
                : '👧 Student Mode';
            }

            if (currentRole === 'parent') {
                adminControls.forEach(c => c.style.display = 'block');
                studentControls.forEach(c => c.style.display = 'none');
                if (adminAccessBtn) adminAccessBtn.style.display = 'none';
                if (changePasswordBtn) changePasswordBtn.style.display = 'inline-block';
            } else if (currentRole === 'student') {
                adminControls.forEach(c => c.style.display = 'none');
                studentControls.forEach(c => c.style.display = 'block');  // ✅ show students
                if (adminAccessBtn) adminAccessBtn.style.display = 'inline-block';
                if (changePasswordBtn) changePasswordBtn.style.display = 'none';
            }
        }

        // Timetable functions
        function renderTimetable() {
            const timetable = document.getElementById('timetable');
            let html = '<thead><tr><th class="time-slot">Time</th>';
            
            weekDays.forEach(day => {
                html += `<th>${day}</th>`;
            });
            html += '</tr></thead><tbody>';
            
            const today = new Date();
            const currentDay = weekDays[today.getDay() - 1]; // Monday = 0
            
            timeSlots.forEach((timeSlot, timeIndex) => {
                html += '<tr>';
                html += `<td class="time-slot">${timeSlot}</td>`;
                
                weekDays.forEach(day => {
                    const cellKey = `${day}_${timeIndex}`;
                    const entry = data.timetable[cellKey];
                    const isToday = day === currentDay;
                    const hasHomework = data.homework.some(hw => 
                        hw.subject === entry?.subject && !hw.completed
                    );
                    
                    let cellClass = `subject-cell ${isToday ? 'current-day' : ''}`;
                    let cellContent = '';
                    
                    if (entry) {
                        cellClass += ' has-subject';
                        if (isToday) cellClass += ' today-subject';
                        
                        cellContent = `
                            <div class="subject-name">${entry.subject}</div>
                            <div class="room-info">${entry.room}${entry.teacher ? ` - ${entry.teacher}` : ''}</div>
                            ${hasHomework ? '<div class="homework-indicator">!</div>' : ''}
                        `;
                    }
                    
                    const clickHandler = currentRole === 'parent' ? 
                        `onclick="openTimetableModal('${day}', ${timeIndex})"` : '';
                    
                    html += `<td class="${cellClass}" ${clickHandler}>${cellContent}</td>`;
                });
                html += '</tr>';
            });
            
            html += '</tbody>';
            timetable.innerHTML = html;
            
            updateCurrentWeekDisplay();
        }

        function renderTodaySubjects() {
            const container = document.getElementById('todaySubjectsList');
            const today = new Date();
            const currentDay = weekDays[today.getDay() - 1];
            
            if (!currentDay) {
                container.innerHTML = '<p>Today is school-free! 🎉</p>';
                return;
            }
            
            const todayEntries = [];
            timeSlots.forEach((timeSlot, index) => {
                const entry = data.timetable[`${currentDay}_${index}`];
                if (entry) {
                    const hasHomework = data.homework.some(hw => 
                        hw.subject === entry.subject && !hw.completed
                    );
                    todayEntries.push({ ...entry, timeSlot, hasHomework });
                }
            });
            
            if (todayEntries.length === 0) {
                container.innerHTML = '<p>Today no classess added.</p>';
                return;
            }
            
            let html = '';
            todayEntries.forEach(entry => {
                html += `
                    <div class="subject-today-item">
                        <div>
                            <strong>${entry.subject}</strong> - ${entry.timeSlot}
                            <br><small>${entry.room}${entry.teacher ? ` - ${entry.teacher}` : ''}</small>
                        </div>
                        <div>
                            ${entry.hasHomework ? '<span style="color: #dc3545;">📝 Homework!</span>' : '✅'}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }

        function updateCurrentWeekDisplay() {
            const weekDisplay = document.getElementById('currentWeek');
            if (currentWeekOffset === 0) {
                weekDisplay.textContent = 'Current week';
            } else if (currentWeekOffset === 1) {
                weekDisplay.textContent = 'Next week';
            } else if (currentWeekOffset === -1) {
                weekDisplay.textContent = 'Last week';
            } else {
                const weekText = currentWeekOffset > 0 ? 
                    `In ${currentWeekOffset} weeks` : 
                    `before ${Math.abs(currentWeekOffset)} weeks`;
                weekDisplay.textContent = weekText;
            }
        }

        function previousWeek() {
            currentWeekOffset--;
            updateCurrentWeekDisplay();
        }

        function nextWeek() {
            currentWeekOffset++;
            updateCurrentWeekDisplay();
        }

        function openTimetableModal(day, timeIndex) {
            if (currentRole !== 'parent') {
                alert('❌ Nur Eltern können den Stundenplan bearbeiten!');
                return;
            }
            
            selectedTimeSlot = { day, timeIndex };
            const cellKey = `${day}_${timeIndex}`;
            const entry = data.timetable[cellKey];
            
            // Populate modal
            document.getElementById('timetableModalTitle').textContent = 
                entry ? 'Subject update' : 'Add Subject';
            document.getElementById('timetableSubject').value = entry?.subject || '';
            document.getElementById('timetableRoom').value = entry?.room || '';
            document.getElementById('timetableTeacher').value = entry?.teacher || '';
            document.getElementById('doubleLesson').checked = entry?.isDouble || false;
            
            const deleteBtn = document.getElementById('deleteTimetableBtn');
            deleteBtn.style.display = entry ? 'inline-block' : 'none';
            
            populateTimetableSubjects();
            if (!data.subjects || data.subjects.length === 0) {
                alert('You have no subjects yet. Please add a subject first (Fächer & Themen → “+ Fach hinzufügen”).');
                return;
        }
            document.getElementById('timetableModal').style.display = 'block';
        }

        // Ensure a subject exists and return its id
            async function upsertSubjectByName(name){
            if (!name) throw new Error('Missing subject name');
            // try find
            let { data: subj, error } = await supabase
                .from('subjects')
                .select('id')
                .eq('name', name)
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            if (subj?.id) return subj.id;

            // create
            const { data: created, error: insErr } = await supabase
                .from('subjects')
                .insert([{ name, color: '#667eea' }])
                .select('id')
                .single();
            if (insErr) throw insErr;
            return created.id;
            }

            // Save one timetable cell (and optional double lesson) to DB
        async function saveTimetableCellToDB({ weekday, timeIndex, subjectName, room, teacher, isDouble }) {
        const subject_id = await upsertSubjectByName(subjectName);
        if (!subject_id) throw new Error('❌ Could not resolve subject_id');

        const dbSlot = timeIndex + 1;            // 1-based for DB
        const dbNextSlot = dbSlot + 1;

        // enforce DB bounds
        if (dbSlot < DB_MIN_SLOT || dbSlot > DB_MAX_SLOT) {
            alert(`Time slot ${dbSlot} is outside allowed range (${DB_MIN_SLOT}-${DB_MAX_SLOT})`);
            throw new Error('DB time_slot out of range');
        }

        // delete any existing entry first (for overwrite)
        await supabase.from('class_schedule')
            .delete()
            .eq('weekday', weekday)
            .eq('time_slot', dbSlot);

        // insert main slot
        const { error: insErr1 } = await supabase.from('class_schedule').insert([{
            weekday,
            time_slot: dbSlot,
            subject_id,
            room: room || null,
            teacher: teacher || null,
            is_double: !!isDouble
        }]);

        if (insErr1) {
            console.error("❌ DB insert error (slot):", insErr1);
            alert("❌ Could not save timetable entry. Check if you are in Parent mode.");
            throw insErr1;
        }

        // handle double (mirror next DB slot)
        if (isDouble && timeIndex < timeSlots.length - 1 && dbNextSlot <= DB_MAX_SLOT) {
            await supabase.from('class_schedule')
            .delete()
            .eq('weekday', weekday)
            .eq('time_slot', dbNextSlot);

            const { error: insErr2 } = await supabase.from('class_schedule').insert([{
            weekday,
            time_slot: dbNextSlot,
            subject_id,
            room: room || null,
            teacher: teacher || null,
            is_double: true
            }]);

            if (insErr2) {
            console.error("❌ DB insert error (double):", insErr2);
            alert("❌ Could not save double lesson entry.");
            throw insErr2;
            }
        }

        console.log("✅ Timetable entry saved:", { weekday, time_slot: dbSlot, subject_id });
        return true;
        }

        async function saveTimetableEntry() {
            if (!selectedTimeSlot) return;

            const subject = document.getElementById('timetableSubject').value.trim();
            const room = document.getElementById('timetableRoom').value.trim();
            const teacher = document.getElementById('timetableTeacher').value.trim();
            const isDouble = document.getElementById('doubleLesson').checked;

            if (!subject) { alert('⚠️ Please choose a subject.'); return; }
            if (!room)    { alert('⚠️ Room is required.'); return; }

            const weekday = selectedTimeSlot.day;
            const timeIndex = selectedTimeSlot.timeIndex;

            const cellKey = `${weekday}_${timeIndex}`;
            data.timetable[cellKey] = { subject, room, teacher, isDouble };

            const nextKey = `${weekday}_${timeIndex + 1}`;
            if (isDouble && timeIndex < timeSlots.length - 1) {
                data.timetable[nextKey] = { subject, room, teacher, isDouble: true };
            } else if (data.timetable[nextKey]?.isDouble) {
                delete data.timetable[nextKey];
            }

            renderTimetable();

            try {
                await saveTimetableCellToDB({ weekday, timeIndex, subjectName: subject, room, teacher, isDouble });
                saveData();
                closeModal('timetableModal');
            } catch (e) {
                console.error('❌ Timetable save failed:', e);
            }

            document.getElementById('timetableSubject').value = '';
            document.getElementById('timetableRoom').value = '';
            document.getElementById('timetableTeacher').value = '';
            document.getElementById('doubleLesson').checked = false;
        }

async function deleteTimetableEntry() {
    if (!selectedTimeSlot) return;

    const ok = window.confirm('Delete this timetable entry?');
    if (!ok) return;

    const { day, timeIndex } = selectedTimeSlot;
    const cellKey = `${day}_${timeIndex}`;
    const entry = data.timetable[cellKey];

    try {
        // Delete primary slot in DB
        await deleteScheduleEntry(day, timeIndex);

        // If it was a double lesson, also delete the next slot in DB
        if (entry?.isDouble && timeIndex < timeSlots.length - 1) {
            await deleteScheduleEntry(day, timeIndex + 1);
        }

        // Update local model
        delete data.timetable[cellKey];
        if (entry?.isDouble && timeIndex < timeSlots.length - 1) {
            const nextCellKey = `${day}_${timeIndex + 1}`;
            delete data.timetable[nextCellKey];
        }

        saveData();
        renderTimetable();
        closeModal('timetableModal');
    } catch (e) {
        console.error('Timetable delete error:', e);
        alert('❌ Could not delete from database: ' + (e.message || e));
    }
}

        function populateTimetableSubjects() {
            const select = document.getElementById('timetableSubject');
            select.innerHTML = '<option value="">Select Subject...</option>';
            data.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.name;
                option.textContent = subject.name;
                select.appendChild(option);
            });
        }

        async function clearTimetable() {
            if (currentRole !== 'parent') {
                alert('Only parents can perform this action.');
                return;
            }

            const confirmed = window.confirm('Complete Study plan delete?');
            if (!confirmed) return;

            try {
                const { error } = await supabase
                    .from('class_schedule')
                    .delete()
                    .neq('weekday', '');

                if (error) throw error;

                data.timetable = {};
                saveData();
                renderTimetable();
                alert('✅ Study plan cleared for all devices!');
            } catch (error) {
                console.error('Timetable clear error:', error);
                alert('❌ Could not clear timetable in database.');
                data.timetable = await loadTimetableFromSupabase();
                renderTimetable();
                saveData();
            }
        }

        async function loadSampleTimetable() {
            if (currentRole !== 'parent') {
                alert('Nur Eltern dürfen diese Aktion ausführen.');
                return;
            }

            const confirmed = window.confirm('Beispiel-Stundenplan laden? (Überschreibt aktuellen Stundenplan)');
            if (!confirmed) return;

            const sampleEntries = [
                { weekday: 'Monday', timeIndex: 0, subject: 'Mathematik', room: 'A205', teacher: 'Frau Schmidt', isDouble: true },
                { weekday: 'Monday', timeIndex: 2, subject: 'Deutsch', room: 'B102', teacher: 'Herr Weber', isDouble: true },
                { weekday: 'Monday', timeIndex: 5, subject: 'Sport', room: 'Sporthalle', teacher: 'Frau Klein', isDouble: true },
                { weekday: 'Tuesday', timeIndex: 0, subject: 'Englisch', room: 'C301', teacher: 'Mr. Johnson', isDouble: true },
                { weekday: 'Tuesday', timeIndex: 2, subject: 'Biologie', room: 'D201', teacher: 'Frau Müller', isDouble: false },
                { weekday: 'Tuesday', timeIndex: 3, subject: 'Geschichte', room: 'B205', teacher: 'Herr Wagner', isDouble: true },
                { weekday: 'Tuesday', timeIndex: 6, subject: 'Mathematik', room: 'A205', teacher: 'Frau Schmidt', isDouble: false },
                { weekday: 'Wednesday', timeIndex: 0, subject: 'Physik', room: 'D301', teacher: 'Herr Fischer', isDouble: true },
                { weekday: 'Wednesday', timeIndex: 2, subject: 'Deutsch', room: 'B102', teacher: 'Herr Weber', isDouble: false },
                { weekday: 'Wednesday', timeIndex: 4, subject: 'Erdkunde', room: 'C201', teacher: 'Frau Berg', isDouble: false },
                { weekday: 'Wednesday', timeIndex: 5, subject: 'Englisch', room: 'C301', teacher: 'Mr. Johnson', isDouble: false },
                { weekday: 'Thursday', timeIndex: 0, subject: 'Mathematik', room: 'A205', teacher: 'Frau Schmidt', isDouble: false },
                { weekday: 'Thursday', timeIndex: 1, subject: 'Biologie', room: 'D201', teacher: 'Frau Müller', isDouble: true },
                { weekday: 'Thursday', timeIndex: 4, subject: 'Deutsch', room: 'B102', teacher: 'Herr Weber', isDouble: false },
                { weekday: 'Thursday', timeIndex: 5, subject: 'Geschichte', room: 'B205', teacher: 'Herr Wagner', isDouble: false },
                { weekday: 'Thursday', timeIndex: 6, subject: 'Erdkunde', room: 'C201', teacher: 'Frau Berg', isDouble: false },
                { weekday: 'Friday', timeIndex: 0, subject: 'Sport', room: 'Sporthalle', teacher: 'Frau Klein', isDouble: true },
                { weekday: 'Friday', timeIndex: 2, subject: 'Englisch', room: 'C301', teacher: 'Mr. Johnson', isDouble: false },
                { weekday: 'Friday', timeIndex: 3, subject: 'Physik', room: 'D301', teacher: 'Herr Fischer', isDouble: false },
                { weekday: 'Friday', timeIndex: 4, subject: 'Mathematik', room: 'A205', teacher: 'Frau Schmidt', isDouble: false }
            ];

            const nextTimetable = {};
            for (const entry of sampleEntries) {
                const key = `${entry.weekday}_${entry.timeIndex}`;
                nextTimetable[key] = {
                    subject: entry.subject,
                    room: entry.room,
                    teacher: entry.teacher,
                    isDouble: entry.isDouble
                };

                if (entry.isDouble && entry.timeIndex < timeSlots.length - 1) {
                    nextTimetable[`${entry.weekday}_${entry.timeIndex + 1}`] = {
                        subject: entry.subject,
                        room: entry.room,
                        teacher: entry.teacher,
                        isDouble: true
                    };
                }
            }

            try {
                const { error: clearError } = await supabase
                    .from('class_schedule')
                    .delete()
                    .neq('weekday', '');

                if (clearError) throw clearError;

                for (const entry of sampleEntries) {
                    await saveTimetableCellToDB({
                        weekday: entry.weekday,
                        timeIndex: entry.timeIndex,
                        subjectName: entry.subject,
                        room: entry.room,
                        teacher: entry.teacher,
                        isDouble: entry.isDouble
                    });
                }

                data.timetable = nextTimetable;
                saveData();
                renderTimetable();
                alert('✅ Beispiel-Stundenplan geladen!');
            } catch (error) {
                console.error('Sample timetable error:', error);
                alert('❌ Could not load sample timetable.');
                data.timetable = await loadTimetableFromSupabase();
                renderTimetable();
                saveData();
            }
        }

        function getVisibleTasks() {
            if (taskViewMode === 'all') {
                return Array.isArray(data.allTasks) ? data.allTasks : [];
            }
            return Array.isArray(data.todayTasks) ? data.todayTasks : [];
        }

        function updateTaskViewTabs() {
            const tabs = document.querySelectorAll('.task-tab');
            tabs.forEach(tab => {
                const view = tab.getAttribute('data-view');
                if (view === taskViewMode) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });
        }

        function setTaskView(view) {
            if (view !== 'today' && view !== 'all') return;
            if (taskViewMode === view) {
                updateTaskViewTabs();
                return;
            }
            taskViewMode = view;
            updateTaskViewTabs();
            renderTodayTasks();
        }
        window.setTaskView = setTaskView;

        function renderTodayTasks() {
  refreshTaskCollections();
  updateTaskViewTabs();

  const container = document.getElementById('todayTasks');
  if (!container) return;
  container.innerHTML = '';

  const isParent = (currentRole === 'parent');
  const tasksToRender = getVisibleTasks();

  if (!tasksToRender.length) {
    container.innerHTML = '<p style="margin:10px 0; color:#666;">No tasks to display.</p>';
    return;
  }

  tasksToRender.forEach(task => {
    const taskElement = document.createElement('div');
    const taskKey = task.clientId || task.id;

    const status = (task.status || 'pending');
    const isAdminTask = !!task.adminTask;
    const isCompletedVisually = (status === 'completed' || status === 'approved');
    const statusClass = status.replace(/_/g, '-');

    // ✅ compute overdue FIRST (and only treat completed/approved as non-overdue)
    let isOverdue = false;
    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (!isNaN(due.getTime())) {
        const today = new Date();
        today.setHours(0,0,0,0);
        due.setHours(0,0,0,0);
        isOverdue = (due.getTime() < today.getTime()) && !isCompletedVisually;
      }
    }

    // checkbox state
    const checkedAttr = isCompletedVisually ? 'checked' : '';
    const disabledAttr = (!isParent && status === 'approved') ? 'disabled' : '';

    // UI pieces
    const canDelete = isParent || !isAdminTask;
    const canEdit   = isParent || !isAdminTask;

    const deleteButton = canDelete
      ? `<button onclick="removeTask('${taskKey}')" style="margin-left:auto;background:none;border:none;color:#dc3545;cursor:pointer;font-size:1.2em;">🗑️</button>`
      : `<span class="lock-icon" title="Only parents can delete this required task" style="margin-left:auto;color:#ffc107;">🔒</span>`;

    const editButton = canEdit
      ? `<button class="edit-button" onclick="editTask('${taskKey}')" style="margin-left:8px;background:none;border:none;color:#007bff;cursor:pointer;font-size:1.1em;">✏️</button>`
      : `<span title="Only parents can edit required tasks" style="margin-left:8px;color:#6c757d;font-size:1.1em;">🔒</span>`;

    const statusLabels = {
      pending: 'Pending',
      completed: 'Completed',
      approved: '✅ Approved',
      awaiting_approval: '⏳ Awaiting Approval'
    };
    const statusDisplay = statusLabels[status] || status;

    const needsApproval = isAdminTask && status === 'awaiting_approval';
    const approvalBadge = needsApproval
      ? `<span class="task-badge" style="background:#ffc107;color:#000;">Needs Parent Approval</span>`
      : '';

    const showApprove = isParent && status === 'awaiting_approval';
    const approveButton = showApprove
      ? `<button class="approve-button" onclick="approveTask('${taskKey}')" style="margin-left:10px;">✅ Approve</button>`
      : '';

    const lockIndicator = (isAdminTask && !isParent)
      ? `<span style="margin-left:8px;font-size:0.75em;color:#856404;">🔒 Required</span>`
      : '';

    const descriptionHtml = (task.description && task.description.trim())
      ? `<div style="margin-top:4px;font-size:0.85em;color:#666;font-style:italic;">📝 ${task.description}</div>`
      : '';

    // DD.MM.YYYY and turn red when overdue
    const dueLabel = task.dueDate
      ? `<span class="task-meta" style="${isOverdue ? 'color:#b71c1c;font-weight:600;' : ''}">
           📅 Due: ${formatDateDMY(task.dueDate)}
         </span>`
      : `<span class="task-meta">📅 No due date</span>`;

    taskElement.className =
      `task-item ${isCompletedVisually ? 'completed' : ''} ${isAdminTask ? 'admin-only' : ''} ${isOverdue ? 'overdue' : ''}`;

    taskElement.innerHTML = `
      <div class="task-row">
        <input type="checkbox" class="task-checkbox" ${checkedAttr} ${disabledAttr}
               onchange="toggleTask('${taskKey}')">
        <div style="flex:1;">
          <span class="task-title">${task.text}${lockIndicator}</span>
          ${descriptionHtml}
        </div>
        ${editButton}
        ${deleteButton}
      </div>
      <div class="task-details">
        ${dueLabel}
        <span class="task-status status-${statusClass}">${statusDisplay}</span>
        ${approvalBadge}
        ${approveButton}
      </div>
    `;

    // Visual hint for awaiting approval
    const cb = taskElement.querySelector('.task-checkbox');
    if (cb && status === 'awaiting_approval') cb.indeterminate = true;

    container.appendChild(taskElement);
  });
}

        function toggleAddTheme(subjectId) {
            const row = document.getElementById(`addThemeRow-${subjectId}`);
            if (!row) return;
            row.style.display = (row.style.display === 'none' || row.style.display === '') 
                ? 'flex' 
                : 'none';
        }

        function renderSubjects() {
  const container = document.getElementById('subjectsList');
  container.innerHTML = '';

  data.subjects.forEach((subject, subjectIndex) => {
    const subjectElement = document.createElement('div');
    subjectElement.className = 'subject-item';

    const themesHTML = subject.themes.map((theme, themeIndex) => {
      const ratingPct = ratingToPercent(theme.rating);

      // View vs Edit
      const editing = isThemeEditing(theme.id);

      // View text for description (trimmed)
      const descText = (theme.description || '').trim();
      const descView = descText
        ? `<div class="theme-desc-view">📝 ${descText}</div>`
        : `<div class="theme-desc-view" style="opacity:.7">📝 No description</div>`;

      const descEdit = `
        <div class="theme-desc-edit">
          <textarea id="themeDesc-${theme.id}"
            class="input-field"
            rows="2"
            placeholder="Add description..."
            onblur="(async()=>{await updateThemeDescription('${theme.id}', this.value)})()"
          >${descText}</textarea>
        </div>`;

      // Photo upload visible only in edit mode
      const photoGalleryId = `theme-photos-${theme.id}`;
      const photoUpload = `
        <div class="photo-upload-block">
          <input type="file" id="photoInput-${theme.id}" class="photo-input" accept="image/*"
                 onchange="handleThemePhotoUpload('${theme.id}', this)">
          <button class="photo-button"
                  onclick="document.getElementById('photoInput-${theme.id}').click()">📷 Upload Photo</button>
        </div>`;

      // Actions: View/Edit toggle
      const canEdit = (currentRole === 'student' || currentRole === 'parent');
      const editBtn = canEdit
        ? `<button class="submit-button" style="padding:6px 12px;font-size:.8em;"
             onclick="toggleThemeEdit('${theme.id}')">${editing ? '💾 Done' : '✏️ Edit'}</button>`
        : '';

      // Optional: delete (parent only)
      const delBtn = (currentRole === 'parent')
        ? `<button class="changes-button" style="padding:6px 12px;font-size:.8em;"
             onclick="deleteTheme('${theme.id}', ${subjectIndex}, ${themeIndex})">🗑️ Delete</button>`
        : '';

      // Build row
      return `
        <div class="theme-item ${editing ? 'editing' : ''}">
          <div class="theme-name">${theme.name}</div>

          <div class="progress-wrap">
            <div class="progress-bar">
              <div class="progress-fill" style="width:${ratingPct}%"></div>
            </div>
          </div>

          <div class="theme-slider-wrap">
            <input type="range" min="1" max="5" step="1"
              value="${theme.rating}"
              onchange="updateThemeRating(${subjectIndex}, ${themeIndex}, this.value)">
            <span class="progress-percentage">${ratingPct}%</span>
          </div>

          <div class="theme-actions">
            ${editBtn}
            ${delBtn}
          </div>

          ${editing ? descEdit : descView}

          <div id="${photoGalleryId}" class="photo-gallery"></div>
          ${photoUpload}
        </div>
      `;
    }).join('');

    // Add-new-theme row (unchanged, just kept)
    const canAddTheme = (currentRole === 'student' || currentRole === 'parent');
    const addRow = canAddTheme ? `
      <div style="margin-top:10px;">
        <a href="javascript:void(0)" onclick="toggleAddTheme('${subject.id}')"
           style="font-size:0.85em; color:#667eea; text-decoration:underline; cursor:pointer;">
           + Add Theme
        </a>
        <div id="addThemeRow-${subject.id}"
             style="display:none; margin-top:6px; gap:6px; align-items:center;">
          <input type="text" class="input-field" id="newTheme-${subject.id}" 
                 placeholder="New theme (topic)" style="flex:1; font-size:0.9em; padding:6px; max-width:360px;">
          <button class="add-button" style="padding:6px 12px; font-size:0.8em;" 
                  onclick="addThemeUI('${subject.id}')">Add</button>
        </div>
      </div>
    ` : '';

    subjectElement.innerHTML = `
      <div class="subject-item-name">${subject.name}</div>
      ${themesHTML}
      ${addRow}
    `;

    container.appendChild(subjectElement);

    // After render, (re)load photos for each theme
    subject.themes.forEach(theme => renderThemePhotos(theme.id));

});

    saveData();
    updateWeeklySummary();
}


        // Simple UI handler
            async function addThemeUI(subjectId) {
            const inp = document.getElementById(`newTheme-${subjectId}`);
            const value = (inp?.value || '').trim();
            if (!value) { alert('Please enter a theme name.'); return; }

            try {
                // Permission: students & parents allowed; block if someone else
                if (!(currentRole === 'student' || currentRole === 'parent')) {
                alert('You are not allowed to add themes.'); return;
                }
                await addThemeForSubject(subjectId, value);
                inp.value = '';
            } catch (e) {
                alert('❌ ' + (e.message || 'Could not add theme'));
            }
            }

            async function renderHomework() {
  const container = document.getElementById('homeworkList');
  if (!container) return;
  container.innerHTML = '';

  const today0 = new Date(); today0.setHours(0,0,0,0);

  for (let index = 0; index < data.homework.length; index++) {
    const hw = data.homework[index];

    // compute overdue
    let isOverdue = false;
    if (hw.dueDate) {
      const due = new Date(hw.dueDate);
      if (!isNaN(due.getTime())) {
        due.setHours(0,0,0,0);
        isOverdue = (due.getTime() < today0.getTime()) && hw.status !== 'approved';
      }
    }

    const status = hw.status || 'pending';
    const statusClass = status.replace(/_/g, '-');
    const isLocked = status === 'approved' && currentRole === 'student';

    // status label
    const statusLabels = {
      pending: 'Pending',
      submitted: 'Submitted',
      approved: '✅ Approved',
      changes_requested: 'Changes Required',
      awaiting_approval: '⏳ Awaiting Approval'
    };
    const statusBadge = `<span class="status-badge status-${statusClass}">${statusLabels[status] || status}</span>`;

    // due label (DD.MM.YYYY)
    const dueLabel = hw.dueDate
      ? `<br><small style="${isOverdue ? 'color:#b71c1c;font-weight:600;' : ''}">📅 Due: ${formatDateDMY(hw.dueDate)}</small>`
      : `<br><small>📅 No due date</small>`;

    // timestamps
    let timestampInfo = '';
    if (hw.submitted_at) {
      timestampInfo += `<br><small>📤 Submitted: ${formatDateDMY(hw.submitted_at)} ${new Date(hw.submitted_at).toLocaleTimeString('de-DE')}</small>`;
    }
    if (hw.approved_at) {
      timestampInfo += `<br><small>✅ Approved: ${formatDateDMY(hw.approved_at)} ${new Date(hw.approved_at).toLocaleTimeString('de-DE')}</small>`;
    }
    if (hw.comment && status === 'changes_requested') {
      timestampInfo += `<br><small style="color:#dc3545;">💭 Comment: ${hw.comment}</small>`;
    }
    if (isLocked) {
      timestampInfo += `<br><small style="color:#28a745;font-weight:600;">🔒 Homework is locked (approved by parent)</small>`;
    }

    // Build photo gallery (append as signed URLs resolve)
let photosHtml = '';
if (Array.isArray(hw.photos) && hw.photos.length > 0) {
  const containerId = `hw-photos-${hw.id}`;
  photosHtml = `<div class="photo-gallery" id="${containerId}"></div>`;

  // Resolve signed URLs in the background and append if found
  (async () => {
    const galleryEl = document.getElementById(containerId);
    if (!galleryEl) return;

    for (const p of hw.photos) {
      const signed = await getSignedPhotoUrl(p); // your corrected storage version
      if (!signed) continue;                      // skip non-existing paths silently
      const img = document.createElement('img');
      img.src = signed;
      img.alt = 'Homework photo';
      img.onclick = () => openPhotoModal(signed);
      galleryEl.appendChild(img);
    }
  })();
}

    // action buttons
    let actionButtons = '';
    const hasPhotos = Array.isArray(hw.photos) && hw.photos.length > 0;

    if (currentRole === 'student') {
      if (!isLocked) {
        actionButtons += `<button class="submit-button" onclick="openEditHomeworkModal(${index})" style="margin:3px;">✏️ Edit</button>`;
        actionButtons += `
          <div class="photo-upload" style="display:inline-block;margin:3px;">
            <input type="file" class="photo-input" id="photo-${index}" accept="image/*"
                   onchange="handlePhotoUpload(${index}, this)">
            <button class="photo-button" onclick="document.getElementById('photo-${index}').click()">
              📷 Upload Photo
            </button>
          </div>`;
        if (status === 'pending' && hasPhotos) {
          actionButtons += `<button class="submit-button" onclick="markHomeworkDone(${index})" style="margin:3px;background:#28a745;">✅ Mark as Done</button>`;
        }
        if (status === 'changes_requested') {
          actionButtons += `<button class="submit-button" onclick="submitHomework(${index})" style="margin:3px;">🔄 Resubmit</button>`;
        }
      } else {
        actionButtons += `<button class="submit-button" onclick="openEditHomeworkModal(${index})" style="margin:3px;background:#6c757d;">👁️ View Only</button>`;
      }
    } else if (currentRole === 'parent') {
      actionButtons += `<button class="submit-button" onclick="openEditHomeworkModal(${index})" style="margin:3px;">✏️ ${isLocked ? 'View' : 'Edit'}</button>`;
      if (status === 'submitted') {
        actionButtons += `<button class="approve-button" onclick="approveHomework(${index})" style="margin:3px;">✅ Approve</button>`;
        actionButtons += `<button class="changes-button" onclick="requestChanges(${index})" style="margin:3px;">🔄 Request Changes</button>`;
      }
      if (status === 'approved') {
        actionButtons += `<button class="changes-button" onclick="unapproveHomework(${index})" style="margin:3px;">↩️ Unapprove</button>`;
      }
    }

    // build the item
    const item = document.createElement('div');
    item.className = `homework-item ${hw.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} ${statusClass}`;
    item.innerHTML = `
      <div>
        <strong>${hw.subject}</strong> - ${hw.title}${statusBadge}
        ${dueLabel}
        ${hw.description ? `<br><small>${hw.description}</small>` : ''}
        ${timestampInfo}
        ${photosHtml}
      </div>
      <div class="homework-actions">
        ${actionButtons}
      </div>
    `;
    container.appendChild(item);
  }
}

        async function toggleTask(clientId) {
            const task = findTaskByClientId(clientId);
            if (!task) return;

            const isParent = currentRole === 'parent';
            const isAdminTask = task.adminTask;
            const currentStatus = task.status || 'pending';
            let nextStatus = currentStatus;

            console.log('Toggle task:', { clientId, currentStatus, isParent, isAdminTask });

            // Determine next status based on current status and role
            if (currentStatus === 'approved') {
                // Only parents can unapprove
                if (!isParent) {
                    alert('❌ Only parents can change approved tasks.');
                    renderTodayTasks();
                    return;
                }
                nextStatus = 'pending';
            } else if (currentStatus === 'awaiting_approval') {
                // Student clicking again = uncomplete
                // Parent clicking = should use approve button instead
                nextStatus = 'pending';
            } else if (currentStatus === 'completed') {
                // Uncomplete
                nextStatus = 'pending';
            } else {
                // pending -> completed or awaiting_approval
                if (isAdminTask && !isParent) {
                    // Required task by student -> awaiting approval
                    nextStatus = 'awaiting_approval';
                } else {
                    // Regular task or parent completing -> completed
                    nextStatus = 'completed';
                }
            }

            console.log('Status transition:', currentStatus, '->', nextStatus);

            // Update in database
            if (task.id) {
                const success = await setTaskStatusInSupabase(task.id, nextStatus);
                if (!success) {
                    alert('❌ Error updating task status');
                    renderTodayTasks();
                    return;
                }
            }

            // Update local state
            task.status = nextStatus;
            task.completed = ['completed', 'approved'].includes(nextStatus);
            
            if (nextStatus === 'approved') {
                task.approvedAt = new Date().toISOString();
            } else {
                task.approvedAt = null;
            }

            refreshTaskCollections();
            saveData();
            renderTodayTasks();
            await calculateWeeklyStats();
            await updateWeeklySummary();
        }


        async function approveTask(clientId) {
            if (currentRole !== 'parent') {
                alert('❌ Only parents can approve tasks.');
                return;
            }

            const task = findTaskByClientId(clientId);
            if (!task) {
                console.error('Task not found:', clientId);
                return;
            }
            
            if (task.status === 'approved') {
                console.log('Task already approved');
                return;
            }

            console.log('Approving task:', task.id, 'Status:', task.status);

            // Update in database
            if (task.id) {
                const success = await setTaskStatusInSupabase(task.id, 'approved');
                if (!success) {
                    alert('❌ Error approving task');
                    renderTodayTasks();
                    return;
                }
            }

            // Update local state
            task.status = 'approved';
            task.completed = true;
            task.approvedAt = new Date().toISOString();

            refreshTaskCollections();
            saveData();
            renderTodayTasks();
            await calculateWeeklyStats();
            await updateWeeklySummary();
            
            console.log('Task approved successfully');
        }

        async function toggleHomework(index) {
        const homework = data.homework[index];

        if (currentRole !== 'parent') {
            alert('❌ Only parents can approve or unapprove homework!');
            await renderHomework(); // reset UI
            return;
        }

        const newCompleted = !homework.completed;
        const newStatus = newCompleted ? 'approved' : 'pending';

        if (homework.id) {
            const success = await updateHomeworkStatusInSupabase(homework.id, newStatus);
            if (!success) {
            alert('Error updating homework');
            return;
            }
        }

        homework.completed = newCompleted;
        homework.status = newStatus;

        saveData();
        await renderHomework();
        renderTimetable();

        // 🔄 Always recalc
        await calculateWeeklyStats();
        await updateWeeklySummary();
        }

        // Phase 6: Status workflow functions
        async function submitHomework(index) {
            const homework = data.homework[index];
            
            if (!homework.photos || homework.photos.length === 0) {
                alert('❌ Bitte laden Sie zuerst Fotos hoch, bevor Sie die Hausaufgabe einreichen.');
                return;
            }
            
            const confirmSubmit = confirm('📤 Hausaufgabe zur Überprüfung einreichen?');
            if (!confirmSubmit) return;
            
            const newStatus = 'submitted';
            
            // Update in Supabase if we have an ID
            if (homework.id) {
                const success = await updateHomeworkStatusInSupabase(homework.id, newStatus);
                if (!success) {
                    alert('❌ Fehler beim Einreichen der Hausaufgabe');
                    return;
                }
            }
            
            // Update local data
            homework.status = newStatus;
            homework.submitted_at = new Date().toISOString();
            
            saveData();
            await renderHomework();
            alert('✅ Hausaufgabe erfolgreich eingereicht!');
        }

        async function approveHomework(index){ if(currentRole !== 'parent'){ alert('Nur Eltern können genehmigen.'); return; }
            const homework = data.homework[index];
            
            const confirmApprove = confirm('✅ Hausaufgabe genehmigen?');
            if (!confirmApprove) return;
            
            const newStatus = 'approved';
            
            // Update in Supabase if we have an ID
            if (homework.id) {
                const success = await updateHomeworkStatusInSupabase(homework.id, newStatus);
                if (!success) {
                    alert('❌ Fehler beim Genehmigen der Hausaufgabe');
                    return;
                }
            }
            
            // Update local data
            homework.status = newStatus;
            homework.approved_at = new Date().toISOString();
            homework.completed = true; // Mark as completed when approved
            
            saveData();
            await renderHomework();
            renderTimetable();
            await calculateWeeklyStats();
            await updateWeeklySummary();
            alert('✅ Homework approved!');
        }

        async function requestChanges(index){ if(currentRole !== 'parent'){ alert('Only parents can make changes!.'); return; }
            const homework = data.homework[index];
            
            const comment = prompt('💭 PLease enter your comments for the required chnages:');
            if (!comment) return;
            
            const newStatus = 'changes_requested';
            
            // Update in Supabase if we have an ID
            if (homework.id) {
                const success = await updateHomeworkStatusInSupabase(homework.id, newStatus);
                if (!success) {
                    alert('❌ Error');
                    return;
                }
            }
            
            // Update local data
            homework.status = newStatus;
            homework.comment = comment; // Store the comment
            homework.completed = false; // Unmark as completed
            
            saveData();
            await renderHomework();
            renderTimetable();
            await calculateWeeklyStats();
            await updateWeeklySummary();
            alert('📝 Changes approved!');
        }

        async function addNewTask() {
    const input = document.getElementById('newTaskInput');
    const dueInput = document.getElementById('newTaskDueDate');
    const descInput = document.getElementById('newTaskDescription'); // 🆕 New field
    
    const taskText = input.value.trim();
    if (!taskText) {
        alert('⚠️ Please enter a task name.');
        return;
    }

    const dueDate = (dueInput?.value || '').trim() || new Date().toISOString().split('T')[0];
    const description = (descInput?.value || '').trim(); // 🆕 Get description

    const draft = {
        text: taskText,
        description: description, // 🆕 Include description
        status: 'pending',
        adminTask: false,
        dueDate
    };

    const savedTask = await saveTaskToSupabase(draft);
    if (!savedTask) {
        alert('❌ Could not save task to Supabase');
        return;
    }

    const normalized = transformTasks([savedTask])[0];
    data.allTasks.push(normalized);
    refreshTaskCollections();

    input.value = '';
    if (dueInput) dueInput.value = dueDate;
    if (descInput) descInput.value = ''; // 🆕 Clear description

    saveData();
    renderTodayTasks();
    await calculateWeeklyStats();
    await updateWeeklySummary();
}
        window.addNewTask = addNewTask;

        async function addAdminTask() {
    const input = document.getElementById('adminTaskInput');
    const dueInput = document.getElementById('adminTaskDueDate');
    const descInput = document.getElementById('adminTaskDescription'); // 🆕 New field
    
    const taskText = input.value.trim();

    if (!taskText) {
        alert('⚠️ Please enter a task name.');
        return;
    }
    if (currentRole !== 'parent') {
        alert('❌ Only parents can add required tasks.');
        return;
    }

    const dueDate = (dueInput?.value || '').trim() || new Date().toISOString().split('T')[0];
    const description = (descInput?.value || '').trim(); // 🆕 Get description

    const draft = {
        text: taskText,
        description: description, // 🆕 Include description
        status: 'pending',
        adminTask: true,
        dueDate
    };

    const savedTask = await saveTaskToSupabase(draft);
    if (!savedTask) {
        alert('❌ Could not save required task.');
        return;
    }

    const normalized = transformTasks([savedTask])[0];
    data.allTasks.push(normalized);
    refreshTaskCollections();

    input.value = '';
    if (dueInput) dueInput.value = dueDate;
    if (descInput) descInput.value = ''; // 🆕 Clear description

    saveData();
    renderTodayTasks();
    await calculateWeeklyStats();
    await updateWeeklySummary();
}

        window.addAdminTask = addAdminTask;

        async function editTask(clientId) {
            const task = findTaskByClientId(clientId);
            if (!task) return;

            const isParent = currentRole === 'parent';
            const isAdminTask = task.adminTask;

            // 🔒 Block students from editing required tasks
            if (isAdminTask && !isParent) {
                alert('🔒 Only parents can edit required tasks.');
                return;
            }

            // Prompt for title
            const updatedTitle = prompt('Task name:', task.text || '');
            if (updatedTitle === null) return; // Cancelled
            const trimmedTitle = updatedTitle.trim();
            if (!trimmedTitle) {
                alert('⚠️ Task name cannot be empty.');
                return;
            }

            // 🆕 Prompt for description
            const updatedDescription = prompt('Description (optional):', task.description || '');
            if (updatedDescription === null) return; // Cancelled
            const trimmedDescription = updatedDescription.trim();

            // Prompt for due date
            const currentDue = task.dueDate ? formatDateDMY(task.dueDate) : '';
            const updatedDueInput = prompt(
                'Due date (DD.MM.YYYY, leave empty to clear):',
                currentDue
            );
            if (updatedDueInput === null) return; // Cancelled

            const trimmedDue = updatedDueInput.trim();
            let normalizedDue = null;
            
            if (trimmedDue) {
                // Parse DD.MM.YYYY format
                const parts = trimmedDue.split('.');
                if (parts.length === 3) {
                    const day = parseInt(parts[0], 10);
                    const month = parseInt(parts[1], 10) - 1; // JS months are 0-based
                    const year = parseInt(parts[2], 10);
                    const parsed = new Date(year, month, day);
                    
                    if (!isNaN(parsed.getTime())) {
                        normalizedDue = parsed.toISOString().split('T')[0];
                    } else {
                        alert('⚠️ Invalid date format. Please use DD.MM.YYYY');
                        return;
                    }
                } else {
                    alert('⚠️ Invalid date format. Please use DD.MM.YYYY');
                    return;
                }
            }

            // Check if anything changed
            const previousDue = task.dueDate || null;
            if (trimmedTitle === task.text && 
                trimmedDescription === (task.description || '') && 
                normalizedDue === previousDue) {
                return; // Nothing changed
            }

            // Update in database
            if (task.id) {
                const success = await updateTaskInSupabase(task.id, {
                    title: trimmedTitle,
                    description: trimmedDescription, // 🆕 Update description
                    dueDate: normalizedDue
                });
                if (!success) {
                    alert('❌ Could not update task.');
                    return;
                }
            }

            // Update local data
            task.text = trimmedTitle;
            task.description = trimmedDescription; // 🆕 Update local description
            task.dueDate = normalizedDue;
            
            refreshTaskCollections();
            saveData();
            renderTodayTasks();
            await calculateWeeklyStats();
            await updateWeeklySummary();
        }
        window.editTask = editTask;

        async function removeTask(clientId) {
            const taskIndex = getTaskIndexByClientId(clientId);
            if (taskIndex === -1) return;

            const task = data.allTasks[taskIndex];
            const isParent = currentRole === 'parent';

            // Check if student is trying to delete a required task
            if (task.adminTask && !isParent) {
                alert('❌ Only parents can delete required tasks!');
                return;
            }

            // Confirm deletion
            const confirmMsg = task.adminTask 
                ? '🔒 Delete this required task?' 
                : 'Delete this task?';
            
            if (!confirm(confirmMsg)) return;

            console.log('Deleting task:', { id: task.id, adminTask: task.adminTask, isParent });

            // Delete from database if it exists
            if (task.id) {
                const ok = await deleteTaskFromSupabase(task.id);
                if (!ok) {
                    alert('❌ Could not delete task from database.');
                    return;
                }
            }

            // Remove from local data
            data.allTasks.splice(taskIndex, 1);
            refreshTaskCollections();
            saveData();
            renderTodayTasks();
            await calculateWeeklyStats();
            await updateWeeklySummary();
            
            console.log('Task deleted successfully');
        }

        // Complete, updated function
    async function updateThemeRating(subjectIndex, themeIndex, rating) {
        // --- guards ---
        if (!data || !Array.isArray(data.subjects)) {
            console.error("❌ data.subjects is missing.");
            return false;
        }
        if (subjectIndex < 0 || subjectIndex >= data.subjects.length) {
            console.error("❌ subjectIndex out of range:", subjectIndex);
            return false;
        }
        const subject = data.subjects[subjectIndex];
        if (!subject || !Array.isArray(subject.themes)) {
            console.error("❌ subject.themes is missing for subjectIndex:", subjectIndex);
            return false;
        }
        if (themeIndex < 0 || themeIndex >= subject.themes.length) {
            console.error("❌ themeIndex out of range:", themeIndex);
            return false;
        }

        // --- sanitize rating ---
        rating = clampRating(rating);

        const theme = subject.themes[themeIndex];
        if (!theme || !theme.id) {
            alert("⚠️ Theme has no ID.");
            return false;
        }

        // --- compute today's date in Europe/Berlin (YYYY-MM-DD) ---
        // Using ISO-like "sv-SE" locale ensures zero-padded YYYY-MM-DD.
        const calendarDate = new Date().toLocaleString("sv-SE", {
            timeZone: "Europe/Berlin"
        }).slice(0, 10); // "YYYY-MM-DD"

        // --- optimistic UI update (with rollback on failure) ---
        const prev = { rating: theme.rating, progress: theme.progress };
        theme.rating = rating;
        theme.progress = ratingToPercent(rating);
        saveData();
        renderSubjects();

        // --- 1) Update themes.self_assessment ---
        const { error: errTheme } = await supabase
            .from("themes")
            .update({ self_assessment: rating })
            .eq("id", theme.id);

        if (errTheme) {
            console.error("❌ Error updating theme self_assessment:", errTheme);
            // rollback local state
            theme.rating = prev.rating;
            theme.progress = prev.progress;
            saveData();
            renderSubjects();
            alert("Error saving theme progress.");
            return false;
        }

        // --- 2) Upsert daily log into theme_updates (idempotent per user+date) ---
        const payload = {
            theme_id: theme.id,
            calendar_date: calendarDate,
            created_by: currentUser?.id ?? null
        };
        console.log("📤 Upserting into theme_updates:", payload);

        const { error: errUpdate } = await supabase
            .from("theme_updates")
            .upsert([payload], {
            onConflict: "theme_id,calendar_date,created_by"
            });

        if (errUpdate) {
            // Non-blocking: we already saved main value; just log the issue.
            console.error("❌ Error logging theme update:", errUpdate);
        }

        // --- 3) Finalize local state (already optimistic) ---
        // theme.rating & theme.progress already set; ensure persist + re-render
        saveData();
        renderSubjects();

        return true;
}

        async function updateWeeklySummary() {
            // Update basic task and homework counts
            document.getElementById('completedTasks').textContent = data.completedTasksWeek;
            document.getElementById('completedHomework').textContent = data.completedHomeworkWeek;
            
            // Calculate average theme progress
            let totalProgress = 0;
            let totalThemes = 0;
            data.subjects.forEach(subject => {
                subject.themes.forEach(theme => {
                    totalProgress += theme.progress;
                    totalThemes++;
                });
            });
            const averageProgress = totalThemes > 0 ? Math.round(totalProgress / totalThemes) : 0;
            document.getElementById('averageProgress').textContent = averageProgress + '%';
            
            // Phase 8: Add achievement information if available
            if (data.currentWeekAchievement) {
                const achievement = data.currentWeekAchievement;
                
                // Add achievement percentage to the display
                const achievementElement = document.getElementById('achievementPercentage');
                if (achievementElement) {
                    achievementElement.textContent = achievement.achievement_percentage + '%';
                }
                
                // Add daily achievements count
                const dailyAchievementsElement = document.getElementById('dailyAchievements');
                if (dailyAchievementsElement) {
                    const done = achievement.achievements_done ?? 0;
                    const total = achievement.achievements_total ?? 0;

                    if (total === 0) {
                        dailyAchievementsElement.textContent = 'No Achievements Today';
                        dailyAchievementsElement.style.color = '#6c757d'; // muted gray
                        dailyAchievementsElement.style.fontStyle = 'italic';
                    } else {
                        dailyAchievementsElement.textContent = `${done}/${total}`;
                        dailyAchievementsElement.style.color = '';       // reset default
                        dailyAchievementsElement.style.fontStyle = '';   // reset default
                    }
                }
                
                // Show full week achievement status
                const fullWeekElement = document.getElementById('fullWeekAchievement');
                if (fullWeekElement) {
                    fullWeekElement.textContent = achievement.full_week_achievement ? '✅ Complete' : '⏳ In Progress';
                    fullWeekElement.style.color = achievement.full_week_achievement ? '#28a745' : '#ffc107';
                }
            }
        }

        function resetWeeklyStats() {
            if (currentRole === 'parent') {
                const confirm = window.confirm('Delete all stats?');
                if (confirm) {
                    data.completedTasksWeek = 0;
                    data.completedHomeworkWeek = 0;
                    saveData();
                    updateWeeklySummary();
                    alert('✅ Stats deleted!');
                }
            }
        }

        function updateThemeProgress(subjectIndex, themeIndex, percentLikeValue){
  // Accept 0..100 and convert to 1..5
  const rating = percentToRating(percentLikeValue);
  return updateThemeRating(subjectIndex, themeIndex, rating);
}

        function resetAllProgress() {
            if (currentRole === 'parent') {
                const confirm = window.confirm('Delete all progress for all Subjects?');
                if (confirm) {
                    data.subjects.forEach(subject => {
                        subject.themes.forEach(theme => {
                            theme.progress = 0;
                        });
                    });
                    saveData();
                    renderSubjects();
                    updateWeeklySummary();
                    alert('✅ All progress deleted!');
                }
            }
        }

        async function clearCompletedHomework() {
            if (currentRole === 'parent') {
                const completed = data.homework.filter(hw => hw.completed);
                if (completed.length === 0) {
                alert('ℹ️ No completed homework found to delete.');
                return;
                }
                const confirm = window.confirm(`${completed.length} completed homework will be deleted. Continue?`);
                if (!confirm) return;

                for (const hw of completed) {
                if (hw.id) {
                    const ok = await deleteHomeworkFromSupabase(hw.id);
                    if (!ok) {
                    alert(`❌ Could not delete homework "${hw.title}" from database.`);
                    continue;
                    }
                }
                }

                // Update local model after DB success
                data.homework = data.homework.filter(hw => !hw.completed);
                saveData();
                await renderHomework();
                renderTimetable();

                // 🔄 Always refresh achievements from DB
                await calculateWeeklyStats();
                await updateWeeklySummary();

                alert('✅ Completed homework deleted!');
                }
            }

        function openAddSubjectModal() {
            if (currentRole !== 'parent') {
                alert('❌ Nur Eltern können Fächer hinzufügen!');
                return;
            }
            document.getElementById('addSubjectModal').style.display = 'block';
        }

        function openAddHomeworkModal() {
    if (currentRole !== 'student') {
        alert('❌ Only students can add homework!');
        return;
    }
    populateHomeworkSubjects();
    // Set today's date as default due date
    const today = new Date().toISOString().split('T')[0];
    const dueEl = document.getElementById('homeworkDueDate');
    if (dueEl) dueEl.value = today;
    
    document.getElementById('addHomeworkModal').style.display = 'block';
}

function openEditHomeworkModal(index) {
    const hw = data.homework[index];
    if (!hw) return;

    const isLocked = hw.status === 'approved' && currentRole === 'student';

    // Populate modal fields
    document.getElementById('homeworkSubject').value = hw.subject;
    document.getElementById('homeworkTitle').value = hw.title;
    document.getElementById('homeworkDueDate').value = hw.dueDate;
    document.getElementById('homeworkDescription').value = hw.description || '';

    // 🔒 Disable fields if locked
    if (isLocked) {
        document.getElementById('homeworkSubject').disabled = true;
        document.getElementById('homeworkTitle').disabled = true;
        document.getElementById('homeworkDueDate').disabled = true;
        document.getElementById('homeworkDescription').disabled = true;
        
        // Hide save button, show message
        const saveButton = document.querySelector('#addHomeworkModal .add-button');
        if (saveButton) {
            saveButton.style.display = 'none';
        }
        
        // Add lock message
        const modal = document.getElementById('addHomeworkModal');
        let lockMsg = modal.querySelector('.lock-message');
        if (!lockMsg) {
            lockMsg = document.createElement('div');
            lockMsg.className = 'lock-message';
            lockMsg.style.cssText = 'background: #d4edda; color: #155724; padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #c3e6cb;';
            lockMsg.innerHTML = '🔒 <strong>This homework is approved and locked.</strong><br>Only parents can make changes.';
            modal.querySelector('.modal-content').insertBefore(lockMsg, modal.querySelector('.input-field'));
        }
    } else {
        // Enable fields
        document.getElementById('homeworkSubject').disabled = false;
        document.getElementById('homeworkTitle').disabled = false;
        document.getElementById('homeworkDueDate').disabled = false;
        document.getElementById('homeworkDescription').disabled = false;
        
        // Show save button
        const saveButton = document.querySelector('#addHomeworkModal .add-button');
        if (saveButton) {
            saveButton.style.display = 'inline-block';
        }
        
        // Remove lock message if exists
        const lockMsg = document.querySelector('#addHomeworkModal .lock-message');
        if (lockMsg) lockMsg.remove();
    }

    // Store index in modal for saving
    const modal = document.getElementById('addHomeworkModal');
    modal.dataset.editIndex = index;
    
    // Show existing photos in edit mode
    displayPhotosInEditModal(hw);

    modal.style.display = 'block';
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
    if (modalId === 'addHomeworkModal') {
        delete modal.dataset.editIndex; // reset edit mode
    }
}

        function openPhotoModal(imageUrl) {
            document.getElementById('photoModalImage').src = imageUrl;
            document.getElementById('photoModal').style.display = 'block';
        }

        function closePhotoModal() {
            document.getElementById('photoModal').style.display = 'none';
            document.getElementById('photoModalImage').src = '';
        }

        // Close photo modal when clicking outside the image
        document.addEventListener('click', function(event) {
            const modal = document.getElementById('photoModal');
            if (event.target === modal) {
                closePhotoModal();
            }
        });

        // System Health Functions
        function updateSystemHealth() {
            const now = new Date();
            const uptime = Math.floor((now - systemHealth.sessionStart) / (1000 * 60)); // minutes
            
            // Update display
            document.getElementById('lastSyncTime').textContent = 
                systemHealth.lastSync ? systemHealth.lastSync.toLocaleString('en-US') : 'Not yet';
            
            document.getElementById('lastError').textContent = 
                systemHealth.lastError || 'None';
                
            document.getElementById('dbStatus').textContent = 
                systemHealth.dbConnected ? 'Connected' : 'Disconnected';
                
            document.getElementById('storageStatus').textContent = 
                systemHealth.storageAvailable ? 'Available' : 'Not available';
                
            document.getElementById('sessionUptime').textContent = uptime + 'm';
            
            // Update sync status
            const timeSinceSync = systemHealth.lastSync ? 
                Math.floor((now - systemHealth.lastSync) / (1000 * 60)) : null;
            
            let syncStatus = 'Initializing...';
            let statusColor = '#6c757d';
            
            if (systemHealth.lastSync) {
                if (timeSinceSync < 5) {
                    syncStatus = 'Current';
                    statusColor = '#28a745';
                } else if (timeSinceSync < 30) {
                    syncStatus = 'Recent';
                    statusColor = '#ffc107';
                } else {
                    syncStatus = 'Outdated';
                    statusColor = '#dc3545';
                }
            }
            
            const lastSyncElement = document.getElementById('lastSyncStatus');
            lastSyncElement.textContent = syncStatus;
            lastSyncElement.style.color = statusColor;
            
            // Update system status
            let systemStatus = 'Ready';
            let systemColor = '#28a745';
            
            if (!systemHealth.dbConnected) {
                systemStatus = 'Offline';
                systemColor = '#dc3545';
            } else if (systemHealth.errorCount > 0) {
                systemStatus = 'Warning';
                systemColor = '#ffc107';
            }
            
            const systemStatusElement = document.getElementById('systemStatus');
            systemStatusElement.textContent = systemStatus;
            systemStatusElement.style.color = systemColor;
        }

        function recordSync(successful = true) {
            systemHealth.lastSync = new Date();
            systemHealth.syncCount++;
            if (successful) {
                systemHealth.dbConnected = true;
            }
            updateSystemHealth();
        }

        function recordError(error, context = '') {
            systemHealth.lastError = `${context}: ${error.message || error}`;
            systemHealth.errorCount++;
            console.error('System Health Error:', error, 'Context:', context);
            updateSystemHealth();
        }

        function toggleSystemHealth() {
            const details = document.getElementById('systemHealthDetails');
            const isVisible = details.style.display !== 'none';
            details.style.display = isVisible ? 'none' : 'block';
            updateSystemHealth(); // Refresh data when showing
        }

        // Test database and storage connectivity
        async function checkSystemHealth() {
            try {
                // Test database connection
                const { data, error } = await supabase.from('calendar').select('count').limit(1);
                if (error) throw error;
                systemHealth.dbConnected = true;
                recordSync(true);
            } catch (error) {
                systemHealth.dbConnected = false;
                recordError(error, 'Database connectivity test');
            }
            
            try {
                // Test storage availability
                const { data, error } = await supabase.storage.from('homework-photos').list('', { limit: 1 });
                systemHealth.storageAvailable = !error;
            } catch (error) {
                systemHealth.storageAvailable = false;
                recordError(error, 'Storage connectivity test');
            }
            
            updateSystemHealth();
        }

        async function addSubject() {
            const name = document.getElementById('subjectName').value.trim();
            const themesText = document.getElementById('subjectThemes').value.trim();

            if (!name) {
                alert("⚠️ Please enter a Subject name.");
                return;
            }

            // Save subject to Supabase
            const savedSubject = await saveSubjectToSupabase({ name });
            if (!savedSubject) {
                alert("❌ Error saving subject");
                return;
            }

            // Save themes if provided
            const themes = [];
            if (themesText) {
                const themeNames = themesText.split(',').map(theme => theme.trim());
                for (const themeName of themeNames) {
                    const savedTheme = await saveThemeToSupabase({ name: themeName, rating: 1 }, savedSubject.id);
                    if (savedTheme) {
                        themes.push({
                            id: savedTheme.id,
                            name: themeName,
                            rating: 1,
                            progress: ratingToPercent(1) // 20%
                        });
                    }
                }
            }

            // Add to local data
            data.subjects.push({
                id: savedSubject.id,
                name,
                themes
            });

            saveData();
            renderSubjects();
            populateHomeworkSubjects();
            populateTimetableSubjects();
            closeModal('addSubjectModal');

            // Clear inputs
            document.getElementById('subjectName').value = '';
            document.getElementById('subjectThemes').value = '';
        }

        function populateHomeworkSubjects() {
            const select = document.getElementById('homeworkSubject');
            select.innerHTML = '<option value="">Select Subject...</option>';
            data.subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject.name;
                option.textContent = subject.name;
                select.appendChild(option);
            });
        }

        async function addHomework() {
    const modal = document.getElementById('addHomeworkModal');
    const editIndex = modal.dataset.editIndex; // will exist if editing

    const subjectEl = document.getElementById('homeworkSubject');
    const titleEl = document.getElementById('homeworkTitle');
    const dueEl = document.getElementById('homeworkDueDate');
    const descEl = document.getElementById('homeworkDescription');

    const subjectName = subjectEl.value;
    const title = titleEl.value.trim();
    const dueDate = dueEl.value;
    const description = descEl.value.trim();

    if (!subjectName) { alert("⚠️ Please select a Subject."); return; }
    if (!title) { alert("⚠️ Please enter a Homework Title."); return; }
    if (!dueDate) { alert("⚠️ Please pick a Due Date."); return; }

    const subject = data.subjects.find(s => s.name === subjectName);
    if (!subject) { alert("⚠️ Subject not found."); return; }

    if (editIndex) {
        // === EDIT EXISTING HOMEWORK ===
        const hw = data.homework[editIndex];
        if (!hw) return;

        // Update local model
        hw.subject = subjectName;
        hw.subject_id = subject.id;
        hw.title = title;
        hw.dueDate = dueDate;
        hw.description = description;

        // Update in DB
        const { error } = await supabase
            .from('homework')
            .update({
                subject_id: subject.id,
                title,
                due_date: dueDate,
                description
            })
            .eq('id', hw.id);

        if (error) {
            console.error('Error updating homework:', error);
            alert('❌ Error updating homework');
            return;
        }

        delete modal.dataset.editIndex; // clear edit mode
    } else {
        // === CREATE NEW HOMEWORK ===
        const newHomework = {
            subject_id: subject.id,
            title,
            dueDate,
            description
        };

        const savedHomework = await saveHomeworkToSupabase(newHomework);
        if (!savedHomework) {
            alert('❌ Error saving homework');
            return;
        }

        data.homework.push({
            id: savedHomework.id,
            subject: subjectName,
            subject_id: subject.id,
            title,
            dueDate,
            description,
            completed: false,
            status: 'pending'
        });
    }

    saveData();
    await renderHomework();
    renderTimetable();
    closeModal('addHomeworkModal');

    // Clear inputs
    subjectEl.value = '';
    titleEl.value = '';
    dueEl.value = '';
    descEl.value = '';
    await calculateWeeklyStats();
    await updateWeeklySummary();
}

async function handlePhotoUpload(homeworkIndex, input) {
    const file = input.files[0];
    if (!file) return;
    
    const homework = data.homework[homeworkIndex];
    
    // 🔒 Block if approved
    if (homework.status === 'approved' && currentRole === 'student') {
        alert('🔒 Cannot upload photos to approved homework.');
        input.value = '';
        return;
    }
    
    if (!homework.id) {
        alert('❌ Please save the homework first before uploading photos.');
        input.value = '';
        return;
    }
    
    const uploadButton = input.nextElementSibling;
    const originalButtonText = uploadButton.textContent;
    uploadButton.textContent = '📤 Uploading...';
    uploadButton.disabled = true;
    
    console.log('Starting photo upload for homework:', homework.id);
    
    try {
        const filePath = await uploadHomeworkPhoto(homework.id, file);
        console.log('Upload result - filePath:', filePath);
        
        if (filePath) {
            const success = await saveHomeworkPhotoPath(homework.id, filePath);
            console.log('Save photo path result:', success);
            
            if (success) {
                uploadButton.textContent = '✅ Uploaded';
                
                if (!Array.isArray(homework.photos)) {
                    homework.photos = [];
                }
                homework.photos.push(filePath);
                saveData();
                
                await renderHomework();
                
                console.log('Photo uploaded successfully');
            } else {
                throw new Error('Failed to save photo path to database');
            }
        } else {
            throw new Error('Failed to upload photo to storage');
        }
        
    } catch (error) {
        console.error('Photo upload error:', error);
        uploadButton.textContent = '❌ Upload Failed';
        alert('❌ Photo upload failed: ' + error.message);
    } finally {
        input.value = '';
        uploadButton.disabled = false;
        setTimeout(() => {
            if (uploadButton.textContent.includes('Uploaded')) {
                uploadButton.textContent = originalButtonText;
            }
        }, 3000);
    }
}

async function updateThemeDescription(themeId, newDescription) {
  const { error } = await supabase
    .from('themes')
    .update({ description: newDescription })
    .eq('id', themeId);

  if (error) {
    console.error('Error updating theme description:', error);
    alert('❌ Could not update description.');
    return false;
  }
  recordSync(true);
  return true;
}


        // Event listeners
        document.addEventListener('DOMContentLoaded', function() {
            // Allow Enter key to add tasks
            document.getElementById('newTaskInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    addNewTask();
                }
            });
            
            
            
          
        });

        // Close modals when clicking outside
        window.onclick = function(event) {
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }

        // Initialize the app when page loads
        init().catch(error => {
            console.error('Failed to initialize app:', error);
        });
    

<script>
(function(){
  // Parse URL hash into an object
  function parseHashParams() {
    const h = window.location.hash.replace(/^#/, '');
    const obj = {};
    h.split('&').forEach(kv => {
      const [k, v] = kv.split('=');
      if (k) obj[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return obj;
  }
  // Needs a client
  if (typeof window.supabase === 'undefined') return;
  try {
    const params = parseHashParams();
    if (params.access_token && params.refresh_token) {
      const supa = supabase;
      supa.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token
      }).then(({ data, error }) => {
        // Clean URL
        if (window.history && window.history.replaceState) {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
        } else {
          window.location.hash = '';
        }
        if (error) {
          console.error('setSession error', error);
          return;
        }
        // Redirect or proceed
        if (typeof bootstrapRole==='function') bootstrapRole();
      });
    }
  } catch(e){
    console.error('Auth hash handler error', e);
  }
})();



<!-- Diagnostics Overlay -->
<div id="diag" style="position:fixed;bottom:10px;right:10px;background:rgba(0,0,0,.75);color:#fff;padding:10px 12px;border-radius:8px;font:12px system-ui;z-index:9999;max-width:360px">
  <div><strong>Diag</strong> <span id="diagStatus">init…</span></div>
  <div style="opacity:.8">URL: <span id="diagUrl"></span></div>
  <div style="opacity:.8">Session: <span id="diagSess">n/a</span></div>
  <div style="opacity:.8">User: <span id="diagUser">n/a</span></div>
  <div style="opacity:.8">Role: <span id="diagRole">n/a</span></div>
</div>
<script>
(async function(){
  const $ = (id)=>document.getElementById(id);
  try {
    $("#diagUrl").textContent = location.pathname;
    if (typeof SUPABASE_CONFIG === 'undefined' || !SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
      $("#diagStatus").textContent = '❌ Missing SUPABASE config (SUPABASE_CONFIG.url/anonKey)';
      return;
    }
    if (typeof window.supabase === 'undefined') {
      $("#diagStatus").textContent = '❌ Supabase JS missing';
      return;
    }
    const supa = supabase;
    // Use hash tokens if present
    try {
      const h = location.hash.replace(/^#/,'').split('&').reduce((a,p)=>{const[k,v]=p.split('='); if(k){a[decodeURIComponent(k)]=decodeURIComponent(v||'')} return a},{});
      if (h.access_token && h.refresh_token) {
        const { error } = await supa.auth.setSession({ access_token: h.access_token, refresh_token: h.refresh_token });
        if (!error && history.replaceState) history.replaceState({}, document.title, location.pathname);
      }
    } catch (e) {}
    const { data: { session } } = await supa.auth.getSession();
    $("#diagSess").textContent = session ? 'ok' : 'none';
    $("#diagUser").textContent = session?.user?.id || 'n/a';
    // Try to read role
    if (session?.user?.id) {
      const { data: prof, error } = await supa.from('profiles').select('role').eq('id', session.user.id).single();
      if (error) {
        $("#diagRole").textContent = 'err';
        $("#diagStatus").textContent = '⚠️ DB error: ' + error.message;
      } else {
        $("#diagRole").textContent = prof?.role || '(none)';
        $("#diagStatus").textContent = '✅';
      }
    } else {
        const uiRole = (window.currentRole || (typeof currentRole !== 'undefined' ? currentRole : ''));
        $("#diagRole").textContent = uiRole || '(none)';
        $("#diagStatus").textContent = '✅';
    }
  } catch(e){
    try { $("#diagStatus").textContent = '❌ ' + (e.message || e); } catch {}
  }
})();



<script>
// ---- Patch Block: Role/UI + Missing Handlers (injected by assistant) ----
// Safer query helpers
function $(sel, ctx=document){ return ctx.querySelector(sel); }
function $all(sel, ctx=document){ return Array.from(ctx.querySelectorAll(sel)); }

// Toggle login section visibility
if (typeof window.toggleLoginSection !== 'function') {
  window.toggleLoginSection = function(){
    const el = document.getElementById('loginSection');
    if (!el) return;
    const cur = (el.style.display || '').trim();
    el.style.display = (cur === 'none' || cur === '') ? 'block' : 'none';
  };
}

// Override updateRoleDisplay to actually show/hide admin/parent controls
(function(){
  function _updateRoleDisplay(){
    try{
      const role = ((typeof currentRole !== 'undefined' && currentRole) ? currentRole : (window.currentRole || 'student')).trim();
      const adminControls = $all('.admin-controls');
      const adminAccessBtn = document.getElementById('adminAccessBtn');
      const changePasswordBtn = document.getElementById('changePasswordBtn');
      const roleIndicator = document.getElementById('roleIndicator');  // <-- added

      // NEW: update the pill text
      if (roleIndicator) {
        roleIndicator.textContent = (role === 'parent') ? '👨‍👩‍👧‍👦 Parents' : '👧 Student';
      }

      if (role === 'parent'){
        adminControls.forEach(el => el.style.display = 'block');
        if (adminAccessBtn) adminAccessBtn.style.display = 'none';
        if (changePasswordBtn) changePasswordBtn.style.display = 'inline-block';
      } else {
        adminControls.forEach(el => el.style.display = 'none');
        if (adminAccessBtn) adminAccessBtn.style.display = 'inline-block';
        if (changePasswordBtn) changePasswordBtn.style.display = 'none';
      }
    }catch(e){ console.warn('updateRoleDisplay patch error:', e); }
  }

  // Normalize role synonyms if any legacy 'admin' value is used
  document.addEventListener('DOMContentLoaded', () => {
    if (window.currentRole === 'admin') window.currentRole = 'parent';
    if (typeof window.updateRoleDisplay === 'function') window.updateRoleDisplay();
  });
})();

async function deleteTaskFromSupabase(taskId) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);
  if (error) {
    console.error('Task delete error:', error);
    return false;
  }
  recordSync(true);
  return true;
}
async function deleteHomeworkFromSupabase(homeworkId) {
  const { error } = await supabase
    .from('homework')
    .delete()
    .eq('id', homeworkId);
  if (error) {
    console.error('Homework delete error:', error);
    return false;
  }
  recordSync(true);
  return true;
}

async function markHomeworkDone(index) {
    const homework = data.homework[index];
    
    if (!homework.photos || homework.photos.length === 0) {
        alert('❌ Please upload photos before marking as done.');
        return;
    }
    
    const confirmSubmit = confirm('📤 Submit homework for approval?');
    if (!confirmSubmit) return;
    
    const newStatus = 'submitted';
    
    // Update in Supabase
    if (homework.id) {
        const success = await updateHomeworkStatusInSupabase(homework.id, newStatus);
        if (!success) {
            alert('❌ Error submitting homework');
            return;
        }
    }
    
    // Update local data
    homework.status = newStatus;
    homework.submitted_at = new Date().toISOString();
    
    saveData();
    await renderHomework();
    alert('✅ Homework submitted for approval!');
}

async function unapproveHomework(index) {
    if (currentRole !== 'parent') {
        alert('❌ Only parents can unapprove homework.');
        return;
    }
    
    const homework = data.homework[index];
    const confirmUnapprove = confirm('↩️ Unapprove this homework and set back to pending?');
    if (!confirmUnapprove) return;
    
    const newStatus = 'pending';
    
    // Update in Supabase
    if (homework.id) {
        const success = await updateHomeworkStatusInSupabase(homework.id, newStatus);
        if (!success) {
            alert('❌ Error unapproving homework');
            return;
        }
    }
    
    // Update local data
    homework.status = newStatus;
    homework.approved_at = null;
    homework.completed = false;
    
    saveData();
    await renderHomework();
    renderTimetable();
    await calculateWeeklyStats();
    await updateWeeklySummary();
}

async function displayPhotosInEditModal(theme) {
  if (!theme?.id) {
    console.error("displayPhotosInEditModal: missing theme.id");
    alert("⚠️ Can't open photos: theme has no ID.");
    return;
  }

  // --- Ensure modal structure exists ---
  let modal = document.getElementById("editModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "editModal";
    modal.style.cssText = `
      position: fixed; inset: 0; display: none; z-index: 1000;
      background: rgba(0,0,0,.5); padding: 24px; overflow:auto;
    `;
    modal.innerHTML = `
      <div id="editModalCard" style="
        max-width: 960px; margin: auto; background:#fff; border-radius:16px;
        box-shadow: 0 10px 32px rgba(0,0,0,.18); overflow: hidden;">
        <div style="display:flex; align-items:center; justify-content:space-between; padding:16px 20px; border-bottom:1px solid #eee;">
          <h3 id="editModalTitle" style="margin:0; font-size:18px; font-weight:600;"></h3>
          <button id="editModalClose" aria-label="Close" style="border:0;background:transparent;font-size:20px;cursor:pointer">✕</button>
        </div>
        <div id="editModalBody" style="padding:16px 20px;">
          <div id="editPhotosToolbar" style="display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="opacity:.8;font-size:14px">Manage photos for this theme</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <label style="font-size:14px;border:1px solid #ddd;padding:6px 10px;border-radius:8px;cursor:pointer;">
                Upload…
                <input id="editPhotosUpload" type="file" accept="image/*" multiple style="display:none">
              </label>
              <button id="refreshPhotosBtn" style="border:1px solid #ddd;background:#fafafa;padding:6px 10px;border-radius:8px;cursor:pointer;">Refresh</button>
            </div>
          </div>
          <div id="editPhotosGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;"></div>
          <div id="editPhotosEmpty" style="display:none;text-align:center;padding:40px 12px;color:#666;">No photos yet.</div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const titleEl = modal.querySelector("#editModalTitle");
  const gridEl  = modal.querySelector("#editPhotosGrid");
  const emptyEl = modal.querySelector("#editPhotosEmpty");
  const closeEl = modal.querySelector("#editModalClose");
  const uploadEl = modal.querySelector("#editPhotosUpload");
  const refreshBtn = modal.querySelector("#refreshPhotosBtn");

  titleEl.textContent = `Photos — ${theme.name ?? ("Theme #" + theme.id)}`;

  // --- Open modal ---
  modal.style.display = "block";
  closeEl.onclick = () => { modal.style.display = "none"; };
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  }, { once: true });

  // --- Helpers ---
  function setLoading(isLoading) {
    if (isLoading) {
      gridEl.innerHTML = `
        <div style="grid-column:1/-1;display:flex;gap:10px;align-items:center;justify-content:center;padding:20px;color:#666;">
          <span class="spinner" style="width:16px;height:16px;border:2px solid #ccc;border-top-color:#333;border-radius:50%;display:inline-block;animation:spin 1s linear infinite"></span>
          Loading photos…
        </div>
      `;
      // lightweight keyframes (injected once)
      if (!document.getElementById("spinKeyframes")) {
        const s = document.createElement("style");
        s.id = "spinKeyframes";
        s.textContent = `@keyframes spin {to {transform: rotate(360deg)}}`;
        document.head.appendChild(s);
      }
    }
  }

  function humanDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return ""; }
  }

  function ensureLightbox() {
    let lb = document.getElementById("photoLightbox");
    if (lb) return lb;
    lb = document.createElement("div");
    lb.id = "photoLightbox";
    lb.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;z-index:1100;align-items:center;justify-content:center;padding:24px;";
    lb.innerHTML = `
      <figure style="max-width: min(96vw,1200px); max-height: 90vh; margin:0; display:flex; flex-direction:column; gap:8px; align-items:center;">
        <img id="lbImg" alt="" style="max-width:100%; max-height:80vh; object-fit:contain; border-radius:8px;"/>
        <figcaption id="lbCap" style="color:#ddd; font-size:14px; text-align:center;"></figcaption>
        <button id="lbClose" style="margin-top:8px;border:0;background:#fff;padding:8px 12px;border-radius:8px;cursor:pointer;">Close</button>
      </figure>
    `;
    lb.addEventListener("click", (e) => {
      if (e.target === lb) lb.style.display = "none";
    });
    lb.querySelector("#lbClose").onclick = () => (lb.style.display = "none");
    document.body.appendChild(lb);
    return lb;
  }

  function showPreview(url, caption = "") {
    const lb = ensureLightbox();
    lb.querySelector("#lbImg").src = url;
    lb.querySelector("#lbCap").textContent = caption;
    lb.style.display = "flex";
  }

  async function fetchPhotos() {
    setLoading(true);
    emptyEl.style.display = "none";

    // 1) Get DB rows
    const { data: rows, error } = await supabase
      .from("photos")
      .select("id, theme_id, storage_path, caption, created_at")
      .eq("theme_id", theme.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ fetch photos error:", error);
      gridEl.innerHTML = `<div style="grid-column:1/-1;padding:20px;color:#b00;background:#fff5f5;border:1px solid #f0c2c2;border-radius:8px;">Error loading photos.</div>`;
      return [];
    }

    if (!rows || rows.length === 0) {
      gridEl.innerHTML = "";
      emptyEl.style.display = "block";
      return [];
    }

    // 2) Map to URLs
    const list = rows.map((r) => {
      // If bucket is public:
      const { data: pub } = supabase.storage.from("theme-photos").getPublicUrl(r.storage_path);
      return {
        ...r,
        url: pub?.publicUrl || "",
      };
    });

    // 3) Render
    gridEl.innerHTML = "";
    for (const p of list) {
      const card = document.createElement("div");
      card.style.cssText = "border:1px solid #eee;border-radius:12px;overflow:hidden;background:#fff;display:flex;flex-direction:column;";

      const img = document.createElement("img");
      img.src = p.url;
      img.alt = p.caption || "";
      img.loading = "lazy";
      img.style.cssText = "width:100%;aspect-ratio:1/1;object-fit:cover;cursor:pointer;";
      img.onclick = () => showPreview(p.url, p.caption || "");

      const meta = document.createElement("div");
      meta.style.cssText = "padding:10px;display:flex;flex-direction:column;gap:6px;";

      const cap = document.createElement("div");
      cap.style.cssText = "font-size:13px;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      cap.title = p.caption || "";
      cap.textContent = p.caption || "—";

      const sub = document.createElement("div");
      sub.style.cssText = "font-size:12px;color:#777;";
      sub.textContent = humanDate(p.created_at);

      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:6px;margin-top:6px;";

      const btnDownload = document.createElement("button");
      btnDownload.textContent = "Download";
      btnDownload.style.cssText = "border:1px solid #ddd;background:#fafafa;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12px;";
      btnDownload.onclick = () => {
        const a = document.createElement("a");
        a.href = p.url;
        a.download = p.storage_path.split("/").pop() || "photo.jpg";
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      const btnDelete = document.createElement("button");
      btnDelete.textContent = "Delete";
      btnDelete.style.cssText = "border:1px solid #f1c4c4;background:#fff5f5;color:#b00;padding:6px 8px;border-radius:8px;cursor:pointer;font-size:12px;";
      btnDelete.onclick = async () => {
        if (!confirm("Delete this photo? This cannot be undone.")) return;

        // 1) Delete DB row
        const { error: dbErr } = await supabase.from("photos").delete().eq("id", p.id);
        if (dbErr) {
          console.error("❌ delete DB error:", dbErr);
          alert("Error deleting photo record.");
          return;
        }

        // 2) Remove from storage
        const { error: stErr } = await supabase.storage.from("theme-photos").remove([p.storage_path]);
        if (stErr) {
          console.error("❌ delete storage error (file may remain):", stErr);
          // We still proceed; user can refresh.
        }

        // 3) Refresh list
        await fetchPhotos();
      };

      actions.appendChild(btnDownload);
      actions.appendChild(btnDelete);

      meta.appendChild(cap);
      meta.appendChild(sub);
      meta.appendChild(actions);

      card.appendChild(img);
      card.appendChild(meta);
      gridEl.appendChild(card);
    }

    return list;
  }

  async function uploadFiles(files) {
    if (!files || files.length === 0) return;

    // Basic UI lock
    uploadEl.disabled = true;
    refreshBtn.disabled = true;

    try {
      for (const file of files) {
        // Unique path: themeId/yyyy-mm/fileName
        const date = new Date();
        const ym = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
        const storagePath = `${theme.id}/${ym}/${safeName}`;

        // 1) Upload
        const { error: upErr } = await supabase.storage.from("theme-photos").upload(storagePath, file, {
          upsert: false,
          contentType: file.type || "image/jpeg",
        });
        if (upErr) {
          console.error("❌ upload error:", upErr);
          alert(`Upload failed for ${file.name}`);
          continue;
        }

        // 2) Insert DB row
        const { error: insErr } = await supabase.from("photos").insert({
          theme_id: theme.id,
          storage_path: storagePath,
          caption: file.name,
        });
        if (insErr) {
          console.error("❌ insert photo row error:", insErr);
          alert(`Saved file but couldn't record metadata for ${file.name}`);
        }
      }
    } finally {
      uploadEl.value = ""; // reset
      uploadEl.disabled = false;
      refreshBtn.disabled = false;
      await fetchPhotos();
    }
  }

  // --- Wire controls ---
  uploadEl.onchange = (e) => uploadFiles(e.target.files);
  refreshBtn.onclick = () => fetchPhotos();

  // --- Initial load ---
  await fetchPhotos();
}

async function loadPhotoThumbnails(photoPaths) {
    const thumbnails = document.querySelectorAll('.edit-photo-thumbnail');
    
    for (let i = 0; i < thumbnails.length && i < photoPaths.length; i++) {
        try {
            const signedUrl = await getSignedPhotoUrl(photoPaths[i]);
            if (signedUrl) {
                thumbnails[i].src = signedUrl;
            } else {
                thumbnails[i].src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y="50" font-size="40"%3E❌%3C/text%3E%3C/svg%3E';
                thumbnails[i].title = 'Failed to load photo';
            }
        } catch (error) {
            console.error('Error loading thumbnail:', error);
            thumbnails[i].src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"%3E%3Ctext y="50" font-size="40"%3E❌%3C/text%3E%3C/svg%3E';
        }
    }
}

async function viewPhotoInEdit(photoPath) {
    try {
        const signedUrl = await getSignedPhotoUrl(photoPath);
        if (signedUrl) {
            openPhotoModal(signedUrl);
        }
    } catch (error) {
        console.error('Error viewing photo:', error);
        alert('❌ Could not load photo');
    }
}

async function removePhotoFromHomework(homeworkIndex, photoIndex) {
    if (currentRole !== 'student') {
        alert('❌ Only students can remove photos.');
        return;
    }
    
    const homework = data.homework[homeworkIndex];
    if (!homework || !homework.photos || !homework.photos[photoIndex]) {
        alert('❌ Photo not found.');
        return;
    }
    
    const confirmRemove = confirm('🗑️ Remove this photo?');
    if (!confirmRemove) return;
    
    const photoPath = homework.photos[photoIndex];
    
    // Remove from local array
    homework.photos.splice(photoIndex, 1);
    
    // Update database
    if (homework.id) {
        const { error } = await supabase
            .from('homework')
            .update({ photos: homework.photos })
            .eq('id', homework.id);
        
        if (error) {
            console.error('Error removing photo from database:', error);
            alert('❌ Could not remove photo from database');
            return;
        }
    }
    
    // Optional: Delete from storage (commented out to keep files as backup)
    // try {
    //     await supabase.storage.from('homework-photos').remove([photoPath]);
    // } catch (error) {
    //     console.warn('Could not delete file from storage:', error);
    // }
    
    saveData();
    
    // Refresh the photo display in modal
    displayPhotosInEditModal(homework);
    
    // Also refresh the main homework list
    await renderHomework();
}

async function addPhotoInEditMode(input) {
  const modal = document.getElementById('addHomeworkModal');
  const homeworkIndex = modal.dataset.editIndex;

  if (homeworkIndex === undefined) {
    alert('❌ Error: No homework selected');
    input.value = '';
    return;
  }

  const file = input.files?.[0];
  if (!file) return;

  const homework = data.homework[homeworkIndex];
  if (!homework?.id) {
    alert('❌ Please save the homework first');
    input.value = '';
    return;
  }

  try {
    const filePath = await uploadHomeworkPhoto(homework.id, file);
    if (!filePath) throw new Error('Upload returned no path');

    const ok = await saveHomeworkPhotoPath(homework.id, filePath);
    if (!ok) throw new Error('Could not save file path to DB');

    // update local cache
    if (!Array.isArray(homework.photos)) homework.photos = [];
    homework.photos.push(filePath);
    saveData();

    // re-render modal thumbnails + list
    displayPhotosInEditModal(homework);
    await renderHomework();
  } catch (e) {
    console.error('addPhotoInEditMode error:', e);
    alert('❌ Photo upload failed: ' + (e.message || e));
  } finally {
    input.value = '';
  }
}

async function uploadThemePhoto(themeId, file) {
  const user = currentUser || (await getCurrentUser());
  const filePath = `${user.id}/${themeId}/${Date.now()}.jpg`;

  const { error: upErr } = await supabase
    .storage
    .from('theme-photos')
    .upload(filePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (upErr) {
    console.error('Upload error:', upErr);
    alert('❌ Upload failed.');
    return null;
  }

  const { error: insErr } = await supabase
    .from('theme_photos')
    .insert([{ theme_id: themeId, file_path: filePath, uploaded_by: user.id }]);

  if (insErr) {
    console.error('DB insert error:', insErr);
    alert('❌ Database update failed.');
    return null;
  }

  return filePath;
}

async function getThemePhotos(themeId) {
  const { data, error } = await supabase
    .from('theme_photos')
    .select('*')
    .eq('theme_id', themeId)
    .order('uploaded_at', { ascending: true });
  if (error) return [];
  return data || [];
}

async function deleteThemePhoto(photoId, filePath) {
  if (currentRole !== 'parent') {
    alert('❌ Only parents can delete photos.');
    return;
  }

  if (!confirm('🗑️ Delete this photo?')) return;

  await supabase.from('theme_photos').delete().eq('id', photoId);
  await supabase.storage.from('theme-photos').remove([filePath]);
  recordSync(true);
  renderSubjects(); // refresh
}
async function renderThemePhotos(themeId){
  const gallery = document.getElementById(`theme-photos-${themeId}`);
  if (!gallery) return;
  gallery.innerHTML = '';

  try {
    const { data: rows, error } = await supabase
      .from('theme_photos')
      .select('path')
      .eq('theme_id', themeId)
      .order('created_at', { ascending: true });

    if (error) { console.warn('theme_photos missing?', error); return; }
    for (const r of (rows || [])) {
      const url = await getSignedPhotoUrl(r.path);
      if (!url) continue;
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Theme photo';
      img.onclick = () => openPhotoModal(url);
      gallery.appendChild(img);
    }
  } catch(e) {
    console.warn('renderThemePhotos skipped:', e);
  }
}

async function handleThemePhotoUpload(themeId, inputEl){
  const file = inputEl.files?.[0];
  if (!file) return;
  inputEl.disabled = true;

  try {
    // Reuse compressor
    let blob = null;
    try { blob = await compressImage(file); } catch(_){}
    const toUpload = blob || file;

    const userId = currentUser?.id || 'anon';
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    const path = `themes/${userId}/${themeId}/${ts}.jpg`;

    const { error: stErr } = await supabase.storage
      .from('homework-photos') // reuse bucket
      .upload(path, toUpload, { upsert:false, cacheControl:'3600', contentType: toUpload.type || 'image/jpeg' });
    if (stErr) throw stErr;

    // Save DB reference (if table exists)
    const { error: dbErr } = await supabase
      .from('theme_photos')
      .insert([{ theme_id: themeId, path }]);
    if (dbErr) console.warn('Could not store theme photo reference (table missing?)', dbErr);

    // Refresh UI
    await renderThemePhotos(themeId);
  } catch(e){
    alert('❌ Theme photo upload failed: ' + (e.message || e));
  } finally {
    inputEl.value = '';
    inputEl.disabled = false;
  }
}

async function deleteThemePhoto(photoId, filePath) {
  if (currentRole !== 'parent') {
    alert('❌ Only parents can delete photos.');
    return;
  }

  if (!confirm('🗑️ Delete this photo?')) return;

  await supabase.from('theme_photos').delete().eq('id', photoId);
  await supabase.storage.from('theme-photos').remove([filePath]);
  recordSync(true);
  renderSubjects(); // refresh
}

async function saveThemeDescription(themeId, value) {
  const desc = value.trim();
  if (desc === '') return;
  await updateThemeDescription(themeId, desc);
}

async function handleThemePhotoUpload(themeId, input) {
  const file = input.files?.[0];
  if (!file) return;
  const path = await uploadThemePhoto(themeId, file);
  if (path) await renderThemePhotos(themeId);
  input.value = '';
}

window.updateThemeDescription = updateThemeDescription;
window.markHomeworkDone = markHomeworkDone;
window.unapproveHomework = unapproveHomework;
window.displayPhotosInEditModal = displayPhotosInEditModal;
window.viewPhotoInEdit = viewPhotoInEdit;
window.removePhotoFromHomework = removePhotoFromHomework;
window.addPhotoInEditMode = addPhotoInEditMode;
window.renderHomework = renderHomework;
window.openEditHomeworkModal = openEditHomeworkModal;
window.handlePhotoUpload = handlePhotoUpload;
window.formatDateDMY = formatDateDMY;
window.renderSubjects = renderSubjects;

// Minimal safe stubs for referenced-but-missing functions
if (typeof window.checkAdminPassword !== 'function') window.checkAdminPassword = function(){ console.info('checkAdminPassword: noop'); };
if (typeof window.changeAdminPassword !== 'function') window.changeAdminPassword = function(){ console.info('changeAdminPassword: noop'); };

if (typeof window.addNewTask !== 'function') window.addNewTask = function(){ alert('Add Task: not implemented yet.'); };
if (typeof window.addAdminTask !== 'function') window.addAdminTask = function(){ alert('Add Admin Task: not implemented yet.'); };
if (typeof window.toggleTask !== 'function') window.toggleTask = function(){ alert('Toggle Task: not implemented yet.'); };
if (typeof window.removeTask !== 'function') window.removeTask = function(){ alert('Remove Task: not implemented yet.'); };
if (typeof window.approveTask !== 'function') window.approveTask = function(){ alert('Approve Task: not implemented yet.'); };
if (typeof window.updateThemeProgress !== 'function') window.updateThemeProgress = function(){ console.info('updateThemeProgress: noop'); };
if (typeof window.switchToStudentMode !== 'function') window.switchToStudentMode = function(){ window.currentRole='student'; if (window.updateRoleDisplay) updateRoleDisplay(); };

