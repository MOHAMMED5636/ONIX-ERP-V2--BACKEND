# 🚀 Deploy Backend to Render - Step by Step Guide

Complete guide to deploy your ONIX ERP backend to Render.com

---

## 📋 Prerequisites

- ✅ GitHub account
- ✅ Backend code pushed to GitHub
- ✅ Render.com account (free signup)

---

## 🎯 Step 1: Create Render Account

1. **Go to Render:**
   - https://dashboard.render.com
   - Click "Get Started for Free"
   - Sign up with GitHub (recommended)

---

## 🗄️ Step 2: Create PostgreSQL Database (First)

**Important:** Create database FIRST before creating web service!

1. **In Render Dashboard:**
   - Click "New +" button (top right)
   - Select "PostgreSQL"

2. **Configure Database:**
   ```
   Name: onix-erp-db
   Database: onix_erp
   User: onix_user
   Region: Oregon (or closest to you)
   PostgreSQL Version: Latest
   Plan: Free
   ```

3. **Click "Create Database"**

4. **Copy Database URL:**
   - Wait for database to be created
   - Click on the database service
   - Go to "Connections" tab
   - Copy "Internal Database URL"
   - **Save this URL** - you'll need it!

   Example: `postgresql://onix_user:password@dpg-xxxxx.onrender.com/onix_erp`

---

## 🌐 Step 3: Create Web Service (Backend)

1. **In Render Dashboard:**
   - Click "New +" button
   - Select "Web Service"

2. **Connect Repository:**
   - Click "Connect account" (if not connected)
   - Authorize Render to access GitHub
   - Select repository: `MOHAMMED5636/ONIX-ERP-V2--BACKEND`
   - Click "Connect"

3. **Configure Service:**
   ```
   Name: onix-erp-backend
   Region: Oregon (same as database)
   Branch: main
   Root Directory: backend
   Runtime: Node
   Build Command: npm install && npx prisma generate && npm run build
   Start Command: npm start
   Instance Type: Free
   ```

4. **Click "Advanced" → Add Environment Variables:**

   Click "Add Environment Variable" for each:

   ```
   Key: DATABASE_URL
   Value: <paste-the-database-url-from-step-2>
   
   Key: JWT_SECRET
   Value: <generate-random-secret-key-min-32-characters>
   (Or click "Generate" button)
   
   Key: JWT_EXPIRES_IN
   Value: 7d
   
   Key: NODE_ENV
   Value: production
   
   Key: PORT
   Value: 10000
   
   Key: NPM_CONFIG_PRODUCTION
   Value: false
   
   Key: FRONTEND_URL
   Value: https://your-frontend-url.vercel.app
   (Update this after deploying frontend)
   ```

5. **Click "Create Web Service"**

---

## ⏳ Step 4: Wait for Deployment

1. **Render will automatically:**
   - Clone your repository
   - Install dependencies
   - Generate Prisma Client
   - Build TypeScript
   - Start the server

2. **Watch the logs:**
   - You'll see build progress
   - Wait for "Build successful"
   - Wait for "Your service is live"

3. **Get your backend URL:**
   - Example: `https://onix-erp-backend.onrender.com`
   - Copy this URL!

---

## 🔧 Step 5: Run Database Migrations

After deployment, you need to run database migrations:

1. **In Render Dashboard:**
   - Go to your web service
   - Click "Shell" tab (or "Manual Deploy" → "Run Command")

2. **Run Migration Command:**
   ```bash
   npx prisma migrate deploy
   ```

   OR use Render's "Shell" feature:
   - Click "Shell" tab
   - Run: `npx prisma migrate deploy`

3. **Seed Database (Optional):**
   ```bash
   npm run db:seed
   ```

---

## ✅ Step 6: Verify Deployment

1. **Test Health Endpoint:**
   - Open: `https://onix-erp-backend.onrender.com/health`
   - Should see: `{"status":"ok","timestamp":"..."}`

2. **Test API Root:**
   - Open: `https://onix-erp-backend.onrender.com/`
   - Should see API information

3. **Test Login (using curl or Postman):**
   ```bash
   curl -X POST https://onix-erp-backend.onrender.com/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "admin@onixgroup.ae",
       "password": "admin123",
       "role": "ADMIN"
     }'
   ```

---

## 🔍 Troubleshooting

### **Build Fails - TypeScript Errors:**

**Problem:** `Property 'photo' does not exist...`

**Solution:** Make sure build command is:
```
npm install && npx prisma generate && npm run build
```

**NOT:**
```
npm install && npm run build && npx prisma generate
```

### **Database Connection Error:**

**Problem:** `Can't reach database server`

**Solution:**
1. Check DATABASE_URL is correct
2. Use "Internal Database URL" (not external)
3. Make sure database is in same region

### **Port Error:**

**Problem:** `Port already in use`

**Solution:**
- Render uses port 10000 automatically
- Make sure PORT=10000 in environment variables
- Or remove PORT variable (Render sets it automatically)

### **Prisma Client Not Generated:**

**Problem:** `Cannot find module '@prisma/client'`

**Solution:**
- Make sure build command includes: `npx prisma generate`
- Check NPM_CONFIG_PRODUCTION=false is set

---

## 📝 Render Dashboard Settings Summary

### **Service Settings:**
```
Name: onix-erp-backend
Region: Oregon
Branch: main
Root Directory: backend
Build Command: npm install && npx prisma generate && npm run build
Start Command: npm start
```

### **Environment Variables:**
```
DATABASE_URL=<from-postgresql-service>
JWT_SECRET=<generate-random-secret>
JWT_EXPIRES_IN=7d
NODE_ENV=production
PORT=10000
NPM_CONFIG_PRODUCTION=false
FRONTEND_URL=https://your-frontend-url.vercel.app
```

---

## 🎯 Quick Checklist

- [ ] Render account created
- [ ] PostgreSQL database created
- [ ] Database URL copied
- [ ] Web service created
- [ ] Repository connected
- [ ] Root directory set to `backend`
- [ ] Build command: `npm install && npx prisma generate && npm run build`
- [ ] Start command: `npm start`
- [ ] All environment variables added
- [ ] Service deployed successfully
- [ ] Database migrations run (`npx prisma migrate deploy`)
- [ ] Database seeded (`npm run db:seed`)
- [ ] Health check working (`/health` endpoint)
- [ ] Backend URL copied for frontend configuration

---

## 🔗 After Deployment

**Your backend will be available at:**
```
https://onix-erp-backend.onrender.com
```

**API Endpoints:**
- Health: `https://onix-erp-backend.onrender.com/health`
- API Root: `https://onix-erp-backend.onrender.com/`
- Login: `https://onix-erp-backend.onrender.com/api/auth/login`

**Update Frontend:**
- Set `REACT_APP_API_URL=https://onix-erp-backend.onrender.com/api`
- Deploy frontend to Vercel
- Update `FRONTEND_URL` in Render to your Vercel URL

---

## 📸 Visual Guide

### **Step 1: New PostgreSQL**
```
Render Dashboard → New + → PostgreSQL
```

### **Step 2: New Web Service**
```
Render Dashboard → New + → Web Service
```

### **Step 3: Connect Repository**
```
Select: MOHAMMED5636/ONIX-ERP-V2--BACKEND
Root Directory: backend
```

### **Step 4: Configure Build**
```
Build Command: npm install && npx prisma generate && npm run build
Start Command: npm start
```

### **Step 5: Add Environment Variables**
```
Click "Advanced" → Add each variable
```

---

## ✅ Success Indicators

You'll know it's working when:
- ✅ Build logs show "Build successful"
- ✅ Service status shows "Live"
- ✅ Health endpoint returns `{"status":"ok"}`
- ✅ Login endpoint works
- ✅ No errors in logs

---

**Follow these steps to deploy your backend to Render!** 🚀

