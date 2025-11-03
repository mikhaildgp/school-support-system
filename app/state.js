// app/state.js
export const state = {
    role: 'student',    // 'student' | 'parent'
    user: null,         // Supabase user
    data: {
      subjects: [],
      homework: [],
      allTasks: [],
      todayTasks: [],
      timetable: {},
      completedTasksWeek: 0,
      completedHomeworkWeek: 0,
      currentWeekAchievement: null
    }
  };
  
  // Utility helpers (you already have these; keep names consistent)
  export function saveLocal() {
    localStorage.setItem('schoolSystemData', JSON.stringify(state.data));
  }
  
  export function loadLocalIfNeeded() {
    const raw = localStorage.getItem('schoolSystemData');
    if (!raw) return;
    try { state.data = JSON.parse(raw); } catch {}
  }