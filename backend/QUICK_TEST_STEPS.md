# ⚡ Quick Test Steps - Photo & Job Title

## 🚀 Quick Start (5 Minutes)

### **Step 1: Run Migration**
```bash
cd backend
npx prisma migrate dev --name add_photo_jobtitle
npx prisma generate
```

### **Step 2: Start Backend**
```bash
npm run dev
```
✅ Should see: `Server running on port 3001`

### **Step 3: Start Frontend**
```bash
cd ../ERP-FRONTEND/ONIX-ERP-V2
npm start
```
✅ Should open: `http://localhost:3000`

---

## 🧪 Quick Tests (10 Minutes)

### **Test 1: Login** (1 min)
1. Go to `http://localhost:3000/login`
2. Login with:
   - Email: `admin@onixgroup.ae`
   - Password: `admin123`
   - Role: `ADMIN`
3. ✅ Should redirect to dashboard

### **Test 2: Update Profile** (3 min)
1. Go to Settings page (or create one)
2. Upload a photo
3. Enter job title: `Senior Engineer`
4. Click "Update Profile"
5. ✅ Should see success message
6. ✅ Check Navbar - photo should display
7. ✅ Check Sidebar - photo should display

### **Test 3: Create Employee** (3 min)
1. Go to Employees page
2. Click "Add Employee"
3. Fill form:
   - First Name: `Test`
   - Last Name: `User`
   - Job Title: `Engineer`
   - Upload photo
4. Submit
5. ✅ Should show credentials modal
6. ✅ Employee should appear in list

### **Test 4: Verify Display** (2 min)
1. Check Navbar profile modal
   - ✅ Photo displays
   - ✅ Job title displays
2. Check Sidebar
   - ✅ Photo displays
   - ✅ Job title displays

### **Test 5: API Test** (1 min)
```bash
# Get token from browser localStorage
TOKEN="your-token"

# Test profile endpoint
curl -X GET http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```
✅ Should return user with `photo` and `jobTitle`

---

## ✅ Success Indicators

- ✅ No errors in browser console
- ✅ No errors in backend terminal
- ✅ Photos display correctly
- ✅ Job titles display correctly
- ✅ API responses include photo and jobTitle

---

## 🐛 Quick Fixes

**Photo not showing?**
- Check: `backend/uploads/photos/` directory exists
- Check: Backend `app.ts` has static file serving

**Job title not showing?**
- Check: User data refreshed after update
- Check: Backend returns jobTitle in response

**Migration failed?**
- Check: PostgreSQL is running
- Check: DATABASE_URL is correct

---

**Total Time: ~15 minutes** ⏱️

For detailed testing, see `TESTING_GUIDE.md`

