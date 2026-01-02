# 📸 How to Add Profile Photo - Step by Step Guide

## ✅ Implementation Complete!

The profile photo functionality has been added to your application. Here's how to use it:

---

## 🎯 Quick Access

### **Method 1: Via Sidebar Profile Menu** (Easiest)

1. **Click on your profile avatar** in the Sidebar (left side)
2. **Click "Settings"** from the dropdown menu
3. You'll be taken to the Settings page where you can:
   - Upload your profile photo
   - Update your job title

### **Method 2: Via Settings Menu**

1. **Click "Settings"** icon (⚙️) in the Sidebar navigation
2. You'll see the Settings page with profile options

### **Method 3: Direct URL**

1. Navigate to: `http://localhost:3000/settings`
2. Access the profile settings directly

---

## 📝 Step-by-Step: Upload Profile Photo

### **Step 1: Navigate to Settings**

- Click your profile avatar in Sidebar → "Settings"
- OR click Settings icon (⚙️) in Sidebar
- OR go to: `http://localhost:3000/settings`

### **Step 2: Upload Photo**

1. **In the "Profile Settings" section:**
   - Click "Choose profile photo"
   - Select an image file (JPEG, PNG, GIF, or WebP)
   - Max file size: 5MB
   - Preview will appear automatically

2. **Enter Job Title (Optional):**
   - Type your job title, e.g., "Senior Engineer"
   - Or leave it empty

3. **Click "Update Profile"**

### **Step 3: Verify**

After updating:
- ✅ Success message appears
- ✅ Photo displays in Navbar (top right)
- ✅ Photo displays in Sidebar (left side)
- ✅ Job title displays below your name

---

## 🖼️ Where Photos Display

Your profile photo will automatically appear in:

1. **Navbar (Top Right)**
   - Profile avatar icon
   - Admin profile modal (when clicked)

2. **Sidebar (Left Side)**
   - User avatar at the top
   - Profile dropdown menu

3. **Settings Page**
   - Profile preview
   - Current photo display

---

## 📋 What Was Added

### **1. Settings Page** (`src/pages/Settings.js`)
- ✅ New page created
- ✅ Includes ProfileForm component
- ✅ Accessible at `/settings`

### **2. Route Added** (`src/App.js`)
- ✅ Route: `/settings`
- ✅ Protected route (requires login)

### **3. Sidebar Link** (`src/layout/Sidebar.js`)
- ✅ Settings menu item already exists
- ✅ Added "Settings" link in profile dropdown menu

### **4. ProfileForm Component** (`src/components/ProfileForm.jsx`)
- ✅ Already created
- ✅ Handles photo upload
- ✅ Handles job title update

---

## 🎨 UI Features

### **Profile Settings Card:**
- Clean, modern design
- Photo upload with preview
- Job title input field
- Success/error messages
- Responsive layout

### **Photo Upload:**
- Drag & drop or click to select
- Real-time preview
- File validation (type & size)
- Shows file name and size

---

## 🔧 Technical Details

### **API Endpoint Used:**
```
PUT /api/auth/profile
Content-Type: multipart/form-data
Body: FormData {
  photo: File (optional),
  jobTitle: string (optional)
}
```

### **Photo Storage:**
- Photos saved in: `backend/uploads/photos/`
- Accessible at: `http://localhost:3001/uploads/photos/{filename}`
- Max file size: 5MB
- Supported formats: JPEG, PNG, GIF, WebP

---

## ✅ Testing Checklist

- [ ] Navigate to Settings page
- [ ] Upload a photo
- [ ] Enter job title
- [ ] Click "Update Profile"
- [ ] Verify success message
- [ ] Check photo displays in Navbar
- [ ] Check photo displays in Sidebar
- [ ] Verify job title displays
- [ ] Test with different photo sizes
- [ ] Test file type validation (try non-image file)
- [ ] Test file size validation (try >5MB file)

---

## 🐛 Troubleshooting

### **Settings Page Not Found**
- ✅ Route is added in `App.js`
- ✅ Settings page exists at `src/pages/Settings.js`
- ✅ Refresh browser or restart frontend server

### **Photo Not Uploading**
- Check backend server is running
- Check `backend/uploads/photos/` directory exists
- Check file size is under 5MB
- Check file type is image

### **Photo Not Displaying**
- Check photo URL in browser console
- Verify backend static file serving is enabled
- Check Network tab for image loading errors

### **Settings Link Not Showing**
- Check Sidebar profile dropdown menu
- Click on your avatar in Sidebar
- Settings link should be second option

---

## 📸 Screenshots Guide

**Where to find Settings:**

1. **Sidebar Profile Menu:**
   ```
   [Your Avatar] ← Click here
   ├── Admin
   ├── Settings ← Click here
   └── Logout
   ```

2. **Sidebar Navigation:**
   ```
   [⚙️ Settings] ← Click here
   ```

3. **Direct URL:**
   ```
   http://localhost:3000/settings
   ```

---

## 🚀 Quick Start

1. **Start Backend:**
   ```bash
   cd backend
   npm run dev
   ```

2. **Start Frontend:**
   ```bash
   cd ../ERP-FRONTEND/ONIX-ERP-V2
   npm start
   ```

3. **Login:**
   - Go to `http://localhost:3000/login`
   - Login with admin credentials

4. **Access Settings:**
   - Click your avatar in Sidebar → "Settings"
   - OR click Settings icon (⚙️)

5. **Upload Photo:**
   - Click "Choose profile photo"
   - Select image
   - Enter job title
   - Click "Update Profile"

---

## ✅ Success!

Once you upload your photo and set your job title:
- ✅ Photo displays everywhere automatically
- ✅ Job title shows instead of role
- ✅ Changes persist after logout/login
- ✅ Works for all users

---

**Everything is ready! Just navigate to Settings and upload your photo.** 🎉

