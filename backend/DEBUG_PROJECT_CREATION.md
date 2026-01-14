# 🔍 Debugging Project Creation Issue

## Problem
User says they inserted one project, but:
- Database shows 0 projects
- Dashboard shows "Active Projects = 0"

This means **the project was NOT saved to the database**.

---

## 🔍 Investigation Steps

### Step 1: Check Backend Logs
Look for these log messages when creating a project:
```
📝 Creating project: <project name>
   Reference Number: <ref number>
   Status: OPEN (will count as ACTIVE)
   Created By: <user id>
✅ Project created successfully: <project id>
   Final Status: OPEN
   Verified in DB: { id: ..., status: 'OPEN', ... }
```

**If you DON'T see these logs:**
- Project creation request never reached backend
- Check frontend console for API errors
- Check network tab for failed requests

**If you see error logs:**
- Check what error occurred
- Common errors: validation failure, duplicate reference number, database connection issue

### Step 2: Check Frontend Console
Open browser console (F12) and look for:
- API request to `/api/projects` (POST)
- Response status (should be 201)
- Response data (should include project details)
- Any error messages

### Step 3: Check Network Tab
1. Open browser DevTools → Network tab
2. Create a project
3. Look for POST request to `/api/projects`
4. Check:
   - Status code (should be 201 Created)
   - Request payload (should include name, referenceNumber)
   - Response body (should include created project)

### Step 4: Verify Project Creation Endpoint
The endpoint should be:
- **URL:** `POST http://192.168.1.54:3001/api/projects`
- **Headers:** `Authorization: Bearer <token>`
- **Body:** JSON with `name` and `referenceNumber` (required)

---

## 🐛 Common Issues

### Issue 1: Missing Required Fields
**Error:** "Name and reference number are required"
**Fix:** Ensure frontend sends both `name` and `referenceNumber`

### Issue 2: Duplicate Reference Number
**Error:** "Project with this reference number already exists"
**Fix:** Use a unique reference number

### Issue 3: Authentication Failed
**Error:** 401 Unauthorized
**Fix:** Check if token is valid and included in request

### Issue 4: Database Connection Error
**Error:** Database query failed
**Fix:** Check database connection, verify DATABASE_URL in .env

### Issue 5: Frontend Not Calling API
**Symptom:** No network request appears
**Fix:** Check if frontend code actually calls the API endpoint

---

## ✅ Quick Test

### Test Project Creation via API Directly:

```bash
# Get your auth token first (from login)
TOKEN="your_jwt_token_here"

# Create a test project
curl -X POST http://192.168.1.54:3001/api/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Project",
    "referenceNumber": "TEST-001"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Project created successfully",
  "data": {
    "id": "...",
    "name": "Test Project",
    "referenceNumber": "TEST-001",
    "status": "OPEN",
    ...
  }
}
```

Then check database:
```bash
cd backend
node check-projects.js
```

Should show 1 project.

---

## 📋 Checklist

- [ ] Check backend console for project creation logs
- [ ] Check frontend console for API errors
- [ ] Check network tab for POST request to `/api/projects`
- [ ] Verify request includes `name` and `referenceNumber`
- [ ] Verify response status is 201 (not 400 or 500)
- [ ] Check if project appears in database after creation
- [ ] Verify project status is `OPEN` or `IN_PROGRESS`

---

## 🎯 Next Steps

1. **Check backend logs** - Look for project creation logs
2. **Check frontend console** - Look for API errors
3. **Check network tab** - Verify API call is made
4. **Test API directly** - Use curl/Postman to test endpoint
5. **Verify database** - Run `node check-projects.js` after creation

---

**Please check backend console logs and frontend console/network tab to identify why project creation is failing!**

