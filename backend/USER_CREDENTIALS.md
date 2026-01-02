# 🔐 All User Credentials - ONIX ERP System

## 📋 Complete List of User Accounts

### **1. Admin User**
- **Email:** `admin@onixgroup.ae`
- **Password:** `admin123`
- **Role:** `ADMIN`
- **First Name:** Admin
- **Last Name:** User
- **Status:** ✅ Active

---

### **2. Tender Engineer**
- **Email:** `engineer@onixgroup.ae`
- **Password:** `engineer@123`
- **Role:** `TENDER_ENGINEER`
- **First Name:** Tender
- **Last Name:** Engineer
- **Status:** ✅ Active

---

### **3. Kaddour (Admin)**
- **Email:** `kaddour@onixgroup.ae`
- **Password:** `kadoour123`
- **Role:** `ADMIN`
- **First Name:** Kaddour
- **Last Name:** User
- **Status:** ✅ Active

---

### **4. Ramiz (Admin)**
- **Email:** `ramiz@onixgroup.ae`
- **Password:** `ramiz@123`
- **Role:** `ADMIN`
- **First Name:** Ramiz
- **Last Name:** User
- **Status:** ✅ Active

---

## 📊 Quick Reference Table

| Email | Password | Role | Status |
|-------|----------|------|--------|
| `admin@onixgroup.ae` | `admin123` | ADMIN | ✅ Active |
| `engineer@onixgroup.ae` | `engineer@123` | TENDER_ENGINEER | ✅ Active |
| `kaddour@onixgroup.ae` | `kadoour123` | ADMIN | ✅ Active |
| `ramiz@onixgroup.ae` | `ramiz@123` | ADMIN | ✅ Active |

---

## 🔑 Login Instructions

### **For Frontend Login:**

1. Open your frontend application
2. Navigate to login page
3. Enter:
   - **Email:** (from table above)
   - **Password:** (from table above)
   - **Role:** (from table above - ADMIN, TENDER_ENGINEER, etc.)

### **For API Testing (Postman/cURL):**

```bash
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "admin@onixgroup.ae",
  "password": "admin123",
  "role": "ADMIN"
}
```

---

## 🧪 Test Each User

### **Test Admin Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@onixgroup.ae",
    "password": "admin123",
    "role": "ADMIN"
  }'
```

### **Test Engineer Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "engineer@onixgroup.ae",
    "password": "engineer@123",
    "role": "TENDER_ENGINEER"
  }'
```

### **Test Kaddour Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "kaddour@onixgroup.ae",
    "password": "kadoour123",
    "role": "ADMIN"
  }'
```

### **Test Ramiz Login:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ramiz@onixgroup.ae",
    "password": "ramiz@123",
    "role": "ADMIN"
  }'
```

---

## 📝 Notes

- All passwords are **case-sensitive**
- All emails are **case-sensitive**
- Role must match exactly: `ADMIN`, `TENDER_ENGINEER`, `PROJECT_MANAGER`, `CONTRACTOR`, `EMPLOYEE`, `HR`
- These users are created automatically when you run: `npm run db:seed`

---

## 🔄 Reset/Recreate Users

If you need to reset users, run:

```bash
cd backend
npm run db:seed
```

This will:
- Create/update all users
- Keep existing data
- Reset passwords to defaults above

---

## ⚠️ Security Note

**For Production:**
- Change all default passwords
- Use strong, unique passwords
- Enable 2FA if available
- Regularly rotate passwords

**For Development:**
- These credentials are safe to use in local development
- Never commit `.env` files with real passwords

---

## 🆕 New Employee Credentials

When you create a new employee via the "Add Employee" feature:

- **Email:** Auto-generated as `firstname.lastname@onixgroup.ae`
- **Password:** Temporary password (shown once to admin)
- **Role:** `EMPLOYEE` (or selected role)
- **Status:** ⚠️ Requires password change on first login

**Example:**
- Name: John Doe
- Email: `john.doe@onixgroup.ae`
- Temporary Password: `TempPass123!` (randomly generated)
- Must change password on first login

---

## 📞 Support

If you have issues logging in:
1. Check database is seeded: `npm run db:seed`
2. Verify backend server is running: `npm run dev`
3. Check `.env` file has correct `DATABASE_URL`
4. Verify PostgreSQL is running

---

**Last Updated:** Based on `prisma/seed.ts` file

