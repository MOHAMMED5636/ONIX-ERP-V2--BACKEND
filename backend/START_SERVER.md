# 🚀 Start Backend Server

## ⚠️ Current Issue

**Error:** `ERR_CONNECTION_REFUSED`  
**Cause:** Backend server is not running

## ✅ Quick Fix

### 1. Open Terminal in Backend Directory
```bash
cd backend
```

### 2. Start the Server
```bash
npm run dev
```

### 3. Verify Server Started
You should see:
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🌐 Network API: http://192.168.1.54:3001/api
```

### 4. Test Connection
Open in browser: `http://192.168.1.54:3001/health`

Should return: `{"status":"ok"}`

---

## 🔧 If Port is Already in Use

```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace <PID> with actual process ID)
taskkill /PID <PID> /F
```

---

## ✅ After Server Starts

1. ✅ Document upload will work
2. ✅ All API endpoints will be accessible
3. ✅ Frontend can connect to backend

**Start the server now and try uploading again!** 🚀
