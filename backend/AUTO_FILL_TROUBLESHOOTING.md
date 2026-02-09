# Auto-Fill Contract Reference - Troubleshooting Guide

## 🔍 Issue: Auto-Fill Not Working

### **What Was Fixed:**

1. ✅ **Improved API Response Handling** - Fixed `contractsAPI.js` to properly handle backend responses
2. ✅ **Added Manual Trigger Button** - Added "Load Contract" button for manual fetching
3. ✅ **Added Enter Key Support** - Press Enter to trigger auto-fill
4. ✅ **Enhanced Logging** - Added console logs to debug API calls
5. ✅ **Better Error Messages** - More descriptive error messages

---

## 🧪 How to Test

### **Step 1: Open Browser Console**
- Press `F12` or `Ctrl+Shift+I` to open Developer Tools
- Go to **Console** tab
- Keep it open to see debug logs

### **Step 2: Open Project Creation Form**
- Click **"New Project"** button in the project list
- The **AddProjectModal** should open

### **Step 3: Enter Contract Reference**
- Look for the **blue section** at the top: "Contract Reference Number (Optional - Auto-Fill)"
- Enter a contract reference (e.g., `O-CT-ABC123` or `1234`)
- You should see console logs:
  ```
  🔍 Fetching contract data for reference: O-CT-ABC123
  📡 Calling ContractsAPI.getContractByReferenceNumber...
  📡 Fetching contract from: http://localhost:3001/api/contracts/by-reference?referenceNumber=...
  ```

### **Step 4: Trigger Auto-Fill**
**Option A:** Click **"Load Contract"** button  
**Option B:** Press **Enter** key  
**Option C:** Click outside the field (onBlur)

### **Step 5: Check Results**

**✅ Success:**
- Green checkmark appears: "Contract data loaded successfully!"
- Form fields auto-fill with contract data
- Console shows: `✅ Contract found! Auto-filling form with: {...}`

**❌ Error:**
- Red error message appears
- Console shows error details
- Check console for specific error message

---

## 🐛 Common Issues & Solutions

### **Issue 1: "Contract not found"**
**Possible Causes:**
- Contract reference number is incorrect
- Contract doesn't exist in database
- Reference number has extra spaces

**Solution:**
- Verify contract reference in Contracts page
- Check for typos
- Try copying reference number directly

**Debug:**
```javascript
// Check console logs:
📥 API Response received: { success: false, message: "..." }
```

---

### **Issue 2: "Failed to fetch contract data"**
**Possible Causes:**
- Backend server not running
- Network error
- CORS issue
- Authentication token expired

**Solution:**
1. Check if backend is running: `http://localhost:3001/api/health`
2. Check browser console for network errors
3. Refresh page and login again
4. Check Network tab in DevTools for failed requests

**Debug:**
```javascript
// Check console logs:
❌ Error fetching contract: Error: ...
// Check Network tab for failed request
```

---

### **Issue 3: "Form fields not auto-filling"**
**Possible Causes:**
- API returns success but `projectData` is missing
- Response format mismatch
- Form state not updating

**Solution:**
1. Check console logs for response structure:
   ```javascript
   📥 API Response received: {
     success: true,
     projectData: { ... }  // ← Should exist
   }
   ```
2. Verify backend returns `projectData` object
3. Check if form fields are being updated (console log shows updated formData)

**Debug:**
```javascript
// Check console logs:
✅ Contract found! Auto-filling form with: {...}
📝 Form data updated: {...}
```

---

### **Issue 4: "Loading... but nothing happens"**
**Possible Causes:**
- API call hanging
- Backend timeout
- Network slow

**Solution:**
1. Wait 10-15 seconds
2. Check Network tab for pending requests
3. Check backend logs for errors
4. Try refreshing and trying again

---

## 🔧 Debug Checklist

### **Frontend Checks:**
- [ ] Browser console shows API call logs
- [ ] Network tab shows request to `/api/contracts/by-reference`
- [ ] Request has `Authorization: Bearer <token>` header
- [ ] Response status is 200 (not 404/500)
- [ ] Response body contains `success: true` and `projectData`

### **Backend Checks:**
- [ ] Backend server is running
- [ ] Database connection is working
- [ ] Contract exists in database with matching reference number
- [ ] Backend logs show contract query
- [ ] Backend returns `projectData` object

### **API Endpoint Test:**
Test the endpoint directly:
```bash
# Replace YOUR_TOKEN and REFERENCE_NUMBER
curl -X GET "http://localhost:3001/api/contracts/by-reference?referenceNumber=1234" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "data": { ... },
  "projectData": {
    "name": "...",
    "owner": "...",
    "startDate": "...",
    ...
  },
  "message": "Contract found. Project form can be auto-filled."
}
```

---

## 📋 Step-by-Step Debugging

1. **Open Browser Console** (F12)
2. **Open Project Modal** (Click "New Project")
3. **Enter Contract Reference** (e.g., `1234`)
4. **Click "Load Contract"** or press Enter
5. **Check Console Logs:**
   - Should see: `🔍 Fetching contract data for reference: 1234`
   - Should see: `📡 Fetching contract from: http://localhost:3001/api/contracts/by-reference?referenceNumber=1234`
   - Should see: `📥 Response status: 200 OK`
   - Should see: `✅ Contract API response: { success: true, projectData: {...} }`
   - Should see: `✅ Contract found! Auto-filling form with: {...}`
   - Should see: `📝 Form data updated: {...}`

6. **Check Network Tab:**
   - Find request to `/contracts/by-reference`
   - Check Status: Should be `200`
   - Check Response: Should have `success: true` and `projectData`

7. **If Error:**
   - Check error message in console
   - Check Network tab for failed request
   - Check backend logs
   - Verify contract reference exists

---

## 🎯 Quick Fixes

### **Fix 1: Clear Browser Cache**
```bash
# In browser:
Ctrl+Shift+Delete → Clear cache → Reload page
```

### **Fix 2: Restart Backend**
```bash
cd backend
npm run dev
```

### **Fix 3: Check Token**
```javascript
// In browser console:
localStorage.getItem('token')  // Should return a token string
```

### **Fix 4: Test API Directly**
Open browser and go to:
```
http://localhost:3001/api/contracts/by-reference?referenceNumber=1234
```
(Will need to add Authorization header manually or use Postman)

---

## 📞 Still Not Working?

**Check these:**
1. ✅ Backend server is running (`http://localhost:3001`)
2. ✅ Frontend is running (`http://localhost:3000`)
3. ✅ User is logged in (has valid token)
4. ✅ Contract exists in database with exact reference number
5. ✅ Browser console shows no JavaScript errors
6. ✅ Network tab shows API request is being made
7. ✅ API response has correct format

**Provide these details when reporting:**
- Browser console logs (copy all logs)
- Network tab request/response (screenshot)
- Backend terminal logs (if available)
- Contract reference number you're trying
- Expected vs actual behavior

---

**Last Updated:** 2026-02-03
