# Render.com Deployment Guide

## 🚀 Deployment Configuration

### Build Command (in Render Dashboard):
```bash
npm install && npm run build && npx prisma generate
```

### Start Command (in Render Dashboard):
```bash
npm start
```

---

## 📋 Step-by-Step Setup

### 1. **Create PostgreSQL Database on Render**

1. Go to Render Dashboard
2. Click "New +" → "PostgreSQL"
3. Configure:
   - **Name:** `onix-erp-db`
   - **Database:** `onix_erp`
   - **User:** (auto-generated)
   - **Region:** Choose closest to you
4. Click "Create Database"
5. **Save the Internal Database URL** (you'll need it)

---

### 2. **Create Web Service (Backend)**

1. Go to Render Dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub repository:
   - Repository: `MOHAMMED5636/ONIX-ERP-V2--BACKEND`
   - Branch: `main`
   - Root Directory: `backend` (if repo is at root level)

### 3. **Configure Build Settings**

**Build Command:**
```bash
npm install && npm run build && npx prisma generate
```

**Start Command:**
```bash
npm start
```

**Node Version:**
- Select: `22.16.0` (or latest LTS)

---

### 4. **Environment Variables**

Add these in Render Dashboard → Environment:

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/onix_erp?schema=public

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server
NODE_ENV=production
PORT=10000

# Frontend URL (for CORS)
FRONTEND_URL=https://your-frontend-url.onrender.com

# Email (if using)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

**Important:**
- Get `DATABASE_URL` from your PostgreSQL service (Internal Database URL)
- Generate a strong `JWT_SECRET` (use: `openssl rand -base64 32`)
- Set `PORT=10000` (Render uses this port)

---

### 5. **Database Migrations**

After first deployment, run migrations:

**Option A: Via Render Shell**
1. Go to your service → "Shell"
2. Run:
   ```bash
   npx prisma migrate deploy
   ```

**Option B: Add to Build Command**
Update build command to:
```bash
npm install && npm run build && npx prisma generate && npx prisma migrate deploy
```

---

## 🔧 Updated package.json Scripts (Optional)

You can add a production build script:

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "build:prod": "npm install && npm run build && npx prisma generate && npx prisma migrate deploy",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  }
}
```

---

## 📝 Render Configuration File (render.yaml)

Create `render.yaml` in your repository root:

```yaml
services:
  - type: web
    name: onix-erp-backend
    env: node
    buildCommand: npm install && npm run build && npx prisma generate
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: DATABASE_URL
        fromDatabase:
          name: onix-erp-db
          property: connectionString
      - key: JWT_SECRET
        generateValue: true
      - key: JWT_EXPIRES_IN
        value: 7d
      - key: FRONTEND_URL
        value: https://your-frontend-url.onrender.com

databases:
  - name: onix-erp-db
    databaseName: onix_erp
    user: onix_user
    plan: free
```

---

## ✅ Deployment Checklist

- [ ] PostgreSQL database created
- [ ] Web service created
- [ ] Build command set: `npm install && npm run build && npx prisma generate`
- [ ] Start command set: `npm start`
- [ ] Environment variables added
- [ ] DATABASE_URL configured
- [ ] JWT_SECRET set (strong random value)
- [ ] PORT set to 10000
- [ ] FRONTEND_URL set (for CORS)
- [ ] Database migrations run
- [ ] Health check endpoint working: `/health`

---

## 🐛 Common Issues & Fixes

### Issue 1: Build Fails - "npm" command not found
**Fix:** Use full build command:
```bash
npm install && npm run build && npx prisma generate
```

### Issue 2: Prisma Client Not Generated
**Fix:** Add to build command:
```bash
npx prisma generate
```

### Issue 3: Database Connection Error
**Fix:** 
- Use Internal Database URL (not external)
- Check DATABASE_URL format
- Ensure database is created first

### Issue 4: Port Error
**Fix:** 
- Set PORT=10000 in environment variables
- Or use `process.env.PORT || 10000` in code

### Issue 5: Migrations Not Run
**Fix:** 
- Add `npx prisma migrate deploy` to build command
- Or run manually via Shell

---

## 🔍 Testing Deployment

### 1. Check Health Endpoint
```bash
curl https://your-service.onrender.com/health
```
Should return: `{"status":"ok","timestamp":"..."}`

### 2. Test API
```bash
curl https://your-service.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'
```

### 3. Check Logs
- Go to Render Dashboard → Your Service → Logs
- Look for: "🚀 Server running on port 10000"

---

## 📊 Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `JWT_SECRET` | Secret for JWT tokens | `your-secret-key` |
| `JWT_EXPIRES_IN` | Token expiration | `7d` |
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `10000` |
| `FRONTEND_URL` | Frontend URL for CORS | `https://...` |

---

## 🎯 Quick Deploy Steps

1. **Create PostgreSQL** → Get Internal Database URL
2. **Create Web Service** → Connect GitHub repo
3. **Set Build Command:** `npm install && npm run build && npx prisma generate`
4. **Set Start Command:** `npm start`
5. **Add Environment Variables** (see above)
6. **Deploy** → Wait for build to complete
7. **Run Migrations** (via Shell or build command)
8. **Test** → Check `/health` endpoint

---

**Your backend should now deploy successfully!** 🚀


