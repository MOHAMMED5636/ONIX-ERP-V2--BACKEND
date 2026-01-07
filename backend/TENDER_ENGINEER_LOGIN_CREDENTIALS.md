# 🔐 Tender Engineer Login Credentials

## ✅ Correct Login Credentials

### **Anas Ali - Tender Engineer**

| Field | Value |
|-------|-------|
| **Email** | `anas.ali@onixgroup.ae` |
| **Password** | `anas@123` |
| **Role** | `TENDER_ENGINEER` |

---

## ⚠️ Common Mistakes

### **❌ Wrong Email:**
- `anas.al@onixgroup.se` ← Wrong domain (.se instead of .ae)
- `anas.al@onixgroup.ae` ← Missing 'i' in 'ali'

### **✅ Correct Email:**
- `anas.ali@onixgroup.ae` ← Correct!

---

## 🔍 Login Steps

1. **Go to:** `http://localhost:3000/login/tender-engineer`
2. **Enter Email:** `anas.ali@onixgroup.ae`
3. **Enter Password:** `anas@123`
4. **Select Role:** `TENDER_ENGINEER` (should be auto-selected)
5. **Click Login**

---

## 📝 All Available Tender Engineer Accounts

| Email | Password | Name |
|-------|----------|------|
| `engineer@onixgroup.ae` | `engineer@123` | Tender Engineer |
| `anas.ali@onixgroup.ae` | `anas@123` | Anas Ali |

---

## 🐛 If Login Still Fails

1. **Check email spelling:**
   - ✅ `anas.ali@onixgroup.ae` (with 'ali' and '.ae')
   - ❌ `anas.al@onixgroup.se` (wrong)

2. **Check password:**
   - ✅ `anas@123`
   - ❌ `anas123` (missing @)

3. **Verify user exists in database:**
   ```bash
   cd backend
   npx prisma studio
   # Check users table for anas.ali@onixgroup.ae
   ```

4. **Re-run seed if needed:**
   ```bash
   cd backend
   npm run prisma:seed
   ```

---

## ✅ Quick Copy-Paste

**Email:**
```
anas.ali@onixgroup.ae
```

**Password:**
```
anas@123
```

---

**Use the exact email: `anas.ali@onixgroup.ae` (not `anas.al@onixgroup.se`)** 🔐



