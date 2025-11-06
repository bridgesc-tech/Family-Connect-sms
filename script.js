// Family Connect Application
class FamilyConnect {
    constructor() {
        this.events = [];
        this.tasks = [];
        this.members = [];
        this.firebaseEnabled = false;
        this.familyId = this.getOrCreateFamilyId();
        this.currentDate = new Date();
        this.currentMonth = this.currentDate.getMonth();
        this.currentYear = this.currentDate.getFullYear();
        this.editingEventId = null;
        this.editingTaskId = null;
        this.glancePeriod = 'day'; // 'day', 'week', or 'month'
        this.scheduledReminders = [];
        this.reminderCheckInterval = null;
        this.vercelUrl = localStorage.getItem('familyConnectVercelUrl') || '';
        this.apiKey = localStorage.getItem('familyConnectApiKey') || '';
        
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
        const maxAttempts = 20;
        if (typeof firebase !== 'undefined' || attempts >= maxAttempts) {
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
                
                // Listen for real-time updates
                db.collection('families').doc(this.familyId)
                    .onSnapshot((docSnapshot) => {
                        if (docSnapshot.exists) {
                            const data = docSnapshot.data();
                            
                            if (data.events) {
                                this.events = data.events;
                                this.saveToLocalStorage();
                                this.renderCalendar();
                                this.renderGlance();
                            }
                            
                            if (data.tasks) {
                                this.tasks = data.tasks;
                                this.saveToLocalStorage();
                                this.renderTasks();
                                this.renderGlance();
                            }
                            
                            if (data.members) {
                                this.members = data.members;
                                this.saveToLocalStorage();
                                this.updateMemberSelects();
                            }
                            
                            if (data.scheduledReminders) {
                                this.scheduledReminders = data.scheduledReminders;
                                localStorage.setItem('familyConnectScheduledReminders', JSON.stringify(this.scheduledReminders));
                            }
                            
                            console.log('Synced from cloud');
                        }
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
                    const data = docSnapshot.data();
                    this.events = data.events || [];
                    this.tasks = data.tasks || [];
                    this.members = data.members || [];
                    this.saveToLocalStorage();
                    return;
                }
            } catch (error) {
                console.error('Error loading from Firebase:', error);
            }
        }
        
        // Fall back to localStorage
        const storedEvents = localStorage.getItem('familyConnectEvents');
        const storedTasks = localStorage.getItem('familyConnectTasks');
        const storedMembers = localStorage.getItem('familyConnectMembers');
        const storedReminders = localStorage.getItem('familyConnectScheduledReminders');
        
        this.events = storedEvents ? JSON.parse(storedEvents) : [];
        this.tasks = storedTasks ? JSON.parse(storedTasks) : [];
        this.members = storedMembers ? JSON.parse(storedMembers) : [];
        this.scheduledReminders = storedReminders ? JSON.parse(storedReminders) : [];
    }

    saveData() {
        // Always save to localStorage first
        this.saveToLocalStorage();
        
        // Then sync to Firebase
        if (this.firebaseEnabled) {
            db.collection('families').doc(this.familyId).set({
                events: this.events,
                tasks: this.tasks,
                members: this.members,
                scheduledReminders: this.scheduledReminders,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .then(() => {
                console.log('Synced to cloud');
            })
            .catch((error) => {
                console.error('Error syncing to Firebase:', error);
            });
        }
    }

    saveToLocalStorage() {
        localStorage.setItem('familyConnectEvents', JSON.stringify(this.events));
        localStorage.setItem('familyConnectTasks', JSON.stringify(this.tasks));
        localStorage.setItem('familyConnectMembers', JSON.stringify(this.members));
    }

    initializeApp() {
        // Register service worker
        if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
            navigator.serviceWorker.register('./service-worker.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => {});
        }

        this.updateSyncStatus();
        this.setupFamilyIdUI();
        this.setupTabNavigation();
        this.setupCalendar();
        this.setupTasks();
        this.setupGlance();
        this.setupModals();
        this.renderCalendar();
        this.renderTasks();
        this.renderGlance();
        this.updateMemberSelects();
        this.setupReminderHandlers();
        this.loadScheduledReminders();
        this.startReminderChecker();
        
        // Setup date inputs to prevent typing but allow calendar
        this.setupDateInputs();
    }
    
    setupDateInputs() {
        // Prevent typing in date inputs, but allow calendar picker to open
        const dateInputs = ['eventDateInput', 'taskDueDateInput'];
        
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
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                
                // Update active states
                tabBtns.forEach(b => b.classList.remove('active'));
                tabContents.forEach(c => c.classList.remove('active'));
                
                btn.classList.add('active');
                document.getElementById(targetTab + 'Tab').classList.add('active');
                
                // Refresh glance view when switching to it
                if (targetTab === 'glance') {
                    this.renderGlance();
                }
            });
        });
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
        
    }

    setupTasks() {
        document.getElementById('addTaskBtn').addEventListener('click', () => {
            this.openTaskModal();
        });
    }

    setupGlance() {
        const glanceBtns = document.querySelectorAll('.glance-option-btn');
        glanceBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Update active states
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
        
        // Family Sync Modal
        document.getElementById('openFamilyModalBtn').addEventListener('click', () => {
            this.openFamilyModal();
        });
        
        document.getElementById('closeFamilyModal').addEventListener('click', () => {
            this.closeFamilyModal();
        });
        
        // Members Modal
        document.getElementById('openMembersModalBtn').addEventListener('click', () => {
            this.closeFamilyModal();
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
        
        // Settings Modal
        document.getElementById('openSettingsModalBtn').addEventListener('click', () => {
            this.openSettingsModal();
        });
        
        document.getElementById('closeSettingsModal').addEventListener('click', () => {
            this.closeSettingsModal();
        });
        
        document.getElementById('saveSettingsBtn').addEventListener('click', () => {
            this.saveSettings();
        });
        
        document.getElementById('testConnectionBtn').addEventListener('click', () => {
            this.testConnection();
        });
        
        // Close modals when clicking outside
        window.addEventListener('click', (e) => {
            const modals = ['dayEventsModal', 'eventModal', 'taskModal', 'familyModal', 'membersModal', 'settingsModal'];
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

    setupReminderHandlers() {
        // Event reminder handlers
        document.getElementById('eventRemindersEnabled').addEventListener('change', (e) => {
            const options = document.getElementById('eventReminderOptions');
            options.style.display = e.target.checked ? 'block' : 'none';
            if (e.target.checked) {
                this.updateReminderMembersList('event');
            }
        });
        
        document.getElementById('sendEventReminderBtn').addEventListener('click', () => {
            this.sendReminderNow('event', this.editingEventId);
        });
        
        // Task reminder handlers
        document.getElementById('taskRemindersEnabled').addEventListener('change', (e) => {
            const options = document.getElementById('taskReminderOptions');
            options.style.display = e.target.checked ? 'block' : 'none';
            if (e.target.checked) {
                this.updateReminderMembersList('task');
            }
        });
        
        document.getElementById('sendTaskReminderBtn').addEventListener('click', () => {
            this.sendReminderNow('task', this.editingTaskId);
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
            
            // Add event indicators
            const dayEvents = this.events.filter(event => {
                return this.isSameDate(event.date, dayDate);
            });
            
            if (dayEvents.length > 0) {
                const eventsContainer = document.createElement('div');
                eventsContainer.className = 'calendar-day-events';
                dayEvents.forEach((event, index) => {
                    if (index < 3) { // Show max 3 dots
                        const dot = document.createElement('span');
                        dot.className = 'event-dot';
                        // Color based on event type or priority
                        if (event.priority === 'high') {
                            dot.classList.add('danger');
                        } else if (event.priority === 'medium') {
                            dot.classList.add('warning');
                        } else {
                            dot.classList.add('primary');
                        }
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
        
        if (this.tasks.length === 0) {
            emptyState.style.display = 'block';
            return;
        }
        
        emptyState.style.display = 'none';
        
        // Separate completed and uncompleted tasks
        const uncompletedTasks = this.tasks.filter(t => !t.completed);
        const completedTasks = this.tasks.filter(t => t.completed);
        
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
            assigneeSpan.textContent = `👤 ${task.assignee}`;
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
        let startDate, endDate, periodTitle;
        
        // Calculate date range based on selected period
        if (this.glancePeriod === 'day') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            endDate.setHours(23, 59, 59, 999);
            periodTitle = `Day at a Glance - ${this.formatDateShort(now)}`;
        } else if (this.glancePeriod === 'week') {
            // Get start of week (Sunday)
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay());
            startDate.setHours(0, 0, 0, 0);
            // Get end of week (Saturday)
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            periodTitle = `Week at a Glance - ${this.formatDateShort(startDate)} to ${this.formatDateShort(endDate)}`;
        } else { // month
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
            periodTitle = `Month at a Glance - ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
        }
        
        // Filter events for the period
        const periodEvents = this.events.filter(event => {
            const eventDate = this.parseEventDate(event.date);
            // Normalize dates to compare only date part (ignore time)
            const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
            const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
            const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
            return eventDateOnly >= startDateOnly && eventDateOnly <= endDateOnly;
        });
        
        // Filter tasks for the period (includes tasks with due dates in range or no due date)
        // Exclude completed tasks from glance view
        const periodTasks = this.tasks.filter(task => {
            if (task.completed) return false; // Exclude completed tasks
            if (!task.dueDate) return true; // Include tasks without due dates
            const taskDueDate = new Date(task.dueDate);
            return taskDueDate >= startDate && taskDueDate <= endDate;
        });
        
        // Events section
        const eventsSection = document.createElement('div');
        eventsSection.className = 'glance-section';
        const eventsHeader = document.createElement('h3');
        eventsHeader.textContent = `📅 Events (${periodEvents.length})`;
        eventsSection.appendChild(eventsHeader);
        
        if (periodEvents.length === 0) {
            const emptyEvents = document.createElement('p');
            emptyEvents.className = 'glance-empty';
            emptyEvents.textContent = 'No events for this period';
            eventsSection.appendChild(emptyEvents);
        } else {
            // Sort events by date
            periodEvents.sort((a, b) => {
                const dateA = this.parseEventDate(a.date);
                const dateB = this.parseEventDate(b.date);
                return dateA - dateB;
            });
            
            periodEvents.forEach(event => {
                const eventItem = document.createElement('div');
                eventItem.className = 'glance-item glance-event';
                
                const eventDate = this.parseEventDate(event.date);
                const dateStr = this.formatDateWithDay(eventDate);
                
                const eventTitle = document.createElement('div');
                eventTitle.className = 'glance-item-title';
                eventTitle.textContent = event.title;
                
                const eventMeta = document.createElement('div');
                eventMeta.className = 'glance-item-meta';
                eventMeta.textContent = dateStr;
                
                if (event.date.includes('T') || event.date.includes(':')) {
                    const timeStr = eventDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
        
        // Tasks section
        const tasksSection = document.createElement('div');
        tasksSection.className = 'glance-section';
        const tasksHeader = document.createElement('h3');
        tasksHeader.textContent = `✅ Tasks (${periodTasks.length})`;
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
                    taskMeta.textContent += `👤 ${task.assignee}`;
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

    openDayEventsModal(date) {
        this.selectedDayDate = date;
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'];
        const dateStr = this.formatDateShort(date);
        document.getElementById('dayEventsModalTitle').textContent = `Events - ${dateStr}`;
        
        const dayEvents = this.events.filter(event => {
            return this.isSameDate(event.date, date);
        });
        
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
                
                const eventTitle = document.createElement('div');
                eventTitle.className = 'event-title';
                eventTitle.textContent = event.title;
                
                eventHeader.appendChild(eventTitle);
                
                const eventDetails = document.createElement('div');
                eventDetails.className = 'event-details';
                
                // Check if event has a time component
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
                document.getElementById('deleteEventBtn').style.display = 'block';
                document.getElementById('eventSendNowSection').style.display = 'block';
                
                // Always populate member list for "Send Now" button
                this.updateSendNowMembersList('event');
                
                // Load reminder settings
                if (event.reminders && event.reminders.enabled) {
                    document.getElementById('eventRemindersEnabled').checked = true;
                    document.getElementById('eventReminderOptions').style.display = 'block';
                    
                    // Check reminder time checkboxes
                    document.querySelectorAll('.reminder-time-checkbox').forEach(cb => {
                        cb.checked = event.reminders.times && event.reminders.times.includes(cb.value);
                    });
                    
                    // Check member checkboxes
                    if (event.reminders.memberIds) {
                        document.querySelectorAll('.reminder-member-checkbox').forEach(cb => {
                            cb.checked = event.reminders.memberIds.includes(cb.value);
                        });
                    }
                } else {
                    document.getElementById('eventRemindersEnabled').checked = false;
                    document.getElementById('eventReminderOptions').style.display = 'none';
                }
            }
        } else {
            this.editingEventId = null;
            document.getElementById('eventModalTitle').textContent = 'Add Event';
            document.getElementById('eventTitleInput').value = '';
            document.getElementById('eventDateInput').value = date ? this.formatDateInput(date) : '';
            document.getElementById('eventHourInput').value = '';
            document.getElementById('eventMinuteInput').value = '';
            document.getElementById('eventAmPmInput').value = '';
            document.getElementById('eventDescriptionInput').value = '';
            document.getElementById('deleteEventBtn').style.display = 'none';
            document.getElementById('eventSendNowSection').style.display = 'none';
            document.getElementById('eventRemindersEnabled').checked = false;
            document.getElementById('eventReminderOptions').style.display = 'none';
            
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
        const hour = document.getElementById('eventHourInput').value;
        const minute = document.getElementById('eventMinuteInput').value;
        const ampm = document.getElementById('eventAmPmInput').value;
        const description = document.getElementById('eventDescriptionInput').value.trim();
        
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
            // Just store the date string (no time component)
            eventDate = date;
        }
        
        // Get reminder settings
        const remindersEnabled = document.getElementById('eventRemindersEnabled').checked;
        const reminderTimes = [];
        if (remindersEnabled) {
            document.querySelectorAll('.reminder-time-checkbox:checked').forEach(cb => {
                reminderTimes.push(cb.value);
            });
        }
        const reminderMemberIds = [];
        if (remindersEnabled) {
            document.querySelectorAll('.reminder-member-checkbox:checked').forEach(cb => {
                reminderMemberIds.push(cb.value);
            });
        }
        
        const reminderSettings = remindersEnabled && reminderTimes.length > 0 && reminderMemberIds.length > 0
            ? {
                enabled: true,
                times: reminderTimes,
                memberIds: reminderMemberIds
            }
            : null;
        
        if (this.editingEventId) {
            // Update existing event
            const eventIndex = this.events.findIndex(e => e.id === this.editingEventId);
            if (eventIndex !== -1) {
                this.events[eventIndex] = {
                    ...this.events[eventIndex],
                    title,
                    date: eventDate,
                    description: description || null,
                    reminders: reminderSettings
                };
                this.scheduleReminders('event', this.editingEventId, this.events[eventIndex]);
            }
        } else {
            // Add new event
            const newEvent = {
                id: Date.now().toString(),
                title,
                date: eventDate,
                description: description || null,
                reminders: reminderSettings,
                createdAt: new Date().toISOString()
            };
            this.events.push(newEvent);
            this.scheduleReminders('event', newEvent.id, newEvent);
        }
        
        this.saveData();
        this.renderCalendar();
        this.closeEventModal();
        this.renderGlance(); // Refresh glance view
        
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
            this.renderCalendar();
            this.renderGlance(); // Refresh glance view
            this.closeEventModal();
            
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
                document.getElementById('taskSendNowSection').style.display = 'block';
                
                // Always populate member list for "Send Now" button
                this.updateSendNowMembersList('task');
                
                // Load reminder settings
                if (task.reminders && task.reminders.enabled) {
                    document.getElementById('taskRemindersEnabled').checked = true;
                    document.getElementById('taskReminderOptions').style.display = 'block';
                    
                    // Check reminder time checkboxes
                    document.querySelectorAll('.task-reminder-time-checkbox').forEach(cb => {
                        cb.checked = task.reminders.times && task.reminders.times.includes(cb.value);
                    });
                    
                    // Check member checkboxes
                    if (task.reminders.memberIds) {
                        document.querySelectorAll('.task-reminder-member-checkbox').forEach(cb => {
                            cb.checked = task.reminders.memberIds.includes(cb.value);
                        });
                    }
                } else {
                    document.getElementById('taskRemindersEnabled').checked = false;
                    document.getElementById('taskReminderOptions').style.display = 'none';
                }
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
            document.getElementById('taskSendNowSection').style.display = 'none';
            document.getElementById('taskRemindersEnabled').checked = false;
            document.getElementById('taskReminderOptions').style.display = 'none';
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
        
        // Get reminder settings
        const remindersEnabled = document.getElementById('taskRemindersEnabled').checked;
        const reminderTimes = [];
        if (remindersEnabled) {
            document.querySelectorAll('.task-reminder-time-checkbox:checked').forEach(cb => {
                reminderTimes.push(cb.value);
            });
        }
        const reminderMemberIds = [];
        if (remindersEnabled) {
            document.querySelectorAll('.task-reminder-member-checkbox:checked').forEach(cb => {
                reminderMemberIds.push(cb.value);
            });
        }
        
        const reminderSettings = remindersEnabled && reminderTimes.length > 0 && reminderMemberIds.length > 0
            ? {
                enabled: true,
                times: reminderTimes,
                memberIds: reminderMemberIds
            }
            : null;
        
        if (this.editingTaskId) {
            // Update existing task
            const taskIndex = this.tasks.findIndex(t => t.id === this.editingTaskId);
            if (taskIndex !== -1) {
                this.tasks[taskIndex] = {
                    ...this.tasks[taskIndex],
                    title,
                    assignee: assignee || null,
                    dueDate: dueDateValue,
                    description: description || null,
                    reminders: reminderSettings
                };
                if (dueDateValue) {
                    this.scheduleReminders('task', this.editingTaskId, this.tasks[taskIndex]);
                }
            }
        } else {
            // Add new task
            const newTask = {
                id: Date.now().toString(),
                title,
                assignee: assignee || null,
                dueDate: dueDateValue,
                description: description || null,
                reminders: reminderSettings,
                completed: false,
                createdAt: new Date().toISOString()
            };
            this.tasks.push(newTask);
            if (dueDateValue) {
                this.scheduleReminders('task', newTask.id, newTask);
            }
        }
        
        this.saveData();
        this.renderTasks();
        this.renderGlance(); // Refresh glance view
        this.closeTaskModal();
    }

    deleteTask() {
        if (this.editingTaskId && confirm('Are you sure you want to delete this task?')) {
            this.tasks = this.tasks.filter(t => t.id !== this.editingTaskId);
            this.saveData();
            this.renderTasks();
            this.renderGlance(); // Refresh glance view
            this.closeTaskModal();
        }
    }

    toggleTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
            this.saveData();
            this.renderTasks();
            this.renderGlance(); // Refresh glance view
        }
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
            memberName.textContent = member.name;
            memberInfo.appendChild(memberName);
            
            if (member.phone && member.carrier) {
                const phoneInfo = document.createElement('div');
                phoneInfo.style.fontSize = '12px';
                phoneInfo.style.color = 'var(--text-secondary)';
                phoneInfo.style.marginTop = '4px';
                const formattedPhone = `(${member.phone.slice(0,3)}) ${member.phone.slice(3,6)}-${member.phone.slice(6)}`;
                phoneInfo.textContent = `📱 ${formattedPhone} • ${member.carrier.charAt(0).toUpperCase() + member.carrier.slice(1)}`;
                memberInfo.appendChild(phoneInfo);
            }
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'member-delete-btn';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Remove ${member.name} from family members?`)) {
                    this.members = this.members.filter(m => m.id !== member.id);
                    this.saveData();
                    this.updateMemberSelects();
                    this.renderMembers();
                }
            });
            
            memberItem.appendChild(memberInfo);
            memberItem.appendChild(deleteBtn);
            membersList.appendChild(memberItem);
        });
    }

    addMember() {
        const nameInput = document.getElementById('memberNameInput');
        const phoneInput = document.getElementById('memberPhoneInput');
        const carrierInput = document.getElementById('memberCarrierInput');
        
        const name = nameInput.value.trim();
        const phone = phoneInput.value.replace(/\D/g, ''); // Remove non-digits
        const carrier = carrierInput.value.trim();
        
        if (!name) {
            alert('Please enter a name');
            return;
        }
        
        if (this.members.some(m => m.name.toLowerCase() === name.toLowerCase())) {
            alert('A member with this name already exists');
            return;
        }
        
        // Validate phone if provided
        if (phone && phone.length !== 10) {
            alert('Please enter a valid 10-digit phone number');
            return;
        }
        
        // Require carrier if phone is provided
        if (phone && !carrier) {
            alert('Please select a carrier when adding a phone number');
            return;
        }
        
        const newMember = {
            id: Date.now().toString(),
            name: name,
            phone: phone || null,
            carrier: carrier || null,
            createdAt: new Date().toISOString()
        };
        
        this.members.push(newMember);
        this.saveData();
        this.updateMemberSelects();
        this.renderMembers();
        nameInput.value = '';
        phoneInput.value = '';
        carrierInput.value = '';
    }

    updateMemberSelects() {
        const assigneeSelect = document.getElementById('taskAssigneeInput');
        assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
        
        this.members.forEach(member => {
            const option = document.createElement('option');
            option.value = member.name;
            option.textContent = member.name;
            assigneeSelect.appendChild(option);
        });
    }

    openFamilyModal() {
        document.getElementById('familyIdDisplay').value = this.familyId;
        document.getElementById('familyModal').style.display = 'block';
    }

    closeFamilyModal() {
        document.getElementById('familyModal').style.display = 'none';
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
                    if (confirm('This will connect to a different family. All local data will sync with the new family. Continue?')) {
                        localStorage.setItem('familyConnectFamilyId', newFamilyId);
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
                statusEl.innerHTML = '🟢 Syncing across devices';
                statusEl.style.color = '#90EE90';
                statusEl.style.fontWeight = '600';
            } else {
                statusEl.innerHTML = '⚪ Local mode (Firebase not configured)';
                statusEl.style.color = 'rgba(255, 255, 255, 0.8)';
                statusEl.style.fontWeight = '500';
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

    // Reminder Management Methods
    updateReminderMembersList(type) {
        const containerId = type === 'event' ? 'eventReminderMembers' : 'taskReminderMembers';
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        
        const membersWithPhones = this.members.filter(m => m.phone && m.carrier);
        
        if (membersWithPhones.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 10px;">No family members with phone numbers. Add phone numbers in Family Members settings.</p>';
            return;
        }
        
        membersWithPhones.forEach(member => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.marginBottom = '8px';
            label.style.fontWeight = 'normal';
            label.style.cursor = 'pointer';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = member.id;
            checkbox.className = type === 'event' ? 'reminder-member-checkbox' : 'task-reminder-member-checkbox';
            checkbox.style.width = 'auto';
            
            const memberText = document.createElement('span');
            memberText.textContent = `${member.name} (${member.phone})`;
            
            label.appendChild(checkbox);
            label.appendChild(memberText);
            container.appendChild(label);
        });
        
        // Also update the "Send Now" section
        this.updateSendNowMembersList(type);
    }

    updateSendNowMembersList(type) {
        const containerId = type === 'event' ? 'eventSendNowMembers' : 'taskSendNowMembers';
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        const membersWithPhones = this.members.filter(m => m.phone && m.carrier);
        
        if (membersWithPhones.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 10px;">No family members with phone numbers. Add phone numbers in Family Members settings.</p>';
            return;
        }
        
        membersWithPhones.forEach(member => {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.marginBottom = '8px';
            label.style.fontWeight = 'normal';
            label.style.cursor = 'pointer';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = member.id;
            checkbox.className = type === 'event' ? 'sendnow-member-checkbox' : 'task-sendnow-member-checkbox';
            checkbox.style.width = 'auto';
            checkbox.checked = false; // Don't auto-check - user must select
            
            const memberText = document.createElement('span');
            memberText.textContent = `${member.name} (${member.phone})`;
            
            label.appendChild(checkbox);
            label.appendChild(memberText);
            container.appendChild(label);
        });
    }

    openSettingsModal() {
        document.getElementById('vercelUrlInput').value = this.vercelUrl;
        document.getElementById('apiKeyInput').value = this.apiKey;
        document.getElementById('settingsModal').style.display = 'block';
    }

    closeSettingsModal() {
        document.getElementById('settingsModal').style.display = 'none';
    }

    saveSettings() {
        const vercelUrl = document.getElementById('vercelUrlInput').value.trim();
        const apiKey = document.getElementById('apiKeyInput').value.trim();
        
        this.vercelUrl = vercelUrl;
        this.apiKey = apiKey;
        
        localStorage.setItem('familyConnectVercelUrl', vercelUrl);
        localStorage.setItem('familyConnectApiKey', apiKey);
        
        alert('Settings saved successfully!');
        this.closeSettingsModal();
    }

    async testConnection() {
        if (!this.vercelUrl) {
            alert('Please enter a Vercel URL first');
            return;
        }
        
        const testBtn = document.getElementById('testConnectionBtn');
        testBtn.textContent = 'Testing...';
        testBtn.disabled = true;
        
        try {
            // Test with a dummy request
            const response = await fetch(this.vercelUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'x-api-key': this.apiKey })
                },
                body: JSON.stringify({
                    phone: '1234567890',
                    carrier: 'verizon',
                    message: 'Test connection from Family Connect'
                })
            });
            
            const responseText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch {
                errorData = { message: responseText };
            }
            
            if (response.ok) {
                alert('✅ Connection successful! Your Vercel function is working.');
            } else {
                console.error('Test connection error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: errorData
                });
                
                let errorMsg = `Connection failed: ${errorData.error || errorData.details || errorData.message || `HTTP ${response.status}`}`;
                
                // Add helpful hints based on error
                if (response.status === 500) {
                    errorMsg += '\n\nCheck Vercel function logs for details:\n1. Go to Vercel Dashboard\n2. Your Project → Functions → View Logs\n3. Look for the error message';
                } else if (response.status === 401) {
                    errorMsg += '\n\nCheck your API key in Settings.';
                } else if (response.status === 400) {
                    errorMsg += '\n\nCheck that all required fields are being sent.';
                }
                
                alert(errorMsg);
            }
        } catch (error) {
            console.error('Test connection network error:', error);
            alert(`Connection failed: ${error.message}\n\nMake sure:\n1. Your Vercel URL is correct\n2. The function is deployed\n3. Your internet connection is working`);
        } finally {
            testBtn.textContent = 'Test Connection';
            testBtn.disabled = false;
        }
    }

    async sendSMS(phone, carrier, message) {
        if (!this.vercelUrl) {
            return { success: false, error: 'Vercel URL not configured. Please set it in Settings.' };
        }
        
        try {
            const response = await fetch(this.vercelUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey && { 'x-api-key': this.apiKey })
                },
                body: JSON.stringify({
                    phone: phone,
                    carrier: carrier,
                    message: message
                })
            });
            
            const responseText = await response.text();
            let responseData;
            try {
                responseData = JSON.parse(responseText);
            } catch {
                responseData = { message: responseText };
            }
            
            if (response.ok) {
                return { success: true, data: responseData };
            } else {
                // Log full error for debugging
                console.error('Vercel function error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseData
                });
                
                return { 
                    success: false, 
                    error: responseData.error || responseData.details || responseData.message || `HTTP ${response.status}: ${response.statusText}`,
                    details: responseData
                };
            }
        } catch (error) {
            console.error('Network error sending SMS:', error);
            return { success: false, error: 'Network error: ' + error.message };
        }
    }

    async sendReminderNow(type, itemId) {
        if (!itemId) {
            alert('Please save the item first before sending reminders');
            return;
        }
        
        const item = type === 'event' 
            ? this.events.find(e => e.id === itemId)
            : this.tasks.find(t => t.id === itemId);
        
        if (!item) {
            alert('Item not found');
            return;
        }
        
        // Get selected members from "Send Now" section
        const checkboxes = type === 'event'
            ? document.querySelectorAll('.sendnow-member-checkbox:checked')
            : document.querySelectorAll('.task-sendnow-member-checkbox:checked');
        
        if (checkboxes.length === 0) {
            alert('Please select at least one family member to notify');
            return;
        }
        
        const memberIds = Array.from(checkboxes).map(cb => cb.value);
        const membersToNotify = this.members.filter(m => memberIds.includes(m.id) && m.phone && m.carrier);
        
        if (membersToNotify.length === 0) {
            alert('Selected members do not have phone numbers configured');
            return;
        }
        
        // Create message - simplified to just title
        let message = item.title;
        
        // Limit message length for SMS (usually 160 chars, but we'll be safe with 140)
        if (message.length > 140) {
            message = message.substring(0, 137) + '...';
        }
        
        // Send to all selected members
        const sendBtn = type === 'event' ? document.getElementById('sendEventReminderBtn') : document.getElementById('sendTaskReminderBtn');
        const originalText = sendBtn.textContent;
        sendBtn.textContent = 'Sending...';
        sendBtn.disabled = true;
        
        let successCount = 0;
        let failCount = 0;
        const errors = [];
        
        for (const member of membersToNotify) {
            console.log(`Sending SMS to ${member.name} (${member.phone}) via ${member.carrier}...`);
            const result = await this.sendSMS(member.phone, member.carrier, message);
            if (result.success) {
                successCount++;
                console.log(`✓ SMS sent successfully to ${member.name}`);
            } else {
                failCount++;
                errors.push(`${member.name}: ${result.error}`);
                console.error(`✗ Failed to send SMS to ${member.name}:`, result.error);
            }
        }
        
        sendBtn.textContent = originalText;
        sendBtn.disabled = false;
        
        if (successCount > 0 && failCount === 0) {
            alert(`✅ Reminders sent successfully to ${successCount} member(s)!`);
        } else if (successCount > 0) {
            alert(`⚠️ Sent to ${successCount} member(s), but ${failCount} failed.\n\nErrors:\n${errors.join('\n')}\n\nCheck your Vercel function configuration and SendGrid settings.`);
        } else {
            alert(`❌ Failed to send reminders to all members.\n\nErrors:\n${errors.join('\n')}\n\nCheck:\n1. Vercel function URL is correct\n2. SendGrid API key is set\n3. SendGrid from email is verified\n4. Phone numbers are correct (10 digits)\n5. Carrier is correct\n\nCheck browser console (F12) for more details.`);
        }
    }

    calculateReminderTimes(eventDate, reminderTimes) {
        const reminders = [];
        const eventDateTime = this.parseEventDate(eventDate);
        
        reminderTimes.forEach(reminderTime => {
            let reminderDateTime = new Date(eventDateTime);
            
            if (reminderTime === '1 day before') {
                reminderDateTime.setDate(reminderDateTime.getDate() - 1);
            } else if (reminderTime === '2 hours before') {
                reminderDateTime.setHours(reminderDateTime.getHours() - 2);
            } else if (reminderTime === '1 hour before') {
                reminderDateTime.setHours(reminderDateTime.getHours() - 1);
            } else if (reminderTime === '30 minutes before') {
                reminderDateTime.setMinutes(reminderDateTime.getMinutes() - 30);
            } else if (reminderTime === '15 minutes before') {
                reminderDateTime.setMinutes(reminderDateTime.getMinutes() - 15);
            }
            
            reminders.push(reminderDateTime);
        });
        
        return reminders.sort((a, b) => a - b); // Sort by time
    }

    scheduleReminders(type, itemId, item) {
        if (!item.reminders || !item.reminders.enabled || !item.reminders.times || item.reminders.times.length === 0) {
            return;
        }
        
        // Remove existing reminders for this item
        this.scheduledReminders = this.scheduledReminders.filter(r => 
            !(r.itemType === type && r.itemId === itemId)
        );
        
        const itemDate = type === 'event' ? item.date : item.dueDate;
        if (!itemDate) return;
        
        const reminderTimes = this.calculateReminderTimes(itemDate, item.reminders.times);
        const memberIds = item.reminders.memberIds || [];
        
        reminderTimes.forEach((reminderTime, index) => {
            const reminder = {
                id: `${type}_${itemId}_${index}_${Date.now()}`,
                itemType: type,
                itemId: itemId,
                scheduledTime: reminderTime.toISOString(),
                sent: false,
                memberIds: memberIds,
                createdAt: new Date().toISOString()
            };
            
            this.scheduledReminders.push(reminder);
        });
        
        this.saveScheduledReminders();
    }

    loadScheduledReminders() {
        const stored = localStorage.getItem('familyConnectScheduledReminders');
        if (stored) {
            try {
                this.scheduledReminders = JSON.parse(stored);
            } catch (e) {
                this.scheduledReminders = [];
            }
        }
    }

    saveScheduledReminders() {
        localStorage.setItem('familyConnectScheduledReminders', JSON.stringify(this.scheduledReminders));
        
        // Also save to Firebase if enabled
        if (this.firebaseEnabled) {
            db.collection('families').doc(this.familyId).set({
                scheduledReminders: this.scheduledReminders
            }, { merge: true }).catch(err => console.error('Error saving reminders:', err));
        }
    }

    startReminderChecker() {
        // Check every minute for due reminders
        this.reminderCheckInterval = setInterval(() => {
            this.checkScheduledReminders();
        }, 60000); // Check every minute
        
        // Also check immediately
        this.checkScheduledReminders();
    }

    async checkScheduledReminders() {
        const now = new Date();
        const dueReminders = this.scheduledReminders.filter(r => {
            if (r.sent) return false;
            const scheduledTime = new Date(r.scheduledTime);
            return scheduledTime <= now;
        });
        
        for (const reminder of dueReminders) {
            await this.sendScheduledReminder(reminder);
        }
    }

    async sendScheduledReminder(reminder) {
        const item = reminder.itemType === 'event'
            ? this.events.find(e => e.id === reminder.itemId)
            : this.tasks.find(t => t.id === reminder.itemId);
        
        if (!item) {
            // Item was deleted, remove reminder
            this.scheduledReminders = this.scheduledReminders.filter(r => r.id !== reminder.id);
            this.saveScheduledReminders();
            return;
        }
        
        const membersToNotify = this.members.filter(m => 
            reminder.memberIds.includes(m.id) && m.phone && m.carrier
        );
        
        if (membersToNotify.length === 0) {
            reminder.sent = true;
            this.saveScheduledReminders();
            return;
        }
        
        // Create message - simplified to just title
        let message = item.title;
        
        // Limit message length for SMS (usually 160 chars, but we'll be safe with 140)
        if (message.length > 140) {
            message = message.substring(0, 137) + '...';
        }
        
        // Send to all members
        let sent = false;
        for (const member of membersToNotify) {
            const result = await this.sendSMS(member.phone, member.carrier, message);
            if (result.success) {
                sent = true;
            }
        }
        
        if (sent) {
            reminder.sent = true;
            this.saveScheduledReminders();
        }
    }

    // Helper function to parse event date (handles both date-only and datetime formats)
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

// Suppress harmless browser extension errors
window.addEventListener('error', (event) => {
    if (event.message && event.message.includes('message channel closed')) {
        event.preventDefault();
        return false;
    }
}, true);

