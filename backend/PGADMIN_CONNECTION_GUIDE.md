# 🔌 pgAdmin Connection Guide - ONIX ERP Database

## 🚨 Common Mistake

**❌ WRONG:** Port `3001` (This is your backend server port)  
**✅ CORRECT:** Port `5432` (This is PostgreSQL database port)

---

## 📋 Step-by-Step: Configure pgAdmin Connection

### **Step 1: Open pgAdmin**

1. Open **pgAdmin 4** from Start Menu
2. You'll see the pgAdmin interface

---

### **Step 2: Register New Server**

1. **Right-click** on **"Servers"** in the left panel
2. Click **"Register"** → **"Server..."**

---

### **Step 3: General Tab**

**Name:** `ONIX ERP Local` (or any name you prefer)

**Description:** `Local PostgreSQL Server for ONIX ERP`

---

### **Step 4: Connection Tab** ⭐ **MOST IMPORTANT**

Fill in these fields:

| Field | Value | Notes |
|-------|-------|-------|
| **Host name/address** | `localhost` | or `127.0.0.1` |
| **Port** | `5432` | ⚠️ **NOT 3001!** |
| **Maintenance database** | `postgres` | Default database |
| **Username** | `postgres` | Default PostgreSQL user |
| **Password** | `YOUR_POSTGRES_PASSWORD` | Password you set during installation |

**Common Passwords:**
- `postgres` (default)
- `Manu@123` (if set during setup)
- Your custom password

**⚠️ IMPORTANT:**
- **DO NOT** use port `3001` - that's your backend server!
- **USE** port `5432` - that's PostgreSQL!

---

### **Step 5: Advanced Tab (Optional)**

Leave as default unless you have specific requirements.

---

### **Step 6: Save Password (Optional but Recommended)**

✅ Check **"Save password"** if you want pgAdmin to remember it.

---

### **Step 7: Click "Save"**

Click the **"Save"** button at the bottom.

---

## ✅ Success!

If connection is successful:
- You'll see **"ONIX ERP Local"** under Servers
- You can expand it to see:
  - **Databases** → `onix_erp` (your database)
  - **Login/Group Roles**
  - **Tablespaces**

---

## 🗄️ Access Your Database

1. Expand **"ONIX ERP Local"**
2. Expand **"Databases"**
3. You should see **"onix_erp"** database
4. Expand **"onix_erp"** → **"Schemas"** → **"public"** → **"Tables"**
5. You'll see all your tables:
   - `users`
   - `clients`
   - `projects`
   - `tenders`
   - `documents`
   - etc.

---

## 🐛 Troubleshooting

### **Error: "Unable to connect to server"**

**Possible Causes:**

1. **Wrong Port**
   - ❌ Using port `3001` (backend server)
   - ✅ Use port `5432` (PostgreSQL)

2. **PostgreSQL Service Not Running**
   ```powershell
   # Check if PostgreSQL is running
   Get-Service -Name "*postgresql*"
   
   # Start PostgreSQL service
   Start-Service postgresql-x64-16  # Replace 16 with your version
   ```

3. **Wrong Password**
   - Try common passwords: `postgres`, `Manu@123`
   - Or reset password:
     ```powershell
     psql -U postgres
     ALTER USER postgres PASSWORD 'newpassword';
     ```

4. **Firewall Blocking**
   - Make sure Windows Firewall allows PostgreSQL
   - Port 5432 should be open

---

### **Error: "SSL negotiation failed"**

**Fix:** In pgAdmin Connection tab:

1. Go to **"SSL"** tab (if available)
2. Set **"SSL mode"** to: `Prefer` or `Allow`
3. Or uncheck **"SSL required"** if option exists

**OR** in Connection tab, uncheck any SSL-related options.

---

### **Error: "Database does not exist"**

**Fix:** Create the database first:

```powershell
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE onix_erp;

# Exit
\q
```

---

### **Error: "Role does not exist"**

**Fix:** 
- Make sure username is `postgres` (default)
- Or create the user:
  ```sql
  CREATE USER postgres WITH PASSWORD 'yourpassword';
  ```

---

## 📝 Quick Reference

### **Correct Connection Settings:**

```
Host: localhost
Port: 5432          ← PostgreSQL port
Database: postgres   ← For connection (maintenance database)
Username: postgres
Password: [your password]
```

### **Your Application Database:**

```
Database Name: onix_erp
```

---

## 🔍 Verify Connection Details

To find your actual database connection details, check your `.env` file:

```env
DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/onix_erp?schema=public"
```

From this URL:
- **Username:** `postgres`
- **Password:** `PASSWORD` (replace with actual)
- **Host:** `localhost`
- **Port:** `5432`
- **Database:** `onix_erp`

---

## 🎯 Summary

| Setting | Value |
|---------|-------|
| **Host** | `localhost` |
| **Port** | `5432` ⚠️ |
| **Database** | `postgres` (for connection) |
| **Username** | `postgres` |
| **Password** | Your PostgreSQL password |

**Target Database:** `onix_erp` (after connecting)

---

## ✅ Checklist

- [ ] PostgreSQL service is running
- [ ] Using port `5432` (NOT 3001)
- [ ] Correct username: `postgres`
- [ ] Correct password
- [ ] Database `onix_erp` exists
- [ ] Connection successful in pgAdmin

---

**Remember: Port 5432 for PostgreSQL, Port 3001 for your backend server!** 🚀

