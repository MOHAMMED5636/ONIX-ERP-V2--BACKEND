# 📸 Photo Storage - Where Photos Are Stored

## 📍 Photo Storage Location

Photos are stored in **TWO places**:

---

## 1️⃣ **Physical Files (File System)**

### **Location:**
```
backend/uploads/photos/
```

### **Full Path:**
```
C:\Users\Lenovo\Desktop\Onix-ERP-Backend\backend\uploads\photos\
```

### **Example Files:**
- `mamoun-1767089270428-517431684.jpg`
- `pv-1767089436489-919615530.jpg`
- `pv-1767092223540-931796858.jpg`

### **How Files Are Named:**
- Format: `{originalname}-{timestamp}-{random}.{extension}`
- Example: `mamoun-1767089803304-473204263.jpg`
  - Original name: `mamoun`
  - Timestamp: `1767089803304`
  - Random number: `473204263`
  - Extension: `.jpg`

### **File Storage Details:**
- ✅ **Storage Type:** File system (disk storage)
- ✅ **Directory:** `backend/uploads/photos/`
- ✅ **Created by:** Multer middleware (`upload.middleware.ts`)
- ✅ **Max File Size:** 5MB
- ✅ **Allowed Formats:** JPEG, PNG, GIF, WebP

---

## 2️⃣ **Database (PostgreSQL)**

### **Database:** PostgreSQL
### **Table:** `users`
### **Column:** `photo` (String, nullable)

### **What's Stored:**
- ✅ **Only the filename** (not the actual image)
- ✅ Example: `pv-1767092223540-931796858.jpg`
- ✅ **NOT stored:** The actual image file/binary data

### **Database Schema:**
```prisma
model User {
  id                  String   @id @default(uuid())
  email               String   @unique
  // ... other fields ...
  photo               String?  // Photo URL or file path (filename only)
  // ... other fields ...
}
```

### **Example Database Record:**
```sql
SELECT id, email, firstName, lastName, photo FROM users;

-- Result:
id: "abc-123-def"
email: "ramiz@onixgroup.ae"
firstName: "Ramiz"
lastName: "User"
photo: "pv-1767092223540-931796858.jpg"  ← Only filename stored
```

---

## 🔄 How It Works

### **Step 1: Photo Upload**
1. User uploads photo via Settings page
2. Frontend sends photo to: `PUT /api/auth/profile`
3. Backend receives photo via Multer middleware

### **Step 2: File Storage**
1. Multer saves file to: `backend/uploads/photos/{filename}`
2. File gets unique name: `{originalname}-{timestamp}-{random}.{ext}`
3. Physical file is stored on disk

### **Step 3: Database Storage**
1. Backend saves **only the filename** to database
2. Updates `users.photo` column with filename
3. Example: `photo = "pv-1767092223540-931796858.jpg"`

### **Step 4: Photo Retrieval**
1. Backend reads filename from database: `users.photo`
2. Constructs full URL: `http://localhost:3001/uploads/photos/{filename}`
3. Returns URL to frontend
4. Frontend displays image from file system

---

## 📊 Storage Summary

| Storage Type | Location | What's Stored | Size |
|-------------|----------|---------------|------|
| **File System** | `backend/uploads/photos/` | Actual image files | ~50KB - 5MB per file |
| **Database** | PostgreSQL `users.photo` | Filename only | ~50-100 bytes per filename |

---

## 🔍 How to View Photos

### **Method 1: File System**
```bash
# Navigate to photos directory
cd backend/uploads/photos

# List all photos
ls
# or
dir  # Windows
```

### **Method 2: Database**
```sql
-- View all users with photos
SELECT id, email, firstName, lastName, photo 
FROM users 
WHERE photo IS NOT NULL;

-- View specific user's photo filename
SELECT photo FROM users WHERE email = 'ramiz@onixgroup.ae';
```

### **Method 3: Browser**
```
http://localhost:3001/uploads/photos/{filename}
```

Example:
```
http://localhost:3001/uploads/photos/pv-1767092223540-931796858.jpg
```

---

## 📁 Directory Structure

```
backend/
├── uploads/
│   └── photos/
│       ├── mamoun-1767089270428-517431684.jpg
│       ├── mamoun-1767089803304-473204263.jpg
│       ├── pv-1767089436489-919615530.jpg
│       ├── pv-1767090780398-645002309.jpg
│       ├── pv-1767092136749-599125060.jpg
│       ├── pv-1767092185104-895363432.jpg
│       └── pv-1767092223540-931796858.jpg
├── src/
│   ├── middleware/
│   │   └── upload.middleware.ts  ← Handles file uploads
│   └── controllers/
│       └── profile.controller.ts  ← Saves filename to database
└── prisma/
    └── schema.prisma  ← Database schema (photo field)
```

---

## 🔧 Configuration Files

### **1. Upload Middleware** (`src/middleware/upload.middleware.ts`)
- Configures where files are saved
- Sets file size limits (5MB)
- Validates file types (images only)

### **2. Profile Controller** (`src/controllers/profile.controller.ts`)
- Handles photo upload
- Saves filename to database
- Returns photo URL to frontend

### **3. App Configuration** (`src/app.ts`)
- Serves static files from `/uploads` directory
- Makes photos accessible via URL

---

## ✅ Key Points

1. **Photos are NOT stored in database** - Only filenames are stored
2. **Actual image files** are stored in `backend/uploads/photos/` directory
3. **Database** (PostgreSQL) stores only the filename reference
4. **File system** stores the actual image files
5. **URL construction** happens in backend controllers

---

## 🗑️ Deleting Photos

### **To Delete a Photo:**

1. **Delete from file system:**
   ```bash
   rm backend/uploads/photos/{filename}
   # or Windows:
   del backend\uploads\photos\{filename}
   ```

2. **Remove from database:**
   ```sql
   UPDATE users SET photo = NULL WHERE id = '{user-id}';
   ```

---

## 📝 Summary

- **Physical Storage:** `backend/uploads/photos/` (file system)
- **Database:** PostgreSQL `users.photo` column (filename only)
- **Database Type:** PostgreSQL
- **Table:** `users`
- **Column:** `photo` (String, nullable)

**The actual image files are stored on disk, and only the filename is stored in the database!** 📸





