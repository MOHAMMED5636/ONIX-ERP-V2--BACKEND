# 👤 New Tender Engineer Credentials

## ✅ User Created

A new tender engineer user has been added to the seed file.

---

## 📝 Credentials

| Field | Value |
|-------|-------|
| **Email** | `anas.ali@onixgroup.ae` |
| **Password** | `anas@123` |
| **Role** | `TENDER_ENGINEER` |
| **First Name** | `Anas` |
| **Last Name** | `Ali` |

---

## 🚀 How to Create the User

### **Option 1: Run Seed File (Recommended)**

```bash
cd backend
npm run prisma:seed
```

Or:
```bash
npx prisma db seed
```

### **Option 2: Run Seed Script Directly**

```bash
cd backend
ts-node prisma/seed.ts
```

---

## ✅ After Running Seed

The user will be created in the database and can login at:
- **URL:** `http://localhost:3000/login/tender-engineer`
- **Email:** `anas.ali@onixgroup.ae`
- **Password:** `anas@123`
- **Role:** `TENDER_ENGINEER`

---

## 🔍 Verify User Created

After running the seed, you can verify the user was created:

```bash
# Using Prisma Studio
npx prisma studio

# Or check database directly
# SELECT * FROM users WHERE email = 'anas.ali@onixgroup.ae';
```

---

## 📝 All Tender Engineer Users

After seeding, you'll have these tender engineer accounts:

1. **engineer@onixgroup.ae** / `engineer@123`
2. **anas.ali@onixgroup.ae** / `anas@123` ⭐ NEW

---

## 🎯 Next Steps

1. **Run the seed file** to create the user
2. **Test login** at `/login/tender-engineer`
3. **Assign tenders** to this engineer via the admin panel

---

**The new tender engineer user is ready to be created!** 🚀



