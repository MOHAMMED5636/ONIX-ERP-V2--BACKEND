# 👀 How to View the Database

There are several ways to view your PostgreSQL database. Here are the easiest methods:

---

## Method 1: Prisma Studio (Easiest - Visual GUI)

Prisma Studio provides a beautiful web interface to view and edit your database.

### Steps:

1. **Open terminal in backend folder:**
   ```powershell
   cd C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
   ```

2. **Run Prisma Studio:**
   ```powershell
   npx prisma studio
   ```

3. **Open in browser:**
   - Prisma Studio will automatically open in your browser
   - URL: `http://localhost:5555`
   - You'll see all your database tables in a nice interface

4. **View Data:**
   - Click on any table (e.g., `users`) to see all records
   - You can view, edit, add, or delete records directly in the UI
   - All changes are saved automatically

✅ **This is the easiest and most user-friendly method!**

---

## Method 2: Using pgAdmin (PostgreSQL GUI Tool)

pgAdmin is a full-featured PostgreSQL administration tool.

### Steps:

1. **Open pgAdmin**
   - Search for "pgAdmin" in Start Menu
   - It should be installed with PostgreSQL

2. **Connect to Server:**
   - Enter password when prompted: `Manu@123`

3. **Navigate to Database:**
   - Expand: **Servers** → **PostgreSQL 18** → **Databases** → **onix_erp**

4. **View Tables:**
   - Expand: **Schemas** → **public** → **Tables**
   - Right-click any table → **View/Edit Data** → **All Rows**

5. **Run Queries:**
   - Right-click on `onix_erp` → **Query Tool**
   - Type SQL queries and click Execute (▶)

---

## Method 3: Using psql (Command Line)

Quick way to view data using SQL commands.

### Steps:

1. **Connect to database:**
   ```powershell
   $env:PGPASSWORD='Manu@123'
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp
   ```

2. **View all tables:**
   ```sql
   \dt
   ```

3. **View users table:**
   ```sql
   SELECT * FROM users;
   ```

4. **View specific columns:**
   ```sql
   SELECT id, email, "firstName", "lastName", role FROM users;
   ```

5. **View all clients:**
   ```sql
   SELECT * FROM clients;
   ```

6. **View all tenders:**
   ```sql
   SELECT * FROM tenders;
   ```

7. **Exit psql:**
   ```sql
   \q
   ```

---

## Method 4: Quick SQL Queries (One-liners)

Run these commands directly in PowerShell without opening psql:

### View all users:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp -c "SELECT id, email, \"firstName\", \"lastName\", role FROM users;"
```

### View all tables:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp -c "\dt"
```

### Count records in users table:
```powershell
$env:PGPASSWORD='Manu@123'
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d onix_erp -c "SELECT COUNT(*) FROM users;"
```

---

## 🎯 Recommended: Use Prisma Studio

For most users, **Prisma Studio** is the best option because:
- ✅ Beautiful, easy-to-use interface
- ✅ No SQL knowledge required
- ✅ Can edit data directly
- ✅ Shows relationships between tables
- ✅ Built specifically for Prisma projects

### Quick Start:
```powershell
cd backend
npx prisma studio
```

Then open `http://localhost:5555` in your browser!

---

## 📊 What You'll See

After opening Prisma Studio, you'll see tables like:

- **users** - All user accounts (admin, engineers, etc.)
- **clients** - Client/company records
- **projects** - Project records
- **tenders** - Tender records
- **tenderInvitations** - Tender assignment invitations
- **documents** - Document records
- And more...

---

## 🔍 Common SQL Queries

If using psql or pgAdmin Query Tool:

### View all users with their roles:
```sql
SELECT email, "firstName", "lastName", role, "isActive" FROM users;
```

### View active users only:
```sql
SELECT email, role FROM users WHERE "isActive" = true;
```

### View all clients:
```sql
SELECT * FROM clients ORDER BY "createdAt" DESC;
```

### View database size:
```sql
SELECT pg_size_pretty(pg_database_size('onix_erp'));
```

---

**Choose the method that works best for you!** 🚀







