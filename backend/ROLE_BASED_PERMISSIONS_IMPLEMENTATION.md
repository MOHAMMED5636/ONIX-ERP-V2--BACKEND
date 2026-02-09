# Role-Based Permission System Implementation

## ✅ Implementation Complete

This document summarizes the role-based permission system implemented for the Employee ERP.

---

## 📋 Requirements Met

### 1. ✅ Employees Can Only VIEW:
- **Company Policies** - Employees can view all company policies but cannot create, edit, or delete them
- **Departments** - Employees can view all departments but cannot create, edit, or delete them
- **Sub-Departments** - Employees can view all sub-departments but cannot create, edit, or delete them
- **Assigned Projects** - Employees can view and update only projects assigned to them

### 2. ✅ Employees CANNOT:
- Create, edit, or delete company policies
- Create, edit, or delete departments
- Create, edit, or delete sub-departments
- Create or delete projects (even assigned ones)
- Modify any data outside their own profile or assigned projects

### 3. ✅ UI Behavior:
- **Create/Edit buttons hidden** for employees in:
  - Company Policies page
  - Departments page
  - Sub-Departments page
- **Tooltips added**: "This content is maintained by management. Employees can only view."
- **Access denied messages** displayed when employees try restricted actions via API

### 4. ✅ Backend Enforcement:
- **Middleware protection** on all routes
- **Controller-level validation** for double protection
- **Proper error messages** returned to frontend
- **Audit logging** for unauthorized access attempts

---

## 🔧 Backend Changes

### New Files Created:
1. **`backend/src/middleware/permissions.middleware.ts`**
   - Role-based permission middleware
   - Employee permission configuration
   - Audit logging for unauthorized attempts

### Files Modified:

#### Routes (Protected with middleware):
- `backend/src/routes/departments.routes.ts`
- `backend/src/routes/subdepartments.routes.ts`
- `backend/src/routes/companies.routes.ts`
- `backend/src/routes/documents.routes.ts`
- `backend/src/routes/projects.routes.ts`

#### Controllers (Added employee checks):
- `backend/src/controllers/departments.controller.ts`
- `backend/src/controllers/subdepartments.controller.ts`
- `backend/src/controllers/documents.controller.ts`
- `backend/src/controllers/projects.controller.ts`

---

## 🎨 Frontend Changes

### Files Modified:

1. **`ERP-FRONTEND/ONIX-ERP-V2/src/pages/workplace/CompanyPolicy.js`**
   - Added `useAuth()` hook to get user role
   - Hidden "Create New Policy" button for employees
   - Hidden "Create Department" button for employees
   - Hidden delete buttons for employees
   - Added tooltip message for employees

2. **`ERP-FRONTEND/ONIX-ERP-V2/src/modules/Departments.js`**
   - Added `useAuth()` hook to get user role
   - Hidden "Create Department" button for employees
   - Hidden Edit/Delete buttons in both mobile and desktop views
   - Added tooltip message for employees

---

## 🔐 Permission Matrix

| Resource | Employee View | Employee Create | Employee Edit | Employee Delete |
|----------|---------------|-----------------|---------------|-----------------|
| Company Policies | ✅ | ❌ | ❌ | ❌ |
| Departments | ✅ | ❌ | ❌ | ❌ |
| Sub-Departments | ✅ | ❌ | ❌ | ❌ |
| Projects (assigned) | ✅ | ❌ | ✅ | ❌ |
| Projects (not assigned) | ❌ | ❌ | ❌ | ❌ |
| Own Profile | ✅ | N/A | ✅ | N/A |

---

## 🚨 Error Messages

When employees attempt unauthorized actions, they receive:

**Backend Response:**
```json
{
  "success": false,
  "message": "Access Denied: You do not have permission to create or edit this content. Please contact your manager.",
  "code": "ACCESS_DENIED",
  "details": {
    "resourceType": "department",
    "action": "create",
    "userRole": "EMPLOYEE"
  }
}
```

**Frontend Display:**
- Error messages are automatically displayed via existing API error handling
- Users see the backend message: "Access Denied: You do not have permission to create or edit this content. Please contact your manager."

---

## 📊 Audit Logging

Unauthorized access attempts are logged to the console with:
- User ID
- User Role
- Resource Type
- Action Attempted
- Resource ID (if applicable)
- Timestamp

Example log:
```
🚫 Unauthorized access attempt: {
  userId: 'user-123',
  userRole: 'EMPLOYEE',
  resourceType: 'department',
  action: 'create',
  resourceId: undefined,
  timestamp: '2026-02-02T10:30:00.000Z'
}
```

---

## 🧪 Testing

To test the implementation:

1. **Login as Employee:**
   - Email: `employee@onixgroup.ae`
   - Password: `employee123`

2. **Test Restrictions:**
   - ✅ Try to view departments → Should work
   - ❌ Try to create department → Button hidden + API blocked
   - ❌ Try to edit department → Button hidden + API blocked
   - ❌ Try to delete department → Button hidden + API blocked
   - ✅ Try to view company policies → Should work
   - ❌ Try to create policy → Button hidden + API blocked
   - ❌ Try to delete policy → Button hidden + API blocked
   - ✅ Try to view assigned projects → Should work
   - ✅ Try to update assigned project → Should work
   - ❌ Try to create project → API blocked
   - ❌ Try to delete project → API blocked
   - ❌ Try to update non-assigned project → API blocked

---

## 📝 Notes

- **Double Protection**: Both middleware and controller-level checks ensure security even if frontend is bypassed
- **Backward Compatible**: Admin, HR, and Project Manager roles retain full access
- **Error Handling**: All API errors are properly caught and displayed to users
- **User Experience**: Employees see helpful tooltips explaining why actions are restricted

---

## 🔄 Future Enhancements

Optional improvements:
- Add role-based permission management UI for admins
- Implement permission groups/custom roles
- Add more granular permissions (e.g., view-only specific fields)
- Create permission audit dashboard
- Add email notifications for unauthorized attempts

---

**Implementation Date:** February 2, 2026
**Status:** ✅ Complete and Ready for Testing
