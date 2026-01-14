# 🔧 Render Deployment Failed - Fix Guide

## 🐛 Issue: "Exited with status 2 while building your code"

Your Render deployment failed. Here's how to fix it:

---

## 🔍 Check Render Logs

1. **Go to Render Dashboard**
2. **Click on your service:** `ONIX-ERP-V2--BACKEND-1`
3. **Go to "Logs" tab**
4. **Look for the error** in the build logs

Common errors:
- TypeScript compilation errors
- Missing dependencies
- Build command issues
- Database connection errors

---

## ✅ Quick Fixes

### **Fix 1: Check Build Command**

In Render Dashboard → Settings → Build Command should be:
```bash
npm ci || npm install && npm run build && npx prisma generate
```

### **Fix 2: Verify Root Directory**

In Render Dashboard → Settings → Root Directory should be:
```
backend
```

### **Fix 3: Check Environment Variables**

Make sure these are set in Render Dashboard → Environment:
- `NODE_ENV` = `production`
- `NPM_CONFIG_PRODUCTION` = `false`
- `PORT` = `10000`
- `DATABASE_URL` = `[Your PostgreSQL connection string]`
- `JWT_SECRET` = `[Generated or set manually]`

---

## 🔧 Common Build Errors & Fixes

### **Error 1: TypeScript Errors**

**Symptoms:**
```
error TS7016: Could not find a declaration file for module 'express'
```

**Fix:**
- Ensure `NPM_CONFIG_PRODUCTION=false` is set
- This ensures `devDependencies` (TypeScript types) are installed

### **Error 2: Missing Prisma Client**

**Symptoms:**
```
Cannot find module '@prisma/client'
```

**Fix:**
- Build command should include: `npx prisma generate`
- Verify it's in your build command

### **Error 3: Build Command Failed**

**Symptoms:**
```
npm ci failed
```

**Fix:**
- Use: `npm install && npm run build && npx prisma generate`
- Or: `npm ci || npm install && npm run build && npx prisma generate`

### **Error 4: Root Directory Wrong**

**Symptoms:**
```
Cannot find package.json
```

**Fix:**
- Set Root Directory to: `backend`
- Not empty, not root

---

## 🚀 Recommended Build Command

```bash
npm install && npm run build && npx prisma generate
```

Or with fallback:
```bash
npm ci || npm install && npm run build && npx prisma generate
```

---

## 📝 Step-by-Step Fix

### **Step 1: Check Render Logs**
1. Go to Render Dashboard
2. Click your service
3. Go to "Logs" tab
4. Scroll to the error
5. Copy the error message

### **Step 2: Update Settings**
1. Go to "Settings" tab
2. Verify:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npm run build && npx prisma generate`
   - **Start Command:** `npm start`

### **Step 3: Check Environment Variables**
1. Go to "Environment" tab
2. Verify all required variables are set
3. Add `NPM_CONFIG_PRODUCTION` = `false` if missing

### **Step 4: Manual Deploy**
1. Click "Manual Deploy"
2. Select "Deploy latest commit"
3. Wait for build to complete
4. Check logs for errors

---

## 🔍 Verify Local Build Works

Before deploying, test locally:

```bash
cd backend
npm install
npm run build
npx prisma generate
npm start
```

If this works locally, the issue is likely in Render configuration.

---

## ✅ Expected Render Configuration

| Setting | Value |
|---------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npm run build && npx prisma generate` |
| **Start Command** | `npm start` |
| **Environment** | `Node` |
| **Region** | `Oregon` (or your choice) |

---

## 🐛 If Still Failing

1. **Check Render Logs** - Look for specific error
2. **Verify Git Push** - Make sure all changes are pushed
3. **Try Manual Deploy** - Deploy latest commit manually
4. **Check Build Logs** - Look for TypeScript or npm errors

---

**Check the Render logs first to see the exact error, then we can fix it!** 🔍





