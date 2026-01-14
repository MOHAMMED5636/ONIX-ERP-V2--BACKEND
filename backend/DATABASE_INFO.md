# 📍 Database Information

## Database Details

**Database Type:** PostgreSQL  
**Database Name:** `onix_erp`  
**Host:** `localhost` (127.0.0.1)  
**Port:** `5432`  
**User:** `postgres`  
**Password:** `Manu@123`

---

## Database Configuration Files

### 1. Prisma Schema
**Location:** `backend/prisma/schema.prisma`
- Defines all database models (User, Project, Task, etc.)
- Database connection: Uses `DATABASE_URL` environment variable

### 2. Database Connection
**Location:** `backend/src/config/database.ts`
- Creates Prisma Client instance
- Connects to PostgreSQL database

### 3. Environment Variable
**Location:** `backend/.env` (if exists) or system environment variables
- `DATABASE_URL=postgresql://postgres:Manu%40123@localhost:5432/onix_erp?schema=public`

---

## Physical Database Location

PostgreSQL stores database files on your computer at:
```
C:\Program Files\PostgreSQL\18\data
```

⚠️ **Warning:** Don't edit files in this directory directly! Use database tools instead.

---

## How to Access the Database

### Option 1: Prisma Studio (Recommended - Easiest)

Open a visual web interface:

```powershell
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma studio
```

Then open: **http://localhost:5555** in your browser

✅ **This is the best way to view and edit your data!**

---

### Option 2: pgAdmin (PostgreSQL GUI)

1. Open **pgAdmin** from Start Menu
2. Connect to PostgreSQL server
   - Password: `Manu@123`
3. Navigate to:
   - **Servers** → **PostgreSQL 18** → **Databases** → **onix_erp**
4. View tables:
   - **Schemas** → **public** → **Tables**

---

### Option 3: psql (Command Line)

Connect directly:

```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp
```

Useful commands:
```sql
\dt              -- List all tables
SELECT * FROM users;  -- View users table
SELECT * FROM projects;  -- View projects table
SELECT * FROM tasks;  -- View tasks table
\q               -- Quit
```

---

### Option 4: Via Backend API

Access data through API endpoints:

**Get current user:**
```
GET http://192.168.1.54:3001/api/auth/me
Authorization: Bearer YOUR_TOKEN
```

**Get all users:**
```
GET http://192.168.1.54:3001/api/employees
Authorization: Bearer YOUR_TOKEN
```

---

## Database Connection String

The connection string format:
```
postgresql://postgres:Manu%40123@localhost:5432/onix_erp?schema=public
```

**Breakdown:**
- **Protocol:** `postgresql://`
- **User:** `postgres`
- **Password:** `Manu@123` (URL-encoded as `Manu%40123`)
- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `onix_erp`
- **Schema:** `public`

---

## Quick Commands

### View Database in Prisma Studio:
```powershell
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma studio
```
Then open: **http://localhost:5555**

### Connect via psql:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp
```

### List all databases:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -c "\l"
```

### List all tables:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp -c "\dt"
```

---

## Summary

- **Database Name:** `onix_erp`
- **Running on:** `localhost:5432`
- **Best way to view:** Use `npx prisma studio` (opens web interface at http://localhost:5555)
- **File location:** `C:\Program Files\PostgreSQL\18\data` (don't edit directly)
- **Configuration:** `backend/prisma/schema.prisma` and `backend/src/config/database.ts`

**To view your data right now, run:**
```powershell
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma studio
```

Then open **http://localhost:5555** in your browser! 🚀

