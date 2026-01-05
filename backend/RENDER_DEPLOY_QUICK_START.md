# ⚡ Render Backend Deployment - Quick Start

## 🎯 5-Minute Deployment Guide

### **Step 1: Create PostgreSQL Database** (2 min)

1. Go to: https://dashboard.render.com
2. Click **"+ New"** → **"Postgres"**
3. Fill in:
   ```
   Name: onix-erp-db
   Database: onix_erp
   User: onix_user
   Region: Oregon
   Plan: Free
   ```
4. Click **"Create Database"**
5. **Copy "Internal Database URL"** (save it!)

---

### **Step 2: Create Web Service** (3 min)

1. Click **"+ New"** → **"Web Service"**
2. Connect GitHub → Select: `MOHAMMED5636/ONIX-ERP-V2--BACKEND`
3. Configure:
   ```
   Name: onix-erp-backend
   Region: Oregon
   Branch: main
   Root Directory: backend  ⚠️
   Build Command: npm install && npx prisma generate && npm run build  ⚠️
   Start Command: npm start
   ```
4. Click **"Advanced"** → Add Environment Variables:
   ```
   DATABASE_URL = <paste-database-url>
   JWT_SECRET = <click-generate>
   JWT_EXPIRES_IN = 7d
   NODE_ENV = production
   PORT = 10000
   NPM_CONFIG_PRODUCTION = false  ⚠️
   ```
5. Click **"Create Web Service"**
6. Wait for deployment ✅

---

### **Step 3: Run Migrations** (1 min)

1. Go to service → **"Shell"** tab
2. Run:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```

---

### **Step 4: Test** (1 min)

Open: `https://onix-erp-backend.onrender.com/health`

Should see: `{"status":"ok"}` ✅

---

## ✅ Done!

**Your backend URL:** `https://onix-erp-backend.onrender.com`

**Use this in frontend:**
```
REACT_APP_API_URL=https://onix-erp-backend.onrender.com/api
```

---

## 🔧 Important Settings

| Setting | Value |
|---------|-------|
| Root Directory | `backend` |
| Build Command | `npm install && npx prisma generate && npm run build` |
| Start Command | `npm start` |
| NPM_CONFIG_PRODUCTION | `false` |

---

**That's it! Your backend is deployed!** 🚀

