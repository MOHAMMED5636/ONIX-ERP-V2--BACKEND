# 📋 Frontend Integration Guide - Dynamic Dashboard Counts

## Overview

This guide shows how to integrate the dynamic dashboard counts that automatically update when projects or tasks are created, updated, or their status changes.

---

## 🎯 Backend Implementation (Already Done ✅)

### Service Layer
- ✅ `backend/src/services/dashboard.service.ts` - Business logic for dashboard stats
- ✅ Calculates counts dynamically from database (no caching)
- ✅ Active Projects = Projects with status `OPEN` or `IN_PROGRESS`
- ✅ Active Tasks = Tasks with status `PENDING` or `IN_PROGRESS`

### Controller
- ✅ `backend/src/controllers/dashboard.controller.ts` - Updated to use service layer
- ✅ Clean error handling
- ✅ Returns default values on error (prevents frontend crashes)

### Routes
- ✅ `GET /api/dashboard/stats` - Detailed dashboard statistics
- ✅ `GET /api/dashboard/summary` - Simplified dashboard summary

---

## 📦 Frontend Files to Copy

### Step 1: Copy Dashboard API Service

**Copy:** `FRONTEND_DASHBOARD_SERVICE.js`  
**To:** `ERP-FRONTEND/src/services/dashboardAPI.js`

**Update API URL if needed:**
```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.151:3001/api';
```

### Step 2: Copy Dashboard Component

**Copy:** `FRONTEND_DASHBOARD_COMPONENT.jsx`  
**To:** `ERP-FRONTEND/src/pages/Dashboard.jsx` (or your dashboard component location)

### Step 3: Copy Custom Hook (Optional but Recommended)

**Copy:** `FRONTEND_DASHBOARD_HOOK.js`  
**To:** `ERP-FRONTEND/src/hooks/useDashboard.js`

**Then use in your Dashboard component:**
```javascript
import useDashboard from '../hooks/useDashboard';

const Dashboard = () => {
  const { stats, loading, error, refresh } = useDashboard();
  
  // Use stats.activeProjects, stats.activeTasks, etc.
};
```

---

## 🔄 Auto-Refresh Implementation

### Option 1: Refresh on Navigation (Recommended)

When navigating back from Projects/Tasks pages, refresh dashboard:

**In Projects/Tasks pages, after create/update:**
```javascript
import { useNavigate } from 'react-router-dom';

const navigate = useNavigate();

// After creating/updating project or task
const handleSave = async () => {
  // ... save logic ...
  
  // Navigate back to dashboard with refresh flag
  navigate('/dashboard', { 
    state: { refreshDashboard: true } 
  });
};
```

**In Dashboard component:**
```javascript
import { useLocation } from 'react-router-dom';

const location = useLocation();

useEffect(() => {
  if (location.state?.refreshDashboard) {
    fetchDashboardStats();
    // Clear the flag
    window.history.replaceState({}, document.title);
  }
}, [location]);
```

### Option 2: Auto-Refresh Interval

Uncomment the auto-refresh code in Dashboard component:
```javascript
useEffect(() => {
  const interval = setInterval(() => {
    fetchDashboardStats();
  }, 30000); // Refresh every 30 seconds

  return () => clearInterval(interval);
}, []);
```

### Option 3: Manual Refresh Button

The Dashboard component includes a "Refresh" button that users can click.

---

## 🎨 Customization

### Update API Base URL

In `dashboardAPI.js`:
```javascript
// For local development
const API_BASE_URL = 'http://localhost:3001/api';

// For network access
const API_BASE_URL = 'http://192.168.1.151:3001/api';

// For production
const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://your-backend.com/api';
```

### Customize Card Styles

The Dashboard component uses Tailwind CSS. Adjust classes as needed:
```jsx
<div className="bg-white rounded-lg shadow-md p-6">
  {/* Your custom styling */}
</div>
```

### Add More Stats

To display additional stats, update the service call:
```javascript
// Fetch detailed stats instead of summary
const response = await getDashboardStats(); // Instead of getDashboardSummary()

// Now you have access to:
// - completedTasks
// - pendingTasks
// - inProgressTasks
```

---

## ✅ Testing Checklist

- [ ] Dashboard loads with correct counts
- [ ] Create a new project → Dashboard updates
- [ ] Update project status → Dashboard updates
- [ ] Create a new task → Dashboard updates
- [ ] Update task status → Dashboard updates
- [ ] Navigate away and back → Dashboard refreshes
- [ ] Manual refresh button works
- [ ] Error handling works (shows default values on error)

---

## 🔍 API Response Format

### GET /api/dashboard/summary
```json
{
  "success": true,
  "data": {
    "activeProjects": 3,
    "activeTasks": 156,
    "teamMembers": 5,
    "inProgressTenders": 2,
    "totalClients": 10,
    "totalTenders": 5,
    "pendingInvitations": 0
  }
}
```

### GET /api/dashboard/stats
```json
{
  "success": true,
  "data": {
    "activeProjects": 3,
    "activeTasks": 156,
    "completedTasks": 89,
    "pendingTasks": 25,
    "inProgressTasks": 42,
    "teamMembers": 5,
    "inProgressTenders": 2,
    "totalClients": 10,
    "totalTenders": 5,
    "pendingInvitations": 0,
    "recentProjects": [...]
  }
}
```

---

## 🐛 Troubleshooting

### Dashboard shows 0 for all counts

**Check:**
1. Backend is running: `http://localhost:3001/health`
2. API endpoint works: `http://localhost:3001/api/dashboard/summary`
3. Token is valid (check localStorage)
4. CORS is configured correctly

### Counts don't update after creating project/task

**Solution:**
1. Make sure you're navigating with refresh flag:
   ```javascript
   navigate('/dashboard', { state: { refreshDashboard: true } });
   ```
2. Or manually refresh the dashboard
3. Check browser console for errors

### CORS errors

**Solution:**
- Backend CORS is already configured
- Make sure frontend URL matches allowed origins
- Check `FRONTEND_URL` in backend `.env`

---

## 📝 Example: Update Project/Task Pages

### In Project Create/Edit Component:

```javascript
import { useNavigate } from 'react-router-dom';

const CreateProject = () => {
  const navigate = useNavigate();

  const handleSubmit = async (projectData) => {
    try {
      await createProject(projectData);
      
      // Navigate back to dashboard with refresh flag
      navigate('/dashboard', { 
        state: { refreshDashboard: true } 
      });
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };
};
```

### In Task Create/Edit Component:

```javascript
import { useNavigate } from 'react-router-dom';

const CreateTask = () => {
  const navigate = useNavigate();

  const handleSubmit = async (taskData) => {
    try {
      await createTask(taskData);
      
      // Navigate back to dashboard with refresh flag
      navigate('/dashboard', { 
        state: { refreshDashboard: true } 
      });
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };
};
```

---

## 🎉 Summary

**Backend:** ✅ Ready - Dynamically calculates counts from database  
**Frontend:** Copy the provided files and integrate  
**Auto-Refresh:** Implement navigation-based refresh for best UX  

**The dashboard will now automatically show correct counts!** 🚀


