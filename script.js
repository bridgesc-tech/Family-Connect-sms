// Family Connect Application
class FamilyConnect {
    constructor() {
        this.events = [];
        this.tasks = [];
        this.groceries = [];
        this.members = [];
        this.weekDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        this.weekMenu = this.emptyWeekMenu();
        this.firebaseEnabled = false;
        this.familyId = this.getOrCreateFamilyId();
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.editingEventId = null;
        this.editingTaskId = null;
        this.glancePeriod = 'day';
        this.currentTab = 'glance';
        this.taskFilter = 'all';
        this.saveTimer = null;
        this.cloudHydrated = false;
        this._unsubscribeSnapshot = null;
        this.memberColors = ['#5B6CFF', '#14B8A6', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#84CC16', '#F97316'];
        ['familyConnectVercelUrl', 'familyConnectApiKey', 'familyConnectDailyDigest', 'familyConnectScheduledReminders'].forEach((key) => {
            localStorage.removeItem(key);
        });
        
        // Wait for Firebase scripts to load
        this.waitForFirebase(() => {
            this.initializeFirebase();
            this.loadData().then(() => {
                this.initializeApp();
            }).catch(error => {
                console.error('Error loading data:', error);
                this.initializeApp();
            });
        });
    }

    waitForFirebase(callback, attempts = 0) {
        const maxAttempts = 40;
        const authUser = typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
        if ((typeof db !== 'undefined' && db && authUser) || attempts >= maxAttempts) {
            callback();
        } else {
            setTimeout(() => {
                this.waitForFirebase(callback, attempts + 1);
            }, 100);
        }
    }

    getOrCreateFamilyId() {
        let familyId = localStorage.getItem('familyConnectFamilyId');
        if (!familyId) {
            // Generate a 6-digit random number
            familyId = Math.floor(100000 + Math.random() * 900000).toString();
            localStorage.setItem('familyConnectFamilyId', familyId);
        }
        return familyId;
    }

    initializeFirebase() {
        const checkFirebase = () => {
            if (typeof window !== 'undefined' && typeof db !== 'undefined' && db !== null) {
                this.firebaseEnabled = true;
                console.log('Firebase sync enabled for family:', this.familyId);
                if (this._unsubscribeSnapshot) this._unsubscribeSnapshot();
                this._unsubscribeSnapshot = db.collection('families').doc(this.familyId)
                    .onSnapshot((docSnapshot) => {
                        if (!docSnapshot.exists) return;
                        this.applyCloudData(docSnapshot.data());
                        this.ensureMemberColors();
                        this.persistMenuIfNeeded();
                        this.saveToLocalStorage();
                        this.refreshVisible();
                        this.updateMemberSelects();
                        this.renderTaskFilters();
                        console.log('Synced from cloud');
                    }, (error) => {
                        console.error('Firebase sync error:', error);
                    });
                
                this.updateSyncStatus();
                return true;
            }
            return false;
        };
        
        if (!checkFirebase()) {
            setTimeout(() => {
                if (!checkFirebase()) {
                    console.log('Firebase not configured - running in local-only mode');
                    this.updateSyncStatus();
                }
            }, 500);
        }
    }

    async loadData() {
        if (this.firebaseEnabled) {
            try {
                const docSnapshot = await db.collection('families').doc(this.familyId).get();
                if (docSnapshot.exists) {
                    this.applyCloudData(docSnapshot.data());
                    this.ensureMemberColors();
                    this.saveToLocalStorage();
                    this.persistMenuIfNeeded();
                    return;
                }
                this.loadFromLocalStorage();
                this.cloudHydrated = true;
                return;
            } catch (error) {
                console.error('Error loading from Firebase:', error);
                if (this.cloudHydrated) return;
            }
        }
        this.loadFromLocalStorage();
    }

    loadFromLocalStorage() {
        const storedEvents = localStorage.getItem('familyConnectEvents');
        const storedTasks = localStorage.getItem('familyConnectTasks');
        const storedGroceries = localStorage.getItem('familyConnectGroceries');
        const storedMembers = localStorage.getItem('familyConnectMembers');
        const storedMenu = localStorage.getItem('familyConnectWeekMenu');
        this.events = storedEvents ? JSON.parse(storedEvents) : [];
        this.tasks = storedTasks ? JSON.parse(storedTasks) : [];
        this.groceries = storedGroceries ? JSON.parse(storedGroceries) : [];
        this.members = storedMembers ? JSON.parse(storedMembers) : [];
        this.weekMenu = this.normalizeWeekMenu(storedMenu ? JSON.parse(storedMenu) : null);
        this.ensureMemberColors();
        this.persistMenuIfNeeded();
    }

    isEmptyPayload(data) {
        if (!data || typeof data !== 'object') return true;
        const menu = data.weekMenu && typeof data.weekMenu === 'object' && !Array.isArray(data.weekMenu)
            ? data.weekMenu
            : {};
        return !(data.events && data.events.length)
            && !(data.tasks && data.tasks.length)
            && !(data.groceries && data.groceries.length)
            && !(data.members && data.members.length)
            && !Object.keys(menu).length;
    }

    hasContent() {
        return this.events.length > 0
            || this.tasks.length > 0
            || this.groceries.length > 0
            || this.members.length > 0
            || Object.keys(this.weekMenu || {}).length > 0;
    }

    applyCloudData(data) {
        if (!data) return;
        if (this.isEmptyPayload(data) && this.hasContent()) {
            this.cloudHydrated = true;
            this.saveData();
            return;
        }
        if (data.events) this.events = data.events;
        if (data.tasks) this.tasks = data.tasks;
        if (data.groceries) this.groceries = data.groceries;
        if (data.members) this.members = data.members;
        if (data.weekMenu) this.weekMenu = this.normalizeWeekMenu(data.weekMenu);
        this.cloudHydrated = true;
    }

    saveData() {
        this.saveToLocalStorage();
        if (!this.firebaseEnabled || !this.cloudHydrated) return;
        clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => this.flushSave(), 400);
    }

    flushSave() {
        if (!this.firebaseEnabled || !this.cloudHydrated) return;
        this.events = this.events.map(({ reminders, ...event }) => event);
        this.tasks = this.tasks.map(({ reminders, ...task }) => task);
        const payload = {
            events: this.events,
            tasks: this.tasks,
            groceries: this.groceries,
            members: this.members,
            weekMenu: this.weekMenu,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (firebase.firestore.FieldValue && firebase.firestore.FieldValue.delete) {
            payload.scheduledReminders = firebase.firestore.FieldValue.delete();
            payload.dailyDigest = firebase.firestore.FieldValue.delete();
        }
        db.collection('families').doc(this.familyId).set(payload, { merge: true })
            .then(() => {
                console.log('Synced to cloud');
            })
            .catch((error) => {
                console.error('Error syncing to Firebase:', error);
            });
    }

    saveToLocalStorage() {
        localStorage.setItem('familyConnectEvents', JSON.stringify(this.events));
        localStorage.setItem('familyConnectTasks', JSON.stringify(this.tasks));
        localStorage.setItem('familyConnectGroceries', JSON.stringify(this.groceries));
        localStorage.setItem('familyConnectMembers', JSON.stringify(this.members));
        localStorage.setItem('familyConnectWeekMenu', JSON.stringify(this.weekMenu));
    }

    initializeApp() {
        // Service worker registration is now handled by UpdateManager

        this.updateSyncStatus();
        this.setupFamilyIdUI();
        this.setupTabNavigation();
        this.setupCalendar();
        this.setupTasks();
        this.setupGroceries();
        this.setupMenu();
        this.setupGlance();
        this.setupModals();
        this.updateMemberSelects();
        this.renderTaskFilters();
        this.refreshVisible();
        
        // Setup date inputs to prevent typing but allow calendar
        this.setupDateInputs();
    }
    
    setupDateInputs() {
        // Prevent typing in date inputs, but allow calendar picker to open
        const dateInputs = ['eventDateInput', 'eventEndDateInput', 'taskDueDateInput'];
        
        dateInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                // Prevent typing - block keydown events except for navigation keys
                input.addEventListener('keydown', (e) => {
                    // Allow navigation keys
                    if (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
                        e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Escape' || 
                        (e.ctrlKey && (e.key === 'a' || e.key === 'c' || e.key === 'v'))) {
                        return; // Allow these keys
                    }
                    // Block all other typing
                    e.preventDefault();
                });
                
                // Prevent pasting text
                input.addEventListener('paste', (e) => {
                    e.preventDefault();
                });
                
                // Ensure calendar opens on click/focus
                input.addEventListener('focus', () => {
                    // Try to show picker if supported (modern browsers)
                    if (input.showPicker) {
                        input.showPicker().catch(() => {
                            // Fallback: just let the browser handle it
                        });
                    }
                });
                
                // Also trigger on click
                input.addEventListener('click', () => {
                    input.focus();
                    // Try to show picker if supported
                    if (input.showPicker) {
                        input.showPicker().catch(() => {
                            // Fallback: just let the browser handle it
                        });
                    }
                });
                
                // Show pointer cursor to indicate it's clickable
                input.style.cursor = 'pointer';
            }
        });
    }

    setupTabNavigation() {
        const tabBtns = document.querySelectorAll('.nav-item');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                this.currentTab = targetTab;
                
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(targetTab + 'Tab').classList.add('active');
                this.refreshVisible();
            });
        });
    }

    refreshVisible() {
        if (this.currentTab === 'glance') this.renderGlance();
        else if (this.currentTab === 'calendar') this.renderCalendar();
        else if (this.currentTab === 'tasks') this.renderTasks();
        else if (this.currentTab === 'groceries') this.renderGroceries();
        else if (this.currentTab === 'menu') this.renderMenu();
    }

    setupCalendar() {
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.currentMonth--;
            if (this.currentMonth < 0) {
                this.currentMonth = 11;
                this.currentYear--;
            }
            this.renderCalendar();
        });
        
        document.getElementById('nextMonth').addEventListener('click', () => {
            this.currentMonth++;
            if (this.currentMonth > 11) {
                this.currentMonth = 0;
                this.currentYear++;
            }
            this.renderCalendar();
        });

        document.getElementById('todayBtn').addEventListener('click', () => {
            const today = new Date();
            this.currentMonth = today.getMonth();
            this.currentYear = today.getFullYear();
            this.renderCalendar();
        });
    }

    setupTasks() {
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            this.openTaskModal();
        });
    }

    setupGroceries() {
        const addGroceryBtn = document.getElementById('addGroceryBtn');
        const groceryInput = document.getElementById('groceryItemInput');
        
        addGroceryBtn.addEventListener('click', () => {
            this.addGrocery();
        });
        
        groceryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.addGrocery();
            }
        });

        document.getElementById('clearCheckedBtn').addEventListener('click', () => {
            this.clearCheckedGroceries();
        });
    }

    emptyWeekMenu() {
        return {};
    }

    dinnerDateKey(date) {
        return this.formatDateInput(this.startOfDay(date));
    }

    getRollingDinnerDates() {
        const today = this.startOfDay(new Date());
        return Array.from({ length: 7 }, (_, index) => {
            const date = new Date(today);
            date.setDate(today.getDate() + index);
            return date;
        });
    }

    pruneWeekMenu() {
        const todayKey = this.dinnerDateKey(new Date());
        Object.keys(this.weekMenu).forEach((key) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(key) && key < todayKey) {
                delete this.weekMenu[key];
            }
            if (this.weekDays.includes(key)) {
                delete this.weekMenu[key];
            }
        });
    }

    thisWeekEndKey() {
        const today = this.startOfDay(new Date());
        const weekEnd = new Date(today);
        weekEnd.setDate(today.getDate() + (6 - today.getDay()));
        return this.dinnerDateKey(weekEnd);
    }

    persistMenuIfNeeded() {
        this.pruneWeekMenu();
        if (!this._menuNeedsPersist) return;
        this._menuNeedsPersist = false;
        localStorage.setItem('familyConnectMenuRollFix', '1');
        this.saveData();
    }

    normalizeWeekMenu(data) {
        const menu = {};
        if (!data || typeof data !== 'object' || Array.isArray(data)) return menu;
        const hasOldKeys = this.weekDays.some((day) => typeof data[day] === 'string' && data[day].trim());
        Object.keys(data).forEach((key) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof data[key] === 'string' && data[key].trim()) {
                menu[key] = data[key];
            }
        });
        const today = this.startOfDay(new Date());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        const weekEndKey = this.thisWeekEndKey();
        if (hasOldKeys) {
            this.weekDays.forEach((day, index) => {
                const date = new Date(weekStart);
                date.setDate(weekStart.getDate() + index);
                if (date < today) return;
                const key = this.dinnerDateKey(date);
                if (!menu[key] && data[day] && data[day].trim()) {
                    menu[key] = data[day];
                }
            });
        }
        const pruneRollover = hasOldKeys || !localStorage.getItem('familyConnectMenuRollFix');
        if (pruneRollover) {
            Object.keys(menu).forEach((key) => {
                if (key > weekEndKey) delete menu[key];
            });
            this._menuNeedsPersist = true;
        }
        return menu;
    }

    setupMenu() {
        const list = document.getElementById('menuDays');
        list.addEventListener('input', (e) => {
            const input = e.target;
            if (!input || !input.dataset.date) return;
            const value = input.value;
            if (value.trim()) this.weekMenu[input.dataset.date] = value;
            else delete this.weekMenu[input.dataset.date];
            this.saveData();
        });

        document.getElementById('clearMenuBtn').addEventListener('click', () => {
            const dates = this.getRollingDinnerDates().map((date) => this.dinnerDateKey(date));
            if (!dates.some((key) => (this.weekMenu[key] || '').trim())) return;
            if (!confirm('Clear dinners for these 7 days?')) return;
            dates.forEach((key) => delete this.weekMenu[key]);
            this.saveData();
            this.renderMenu();
        });
    }

    renderMenu() {
        const list = document.getElementById('menuDays');
        const dates = this.getRollingDinnerDates();
        const rangeEl = document.getElementById('menuWeekRange');
        if (rangeEl) {
            rangeEl.textContent = `${this.formatDateShort(dates[0])} – ${this.formatDateShort(dates[6])}`;
        }

        const focusedDate = list.contains(document.activeElement) ? document.activeElement.dataset.date : null;
        if (focusedDate) return;

        this.pruneWeekMenu();
        list.innerHTML = '';
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        dates.forEach((date, index) => {
            const key = this.dinnerDateKey(date);
            const row = document.createElement('label');
            row.className = 'menu-row' + (index === 0 ? ' is-today' : '');
            row.dataset.day = dayNames[date.getDay()].toLowerCase();

            const dayWrap = document.createElement('span');
            dayWrap.className = 'menu-row-day';
            const name = document.createElement('span');
            name.className = 'menu-day-name';
            name.textContent = index === 0 ? 'Today' : dayNames[date.getDay()];
            const dateLabel = document.createElement('span');
            dateLabel.className = 'menu-day-date';
            dateLabel.textContent = this.formatDateShort(date);
            dayWrap.appendChild(name);
            dayWrap.appendChild(dateLabel);

            const input = document.createElement('input');
            input.type = 'text';
            input.maxLength = 200;
            input.placeholder = 'Add dinner';
            input.autocomplete = 'off';
            input.dataset.date = key;
            input.value = this.weekMenu[key] || '';

            row.appendChild(dayWrap);
            row.appendChild(input);
            list.appendChild(row);
        });
    }

    setupGlance() {
        const glanceBtns = document.querySelectorAll('.segmented-btn');
        glanceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                glanceBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.glancePeriod = btn.getAttribute('data-period');
                this.renderGlance();
            });
        });
    }

    setupModals() {
        // Day Events Modal
        document.getElementById('closeDayEventsModal').addEventListener('click', () => {
            this.closeDayEventsModal();
        });
        
        document.getElementById('addEventToDayBtn').addEventListener('click', () => {
            const selectedDate = this.selectedDayDate;
            this.closeDayEventsModal();
            setTimeout(() => {
                this.openEventModal(selectedDate);
            }, 300);
        });
        
        // Event Modal
        document.getElementById('closeEventModal').addEventListener('click', () => {
            this.closeEventModal();
        });
        
        document.getElementById('saveEventBtn').addEventListener('click', () => {
            this.saveEvent();
        });
        
        document.getElementById('deleteEventBtn').addEventListener('click', () => {
            this.deleteEvent();
        });
        
        // Task Modal
        document.getElementById('closeTaskModal').addEventListener('click', () => {
            this.closeTaskModal();
        });
        
        document.getElementById('saveTaskBtn').addEventListener('click', () => {
            this.saveTask();
        });
        
        document.getElementById('deleteTaskBtn').addEventListener('click', () => {
            this.deleteTask();
        });
        
        document.getElementById('openMoreBtn').addEventListener('click', () => {
            this.openMoreModal();
        });
        
        document.getElementById('closeMoreModal').addEventListener('click', () => {
            this.closeMoreModal();
        });
        
        document.getElementById('openMembersModalBtn').addEventListener('click', () => {
            this.closeMoreModal();
            setTimeout(() => {
                this.openMembersModal();
            }, 300);
        });
        
        document.getElementById('closeMembersModal').addEventListener('click', () => {
            this.closeMembersModal();
        });
        
        document.getElementById('addMemberBtn').addEventListener('click', () => {
            this.addMember();
        });
        document.getElementById('memberNameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addMember();
        });
        
        window.addEventListener('click', (e) => {
            const modals = ['dayEventsModal', 'eventModal', 'taskModal', 'moreModal', 'membersModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (e.target === modal) {
                    const methodName = `close${modalId.charAt(0).toUpperCase() + modalId.slice(1)}`;
                    if (this[methodName]) {
                        this[methodName]();
                    }
                }
            });
        });
    }

    renderCalendar() {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        
        document.getElementById('currentMonth').textContent = 
            `${monthNames[this.currentMonth]} ${this.currentYear}`;
        
        const firstDay = new Date(this.currentYear, this.currentMonth, 1);
        const lastDay = new Date(this.currentYear, this.currentMonth + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        const calendarGrid = document.getElementById('calendarGrid');
        calendarGrid.innerHTML = '';
        
        // Day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const header = document.createElement('div');
            header.className = 'calendar-day-header';
            header.textContent = day;
            calendarGrid.appendChild(header);
        });
        
        // Empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day other-month';
            calendarGrid.appendChild(emptyDay);
        }
        
        // Days of the month
        const today = new Date();
        const isCurrentMonth = today.getMonth() === this.currentMonth && today.getFullYear() === this.currentYear;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dayElement = document.createElement('div');
            const dayDate = new Date(this.currentYear, this.currentMonth, day);
            const dateStr = this.formatDate(dayDate);
            
            dayElement.className = 'calendar-day';
            if (isCurrentMonth && day === today.getDate()) {
                dayElement.classList.add('today');
            }
            
            const dayNumber = document.createElement('div');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = day;
            dayElement.appendChild(dayNumber);
            
            const dayEvents = this.getEventsForDate(dayDate);
            
            if (dayEvents.length > 0) {
                const eventsContainer = document.createElement('div');
                eventsContainer.className = 'calendar-day-events';
                dayEvents.forEach((event, index) => {
                    if (index < 3) {
                        const dot = document.createElement('span');
                        dot.className = 'event-dot';
                        dot.style.background = this.getMemberColor(event.assignee);
                        eventsContainer.appendChild(dot);
                    }
                });
                dayElement.appendChild(eventsContainer);
            }
            
            dayElement.addEventListener('click', () => {
                if (dayEvents.length > 0) {
                    this.openDayEventsModal(dayDate);
                } else {
                    this.openEventModal(dayDate);
                }
            });
            
            calendarGrid.appendChild(dayElement);
        }
        
        // Empty cells for days after month ends
        const totalCells = startingDayOfWeek + daysInMonth;
        const remainingCells = 42 - totalCells; // 6 rows * 7 days
        for (let i = 0; i < remainingCells && i < 7; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day other-month';
            calendarGrid.appendChild(emptyDay);
        }
    }

    renderTasks() {
        const tasksList = document.getElementById('tasksList');
        const emptyState = document.getElementById('emptyTasksState');
        
        tasksList.innerHTML = '';
        
        const visibleTasks = this.getFilteredTasks();
        if (visibleTasks.length === 0) {
            emptyState.style.display = 'block';
            emptyState.querySelector('p').textContent = this.tasks.length === 0 ? 'No tasks yet' : 'No tasks match this filter';
            return;
        }
        
        emptyState.style.display = 'none';
        
        const uncompletedTasks = visibleTasks.filter(t => !t.completed);
        const completedTasks = visibleTasks.filter(t => t.completed);
        
        // Sort uncompleted tasks by due date
        const sortedUncompleted = [...uncompletedTasks].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
        
        // Sort completed tasks by due date
        const sortedCompleted = [...completedTasks].sort((a, b) => {
            if (!a.dueDate && !b.dueDate) return 0;
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
        
        // Render uncompleted tasks
        if (sortedUncompleted.length > 0) {
            sortedUncompleted.forEach(task => {
                this.renderTaskCard(task, tasksList);
            });
        }
        
        // Render completed tasks section
        if (sortedCompleted.length > 0) {
            // Add section header (collapsible)
            const completedHeader = document.createElement('div');
            completedHeader.className = 'tasks-section-header';
            completedHeader.style.cssText = 'margin-top: 30px; padding-top: 20px; padding-bottom: 15px; border-top: 2px solid var(--border-color); cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between;';
            
            const headerText = document.createElement('h3');
            headerText.style.cssText = 'margin: 0; font-size: 16px; color: var(--text-secondary); font-weight: 600;';
            headerText.textContent = `✓ Completed Tasks (${sortedCompleted.length})`;
            
            const expandIcon = document.createElement('span');
            expandIcon.className = 'completed-section-icon';
            expandIcon.textContent = '▶';
            expandIcon.style.cssText = 'font-size: 12px; color: var(--text-secondary); transition: transform 0.2s;';
            
            completedHeader.appendChild(headerText);
            completedHeader.appendChild(expandIcon);
            tasksList.appendChild(completedHeader);
            
            // Create container for completed tasks (hidden by default)
            const completedContainer = document.createElement('div');
            completedContainer.className = 'completed-tasks-container';
            completedContainer.style.cssText = 'display: none;';
            
            sortedCompleted.forEach(task => {
                this.renderTaskCard(task, completedContainer);
            });
            
            tasksList.appendChild(completedContainer);
            
            // Add click handler to toggle visibility
            completedHeader.addEventListener('click', () => {
                const isHidden = completedContainer.style.display === 'none';
                completedContainer.style.display = isHidden ? 'block' : 'none';
                expandIcon.textContent = isHidden ? '▼' : '▶';
                expandIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(0deg)';
            });
        }
    }
    
    renderTaskCard(task, container) {
        const taskCard = document.createElement('div');
        taskCard.className = 'task-card';
        if (task.completed) {
            taskCard.classList.add('completed');
        }
        
        const taskHeader = document.createElement('div');
        taskHeader.className = 'task-header';
        
        const taskTitle = document.createElement('div');
        taskTitle.className = 'task-title';
        taskTitle.textContent = task.title;
        
        const taskCheckbox = document.createElement('div');
        taskCheckbox.className = 'task-checkbox';
        if (task.completed) {
            taskCheckbox.classList.add('checked');
            taskCheckbox.textContent = '✓';
        }
        taskCheckbox.addEventListener('click', () => {
            this.toggleTask(task.id);
        });
        
        taskHeader.appendChild(taskTitle);
        taskHeader.appendChild(taskCheckbox);
        
        const taskMeta = document.createElement('div');
        taskMeta.className = 'task-meta';
        
        if (task.assignee) {
            const assigneeSpan = document.createElement('span');
            assigneeSpan.className = 'task-assignee';
            assigneeSpan.textContent = task.assignee;
            assigneeSpan.style.background = this.hexToRgba(this.getMemberColor(task.assignee), 0.12);
            assigneeSpan.style.color = this.getMemberColor(task.assignee);
            taskMeta.appendChild(assigneeSpan);
        }
        
        if (task.dueDate) {
            const dueDateSpan = document.createElement('span');
            dueDateSpan.className = 'task-due-date';
            const dueDate = this.parseEventDate(task.dueDate);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const dueDateOnly = new Date(dueDate);
            dueDateOnly.setHours(0, 0, 0, 0);
            if (dueDateOnly < today && !task.completed) {
                dueDateSpan.classList.add('overdue');
            }
            let dueDateText = this.formatDateShort(dueDate);
            // Check if task has time component
            if (task.dueDate.includes('T') || (task.dueDate.includes(':') && !task.dueDate.match(/^\d{4}-\d{2}-\d{2}$/))) {
                const timeStr = dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                dueDateText += ` at ${timeStr}`;
            }
            dueDateSpan.textContent = `📅 ${dueDateText}`;
            taskMeta.appendChild(dueDateSpan);
        }
        
        if (task.assignee) {
            taskCard.style.borderLeftColor = this.getMemberColor(task.assignee);
        }
        
        taskCard.appendChild(taskHeader);
        if (taskMeta.children.length > 0) {
            taskCard.appendChild(taskMeta);
        }
        
        if (task.description) {
            const taskDescription = document.createElement('div');
            taskDescription.className = 'task-description';
            taskDescription.textContent = task.description;
            taskCard.appendChild(taskDescription);
        }
        
        taskCard.addEventListener('click', (e) => {
            if (e.target !== taskCheckbox && !taskCheckbox.contains(e.target)) {
                this.openTaskModal(task.id);
            }
        });
        
        container.appendChild(taskCard);
    }

    renderGlance() {
        const glanceContent = document.getElementById('glanceContent');
        glanceContent.innerHTML = '';
        
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        today.setHours(0, 0, 0, 0);
        
        let startDate, endDate, periodTitle;
        
        // Calculate date range based on selected period
        if (this.glancePeriod === 'day') {
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
            periodTitle = `Day at a Glance - ${this.formatDateShort(now)}`;
        } else if (this.glancePeriod === 'week') {
            // Show next 7 days from today
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 6); // 7 days total (today + 6 more)
            endDate.setHours(23, 59, 59, 999);
            periodTitle = `Week at a Glance - ${this.formatDateShort(startDate)} to ${this.formatDateShort(endDate)}`;
        } else { // month
            // Show next 30 days from today
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(today.getDate() + 29); // 30 days total (today + 29 more)
            endDate.setHours(23, 59, 59, 999);
            periodTitle = `Month at a Glance - ${this.formatDateShort(startDate)} to ${this.formatDateShort(endDate)}`;
        }
        
        const heading = document.createElement('div');
        heading.className = 'glance-title';
        heading.textContent = periodTitle;
        glanceContent.appendChild(heading);
        
        const periodEvents = this.getEventsInRange(startDate, endDate);
        
        // Filter tasks for the period (includes tasks with due dates in range or no due date)
        // Exclude completed tasks from glance view
        // Only show tasks that are due today or in the future
        const periodTasks = this.tasks.filter(task => {
            if (task.completed) return false;
            if (!task.dueDate) return this.glancePeriod === 'day';
            const taskDueDateOnly = this.startOfDay(this.parseEventDate(task.dueDate));
            const startDateOnly = this.startOfDay(startDate);
            const endDateOnly = this.startOfDay(endDate);
            if (taskDueDateOnly < today) return true;
            return taskDueDateOnly >= startDateOnly && taskDueDateOnly <= endDateOnly;
        });
        
        // Events section
        const eventsSection = document.createElement('div');
        eventsSection.className = 'glance-section';
        const eventsHeader = document.createElement('h3');
        eventsHeader.textContent = `Events (${periodEvents.length})`;
        eventsSection.appendChild(eventsHeader);
        
        if (periodEvents.length === 0) {
            const emptyEvents = document.createElement('p');
            emptyEvents.className = 'glance-empty';
            emptyEvents.textContent = 'No events for this period';
            eventsSection.appendChild(emptyEvents);
        } else {
            // Sort events by date
            periodEvents.sort((a, b) => a.occurrenceDate - b.occurrenceDate);
            
            periodEvents.forEach(event => {
                const eventItem = document.createElement('div');
                eventItem.className = 'glance-item glance-event';
                eventItem.style.borderLeftColor = this.getMemberColor(event.assignee);
                
                const eventDate = event.occurrenceDate;
                const dateStr = this.formatEventRange(event, eventDate);
                
                const eventTitle = document.createElement('div');
                eventTitle.className = 'glance-item-title';
                eventTitle.textContent = event.title;
                
                const eventMeta = document.createElement('div');
                eventMeta.className = 'glance-item-meta';
                eventMeta.textContent = dateStr;
                
                if (event.date.includes('T') || event.date.includes(':')) {
                    const timeStr = this.parseEventDate(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    eventMeta.textContent += ` at ${timeStr}`;
                }
                
                if (event.description) {
                    const eventDesc = document.createElement('div');
                    eventDesc.className = 'glance-item-description';
                    eventDesc.textContent = event.description;
                    eventItem.appendChild(eventDesc);
                }
                
                eventItem.appendChild(eventTitle);
                eventItem.appendChild(eventMeta);
                
                eventItem.addEventListener('click', () => {
                    this.openEventModal(null, event.id);
                });
                
                eventsSection.appendChild(eventItem);
            });
        }
        
        glanceContent.appendChild(eventsSection);

        if (this.glancePeriod === 'day') {
            glanceContent.appendChild(this.renderGlanceDinners());
        }
        
        // Tasks section
        const tasksSection = document.createElement('div');
        tasksSection.className = 'glance-section';
        const tasksHeader = document.createElement('h3');
        tasksHeader.textContent = `Tasks (${periodTasks.length})`;
        tasksSection.appendChild(tasksHeader);
        
        if (periodTasks.length === 0) {
            const emptyTasks = document.createElement('p');
            emptyTasks.className = 'glance-empty';
            emptyTasks.textContent = 'No tasks for this period';
            tasksSection.appendChild(emptyTasks);
        } else {
            // Sort tasks by due date (all tasks are uncompleted)
            periodTasks.sort((a, b) => {
                if (!a.dueDate && !b.dueDate) return 0;
                if (!a.dueDate) return 1;
                if (!b.dueDate) return -1;
                return new Date(a.dueDate) - new Date(b.dueDate);
            });
            
            periodTasks.forEach(task => {
                const taskItem = document.createElement('div');
                taskItem.className = 'glance-item glance-task';
                if (task.completed) {
                    taskItem.classList.add('completed');
                }
                
                const taskTitle = document.createElement('div');
                taskTitle.className = 'glance-item-title';
                if (task.completed) {
                    taskTitle.style.textDecoration = 'line-through';
                    taskTitle.style.opacity = '0.8'; /* Increased from 0.6 for better readability */
                    taskTitle.style.color = 'var(--text-primary)'; /* Ensure dark text */
                }
                taskTitle.textContent = task.title;
                
                const taskMeta = document.createElement('div');
                taskMeta.className = 'glance-item-meta';
                
                if (task.assignee) {
                    taskItem.style.borderLeftColor = this.getMemberColor(task.assignee);
                    taskMeta.textContent += task.assignee;
                }
                if (task.dueDate) {
                    const dueDate = this.parseEventDate(task.dueDate);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const dueDateOnly = new Date(dueDate);
                    dueDateOnly.setHours(0, 0, 0, 0);
                    let dueDateText = this.formatDateWithDay(dueDate);
                    // Check if task has time component
                    if (task.dueDate.includes('T') || (task.dueDate.includes(':') && !task.dueDate.match(/^\d{4}-\d{2}-\d{2}$/))) {
                        const timeStr = dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        dueDateText += ` at ${timeStr}`;
                    }
                    if (dueDateOnly < today && !task.completed) {
                        taskMeta.style.color = 'var(--danger-color)';
                        taskMeta.textContent += (taskMeta.textContent ? ' • ' : '') + `📅 ${dueDateText} (Overdue)`;
                    } else {
                        taskMeta.textContent += (taskMeta.textContent ? ' • ' : '') + `📅 ${dueDateText}`;
                    }
                }
                if (!taskMeta.textContent) {
                    taskMeta.textContent = 'No due date';
                    taskMeta.style.color = 'var(--text-secondary)';
                }
                
                if (task.description) {
                    const taskDesc = document.createElement('div');
                    taskDesc.className = 'glance-item-description';
                    taskDesc.textContent = task.description;
                    taskItem.appendChild(taskDesc);
                }
                
                taskItem.appendChild(taskTitle);
                taskItem.appendChild(taskMeta);
                
                taskItem.addEventListener('click', () => {
                    this.openTaskModal(task.id);
                });
                
                tasksSection.appendChild(taskItem);
            });
        }
        
        glanceContent.appendChild(tasksSection);
    }

    renderGlanceDinners() {
        const section = document.createElement('div');
        section.className = 'glance-section';
        const header = document.createElement('h3');
        const dinner = (this.weekMenu[this.dinnerDateKey(new Date())] || '').trim();
        header.textContent = 'Dinner';
        section.appendChild(header);
        const item = document.createElement('div');
        item.className = 'glance-item';
        const title = document.createElement('div');
        title.className = 'glance-item-title';
        title.textContent = dinner || 'Nothing planned';
        const meta = document.createElement('div');
        meta.className = 'glance-item-meta';
        meta.textContent = dinner ? 'Tonight' : 'Tap to add tonight\'s dinner';
        item.appendChild(title);
        item.appendChild(meta);
        item.addEventListener('click', () => {
            const menuBtn = document.querySelector('.nav-item[data-tab="menu"]');
            if (menuBtn) menuBtn.click();
        });
        section.appendChild(item);
        return section;
    }

    openDayEventsModal(date) {
        this.selectedDayDate = date;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const dateStr = this.formatDateShort(date);
        document.getElementById('dayEventsModalTitle').textContent = `Events - ${dateStr}`;
        
        const dayEvents = this.getEventsForDate(date);
        
        const eventsList = document.getElementById('dayEventsList');
        const emptyState = document.getElementById('emptyDayEvents');
        eventsList.innerHTML = '';
        
        if (dayEvents.length === 0) {
            emptyState.style.display = 'block';
        } else {
            emptyState.style.display = 'none';
            
            dayEvents.forEach(event => {
                const eventCard = document.createElement('div');
                eventCard.className = 'event-card';
                
                const eventHeader = document.createElement('div');
                eventHeader.className = 'event-header';
                
                eventCard.style.borderLeftColor = this.getMemberColor(event.assignee);
                
                const eventTitle = document.createElement('div');
                eventTitle.className = 'event-title';
                eventTitle.textContent = event.repeat && event.repeat !== 'none'
                    ? `${event.title} (${event.repeat})`
                    : event.title;
                
                eventHeader.appendChild(eventTitle);
                
                const eventDetails = document.createElement('div');
                eventDetails.className = 'event-details';

                if (event.endDate) {
                    const rangeSpan = document.createElement('div');
                    rangeSpan.className = 'event-time';
                    rangeSpan.textContent = this.formatEventRange(event, this.parseEventDate(event.date));
                    eventDetails.appendChild(rangeSpan);
                }
                
                const hasTime = event.date.includes('T') || event.date.includes(':');
                if (hasTime) {
                    const eventDateTime = this.parseEventDate(event.date);
                    const timeStr = eventDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    const timeSpan = document.createElement('span');
                    timeSpan.className = 'event-time';
                    timeSpan.textContent = `🕐 ${timeStr}`;
                    eventDetails.appendChild(timeSpan);
                }
                
                if (event.description) {
                    const descDiv = document.createElement('div');
                    descDiv.className = 'event-description';
                    descDiv.textContent = event.description;
                    eventDetails.appendChild(descDiv);
                }
                
                const eventActions = document.createElement('div');
                eventActions.className = 'event-actions';
                
                const editBtn = document.createElement('button');
                editBtn.className = 'btn btn-secondary';
                editBtn.textContent = 'Edit';
                editBtn.style.cssText = 'padding: 8px 16px; font-size: 14px;';
                editBtn.addEventListener('click', () => {
                    this.closeDayEventsModal();
                    setTimeout(() => {
                        this.openEventModal(null, event.id);
                    }, 300);
                });
                
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.style.cssText = 'padding: 8px 16px; font-size: 14px;';
                deleteBtn.addEventListener('click', () => {
                    if (confirm(`Delete "${event.title}"?`)) {
                        this.events = this.events.filter(e => e.id !== event.id);
                        this.saveData();
                        this.renderCalendar();
                        this.openDayEventsModal(date); // Refresh the list
                    }
                });
                
                eventActions.appendChild(editBtn);
                eventActions.appendChild(deleteBtn);
                
                eventCard.appendChild(eventHeader);
                if (eventDetails.children.length > 0) {
                    eventCard.appendChild(eventDetails);
                }
                eventCard.appendChild(eventActions);
                
                eventsList.appendChild(eventCard);
            });
        }
        
        document.getElementById('dayEventsModal').style.display = 'block';
    }

    closeDayEventsModal() {
        document.getElementById('dayEventsModal').style.display = 'none';
        this.selectedDayDate = null;
    }

    openEventModal(date = null, eventId = null) {
        if (eventId) {
            const event = this.events.find(e => e.id === eventId);
            if (event) {
                this.editingEventId = eventId;
                document.getElementById('eventModalTitle').textContent = 'Edit Event';
                document.getElementById('eventTitleInput').value = event.title;
                
                const eventDate = this.parseEventDate(event.date);
                document.getElementById('eventDateInput').value = this.formatDateInput(eventDate);
                document.getElementById('eventEndDateInput').value = event.endDate
                    ? this.formatDateInput(this.parseEventDate(event.endDate))
                    : '';
                
                // Check if event has time component
                const hasTime = event.date.includes('T') || (event.date.includes(':') && !event.date.match(/^\d{4}-\d{2}-\d{2}$/));
                if (hasTime) {
                    let hours = eventDate.getHours();
                    const minutes = eventDate.getMinutes();
                    const ampm = hours >= 12 ? 'PM' : 'AM';
                    hours = hours % 12;
                    hours = hours ? hours : 12; // 0 should be 12
                    
                    document.getElementById('eventHourInput').value = hours.toString();
                    document.getElementById('eventMinuteInput').value = minutes.toString().padStart(2, '0');
                    document.getElementById('eventAmPmInput').value = ampm;
                } else {
                    document.getElementById('eventHourInput').value = '';
                    document.getElementById('eventMinuteInput').value = '';
                    document.getElementById('eventAmPmInput').value = '';
                }
                
                document.getElementById('eventDescriptionInput').value = event.description || '';
                document.getElementById('eventRepeatInput').value = event.repeat || 'none';
                document.getElementById('eventAssigneeInput').value = event.assignee || '';
                document.getElementById('deleteEventBtn').style.display = 'block';
            }
        } else {
            this.editingEventId = null;
            document.getElementById('eventModalTitle').textContent = 'Add Event';
            document.getElementById('eventTitleInput').value = '';
            document.getElementById('eventDateInput').value = date ? this.formatDateInput(date) : '';
            document.getElementById('eventEndDateInput').value = '';
            document.getElementById('eventHourInput').value = '';
            document.getElementById('eventMinuteInput').value = '';
            document.getElementById('eventAmPmInput').value = '';
            document.getElementById('eventDescriptionInput').value = '';
            document.getElementById('eventRepeatInput').value = 'none';
            document.getElementById('eventAssigneeInput').value = '';
            document.getElementById('deleteEventBtn').style.display = 'none';
            
            if (!date) {
                const today = new Date();
                document.getElementById('eventDateInput').value = this.formatDateInput(today);
            }
        }
        
        document.getElementById('eventModal').style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('eventTitleInput').focus();
        }, 100);
    }

    closeEventModal() {
        document.getElementById('eventModal').style.display = 'none';
        this.editingEventId = null;
    }

    saveEvent() {
        const title = document.getElementById('eventTitleInput').value.trim();
        const date = document.getElementById('eventDateInput').value;
        const endDateInput = document.getElementById('eventEndDateInput').value;
        const hour = document.getElementById('eventHourInput').value;
        const minute = document.getElementById('eventMinuteInput').value;
        const ampm = document.getElementById('eventAmPmInput').value;
        const description = document.getElementById('eventDescriptionInput').value.trim();
        const repeat = document.getElementById('eventRepeatInput').value || 'none';
        const assignee = document.getElementById('eventAssigneeInput').value.trim();
        
        if (!title) {
            alert('Please enter an event title');
            return;
        }
        
        if (!date) {
            alert('Please select a date');
            return;
        }
        
        // Store date in a timezone-safe format
        // If time is provided, use ISO format with local time
        // If no time, store as just the date string (YYYY-MM-DD)
        let eventDate;
        if (hour && minute && ampm) {
            // Convert 12-hour format to 24-hour format
            let hours = parseInt(hour);
            if (ampm === 'PM' && hours !== 12) {
                hours += 12;
            } else if (ampm === 'AM' && hours === 12) {
                hours = 0;
            }
            const minutes = parseInt(minute);
            
            // Create a local date/time and convert to ISO string
            const [year, month, day] = date.split('-').map(Number);
            const localDate = new Date(year, month - 1, day, hours, minutes);
            eventDate = localDate.toISOString();
        } else {
            eventDate = date;
        }

        let endDate = null;
        if (endDateInput) {
            if (endDateInput < date) {
                alert('End date must be on or after the start date');
                return;
            }
            if (endDateInput !== date) {
                endDate = endDateInput;
            }
        }
        
        if (this.editingEventId) {
            const eventIndex = this.events.findIndex(e => e.id === this.editingEventId);
            if (eventIndex !== -1) {
                this.events[eventIndex] = {
                    ...this.events[eventIndex],
                    title,
                    date: eventDate,
                    endDate,
                    description: description || null,
                    repeat,
                    assignee: assignee || null
                };
                delete this.events[eventIndex].reminders;
            }
        } else {
            const newEvent = {
                id: Date.now().toString(),
                title,
                date: eventDate,
                endDate,
                description: description || null,
                repeat,
                assignee: assignee || null,
                createdAt: new Date().toISOString()
            };
            this.events.push(newEvent);
        }
        
        this.saveData();
        this.closeEventModal();
        this.refreshVisible();
        
        // If we were viewing day events, refresh that view
        if (this.selectedDayDate) {
            const selectedDate = this.selectedDayDate;
            setTimeout(() => {
                this.openDayEventsModal(selectedDate);
            }, 300);
        }
    }

    deleteEvent() {
        if (this.editingEventId && confirm('Are you sure you want to delete this event?')) {
            this.events = this.events.filter(e => e.id !== this.editingEventId);
            this.saveData();
            this.closeEventModal();
            this.refreshVisible();
            
            // If we were viewing day events, refresh that view
            if (this.selectedDayDate) {
                const selectedDate = this.selectedDayDate;
                setTimeout(() => {
                    this.openDayEventsModal(selectedDate);
                }, 300);
            }
        }
    }

    openTaskModal(taskId = null) {
        if (taskId) {
            const task = this.tasks.find(t => t.id === taskId);
            if (task) {
                this.editingTaskId = taskId;
                document.getElementById('taskModalTitle').textContent = 'Edit Task';
                document.getElementById('taskTitleInput').value = task.title;
                document.getElementById('taskAssigneeInput').value = task.assignee || '';
                
                // Handle due date and time
                if (task.dueDate) {
                    const dueDate = new Date(task.dueDate);
                    document.getElementById('taskDueDateInput').value = this.formatDateInput(dueDate);
                    
                    // Check if task has time component
                    const hasTime = task.dueDate.includes('T') || (task.dueDate.includes(':') && !task.dueDate.match(/^\d{4}-\d{2}-\d{2}$/));
                    if (hasTime) {
                        let hours = dueDate.getHours();
                        const minutes = dueDate.getMinutes();
                        const ampm = hours >= 12 ? 'PM' : 'AM';
                        hours = hours % 12;
                        hours = hours ? hours : 12; // 0 should be 12
                        
                        document.getElementById('taskDueHourInput').value = hours.toString();
                        document.getElementById('taskDueMinuteInput').value = minutes.toString().padStart(2, '0');
                        document.getElementById('taskDueAmPmInput').value = ampm;
                    } else {
                        document.getElementById('taskDueHourInput').value = '';
                        document.getElementById('taskDueMinuteInput').value = '';
                        document.getElementById('taskDueAmPmInput').value = '';
                    }
                } else {
                    document.getElementById('taskDueDateInput').value = '';
                    document.getElementById('taskDueHourInput').value = '';
                    document.getElementById('taskDueMinuteInput').value = '';
                    document.getElementById('taskDueAmPmInput').value = '';
                }
                
                document.getElementById('taskDescriptionInput').value = task.description || '';
                document.getElementById('deleteTaskBtn').style.display = 'block';
            }
        } else {
            this.editingTaskId = null;
            document.getElementById('taskModalTitle').textContent = 'Add Task';
            document.getElementById('taskTitleInput').value = '';
            document.getElementById('taskAssigneeInput').value = '';
            document.getElementById('taskDueDateInput').value = '';
            document.getElementById('taskDueHourInput').value = '';
            document.getElementById('taskDueMinuteInput').value = '';
            document.getElementById('taskDueAmPmInput').value = '';
            document.getElementById('taskDescriptionInput').value = '';
            document.getElementById('deleteTaskBtn').style.display = 'none';
        }
        
        document.getElementById('taskModal').style.display = 'block';
        
        setTimeout(() => {
            document.getElementById('taskTitleInput').focus();
        }, 100);
    }

    closeTaskModal() {
        document.getElementById('taskModal').style.display = 'none';
        this.editingTaskId = null;
    }

    saveTask() {
        const title = document.getElementById('taskTitleInput').value.trim();
        const assignee = document.getElementById('taskAssigneeInput').value.trim();
        const dueDate = document.getElementById('taskDueDateInput').value;
        const dueHour = document.getElementById('taskDueHourInput').value;
        const dueMinute = document.getElementById('taskDueMinuteInput').value;
        const dueAmPm = document.getElementById('taskDueAmPmInput').value;
        const description = document.getElementById('taskDescriptionInput').value.trim();
        
        if (!title) {
            alert('Please enter a task title');
            return;
        }
        
        // Store due date/time in a timezone-safe format
        // If time is provided, use ISO format with local time
        // If no time, store as just the date string (YYYY-MM-DD)
        let dueDateValue;
        if (dueDate) {
            if (dueHour && dueMinute && dueAmPm) {
                // Convert 12-hour format to 24-hour format
                let hours = parseInt(dueHour);
                if (dueAmPm === 'PM' && hours !== 12) {
                    hours += 12;
                } else if (dueAmPm === 'AM' && hours === 12) {
                    hours = 0;
                }
                const minutes = parseInt(dueMinute);
                
                // Create a local date/time and convert to ISO string
                const [year, month, day] = dueDate.split('-').map(Number);
                const localDate = new Date(year, month - 1, day, hours, minutes);
                dueDateValue = localDate.toISOString();
            } else {
                // Just store the date string (no time component)
                dueDateValue = dueDate;
            }
        } else {
            dueDateValue = null;
        }
        
        if (this.editingTaskId) {
            // Update existing task
            const taskIndex = this.tasks.findIndex(t => t.id === this.editingTaskId);
            if (taskIndex !== -1) {
                this.tasks[taskIndex] = {
                    ...this.tasks[taskIndex],
                    title,
                    assignee: assignee || null,
                    dueDate: dueDateValue,
                    description: description || null
                };
                delete this.tasks[taskIndex].reminders;
            }
        } else {
            // Add new task
            const newTask = {
                id: Date.now().toString(),
                title,
                assignee: assignee || null,
                dueDate: dueDateValue,
                description: description || null,
                completed: false,
                createdAt: new Date().toISOString()
            };
            this.tasks.push(newTask);
        }
        
        this.saveData();
        this.closeTaskModal();
        this.refreshVisible();
        this.renderTaskFilters();
    }

    deleteTask() {
        if (this.editingTaskId && confirm('Are you sure you want to delete this task?')) {
            this.tasks = this.tasks.filter(t => t.id !== this.editingTaskId);
            this.saveData();
            this.closeTaskModal();
            this.refreshVisible();
            this.renderTaskFilters();
        }
    }

    toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = new Date().toISOString();
            } else {
                delete task.completedAt;
            }
            this.saveData();
            this.refreshVisible();
        }
    }

    renderGroceries() {
        const groceriesList = document.getElementById('groceriesList');
        const emptyState = document.getElementById('emptyGroceriesState');
        
        groceriesList.innerHTML = '';
        const clearBtn = document.getElementById('clearCheckedBtn');
        const hasChecked = this.groceries.some(g => g.checked);
        if (clearBtn) {
            clearBtn.style.display = hasChecked ? 'block' : 'none';
        }
        
        if (this.groceries.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        // Separate unchecked and checked items
        const uncheckedItems = this.groceries.filter(g => !g.checked);
        const checkedItems = this.groceries.filter(g => g.checked);
        
        // Sort unchecked items by creation date (newest first)
        const sortedUnchecked = [...uncheckedItems].sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        
        // Sort checked items by checked date (most recently checked first)
        const sortedChecked = [...checkedItems].sort((a, b) => {
            return new Date(b.checkedAt || b.createdAt) - new Date(a.checkedAt || a.createdAt);
        });
        
        // Render unchecked items
        sortedUnchecked.forEach(grocery => {
            this.renderGroceryCard(grocery, groceriesList);
        });
        
        // Render checked items (collapsed by default)
        if (sortedChecked.length > 0) {
            const completedHeader = document.createElement('div');
            completedHeader.className = 'completed-header';
            completedHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 15px; background: var(--bg-color); border-radius: 12px; margin-top: 20px; cursor: pointer;';
            
            const completedTitle = document.createElement('span');
            completedTitle.textContent = `✅ Purchased (${sortedChecked.length})`;
            completedTitle.style.cssText = 'font-weight: 600; color: var(--text-primary);';
            
            const expandIcon = document.createElement('span');
            expandIcon.textContent = '▶';
            expandIcon.style.cssText = 'font-size: 12px; color: var(--text-secondary);';
            
            completedHeader.appendChild(completedTitle);
            completedHeader.appendChild(expandIcon);
            
            const completedContainer = document.createElement('div');
            completedContainer.className = 'completed-groceries';
            completedContainer.style.display = 'none';
            
            sortedChecked.forEach(grocery => {
                this.renderGroceryCard(grocery, completedContainer);
            });
            
            groceriesList.appendChild(completedHeader);
            groceriesList.appendChild(completedContainer);
            
            // Add click handler to toggle visibility
            completedHeader.addEventListener('click', () => {
                const isHidden = completedContainer.style.display === 'none';
                completedContainer.style.display = isHidden ? 'block' : 'none';
                expandIcon.textContent = isHidden ? '▼' : '▶';
            });
        }
    }
    
    renderGroceryCard(grocery, container) {
        const groceryCard = document.createElement('div');
        groceryCard.className = 'grocery-card';
        if (grocery.checked) {
            groceryCard.classList.add('checked');
        }
        
        const groceryHeader = document.createElement('div');
        groceryHeader.className = 'grocery-header';
        
        const groceryTitle = document.createElement('div');
        groceryTitle.className = 'grocery-title';
        groceryTitle.textContent = grocery.item;
        
        const groceryCheckbox = document.createElement('div');
        groceryCheckbox.className = 'grocery-checkbox';
        if (grocery.checked) {
            groceryCheckbox.classList.add('checked');
            groceryCheckbox.textContent = '✓';
        }
        
        groceryCheckbox.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleGrocery(grocery.id);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'grocery-delete-btn';
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm('Delete this item from the grocery list?')) {
                this.deleteGrocery(grocery.id);
            }
        });
        
        groceryHeader.appendChild(groceryTitle);
        groceryHeader.appendChild(groceryCheckbox);
        groceryHeader.appendChild(deleteBtn);
        
        groceryCard.appendChild(groceryHeader);
        container.appendChild(groceryCard);
    }

    addGrocery() {
        const input = document.getElementById('groceryItemInput');
        const item = input.value.trim();
        
        if (!item) {
            return;
        }
        
        const newGrocery = {
            id: Date.now().toString(),
            item: item,
            checked: false,
            createdAt: new Date().toISOString()
        };
        
        this.groceries.push(newGrocery);
        this.saveData();
        this.renderGroceries();
        
        // Clear input
        input.value = '';
        input.focus();
    }

    toggleGrocery(groceryId) {
        const grocery = this.groceries.find(g => g.id === groceryId);
        if (grocery) {
            grocery.checked = !grocery.checked;
            if (grocery.checked) {
                grocery.checkedAt = new Date().toISOString();
            } else {
                delete grocery.checkedAt;
            }
            this.saveData();
            this.renderGroceries();
        }
    }

    deleteGrocery(groceryId) {
        this.groceries = this.groceries.filter(g => g.id !== groceryId);
        this.saveData();
        this.renderGroceries();
    }

    clearCheckedGroceries() {
        const count = this.groceries.filter(g => g.checked).length;
        if (!count) return;
        if (!confirm(`Remove ${count} purchased item${count === 1 ? '' : 's'}?`)) return;
        this.groceries = this.groceries.filter(g => !g.checked);
        this.saveData();
        this.renderGroceries();
    }

    openMembersModal() {
        document.getElementById('membersModal').style.display = 'block';
        this.renderMembers();
    }

    closeMembersModal() {
        document.getElementById('membersModal').style.display = 'none';
    }

    renderMembers() {
        const membersList = document.getElementById('membersList');
        membersList.innerHTML = '';
        
        if (this.members.length === 0) {
            membersList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 20px;">No family members yet. Add one below!</p>';
            return;
        }
        
        this.members.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.className = 'member-item';
            
            const memberInfo = document.createElement('div');
            memberInfo.style.flex = '1';
            
            const memberName = document.createElement('div');
            memberName.className = 'member-name';
            const swatch = document.createElement('span');
            swatch.className = 'member-swatch';
            swatch.style.background = member.color || this.getMemberColor(member.name);
            memberName.appendChild(swatch);
            memberName.appendChild(document.createTextNode(member.name));
            memberInfo.appendChild(memberName);
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'member-delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Remove ${member.name} from family members?`)) {
                    this.members = this.members.filter(m => m.id !== member.id);
                    this.saveData();
                    this.updateMemberSelects();
                    this.renderTaskFilters();
                    this.renderMembers();
                    this.refreshVisible();
                }
            });
            
            memberItem.appendChild(memberInfo);
            memberItem.appendChild(deleteBtn);
            membersList.appendChild(memberItem);
        });
    }

    addMember() {
        const nameInput = document.getElementById('memberNameInput');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('Please enter a name');
            return;
        }
        
        if (this.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
            alert('A member with this name already exists');
            return;
        }
        
        const used = new Set(this.members.map(m => m.color));
        const color = this.memberColors.find(c => !used.has(c)) || this.memberColors[this.members.length % this.memberColors.length];
        const newMember = {
            id: Date.now().toString(),
            name: name,
            color,
            createdAt: new Date().toISOString()
        };
        
        this.members.push(newMember);
        this.saveData();
        this.updateMemberSelects();
        this.renderTaskFilters();
        this.renderMembers();
        nameInput.value = '';
    }

    updateMemberSelects() {
        const selects = [
            { id: 'taskAssigneeInput', empty: 'Unassigned' },
            { id: 'eventAssigneeInput', empty: 'Everyone' }
        ];
        selects.forEach(({ id, empty }) => {
            const select = document.getElementById(id);
            if (!select) return;
            const current = select.value;
            select.innerHTML = `<option value="">${empty}</option>`;
            this.members.forEach(member => {
                const option = document.createElement('option');
                option.value = member.name;
                option.textContent = member.name;
                select.appendChild(option);
            });
            if ([...select.options].some(o => o.value === current)) {
                select.value = current;
            }
        });
    }

    openMoreModal() {
        document.getElementById('familyIdDisplay').value = this.familyId;
        document.getElementById('moreModal').style.display = 'block';
        if (window.updateManager) {
            window.updateManager.loadVersion();
        }
    }

    closeMoreModal() {
        document.getElementById('moreModal').style.display = 'none';
    }

    setupFamilyIdUI() {
        const copyBtn = document.getElementById('copyFamilyIdBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const familyIdInput = document.getElementById('familyIdDisplay');
                familyIdInput.select();
                familyIdInput.setSelectionRange(0, 99999);
                try {
                    document.execCommand('copy');
                    copyBtn.textContent = 'Copied!';
                    copyBtn.style.background = '#52C41A';
                    setTimeout(() => {
                        copyBtn.textContent = 'Copy';
                        copyBtn.style.background = '';
                    }, 2000);
                } catch (err) {
                    navigator.clipboard.writeText(this.familyId).then(() => {
                        copyBtn.textContent = 'Copied!';
                        copyBtn.style.background = '#52C41A';
                        setTimeout(() => {
                            copyBtn.textContent = 'Copy';
                            copyBtn.style.background = '';
                        }, 2000);
                    });
                }
            });
        }

        const setBtn = document.getElementById('setFamilyIdBtn');
        const familyIdInput = document.getElementById('familyIdInput');
        if (setBtn && familyIdInput) {
            setBtn.addEventListener('click', () => {
                const newFamilyId = familyIdInput.value.trim();
                if (newFamilyId && newFamilyId.length > 0) {
                    // Validate it's a 6-digit number
                    if (!/^\d{6}$/.test(newFamilyId)) {
                        alert('Family ID must be exactly 6 digits');
                        return;
                    }
                    if (confirm('Connect this phone to that family? This phone will show their calendar, lists, and dinners.')) {
                        localStorage.setItem('familyConnectFamilyId', newFamilyId);
                        ['familyConnectEvents', 'familyConnectTasks', 'familyConnectGroceries', 'familyConnectMembers', 'familyConnectWeekMenu'].forEach((key) => {
                            localStorage.removeItem(key);
                        });
                        this.familyId = newFamilyId;
                        document.getElementById('familyIdDisplay').value = newFamilyId;
                        familyIdInput.value = '';
                        location.reload();
                    }
                } else {
                    alert('Please enter a Family ID');
                }
            });
            
            familyIdInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    setBtn.click();
                }
            });
            
            // Only allow digits and limit to 6 characters
            familyIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
            });
        }
    }

    updateSyncStatus() {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) {
            if (this.firebaseEnabled) {
                statusEl.textContent = 'Syncing across devices';
                statusEl.style.color = 'var(--success-color)';
            } else {
                statusEl.textContent = 'Saved on this device only';
                statusEl.style.color = 'var(--text-secondary)';
            }
        }
    }

    formatDate(date) {
        return date.toISOString().split('T')[0];
    }

    formatDateInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    formatDateShort(date) {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    formatDateWithDay(date) {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${dayNames[date.getDay()]} ${monthNames[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    }

    ensureMemberColors() {
        let changed = false;
        this.members.forEach((member, index) => {
            if (!member.color) {
                member.color = this.memberColors[index % this.memberColors.length];
                changed = true;
            }
        });
        if (changed) this.saveToLocalStorage();
    }

    getMemberColor(name) {
        if (!name) return 'var(--primary-color)';
        const member = this.members.find(m => m.name === name);
        return (member && member.color) || this.memberColors[0];
    }

    hexToRgba(hex, alpha) {
        if (!hex || !hex.startsWith('#')) return `rgba(91, 108, 255, ${alpha})`;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    startOfDay(date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    eventSpanDays(event) {
        if (!event.endDate) return 0;
        const start = this.startOfDay(this.parseEventDate(event.date));
        const end = this.startOfDay(this.parseEventDate(event.endDate));
        const days = Math.round((end - start) / 86400000);
        return days > 0 ? days : 0;
    }

    isOccurrenceStart(event, date) {
        const eventDate = this.startOfDay(this.parseEventDate(event.date));
        const target = this.startOfDay(date);
        if (target < eventDate) return false;
        if (!event.repeat || event.repeat === 'none') {
            return eventDate.getTime() === target.getTime();
        }
        if (event.repeat === 'weekly') {
            const days = Math.round((target - eventDate) / 86400000);
            return days % 7 === 0;
        }
        if (event.repeat === 'monthly') {
            return target.getDate() === eventDate.getDate();
        }
        return false;
    }

    eventOccursOn(event, date) {
        const target = this.startOfDay(date);
        const span = this.eventSpanDays(event);
        for (let i = 0; i <= span; i++) {
            const maybeStart = new Date(target);
            maybeStart.setDate(maybeStart.getDate() - i);
            if (this.isOccurrenceStart(event, maybeStart)) return true;
        }
        return false;
    }

    formatEventRange(event, occurrenceDate) {
        const start = this.startOfDay(occurrenceDate || this.parseEventDate(event.date));
        const span = this.eventSpanDays(event);
        if (span <= 0) return this.formatDateWithDay(start);
        const end = new Date(start);
        end.setDate(end.getDate() + span);
        return `${this.formatDateWithDay(start)} – ${this.formatDateShort(end)}`;
    }

    getEventsForDate(date) {
        return this.events.filter(event => this.eventOccursOn(event, date));
    }

    getEventsInRange(startDate, endDate) {
        const start = this.startOfDay(startDate);
        const end = this.startOfDay(endDate);
        const results = [];
        this.events.forEach(event => {
            const cursor = this.startOfDay(this.parseEventDate(event.date));
            const span = this.eventSpanDays(event);
            if (!event.repeat || event.repeat === 'none') {
                const spanEnd = new Date(cursor);
                spanEnd.setDate(spanEnd.getDate() + span);
                if (spanEnd >= start && cursor <= end) {
                    results.push({ ...event, occurrenceDate: cursor });
                }
                return;
            }
            let day = new Date(cursor);
            let guard = 0;
            while (day <= end && guard < 400) {
                const spanEnd = new Date(day);
                spanEnd.setDate(spanEnd.getDate() + span);
                if (spanEnd >= start && day <= end && this.isOccurrenceStart(event, day)) {
                    results.push({ ...event, occurrenceDate: new Date(day) });
                }
                if (event.repeat === 'weekly') day.setDate(day.getDate() + 7);
                else if (event.repeat === 'monthly') day.setMonth(day.getMonth() + 1);
                else break;
                guard++;
            }
        });
        return results;
    }

    isTaskOverdue(task) {
        if (task.completed || !task.dueDate) return false;
        const due = this.startOfDay(this.parseEventDate(task.dueDate));
        const today = this.startOfDay(new Date());
        return due < today;
    }

    isRecentCompleted(task) {
        if (!task.completed) return true;
        const stamp = task.completedAt || task.dueDate || task.createdAt;
        if (!stamp) return true;
        return Date.now() - new Date(stamp).getTime() <= 14 * 24 * 60 * 60 * 1000;
    }

    getFilteredTasks() {
        return this.tasks.filter(task => {
            if (!this.isRecentCompleted(task)) return false;
            if (this.taskFilter === 'overdue') return this.isTaskOverdue(task);
            if (this.taskFilter !== 'all') return task.assignee === this.taskFilter;
            return true;
        });
    }

    renderTaskFilters() {
        const row = document.getElementById('taskFilters');
        if (!row) return;
        const filters = [
            { id: 'all', label: 'All' },
            { id: 'overdue', label: 'Overdue' },
            ...this.members.map(member => ({ id: member.name, label: member.name }))
        ];
        row.innerHTML = '';
        filters.forEach(filter => {
            const chip = document.createElement('button');
            chip.className = 'filter-chip' + (this.taskFilter === filter.id ? ' active' : '');
            chip.textContent = filter.label;
            chip.addEventListener('click', () => {
                this.taskFilter = filter.id;
                this.renderTaskFilters();
                this.renderTasks();
            });
            row.appendChild(chip);
        });
    }

    parseEventDate(dateString) {
        // If it's just a date string (YYYY-MM-DD), parse it as local date
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            const [year, month, day] = dateString.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        // Otherwise, parse as ISO string (with time)
        return new Date(dateString);
    }

    // Helper function to compare if two dates are the same day (ignoring time and timezone)
    isSameDate(eventDateString, compareDate) {
        const eventDate = this.parseEventDate(eventDateString);
        // Compare year, month, and day only
        return eventDate.getFullYear() === compareDate.getFullYear() &&
               eventDate.getMonth() === compareDate.getMonth() &&
               eventDate.getDate() === compareDate.getDate();
    }
}

// Initialize the app
let app;
document.addEventListener('DOMContentLoaded', () => {
    try {
        app = new FamilyConnect();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        const container = document.querySelector('.container');
        if (container) {
            container.innerHTML = '<h1>Error Loading App</h1><p>Please refresh the page. If the problem persists, clear your browser cache.</p>';
        }
    }
});

// Update Manager Class
class UpdateManager {
    constructor() {
        this.registration = null;
        this.updateAvailable = false;
        this.checkingForUpdate = false;
        this.setupUI();
    }
    
    setupUI() {
        // Setup update banner buttons (use event delegation since elements are created dynamically)
        document.body.addEventListener('click', (e) => {
            if (e.target.id === 'updateNowBtn') {
                this.applyUpdate();
            } else if (e.target.id === 'updateLaterBtn') {
                this.hideUpdateBanner();
            }
        });
        
        // Setup check for updates button in settings
        const checkUpdateBtn = document.getElementById('checkUpdateBtn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => this.checkForUpdate());
        }
    }
    
    async registerServiceWorker() {
        if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') {
            console.log('Service Workers not supported or file protocol');
            return;
        }
        
        try {
            this.registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
            console.log('Service Worker registered:', this.registration);
            
            // Check for updates immediately
            await this.checkForUpdate();
            
            // Listen for service worker updates
            this.registration.addEventListener('updatefound', () => {
                console.log('Service Worker update found');
                this.handleUpdateFound();
            });
            
            // Check for updates periodically (every 5 minutes)
            setInterval(() => this.checkForUpdate(), 5 * 60 * 1000);
            
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }
    
    async checkForUpdate() {
        if (this.checkingForUpdate || !this.registration) return;
        
        this.checkingForUpdate = true;
        const checkBtn = document.getElementById('checkUpdateBtn');
        const updateBtnText = document.getElementById('updateBtnText');
        const updateStatusText = document.getElementById('updateStatusText');
        
        if (checkBtn) {
            checkBtn.disabled = true;
        }
        if (updateBtnText) {
            updateBtnText.textContent = '⏳ Checking...';
        }
        if (updateStatusText) {
            updateStatusText.textContent = '';
        }
        
        try {
            // Force update check
            await this.registration.update();
            
            // Check if there's a waiting service worker
            if (this.registration.waiting) {
                this.updateAvailable = true;
                this.showUpdateBanner();
                if (updateStatusText) {
                    updateStatusText.textContent = 'Update available! Choose Update or Later.';
                    updateStatusText.style.color = 'var(--primary-color)';
                }
            } else {
                // Check if there's an installing service worker
                if (this.registration.installing) {
                    this.handleUpdateFound();
                } else {
                    console.log('No updates available');
                    if (updateBtnText) {
                        updateBtnText.textContent = '✅ Up to date';
                    }
                    if (updateStatusText) {
                        updateStatusText.textContent = 'You have the latest version.';
                        updateStatusText.style.color = 'var(--text-secondary)';
                    }
                    setTimeout(() => {
                        if (updateBtnText) {
                            updateBtnText.textContent = '🔄 Check for Updates';
                        }
                        if (checkBtn) {
                            checkBtn.disabled = false;
                        }
                        if (updateStatusText) {
                            updateStatusText.textContent = '';
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.error('Error checking for updates:', error);
            if (updateBtnText) {
                updateBtnText.textContent = '❌ Error';
            }
            if (updateStatusText) {
                updateStatusText.textContent = 'Failed to check for updates.';
                updateStatusText.style.color = 'var(--primary-color)';
            }
            setTimeout(() => {
                if (updateBtnText) {
                    updateBtnText.textContent = '🔄 Check for Updates';
                }
                if (checkBtn) {
                    checkBtn.disabled = false;
                }
                if (updateStatusText) {
                    updateStatusText.textContent = '';
                }
            }, 2000);
        } finally {
            this.checkingForUpdate = false;
        }
    }
    
    handleUpdateFound() {
        const installingWorker = this.registration.installing;
        if (!installingWorker) return;
        
        installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                    // New service worker is waiting
                    this.updateAvailable = true;
                    this.showUpdateBanner();
                } else {
                    // First time install
                    console.log('Service Worker installed for the first time');
                }
            }
        });
    }
    
    showUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.remove('hidden');
            document.body.classList.add('update-modal-open');
            Array.from(document.body.children).forEach((el) => {
                if (el !== banner) el.inert = true;
            });
            const updateBtn = document.getElementById('updateNowBtn');
            if (updateBtn) updateBtn.focus();
        }
        const updateBtnText = document.getElementById('updateBtnText');
        if (updateBtnText) {
            updateBtnText.textContent = '🔄 Update Available';
        }
        const checkBtn = document.getElementById('checkUpdateBtn');
        if (checkBtn) {
            checkBtn.disabled = false;
        }
    }
    
    hideUpdateBanner() {
        const banner = document.getElementById('updateBanner');
        if (banner) {
            banner.classList.add('hidden');
        }
        document.body.classList.remove('update-modal-open');
        Array.from(document.body.children).forEach((el) => {
            el.inert = false;
        });
    }
    
    async applyUpdate() {
        try {
            // Clear all caches first to ensure fresh files are loaded
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => {
                    console.log('Deleting cache:', cacheName);
                    return caches.delete(cacheName);
                })
            );
            
            // Unregister all service workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(
                registrations.map(registration => {
                    console.log('Unregistering service worker');
                    return registration.unregister();
                })
            );
            
            // If there's a waiting worker, tell it to skip waiting
            if (this.registration && this.registration.waiting) {
                this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            
            // Force reload with cache bypass (use timestamp to bust cache)
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        } catch (error) {
            console.error('Error applying update:', error);
            // Fallback: reload with cache bypass
            window.location.href = window.location.href.split('?')[0] + '?v=' + Date.now();
        }
    }
    
    async loadVersion() {
        const versionText = document.getElementById('versionText');
        if (!versionText) return;
        
        try {
            // Get version from cache name (most reliable method)
            const cacheNames = await caches.keys();
            const currentCache = cacheNames.find(name => name.startsWith('family-connect-'));
            if (currentCache) {
                const version = currentCache.replace('family-connect-', '');
                versionText.textContent = `App Version: ${version}`;
            } else {
                // Try to get from service worker if available
                if (this.registration && this.registration.active) {
                    // Fetch the service worker script and extract version
                    try {
                        const swResponse = await fetch('./service-worker.js?t=' + Date.now());
                        const swText = await swResponse.text();
                        const versionMatch = swText.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
                        if (versionMatch) {
                            versionText.textContent = `App Version: ${versionMatch[1]}`;
                        } else {
                            versionText.textContent = 'App Version: Unknown';
                        }
                    } catch (e) {
                        versionText.textContent = 'App Version: Not installed';
                    }
                } else {
                    versionText.textContent = 'App Version: Not installed';
                }
            }
        } catch (error) {
            console.error('Error loading version:', error);
            versionText.textContent = 'App Version: Error';
        }
    }
}

// Initialize Update Manager
let updateManager = null;
if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
    window.addEventListener('load', () => {
        updateManager = new UpdateManager();
        window.updateManager = updateManager; // Make it globally accessible
        updateManager.registerServiceWorker();
    });
}

// Suppress harmless browser extension errors
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return false;
    }
}, true);

