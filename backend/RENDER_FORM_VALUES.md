# 📝 Render "New Web Service" Form - What to Add

## ✅ Complete Form Values

Fill out the Render "New Web Service" form with these values:

---

## 📋 Form Fields

### **1. Source Code**
- ✅ **Repository:** `MOHAMMED5636 / ONIX-ERP-V2-BACKEND`
- ✅ **Branch:** `main`

### **2. Name**
- ✅ **Value:** `ONIX-ERP-V2-BACKEND-1` (or any name you prefer)

### **3. Project (Optional)**
- Leave empty or select your project

### **4. Language**
- ✅ **Value:** `Node`

### **5. Region**
- ✅ **Value:** `Virginia (US East)` (or your preferred region)

### **6. Root Directory** ⚠️ **IMPORTANT**
- ✅ **Value:** `backend`
- **Why:** Your backend code is in the `backend` folder, not the root

### **7. Build Command** ⚠️ **IMPORTANT**
- ✅ **Value:** `npm install && npm run build && npx prisma generate`
- **NOT:** `yarn` (you're using npm, not yarn)

### **8. Start Command** ⚠️ **IMPORTANT**
- ✅ **Value:** `npm start`
- **NOT:** `yarn start` (you're using npm, not yarn)

### **9. Environment Variables** (Add these in Settings after creation)

Click **"Advanced"** or go to **Settings** after creating the service and add:

| Key | Value | Required |
|-----|-------|----------|
| `NODE_ENV` | `production` | ✅ Yes |
| `PORT` | `10000` | ✅ Yes |
| `DATABASE_URL` | `[Your PostgreSQL connection string]` | ✅ Yes |
| `JWT_SECRET` | `[Generate a secure random string]` | ✅ Yes |
| `JWT_EXPIRES_IN` | `7d` | Optional |
| `FRONTEND_URL` | `http://localhost:3000` (or your frontend URL) | Optional |
| `NPM_CONFIG_PRODUCTION` | `false` | ✅ Yes (for TypeScript build) |

---

## 📝 Step-by-Step

### **Step 1: Basic Settings**
1. **Name:** `ONIX-ERP-V2-BACKEND-1`
2. **Language:** `Node`
3. **Region:** `Virginia (US East)`
4. **Branch:** `main`

### **Step 2: Build Settings** ⚠️ **CRITICAL**
1. **Root Directory:** `backend` ← **MUST SET THIS!**
2. **Build Command:** `npm install && npm run build && npx prisma generate`
3. **Start Command:** `npm start`

### **Step 3: After Creating Service**
1. Go to **Settings** tab
2. Add **Environment Variables** (see table above)
3. Click **Save Changes**
4. Click **Manual Deploy** → **Deploy latest commit**

---

## ⚠️ Common Mistakes to Avoid

### **❌ Wrong:**
- Root Directory: (empty) ← Will look in root folder
- Build Command: `yarn` ← You're using npm
- Start Command: `yarn start` ← You're using npm

### **✅ Correct:**
- Root Directory: `backend` ← Points to backend folder
- Build Command: `npm install && npm run build && npx prisma generate`
- Start Command: `npm start`

---

## 🔍 Why Root Directory is Important

Your project structure:
```
ONIX-ERP-V2-BACKEND/
├── backend/          ← Your backend code is HERE
│   ├── src/
│   ├── package.json
│   ├── prisma/
│   └── ...
└── (other files)
```

If you don't set **Root Directory** to `backend`, Render will look for `package.json` in the root folder and fail!

---

## ✅ Quick Copy-Paste Values

**Root Directory:**
```
backend
```

**Build Command:**
```
npm install && npm run build && npx prisma generate
```

**Start Command:**
```
npm start
```

---

## 🚀 After Deployment

1. **Check Logs** - Should see "Server running on port 10000"
2. **Test Health Endpoint:** `https://your-service.onrender.com/health`
3. **Should return:** `{"status":"ok","timestamp":"..."}`

---

## 📝 Summary

| Field | Value |
|-------|-------|
| **Root Directory** | `backend` |
| **Build Command** | `npm install && npm run build && npx prisma generate` |
| **Start Command** | `npm start` |
| **Environment Variables** | Add in Settings (see table above) |

---

**The most important thing is setting Root Directory to `backend`!** 🎯





