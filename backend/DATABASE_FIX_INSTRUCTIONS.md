# 🔧 Fix Database Connection Error

## The Problem
You're getting this error:
```
Authentication failed against database server at 'localhost', 
the provided database credentials for 'postgres' are not valid.
```

This means the `.env` file is missing or has incorrect database credentials.

## ✅ Solution: Create .env File

### Step 1: Create the .env file

Create a file named `.env` in the `backend` folder with this content:

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database Connection
# ⚠️ IMPORTANT: Replace 'postgres' with your actual PostgreSQL password!
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/onix_erp?schema=public

# JWT Secrets
JWT_SECRET=onix-erp-super-secret-jwt-key-2024-change-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_SECRET=onix-erp-refresh-secret-key-2024
JWT_REFRESH_EXPIRES_IN=30d

# Email Configuration (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=noreply@onixgroup.ae

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=.pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png
```

### Step 2: Update Database Password

**⚠️ IMPORTANT:** Replace `postgres` (the password part) in `DATABASE_URL` with your actual PostgreSQL password.

The format is:
```
DATABASE_URL=postgresql://USERNAME:PASSWORD@HOST:PORT/DATABASE_NAME?schema=public
```

Common defaults:
- Username: `postgres`
- Password: `postgres` (or what you set during installation)
- Host: `localhost`
- Port: `5432`
- Database: `onix_erp`

### Step 3: Make sure PostgreSQL is running

Check if PostgreSQL service is running:
```powershell
Get-Service -Name "*postgresql*"
```

If it's not running, start it:
```powershell
# Find the service name first
Get-Service -Name "*postgresql*"

# Then start it (replace with actual service name)
Start-Service postgresql-x64-16  # or postgresql-x64-15, etc.
```

Or start it manually:
1. Press `Win + R`
2. Type `services.msc` and press Enter
3. Find **PostgreSQL** service
4. Right-click → **Start**

### Step 4: Create the database (if not exists)

Connect to PostgreSQL:
```powershell
psql -U postgres
```

Then create the database:
```sql
CREATE DATABASE onix_erp;
\q
```

### Step 5: Run database migrations

```powershell
cd backend
npx prisma generate
npm run prisma:migrate
npm run db:seed
```

This will:
1. Generate Prisma client
2. Create all database tables
3. Seed the database with test users (admin@onixgroup.ae / admin123)

### Step 6: Restart the backend server

After creating the `.env` file, restart your backend server:
```powershell
# Stop the current server (Ctrl+C)
# Then start again:
npm run dev
```

## Quick Test

After fixing, test the connection:
```powershell
# Health check
Invoke-WebRequest -Uri http://localhost:3001/health

# Should return: {"status":"ok","timestamp":"..."}
```

---

**After creating the .env file with correct credentials, the database connection error should be resolved!** ✅









