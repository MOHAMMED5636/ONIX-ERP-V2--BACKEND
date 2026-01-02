# Login Testing Guide

## 🧪 How to Test Login Functionality

### Prerequisites
1. **Backend Server Running:**
   ```bash
   cd backend
   npm run dev
   ```
   Server should be running on `http://localhost:3001`

2. **Frontend Running:**
   ```bash
   cd ERP-FRONTEND/ONIX-ERP-V2
   npm start
   ```
   Frontend should be running on `http://localhost:3000`

3. **Database Connected:**
   - PostgreSQL should be running
   - Database `onix_erp` should exist

---

## 📋 Test Cases

### Test 1: Regular Admin Login (Existing User)

**Steps:**
1. Open browser: `http://localhost:3000/login`
2. Enter credentials:
   - **Email:** `kaddour@onixgroup.ae`
   - **Password:** `kadoour123`
   - **Role:** Select `ADMIN` (or leave auto-detected)
3. Click "Login"

**Expected Result:**
- ✅ Login successful
- ✅ Redirected to `/dashboard`
- ✅ User profile shows: "Kaddour User" with role "ADMIN"
- ✅ Navbar shows user name and role
- ✅ Sidebar shows user name and role

---

### Test 2: Regular Admin Login (Ramiz)

**Steps:**
1. Open browser: `http://localhost:3000/login`
2. Enter credentials:
   - **Email:** `ramiz@onixgroup.ae`
   - **Password:** `ramiz@123`
   - **Role:** Select `ADMIN` (or leave auto-detected)
3. Click "Login"

**Expected Result:**
- ✅ Login successful
- ✅ Redirected to `/dashboard`
- ✅ User profile shows: "Ramiz User" with role "ADMIN"
- ✅ Navbar shows "Ramiz User" (NOT Kaddour)
- ✅ Sidebar shows "Ramiz User" (NOT Kaddour)

---

### Test 3: Create New Employee & Test First Login

#### Step 3.1: Create Employee (As Admin)

**Steps:**
1. Login as Admin (`kaddour@onixgroup.ae` / `kadoour123`)
2. Navigate to: `http://localhost:3000/employees`
3. Click "Add Employee" button (top right)
4. Fill the form:
   - **First Name:** `John`
   - **Last Name:** `Doe`
   - **Role:** `Employee`
   - **Department:** `Engineering`
   - **Position:** `Software Engineer`
   - **Phone:** `+971-50-123-4567` (optional)
   - **Employee ID:** `EMP-001` (optional)
5. Click "Create Employee"

**Expected Result:**
- ✅ Employee created successfully
- ✅ Modal appears with credentials:
   - **Email:** `john.doe@onixgroup.ae` (auto-generated)
   - **Temporary Password:** Random 12-character password (e.g., `aB3$kL9mN2pQ`)
- ✅ Copy buttons work
- ✅ Save credentials (you'll need them for next step)

#### Step 3.2: First Login (New Employee - Password Change Required)

**Steps:**
1. **Logout** from admin account
2. Go to: `http://localhost:3000/login`
3. Enter credentials from Step 3.1:
   - **Email:** `john.doe@onixgroup.ae`
   - **Password:** (temporary password from modal)
   - **Role:** `Employee` (or auto-detected)
4. Click "Login"

**Expected Result:**
- ✅ Login successful BUT...
- ✅ **Redirected to `/change-password`** (NOT dashboard)
- ✅ Password change form appears
- ✅ Message: "You must change your password before accessing the system"

#### Step 3.3: Change Password

**Steps:**
1. On password change page, enter:
   - **Current Password:** (temporary password)
   - **New Password:** `NewSecurePass123!` (min 8 chars)
   - **Confirm Password:** `NewSecurePass123!`
2. Watch password strength indicator (should show "strong")
3. Click "Change Password"

**Expected Result:**
- ✅ Password changed successfully
- ✅ Alert: "Password changed successfully! Redirecting to dashboard..."
- ✅ **Redirected to `/dashboard`**
- ✅ Can now access the system normally
- ✅ User profile shows: "John Doe" with role "EMPLOYEE"

---

### Test 4: Login After Password Change

**Steps:**
1. Logout
2. Login again with:
   - **Email:** `john.doe@onixgroup.ae`
   - **Password:** `NewSecurePass123!` (new password)
   - **Role:** `Employee`
3. Click "Login"

**Expected Result:**
- ✅ Login successful
- ✅ **Directly redirected to `/dashboard`** (NO password change page)
- ✅ Normal access to system

---

### Test 5: Invalid Credentials

**Steps:**
1. Go to: `http://localhost:3000/login`
2. Enter wrong credentials:
   - **Email:** `wrong@email.com`
   - **Password:** `wrongpassword`
3. Click "Login"

**Expected Result:**
- ✅ Error message: "Invalid credentials" or "Login failed"
- ✅ Stay on login page
- ✅ No redirect

---

### Test 6: Missing Fields

**Steps:**
1. Go to: `http://localhost:3000/login`
2. Leave email or password empty
3. Click "Login"

**Expected Result:**
- ✅ Validation error messages appear
- ✅ Cannot submit form
- ✅ Stay on login page

---

## 🔍 What to Check

### ✅ Login Success Indicators:
1. **Token Stored:** Check browser DevTools → Application → Local Storage → `token` exists
2. **User Profile:** Navbar shows correct user name and role
3. **Sidebar:** Shows correct user name and role
4. **Dashboard:** Loads successfully
5. **No Errors:** Console shows no authentication errors

### ✅ Password Change Flow Indicators:
1. **First Login:** Redirects to `/change-password`
2. **Password Change:** Form validates password strength
3. **After Change:** Redirects to dashboard
4. **Subsequent Logins:** Go directly to dashboard

### ✅ Role-Based Access:
1. **Admin/HR:** Can see "Add Employee" button
2. **Employee:** Cannot see "Add Employee" button
3. **Routes:** Protected routes work correctly

---

## 🐛 Troubleshooting

### Issue: Login redirects back to login page
**Solution:**
- Check if backend is running on port 3001
- Check browser console for errors
- Verify token is being stored in localStorage
- Check network tab for API response

### Issue: Wrong user profile showing
**Solution:**
- Clear localStorage: `localStorage.clear()`
- Logout and login again
- Check if AuthContext is fetching correct user

### Issue: Password change page not appearing
**Solution:**
- Check if `forcePasswordChange` flag is set in database
- Verify login response includes `requiresPasswordChange: true`
- Check browser console for errors

### Issue: Cannot create employee
**Solution:**
- Verify you're logged in as ADMIN or HR
- Check backend logs for errors
- Verify database migration ran successfully
- Check if employee email already exists

---

## 📊 Test Checklist

- [ ] Admin login works (Kaddour)
- [ ] Admin login works (Ramiz)
- [ ] User profile shows correct name
- [ ] User profile shows correct role
- [ ] Can create new employee
- [ ] Credentials modal appears
- [ ] Can copy credentials
- [ ] New employee first login redirects to password change
- [ ] Password change form works
- [ ] Password strength indicator works
- [ ] After password change, redirects to dashboard
- [ ] Subsequent login goes directly to dashboard
- [ ] Invalid credentials show error
- [ ] Role-based access works (Admin can create, Employee cannot)

---

## 🎯 Quick Test Commands

### Check Backend API:
```bash
# Test login endpoint
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"kaddour@onixgroup.ae","password":"kadoour123","role":"ADMIN"}'

# Test get current user
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Check Database:
```bash
cd backend
npx prisma studio
# Opens Prisma Studio at http://localhost:5555
# Check users table for created employees
```

---

## 📝 Test Credentials Summary

| Email | Password | Role | Status |
|-------|----------|------|--------|
| `kaddour@onixgroup.ae` | `kadoour123` | ADMIN | ✅ Active |
| `ramiz@onixgroup.ae` | `ramiz@123` | ADMIN | ✅ Active |
| `john.doe@onixgroup.ae` | (temporary) | EMPLOYEE | ⚠️ Requires password change |

---

**Happy Testing! 🚀**


