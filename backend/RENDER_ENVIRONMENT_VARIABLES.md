# Render Environment Variables - Complete Guide

## 🔐 Required Environment Variables

Add these in Render Dashboard → **Environment** tab:

---

## ✅ **1. DATABASE_URL** (REQUIRED)

**Value:**
```
postgresql://user:password@host:5432/onix_erp?schema=public
```

**How to Get:**
1. **Create PostgreSQL database first:**
   - Go to Render Dashboard
   - Click "New +" → "PostgreSQL"
   - Name: `onix-erp-db`
   - Database: `onix_erp`
   - Click "Create Database"

2. **Copy Internal Database URL:**
   - Go to your PostgreSQL service
   - Find "Internal Database URL"
   - Copy the entire URL
   - It looks like: `postgresql://onix_user:password@dpg-xxxxx-a/onix_erp`

3. **Paste as DATABASE_URL:**
   - In your Web Service → Environment tab
   - Add new variable: `DATABASE_URL`
   - Paste the copied URL

**⚠️ IMPORTANT:** Use **Internal Database URL** (not External) for better performance and security!

---

## ✅ **2. JWT_SECRET** (REQUIRED)

**Value:**
```
(Generate a strong random string - at least 32 characters)
```

**How to Generate:**

**Option A: Using OpenSSL (Recommended)**
```bash
openssl rand -base64 32
```

**Option B: Using Node.js**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Option C: Online Generator**
- Go to: https://randomkeygen.com/
- Use "CodeIgniter Encryption Keys" (256-bit)

**Example:**
```
aB3$kL9mN2pQrS7tUvWxYz1A2B4C6D8E0F9G1H3I5J7K9L2M4N6O8P0Q2R4S6T8U0V2W4X6Y8Z0
```

**⚠️ IMPORTANT:** 
- Keep this secret! Never commit to Git
- Use a different secret for production
- At least 32 characters long

---

## ✅ **3. NODE_ENV** (REQUIRED)

**Value:**
```
production
```

**Purpose:** Tells Node.js this is a production environment

---

## ✅ **4. PORT** (REQUIRED)

**Value:**
```
10000
```

**Purpose:** Render uses port 10000 for web services

**Note:** Your code already handles this with `process.env.PORT || 10000`

---

## ✅ **5. FRONTEND_URL** (REQUIRED for CORS)

**Value:**
```
https://your-frontend-url.onrender.com
```

**OR if frontend is on different domain:**
```
https://your-frontend-domain.com
```

**Purpose:** Allows your frontend to make API requests (CORS)

**Examples:**
- `https://onix-erp-frontend.onrender.com`
- `https://erp.onixgroup.ae`
- `http://localhost:3000` (for local testing only)

---

## 🔧 Optional Environment Variables

### **6. JWT_EXPIRES_IN** (Optional)

**Value:**
```
7d
```

**Default:** `7d` (7 days)
**Other options:** `1h`, `24h`, `30d`, etc.

---

### **7. JWT_REFRESH_SECRET** (Optional)

**Value:**
```
(Generate another strong random string)
```

**How to Generate:** Same as JWT_SECRET

---

### **8. JWT_REFRESH_EXPIRES_IN** (Optional)

**Value:**
```
30d
```

**Default:** `30d` (30 days)

---

## 📧 Email Configuration (Optional)

Only add if you're using email features:

### **9. EMAIL_HOST**

**Value:**
```
smtp.gmail.com
```

**Other options:**
- Gmail: `smtp.gmail.com`
- Outlook: `smtp-mail.outlook.com`
- Custom SMTP: Your SMTP server

---

### **10. EMAIL_PORT**

**Value:**
```
587
```

**Common ports:**
- `587` (TLS/STARTTLS - Recommended)
- `465` (SSL)
- `25` (Not recommended)

---

### **11. EMAIL_USER**

**Value:**
```
your-email@gmail.com
```

**Your email address**

---

### **12. EMAIL_PASS**

**Value:**
```
your-app-specific-password
```

**⚠️ For Gmail:**
- Don't use your regular password
- Generate "App Password":
  1. Go to Google Account → Security
  2. Enable 2-Step Verification
  3. Generate App Password
  4. Use that password here

---

### **13. EMAIL_FROM**

**Value:**
```
noreply@onixgroup.ae
```

**The "From" address for emails**

---

## 📋 Complete Environment Variables List

### **Required (Minimum):**

```env
DATABASE_URL=postgresql://user:password@host:5432/onix_erp
JWT_SECRET=your-strong-secret-key-here
NODE_ENV=production
PORT=10000
FRONTEND_URL=https://your-frontend-url.onrender.com
```

### **Recommended (Add These Too):**

```env
JWT_EXPIRES_IN=7d
```

### **Optional (Only if needed):**

```env
JWT_REFRESH_SECRET=another-strong-secret-key
JWT_REFRESH_EXPIRES_IN=30d
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@onixgroup.ae
```

---

## 🎯 Step-by-Step: Adding Variables in Render

1. **Go to Render Dashboard**
2. **Click on your Web Service**
3. **Go to "Environment" tab**
4. **Click "Add Environment Variable"**
5. **For each variable:**
   - **Key:** Enter variable name (e.g., `DATABASE_URL`)
   - **Value:** Enter the value
   - **Click "Save"**
6. **Repeat for all variables**
7. **Service will auto-redeploy**

---

## ✅ Quick Checklist

- [ ] **DATABASE_URL** - From PostgreSQL Internal URL
- [ ] **JWT_SECRET** - Generated strong random string
- [ ] **NODE_ENV** - Set to `production`
- [ ] **PORT** - Set to `10000`
- [ ] **FRONTEND_URL** - Your frontend URL
- [ ] **JWT_EXPIRES_IN** - `7d` (optional but recommended)

---

## 🔍 How to Verify Variables Are Set

1. **Go to your service → "Logs" tab**
2. **Look for startup logs**
3. **Should see:** `🚀 Server running on port 10000`
4. **If errors:** Check logs for missing variables

---

## 🚨 Common Mistakes

### ❌ Wrong DATABASE_URL
- **Don't use:** External Database URL
- **Do use:** Internal Database URL

### ❌ Weak JWT_SECRET
- **Don't use:** `secret123` or `password`
- **Do use:** Strong random string (32+ characters)

### ❌ Wrong PORT
- **Don't use:** `3001` or `3000`
- **Do use:** `10000` (Render's default)

### ❌ Missing FRONTEND_URL
- **Don't:** Leave empty if frontend makes API calls
- **Do:** Add your frontend URL for CORS

---

## 📝 Example Complete Setup

```env
# Database
DATABASE_URL=postgresql://onix_user:abc123xyz@dpg-xxxxx-a.oregon-postgres.render.com/onix_erp

# JWT
JWT_SECRET=aB3$kL9mN2pQrS7tUvWxYz1A2B4C6D8E0F9G1H3I5J7K9L2M4N6O8P0Q2R4S6T8U0V2W4X6Y8Z0
JWT_EXPIRES_IN=7d

# Server
NODE_ENV=production
PORT=10000

# CORS
FRONTEND_URL=https://onix-erp-frontend.onrender.com
```

---

**Add these variables and your service will work!** 🚀


