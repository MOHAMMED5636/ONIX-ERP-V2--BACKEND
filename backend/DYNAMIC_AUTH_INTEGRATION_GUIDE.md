# 🔐 Dynamic Authentication Profile Integration Guide

## Overview

This guide explains how to implement dynamic user profile authentication that switches based on the logged-in user. The system uses JWT tokens stored in localStorage and fetches user profiles dynamically from the backend.

## ✅ Features Implemented

1. ✅ JWT authentication with user id, email, and role in payload
2. ✅ `/auth/me` API endpoint that returns logged-in user profile
3. ✅ Only JWT token stored in localStorage (no hardcoded user data)
4. ✅ Dynamic profile fetching after login and on page reload
5. ✅ Dashboard header displays user name and role dynamically
6. ✅ Support for multiple users (Kaddour, Ramiz, Admin, Engineer, etc.)
7. ✅ Clean architecture with React Context API
8. ✅ Protected routes with role-based access control

---

## 📁 File Structure

```
frontend/
├── src/
│   ├── contexts/
│   │   └── AuthContext.jsx          # Auth state management
│   ├── components/
│   │   ├── Login.jsx                # Updated login component
│   │   ├── DashboardHeader.jsx      # Dynamic user display
│   │   └── ProtectedRoute.jsx       # Route protection
│   ├── services/
│   │   └── api.js                   # Updated API service
│   └── App.jsx                      # App setup with AuthProvider
```

---

## 🚀 Step-by-Step Integration

### Step 1: Copy Files to Frontend

Copy these files from `backend/` to your frontend project:

1. **`FRONTEND_API_SERVICE.js`** → `src/services/api.js`
2. **`FRONTEND_AUTH_CONTEXT.jsx`** → `src/contexts/AuthContext.jsx`
3. **`FRONTEND_LOGIN_COMPONENT_UPDATED.jsx`** → `src/components/Login.jsx`
4. **`FRONTEND_DASHBOARD_HEADER.jsx`** → `src/components/DashboardHeader.jsx`
5. **`FRONTEND_PROTECTED_ROUTE.jsx`** → `src/components/ProtectedRoute.jsx`

### Step 2: Update API Base URL

In `src/services/api.js`, update the `API_BASE_URL`:

```javascript
const API_BASE_URL = 'http://localhost:3001/api'; // Update to your backend URL
```

### Step 3: Wrap App with AuthProvider

Update your `src/App.jsx` or `src/main.jsx`:

```jsx
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './components/Login';
import DashboardHeader from './components/DashboardHeader';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <div className="min-h-screen bg-gray-50">
                  <DashboardHeader />
                  <main>
                    <Dashboard />
                  </main>
                </div>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
```

### Step 4: Use Auth Context in Components

Any component can access user data:

```jsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const { user, loading, isAuthenticated, logout } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Please login</div>;

  return (
    <div>
      <h1>Welcome, {user?.firstName} {user?.lastName}!</h1>
      <p>Role: {user?.role}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

---

## 🔄 How It Works

### Authentication Flow

1. **Login:**
   - User submits credentials
   - Backend validates and returns JWT token
   - Frontend stores **only the token** in localStorage
   - AuthContext automatically fetches user profile via `/auth/me`

2. **Page Reload:**
   - AuthContext checks for token in localStorage
   - If token exists, fetches user profile from `/auth/me`
   - Updates user state dynamically

3. **Profile Display:**
   - DashboardHeader reads user from AuthContext
   - Displays `firstName lastName` or email fallback
   - Shows role dynamically
   - No hardcoded values

4. **Logout:**
   - Calls backend logout endpoint
   - Clears token from localStorage
   - Resets user state
   - Redirects to login

### Data Flow

```
Login → Store Token → Fetch Profile → Display User
  ↓
localStorage: { token: "jwt_token" }
  ↓
AuthContext: { user: { id, email, firstName, lastName, role } }
  ↓
DashboardHeader: Displays user.name and user.role
```

---

## 🧪 Testing Different Users

### Test User Accounts

1. **Kaddour (Admin)**
   - Email: `kaddour@onixgroup.ae`
   - Password: `kadoour123`
   - Role: `ADMIN`

2. **Ramiz (Admin)**
   - Email: `ramiz@onixgroup.ae`
   - Password: `ramiz@123`
   - Role: `ADMIN`

3. **Admin**
   - Email: `admin@onixgroup.ae`
   - Password: `admin123`
   - Role: `ADMIN`

4. **Engineer**
   - Email: `engineer@onixgroup.ae`
   - Password: `engineer@123`
   - Role: `TENDER_ENGINEER`

### Testing Steps

1. Login as Kaddour → Dashboard shows "Kaddour User" and "Administrator"
2. Logout
3. Login as Ramiz → Dashboard shows "Ramiz User" and "Administrator"
4. Refresh page → Profile persists correctly
5. Open new tab → Profile loads from token

---

## 🎯 Key Features

### 1. Dynamic Profile Switching
- No hardcoded user names
- Profile updates automatically when different users log in
- Works on page reload

### 2. Token-Only Storage
- Only JWT token stored in localStorage
- User profile fetched fresh from API
- Prevents stale data issues

### 3. Automatic Profile Fetching
- Fetches profile after login
- Fetches profile on app initialization
- Handles token expiration gracefully

### 4. Role-Based Display
- Shows user's actual role from database
- Supports all roles: ADMIN, TENDER_ENGINEER, PROJECT_MANAGER, CONTRACTOR
- Role names formatted for display

---

## 🔧 API Endpoints

### POST `/api/auth/login`
```json
{
  "email": "kaddour@onixgroup.ae",
  "password": "kadoour123",
  "role": "ADMIN"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_here",
    "user": {
      "id": "uuid",
      "email": "kaddour@onixgroup.ae",
      "firstName": "Kaddour",
      "lastName": "User",
      "role": "ADMIN"
    }
  }
}
```

### GET `/api/auth/me`
**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "kaddour@onixgroup.ae",
    "firstName": "Kaddour",
    "lastName": "User",
    "role": "ADMIN"
  }
}
```

### POST `/api/auth/logout`
**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 🛡️ Security Best Practices

1. **Token Storage:** Only JWT token in localStorage
2. **Token Validation:** Backend validates token on every `/auth/me` request
3. **Automatic Cleanup:** Invalid tokens are cleared automatically
4. **HTTPS:** Use HTTPS in production
5. **Token Expiration:** Tokens expire based on JWT configuration

---

## 🐛 Troubleshooting

### Issue: Profile not updating after login
**Solution:** Ensure AuthContext is wrapping your app and `login()` function is called after successful API response.

### Issue: Profile lost on page reload
**Solution:** Check that token is being stored in localStorage and AuthContext is fetching profile on mount.

### Issue: Wrong user displayed
**Solution:** Clear localStorage and login again. The profile is fetched from backend, so ensure backend is returning correct user.

### Issue: CORS errors
**Solution:** Ensure backend CORS is configured to allow your frontend origin.

---

## 📝 Code Examples

### Using Auth in Custom Component

```jsx
import { useAuth } from '../contexts/AuthContext';

function UserProfile() {
  const { user, loading, refreshUser } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>{user?.firstName} {user?.lastName}</h2>
      <p>{user?.email}</p>
      <p>Role: {user?.role}</p>
      <button onClick={refreshUser}>Refresh Profile</button>
    </div>
  );
}
```

### Role-Based Conditional Rendering

```jsx
import { useAuth } from '../contexts/AuthContext';

function AdminPanel() {
  const { user } = useAuth();

  if (user?.role !== 'ADMIN') {
    return <div>Access Denied</div>;
  }

  return <div>Admin Content</div>;
}
```

---

## ✅ Checklist

- [x] Backend JWT includes id, email, role
- [x] `/auth/me` endpoint returns user profile
- [x] Frontend stores only token in localStorage
- [x] AuthContext fetches profile after login
- [x] AuthContext fetches profile on page reload
- [x] DashboardHeader displays user name dynamically
- [x] DashboardHeader displays role dynamically
- [x] No hardcoded profile names
- [x] Works with multiple users (Kaddour, Ramiz, etc.)
- [x] Protected routes implemented
- [x] Logout clears token and user state

---

## 🎉 Summary

The authentication system now:
- ✅ Dynamically switches profiles based on logged-in user
- ✅ Stores only JWT token (no hardcoded user data)
- ✅ Fetches fresh profile data from backend
- ✅ Displays user name and role in dashboard header
- ✅ Works correctly with multiple users
- ✅ Handles page reloads gracefully
- ✅ Follows enterprise best practices

All components are ready to use. Copy the files to your frontend project and follow the integration steps above.

