# 🚀 Backend Server Start Guide

## ❌ Current Issue

**Error:** `net::ERR_CONNECTION_REFUSED` when trying to upload documents  
**Cause:** Backend server is not running on port 3001

## ✅ Solution: Start the Backend Server

### Step 1: Navigate to Backend Directory
```bash
cd backend
```

### Step 2: Check if Server is Running
```bash
# Check if port 3001 is in use
netstat -ano | findstr :3001
```

If you see `LISTENING`, the server is running.  
If you see `SYN_SENT` or nothing, the server is NOT running.

### Step 3: Start the Backend Server

**Option A: Development Mode (with auto-reload)**
```bash
npm run dev
```

**Option B: Production Mode**
```bash
npm start
```

**Option C: Using TypeScript directly**
```bash
npx ts-node src/server.ts
```

### Step 4: Verify Server is Running

After starting, you should see:
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🌐 Network API: http://192.168.1.54:3001/api
🏥 Health check: http://localhost:3001/health
```

### Step 5: Test the Connection

Open in browser:
- `http://192.168.1.54:3001/health` - Should return `{"status":"ok"}`
- `http://192.168.1.54:3001/api` - Should return API endpoints list

---

## 🔧 Troubleshooting

### Issue 1: Port Already in Use
**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:**
1. Find the process using port 3001:
   ```bash
   netstat -ano | findstr :3001
   ```
2. Kill the process:
   ```bash
   taskkill /PID <process_id> /F
   ```
3. Or use the provided script:
   ```bash
   .\fix-port-conflict.ps1
   ```

### Issue 2: Server Starts But Can't Connect
**Check:**
1. Firewall settings - allow port 3001
2. IP address - verify `192.168.1.54` is correct
3. Network connection - ensure you're on the same network

### Issue 3: Database Connection Error
**Error:** `Can't reach database server`

**Solution:**
1. Check `.env` file has correct `DATABASE_URL`
2. Ensure PostgreSQL is running
3. Run migrations: `npx prisma migrate dev`

---

## 📋 Quick Start Checklist

- [ ] Navigate to `backend` directory
- [ ] Check if server is running (`netstat -ano | findstr :3001`)
- [ ] If not running, start server (`npm run dev`)
- [ ] Verify server started (check console output)
- [ ] Test health endpoint (`http://192.168.1.54:3001/health`)
- [ ] Try document upload again

---

## 🎯 Expected Server Output

When server starts successfully, you should see:
```
📁 Created uploads directory: ...
📸 Created photos directory: ...
📁 Serving static files from: ...
📸 Photo directory: ...
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🌐 Network API: http://192.168.1.54:3001/api
```

---

**Start the backend server and the document upload will work!** 🚀

