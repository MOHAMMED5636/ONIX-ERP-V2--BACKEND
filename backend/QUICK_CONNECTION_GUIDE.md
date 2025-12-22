# 🚀 QUICK CONNECTION GUIDE - Frontend ↔ Backend

## ✅ STEP 1: Start Backend (Left Side)

Open terminal in **backend** folder:

```bash
cd backend
npm install          # If not done already
npm run dev          # Start backend server
```

**✅ Backend should be running on:** `http://localhost:3001`

---

## ✅ STEP 2: Copy Files to Frontend (Right Side)

### 2.1 Copy API Service File

**Copy:** `FRONTEND_API_SERVICE.js` 
**To:** Your frontend project → `src/services/api.js` (or `src/utils/api.js`)

### 2.2 Copy Login Component (Optional)

**Copy:** `FRONTEND_LOGIN_COMPONENT.jsx`
**To:** Your frontend project → `src/components/Login.jsx` (or `src/pages/Login.jsx`)

---

## ✅ STEP 3: Use in Your Frontend

### Option A: Simple Login Function

```javascript
import { login } from './services/api';

// In your component
const handleLogin = async () => {
  try {
    const response = await login('admin@onixgroup.ae', 'admin123', 'ADMIN');
    console.log('Login successful!', response);
    // Token is automatically saved to localStorage
    // Redirect to dashboard
  } catch (error) {
    console.error('Login failed:', error.message);
  }
};
```

### Option B: Use Login Component

```javascript
import LoginPage from './components/Login';

// In your App.js or router
<Route path="/login" element={<LoginPage />} />
```

---

## ✅ STEP 4: Test Connection

### Test 1: Check Backend is Running
Open browser: `http://localhost:3001/health`
Should see: `{"status":"ok","timestamp":"..."}`

### Test 2: Test Login from Frontend
1. Open your frontend app
2. Go to login page
3. Enter credentials:
   - Email: `admin@onixgroup.ae`
   - Password: `admin123`
   - Role: `ADMIN`
4. Click Login

### Test 3: Check Browser Console
- Open Developer Tools (F12)
- Go to Network tab
- Should see successful POST to `/api/auth/login`
- Check Application tab → LocalStorage → Should see `token` and `user`

---

## 🔧 Common Issues & Fixes

### ❌ CORS Error
**Error:** `Access to fetch... blocked by CORS policy`

**Fix:** 
- Make sure backend is running
- Check backend `.env` has: `FRONTEND_URL=http://localhost:3000` (or your frontend port)
- Backend CORS is already configured to allow common ports

### ❌ Connection Refused
**Error:** `Failed to fetch` or `Network request failed`

**Fix:**
- Make sure backend is running: `npm run dev` in backend folder
- Check backend URL in frontend code matches: `http://localhost:3001`
- Try accessing `http://localhost:3001/health` directly

### ❌ 401 Unauthorized
**Error:** `Invalid credentials`

**Fix:**
- Check email/password are correct
- Make sure role matches (ADMIN, TENDER_ENGINEER, etc.)
- Verify user exists in database (run `npm run db:seed` in backend)

---

## 📋 Quick Reference

### Backend Endpoints:
- **Login:** `POST http://localhost:3001/api/auth/login`
- **Get User:** `GET http://localhost:3001/api/auth/me` (requires token)

### Test Credentials:
- **Admin:** `admin@onixgroup.ae` / `admin123` / `ADMIN`
- **Engineer:** `engineer@onixgroup.ae` / `engineer@123` / `TENDER_ENGINEER`

### API Functions Available:
```javascript
import { 
  login,              // Login user
  getCurrentUser,     // Get current user
  logout,             // Logout user
  isAuthenticated,    // Check if logged in
  getToken,           // Get stored token
  getStoredUser,      // Get stored user data
  apiRequest          // Make authenticated requests
} from './services/api';
```

---

## 🎯 Next Steps After Connection

1. ✅ Authentication working
2. ⏭️ Create protected routes
3. ⏭️ Add token to all API requests
4. ⏭️ Implement logout functionality
5. ⏭️ Add user context/state management

---

## 💡 Example: Using API in Any Component

```javascript
import { apiRequest, getToken, getStoredUser } from '../services/api';

function MyComponent() {
  // Get current user
  const user = getStoredUser();
  
  // Make authenticated API call
  const fetchData = async () => {
    try {
      const response = await apiRequest('/tenders/assign', {
        method: 'POST',
        body: JSON.stringify({ tenderId: '123', engineerId: '456' })
      });
      console.log('Success:', response);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <p>Welcome, {user?.firstName}!</p>
      <button onClick={fetchData}>Fetch Data</button>
    </div>
  );
}
```

---

**✅ You're all set! Your frontend and backend are now connected!**




