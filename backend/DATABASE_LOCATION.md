# 📍 Where is the Database Located?

## Database Information

**Database Name:** `onix_erp`  
**Database Server:** PostgreSQL 18  
**Host:** `localhost` (127.0.0.1)  
**Port:** `5432`  
**User:** `postgres`  
**Password:** `Manu@123`

---

## Physical Location

PostgreSQL stores database files on your computer's hard drive. The exact location depends on your PostgreSQL installation, but typically it's:

### Default PostgreSQL Data Directory:
```
C:\Program Files\PostgreSQL\18\data
```

**⚠️ Note:** You should **NOT** edit files in this directory directly! Use database tools instead.

---

## How to Access the Database

### Option 1: Prisma Studio (Easiest - Recommended)

Open a visual interface in your browser:

```powershell
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma studio
```

Then open: `http://localhost:5555` in your browser

✅ **This is the best way to view your data!**

---

### Option 2: pgAdmin (PostgreSQL GUI)

1. Open **pgAdmin** from Start Menu
2. Connect to PostgreSQL server (password: `Manu@123`)
3. Navigate to: **Servers** → **PostgreSQL 18** → **Databases** → **onix_erp**
4. View tables under: **Schemas** → **public** → **Tables**

---

### Option 3: psql (Command Line)

Connect directly:

```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp
```

Then run SQL commands:
```sql
\dt              -- List all tables
SELECT * FROM users;  -- View users
\q               -- Quit
```

---

### Option 4: View via Backend API

You can also access data through your API endpoints:

**Get current user:**
```
GET http://localhost:3001/api/auth/me
Authorization: Bearer YOUR_TOKEN
```

---

## Connection String

Your database connection string (in `.env` file):
```
DATABASE_URL=postgresql://postgres:Manu%40123@localhost:5432/onix_erp?schema=public
```

This tells your application:
- **Protocol:** `postgresql://`
- **User:** `postgres`
- **Password:** `Manu@123` (URL-encoded as `Manu%40123`)
- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `onix_erp`
- **Schema:** `public`

---

## Quick Access Commands

### View database in Prisma Studio:
```powershell1
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma studio
```

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

### List tables in onix_erp:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp -c "\dt"
```

---

## Summary

- **Database Name:** `onix_erp`
- **Running on:** `localhost:5432`
- **Best way to view:** Use `npx prisma studio` (opens web interface)
- **File location:** `C:\Program Files\PostgreSQL\18\data` (don't edit directly)

**To view your data right now, run:**
```powershell
cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma studio
```

Then open `http://localhost:5555` in your browser! 🚀











