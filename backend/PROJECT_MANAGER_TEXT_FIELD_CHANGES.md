# Project Manager Field Changed to Plain Text

## Summary
Changed the `projectManager` field from a foreign key relationship (linked to User table) to a simple plain text string field. This allows free-text entry of project manager names without requiring user accounts.

---

## ✅ Backend Changes Completed

### 1. Prisma Schema Update (`prisma/schema.prisma`)
**Changed:**
```prisma
// OLD:
projectManagerId String?
projectManager   User? @relation("ProjectManager", fields: [projectManagerId], references: [id])

// NEW:
projectManager   String? @db.VarChar(100) // Free-text project manager name (not linked to users)
```

**Also removed from User model:**
```prisma
managedProjects  Project[] @relation("ProjectManager") // REMOVED
```

---

### 2. Database Migration
**File:** `prisma/migrations/20260203000000_change_project_manager_to_text/migration.sql`

**Actions:**
- Drops foreign key constraint `projects_projectManagerId_fkey`
- Drops column `projectManagerId`
- Adds new `projectManager VARCHAR(100)` column

**To apply migration:**
```bash
cd backend
npx prisma migrate deploy
# OR for development:
npx prisma migrate dev
```

---

### 3. Controllers Updated (`src/controllers/projects.controller.ts`)

#### **createProject**
- ✅ Accepts `projectManager` (string) from `req.body`
- ✅ Validates: trims whitespace, max length 100 characters
- ✅ Saves as plain text: `projectManager: projectManagerText`
- ✅ Removed `projectManager` relation from `include`

#### **updateProject**
- ✅ Accepts `projectManager` (string) from `req.body`
- ✅ Validates: trims whitespace, max length 100 characters
- ✅ Updates as plain text: `projectManager: projectManagerText`
- ✅ Removed `projectManager` relation from `include`

#### **getAllProjects**
- ✅ Removed `projectManagerId` filter (replaced with text search)
- ✅ Added `projectManager` text search filter (case-insensitive contains)
- ✅ Added `projectManager` to general search
- ✅ Removed `projectManager` relation from `include`
- ✅ Returns `projectManager` as string field

#### **getProjectById**
- ✅ Removed `projectManager` relation from `include`
- ✅ Returns `projectManager` as string field

---

### 4. Dashboard Service Updated (`src/services/dashboard.service.ts`)
- ✅ Removed `projectManager` relation select
- ✅ Returns `projectManager` as plain text: `project.projectManager || 'N/A'`

---

### 5. Project Chats Controller Updated (`src/controllers/projectChats.controller.ts`)
- ✅ Changed `projectManager` select from relation to plain field: `projectManager: true`

---

### 6. Validation Rules
**Implemented inline in controllers:**
- ✅ **Optional field** (can be null/empty)
- ✅ **String type** (converted with `String()`)
- ✅ **Max length: 100 characters** (enforced with `.substring(0, 100)`)
- ✅ **Trimmed** (removes leading/trailing whitespace)

**Example validation code:**
```typescript
const projectManagerText = projectManager 
  ? String(projectManager).trim().substring(0, 100) 
  : null;
```

---

## 📋 API Changes

### **Create Project** (`POST /api/projects`)
**Request Body:**
```json
{
  "name": "Project Name",
  "referenceNumber": "REF-001",
  "projectManager": "Ahmed Saleem",  // ← Plain text string (optional)
  // ... other fields
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "Project Name",
    "projectManager": "Ahmed Saleem",  // ← Plain text string
    // ... other fields
  }
}
```

### **Update Project** (`PUT /api/projects/:id`)
**Request Body:**
```json
{
  "projectManager": "John Smith"  // ← Plain text string (optional)
}
```

### **Get Projects** (`GET /api/projects`)
**Query Parameters:**
- `projectManager` - Text search filter (case-insensitive contains)
- `search` - General search (now includes projectManager field)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "projectManager": "Ahmed Saleem",  // ← Plain text string
      // ... other fields
    }
  ]
}
```

---

## 🎯 Frontend Changes Required

### **1. Project Create/Edit Form**
**Change dropdown to text input:**

```jsx
// OLD (Dropdown):
<select 
  value={formData.projectManagerId}
  onChange={(e) => setFormData({ ...formData, projectManagerId: e.target.value })}
>
  <option value="">Select project manager</option>
  {projectManagers.map(pm => (
    <option key={pm.id} value={pm.id}>{pm.fullName}</option>
  ))}
</select>

// NEW (Text Input):
<input
  type="text"
  value={formData.projectManager || ''}
  onChange={(e) => setFormData({ ...formData, projectManager: e.target.value })}
  placeholder="Enter project manager name"
  maxLength={100}
/>
```

### **2. State Management**
```javascript
// OLD:
const [formData, setFormData] = useState({
  projectManagerId: '',  // User ID
  // ...
});

// NEW:
const [formData, setFormData] = useState({
  projectManager: '',  // Plain text string
  // ...
});
```

### **3. API Payload**
```javascript
// OLD:
const payload = {
  projectManagerId: formData.projectManagerId,  // UUID
  // ...
};

// NEW:
const payload = {
  projectManager: formData.projectManager.trim(),  // Plain text
  // ...
};
```

### **4. Display in Table**
```jsx
// OLD:
<td>{project.projectManager?.firstName} {project.projectManager?.lastName}</td>

// NEW:
<td>{project.projectManager || 'N/A'}</td>
```

### **5. Edit Mode Pre-fill**
```javascript
// OLD:
setFormData({
  projectManagerId: project.projectManager?.id || '',
  // ...
});

// NEW:
setFormData({
  projectManager: project.projectManager || '',
  // ...
});
```

---

## ⚠️ Important Notes

1. **No User Validation**: The field accepts any text string. No validation against user accounts.
2. **No Foreign Keys**: The field is completely independent of the User table.
3. **Case-Sensitive Storage**: Names are stored exactly as entered (but search is case-insensitive).
4. **Max Length**: 100 characters enforced on backend.
5. **Migration Required**: Run Prisma migration before deploying.

---

## 🔄 Migration Steps

1. **Backup database** (recommended)
2. **Run migration:**
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
3. **Regenerate Prisma client:**
   ```bash
   npx prisma generate
   ```
4. **Restart backend server**
5. **Update frontend** to use text input instead of dropdown

---

## ✅ Testing Checklist

- [ ] Create project with `projectManager` text field
- [ ] Update project `projectManager` field
- [ ] Search projects by `projectManager` name
- [ ] Display `projectManager` in project list
- [ ] Display `projectManager` in project details
- [ ] Verify max length validation (100 chars)
- [ ] Verify empty/null handling
- [ ] Verify trim whitespace

---

**Last Updated:** 2026-02-03
**Status:** ✅ Backend changes complete, Frontend changes pending
