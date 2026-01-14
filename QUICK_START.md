# 🚀 Quick Start Guide for Client Testing

## One-Command Start (Easiest)

### Windows:
Double-click `start-all.bat` or run:
```bash
start-all.bat
```

This will start both backend and frontend automatically.

---

## Manual Start

### 1. Start Backend:
```bash
cd backend
npm run dev
```

### 2. Start Frontend (in new terminal):
```bash
cd frontend
npm run dev -- --host 0.0.0.0
```

---

## Share with Client

**Give client this URL:**
```
http://192.168.1.151:3000
```

**Requirements:**
- Client must be on same WiFi/network
- Your computer must be running
- Both services must be started

---

## Test URLs

**Backend Health Check:**
```
http://192.168.1.151:3001/health
```

**Frontend:**
```
http://192.168.1.151:3000
```

---

## Troubleshooting

**Can't access?**
1. Check firewall: Ports 3000 and 3001 must be open
2. Check IP: Run `ipconfig` to verify IP address
3. Check network: All computers on same WiFi

**See full guide:** `CLIENT_TESTING_SETUP.md`



