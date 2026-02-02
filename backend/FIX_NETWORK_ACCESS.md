# 🔧 Fix Network Access Issue

## Problem: Cannot Access Backend from Other Computers

### Your Server IP: `192.168.1.178`

---

## ✅ Solution 1: Open Windows Firewall Ports

### Step 1: Open Windows Defender Firewall
1. Press `Windows + R`
2. Type: `wf.msc` and press Enter
3. Click "Inbound Rules" in the left panel
4. Click "New Rule" in the right panel

### Step 2: Create Rule for Port 3001
1. Select **"Port"** → Next
2. Select **"TCP"**
3. Enter **"3001"** in "Specific local ports" → Next
4. Select **"Allow the connection"** → Next
5. Check all profiles (Domain, Private, Public) → Next
6. Name it: **"ONIX ERP Backend Port 3001"** → Finish

### Step 3: Create Rule for Port 3000 (Frontend)
Repeat the same steps but use port **3000** instead.

---

## ✅ Solution 2: Quick PowerShell Command (Run as Administrator)

Open PowerShell as Administrator and run:

```powershell
# Allow port 3001 (Backend)
New-NetFirewallRule -DisplayName "ONIX ERP Backend" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Allow port 3000 (Frontend)
New-NetFirewallRule -DisplayName "ONIX ERP Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

---

## ✅ Solution 3: Verify Server is Running

### Check if server is listening:
```cmd
netstat -ano | findstr :3001
```

You should see:
```
TCP    0.0.0.0:3001           0.0.0.0:0              LISTENING       <PID>
```

If you see `0.0.0.0:3001`, the server is listening on all interfaces ✅

If you see `127.0.0.1:3001`, the server is only listening locally ❌

---

## ✅ Solution 4: Test from Server Computer

### Test locally first:
```cmd
curl http://localhost:3001/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### Test with network IP:
```cmd
curl http://192.168.1.178:3001/health
```

Should return: `{"status":"ok","timestamp":"..."}`

---

## ✅ Solution 5: Test from Another Computer

### From another computer on the same network:

1. Open browser
2. Go to: `http://192.168.1.178:3001/health`
3. Should see: `{"status":"ok","timestamp":"..."}`

### If it doesn't work:

**Check 1: Ping the server**
```cmd
ping 192.168.1.178
```

**Check 2: Check firewall on server**
- Windows Firewall should allow port 3001

**Check 3: Check if both computers are on same network**
- Both should be on `192.168.1.x` network

**Check 4: Check antivirus**
- Some antivirus software blocks network access
- Temporarily disable to test

---

## ✅ Solution 6: Verify Server Configuration

### Check `.env` file:
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://192.168.1.178:3000
```

### Check server is listening on 0.0.0.0:
The server code already has:
```typescript
const HOST = '0.0.0.0'; // ✅ This allows network access
```

---

## 📝 Quick Checklist

- [ ] Windows Firewall allows port 3001
- [ ] Server is running (`npm run dev` or `npm start`)
- [ ] Server shows: `🌐 Network API: http://192.168.1.178:3001/api`
- [ ] Can access `http://localhost:3001/health` from server
- [ ] Can access `http://192.168.1.178:3001/health` from server
- [ ] Both computers on same network (192.168.1.x)
- [ ] Antivirus not blocking

---

## 🎯 URLs to Share with Admins

**Backend API:**
```
http://192.168.1.178:3001/api
```

**Health Check:**
```
http://192.168.1.178:3001/health
```

**Frontend (when deployed):**
```
http://192.168.1.178:3000
```

---

## 🐛 Still Not Working?

### Check Windows Firewall Status:
```cmd
netsh advfirewall show allprofiles
```

### Check if port is open:
```cmd
netstat -ano | findstr :3001
```

### Test with telnet (from another computer):
```cmd
telnet 192.168.1.178 3001
```

If connection succeeds, firewall is OK. If it fails, firewall is blocking.

---

## ✅ Most Common Fix

**90% of the time, it's Windows Firewall!**

Run this PowerShell command as Administrator:
```powershell
New-NetFirewallRule -DisplayName "ONIX ERP Backend" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

Then restart your server and try again!
