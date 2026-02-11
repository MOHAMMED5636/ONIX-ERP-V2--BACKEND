# Fix Internal Server Error - Questionnaire Questions

## Problem
Getting "Internal server error" when creating questionnaire questions for sub-tasks.

## Root Cause
The Prisma client types are out of sync with the database schema. The server is running with old Prisma client types that don't include the new questionnaire models.

## Solution Steps

### Step 1: STOP THE SERVER
**CRITICAL:** You MUST stop the backend server first!

1. In VS Code terminal where server is running
2. Press `Ctrl+C` to stop
3. Wait until you see the command prompt return
4. **DO NOT** proceed until server is fully stopped

### Step 2: Navigate to Backend Directory
```powershell
cd c:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend
```

### Step 3: Regenerate Prisma Client
```powershell
npx prisma generate
```

**Expected output:**
```
✔ Generated Prisma Client (v5.22.0) to .\node_modules\@prisma\client
```

### Step 4: Restart Server
```powershell
npm run dev
```

### Step 5: Test Again
1. Go to frontend
2. Click checklist button on a sub-task
3. Try creating a question
4. Check backend terminal for detailed logs

## What I've Fixed

1. ✅ Added detailed logging in `createQuestion` function
2. ✅ Added better error handling for Prisma errors
3. ✅ Added request body logging to see what data is being sent
4. ✅ Added validation error messages

## Check Backend Logs

After restarting, when you create a question, you should see:

**✅ Success:**
```
📝 Creating questionnaire question...
📝 Request body: {...}
📝 User: { id: "...", role: "..." }
📝 Parsed data: {...}
📝 Attempting to create question in database...
✅ Question created successfully: <id>
```

**❌ If Error:**
```
❌ Create question error: <error>
❌ Error details: {
  message: "...",
  code: "...",
  meta: {...}
}
❌ Request body: {...}
```

## Common Errors

### Error: "Property 'questionnaireQuestion' does not exist"
**Cause:** Prisma client not regenerated
**Fix:** Stop server, run `npx prisma generate`, restart server

### Error: "Table 'questionnaire_questions' does not exist"
**Cause:** Migration not applied
**Fix:** Run `npx prisma migrate deploy`

### Error: "EPERM: operation not permitted"
**Cause:** Server still running
**Fix:** Stop server completely before running `npx prisma generate`

## Verification

After fixing, verify:
1. ✅ Server starts without TypeScript errors
2. ✅ No "Property does not exist" errors in terminal
3. ✅ Creating a question shows success logs
4. ✅ Question appears in database
