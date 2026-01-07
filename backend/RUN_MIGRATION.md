# Database Migration Guide

## ⚠️ Important: Run Database Migration

The "Internal server error" on the dashboard is happening because the database migration hasn't been run yet. The new `Task`, `ProjectChecklist`, `TaskChecklist`, and other tables don't exist in your database.

## Quick Fix

### Step 1: Run the Migration

Open a terminal in the `backend` folder and run:

```bash
cd backend
npx prisma migrate dev --name add_project_management
```

**Note:** This is an interactive command. When prompted:
- Review the migration SQL
- Type `y` or press Enter to apply the migration

### Step 2: Verify Migration

After migration completes, you should see:
```
✔ Migration applied successfully
```

### Step 3: Restart Server

The server should automatically restart. If not, restart it manually:
```bash
npm run dev
```

## What the Migration Does

The migration will:
1. ✅ Add new columns to `projects` table (PIN, projectManagerId, dates, etc.)
2. ✅ Change `status` column type to enum (may cause data loss if you have existing projects)
3. ✅ Create new tables:
   - `tasks`
   - `project_checklists`
   - `task_checklists`
   - `project_attachments`
   - `task_attachments`
   - `task_comments`
   - Update `task_assignments` table

## ⚠️ Warning About Data Loss

If you have existing projects with `status` values, they will be lost when the column is converted to enum. The migration will:
- Drop the old `status` column
- Create a new enum type
- Add the new `status` column with enum type

**To preserve data:**
1. Export your existing project data first
2. Or manually edit the migration file to preserve existing status values

## After Migration

Once the migration is complete:
- ✅ Dashboard will work correctly
- ✅ All project management endpoints will be available
- ✅ Task management will be functional

## Troubleshooting

### Error: "Migration already exists"
If you see this error, you can reset and re-run:
```bash
npx prisma migrate reset
npx prisma migrate dev --name add_project_management
```

**Warning:** `migrate reset` will delete all data!

### Error: "Database connection failed"
Check your `.env` file has the correct `DATABASE_URL`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/onix_erp"
```

### Error: "Table already exists"
If tables already exist but migration fails, you may need to:
1. Check what tables exist: `npx prisma db pull`
2. Manually fix the migration file
3. Or reset the database (⚠️ deletes all data)

## Need Help?

Check the Prisma migration docs: https://www.prisma.io/docs/concepts/components/prisma-migrate

