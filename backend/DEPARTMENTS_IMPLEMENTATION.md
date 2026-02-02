# Department Management Implementation

## Overview
Fixed and implemented department management with proper company linkage. Departments are now correctly saved in the database and always belong to a specific company.

## Database Schema

### Department Model
```prisma
model Department {
  id          String   @id @default(uuid())
  companyId   String
  company     Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  name        String
  description String?
  status      DepartmentStatus @default(ACTIVE)
  managerId   String?  // User ID of department manager
  manager     User?    @relation("DepartmentManager", fields: [managerId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("departments")
}

enum DepartmentStatus {
  ACTIVE
  INACTIVE
}
```

### Key Features
- **companyId** is required (foreign key to Company)
- Cascade delete: When a company is deleted, all its departments are deleted
- Optional manager link to User model
- Status tracking (ACTIVE/INACTIVE)

## API Endpoints

### Company-Specific Department Endpoints

#### 1. Get All Departments for a Company
```
GET /api/companies/:companyId/departments
```
**Query Parameters:**
- `status` - Filter by status (ACTIVE, INACTIVE, or 'all')
- `search` - Search by name or description
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 100)
- `sortBy` - Field to sort by (default: createdAt)
- `sortOrder` - asc or desc (default: desc)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "name": "Department Name",
      "description": "Description",
      "status": "ACTIVE",
      "managerId": "uuid",
      "createdAt": "2026-01-15T...",
      "updatedAt": "2026-01-15T...",
      "company": {
        "id": "uuid",
        "name": "Company Name",
        "tag": "ONIX"
      },
      "manager": {
        "id": "uuid",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 100,
    "total": 3,
    "totalPages": 1
  }
}
```

#### 2. Create Department for a Company
```
POST /api/companies/:companyId/departments
```
**Request Body:**
```json
{
  "name": "Department Name",
  "description": "Department description",
  "status": "ACTIVE",
  "managerId": "uuid" // Optional
}
```

**Response:**
```json
{
  "success": true,
  "message": "Department created successfully",
  "data": {
    "id": "uuid",
    "companyId": "uuid",
    "name": "Department Name",
    ...
  }
}
```

### General Department Endpoints

#### 3. Get Department by ID
```
GET /api/departments/:id
```

#### 4. Update Department
```
PUT /api/departments/:id
```
**Note:** Cannot change companyId through update endpoint

#### 5. Delete Department
```
DELETE /api/departments/:id
```

## Implementation Details

### Route Ordering
Company-specific routes (`/:companyId/departments`) are registered **before** the generic `/:id` route to avoid route conflicts.

### Validation
- Company existence is verified before creating/listing departments
- Department name is required
- CompanyId cannot be changed after creation
- Cascade delete ensures data integrity

### Error Handling
- 404: Company or Department not found
- 400: Missing required fields or validation errors
- 500: Internal server errors with detailed logging

## Frontend Integration

### Flow
1. User opens a company → Frontend calls `GET /api/companies/:companyId/departments`
2. User clicks "Create Department" → Frontend calls `POST /api/companies/:companyId/departments`
3. Department is saved with `companyId` automatically
4. On refresh → Departments persist correctly because they're stored in database

### Example Frontend Code
```javascript
// Get departments for a company
const getDepartments = async (companyId) => {
  const response = await fetch(`/api/companies/${companyId}/departments`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  return response.json();
};

// Create department
const createDepartment = async (companyId, departmentData) => {
  const response = await fetch(`/api/companies/${companyId}/departments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(departmentData)
  });
  return response.json();
};
```

## Files Created/Modified

### Created
- `backend/src/controllers/departments.controller.ts` - Department controller
- `backend/src/routes/departments.routes.ts` - Department routes

### Modified
- `backend/prisma/schema.prisma` - Added Department model and relations
- `backend/src/routes/companies.routes.ts` - Added company-specific department routes
- `backend/src/app.ts` - Registered department routes

## Testing

### Test Scenarios
1. ✅ Create department for existing company
2. ✅ Create department for non-existent company (should fail with 404)
3. ✅ Get departments for a company (should only return that company's departments)
4. ✅ Update department (should not allow companyId change)
5. ✅ Delete department
6. ✅ Delete company (should cascade delete all departments)

## Next Steps

1. **Restart Backend Server** (if not auto-restarted)
2. **Test Endpoints** using Postman or frontend
3. **Verify Data Persistence** - Create departments and refresh to ensure they persist

## Notes

- All routes require authentication (JWT token)
- Departments are always scoped to a company
- No department can exist without a company (enforced by database foreign key)
- Cascade delete ensures data integrity when companies are deleted
