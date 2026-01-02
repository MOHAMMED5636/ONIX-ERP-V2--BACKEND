# 🗄️ Database Migration Steps - Photo & Job Title

## ⚠️ Important: Run Migration First!

The TypeScript errors you see are because the database hasn't been migrated yet. Follow these steps:

---

## Step 1: Run Database Migration

```bash
cd backend
npx prisma migrate dev --name add_photo_jobtitle
```

This will:
- Create a new migration file
- Update your database schema
- Regenerate Prisma Client automatically

---

## Step 2: Verify Migration

After migration, TypeScript errors should disappear. If they persist:

```bash
npx prisma generate
```

---

## Step 3: Test the Changes

1. Start your backend server:
   ```bash
   npm run dev
   ```

2. Test the profile update endpoint:
   ```bash
   # Get your token first by logging in
   curl -X PUT http://localhost:3001/api/auth/profile \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -F "jobTitle=Senior Engineer" \
     -F "photo=@/path/to/your/photo.jpg"
   ```

---

## ✅ After Migration

- ✅ Database will have `photo` and `jobTitle` columns
- ✅ Prisma Client will include these fields
- ✅ TypeScript errors will be resolved
- ✅ API endpoints will work correctly

---

## 🐛 If Migration Fails

If you get errors during migration:

1. **Check if database is running:**
   ```bash
   # Windows PowerShell
   Get-Service -Name "*postgresql*"
   ```

2. **Check DATABASE_URL in .env:**
   ```env
   DATABASE_URL="postgresql://postgres:password@localhost:5432/onix_erp?schema=public"
   ```

3. **Try resetting database (⚠️ WARNING: Deletes all data):**
   ```bash
   npx prisma migrate reset
   ```

---

**Run the migration now to resolve TypeScript errors!** 🚀

