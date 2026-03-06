# 🌐 How to Share Web Application with Other Offices Using Network

## 📋 Quick Overview

This guide will help you share your ONIX ERP web application with other computers in your office network.

**Your Application:**
- **Backend (API):** Port 3001
- **Frontend (Web):** Port 3000
- **Network IP:** Will be detected automatically (usually 192.168.1.x)

---

## 🔍 STEP 1: Find Your Computer's IP Address

### Method 1: Using Command Prompt
1. Press `Windows + R`
2. Type `cmd` and press Enter
3. Type: `ipconfig`
4. Look for **IPv4 Address** under your network adapter
5. Example: `192.168.1.151`

### Method 2: Using PowerShell
```powershell
ipconfig | findstr IPv4
```

### Method 3: Check Network Settings
1. Right-click network icon in system tray
2. Click "Open Network & Internet settings"
3. Click "Properties"
4. Find "IPv4 address"

**Note:** Write down your IP address (e.g., `192.168.1.151`)

---

## 🔥 STEP 2: Open Windows Firewall Ports

**IMPORTANT:** This allows other computers to access your application.

### Option A: Use Batch File (Easiest) ⭐
1. Navigate to: `C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend`
2. Right-click `open-firewall-admin.bat`
3. Select **"Run as administrator"**
4. Click "Yes" when prompted
5. ✅ Ports 3000 and 3001 are now open!

### Option B: PowerShell (Run as Administrator)
1. Press `Windows + X`
2. Select "Windows PowerShell (Admin)" or "Terminal (Admin)"
3. Run these commands:
```powershell
New-NetFirewallRule -DisplayName "ONIX ERP Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "ONIX ERP Frontend Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Option C: Windows Firewall GUI
1. Press `Windows + R`
2. Type `wf.msc` and press Enter
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP"
6. Enter port: `3001` → Next
7. Select "Allow the connection" → Next
8. Check all profiles → Next
9. Name: "ONIX ERP Backend" → Finish
10. Repeat for port `3000` (name it "ONIX ERP Frontend")

---

## 🚀 STEP 3: Start Backend Server

1. Open Command Prompt or PowerShell
2. Navigate to backend folder:
```bash
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
```

3. Start the backend:
```bash
npm run dev
```

**You should see:**
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🌐 Network API: http://192.168.1.151:3001/api
```

**Note the Network IP address shown** - this is what you'll share!

---

## 🎨 STEP 4: Configure Frontend for Network Access

### 4.1 Update Frontend API URL

You need to update the frontend to use your network IP instead of localhost.

**Find your API configuration file:**
- Usually in: `ERP-FRONTEND\ONIX-ERP-V2\src\services\` folder
- Look for files like: `api.js`, `authAPI.js`, `companiesAPI.js`, etc.

**Update the API base URL:**

**Before:**
```javascript
const API_BASE_URL = 'http://localhost:3001/api';
```

**After (replace with YOUR IP):**
```javascript
const API_BASE_URL = 'http://192.168.1.151:3001/api';
```

**OR use environment variable (Recommended):**

1. Create/update `.env` file in `ERP-FRONTEND\ONIX-ERP-V2\`:
```env
REACT_APP_API_URL=http://192.168.1.151:3001/api
REACT_APP_BACKEND_URL=http://192.168.1.151:3001
```

2. In your API files, use:
```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.151:3001/api';
```

### 4.2 Start Frontend on Network

**For React (Create React App):**
```bash
cd C:\Users\Lenovo\Desktop\ERP-FRONTEND\ONIX-ERP-V2
set HOST=0.0.0.0 && npm start
```

**For Vite:**
```bash
cd C:\Users\Lenovo\Desktop\ERP-FRONTEND\ONIX-ERP-V2
npm run dev -- --host 0.0.0.0
```

**OR update `package.json` scripts:**
```json
{
  "scripts": {
    "start": "react-scripts start",
    "start:network": "set HOST=0.0.0.0 && react-scripts start"
  }
}
```

Then run: `npm run start:network`

---

## 📢 STEP 5: Share URLs with Other Office Users

Share these URLs with your office colleagues:

### 🌐 Main Application URL (Share This!)
```
http://192.168.1.151:3000
```

**Replace `192.168.1.151` with YOUR actual IP address!**

### 📋 Additional URLs (For Testing)
- **Backend Health Check:** `http://192.168.1.151:3001/health`
- **API Endpoint:** `http://192.168.1.151:3001/api`

---

## ✅ STEP 6: Test Access

### Test from Your Computer:
1. Open browser
2. Go to: `http://192.168.1.151:3000`
3. Should see login page ✅

### Test from Another Office Computer:
1. Make sure both computers are on the same network
2. Open browser on the other computer
3. Go to: `http://192.168.1.151:3000`
4. Should see login page ✅
5. Try logging in with credentials

### Test Backend Health:
1. Open browser
2. Go to: `http://192.168.1.151:3001/health`
3. Should see: `{"status":"ok","timestamp":"..."}` ✅

---

## 🔐 Default Login Credentials

Share these with authorized users:

| Email | Password | Role |
|-------|----------|------|
| `admin@onixgroup.ae` | `admin123` | ADMIN |
| `ramiz@onixgroup.ae` | `ramiz@123` | ADMIN |

---

## 🚨 Troubleshooting

### ❌ Can't Access from Other Computers

**1. Check Firewall:**
- Ensure ports 3000 and 3001 are open (Step 2)
- Try disabling firewall temporarily to test

**2. Check Backend is Running:**
- Verify backend console shows: "Server running on port 3001"
- Test: `http://192.168.1.151:3001/health`

**3. Check Frontend API URL:**
- Verify frontend points to network IP, not localhost
- Check browser console for API errors

**4. Check Network:**
- Ensure all computers are on same network (192.168.1.x)
- Ping test: `ping 192.168.1.151` (from other computer)

**5. Check Server is Listening:**
```bash
netstat -ano | findstr :3001
```
Should show: `TCP    0.0.0.0:3001` (not `127.0.0.1:3001`)

### ❌ Frontend Can't Connect to Backend

**Check:**
1. Backend is running
2. Frontend API URL uses network IP (not localhost)
3. CORS is configured in backend (already done ✅)

### ❌ Port Already in Use

**If port 3000 or 3001 is already in use:**
```bash
# Find what's using the port
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

---

## 📝 Quick Checklist

- [ ] Found your IP address (e.g., 192.168.1.151)
- [ ] Opened firewall ports 3000 and 3001
- [ ] Backend is running (`npm run dev`)
- [ ] Frontend API URL updated to network IP
- [ ] Frontend started with network host (`HOST=0.0.0.0`)
- [ ] Tested access from your computer
- [ ] Tested access from another computer
- [ ] Shared URL with office users

---

## 🎯 Summary

**To share your web application:**

1. **Find IP:** `ipconfig` → Note IPv4 address
2. **Open Firewall:** Run `open-firewall-admin.bat` as admin
3. **Start Backend:** `npm run dev` in backend folder
4. **Update Frontend:** Change API URL to network IP
5. **Start Frontend:** `set HOST=0.0.0.0 && npm start`
6. **Share URL:** `http://YOUR_IP:3000` with office users

**Example:**
```
http://192.168.1.151:3000
```

---

## 💡 Pro Tips

1. **Static IP:** Consider setting a static IP for your computer so the URL doesn't change
2. **Bookmark:** Have users bookmark the application URL
3. **Shortcut:** Create a desktop shortcut with the URL for easy access
4. **Documentation:** Keep this guide handy for future reference

---

**Your application is now accessible to all computers on your office network!** 🎉
