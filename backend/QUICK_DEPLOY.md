# ⚡ Quick Deployment Guide - Office Server

## 🎯 Quick Setup (5 Minutes)

### 1. Copy Files to Server
```
Server:
├── backend/
└── frontend/
```

### 2. Get Server IP Address
**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" → **192.168.1.XXX**

**Linux/Mac:**
```bash
ifconfig
```
Look for network IP → **192.168.1.XXX**

### 3. Setup Backend

```bash
cd backend
npm install

# Edit .env file - set FRONTEND_URL to server IP
FRONTEND_URL=http://192.168.1.XXX:3000

npm run build
npm start
```

**Output will show:**
```
🌐 Network API: http://192.168.1.XXX:3001/api
```

### 4. Setup Frontend

```bash
cd frontend
npm install

# Edit .env file
REACT_APP_API_URL=http://192.168.1.XXX:3001/api

npm run build

# Serve frontend
npm install -g serve
serve -s build -l 3000
```

### 5. Open Firewall Ports

**Windows:**
- Allow ports 3000 and 3001 in Windows Firewall

**Linux:**
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
```

### 6. Share with Admins

**Frontend URL:**
```
http://192.168.1.XXX:3000
```

**Backend API:**
```
http://192.168.1.XXX:3001/api
```

**Replace XXX with your server IP!**

---

## ✅ Test

From any computer on network:
1. Open browser
2. Go to: `http://192.168.1.XXX:3000`
3. Login with admin credentials

**Done!** 🎉
