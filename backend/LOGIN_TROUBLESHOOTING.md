# Login Troubleshooting Guide

## ✅ Backend Status: WORKING

The backend login API has been tested and is working correctly:
- ✅ Server running on port 3001
- ✅ Health endpoint responding
- ✅ Login endpoint returns token successfully

## 🔍 Frontend Troubleshooting Steps

### 1. Check Browser Console for Errors

Open browser Developer Tools (F12) and check the Console tab for any errors:
- Network errors (CORS, connection refused, etc.)
- JavaScript errors
- API response errors

### 2. Check Network Tab

1. Open Developer Tools (F12)
2. Go to **Network** tab
3. Try logging in
4. Look for the request to `/api/auth/login`
5. Check:
   - **Status code** (should be 200)
   - **Request URL** (should be `http://localhost:3001/api/auth/login`)
   - **Request payload** (should include email, password, role)
   - **Response** (should contain token and user data)

### 3. Verify Frontend API Configuration

Make sure your frontend code is using the correct API URL:

```javascript
// Should be:
const API_BASE_URL = 'http://localhost:3001/api';

// NOT:
const API_BASE_URL = 'http://localhost:3000/api'; // ❌ Wrong!
```

### 4. Verify Login Request Format

Your frontend should send a POST request like this:

```javascript
fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'admin@onixgroup.ae',
    password: 'admin123',
    role: 'ADMIN'  // ⚠️ IMPORTANT: Must match user's role
  })
})
```

### 5. Common Issues & Fixes

#### Issue: CORS Error
**Symptom:** Browser console shows "CORS policy" error
**Fix:** Backend already allows `localhost:3000`, but check:
- Ensure frontend is running on `http://localhost:3000` (not `127.0.0.1:3000`)
- Backend CORS config allows `localhost:3000` ✅

#### Issue: 404 Not Found
**Symptom:** Network tab shows 404 error
**Fix:** 
- Check API URL is `http://localhost:3001/api/auth/login` (not `/api/auth/login`)
- Ensure backend server is running on port 3001

#### Issue: 401 Unauthorized
**Symptom:** Login fails with "Invalid credentials"
**Possible causes:**
- Wrong email/password
- **Role mismatch** - Make sure you're sending `role: 'ADMIN'` (not lowercase)
- User doesn't exist in database (run `npm run db:seed`)

#### Issue: Network Error / Connection Refused
**Symptom:** Cannot connect to backend
**Fix:**
- Ensure backend is running: Check `http://localhost:3001/health`
- Check backend terminal for errors
- Verify port 3001 is not blocked by firewall

### 6. Test Credentials

Use these exact credentials:
- **Email:** `admin@onixgroup.ae`
- **Password:** `admin123`
- **Role:** `ADMIN` (must be uppercase)

### 7. Quick Frontend Test

Test your frontend API service directly in browser console:

```javascript
// Test login API
fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@onixgroup.ae',
    password: 'admin123',
    role: 'ADMIN'
  })
})
.then(res => res.json())
.then(data => {
  console.log('✅ Login Success:', data);
  // Store token
  localStorage.setItem('token', data.data.token);
  localStorage.setItem('user', JSON.stringify(data.data.user));
})
.catch(err => console.error('❌ Login Error:', err));
```

If this works in console but not in your component, the issue is in your component code.

## 🔧 Next Steps

1. **Check browser console** for specific error messages
2. **Check Network tab** to see what request is being sent
3. **Verify API URL** in your frontend code matches `http://localhost:3001/api`
4. **Test the API directly** using the browser console code above

If you see a specific error message, share it and we can fix it!





