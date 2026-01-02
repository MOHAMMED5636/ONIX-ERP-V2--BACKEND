# 🧪 Testing Guide - Photo & Job Title Functionality

## 📋 Prerequisites Checklist

Before testing, ensure:

- [ ] PostgreSQL database is running
- [ ] Database migration has been run
- [ ] Backend server is running
- [ ] Frontend server is running
- [ ] You have admin credentials ready

---

## 🚀 Step 1: Setup & Migration

### **1.1 Run Database Migration**

```bash
cd backend
npx prisma migrate dev --name add_photo_jobtitle
npx prisma generate
```

**Expected Output:**
```
✅ Migration created
✅ Prisma Client generated
```

### **1.2 Verify Migration**

Check if the migration was successful:

```bash
# Check database schema
npx prisma studio
```

Or verify in pgAdmin:
- Open `users` table
- Check for `photo` and `jobTitle` columns

---

## 🖥️ Step 2: Start Backend Server

### **2.1 Start Backend**

```bash
cd backend
npm run dev
```

**Expected Output:**
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🏥 Health check: http://localhost:3001/health
```

### **2.2 Verify Backend is Running**

Open browser or use curl:
```bash
curl http://localhost:3001/health
```

**Expected Response:**
```json
{"status":"ok","timestamp":"2025-12-30T..."}
```

---

## 🌐 Step 3: Start Frontend Server

### **3.1 Start Frontend**

```bash
cd ../ERP-FRONTEND/ONIX-ERP-V2
npm start
```

**Expected Output:**
```
Compiled successfully!
Local: http://localhost:3000
```

### **3.2 Verify Frontend is Running**

Open browser: `http://localhost:3000`

---

## 🔐 Step 4: Login Test

### **4.1 Login as Admin**

1. Go to: `http://localhost:3000/login`
2. Enter credentials:
   - **Email:** `admin@onixgroup.ae`
   - **Password:** `admin123`
   - **Role:** `ADMIN`
3. Click **Login**

**Expected Result:**
- ✅ Redirects to dashboard
- ✅ No errors in console
- ✅ User data loads correctly

### **4.2 Verify User Data**

Open browser console (F12) → Application → LocalStorage:
- ✅ `token` should be present
- ✅ Check Network tab → `/api/auth/me` request
- ✅ Response should include user data

---

## 📸 Step 5: Test Profile Photo Upload

### **5.1 Create Profile Settings Page (If Not Exists)**

Create a new page or add to existing settings:

**File:** `src/pages/Settings.js` or `src/pages/Profile.js`

```jsx
import ProfileForm from '../components/ProfileForm';

function SettingsPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>
      <ProfileForm />
    </div>
  );
}

export default SettingsPage;
```

Add route in `App.js`:
```jsx
<Route path="/settings" element={<SettingsPage />} />
```

### **5.2 Test Photo Upload**

1. Navigate to: `http://localhost:3000/settings`
2. **Upload Photo:**
   - Click "Choose profile photo"
   - Select an image file (JPEG, PNG, GIF, or WebP)
   - Max size: 5MB
   - Preview should appear
3. **Enter Job Title:**
   - Type: `Senior Engineer` (or any job title)
4. Click **"Update Profile"**

**Expected Results:**
- ✅ Success message appears
- ✅ Photo displays in preview
- ✅ No errors in console
- ✅ Check Network tab → `PUT /api/auth/profile` request
- ✅ Response includes updated user data with photo URL

### **5.3 Verify Photo Display**

1. **Check Navbar:**
   - Click on user profile/avatar
   - Photo should display in profile modal
   - Job title should show below name

2. **Check Sidebar:**
   - Photo should display in sidebar avatar
   - Job title should be visible

**Expected Results:**
- ✅ Photo displays correctly
- ✅ Job title displays correctly
- ✅ Fallback to avatar if photo fails to load

---

## 👥 Step 6: Test Employee Creation with Photo

### **6.1 Navigate to Employee Creation**

1. Go to: `http://localhost:3000/employees`
2. Click **"Add Employee"** or **"Create Employee"**
3. Navigate to: `http://localhost:3000/employees/create`

### **6.2 Fill Employee Form**

Fill in the form:
- **First Name:** `John`
- **Last Name:** `Doe`
- **Role:** `EMPLOYEE`
- **Phone:** `+971-50-123-4567`
- **Department:** `Engineering`
- **Position:** `Engineer`
- **Job Title:** `Senior Software Engineer` ⭐ NEW FIELD
- **Employee ID:** `EMP-001` (optional)
- **Profile Photo:** Upload a photo ⭐ NEW FEATURE
- **Assign to Projects:** Select projects (optional)

### **6.3 Submit Form**

Click **"Create Employee"**

**Expected Results:**
- ✅ Form submits successfully
- ✅ Credentials modal appears
- ✅ Shows:
  - Email: `john.doe@onixgroup.ae`
  - Temporary Password: `[random password]`
- ✅ No errors in console
- ✅ Check Network tab → `POST /api/employees` request
- ✅ Request includes FormData with photo

### **6.4 Verify Employee Created**

1. Check employee list
2. New employee should appear
3. Verify:
   - ✅ Photo displays (if uploaded)
   - ✅ Job title displays
   - ✅ All other fields correct

---

## 🔍 Step 7: Test API Endpoints Directly

### **7.1 Test Profile Update API**

**Using Postman or curl:**

```bash
# Get your token first (from localStorage or login response)
TOKEN="your-token-here"

# Update profile with photo
curl -X PUT http://localhost:3001/api/auth/profile \
  -H "Authorization: Bearer $TOKEN" \
  -F "jobTitle=Senior Engineer" \
  -F "photo=@/path/to/your/photo.jpg"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "id": "...",
    "email": "admin@onixgroup.ae",
    "firstName": "Admin",
    "lastName": "User",
    "jobTitle": "Senior Engineer",
    "photo": "http://localhost:3001/uploads/photos/photo-1234567890.jpg",
    ...
  }
}
```

### **7.2 Test Get Current User API**

```bash
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "email": "admin@onixgroup.ae",
    "firstName": "Admin",
    "lastName": "User",
    "jobTitle": "Senior Engineer",
    "photo": "http://localhost:3001/uploads/photos/photo-1234567890.jpg",
    ...
  }
}
```

### **7.3 Test Create Employee API**

```bash
curl -X POST http://localhost:3001/api/employees \
  -H "Authorization: Bearer $TOKEN" \
  -F "firstName=Jane" \
  -F "lastName=Smith" \
  -F "role=EMPLOYEE" \
  -F "jobTitle=Project Manager" \
  -F "photo=@/path/to/photo.jpg"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Employee created successfully",
  "data": {
    "employee": {
      "id": "...",
      "email": "jane.smith@onixgroup.ae",
      "firstName": "Jane",
      "lastName": "Smith",
      "jobTitle": "Project Manager",
      "photo": "photo-1234567890.jpg",
      ...
    },
    "credentials": {
      "email": "jane.smith@onixgroup.ae",
      "temporaryPassword": "[random password]",
      "message": "Please save these credentials..."
    }
  }
}
```

---

## ✅ Step 8: Verification Checklist

### **Backend Verification:**

- [ ] Database has `photo` and `jobTitle` columns
- [ ] Backend server starts without errors
- [ ] `/api/auth/profile` endpoint works
- [ ] `/api/auth/me` returns photo and jobTitle
- [ ] `/api/employees` accepts photo upload
- [ ] Photos are saved in `uploads/photos/` directory
- [ ] Photos are accessible via `/uploads/photos/{filename}`

### **Frontend Verification:**

- [ ] Login works correctly
- [ ] User data includes photo and jobTitle
- [ ] ProfileForm component renders
- [ ] PhotoUpload component works
- [ ] Photo preview displays
- [ ] Profile update succeeds
- [ ] Photo displays in Navbar
- [ ] Photo displays in Sidebar
- [ ] Job title displays in Navbar
- [ ] Job title displays in Sidebar
- [ ] CreateEmployeeForm includes jobTitle field
- [ ] CreateEmployeeForm includes photo upload
- [ ] Employee creation with photo works

### **UI/UX Verification:**

- [ ] Photo displays correctly (not broken images)
- [ ] Fallback avatar shows if no photo
- [ ] Job title displays instead of role when available
- [ ] Photo upload shows preview
- [ ] File size validation works (>5MB shows error)
- [ ] File type validation works (non-images show error)
- [ ] Success messages appear
- [ ] Error messages appear correctly

---

## 🐛 Troubleshooting

### **Issue: Photo Not Displaying**

**Possible Causes:**
1. Backend static file serving not enabled
2. Photo file not uploaded correctly
3. Photo URL incorrect

**Solutions:**
```bash
# Check if uploads directory exists
ls backend/uploads/photos/

# Check backend/app.ts has static file serving:
# app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

# Verify photo URL in browser console
# Should be: http://localhost:3001/uploads/photos/{filename}
```

### **Issue: Job Title Not Showing**

**Possible Causes:**
1. User data not refreshed after update
2. Backend not returning jobTitle

**Solutions:**
```javascript
// In ProfileForm, ensure refreshUser is called:
if (refreshUser) {
  await refreshUser();
}

// Check backend response includes jobTitle
// Check AuthContext is updating user state
```

### **Issue: Photo Upload Fails**

**Possible Causes:**
1. File too large (>5MB)
2. Wrong file type
3. Backend upload directory doesn't exist

**Solutions:**
```bash
# Create uploads directory if missing
mkdir -p backend/uploads/photos

# Check file size (must be < 5MB)
# Check file type (must be image/*)

# Check backend logs for errors
```

### **Issue: Database Migration Fails**

**Possible Causes:**
1. Database not running
2. Wrong DATABASE_URL
3. Migration already exists

**Solutions:**
```bash
# Check PostgreSQL is running
Get-Service -Name "*postgresql*"

# Check DATABASE_URL in .env
# Run migration reset if needed (⚠️ deletes data):
npx prisma migrate reset
```

---

## 📊 Test Scenarios

### **Scenario 1: Update Profile with Photo Only**
1. Upload photo
2. Leave job title empty
3. Submit
4. ✅ Photo should update, job title unchanged

### **Scenario 2: Update Profile with Job Title Only**
1. Enter job title
2. Don't upload photo
3. Submit
4. ✅ Job title should update, photo unchanged

### **Scenario 3: Update Both Photo and Job Title**
1. Upload photo
2. Enter job title
3. Submit
4. ✅ Both should update

### **Scenario 4: Create Employee Without Photo**
1. Fill all fields except photo
2. Submit
3. ✅ Employee should be created without photo

### **Scenario 5: Create Employee With Photo**
1. Fill all fields including photo
2. Submit
3. ✅ Employee should be created with photo

### **Scenario 6: Invalid File Upload**
1. Try uploading non-image file
2. ✅ Should show error message
3. Try uploading file >5MB
4. ✅ Should show error message

---

## 🎯 Expected Test Results Summary

| Test Case | Expected Result | Status |
|-----------|----------------|--------|
| Login | ✅ Redirects to dashboard | |
| Profile Update (Photo) | ✅ Photo displays in Navbar/Sidebar | |
| Profile Update (Job Title) | ✅ Job title displays | |
| Profile Update (Both) | ✅ Both display correctly | |
| Create Employee (No Photo) | ✅ Employee created successfully | |
| Create Employee (With Photo) | ✅ Employee created with photo | |
| Photo Display | ✅ Shows in all locations | |
| Fallback Avatar | ✅ Shows if no photo | |
| File Validation | ✅ Rejects invalid files | |
| API Endpoints | ✅ All endpoints work | |

---

## 📝 Test Report Template

After testing, document your results:

```
Date: [Date]
Tester: [Your Name]

✅ Passed Tests:
- [List passed tests]

❌ Failed Tests:
- [List failed tests]

🐛 Issues Found:
- [List any issues]

📸 Screenshots:
- [Attach screenshots if needed]
```

---

## 🚀 Quick Test Commands

```bash
# 1. Check backend health
curl http://localhost:3001/health

# 2. Check database connection
cd backend
npx prisma studio

# 3. Check uploads directory
ls backend/uploads/photos/

# 4. Test login (replace credentials)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@onixgroup.ae","password":"admin123","role":"ADMIN"}'
```

---

## ✅ Success Criteria

The application is working correctly if:

1. ✅ You can login successfully
2. ✅ You can update your profile with photo and job title
3. ✅ Photo displays in Navbar and Sidebar
4. ✅ Job title displays correctly
5. ✅ You can create employees with photo and job title
6. ✅ Photos are accessible via URL
7. ✅ No console errors
8. ✅ All API endpoints return correct data

---

**Happy Testing!** 🎉

If you encounter any issues, refer to the Troubleshooting section above.

