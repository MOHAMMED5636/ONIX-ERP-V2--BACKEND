# Migration Steps - After Resolving Failed Migration

## Step-by-Step Commands

### 1. Resolve the Failed Migration (if not done yet)
```powershell
cd c:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma migrate resolve --applied 20260204020000_add_questionnaire_feature
```
OR if tables don't exist:
```powershell
npx prisma migrate resolve --rolled-back 20260204020000_add_questionnaire_feature
```

### 2. Apply the New Task Hierarchy Migration
```powershell
npx prisma migrate deploy
```
This will apply the `20260205000000_add_task_hierarchy_and_fields` migration that adds:
- `parentTaskId` column
- All missing fields (category, referenceNumber, planDays, etc.)
- Foreign keys and indexes

### 3. Regenerate Prisma Client
```powershell
npx prisma generate
```
This updates TypeScript types to recognize the new fields and relations.

### 4. Verify Migration Status
```powershell
npx prisma migrate status
```
Should show all migrations as applied.

### 5. Restart Backend Server
```powershell
npm run dev
# or
npm start
```

---

## Quick Copy-Paste (All Commands)

```powershell
cd c:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
npx prisma migrate resolve --applied 20260204020000_add_questionnaire_feature
npx prisma migrate deploy
npx prisma generate
npx prisma migrate status
npm run dev
```

---

## What Each Command Does

1. **`migrate resolve`** - Marks the failed migration as resolved
2. **`migrate deploy`** - Applies pending migrations (your new task hierarchy migration)
3. **`prisma generate`** - Regenerates Prisma client with new schema types
4. **`migrate status`** - Verifies all migrations are applied
5. **`npm run dev`** - Starts your server with the updated schema

---

## Expected Output

After `migrate deploy`, you should see:
```
✅ Applied migration `20260205000000_add_task_hierarchy_and_fields`
```

After `prisma generate`, you should see:
```
✔ Generated Prisma Client
```

---

## Troubleshooting

If `migrate deploy` fails:
- Check PostgreSQL is running
- Verify DATABASE_URL in `.env` is correct
- Check if columns already exist (migration uses `IF NOT EXISTS` so should be safe)

If TypeScript errors persist:
- Restart VS Code TypeScript server (Ctrl+Shift+P → "TypeScript: Restart TS Server")
- The `as any` assertions in code will work until types are regenerated
