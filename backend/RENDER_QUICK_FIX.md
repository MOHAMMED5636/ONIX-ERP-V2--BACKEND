# 🚨 Render Deployment - Quick Fix

## ❌ Current Error:
```
Build Command: npm
Error: npm <command> - invalid command
```

## ✅ Solution:

### **In Render Dashboard, Update Build Command:**

**Current (WRONG):**
```
npm
```

**Change to (CORRECT):**
```
npm install && npm run build && npx prisma generate
```

---

## 📋 Complete Render Configuration

### **1. Build Command:**
```bash
npm install && npm run build && npx prisma generate
```

### **2. Start Command:**
```bash
npm start
```

### **3. Root Directory (if needed):**
If your repo structure is:
```
ONIX-ERP-V2--BACKEND/
  └── backend/
      ├── src/
      ├── package.json
      └── ...
```

Set **Root Directory** to: `backend`

If structure is:
```
ONIX-ERP-V2--BACKEND/
  ├── src/
  ├── package.json
  └── ...
```

Leave **Root Directory** empty (or set to `/`)

---

## 🔧 Environment Variables (Required)

Add these in Render Dashboard → Environment:

### **Required:**
```env
DATABASE_URL=postgresql://user:password@host:5432/onix_erp
JWT_SECRET=your-strong-secret-key-here
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://your-frontend-url.onrender.com
```

### **How to Get DATABASE_URL:**
1. Create PostgreSQL database in Render
2. Go to database service
3. Copy "Internal Database URL"
4. Paste as `DATABASE_URL`

### **How to Generate JWT_SECRET:**
Run this locally:
```bash
openssl rand -base64 32
```
Or use any strong random string (at least 32 characters)

---

## ✅ Step-by-Step Fix

1. **Go to Render Dashboard**
2. **Click on your Web Service**
3. **Go to "Settings" tab**
4. **Scroll to "Build & Deploy"**
5. **Update Build Command:**
   ```
   npm install && npm run build && npx prisma generate
   ```
6. **Update Start Command:**
   ```
   npm start
   ```
7. **Check Root Directory:**
   - If `backend/` folder exists in repo → Set to `backend`
   - If files are at root → Leave empty
8. **Go to "Environment" tab**
9. **Add all environment variables** (see above)
10. **Click "Save Changes"**
11. **Go to "Manual Deploy" → "Deploy latest commit"**

---

## 🗄️ Database Setup

### **After First Deployment:**

1. **Go to your service → "Shell"**
2. **Run migrations:**
   ```bash
   npx prisma migrate deploy
   ```

**OR** add to build command:
```bash
npm install && npm run build && npx prisma generate && npx prisma migrate deploy
```

---

## 🧪 Test After Deployment

1. **Check Health:**
   ```
   https://your-service.onrender.com/health
   ```
   Should return: `{"status":"ok"}`

2. **Check API:**
   ```
   https://your-service.onrender.com/api/health
   ```

---

## 📝 Summary

**The Fix:**
- ❌ Build Command: `npm`
- ✅ Build Command: `npm install && npm run build && npx prisma generate`

**That's it!** Just update the build command in Render dashboard. 🚀


