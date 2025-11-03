export function renderLayout(root) {
  root.innerHTML = `<div class="container">
        <div class="header">
            <h1>📚 My School System</h1>
            <div class="user-info">
                <span id="currentDate"></span> | 7B Grade
                <span class="role-indicator" id="roleIndicator">👧 Student Mode</span>
                <button class="role-switch" onclick="toggleLoginSection()" id="adminAccessBtn">
                    👨‍👩‍👧‍👦 Parent Access
                </button>
            </div>
        </div>

        <!-- Login/Role Selection -->
        <div class="login-section" id="loginSection" style="display:none">
            <h3>👨‍👩‍👧‍👦 Parents Access</h3>
            <p>Enter the password for management functions:</p>
            <input type="password" class="input-field" id="adminPassword" placeholder="Parents password" style="max-width: 250px; margin: 10px auto;">
            <br>
            <button class="role-switch" onclick="checkAdminPassword()">Login</button>
            <button class="role-switch" onclick="toggleLoginSection()">Cancel</button>
            <p style="margin-top: 15px; font-size: 0.9em; color: #666;">
            </p>
        </div>

        <!-- Timetable Section -->
        <div class="timetable-grid">
            <div class="card timetable-card">
                <h2>📅 Study plan</h2>
                <div class="timetable-controls">
                    <button class="week-nav" onclick="previousWeek()">◀ Previous Week</button>
                    <span id="currentWeek" style="margin: 0 20px; font-weight: bold;">Current week</span>
                    <button class="week-nav" onclick="nextWeek()">Next week ▶</button>
                </div>
                <div class="timetable-container">
                    <table class="timetable" id="timetable">
                        <!-- Timetable will be generated here -->
                    </table>
                </div>
                
                <!-- Admin Controls for Timetable -->
                <div class="admin-controls" id="timetableAdminControls" style="display: none;">
                    <h3>👨‍👩‍👧‍👦 Manage Study plan</h3>
                    <p style="margin-bottom: 10px;">Click on the field to add or update the Subject</p>
                    <button class="admin-button" onclick="clearTimetable()">🗑️ Delete Study plan</button>
                    <button class="admin-button" onclick="loadSampleTimetable()">📝 Load the Study plan template</button>
                </div>
            </div>
        </div>

        <!-- Two-column block: ToDo + Homework -->
<div class="main-grid two-col">
    <!-- Today's Checklist -->
    <div class="card today-checklist">
        <h2>📋 Tasks</h2>
        <div class="task-tabs">
          <button class="task-tab" data-view="today" onclick="setTaskView('today')">Today</button>
          <button class="task-tab" data-view="all" onclick="setTaskView('all')">All Tasks</button>
        </div>
        <div id="todayTasks"></div>
        
        <!-- Student Controls -->
        <div style="margin-top: 15px;">
          <input type="text" class="input-field" id="newTaskInput" placeholder="Task name...">
          <textarea class="input-field" id="newTaskDescription" placeholder="Description (optional)" rows="2"></textarea>
          <input type="date" class="input-field" id="newTaskDueDate" placeholder="Due date">
          <button class="add-button" onclick="addNewTask()">+ Add Task</button>
        </div>
        
        <!-- Admin Controls -->
        <div class="admin-controls" id="taskAdminControls" style="display: none;">
          <h3>👨‍👩‍👧‍👦 Parent Controls</h3>
          <input type="text" class="input-field" id="adminTaskInput" placeholder="Required task name...">
          <textarea class="input-field" id="adminTaskDescription" placeholder="Description (optional)" rows="2"></textarea>
          <input type="date" class="input-field" id="adminTaskDueDate" placeholder="Due date">
          <button class="admin-button" onclick="addAdminTask()">🔒 Add Required Task</button>
          <br><br>
          <button class="role-switch" onclick="switchToStudentMode()">👥 Switch to Student Mode</button>
          <button class="admin-button" onclick="resetWeeklyStats()">🔄 Reset Weekly Stats</button>
        </div>
      </div>
  
    <!-- Homework -->
    <div class="card homework-card">
      <h2>📝 Homework</h2>
      <div id="homeworkList"></div>
  
      <!-- Student Controls -->
      <div class="student-controls" id="homeworkStudentControls" style="display: none;">
        <h3>👧 Student Controls</h3>
        <button class="admin-button" onclick="openAddHomeworkModal()">+ Add Homework</button>
      </div>
  
      <!-- Parent Controls -->
      <div class="admin-controls" id="homeworkAdminControls" style="display: none;">
        <h3>👨‍👩‍👧‍👦 Parent Controls</h3>
        <button class="admin-button" onclick="clearCompletedHomework()">🗑️ Delete Completed Homework</button>
      </div>
    </div>
  </div>
  
  <!-- Subjects & Themes full width -->
  <div class="subjects-grid">
    <div class="card full-width">
      <h2>📖 Subjects & Themes</h2>
      <div id="subjectsList"></div>
  
      <!-- Parent Controls -->
      <div class="admin-controls" id="subjectAdminControls" style="display: none;">
        <h3>👨‍👩‍👧‍👦 Parents Area</h3>
        <button class="admin-button" onclick="openAddSubjectModal()">+ Add Subject</button>
        <button class="admin-button" onclick="resetAllProgress()">🔄 Delete all progress</button>
      </div>
    </div>
  </div>
            <!-- Weekly Summary -->
            <div class="card weekly-summary">
                <h2>📊 Weekly Summary</h2>
                <div class="summary-stats">
                    <div class="stat-card">
                        <div class="stat-number" id="completedTasks">0</div>
                        <div class="stat-label">Tasks accomplished
                        </div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="completedHomework">0</div>
                        <div class="stat-label">Homework finished</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number" id="averageProgress">0%</div>
                        <div class="stat-label">Average Progress</div>
                    </div>
                    <div class="stat-card" style="border: 2px solid #ffc107;">
                        <div class="stat-number" id="dailyAchievements">0/7</div>
                        <div class="stat-label">Daily Achievements</div>
                    </div>
                    <div class="stat-card" style="border: 2px solid #28a745;">
                        <div class="stat-number" id="achievementPercentage">0%</div>
                        <div class="stat-label">Weekly Success</div>
                    </div>
                    <div class="stat-card" style="border: 2px solid #17a2b8;">
                        <div class="stat-number" id="fullWeekAchievement">⏳ In Progress</div>
                        <div class="stat-label">Status</div>
                    </div>
                </div>
                
                <!-- System Health Panel -->
                <div class="system-health-panel" style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px; font-size: 0.8em;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #6c757d;">🔧 System</span>
                        <button onclick="toggleSystemHealth()" style="background: none; border: none; font-size: 0.7em; color: #6c757d; cursor: pointer;">Details</button>
                    </div>
                    <div id="systemHealthSummary" style="margin-top: 5px; color: #6c757d;">
                        <div>📡 Sync: <span id="lastSyncStatus">Initializing...</span></div>
                        <div>🔍 Status: <span id="systemStatus">Ready</span></div>
                    </div>
                    <div id="systemHealthDetails" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.1); font-size: 0.75em;">
                        <div>Last Sync: <span id="lastSyncTime">-</span></div>
                        <div>Last Error: <span id="lastError">None</span></div>
                        <div>Database: <span id="dbStatus">Connected</span></div>
                        <div>Photos: <span id="storageStatus">Available</span></div>
                        <div>Uptime: <span id="sessionUptime">0m</span></div>
                    </div>
                </div>
                
                
            </div>
        </div>
    </div>

    <!-- Add Subject Modal -->
    <div id="addSubjectModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('addSubjectModal')">&times;</span>
            <h2>Add New Subject</h2>
            <input type="text" class="input-field" id="subjectName" placeholder="Subject name (e.g. Mathematics)">
            <input type="text" class="input-field" id="subjectThemes" placeholder="Topics (separated by comma)">
            <button class="add-button" onclick="addSubject()">Add Subject</button>
        </div>
    </div>

    <!-- Add Homework Modal -->
    <div id="addHomeworkModal" class="modal">
        <div class="modal-content">
        <span class="close" onclick="closeModal('addHomeworkModal')">&times;</span>
        <h2>Add New Homework</h2>
    
        <select class="input-field" id="homeworkSubject" required>
            <option value="">Select subject... *</option>
        </select>
    
        <input type="text" class="input-field" id="homeworkTitle" placeholder="Homework title *" required>
        <input type="date" class="input-field" id="homeworkDueDate" required>
        <small style="color:#dc3545;">* Due Date is required</small>
        <textarea class="input-field" id="homeworkDescription" placeholder="Description (optional)" rows="3"></textarea>
    
        <button class="add-button" onclick="addHomework()">Save</button>
        </div>
    </div>

    <!-- Add/Edit Timetable Subject Modal -->
    <div id="timetableModal" class="modal">
        <div class="modal-content">
            <span class="close" onclick="closeModal('timetableModal')">&times;</span>
            <h2 id="timetableModalTitle">Add Subject</h2>
            <select class="input-field" id="timetableSubject">
                <option value="">Select subject...</option>
            </select>
            <input type="text" class="input-field" id="timetableRoom" placeholder="Room (e.g. A205)">
            <input type="text" class="input-field" id="timetableTeacher" placeholder="Teacher (optional)">
            <div style="margin: 15px 0;">
                <label>
                    <input type="checkbox" id="doubleLesson"> Double lesson (2 hours)
                </label>
            </div>
            <button class="add-button" onclick="saveTimetableEntry()">Save</button>
            <button class="admin-button" onclick="deleteTimetableEntry()" id="deleteTimetableBtn" style="display: none;">🗑️ Delete</button>
        </div>
    </div>

    <!-- Photo Modal -->
    <div id="photoModal" class="photo-modal">
        <span class="photo-modal-close" onclick="closePhotoModal()">&times;</span>
        <div class="photo-modal-content">
            <img id="photoModalImage" src="" alt="Photo" />
        </div>
    </div>

`;
}
