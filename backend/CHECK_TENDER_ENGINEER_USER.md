# 🔍 Check Tender Engineer User in Database

## ✅ Verify User Exists

The login is failing even with correct credentials. Let's verify the user exists in the database.

---

## 🔍 Check Database

### **Option 1: Using Prisma Studio**

```bash
cd backend
npx prisma studio
```

Then:
1. Open `http://localhost:5555` in browser
2. Click on `User` table
3. Search for `anas.ali@onixgroup.ae`
4. Verify the user exists and check:
   - Email: `anas.ali@onixgroup.ae`
   - Role: `TENDER_ENGINEER`
   - Password: (should be hashed)

### **Option 2: Using SQL Query**

```sql
SELECT id, email, "firstName", "lastName", role, "isActive" 
FROM users 
WHERE email = 'anas.ali@onixgroup.ae';
```

---

## 🐛 Common Issues

### **Issue 1: User Not Created**

**Solution:**
```bash
cd backend
npm run prisma:seed
```

### **Issue 2: Wrong Role**

The login might be checking for exact role match. Verify:
- User role in database: `TENDER_ENGINEER`
- Login form role selection: `TENDER_ENGINEER`

### **Issue 3: User is Inactive**

Check if `isActive` is `true`:
```sql
SELECT email, role, "isActive" 
FROM users 
WHERE email = 'anas.ali@onixgroup.ae';
```

### **Issue 4: Password Hash Mismatch**

If user exists but password doesn't work, you might need to reset it.

---

## 🔧 Quick Fix: Re-create User

If the user doesn't exist or has issues:

```bash
cd backend
npm run prisma:seed
```

This will create/update the user with correct credentials.

---

## ✅ Expected Database Record

After seeding, you should see:

| Field | Value |
|-------|-------|
| email | `anas.ali@onixgroup.ae` |
| firstName | `Anas` |
| lastName | `Ali` |
| role | `TENDER_ENGINEER` |
| isActive | `true` |
| password | `[hashed password]` |

---

**Check the database first to verify the user exists!** 🔍

