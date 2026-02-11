# Fix Failed Migration

## Problem
Migration `20260204020000_add_questionnaire_feature` failed and is blocking new migrations.

## Solution Options

### Option 1: Mark Migration as Rolled Back (if tables don't exist)

If the questionnaire tables don't exist in your database, mark the migration as rolled back:

```bash
cd backend
npx prisma migrate resolve --rolled-back 20260204020000_add_questionnaire_feature
```

### Option 2: Mark Migration as Applied (if tables already exist)

If the questionnaire tables already exist, mark the migration as applied:

```bash
cd backend
npx prisma migrate resolve --applied 20260204020000_add_questionnaire_feature
```

### Option 3: Manually Fix and Re-run

1. Check if tables exist:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'questionnaire%';
```

2. If tables exist but migration failed:
   - Mark as applied: `npx prisma migrate resolve --applied 20260204020000_add_questionnaire_feature`

3. If tables don't exist:
   - Mark as rolled back: `npx prisma migrate resolve --rolled-back 20260204020000_add_questionnaire_feature`
   - Then manually run the SQL if needed

### Option 4: Reset Migration History (DANGER - Only for Development)

**⚠️ WARNING: Only use this if you're okay losing data or in development!**

```bash
cd backend
# This will reset all migrations
npx prisma migrate reset
```

---

## After Resolving

Once the failed migration is resolved, run:

```bash
# Apply the new task hierarchy migration
npx prisma migrate deploy

# Regenerate Prisma client
npx prisma generate
```

---

## Quick Check Commands

Check migration status:
```bash
npx prisma migrate status
```

Check if questionnaire tables exist:
```sql
\dt questionnaire*
```
