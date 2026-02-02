# 🌐 Frontend Network Setup Guide

## Problem: Frontend Shows "Cannot connect to server - make sure backend is running on http://localhost:3001"

When accessing the frontend from another computer, it tries to connect to `localhost:3001`, which refers to that computer, not the server!

---

## ✅ Solution: Configure Frontend to Use Server IP

### Step 1: Create/Update `.env` File in Frontend

Navigate to your frontend folder and create/edit `.env` file:

**Location:** `c:/Users/Lenovo/Desktop/ERP-FRONTEND/ONIX-ERP-V2/.env`

**Content:**
```env
# Backend API URL - Use server IP for network access
# Replace 192.168.1.178 with your actual server IP address
REACT_APP_API_URL=http://192.168.1.178:3001/api

# Backend Base URL (without /api) for socket connections and file uploads
REACT_APP_BACKEND_URL=http://192.168.1.178:3001
```

**Important:** Replace `192.168.1.178` with your actual server IP address!

---

### Step 2: Rebuild Frontend

After updating `.env`, you MUST rebuild the frontend:

```bash
cd c:/Users/Lenovo/Desktop/ERP-FRONTEND/ONIX-ERP-V2
npm run build
```

**Why rebuild?** React apps read environment variables at build time, not runtime!

---

### Step 3: Restart Frontend Development Server

If running in development mode:

```bash
# Stop the current server (Ctrl+C)
# Then restart:
npm start
```

The frontend will now use the server IP instead of localhost!

---

## 🔍 How It Works

### Before (Hardcoded localhost):
```javascript
// ❌ This only works on the server computer
const API_BASE_URL = 'http://localhost:3001/api';
```

### After (Using Environment Variable):
```javascript
// ✅ This works from any computer on the network
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
// When .env has: REACT_APP_API_URL=http://192.168.1.178:3001/api
// It will use: http://192.168.1.178:3001/api
```

---

## 📝 Files Updated

The following frontend files have been updated to use environment variables:

1. ✅ `src/services/authAPI.js` - Uses `REACT_APP_API_URL`
2. ✅ `src/services/clientsAPI.js` - Uses `REACT_APP_API_URL`
3. ✅ `src/services/companiesAPI.js` - Uses `REACT_APP_API_URL`
4. ✅ `src/services/contractsAPI.js` - Uses `REACT_APP_API_URL`
5. ✅ `src/services/dashboardAPI.js` - Uses `REACT_APP_API_URL`
6. ✅ `src/services/documentAPI.js` - Uses `REACT_APP_API_URL`
7. ✅ `src/components/contracts/CreateContract.js` - Uses `REACT_APP_API_URL`
8. ✅ `src/layout/Navbar.js` - Uses `REACT_APP_BACKEND_URL`
9. ✅ `src/layout/Sidebar.js` - Uses `REACT_APP_BACKEND_URL`
10. ✅ `src/layout/TenderEngineerSidebar.js` - Uses `REACT_APP_BACKEND_URL`
11. ✅ `src/modules/ChatRoom.js` - Uses `REACT_APP_API_URL`

---

## 🎯 Quick Setup Checklist

- [ ] Created `.env` file in frontend root folder
- [ ] Set `REACT_APP_API_URL=http://192.168.1.178:3001/api` (with your server IP)
- [ ] Set `REACT_APP_BACKEND_URL=http://192.168.1.178:3001` (with your server IP)
- [ ] Rebuilt frontend: `npm run build`
- [ ] Restarted frontend server: `npm start`
- [ ] Tested from another computer

---

## 🧪 Testing

### From Server Computer:
1. Open browser: `http://localhost:3000`
2. Should connect to backend successfully

### From Another Computer:
1. Open browser: `http://192.168.1.178:3000` (or however frontend is served)
2. Should connect to backend at `192.168.1.178:3001`
3. No more "localhost:3001" errors!

---

## 🐛 Troubleshooting

### Still seeing "localhost:3001" error?

1. **Check `.env` file exists** in frontend root folder
2. **Verify `.env` has correct IP** (not localhost)
3. **Rebuild frontend** - Environment variables are read at build time!
4. **Clear browser cache** - Old JavaScript might be cached
5. **Check browser console** - Look for actual API calls being made

### Frontend not picking up environment variables?

1. **Restart development server** after changing `.env`
2. **Rebuild production build** - `npm run build`
3. **Check variable names** - Must start with `REACT_APP_`
4. **Check for typos** - No spaces around `=` sign

---

## 📋 Environment Variables Reference

### Required Variables:
```env
REACT_APP_API_URL=http://192.168.1.178:3001/api
REACT_APP_BACKEND_URL=http://192.168.1.178:3001
```

### Optional (for different environments):
```env
# Development (on server)
REACT_APP_API_URL=http://localhost:3001/api

# Production (network access)
REACT_APP_API_URL=http://192.168.1.178:3001/api
```

---

## ✅ Success!

Once configured correctly:
- ✅ Frontend will connect to backend using server IP
- ✅ Works from any computer on the network
- ✅ No more "localhost" connection errors
- ✅ All API calls use the correct server address

**Remember:** After changing `.env`, always rebuild the frontend!
