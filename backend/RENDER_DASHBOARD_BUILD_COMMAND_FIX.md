# 🚨 URGENT: Fix Render Build Command in Dashboard

## ❌ Current Problem

Render is using the **OLD build command** that runs TypeScript BEFORE Prisma Client:

```
npm install && npm run build && npx prisma generate
```

This causes TypeScript errors because Prisma types don't exist yet.

---

## ✅ Solution: Update Build Command in Render Dashboard

**You need to update the build command directly in Render Dashboard** because Render might be using dashboard settings instead of `render.yaml`.

### **Step-by-Step Instructions:**

1. **Go to Render Dashboard:**
   - Navigate to: https://dashboard.render.com
   - Click on your service: **"ONIX-ERP-V2--BACKEND-1"**

2. **Go to Settings:**
   - Click **"Settings"** in the left sidebar

3. **Find "Build Command" Section:**
   - Scroll down to find the **"Build Command"** field

4. **Update Build Command:**
   - **DELETE** the current command:
     ```
     npm install && npm run build && npx prisma generate
     ```
   
   - **REPLACE** with this (correct order):
     ```
     npm install && npx prisma generate && npm run build
     ```

5. **Save Changes:**
   - Click **"Save Changes"** button

6. **Trigger New Deploy:**
   - Go to **"Events"** tab
   - Click **"Manual Deploy"** → **"Deploy latest commit"**
   - OR push a new commit to trigger automatic deploy

---

## ✅ Correct Build Command

```bash
npm install && npx prisma generate && npm run build
```

**Why this order?**
1. `npm install` - Install dependencies
2. `npx prisma generate` - Generate Prisma Client types (so TypeScript can see them)
3. `npm run build` - Build TypeScript (now it can see Prisma types)

---

## 🔍 Verify Build Command

After updating, check the build logs. You should see:

```
==> Running build command 'npm install && npx prisma generate && npm run build'...
```

**NOT:**
```
==> Running build command 'npm install && npm run build && npx prisma generate'...
```

---

## 📋 Alternative: Update via render.yaml

If you want to use `render.yaml`, make sure it's committed and pushed:

```yaml
buildCommand: npm install && npx prisma generate && npm run build
```

Then Render should pick it up on the next deploy.

---

## ✅ Expected Build Logs (After Fix)

You should see:
1. ✅ `npm install` - Installing dependencies
2. ✅ `npx prisma generate` - Generating Prisma Client
3. ✅ `npm run build` - Building TypeScript (no errors!)
4. ✅ `Build succeeded`

---

## 🚨 Important Notes

- **Render Dashboard settings override `render.yaml`** in some cases
- **Always update both** to be safe:
  1. Update in Render Dashboard (Settings → Build Command)
  2. Update `render.yaml` and push to GitHub

---

**Update the build command in Render Dashboard NOW to fix the build!** 🚀

