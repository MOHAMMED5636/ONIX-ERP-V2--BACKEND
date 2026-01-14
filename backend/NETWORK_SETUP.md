# Network Setup Guide for Office Computers

## 🌐 Backend Network Configuration

The backend is already configured to listen on all network interfaces (`0.0.0.0`), which means it's accessible from other computers on your local network.

### Current Network IP
Your computer's IP address: **192.168.1.151**

### Backend URLs

**Local (same computer):**
- Backend: `http://localhost:3001`
- API: `http://localhost:3001/api`
- Health Check: `http://localhost:3001/health`

**Network (other computers):**
- Backend: `http://192.168.1.151:3001`
- API: `http://192.168.1.151:3001/api`
- Health Check: `http://192.168.1.151:3001/health`

## 🖥️ Frontend Configuration

To allow other computers to access your frontend, you need to configure your frontend server to listen on the network IP.

### For React (Create React App / Vite)

#### Option 1: Using Environment Variable (Recommended)

Create or update `.env` file in your frontend project:

```env
# Backend API URL - Use network IP for office access
REACT_APP_API_URL=http://192.168.1.151:3001/api
# or for Vite:
VITE_API_URL=http://192.168.1.151:3001/api
```

#### Option 2: Start Frontend with Network Host

**For React (Create React App):**
```bash
# Windows PowerShell
$env:HOST=192.168.1.151; npm start

# Or set in package.json scripts:
"start:network": "set HOST=192.168.1.151 && npm start"
```

**For Vite:**
```bash
# Windows PowerShell
npm run dev -- --host 192.168.1.151

# Or update vite.config.js:
export default defineConfig({
  server: {
    host: '0.0.0.0', // Listen on all interfaces
    port: 3000,
  },
})
```

**For Next.js:**
```bash
npm run dev -- -H 192.168.1.151
```

### Frontend URLs

**Local (same computer):**
- Frontend: `http://localhost:3000`

**Network (other computers):**
- Frontend: `http://192.168.1.151:3000`

## 📝 Frontend API Configuration

Update your frontend API base URL to use the network IP:

### Example API Configuration

**For React/Vite:**
```javascript
// src/config/api.js or src/services/api.js
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://192.168.1.151:3001/api';
// or for Create React App:
// const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.151:3001/api';

export default API_BASE_URL;
```

**For Next.js:**
```javascript
// next.config.js or .env.local
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://192.168.1.151:3001/api';
```

## 🔧 Quick Setup Steps

### Backend (Already Done ✅)
1. ✅ Server listens on `0.0.0.0` (all network interfaces)
2. ✅ CORS configured to allow network IPs
3. ✅ Network IP displayed in console logs

### Frontend Setup

1. **Update API Base URL:**
   - Find your API configuration file (usually in `src/services/api.js` or `src/config/api.js`)
   - Change from `http://localhost:3001/api` to `http://192.168.1.151:3001/api`

2. **Start Frontend on Network:**
   ```bash
   # For Vite
   npm run dev -- --host 0.0.0.0
   
   # For Create React App
   set HOST=0.0.0.0 && npm start
   ```

3. **Test from Another Computer:**
   - Open browser on another computer
   - Navigate to: `http://192.168.1.151:3000`
   - Should see your frontend application

## 🔒 Firewall Configuration

If other computers can't access, you may need to allow the ports through Windows Firewall:

### Windows Firewall Rules

1. Open Windows Defender Firewall
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP" and enter port `3001` (backend) and `3000` (frontend)
6. Allow the connection
7. Apply to all profiles

### Quick PowerShell Command (Run as Administrator)

```powershell
# Allow backend port
New-NetFirewallRule -DisplayName "Backend API Port 3001" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Allow frontend port
New-NetFirewallRule -DisplayName "Frontend Port 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

## 🧪 Testing Network Access

### Test Backend from Another Computer

```bash
# From another computer on the network
curl http://192.168.1.151:3001/health

# Or open in browser
http://192.168.1.151:3001/health
```

### Test Frontend from Another Computer

```bash
# Open in browser on another computer
http://192.168.1.151:3000
```

## 📱 Mobile Device Access

You can also access from mobile devices on the same WiFi network:
- Backend: `http://192.168.1.151:3001`
- Frontend: `http://192.168.1.151:3000`

## 🔄 Finding Your IP Address

If your IP changes, find it with:

**Windows:**
```bash
ipconfig | findstr /i "IPv4"
```

**Mac/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Then update:
1. Frontend API URL configuration
2. CORS allowed origins in backend (if needed)

## ⚠️ Important Notes

1. **IP Address Changes:** If your computer's IP address changes (DHCP), you'll need to update the frontend API URL
2. **Same Network:** All computers must be on the same local network (same WiFi/router)
3. **Security:** This setup is for local development only. For production, use proper domain names and HTTPS
4. **Port Forwarding:** If accessing from outside your network, you'll need router port forwarding (not recommended for development)

## 🎯 Summary

**Backend Network URL:** `http://192.168.1.151:3001`
**Frontend Network URL:** `http://192.168.1.151:3000` (after configuration)

Both are accessible from any computer on your office network! 🚀



