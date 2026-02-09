# 🗑️ Delete All Employees Guide

## 🔍 Why Are Employees Loading?

Employees are loading because they exist in your database. They were likely created through:

1. **Invitation Process**: When engineers accept tender invitations, they may be created as employees
2. **Manual Creation**: Someone used the "Create Employee" form in the ERP system
3. **Testing**: Test employees created during development
4. **Seed Script**: The seed script creates one test employee (`employee@onixgroup.ae`)

The `getEmployees` endpoint fetches all users with roles: `EMPLOYEE`, `HR`, or `PROJECT_MANAGER` (excluding `ADMIN` and `TENDER_ENGINEER`).

## ✅ Solution: Delete All Employees

### Option 1: Use the Delete Script (Recommended)

1. **Stop the dev server** (if running):
   ```powershell
   # Press Ctrl+C in the terminal running the server
   ```

2. **Run the delete script**:
   ```powershell
   cd backend
   node delete-all-employees.js
   ```

3. **The script will**:
   - Show you all employees that will be deleted
   - Wait 5 seconds (press Ctrl+C to cancel)
   - Delete all employees (preserving ADMIN and TENDER_ENGINEER users)
   - Show a summary of deletions

### Option 2: Delete via Database Directly

If you prefer to delete directly from the database:

```sql
-- Connect to your PostgreSQL database
-- WARNING: This will delete ALL employees except ADMIN and TENDER_ENGINEER

DELETE FROM "users" 
WHERE role NOT IN ('ADMIN', 'TENDER_ENGINEER');
```

## 🛡️ What Gets Preserved?

The script **preserves**:
- ✅ `ADMIN` users (needed for system access)
- ✅ `TENDER_ENGINEER` users (needed for tender management)

The script **deletes**:
- ❌ `EMPLOYEE` users
- ❌ `HR` users  
- ❌ `PROJECT_MANAGER` users

## ⚠️ Important Notes

1. **Cascading Deletes**: Related records (project assignments, task assignments, etc.) will be automatically deleted due to Prisma schema relationships.

2. **Backup First**: If you have important employee data, backup your database before running the script:
   ```powershell
   # PostgreSQL backup example
   pg_dump -U your_username -d your_database > backup_before_delete.sql
   ```

3. **After Deletion**: The employee list will be empty. You can create new employees through the ERP interface when needed.

## 🔄 Preventing Future Unwanted Employees

To prevent employees from being created automatically:

1. **Review Invitation Process**: Check `invitations.controller.ts` - when engineers accept invitations, ensure they're not automatically created as employees.

2. **Disable Employee Creation**: If you don't want employees created at all, you can:
   - Comment out the employee creation endpoint
   - Add additional validation/restrictions
   - Require admin approval before employee creation

3. **Review Seed Script**: The `prisma/seed.ts` file creates one test employee. You can remove it if not needed.

## 📋 Verification

After running the script, verify:

1. **Check Employee List**: Refresh the frontend - should show 0 employees
2. **Check Database**:
   ```sql
   SELECT COUNT(*) FROM "users" WHERE role NOT IN ('ADMIN', 'TENDER_ENGINEER');
   -- Should return 0
   ```
3. **Check Admin Users Still Exist**:
   ```sql
   SELECT email, role FROM "users" WHERE role IN ('ADMIN', 'TENDER_ENGINEER');
   -- Should show your admin/engineer accounts
   ```

## 🚨 Troubleshooting

### Error: "Cannot delete employee due to foreign key constraint"

**Solution**: The script handles cascading deletes automatically. If you still get errors:
1. Check which relationships are blocking deletion
2. Manually remove those relationships first
3. Then delete the employee

### Employees Still Appearing After Deletion

**Possible Causes**:
1. Frontend cache - refresh the page (Ctrl+F5)
2. Database transaction not committed - check database directly
3. Different database connection - verify DATABASE_URL in `.env`

### Script Hangs or Takes Too Long

**Solution**: 
- Check database connection
- Verify no other processes are using the database
- Try deleting in smaller batches

## 📝 Example Output

When you run the script, you'll see:

```
🔍 Finding all employees to delete...
📊 Found 5 employees to delete:
   1. tstta all (tstta@gmail.com) - Role: EMPLOYEE
   2. MOHAMMED NAZAR (mohammadnazar@onixgroup.ae) - Role: EMPLOYEE
   3. mohammed pv (mohammed.pv@onixgroup.ae) - Role: EMPLOYEE
   4. GHOUSUE ALIKHAN (taliabkhan@onixgroup.ae) - Role: EMPLOYEE
   5. mohammed nazer (mohammed.nazer@onixgroup.ae) - Role: EMPLOYEE

⚠️  WARNING: This will permanently delete all employees!
⚠️  ADMIN and TENDER_ENGINEER users will be preserved.

Press Ctrl+C to cancel, or wait 5 seconds to proceed...

🗑️  Starting deletion...
   ✅ Deleted: tstta all (tstta@gmail.com)
   ✅ Deleted: MOHAMMED NAZAR (mohammadnazar@onixgroup.ae)
   ✅ Deleted: mohammed pv (mohammed.pv@onixgroup.ae)
   ✅ Deleted: GHOUSUE ALIKHAN (taliabkhan@onixgroup.ae)
   ✅ Deleted: mohammed nazer (mohammed.nazer@onixgroup.ae)

📊 Deletion Summary:
   ✅ Successfully deleted: 5 employees
   ❌ Errors: 0 employees

🔍 Verification: 0 employees remaining in database.
✅ All employees successfully deleted!
```
