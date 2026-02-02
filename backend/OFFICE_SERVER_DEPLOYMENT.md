# 🏢 Office Server Deployment Guide

## 📋 Overview
This guide will help you deploy the ONIX ERP Backend and Frontend on a local office server so all admins can access it via network IP address.

---

## 🖥️ STEP 1: Prepare the Server

### 1.1 Copy Files to Server
Copy both folders to your office server:
```
Server Location:
├── backend/          (Backend code)
└── frontend/        (Frontend code - your React app)
```

### 1.2 Check Server IP Address
On the server, run one of these commands:

**Windows:**
```cmd
ipconfig
```
Look for "IPv4 Address" (e.g., `192.168.1.100`)

**Linux/Mac:**
```bash
ifconfig
# or
ip addr show
```
Look for your network interface IP (e.g., `192.168.1.100`)

**Note the IP address** - you'll share this with admins!

---

## 🔧 STEP 2: Setup Backend on Server

### 2.1 Navigate to Backend Directory
```bash
cd backend
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Setup Environment Variables
Create/Edit `.env` file in `backend` folder:

```env
# Server Configuration
PORT=3001
NODE_ENV=production

# Replace with your server's IP address
FRONTEND_URL=http://192.168.1.100:3000

# Database (use your PostgreSQL server)
DATABASE_URL="postgresql://user:password@localhost:5432/onix_erp?schema=public"

# JWT Secret (change this!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Email (optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@onixgroup.ae
```

**Important:** Replace `192.168.1.100` with your actual server IP address!

### 2.4 Setup Database
```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database (optional - creates admin user)
npm run db:seed
```

### 2.5 Build Backend
```bash
npm run build
```

### 2.6 Start Backend Server
```bash
# For production
npm start

# OR for development (with auto-reload)
npm run dev
```

**✅ Success Output:**
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🌐 Network API: http://192.168.1.100:3001/api
🏥 Health check: http://localhost:3001/health
🌐 Network Health: http://192.168.1.100:3001/health

💡 Access from other computers on your network:
   Backend: http://192.168.1.100:3001
   API: http://192.168.1.100:3001/api
```

**Note the Network IP address** - Share this with admins!

---

## 🎨 STEP 3: Setup Frontend on Server

### 3.1 Navigate to Frontend Directory
```bash
cd frontend
# or wherever your React app is located
```

### 3.2 Install Dependencies
```bash
npm install
```

### 3.3 Configure API URL
Update your frontend API configuration to use the server IP:

**Option A: Environment Variable (Recommended)**
Create `.env` file in frontend folder:
```env
REACT_APP_API_URL=http://192.168.1.100:3001/api
```

**Option B: Update API Service File**
Find your API service file (e.g., `src/services/api.js` or `src/services/contractsAPI.js`) and update:
```javascript
// Change from:
const API_BASE_URL = 'http://localhost:3001/api';

// To:
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://192.168.1.100:3001/api';
```

**Important:** Replace `192.168.1.100` with your actual server IP address!

### 3.4 Build Frontend
```bash
npm run build
```

This creates a `build` folder with production-ready files.

### 3.5 Serve Frontend

**Option A: Using Node.js serve (Simple)**
```bash
# Install serve globally
npm install -g serve

# Serve the build folder
serve -s build -l 3000
```

**Option B: Using Express (More Control)**
Create a simple server file `server.js`:
```javascript
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'build')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend running on http://0.0.0.0:${PORT}`);
  console.log(`Access from network: http://192.168.1.100:${PORT}`);
});
```

Then run:
```bash
node server.js
```

**Option C: Using Nginx (Production)**
Install Nginx and configure:
```nginx
server {
    listen 3000;
    server_name 192.168.1.100;
    
    root /path/to/frontend/build;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 🌐 STEP 4: Configure Firewall

### Windows Firewall
1. Open "Windows Defender Firewall"
2. Click "Advanced settings"
3. Click "Inbound Rules" → "New Rule"
4. Select "Port" → Next
5. Select "TCP" and enter ports: `3000, 3001`
6. Allow the connection
7. Apply to all profiles

### Linux Firewall (UFW)
```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
sudo ufw reload
```

---

## 📢 STEP 5: Share Network Addresses with Admins

Share these URLs with your admin team:

### Backend API
```
http://192.168.1.100:3001/api
```

### Frontend Application
```
http://192.168.1.100:3000
```

### Health Check
```
http://192.168.1.100:3001/health
```

**Replace `192.168.1.100` with your actual server IP!**

---

## ✅ STEP 6: Test Access

### From Server (Local)
- Backend: `http://localhost:3001/health`
- Frontend: `http://localhost:3000`

### From Other Computers (Network)
- Backend: `http://192.168.1.100:3001/health`
- Frontend: `http://192.168.1.100:3000`

**Test from admin's computer:**
1. Open browser
2. Go to: `http://192.168.1.100:3000`
3. Should see login page
4. Login with admin credentials

---

## 🔄 STEP 7: Keep Server Running (Optional)

### Option A: Using PM2 (Recommended)
```bash
# Install PM2 globally
npm install -g pm2

# Start backend
cd backend
pm2 start dist/server.js --name "onix-backend"

# Start frontend (if using Node.js server)
cd frontend
pm2 start server.js --name "onix-frontend"

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Option B: Using Windows Task Scheduler
1. Create a batch file `start-backend.bat`:
```batch
@echo off
cd C:\path\to\backend
npm start
```

2. Schedule it to run at startup

### Option C: Using systemd (Linux)
Create `/etc/systemd/system/onix-backend.service`:
```ini
[Unit]
Description=ONIX ERP Backend
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/backend
ExecStart=/usr/bin/node dist/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable onix-backend
sudo systemctl start onix-backend
```

---

## 🐛 Troubleshooting

### Cannot Access from Network
1. **Check Firewall:** Ensure ports 3000 and 3001 are open
2. **Check IP Address:** Verify server IP with `ipconfig` or `ifconfig`
3. **Check CORS:** Backend already configured for network access
4. **Check Server Status:** Ensure both backend and frontend are running

### Backend Not Starting
1. Check database connection in `.env`
2. Verify PostgreSQL is running
3. Check port 3001 is not in use: `netstat -ano | findstr :3001`

### Frontend Cannot Connect to Backend
1. Verify `REACT_APP_API_URL` in frontend `.env`
2. Check backend is running: `http://server-ip:3001/health`
3. Check browser console for errors

### Port Already in Use
```bash
# Windows - Find process
netstat -ano | findstr :3001

# Kill process (replace PID)
taskkill /PID <PID> /F

# Linux/Mac - Find process
lsof -i :3001

# Kill process
kill -9 <PID>
```

---

## 📝 Quick Reference

### Server IP Address
Find it with:
- Windows: `ipconfig`
- Linux/Mac: `ifconfig` or `ip addr`

### Backend URLs
- Local: `http://localhost:3001`
- Network: `http://SERVER_IP:3001`

### Frontend URLs
- Local: `http://localhost:3000`
- Network: `http://SERVER_IP:3000`

### Default Admin Credentials (After Seeding)
- Email: `admin@onixgroup.ae`
- Password: `admin123`
- Role: `ADMIN`

---

## ✅ Checklist

- [ ] Backend code copied to server
- [ ] Frontend code copied to server
- [ ] Backend dependencies installed (`npm install`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Database configured and migrated
- [ ] `.env` files configured with server IP
- [ ] Backend built (`npm run build`)
- [ ] Frontend built (`npm run build`)
- [ ] Backend running on port 3001
- [ ] Frontend running on port 3000
- [ ] Firewall configured (ports 3000, 3001 open)
- [ ] Server IP address noted
- [ ] Tested access from network
- [ ] Shared URLs with admin team

---

## 🎉 Success!

Once everything is set up, admins can access the ERP system at:
```
http://YOUR_SERVER_IP:3000
```

The backend API will be available at:
```
http://YOUR_SERVER_IP:3001/api
```

**Remember to replace `YOUR_SERVER_IP` with your actual server IP address!**
