# Family Connect

A mobile web app for family calendar and shared to-do list management. Keep your family organized with synchronized events and tasks across all devices.

## Features

### 📅 Calendar
- View monthly calendar with all family events
- Add, edit, and delete events
- Event indicators on calendar days
- Set event times and descriptions
- Click any day to view or add events

### ✅ Shared To-Do List
- Create and assign tasks to family members
- Set due dates for tasks
- Mark tasks as complete
- View task descriptions and details
- Filter by assignee and due date

### 👁️ At a Glance
- Day/Week/Month views
- See all events and tasks in one view
- Quick overview of upcoming activities

### 📱 SMS Reminders
- **Email-to-SMS reminders** via Vercel serverless functions
- Set reminders for events and tasks
- Multiple reminder times (15 min, 1 hour, 1 day before, etc.)
- Send reminders to selected family members
- Manual "Send Now" button for immediate reminders
- Automatic scheduled reminders
- See [REMINDER_SETUP.md](REMINDER_SETUP.md) for setup instructions

### 👥 Family Members
- Add family members to assign tasks
- Add phone numbers and carriers for SMS reminders
- Manage family member list
- Sync across all devices

### 🔗 Cloud Sync
- Real-time synchronization via Firebase
- Share family ID to sync across devices
- Works offline with local storage fallback

## Getting Started

### Running the App

**Option 1: Direct File Access (No Server Required)**
- Simply double-click `index.html` or use `open-app.bat`
- The app will work in local-only mode using localStorage
- Firebase sync will be disabled (Firebase requires HTTPS/localhost)
- All data is stored locally on your device

**Option 2: Local Server (For Firebase Sync)**
- Double-click `run-local-server.bat` to start a local server
- Open `http://localhost:8000` in your browser
- This enables Firebase cloud sync across devices

### Firebase Setup

The app uses the same Firebase project as TV Time Manager. No additional configuration needed!

**Note:** Firebase sync only works when accessed via HTTPS or localhost (using the local server). When opening `index.html` directly (`file://` protocol), the app runs in local-only mode using localStorage.

### Using the App

1. **First Time Setup:**
   - The app will automatically generate a Family ID
   - Click the 🔗 button (bottom right) to access your Family ID
   - Share this ID with other family members to sync data

2. **Adding Family Members:**
   - Click the 🔗 button
   - Click "Manage Family Members"
   - Add family member names

3. **Adding Events:**
   - Switch to the Calendar tab
   - Click "Add Event" or click on any day
   - Fill in event details and save

4. **Adding Tasks:**
   - Switch to the Tasks tab
   - Click "Add Task"
   - Fill in task details, assign to a family member (optional), and set due date
   - Click "Save Task"

5. **Completing Tasks:**
   - Click the checkbox next to any task to mark it complete
   - Click on a task to edit or delete it

6. **Setting Up SMS Reminders:**
   - See [REMINDER_SETUP.md](REMINDER_SETUP.md) for detailed instructions
   - Create SendGrid account (free)
   - Deploy Vercel serverless function
   - Add phone numbers to family members
   - Enable reminders on events/tasks

## Technical Details

- **Firebase Firestore**: Real-time data synchronization
- **Service Worker**: Offline capabilities for PWA
- **Mobile-First Design**: Optimized for touch devices
- **No Server Required**: Runs entirely client-side (except Firebase)

## Firebase Setup

The app uses the same Firebase project as TV Time Manager. All data is stored in the `families` collection, completely separate from TV Time data.

### Data Structure

- **Events**: Stored in `families/{familyId}/events` array
- **Tasks**: Stored in `families/{familyId}/tasks` array
- **Members**: Stored in `families/{familyId}/members` array

## Troubleshooting

**Firebase not connecting?**
- This is normal when opening `index.html` directly - Firebase requires HTTPS or localhost
- To enable Firebase sync, use `run-local-server.bat` and access via `http://localhost:8000`
- The app works perfectly fine without Firebase using local storage
- Check browser console for errors if needed

**Can't sync data?**
- Ensure you have an internet connection
- Check that Firestore is enabled in your Firebase project
- Verify Firestore rules allow read/write access

**Family members not showing in task assignment?**
- Make sure you've added family members via the Family Sync settings
- Click the 🔗 button → "Manage Family Members"

## Deployment (Optional)

The app works perfectly without deployment - just open `index.html` directly!

If you want cloud sync across devices, you can deploy to GitHub Pages:

1. Create a new repository on GitHub
2. Push all files to the repository
3. Enable GitHub Pages in repository settings
4. Access the app at `https://yourusername.github.io/repository-name/`
5. This enables Firebase sync since it's now served over HTTPS

## Notes

- **No server required!** You can open `index.html` directly
- Local storage works immediately without any server
- Firebase sync requires HTTPS or localhost (use `run-local-server.bat` if you want cloud sync)
- Service worker enables offline functionality (works best with HTTPS)
- All data syncs in real-time when Firebase is available, otherwise uses local storage

---

Enjoy staying organized with your family! 👨‍👩‍👧‍👦

