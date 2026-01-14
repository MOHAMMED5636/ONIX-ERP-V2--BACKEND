# 🔧 Troubleshoot Tender Engineer Login

## 🐛 Issue: "Invalid email or password"

Even with correct credentials (`anas.ali@onixgroup.ae` / `anas@123`), login is failing.

---

## 🔍 Debug Steps

### **Step 1: Verify User Exists**

Check if the user was created in the database:

```bash
cd backend
npx prisma studio
```

Then:
1. Open `http://localhost:5555`
2. Click on `User` table
3. Search for `anas.ali@onixgroup.ae`
4. Verify:
   - ✅ Email: `anas.ali@onixgroup.ae`
   - ✅ Role: `TENDER_ENGINEER`
   - ✅ isActive: `true`

### **Step 2: Check Role Match**

The login controller checks: `if (!user || user.role !== role)`

**Important:** The frontend must send `role: "TENDER_ENGINEER"` in the login request.

Check browser Network tab:
1. Open DevTools (F12)
2. Go to Network tab
3. Try to login
4. Check the login request payload
5. Verify `role` field is `"TENDER_ENGINEER"`

### **Step 3: Re-run Seed**

If user doesn't exist, re-run seed:

```bash
cd backend
npm run prisma:seed
```

### **Step 4: Check Backend Logs**

Check your backend terminal for error messages when you try to login.

---

## 🔧 Quick Fixes

### **Fix 1: Re-create User**

```bash
cd backend
npm run prisma:seed
```

### **Fix 2: Verify Role in Frontend**

Make sure the frontend login form is sending:
```json
{
  "email": "anas.ali@onixgroup.ae",
  "password": "anas@123",
  "role": "TENDER_ENGINEER"
}
```

### **Fix 3: Check Backend is Running**

Make sure backend server is running:
```bash
cd backend
npm run dev
```

Should see: `Server running on port 3001`

---

## 📝 Login Controller Logic

The login checks:
1. ✅ User exists by email
2. ✅ User role matches request role
3. ✅ Password is correct (bcrypt compare)
4. ✅ User is active

If any check fails → "Invalid credentials"

---

## ✅ Test with Known Working Account

Try the demo account first:
- Email: `engineer@onixgroup.ae`
- Password: `engineer@123`
- Role: `TENDER_ENGINEER`

If this works, the issue is with the Anas account.
If this doesn't work, the issue is with the login system.

---

## 🎯 Most Likely Issues

1. **User not in database** → Re-run seed
2. **Role mismatch** → Check frontend sends `TENDER_ENGINEER`
3. **Backend not running** → Start backend server
4. **Password hash issue** → Re-run seed to regenerate hash

---

**Check Prisma Studio first to verify the user exists!** 🔍





