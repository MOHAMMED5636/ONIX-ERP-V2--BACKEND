# 🚀 How to Start the Backend Server

## ✅ Step 1: Install Dependencies (DONE!)
```bash
cd backend
npm install
```

## ✅ Step 2: Set Up Environment Variables

Create a `.env` file in the `backend` folder with:

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database - REQUIRED
DATABASE_URL="postgresql://user:password@localhost:5432/onix_erp?schema=public"

# JWT Secret - REQUIRED
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Email (Optional - only needed for sending emails)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@onixgroup.ae
```

**⚠️ IMPORTANT:** Replace `user`, `password`, and `localhost:5432` with your PostgreSQL credentials!

---

## ✅ Step 3: Set Up Database

### 3.1 Make sure PostgreSQL is running

### 3.2 Create the database:
```bash
# Option 1: Using psql command line
psql -U postgres
CREATE DATABASE onix_erp;
\q

# Option 2: Using pgAdmin or any PostgreSQL client
# Create a new database named "onix_erp"
```

### 3.3 Initialize Prisma and run migrations:
```bash
cd backend

# Generate Prisma Client
npx prisma generate

# Run database migrations (creates tables)
npm run prisma:migrate

# Seed database (creates admin and engineer users)
npm run db:seed
```

---

## ✅ Step 4: Start the Server

```bash
npm run dev
```

**✅ Success output should show:**
```
🚀 Server running on port 3001
📡 API available at http://localhost:3001/api
🏥 Health check: http://localhost:3001/health
```

---

## 🧪 Test the Server

Open browser or use PowerShell:
```powershell
Invoke-WebRequest -Uri http://localhost:3001/health
```

Should return: `{"status":"ok","timestamp":"..."}`

---

## ❌ Common Errors & Fixes

### Error: `nodemon is not recognized`
**Fix:** Run `npm install` first

### Error: `DATABASE_URL is not set`
**Fix:** Create `.env` file with DATABASE_URL

### Error: `Can't reach database server`
**Fix:** 
- Make sure PostgreSQL is running
- Check DATABASE_URL in `.env` is correct
- Verify database `onix_erp` exists

### Error: `Prisma schema not found`
**Fix:** Run `npx prisma generate`

---

## 📋 Quick Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file created with DATABASE_URL
- [ ] PostgreSQL is running
- [ ] Database `onix_erp` created
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] Migrations run (`npm run prisma:migrate`)
- [ ] Database seeded (`npm run db:seed`)
- [ ] Server started (`npm run dev`)

---

## 🎯 After Server Starts

Your backend is ready! Now you can:
1. Connect your frontend using the API service files
2. Test login endpoint: `POST http://localhost:3001/api/auth/login`
3. Use test credentials:
   - Admin: `admin@onixgroup.ae` / `admin123` / `ADMIN`
   - Engineer: `engineer@onixgroup.ae` / `engineer@123` / `TENDER_ENGINEER`








