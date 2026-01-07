# Project Management Backend API Documentation

## Overview

Complete backend implementation for project management system with full CRUD operations for Projects, Tasks, Checklists, Attachments, and Comments.

## Database Schema Updates

### Enhanced Project Model
- Added `pin` (Project Identification Number)
- Added `projectManagerId` (relation to User)
- Added `startDate`, `endDate`, `planDays`
- Added `remarks`, `assigneeNotes`
- Changed `status` to enum: `OPEN`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `CANCELLED`, `CLOSED`

### New Task Model
- Full task management with status, priority, dates
- Relations to Project, Assignments, Checklists, Attachments, Comments
- Status enum: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `ON_HOLD`
- Priority enum: `LOW`, `MEDIUM`, `HIGH`, `URGENT`

### Supporting Models
- `ProjectChecklist` - Checklist items for projects
- `TaskChecklist` - Checklist items for tasks
- `ProjectAttachment` - File attachments for projects
- `TaskAttachment` - File attachments for tasks
- `TaskComment` - Comments on tasks
- `TaskAssignment` - Enhanced with status enum

## API Endpoints

### Projects API (`/api/projects`)

#### Get All Projects
```
GET /api/projects
Query Parameters:
  - status: Filter by status
  - clientId: Filter by client
  - projectManagerId: Filter by project manager
  - search: Search in name, referenceNumber, pin
  - page: Page number (default: 1)
  - limit: Items per page (default: 10)
  - sortBy: Field to sort by (default: createdAt)
  - sortOrder: asc or desc (default: desc)
```

#### Get Project by ID
```
GET /api/projects/:id
Returns: Full project details with relations
```

#### Create Project
```
POST /api/projects
Body:
{
  "name": "Project Name",
  "referenceNumber": "REF-001",
  "pin": "PIN-001",
  "clientId": "uuid",
  "projectManagerId": "uuid",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31",
  "deadline": "2024-12-31",
  "planDays": 365,
  "status": "OPEN",
  "remarks": "Notes",
  "assigneeNotes": "Assignee notes",
  "employeeIds": ["uuid1", "uuid2"]
}
```

#### Update Project
```
PUT /api/projects/:id
Body: Same as create (all fields optional)
```

#### Delete Project
```
DELETE /api/projects/:id
```

#### Assign Employees to Project
```
POST /api/projects/:id/assign
Body:
{
  "employeeIds": ["uuid1", "uuid2"],
  "role": "Engineer"
}
```

#### Get Project Statistics
```
GET /api/projects/:id/stats
Returns: Task counts by status, document counts, etc.
```

### Project Checklists (`/api/projects/:projectId/checklists`)

#### Get Checklists
```
GET /api/projects/:projectId/checklists
```

#### Create Checklist Item
```
POST /api/projects/:projectId/checklists
Body:
{
  "title": "Checklist item",
  "description": "Description",
  "order": 0
}
```

#### Update Checklist Item
```
PUT /api/projects/:projectId/checklists/:checklistId
Body:
{
  "title": "Updated title",
  "isCompleted": true,
  "order": 1
}
```

#### Delete Checklist Item
```
DELETE /api/projects/:projectId/checklists/:checklistId
```

### Project Attachments (`/api/projects/:projectId/attachments`)

#### Get Attachments
```
GET /api/projects/:projectId/attachments
```

#### Upload Attachment
```
POST /api/projects/:projectId/attachments
Content-Type: multipart/form-data
Body: file (form field)
```

#### Delete Attachment
```
DELETE /api/projects/:projectId/attachments/:attachmentId
```

### Tasks API (`/api/tasks`)

#### Get All Tasks
```
GET /api/tasks
Query Parameters:
  - projectId: Filter by project
  - status: Filter by status
  - priority: Filter by priority
  - assignedTo: Filter by assigned employee
  - search: Search in title, description
  - page, limit, sortBy, sortOrder: Pagination and sorting
```

#### Get Task by ID
```
GET /api/tasks/:id
Returns: Full task details with relations
```

#### Create Task
```
POST /api/tasks
Body:
{
  "title": "Task title",
  "description": "Task description",
  "projectId": "uuid",
  "status": "PENDING",
  "priority": "MEDIUM",
  "startDate": "2024-01-01",
  "dueDate": "2024-01-31",
  "estimatedHours": 40,
  "tags": ["tag1", "tag2"],
  "employeeIds": ["uuid1", "uuid2"]
}
```

#### Update Task
```
PUT /api/tasks/:id
Body: Same as create (all fields optional)
```

#### Delete Task
```
DELETE /api/tasks/:id
```

#### Assign Employees to Task
```
POST /api/tasks/:id/assign
Body:
{
  "employeeIds": ["uuid1", "uuid2"]
}
```

#### Update Assignment Status
```
PUT /api/tasks/:id/assignments/:assignmentId/status
Body:
{
  "status": "IN_PROGRESS" | "COMPLETED" | "PENDING" | "CANCELLED"
}
```

#### Get Task Statistics
```
GET /api/tasks/stats
Query Parameters:
  - projectId: Filter by project (optional)
Returns:
{
  "total": 100,
  "completed": 50,
  "inProgress": 30,
  "pending": 20,
  "byPriority": {...}
}
```

#### Get Kanban Tasks
```
GET /api/tasks/kanban
Query Parameters:
  - projectId: Filter by project (optional)
Returns: Tasks grouped by status
{
  "PENDING": [...],
  "IN_PROGRESS": [...],
  "COMPLETED": [...],
  "ON_HOLD": [...],
  "CANCELLED": [...]
}
```

### Task Checklists (`/api/tasks/:taskId/checklists`)

#### Get Checklists
```
GET /api/tasks/:taskId/checklists
```

#### Create Checklist Item
```
POST /api/tasks/:taskId/checklists
Body:
{
  "title": "Checklist item",
  "order": 0
}
```

#### Update Checklist Item
```
PUT /api/tasks/:taskId/checklists/:checklistId
Body:
{
  "title": "Updated title",
  "isCompleted": true,
  "order": 1
}
```

#### Delete Checklist Item
```
DELETE /api/tasks/:taskId/checklists/:checklistId
```

### Task Attachments (`/api/tasks/:taskId/attachments`)

#### Get Attachments
```
GET /api/tasks/:taskId/attachments
```

#### Upload Attachment
```
POST /api/tasks/:taskId/attachments
Content-Type: multipart/form-data
Body: file (form field)
```

#### Delete Attachment
```
DELETE /api/tasks/:taskId/attachments/:attachmentId
```

### Task Comments (`/api/tasks/:taskId/comments`)

#### Get Comments
```
GET /api/tasks/:taskId/comments
Returns: Comments with user details
```

#### Create Comment
```
POST /api/tasks/:taskId/comments
Body:
{
  "content": "Comment text"
}
```

#### Update Comment
```
PUT /api/tasks/:taskId/comments/:commentId
Body:
{
  "content": "Updated comment"
}
Note: Only own comments can be updated
```

#### Delete Comment
```
DELETE /api/tasks/:taskId/comments/:commentId
Note: Only own comments can be deleted (or admin)
```

## Authentication

All endpoints (except dashboard summary) require authentication via JWT token:
```
Authorization: Bearer <token>
```

## File Uploads

- Maximum file size: 10MB
- Upload directories:
  - Projects: `uploads/projects/`
  - Tasks: `uploads/tasks/`
- Files are served at `/uploads/<filename>`

## Error Responses

All errors follow this format:
```json
{
  "success": false,
  "message": "Error message"
}
```

## Success Responses

All success responses follow this format:
```json
{
  "success": true,
  "message": "Success message",
  "data": {...}
}
```

## Next Steps

1. Run Prisma migration:
   ```bash
   npx prisma migrate dev --name add_project_management
   ```

2. Generate Prisma client:
   ```bash
   npx prisma generate
   ```

3. Restart the server:
   ```bash
   npm run dev
   ```

## Notes

- All timestamps are in ISO 8601 format
- Dates should be provided in ISO format (YYYY-MM-DD or ISO 8601)
- Task assignments automatically set status to PENDING
- Project and Task statuses use enums for type safety
- File uploads use multer middleware
- Comments include user information in responses
- Checklists support ordering via `order` field

