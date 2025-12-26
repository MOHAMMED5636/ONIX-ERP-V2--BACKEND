# 🗄️ Database Setup Guide

## Step 1: Install PostgreSQL (If Not Installed)

### Option A: Download PostgreSQL
1. Download from: https://www.postgresql.org/download/windows/
2. Run the installer
3. Remember your **postgres user password** (you'll need it!)
4. Default port: `5432`

### Option B: Using Chocolatey (if you have it)
```powershell
choco install postgresql
```

---

## Step 2: Start PostgreSQL Service

### Check if PostgreSQL is running:
```powershell
Get-Service -Name "*postgresql*"
```

### Start PostgreSQL service:
```powershell
# Find the service name first
Get-Service -Name "*postgresql*"

# Then start it (replace with actual service name)
Start-Service postgresql-x64-16  # or postgresql-x64-15, etc.
```

### Or start manually:
1. Open **Services** (Win + R → `services.msc`)
2. Find **PostgreSQL** service
3. Right-click → **Start**

---

## Step 3: Create the Database

### Option A: Using psql Command Line
```powershell
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE onix_erp;

# Exit
\q
```

### Option B: Using pgAdmin (GUI)
1. Open **pgAdmin**
2. Connect to PostgreSQL server
3. Right-click **Databases** → **Create** → **Database**
4. Name: `onix_erp`
5. Click **Save**

### Option C: Using SQL Command
```powershell
psql -U postgres -c "CREATE DATABASE onix_erp;"
```

---

## Step 4: Update .env File

Make sure your `backend/.env` file has the correct database URL:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/onix_erp?schema=public"
```

**⚠️ Replace `YOUR_PASSWORD` with your actual PostgreSQL password!**

Common defaults:
- Username: `postgres`
- Password: `postgres` (or what you set during installation)
- Host: `localhost`
- Port: `5432`
- Database: `onix_erp`

---

## Step 5: Run Database Migrations

Once PostgreSQL is running and database is created:

```powershell
cd backend

# Generate Prisma Client (if not done)
npx prisma generate

# Run migrations (creates all tables)
npx prisma migrate dev --name init

# Seed database (creates admin and engineer users)
npm run db:seed
```

---

## Step 6: Verify Setup

### Test database connection:
```powershell
cd backend
npx prisma db pull
```

### Check tables were created:
```powershell
npx prisma studio
```
This opens a browser with database GUI.

---

## ✅ Quick Setup Script

If PostgreSQL is installed and running, run these commands:

```powershell
# Navigate to backend
cd backend

# Create database (if not exists)
psql -U postgres -c "CREATE DATABASE onix_erp;" 2>$null

# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev --name init

# Seed database
npm run db:seed
```

---

## 🐛 Troubleshooting

### Error: "Can't reach database server"
**Fix:** 
- Make sure PostgreSQL service is running
- Check if port 5432 is correct
- Verify DATABASE_URL in .env file

### Error: "password authentication failed"
**Fix:**
- Check password in DATABASE_URL
- Try resetting PostgreSQL password:
  ```powershell
  psql -U postgres
  ALTER USER postgres PASSWORD 'newpassword';
  ```

### Error: "database does not exist"
**Fix:**
- Create the database first (Step 3)

### Error: "role does not exist"
**Fix:**
- Check username in DATABASE_URL (usually `postgres`)

---

## 📋 Checklist

- [ ] PostgreSQL installed
- [ ] PostgreSQL service running
- [ ] Database `onix_erp` created
- [ ] `.env` file has correct DATABASE_URL
- [ ] Prisma Client generated (`npx prisma generate`)
- [ ] Migrations run (`npx prisma migrate dev`)
- [ ] Database seeded (`npm run db:seed`)

---

## 🎯 After Setup

Once database is set up, you can:
1. Start the backend server: `npm run dev`
2. Test login with:
   - Admin: `admin@onixgroup.ae` / `admin123` / `ADMIN`
   - Engineer: `engineer@onixgroup.ae` / `engineer@123` / `TENDER_ENGINEER`








