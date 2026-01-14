# 🔧 Fix Port 3001 Already in Use Error

## Problem
```
❌ Port 3001 is already in use. Please use a different port.
```

## Quick Fix

### Option 1: Kill the Process (Recommended)

**Windows PowerShell:**
```powershell
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Or use the script:**
```powershell
.\fix-port-conflict.ps1
```

### Option 2: Change Port

Edit `.env` file in backend folder:
```env
PORT=3002
```

Then restart server:
```bash
npm run dev
```

### Option 3: Find and Stop Manually

1. **Open Task Manager** (Ctrl + Shift + Esc)
2. Go to **Details** tab
3. Find process using port 3001
4. Right-click → **End Task**

## Common Causes

1. **Previous server instance** still running
2. **Another application** using port 3001
3. **Multiple terminal windows** with servers running

## Prevention

- Always stop server with `Ctrl + C` before closing terminal
- Check for running processes before starting server
- Use different ports for different projects

## Verify Port is Free

```bash
netstat -ano | findstr :3001
```

If no output, port is free! ✅



