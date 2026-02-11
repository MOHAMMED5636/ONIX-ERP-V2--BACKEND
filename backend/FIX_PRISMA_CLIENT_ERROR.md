# Fix Prisma Client Error - Internal Server Error

## Problem
The backend is showing "Internal server error" when creating questionnaire questions because the Prisma client types are out of sync with the schema.

## Solution Steps

### Step 1: Stop the Backend Server
**IMPORTANT:** You must stop the backend server first before regenerating Prisma client.

1. In VS Code terminal, press `Ctrl+C` to stop the running server
2. Wait for the server to fully stop (you should see the prompt return)

### Step 2: Regenerate Prisma Client
Run this command in the backend directory:

```bash
cd backend
npx prisma generate
```

This will regenerate the Prisma client with the new questionnaire models and types.

### Step 3: Restart the Server
After Prisma client is regenerated, restart your server:

```bash
npm run dev
```

## Verification

After restarting, check:
1. ✅ No TypeScript compilation errors in terminal
2. ✅ Server starts successfully
3. ✅ Database connection successful
4. ✅ Try creating a questionnaire question - should work now

## If Still Getting Errors

If you still get errors after regenerating:

1. **Check Migration Status:**
   ```bash
   npx prisma migrate status
   ```

2. **Apply Migrations if Needed:**
   ```bash
   npx prisma migrate deploy
   ```

3. **Verify Database Tables Exist:**
   ```bash
   npx prisma studio
   ```
   Check if `questionnaire_templates`, `questionnaire_questions`, `questionnaire_responses`, and `questionnaire_assignments` tables exist.

## Common Issues

### Issue: "EPERM: operation not permitted"
**Cause:** Server is still running and has locked the Prisma client files.
**Solution:** Stop the server completely before running `npx prisma generate`.

### Issue: "Migration file not found"
**Cause:** A migration directory exists but the migration.sql file is missing.
**Solution:** Either restore the missing migration file or delete the empty migration directory.

### Issue: TypeScript errors persist
**Cause:** IDE TypeScript server hasn't reloaded.
**Solution:** 
- Restart VS Code TypeScript server: `Ctrl+Shift+P` → "TypeScript: Restart TS Server"
- Or restart VS Code completely
