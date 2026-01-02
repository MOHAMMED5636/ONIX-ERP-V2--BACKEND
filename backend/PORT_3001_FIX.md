# 🔧 Port 3001 Already in Use - Fix Guide

## ✅ Issue Fixed!

The process using port 3001 has been terminated. You can now start your backend server.

---

## 🚀 Next Steps

### **1. Start Backend Server**

```bash
cd backend
npm run dev
```

**Expected Output:**
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
```

---

## 🛠️ If Port is Still in Use

### **Option 1: Find and Kill Process Manually**

```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /PID [PID] /F
```

### **Option 2: Change Port**

If you want to use a different port, update `backend/src/config/env.ts`:

```typescript
port: process.env.PORT || 3002, // Changed from 3001 to 3002
```

Then update frontend API URL in `src/services/authAPI.js`:

```javascript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3002/api';
```

### **Option 3: Use PowerShell to Kill All Node Processes**

```powershell
# Kill all Node.js processes (⚠️ Use with caution)
Get-Process node | Stop-Process -Force
```

---

## 🔍 Common Causes

- Previous backend server instance still running
- Another application using port 3001
- Crashed process not cleaned up

---

## ✅ Verification

After starting the server, verify it's running:

```bash
curl http://localhost:3001/health
```

Should return: `{"status":"ok","timestamp":"..."}`

---

**Port 3001 is now free! Start your backend server.** 🚀

