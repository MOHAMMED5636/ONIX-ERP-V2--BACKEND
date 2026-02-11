# Questionnaire / Checklist Feature Documentation

## Overview

A comprehensive Checklist/Questionnaire feature for Tasks and Sub-Tasks in the project management system. This feature enables structured compliance, quality control, and task verification through reusable questionnaire templates.

## Features

### 1. **Role-Based Access Control**
- **Managers (ADMIN, PROJECT_MANAGER, HR)**: Can create, edit, delete, and lock/unlock questions
- **Employees**: Can only answer questions and add remarks (cannot create/edit/delete)

### 2. **Question Structure**
Each question has:
- **Question Text**: The actual question
- **Description**: Optional instructions/guidance
- **Required Flag**: Whether answer is mandatory
- **Order**: Display order
- **Lock Status**: Locked questions cannot be answered

### 3. **Fixed Answer Options**
- **Action Plan Applied**: Indicates action plan was implemented
- **Not Available**: Option not applicable
- **Not Applied**: Action plan not implemented
- **Pending**: Default state (not yet answered)

### 4. **Response Tracking**
Each response includes:
- **Answer**: Selected option from fixed choices
- **Remarks**: Optional text notes
- **Employee Name**: Who answered
- **Date & Time**: When answered (timestamped)
- **Lock Status**: Locked responses cannot be modified

### 5. **Reusable Templates**
- Templates can be created with multiple questions
- Templates can be assigned to Projects, Tasks, or Sub-Tasks
- Questions from templates are copied to the assigned target

### 6. **Status Indicators**
- **Pending**: Not all questions answered
- **Completed**: All questions answered
- Visual progress percentage
- Completion tracking per employee

### 7. **Lock/Unlock Functionality**
- Managers can lock questions to prevent further answers
- Managers can lock responses to prevent modifications
- Only admins can unlock locked items

## Database Schema

### Models Created:

1. **QuestionnaireTemplate**: Reusable checklist templates
2. **QuestionnaireQuestion**: Questions (can be in templates or standalone)
3. **QuestionnaireResponse**: Employee answers to questions
4. **QuestionnaireAssignment**: Links templates to Projects/Tasks/Sub-Tasks

### Enum:
- **QuestionnaireAnswer**: `ACTION_PLAN_APPLIED`, `NOT_AVAILABLE`, `NOT_APPLIED`, `PENDING`

## API Endpoints

### Templates
- `GET /api/questionnaire/templates` - Get all templates
- `GET /api/questionnaire/templates/:templateId` - Get single template
- `POST /api/questionnaire/templates` - Create template (Managers only)
- `PUT /api/questionnaire/templates/:templateId` - Update template (Managers only)
- `DELETE /api/questionnaire/templates/:templateId` - Delete template (Managers only)

### Questions
- `GET /api/questionnaire/questions?projectId=...&taskId=...&subtaskId=...` - Get questions
- `POST /api/questionnaire/questions` - Create question (Managers only)
- `PUT /api/questionnaire/questions/:questionId` - Update question (Managers only)
- `DELETE /api/questionnaire/questions/:questionId` - Delete question (Managers only)

### Responses
- `POST /api/questionnaire/questions/:questionId/responses` - Submit response (All users)
- `GET /api/questionnaire/questions/:questionId/responses` - Get responses
- `PUT /api/questionnaire/responses/:responseId/lock` - Lock/unlock response (Managers only)

### Assignments
- `POST /api/questionnaire/templates/:templateId/assign` - Assign template (Managers only)
- `GET /api/questionnaire/assignments?projectId=...&taskId=...&subtaskId=...` - Get assignments

### Status
- `GET /api/questionnaire/status?projectId=...&taskId=...&subtaskId=...` - Get questionnaire status

## Frontend Components

### 1. QuestionnaireModal (`QuestionnaireModal.js`)
- **Purpose**: For managers to create/edit/delete questions
- **Features**:
  - View all questions
  - Add new questions
  - Edit question text, description, order
  - Lock/unlock questions
  - Delete questions
  - See response counts

### 2. QuestionnaireResponseModal (`QuestionnaireResponseModal.js`)
- **Purpose**: For employees to answer questions
- **Features**:
  - View all questions
  - Select answer (Action Plan Applied, Not Available, Not Applied)
  - Add remarks
  - Submit/update responses
  - View status (Pending/Completed)
  - See completion percentage

### 3. Integration
- Integrated into `MainTable.js` and `ProjectRow.js`
- Checklist column opens appropriate modal based on user role
- Managers see "Manage Checklist" button
- Employees see "Answer Checklist" button

## Usage Flow

### For Managers:

1. **Create Questions**:
   - Click "Manage Checklist" on a project/task
   - Click "Add Question"
   - Enter question text, description, set required flag
   - Save

2. **Edit Questions**:
   - Click on question text to edit inline
   - Update description, order, required flag
   - Lock/unlock questions as needed

3. **Delete Questions**:
   - Click delete icon (only if not locked)
   - Confirm deletion

4. **Review Responses**:
   - View all employee responses
   - Lock responses to prevent changes
   - See completion status

### For Employees:

1. **Answer Questions**:
   - Click "Answer Checklist" on assigned project/task
   - Select answer option for each question
   - Add remarks if needed
   - Submit response

2. **Update Responses**:
   - Can update answers until locked
   - See completion status

## Status Calculation

- **Pending**: Not all questions have non-PENDING answers
- **Completed**: All questions answered (no PENDING answers)
- **Completion %**: (Answered questions / Total questions) × 100

## Security & Access Control

- All manager-only endpoints protected by `requireRole('ADMIN', 'PROJECT_MANAGER', 'HR')`
- Employees can only submit responses, not create/edit questions
- Locked questions cannot be answered
- Locked responses cannot be modified
- Only admins can unlock locked items

## Migration

The database migration has been created and executed:
- `20260204020000_add_questionnaire_feature/migration.sql`

## Testing Checklist

- [ ] Managers can create questions
- [ ] Managers can edit questions
- [ ] Managers can delete questions
- [ ] Managers can lock/unlock questions
- [ ] Employees can answer questions
- [ ] Employees cannot create/edit/delete questions
- [ ] Responses are tracked with employee name, date, time
- [ ] Status shows Pending/Completed correctly
- [ ] Templates can be created and assigned
- [ ] Locked questions cannot be answered
- [ ] Locked responses cannot be modified

## Next Steps

1. Run the migration: `npx prisma db execute --file prisma/migrations/20260204020000_add_questionnaire_feature/migration.sql`
2. Regenerate Prisma client: `npx prisma generate`
3. Restart backend server
4. Test the feature in the frontend
