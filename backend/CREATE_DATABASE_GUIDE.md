# 🗄️ How to Create the Database

## Method 1: Using pgAdmin (GUI - Easiest)

1. **Open pgAdmin** (should be installed with PostgreSQL)
   - Search for "pgAdmin" in Start Menu

2. **Connect to PostgreSQL Server**
   - Enter your password when prompted (usually `Manu@123`)

3. **Create Database**
   - Right-click on **Databases** in the left panel
   - Click **Create** → **Database...**
   - Name: `onix_erp`
   - Click **Save**

✅ Done! Database created.

---

## Method 2: Using psql Command Line

### Step 1: Find PostgreSQL Installation Path

Open PowerShell and find where PostgreSQL is installed:

```powershell
Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
```

This will show you the path, for example:
```
C:\Program Files\PostgreSQL\16\bin\psql.exe
```

### Step 2: Use Full Path to psql

Replace `16` with your PostgreSQL version number:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres
```

You'll be prompted for password. Enter: `Manu@123`

### Step 3: Create Database

Once connected, type:
```sql
CREATE DATABASE onix_erp;
```

Then exit:
```sql
\q
```

---

## Method 3: Using PowerShell with Full Path (One Command)

If you know your PostgreSQL version (commonly 14, 15, or 16):

```powershell
# For PostgreSQL 16
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE onix_erp;"

# For PostgreSQL 15
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -U postgres -c "CREATE DATABASE onix_erp;"

# For PostgreSQL 14
& "C:\Program Files\PostgreSQL\14\bin\psql.exe" -U postgres -c "CREATE DATABASE onix_erp;"
```

You'll be prompted for password. Enter: `Manu@123`

---

## Method 4: Add PostgreSQL to PATH (Optional)

To use `psql` directly without full path:

1. Find your PostgreSQL bin folder (e.g., `C:\Program Files\PostgreSQL\16\bin`)
2. Add it to System PATH:
   - Right-click **This PC** → **Properties**
   - **Advanced system settings** → **Environment Variables**
   - Under **System variables**, find **Path** → **Edit**
   - **New** → Add `C:\Program Files\PostgreSQL\16\bin`
   - Click **OK** on all dialogs
3. Restart PowerShell
4. Now you can use `psql` directly:
   ```powershell
   psql -U postgres -c "CREATE DATABASE onix_erp;"
   ```

---

## After Creating Database

Once the database is created, run these commands in the `backend` folder:

```powershell
cd backend
npx prisma generate
npm run prisma:migrate
npm run db:seed
```

This will:
1. Generate Prisma client
2. Create all database tables
3. Seed with test users (admin@onixgroup.ae / admin123)

---

## Verify Database Was Created

To check if database exists, you can use:

```powershell
# Using full path
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "\l" | Select-String "onix_erp"

# Or if psql is in PATH:
psql -U postgres -c "\l" | Select-String "onix_erp"
```

You should see `onix_erp` in the list.



