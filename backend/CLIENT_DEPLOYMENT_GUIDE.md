# 🌐 Client Deployment Guide - Show Application to Client

Complete guide to deploy ONIX ERP so your client can access and test it.

---

## 🎯 Goal

Deploy the application so your client can:
- ✅ Access it from anywhere (via internet)
- ✅ Test all features
- ✅ Give feedback
- ✅ Review the application

---

## 🚀 Option 1: Deploy to Render (Recommended - Free)

### **Backend Deployment:**

1. **Go to Render Dashboard:**
   - https://dashboard.render.com
   - Sign up/Login

2. **Create New Web Service:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository: `MOHAMMED5636/ONIX-ERP-V2--BACKEND`

3. **Configure Settings:**
   ```
   Name: onix-erp-backend
   Environment: Node
   Region: Oregon (or closest)
   Branch: main
   Root Directory: backend
   Build Command: npm install && npx prisma generate && npm run build
   Start Command: npm start
   ```

4. **Add Environment Variables:**
   ```
   DATABASE_URL=<your-postgresql-url>
   JWT_SECRET=<generate-random-secret>
   JWT_EXPIRES_IN=7d
   NODE_ENV=production
   PORT=10000
   FRONTEND_URL=https://your-frontend-url.vercel.app
   ```

5. **Create PostgreSQL Database:**
   - In Render Dashboard → "New +" → "PostgreSQL"
   - Copy the "Internal Database URL"
   - Use it as DATABASE_URL

6. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment
   - Get your backend URL: `https://onix-erp-backend.onrender.com`

### **Frontend Deployment (Vercel):**

1. **Go to Vercel:**
   - https://vercel.com
   - Sign up/Login with GitHub

2. **Import Project:**
   - Click "Add New" → "Project"
   - Import your frontend repository

3. **Configure:**
   ```
   Framework Preset: Create React App
   Root Directory: (leave default)
   Build Command: npm run build
   Output Directory: build
   ```

4. **Add Environment Variables:**
   ```
   REACT_APP_API_URL=https://onix-erp-backend.onrender.com/api
   ```

5. **Deploy:**
   - Click "Deploy"
   - Get your frontend URL: `https://your-app.vercel.app`

6. **Update Backend CORS:**
   - In Render, update `FRONTEND_URL` to your Vercel URL
   - Redeploy backend

---

## 🌐 Option 2: Deploy to Railway (Alternative - Free)

### **Backend:**

1. **Go to Railway:**
   - https://railway.app
   - Sign up with GitHub

2. **New Project:**
   - Click "New Project"
   - "Deploy from GitHub repo"
   - Select your backend repository

3. **Configure:**
   - Add PostgreSQL database
   - Set environment variables
   - Deploy

### **Frontend:**

1. **Same process:**
   - Deploy frontend repository
   - Set environment variables
   - Deploy

---

## 💻 Option 3: Use ngrok (Quick Testing - Free)

**For quick client testing without deployment:**

### **Setup ngrok:**

1. **Download ngrok:**
   - https://ngrok.com/download
   - Extract to a folder

2. **Start Backend:**
   ```bash
   cd backend
   npm run dev
   ```

3. **Start Frontend:**
   ```bash
   cd ERP-FRONTEND/ONIX-ERP-V2
   npm start
   ```

4. **Create ngrok Tunnel:**
   ```bash
   # For frontend (port 3000)
   ngrok http 3000
   
   # You'll get a URL like: https://abc123.ngrok.io
   ```

5. **Share URL with Client:**
   - Give client: `https://abc123.ngrok.io`
   - They can access your local application

**Note:** Free ngrok URLs change every time you restart. For permanent URL, upgrade to paid plan.

---

## 🖥️ Option 4: Deploy to VPS/Server

### **Requirements:**
- VPS (DigitalOcean, AWS EC2, etc.)
- Domain name (optional)
- SSH access

### **Steps:**

1. **Setup Server:**
   ```bash
   # Install Node.js
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   
   # Install PostgreSQL
   sudo apt-get install postgresql postgresql-contrib
   
   # Install PM2 (process manager)
   npm install -g pm2
   ```

2. **Clone Repository:**
   ```bash
   git clone https://github.com/MOHAMMED5636/ONIX-ERP-V2--BACKEND.git
   cd ONIX-ERP-V2--BACKEND/backend
   ```

3. **Setup Environment:**
   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your database credentials
   ```

4. **Setup Database:**
   ```bash
   npx prisma generate
   npx prisma migrate deploy
   npm run db:seed
   ```

5. **Start Backend:**
   ```bash
   npm run build
   pm2 start dist/server.js --name onix-backend
   pm2 save
   ```

6. **Setup Nginx (Reverse Proxy):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location /api {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## ✅ Recommended: Render + Vercel (Easiest)

### **Quick Steps:**

1. **Backend on Render:**
   - ✅ Free PostgreSQL database included
   - ✅ Automatic deployments from GitHub
   - ✅ HTTPS enabled
   - ✅ URL: `https://onix-erp-backend.onrender.com`

2. **Frontend on Vercel:**
   - ✅ Free hosting
   - ✅ Automatic deployments
   - ✅ HTTPS enabled
   - ✅ URL: `https://your-app.vercel.app`

3. **Share with Client:**
   - Give them frontend URL: `https://your-app.vercel.app`
   - They can access and test immediately

---

## 📋 Pre-Deployment Checklist

### **Backend:**
- [ ] Fix Render build command (generate Prisma before build)
- [ ] Set all environment variables
- [ ] Database migrations run successfully
- [ ] Seed database with test users
- [ ] CORS configured for frontend URL
- [ ] Health check endpoint working

### **Frontend:**
- [ ] API URL points to deployed backend
- [ ] Environment variables set
- [ ] Build succeeds without errors
- [ ] All routes working

---

## 🔐 Default Test Credentials for Client

**Create a document with these credentials:**

```
ONIX ERP - Test Credentials

Admin Account:
Email: admin@onixgroup.ae
Password: admin123
Role: ADMIN

Tender Engineer:
Email: anas.ali@onixgroup.ae
Password: anas@123
Role: TENDER_ENGINEER

Test URL: https://your-app.vercel.app
```

---

## 🎯 Quick Deploy Script

Create `deploy-client.bat`:

```batch
@echo off
echo ========================================
echo   Deploying ONIX ERP for Client Review
echo ========================================
echo.

echo [1/3] Pushing to GitHub...
git add .
git commit -m "Deploy for client review"
git push origin main

echo.
echo [2/3] Backend will auto-deploy on Render
echo        Check: https://dashboard.render.com

echo.
echo [3/3] Frontend will auto-deploy on Vercel
echo        Check: https://vercel.com

echo.
echo ========================================
echo   Deployment initiated!
echo   Share frontend URL with client
echo ========================================
pause
```

---

## 📝 Client Access Instructions

**Create a document to share with client:**

```
ONIX ERP - Client Review Access

Access URL: https://your-app.vercel.app

Test Credentials:
- Admin: admin@onixgroup.ae / admin123
- Engineer: anas.ali@onixgroup.ae / anas@123

Features to Test:
1. Login/Logout
2. Dashboard
3. Employee Management
4. Profile Management
5. Tender Management

Feedback Form: [Your email or form link]
```

---

## 🚀 Fastest Option: Render + Vercel

**Time: 15-20 minutes**

1. **Backend (Render):**
   - Connect GitHub repo
   - Add PostgreSQL database
   - Set environment variables
   - Deploy

2. **Frontend (Vercel):**
   - Connect GitHub repo
   - Set API URL environment variable
   - Deploy

3. **Share URL:**
   - Give client: `https://your-app.vercel.app`
   - Done!

---

## 📞 Support

If client has issues:
- Check Render logs for backend errors
- Check Vercel logs for frontend errors
- Verify environment variables are set
- Test health endpoint: `https://backend-url/health`

---

**Choose Render + Vercel for the fastest deployment!** 🚀



