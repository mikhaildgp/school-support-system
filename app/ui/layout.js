// app/ui/layout.js
export function renderLayout(root) {
    root.innerHTML = `
      <div class="container">
        <div class="header">
          <h1>📚 My School System</h1>
          <div class="user-info">
            <span id="currentDate"></span> | 7B Grade
            <span class="role-indicator" id="roleIndicator">👧 Student Mode</span>
            <button class="role-switch" id="adminAccessBtn">👨‍👩‍👧‍👦 Parent Access</button>
          </div>
        </div>
  
        <div class="login-section" id="loginSection" style="display:none">
          <h3>👨‍👩‍👧‍👦 Parents Access</h3>
          <p>Enter the password for management functions:</p>
          <input type="password" class="input-field" id="adminPassword" placeholder="Parents password" style="max-width: 250px; margin: 10px auto;">
          <br>
          <button class="role-switch" id="loginBtn">Login</button>
          <button class="role-switch" id="cancelLoginBtn">Cancel</button>
        </div>
  
        <div id="timetableCard" class="timetable-grid">
          <div class="card timetable-card">
            <h2>📅 Study plan</h2>
            <div class="timetable-controls">
              <button class="week-nav" id="prevWeekBtn">◀ Previous Week</button>
              <span id="currentWeek" style="margin: 0 20px; font-weight: bold;">Current week</span>
              <button class="week-nav" id="nextWeekBtn">Next week ▶</button>
            </div>
            <div class="timetable-container">
              <table class="timetable" id="timetable"></table>
            </div>
            <div class="admin-controls" id="timetableAdminControls" style="display: none;">
              <h3>👨‍👩‍👧‍👦 Manage Study plan</h3>
              <p style="margin-bottom: 10px;">Click on the field to add or update the Subject</p>
              <button class="admin-button" id="clearTT">🗑️ Delete Study plan</button>
              <button class="admin-button" id="loadTT">📝 Load the Study plan template</button>
            </div>
          </div>
        </div>
  
        <div class="main-grid two-col">
          <div class="card today-checklist">
            <h2>📋 Tasks</h2>
            <div class="task-tabs">
              <button class="task-tab" data-view="today" id="tabToday">Today</button>
              <button class="task-tab" data-view="all" id="tabAll">All Tasks</button>
            </div>
            <div id="todayTasks"></div>
            <div style="margin-top: 15px;">
              <input type="text" class="input-field" id="newTaskInput" placeholder="Task name...">
              <textarea class="input-field" id="newTaskDescription" placeholder="Description (optional)" rows="2"></textarea>
              <input type="date" class="input-field" id="newTaskDueDate" placeholder="Due date">
              <button class="add-button" id="addTaskBtn">+ Add Task</button>
            </div>
            <div class="admin-controls" id="taskAdminControls" style="display:none;">
              <h3>👨‍👩‍👧‍👦 Parent Controls</h3>
              <input type="text" class="input-field" id="adminTaskInput" placeholder="Required task name...">
              <textarea class="input-field" id="adminTaskDescription" placeholder="Description (optional)" rows="2"></textarea>
              <input type="date" class="input-field" id="adminTaskDueDate" placeholder="Due date">
              <button class="admin-button" id="addAdminTaskBtn">🔒 Add Required Task</button>
              <br><br>
              <button class="role-switch" id="switchToStudentBtn">👥 Switch to Student Mode</button>
              <button class="admin-button" id="resetWeeklyStatsBtn">🔄 Reset Weekly Stats</button>
            </div>
          </div>
  
          <div class="card homework-card">
            <h2>📝 Homework</h2>
            <div id="homeworkList"></div>
            <div class="student-controls" id="homeworkStudentControls" style="display:none;">
              <h3>👧 Student Controls</h3>
              <button class="admin-button" id="addHomeworkBtn">+ Add Homework</button>
            </div>
            <div class="admin-controls" id="homeworkAdminControls" style="display:none;">
              <h3>👨‍👩‍👧‍👦 Parent Controls</h3>
              <button class="admin-button" id="clearCompletedHomeworkBtn">🗑️ Delete Completed Homework</button>
            </div>
          </div>
        </div>
  
        <div class="subjects-grid">
          <div class="card full-width">
            <h2>📖 Subjects & Themes</h2>
            <div id="subjectsList"></div>
            <div class="admin-controls" id="subjectAdminControls" style="display:none;">
              <h3>👨‍👩‍👧‍👦 Parents Area</h3>
              <button class="admin-button" id="openAddSubjectModalBtn">+ Add Subject</button>
              <button class="admin-button" id="resetAllProgressBtn">🔄 Delete all progress</button>
            </div>
          </div>
        </div>
  
        <div class="card weekly-summary">
          <h2>📊 Weekly Summary</h2>
          <div class="summary-stats">
            <div class="stat-card"><div class="stat-number" id="completedTasks">0</div><div class="stat-label">Tasks accomplished</div></div>
            <div class="stat-card"><div class="stat-number" id="completedHomework">0</div><div class="stat-label">Homework finished</div></div>
            <div class="stat-card"><div class="stat-number" id="averageProgress">0%</div><div class="stat-label">Average Progress</div></div>
            <div class="stat-card" style="border:2px solid #ffc107;"><div class="stat-number" id="dailyAchievements">0/7</div><div class="stat-label">Daily Achievements</div></div>
            <div class="stat-card" style="border:2px solid #28a745;"><div class="stat-number" id="achievementPercentage">0%</div><div class="stat-label">Weekly Success</div></div>
            <div class="stat-card" style="border:2px solid #17a2b8;"><div class="stat-number" id="fullWeekAchievement">⏳ In Progress</div><div class="stat-label">Status</div></div>
          </div>
          <div class="system-health-panel" id="systemHealthPanel"></div>
        </div>
      </div>
    `;
  }