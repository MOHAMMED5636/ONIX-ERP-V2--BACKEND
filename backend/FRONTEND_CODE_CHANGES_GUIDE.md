# 🔧 Frontend Code Changes - Step by Step Guide

## 📋 Overview

This guide shows **exactly** what code you need to change in your existing frontend to implement dynamic authentication profiles.

---

## 🎯 Files You Need to Create/Update

### 1. **Create Auth Context** (NEW FILE)
**Location:** `src/contexts/AuthContext.jsx` or `src/context/AuthContext.jsx`

**Action:** Copy the entire file from `backend/FRONTEND_AUTH_CONTEXT.jsx`

---

### 2. **Update API Service** (UPDATE EXISTING FILE)
**Location:** `src/services/api.js` or `src/utils/api.js` or wherever your API calls are

**Find this code:**
```javascript
// OLD CODE - REMOVE THIS
if (data.success && data.data) {
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('user', JSON.stringify(data.data.user)); // ❌ REMOVE THIS LINE
}
```

**Replace with:**
```javascript
// NEW CODE - ONLY STORE TOKEN
if (data.success && data.data && data.data.token) {
  localStorage.setItem('token', data.data.token);
  localStorage.removeItem('user'); // ✅ Remove user data
}
```

**Also update `getCurrentUser()` function** - Make sure it doesn't store user in localStorage, just returns it.

---

### 3. **Update Login Component** (UPDATE EXISTING FILE)
**Location:** `src/components/Login.jsx` or `src/pages/Login.jsx` or wherever your login is

**Find your login handler:**
```javascript
// OLD CODE - REMOVE THIS
const handleLogin = async () => {
  const response = await login(email, password, role);
  localStorage.setItem('token', response.data.token);
  localStorage.setItem('user', JSON.stringify(response.data.user)); // ❌ REMOVE
  navigate('/dashboard');
};
```

**Replace with:**
```javascript
// NEW CODE - USE AUTH CONTEXT
import { useAuth } from '../contexts/AuthContext'; // ✅ ADD THIS IMPORT

function LoginPage() {
  const { login: setAuthUser } = useAuth(); // ✅ ADD THIS
  
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await login(email, password, role);
      if (response.success && response.data.token) {
        await setAuthUser(response.data.token); // ✅ USE THIS INSTEAD
        navigate('/dashboard');
      }
    } catch (error) {
      setError(error.message);
    }
  };
}
```

---

### 4. **Update Dashboard Header** (UPDATE EXISTING FILE)
**Location:** `src/components/Header.jsx` or `src/components/DashboardHeader.jsx` or wherever you show user name

**Find hardcoded user name:**
```javascript
// OLD CODE - REMOVE HARDCODED VALUES
<div>Welcome, Kaddour</div> // ❌ REMOVE HARDCODED NAME
<div>Administrator</div> // ❌ REMOVE HARDCODED ROLE
```

**Replace with:**
```javascript
// NEW CODE - USE AUTH CONTEXT
import { useAuth } from '../contexts/AuthContext'; // ✅ ADD THIS

function DashboardHeader() {
  const { user, logout } = useAuth(); // ✅ ADD THIS
  
  if (!user) return <div>Loading...</div>;
  
  return (
    <div>
      {/* ✅ DYNAMIC USER NAME */}
      <div>Welcome, {user.firstName} {user.lastName}</div>
      {/* ✅ DYNAMIC ROLE */}
      <div>{user.role === 'ADMIN' ? 'Administrator' : user.role}</div>
    </div>
  );
}
```

**OR** use the complete header component from `backend/FRONTEND_DASHBOARD_HEADER.jsx`

---

### 5. **Update App.jsx** (UPDATE EXISTING FILE)
**Location:** `src/App.jsx` or `src/main.jsx`

**Find your App component:**
```javascript
// OLD CODE
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}
```

**Replace with:**
```javascript
// NEW CODE - WRAP WITH AUTH PROVIDER
import { AuthProvider } from './contexts/AuthContext'; // ✅ ADD THIS

function App() {
  return (
    <AuthProvider> {/* ✅ WRAP EVERYTHING */}
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
```

---

### 6. **Create Protected Route** (NEW FILE - OPTIONAL)
**Location:** `src/components/ProtectedRoute.jsx`

**Action:** Copy from `backend/FRONTEND_PROTECTED_ROUTE.jsx`

**Then use it:**
```javascript
import { ProtectedRoute } from './components/ProtectedRoute';

<Route 
  path="/dashboard" 
  element={
    <ProtectedRoute>
      <Dashboard />
    </ProtectedRoute>
  } 
/>
```

---

## 🔍 Specific Code Changes Checklist

### ✅ Change 1: Remove User Storage from Login
**File:** Your API service file
- [ ] Remove `localStorage.setItem('user', ...)`
- [ ] Keep only `localStorage.setItem('token', ...)`

### ✅ Change 2: Add AuthContext Import
**File:** Your Login component
- [ ] Add `import { useAuth } from '../contexts/AuthContext'`
- [ ] Use `const { login } = useAuth()` instead of direct localStorage

### ✅ Change 3: Update Header to Use Context
**File:** Your Header/DashboardHeader component
- [ ] Add `import { useAuth } from '../contexts/AuthContext'`
- [ ] Replace hardcoded name with `{user?.firstName} {user?.lastName}`
- [ ] Replace hardcoded role with `{user?.role}`

### ✅ Change 4: Wrap App with AuthProvider
**File:** Your App.jsx
- [ ] Add `import { AuthProvider } from './contexts/AuthContext'`
- [ ] Wrap `<Router>` with `<AuthProvider>`

### ✅ Change 5: Create AuthContext File
**File:** `src/contexts/AuthContext.jsx` (NEW)
- [ ] Copy entire file from `backend/FRONTEND_AUTH_CONTEXT.jsx`

---

## 📝 Quick Reference: What Each File Does

| File | Purpose | Action |
|------|---------|--------|
| `AuthContext.jsx` | Manages user state globally | **CREATE NEW** |
| `api.js` | API service functions | **UPDATE** - Remove user storage |
| `Login.jsx` | Login form component | **UPDATE** - Use AuthContext |
| `Header.jsx` | Dashboard header | **UPDATE** - Display dynamic user |
| `App.jsx` | Main app component | **UPDATE** - Wrap with AuthProvider |
| `ProtectedRoute.jsx` | Route protection | **CREATE NEW** (optional) |

---

## 🚀 Step-by-Step Implementation

### Step 1: Create AuthContext
1. Create folder: `src/contexts/` (if it doesn't exist)
2. Copy `backend/FRONTEND_AUTH_CONTEXT.jsx` → `src/contexts/AuthContext.jsx`

### Step 2: Update API Service
1. Open your API service file
2. Find the `login()` function
3. Remove the line that stores user: `localStorage.setItem('user', ...)`
4. Keep only token storage

### Step 3: Update Login Component
1. Open your Login component
2. Add import: `import { useAuth } from '../contexts/AuthContext'`
3. Add: `const { login: setAuthUser } = useAuth()`
4. Replace localStorage user storage with: `await setAuthUser(response.data.token)`

### Step 4: Update Header Component
1. Open your Header/DashboardHeader component
2. Add import: `import { useAuth } from '../contexts/AuthContext'`
3. Add: `const { user } = useAuth()`
4. Replace hardcoded name/role with `{user?.firstName}`, `{user?.role}`, etc.

### Step 5: Update App.jsx
1. Open `src/App.jsx`
2. Add import: `import { AuthProvider } from './contexts/AuthContext'`
3. Wrap your Router with `<AuthProvider>...</AuthProvider>`

### Step 6: Test
1. Login as Kaddour → Should see "Kaddour User"
2. Logout
3. Login as Ramiz → Should see "Ramiz User"
4. Refresh page → Profile should persist

---

## 🐛 Common Issues & Fixes

### Issue: "useAuth must be used within AuthProvider"
**Fix:** Make sure you wrapped your App with `<AuthProvider>`

### Issue: User name not showing
**Fix:** Check that `user` is not null: `{user && <div>{user.firstName}</div>}`

### Issue: Profile not updating after login
**Fix:** Make sure you're calling `setAuthUser(token)` after login, not just storing token

### Issue: CORS errors
**Fix:** Check backend CORS settings allow your frontend URL

---

## 📦 File Structure After Changes

```
your-frontend/
├── src/
│   ├── contexts/
│   │   └── AuthContext.jsx          ← NEW FILE
│   ├── components/
│   │   ├── Login.jsx                 ← UPDATED
│   │   ├── Header.jsx               ← UPDATED
│   │   └── ProtectedRoute.jsx       ← NEW (optional)
│   ├── services/
│   │   └── api.js                   ← UPDATED
│   └── App.jsx                      ← UPDATED
```

---

## ✅ Final Checklist

Before testing, make sure:
- [ ] AuthContext.jsx is created in `src/contexts/`
- [ ] API service only stores token (not user)
- [ ] Login component uses `useAuth()` hook
- [ ] Header component uses `useAuth()` hook
- [ ] App.jsx is wrapped with `<AuthProvider>`
- [ ] All imports are correct
- [ ] Backend is running on port 3001

---

## 🎯 Summary

**Main Changes:**
1. ✅ Create `AuthContext.jsx` - NEW FILE
2. ✅ Update API service - Remove user storage
3. ✅ Update Login - Use AuthContext
4. ✅ Update Header - Display dynamic user
5. ✅ Update App - Wrap with AuthProvider

**Result:**
- Profile switches automatically based on logged-in user
- No hardcoded names
- Works with Kaddour, Ramiz, Admin, Engineer, etc.

---

**Need help?** Check `DYNAMIC_AUTH_INTEGRATION_GUIDE.md` for detailed examples.

