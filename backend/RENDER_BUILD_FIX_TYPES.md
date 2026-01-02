# 🔧 Render Build Fix - Missing Type Definitions

## 🐛 The Problem

Render build is failing with:
```
error TS7016: Could not find a declaration file for module 'express'
error TS7016: Could not find a declaration file for module 'nodemailer'
```

**Even though** `@types/express` and `@types/nodemailer` are in `package.json`!

---

## ✅ The Solution

The issue is that Render might not be installing `devDependencies` properly, or the build command needs to ensure they're installed.

---

## 🔧 Fix Options

### **Option 1: Ensure devDependencies are installed (Recommended)**

Update your Render build command to explicitly install all dependencies:

**In Render Dashboard → Settings → Build Command:**
```bash
npm install && npm run build && npx prisma generate
```

This ensures both `dependencies` and `devDependencies` are installed.

---

### **Option 2: Move type definitions to dependencies (Not Recommended)**

Move `@types/*` packages from `devDependencies` to `dependencies`:

```json
"dependencies": {
  "@types/express": "^4.17.21",
  "@types/nodemailer": "^6.4.14",
  // ... other dependencies
}
```

**Note:** This increases production bundle size unnecessarily.

---

### **Option 3: Use NODE_ENV=production flag**

Ensure devDependencies are installed by setting NODE_ENV:

**In Render Dashboard → Settings → Environment Variables:**
```
NODE_ENV=development
```

Or in build command:
```bash
NODE_ENV=development npm install && npm run build && npx prisma generate
```

---

## 🚀 Recommended Fix

### **Step 1: Update Render Build Command**

1. Go to Render Dashboard
2. Navigate to your service: **ONIX-ERP-V2--BACKEND-1**
3. Go to **Settings** tab
4. Find **Build Command** field
5. Update to:
   ```bash
   npm install && npm run build && npx prisma generate
   ```

### **Step 2: Verify Environment Variables**

Make sure these are set in Render:
- `NODE_ENV` = `production` (or `development` if you need devDependencies)
- `DATABASE_URL` = Your PostgreSQL connection string
- `JWT_SECRET` = Your JWT secret
- `FRONTEND_URL` = Your frontend URL

### **Step 3: Redeploy**

1. Click **Manual Deploy** → **Deploy latest commit**
2. Wait for build to complete
3. Check logs for success

---

## 📝 Alternative: Update package.json

If the above doesn't work, you can ensure types are always installed by adding them to a postinstall script:

```json
{
  "scripts": {
    "postinstall": "npm install --production=false",
    "build": "tsc",
    // ... other scripts
  }
}
```

---

## 🔍 Verify package.json

Your `package.json` already has the correct type definitions:

```json
"devDependencies": {
  "@types/express": "^4.17.21",
  "@types/nodemailer": "^6.4.14",
  // ... other types
}
```

The issue is likely that Render isn't installing `devDependencies` during build.

---

## ✅ Expected Result

After fixing:
- ✅ Build completes successfully
- ✅ TypeScript compilation passes
- ✅ No type definition errors
- ✅ Service deploys successfully

---

## 🐛 If Still Failing

1. **Check Render logs** for exact error
2. **Verify** `node_modules` contains `@types/express` and `@types/nodemailer`
3. **Try** moving types to `dependencies` temporarily
4. **Check** if there's a `.npmrc` file affecting install

---

**The fix is to ensure devDependencies are installed during Render's build process!** 🔧

