# Client Testing Setup - Office Network Access

This guide will help you set up the ERP system so clients can test it on office computers without hosting.

## 🌐 Network Configuration

**Your Computer IP Address:** `192.168.1.151`

## 📋 Quick Setup Checklist

- [ ] Backend running on network IP
- [ ] Frontend configured to use network backend URL
- [ ] Frontend running on network IP
- [ ] Firewall ports opened
- [ ] Client computers can access both frontend and backend

---

## 🔧 Step 1: Backend Setup (Already Done ✅)

The backend is already configured to:
- ✅ Listen on all network interfaces (`0.0.0.0`)
- ✅ Accept connections from network IPs
- ✅ Display network URLs in console

**Backend Network URL:** `http://192.168.1.151:3001`

**To start backend:**
```bash
cd backend
npm run dev
```

You should see in console:
```
🌐 Network API: http://192.168.1.151:3001/api
💡 Access from other computers on your network:
   Backend: http://192.168.1.151:3001
```

---

## 🎨 Step 2: Frontend Setup

### Option A: Update API Configuration (Recommended)

1. **Find your API configuration file:**
   - Usually in: `src/services/api.js` or `src/config/api.js` or `src/utils/api.js`
   - Or search for: `localhost:3001` in your frontend code

2. **Update the API base URL:**

   **For React/Vite:**
   ```javascript
   // Change from:
   const API_BASE_URL = 'http://localhost:3001/api';
   
   // To:
   const API_BASE_URL = 'http://192.168.1.151:3001/api';
   ```

   **Or use environment variable:**
   ```javascript
   // .env file in frontend root
   VITE_API_URL=http://192.168.1.151:3001/api
   
   // In code:
   const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.151:3001/api';
   ```

   **For Create React App:**
   ```javascript
   // .env file
   REACT_APP_API_URL=http://192.168.1.151:3001/api
   
   // In code:
   const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.151:3001/api';
   ```

### Option B: Use Environment Variable (Best Practice)

Create `.env` file in your frontend root:

**For Vite:**
```env
VITE_API_URL=http://192.168.1.151:3001/api
```

**For Create React App:**
```env
REACT_APP_API_URL=http://192.168.1.151:3001/api
```

Then update your API config to use the env variable.

---

## 🚀 Step 3: Start Frontend on Network

### For Vite Projects:
```bash
cd frontend  # or your frontend folder name
npm run dev -- --host 0.0.0.0
```

Or update `vite.config.js`:
```javascript
export default defineConfig({
  server: {
    host: '0.0.0.0',  // Listen on all interfaces
    port: 3000,
  },
})
```

### For Create React App:
```bash
cd frontend
set HOST=0.0.0.0 && npm start
```

Or add to `package.json`:
```json
{
  "scripts": {
    "start": "react-scripts start",
    "start:network": "set HOST=0.0.0.0 && react-scripts start"
  }
}
```

Then run: `npm run start:network`

### For Next.js:
```bash
cd frontend
npm run dev -- -H 0.0.0.0
```

---

## 🔥 Step 4: Configure Windows Firewall

Allow incoming connections on ports 3000 (frontend) and 3001 (backend).

### Quick PowerShell Method (Run as Administrator):

```powershell
# Allow backend port
New-NetFirewallRule -DisplayName "ERP Backend Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Allow frontend port
New-NetFirewallRule -DisplayName "ERP Frontend Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Manual Method:
1. Open **Windows Defender Firewall**
2. Click **Advanced settings**
3. Click **Inbound Rules** → **New Rule**
4. Select **Port** → Next
5. Select **TCP** and enter port `3001` (backend)
6. Select **Allow the connection**
7. Apply to all profiles
8. Repeat for port `3000` (frontend)

---

## 🧪 Step 5: Test from Another Computer

### Test Backend:
Open browser on another computer and go to:
```
http://192.168.1.151:3001/health
```

Should see: `{"status":"ok","timestamp":"..."}`

### Test Frontend:
Open browser on another computer and go to:
```
http://192.168.1.151:3000
```

Should see your ERP login page.

---

## 📱 Step 6: Give Client Access

### Share These URLs with Client:

**Frontend (Login Page):**
```
http://192.168.1.151:3000
```

**Backend API (for testing):**
```
http://192.168.1.151:3001/api
```

### Requirements:
- ✅ Client computers must be on the **same network** (same WiFi/router)
- ✅ Your computer must be **running** (backend + frontend)
- ✅ Firewall ports must be **open**

---

## 🎯 Quick Start Scripts

### Create `start-backend.bat` (Windows):
```batch
@echo off
echo Starting ERP Backend...
cd backend
npm run dev
pause
```

### Create `start-frontend.bat` (Windows):
```batch
@echo off
echo Starting ERP Frontend...
cd frontend
npm run dev -- --host 0.0.0.0
pause
```

### Create `start-all.bat` (Windows):
```batch
@echo off
echo Starting ERP System...
start "Backend" cmd /k "cd backend && npm run dev"
timeout /t 3
start "Frontend" cmd /k "cd frontend && npm run dev -- --host 0.0.0.0"
echo.
echo Backend: http://192.168.1.151:3001
echo Frontend: http://192.168.1.151:3000
echo.
echo Press any key to close all windows...
pause
```

---

## 🔍 Troubleshooting

### Client can't access frontend/backend

1. **Check if your computer is running:**
   ```bash
   # Test backend
   curl http://192.168.1.151:3001/health
   
   # Test frontend (from your computer)
   curl http://192.168.1.151:3000
   ```

2. **Check firewall:**
   - Windows Firewall → Inbound Rules
   - Make sure ports 3000 and 3001 are allowed

3. **Check IP address:**
   ```bash
   ipconfig | findstr /i "IPv4"
   ```
   If IP changed, update frontend API URL

4. **Check same network:**
   - All computers must be on same WiFi/router
   - Check IP ranges match (e.g., all 192.168.1.x)

### Frontend shows "Connection timeout"

1. Check backend is running: `http://192.168.1.151:3001/health`
2. Check frontend API URL is correct: `http://192.168.1.151:3001/api`
3. Check CORS is allowing the origin

### CORS errors in browser console

Backend CORS is already configured, but if you see errors:
- Check browser console for exact error
- Verify frontend URL matches allowed origins in `backend/src/app.ts`

---

## 📊 Network URLs Summary

| Service | Local URL | Network URL |
|---------|-----------|-------------|
| **Backend** | http://localhost:3001 | http://192.168.1.151:3001 |
| **Backend API** | http://localhost:3001/api | http://192.168.1.151:3001/api |
| **Frontend** | http://localhost:3000 | http://192.168.1.151:3000 |

---

## ✅ Final Checklist Before Client Testing

- [ ] Backend running: `http://192.168.1.151:3001/health` works
- [ ] Frontend running: `http://192.168.1.151:3000` loads
- [ ] Frontend API URL updated to network IP
- [ ] Firewall ports opened (3000, 3001)
- [ ] Tested from another computer successfully
- [ ] Client has network URLs
- [ ] Client computers on same network

---

## 🎉 You're Ready!

Once everything is set up:
1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm run dev -- --host 0.0.0.0`
3. Share `http://192.168.1.151:3000` with client
4. Client can test the ERP system!

**Note:** Your computer must stay on and running for clients to access the system.



