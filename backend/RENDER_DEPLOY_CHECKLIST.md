# ✅ Render Deployment Checklist

## 📋 Before Starting

- [ ] GitHub repository is ready
- [ ] Backend code is pushed to GitHub
- [ ] Render account created

---

## 🗄️ Step 1: Create PostgreSQL Database

- [ ] Go to Render Dashboard
- [ ] Click "New +" → "PostgreSQL"
- [ ] Name: `onix-erp-db`
- [ ] Database: `onix_erp`
- [ ] User: `onix_user`
- [ ] Region: Oregon
- [ ] Plan: Free
- [ ] Click "Create Database"
- [ ] Wait for database to be ready
- [ ] Copy "Internal Database URL"
- [ ] ✅ Database URL saved

---

## 🌐 Step 2: Create Web Service

- [ ] Click "New +" → "Web Service"
- [ ] Connect GitHub account
- [ ] Select repository: `MOHAMMED5636/ONIX-ERP-V2--BACKEND`
- [ ] Click "Connect"

---

## ⚙️ Step 3: Configure Service

- [ ] Name: `onix-erp-backend`
- [ ] Region: Oregon (same as database)
- [ ] Branch: `main`
- [ ] Root Directory: `backend` ⚠️ IMPORTANT!
- [ ] Runtime: Node
- [ ] Build Command: `npm install && npx prisma generate && npm run build` ⚠️ IMPORTANT ORDER!
- [ ] Start Command: `npm start`
- [ ] Instance Type: Free

---

## 🔐 Step 4: Add Environment Variables

Click "Advanced" → Add Environment Variable for each:

- [ ] `DATABASE_URL` = `<paste-database-url-from-step-1>`
- [ ] `JWT_SECRET` = `<generate-random-secret-or-click-generate>`
- [ ] `JWT_EXPIRES_IN` = `7d`
- [ ] `NODE_ENV` = `production`
- [ ] `PORT` = `10000`
- [ ] `NPM_CONFIG_PRODUCTION` = `false` ⚠️ IMPORTANT!
- [ ] `FRONTEND_URL` = `https://your-frontend-url.vercel.app` (update after frontend deploy)

---

## 🚀 Step 5: Deploy

- [ ] Click "Create Web Service"
- [ ] Wait for build to complete
- [ ] Check build logs for errors
- [ ] Wait for "Your service is live"
- [ ] Copy backend URL: `https://onix-erp-backend.onrender.com`

---

## 🗄️ Step 6: Setup Database

- [ ] Go to service → "Shell" tab
- [ ] Run: `npx prisma migrate deploy`
- [ ] Wait for migrations to complete
- [ ] Run: `npm run db:seed` (optional - creates test users)
- [ ] ✅ Database ready

---

## ✅ Step 7: Verify

- [ ] Test: `https://onix-erp-backend.onrender.com/health`
- [ ] Should return: `{"status":"ok"}`
- [ ] Test: `https://onix-erp-backend.onrender.com/`
- [ ] Should show API information
- [ ] Check logs for any errors
- [ ] ✅ Backend deployed successfully!

---

## 📝 Important Notes

### **Build Command Order:**
✅ CORRECT: `npm install && npx prisma generate && npm run build`
❌ WRONG: `npm install && npm run build && npx prisma generate`

### **Root Directory:**
✅ Must be: `backend`
❌ NOT: `.` or empty

### **Environment Variables:**
✅ Must include: `NPM_CONFIG_PRODUCTION=false`
✅ Must include: `DATABASE_URL` (from PostgreSQL service)

---

## 🔗 After Deployment

- [ ] Copy backend URL
- [ ] Update frontend API URL to backend URL
- [ ] Deploy frontend to Vercel
- [ ] Update `FRONTEND_URL` in Render
- [ ] Test full application

---

**Your backend is now deployed on Render!** 🎉





