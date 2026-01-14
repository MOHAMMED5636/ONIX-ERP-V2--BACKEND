# 🔐 All User Credentials - ERP System

## Complete List of Test Users

| # | Email | Password | Role | Name | Status |
|---|-------|----------|------|------|--------|
| 1 | `admin@onixgroup.ae` | `admin123` | ADMIN | Admin User | ✅ Active |
| 2 | `engineer@onixgroup.ae` | `engineer@123` | TENDER_ENGINEER | Tender Engineer | ✅ Active |
| 3 | `anas.ali@onixgroup.ae` | `anas@123` | TENDER_ENGINEER | Anas Ali | ✅ Active |
| 4 | `kaddour@onixgroup.ae` | `kadoour123` | ADMIN | Kaddour User | ✅ Active |
| 5 | `ramiz@onixgroup.ae` | `ramiz@123` | ADMIN | Ramiz User | ✅ Active |

---

## 📋 Detailed User Information

### 1. Admin User
- **Email:** `admin@onixgroup.ae`
- **Password:** `admin123`
- **Role:** `ADMIN`
- **Full Name:** Admin User
- **Access Level:** Full system access
- **Use Case:** Main administrator account

### 2. Tender Engineer (Generic)
- **Email:** `engineer@onixgroup.ae`
- **Password:** `engineer@123`
- **Role:** `TENDER_ENGINEER`
- **Full Name:** Tender Engineer
- **Access Level:** Tender management access
- **Use Case:** General tender engineer testing

### 3. Anas Ali (Tender Engineer)
- **Email:** `anas.ali@onixgroup.ae`
- **Password:** `anas@123`
- **Role:** `TENDER_ENGINEER`
- **Full Name:** Anas Ali
- **Access Level:** Tender management access
- **Use Case:** Specific tender engineer account

### 4. Kaddour (Admin)
- **Email:** `kaddour@onixgroup.ae`
- **Password:** `kadoour123`
- **Role:** `ADMIN`
- **Full Name:** Kaddour User
- **Access Level:** Full system access
- **Use Case:** Secondary admin account

### 5. Ramiz (Admin)
- **Email:** `ramiz@onixgroup.ae`
- **Password:** `ramiz@123`
- **Role:** `ADMIN`
- **Full Name:** Ramiz User
- **Access Level:** Full system access
- **Use Case:** Secondary admin account

---

## 🎯 Quick Login Reference

### For Testing Admin Features:
```
Email: admin@onixgroup.ae
Password: admin123
Role: ADMIN
```

### For Testing Tender Engineer Features:
```
Email: engineer@onixgroup.ae
Password: engineer@123
Role: TENDER_ENGINEER
```

### For Testing Specific Tender Engineer:
```
Email: anas.ali@onixgroup.ae
Password: anas@123
Role: TENDER_ENGINEER
```

---

## 🔑 Role-Based Access

### ADMIN Role
- ✅ Full system access
- ✅ User management
- ✅ Project management
- ✅ Tender management
- ✅ Client management
- ✅ All reports and analytics

### TENDER_ENGINEER Role
- ✅ View assigned tenders
- ✅ Accept/reject tender invitations
- ✅ Submit technical submissions
- ✅ View project details
- ✅ Update tender status
- ❌ Cannot manage users
- ❌ Cannot create projects

---

## 📝 Login Format

When logging in, you need to provide:
1. **Email** - User's email address
2. **Password** - User's password
3. **Role** - User's role (ADMIN, TENDER_ENGINEER, etc.)

**Example Login Request:**
```json
{
  "email": "admin@onixgroup.ae",
  "password": "admin123",
  "role": "ADMIN"
}
```

---

## 🧪 Testing Scenarios

### Scenario 1: Admin Login
```
Email: admin@onixgroup.ae
Password: admin123
Role: ADMIN
Expected: Full dashboard access
```

### Scenario 2: Tender Engineer Login
```
Email: engineer@onixgroup.ae
Password: engineer@123
Role: TENDER_ENGINEER
Expected: Tender dashboard access
```

### Scenario 3: Multiple Admin Accounts
```
Option 1: admin@onixgroup.ae / admin123
Option 2: kaddour@onixgroup.ae / kadoour123
Option 3: ramiz@onixgroup.ae / ramiz@123
All have ADMIN role
```

---

## ⚠️ Security Notes

1. **These are test credentials** - Change passwords in production
2. **Passwords are hashed** - Stored using bcrypt in database
3. **Role is required** - Must match user's actual role
4. **Force password change** - Some users may be required to change password on first login

---

## 🔄 Creating New Users

To create new users, use the admin account to:
1. Navigate to User Management
2. Click "Add New User"
3. Fill in user details
4. Set initial password
5. Assign appropriate role

---

## 📞 Support

If you need to reset a password or create a new user:
- Use admin account: `admin@onixgroup.ae` / `admin123`
- Navigate to User Management section
- Reset password or create new user

---

## ✅ Quick Copy-Paste Credentials

**Admin:**
```
admin@onixgroup.ae
admin123
ADMIN
```

**Tender Engineer:**
```
engineer@onixgroup.ae
engineer@123
TENDER_ENGINEER
```

**Anas Ali:**
```
anas.ali@onixgroup.ae
anas@123
TENDER_ENGINEER
```

**Kaddour:**
```
kaddour@onixgroup.ae
kadoour123
ADMIN
```

**Ramiz:**
```
ramiz@onixgroup.ae
ramiz@123
ADMIN
```

---

**Last Updated:** Based on `prisma/seed.ts` file
**Total Users:** 5 users (3 Admin, 2 Tender Engineers)



