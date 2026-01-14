# 🔧 Upload Troubleshooting Guide

## Common Upload Issues and Solutions

### Issue 1: "Cannot upload document/photo"

**Possible Causes:**
1. File size too large (exceeds 5MB for photos, 10MB for documents)
2. Invalid file type
3. Network/CORS issues
4. Backend not receiving the file
5. Multer configuration error

**Solutions:**

#### Check File Size
- Photos: Max 5MB
- Documents: Max 10MB
- If file is too large, compress it or reduce quality

#### Check File Type
- Photos: JPEG, PNG, GIF, WebP only
- Documents: PDF, Word, Excel, text, images

#### Check Backend Logs
Look for these messages in backend console:
- `📸 Profile update request received` - Request received
- `📸 File filter check:` - File type validation
- `📸 Generated filename:` - Filename generated
- `✅ File exists at multer path` - File saved successfully

#### Check Browser Console
Look for:
- Network errors (404, 500, etc.)
- CORS errors
- FormData contents logged
- API response logged

### Issue 2: File Not Being Received

**Symptoms:**
- Backend logs show "Has file: false"
- No file details in logs

**Solutions:**
1. **Check FormData field name:**
   - For profile photo: Must be `photo`
   - For documents: Must be `file`
   - Check frontend code to ensure correct field name

2. **Check Content-Type header:**
   - Should NOT be set manually for FormData
   - Browser sets it automatically with boundary
   - Remove any `Content-Type: application/json` headers

3. **Check request size:**
   - Increase body parser limit if needed
   - Already set to 10mb in `app.ts`

### Issue 3: File Saved But Not Displaying

**Symptoms:**
- File exists in `uploads/photos/` directory
- Database updated with filename
- But photo doesn't show in UI

**Solutions:**
1. **Check photo URL in response:**
   - Should be: `http://192.168.1.54:3001/uploads/photos/{filename}`
   - Check browser console for photo URL

2. **Check static file serving:**
   - Verify `/uploads` route is configured in `app.ts`
   - Check file permissions

3. **Clear browser cache:**
   - Hard refresh: `Ctrl+Shift+R`
   - Or clear cache manually

### Issue 4: Multer Errors

**Common Errors:**
- `MulterError: File too large`
- `MulterError: Unexpected field`
- `Invalid file type`

**Solutions:**
1. **File too large:**
   - Reduce file size
   - Or increase limit in `upload.middleware.ts`

2. **Unexpected field:**
   - Check field name matches exactly
   - Profile: `photo`
   - Documents: `file`

3. **Invalid file type:**
   - Check file MIME type
   - Ensure file extension matches content

## Debugging Steps

### Step 1: Check Backend Logs
```bash
# Look for these messages:
📸 Profile update request received
📸 File filter check: { ... }
📸 Generated filename: ...
✅ File exists at multer path
✅ Photo will be updated to: ...
✅ Sending response with photo: ...
```

### Step 2: Check Browser Console
```javascript
// Should see:
Uploading profile with FormData:
photo: filename.jpg (12345 bytes)
jobTitle: project manager

Profile update response: { success: true, data: { ... } }
Updated photo path: http://192.168.1.54:3001/uploads/photos/...
```

### Step 3: Check Network Tab
- Status: Should be `200 OK`
- Request payload: Should show FormData
- Response: Should include `data.photo` URL

### Step 4: Verify File System
```bash
# Check if file exists:
ls backend/uploads/photos/
# Should see the uploaded file
```

## Quick Fixes

### Fix 1: Increase File Size Limit
Edit `backend/src/middleware/upload.middleware.ts`:
```typescript
limits: {
  fileSize: 10 * 1024 * 1024, // 10MB (increase if needed)
}
```

### Fix 2: Add More File Types
Edit `backend/src/middleware/upload.middleware.ts`:
```typescript
const allowedMimes = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  // Add more if needed
];
```

### Fix 3: Check CORS Configuration
Ensure `app.ts` allows file uploads:
```typescript
app.use(cors({
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

## Test Upload

### Test Profile Photo Upload:
1. Go to Settings page
2. Click "Choose File"
3. Select a JPEG/PNG image (< 5MB)
4. Click "Update Profile"
5. Check backend console for logs
6. Check browser console for response
7. Photo should update immediately

### Test Document Upload:
1. Go to Documents page
2. Click "Upload Document"
3. Fill required fields (module, documentType, year, sequence)
4. Select file (PDF/Word/Excel)
5. Click "Upload"
6. Check backend console for logs

## Still Not Working?

1. **Check backend is running:**
   ```bash
   curl http://192.168.1.54:3001/health
   ```

2. **Check file permissions:**
   ```bash
   chmod 755 backend/uploads/photos/
   ```

3. **Check disk space:**
   ```bash
   df -h  # Linux/Mac
   # or check in Windows
   ```

4. **Restart backend server:**
   ```bash
   # Stop (Ctrl+C)
   npm run dev
   ```

---

**If issue persists, check the specific error message in backend console or browser console!**

