# 🔧 Fix Render Root Directory Error

## ❌ Current Error

```
==> Root directory "backend" does not exist.
builder.sh: line 51: cd: /opt/render/project/src/ backend: No such file or directory
```

---

## 🔍 Problem

Render is looking for a `backend` folder but can't find it. This happens when:
1. The repository structure is different
2. The backend code is in a different location
3. The root directory setting is wrong

---

## ✅ Solution Options

### **Option 1: Check Repository Structure**

Your repository might be structured as:
```
ONIX-ERP-V2--BACKEND/
├── backend/          ← Backend code here
├── src/             ← Or here?
└── ...
```

### **Option 2: Fix Root Directory Setting**

**In Render Dashboard:**

1. Go to your service: `ONIX-ERP-V2--BACKEND-1`
2. Click **"Settings"** tab (left sidebar)
3. Scroll to **"Root Directory"**
4. Try one of these:

   **If backend folder exists:**
   ```
   backend
   ```

   **If backend is at root:**
   ```
   .  (just a dot)
   ```
   OR leave it **empty**

   **If backend is in src:**
   ```
   src/backend
   ```

---

## 🔍 How to Check Your Repository Structure

1. **Go to GitHub:**
   - https://github.com/MOHAMMED5636/ONIX-ERP-V2--BACKEND
   - Check the folder structure

2. **Look for:**
   - Is there a `backend/` folder?
   - Is the code at the root?
   - Is it in `src/backend/`?

---

## ✅ Quick Fix Steps

### **Step 1: Check GitHub Repository**

Go to: https://github.com/MOHAMMED5636/ONIX-ERP-V2--BACKEND

**Check the structure:**
- If you see `backend/` folder → Use `backend` as root directory
- If code is at root → Leave root directory **empty** or use `.`
- If code is in `src/` → Use `src` as root directory

### **Step 2: Update Root Directory in Render**

1. Go to service → **"Settings"**
2. Find **"Root Directory"**
3. Update based on your structure:
   - **Has `backend/` folder:** `backend`
   - **Code at root:** Leave empty or `.`
   - **Code in `src/`:** `src`
4. Click **"Save Changes"**
5. Click **"Manual Deploy"** → **"Deploy latest commit"**

---

## 🎯 Most Likely Fix

**If your repository structure is:**
```
ONIX-ERP-V2--BACKEND/
├── backend/
│   ├── src/
│   ├── package.json
│   └── ...
```

**Then Root Directory should be:** `backend`

**If your repository structure is:**
```
ONIX-ERP-V2--BACKEND/
├── src/
├── package.json
└── ...
```

**Then Root Directory should be:** Empty or `.`

---

## 📋 After Fixing

1. Update Root Directory in Settings
2. Save Changes
3. Manual Deploy → Deploy latest commit
4. Watch logs - should see successful build

---

**Check your GitHub repository structure first, then update the Root Directory setting accordingly!** 🔍

