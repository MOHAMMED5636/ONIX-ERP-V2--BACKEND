# Render "New Web Service" Form - Complete Fill Guide

## 📋 Field-by-Field Instructions

### ✅ **1. Source Code**
**Current:** `MOHAMMED5636 / ONIX-ERP-V2-BACKEND` ✅
- **Action:** Leave as is (already connected)
- If wrong, click "Edit" to connect correct repository

---

### ✅ **2. Name**
**Current:** `ONIX-EHP-V2-BACKEND-1`
**Recommended:** `onix-erp-backend` or `onix-erp-api`
- **Action:** Change to a cleaner name (optional but recommended)
- Must be unique across your Render account

---

### ⚠️ **3. Project (Optional)**
**Current:** "Select a project..."
- **Action:** Leave empty (or create a project to organize services)
- This is optional

---

### ✅ **4. Language**
**Current:** `Node` ✅
- **Action:** Leave as is (correct)

---

### ✅ **5. Branch**
**Current:** `main` ✅
- **Action:** Leave as is (or change if using different branch)

---

### ✅ **6. Region**
**Current:** `Virginia (US East)` ✅
- **Action:** Leave as is (or choose closest to your users)

---

### ⚠️ **7. Root Directory (Optional)**
**Current:** Empty
**IMPORTANT:** Check your repository structure!

**If your repo structure is:**
```
ONIX-ERP-V2-BACKEND/
  └── backend/
      ├── src/
      ├── package.json
      ├── prisma/
      └── ...
```
**Then set to:** `backend`

**If your repo structure is:**
```
ONIX-ERP-V2-BACKEND/
  ├── src/
  ├── package.json
  ├── prisma/
  └── ...
```
**Then leave:** Empty (or `/`)

**Action:** Check your GitHub repo structure and set accordingly

---

### 🚨 **8. Build Command** (CRITICAL!)
**Current:** `yarn` ❌ (WRONG!)

**Change to:**
```bash
npm install && npm run build && npx prisma generate
```

**OR (if you want to run migrations automatically):**
```bash
npm install && npm run build && npx prisma generate && npx prisma migrate deploy
```

**Action:** Replace `yarn` with the npm command above

---

### ✅ **9. Start Command**
**Current:** (Probably empty or default)

**Set to:**
```bash
npm start
```

**Action:** Add this command

---

## 📝 Complete Configuration Summary

| Field | Value |
|-------|-------|
| **Source Code** | `MOHAMMED5636 / ONIX-ERP-V2-BACKEND` ✅ |
| **Name** | `onix-erp-backend` (or keep current) |
| **Project** | (Leave empty - optional) |
| **Language** | `Node` ✅ |
| **Branch** | `main` ✅ |
| **Region** | `Virginia (US East)` ✅ |
| **Root Directory** | `backend` (if backend folder exists) OR empty |
| **Build Command** | `npm install && npm run build && npx prisma generate` ⚠️ |
| **Start Command** | `npm start` ⚠️ |

---

## 🔧 After Creating Service - Add Environment Variables

Go to **Environment** tab and add:

### **Required Variables:**

```env
DATABASE_URL=postgresql://user:password@host:5432/onix_erp
```

**How to get:**
1. Create PostgreSQL database in Render first
2. Go to database → Copy "Internal Database URL"
3. Paste here

```env
JWT_SECRET=your-strong-secret-key-here
```

**Generate one:**
```bash
openssl rand -base64 32
```

```env
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://your-frontend-url.onrender.com
```

### **Optional Variables:**
```env
JWT_EXPIRES_IN=7d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

---

## ✅ Step-by-Step Checklist

- [ ] Source Code: Connected ✅
- [ ] Name: Set to `onix-erp-backend`
- [ ] Language: `Node` ✅
- [ ] Branch: `main` ✅
- [ ] Region: `Virginia` ✅
- [ ] **Root Directory: Check repo structure and set correctly**
- [ ] **Build Command: `npm install && npm run build && npx prisma generate`**
- [ ] **Start Command: `npm start`**
- [ ] Click "Create Web Service"
- [ ] Wait for build to start
- [ ] Go to "Environment" tab
- [ ] Add `DATABASE_URL` (from PostgreSQL)
- [ ] Add `JWT_SECRET` (generate strong key)
- [ ] Add `NODE_ENV=production`
- [ ] Add `PORT=10000`
- [ ] Add `FRONTEND_URL`
- [ ] Save changes
- [ ] Service will auto-redeploy

---

## 🗄️ Before Deploying - Create Database First!

1. **Go to Render Dashboard**
2. **Click "New +" → "PostgreSQL"**
3. **Configure:**
   - Name: `onix-erp-db`
   - Database: `onix_erp`
   - Plan: Free (or paid)
4. **Click "Create Database"**
5. **Copy "Internal Database URL"**
6. **Use it as `DATABASE_URL` in web service**

---

## 🚨 Most Important Fields

1. **Build Command** - Must be: `npm install && npm run build && npx prisma generate`
2. **Start Command** - Must be: `npm start`
3. **Root Directory** - Check your repo structure!
4. **DATABASE_URL** - Add after creating service

---

**Fill these correctly and your deployment will work!** 🚀


