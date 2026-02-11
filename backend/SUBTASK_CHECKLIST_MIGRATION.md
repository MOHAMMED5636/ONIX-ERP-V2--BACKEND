# Sub-Task Checklist Migration Guide

## Overview

This guide explains how to move the checklist/questionnaire feature from **Tasks** to **Sub-Tasks** in the frontend.

## Current State

- ✅ Backend already supports `subtaskId` in questionnaire system
- ✅ API endpoints accept `subtaskId` parameter
- ❌ Frontend currently shows checklist button at task level
- ✅ Need to move checklist button to sub-task level

## Backend API Support

The backend already supports sub-task questionnaires. All endpoints accept `subtaskId` as a query parameter:

### Endpoints that support `subtaskId`:

1. **Get Questions**: `GET /api/questionnaire/questions?subtaskId={subtaskId}`
2. **Create Question**: `POST /api/questionnaire/questions` (body: `{ subtaskId: "...", ... }`)
3. **Get Assignments**: `GET /api/questionnaire/assignments?subtaskId={subtaskId}`
4. **Get Status**: `GET /api/questionnaire/status?subtaskId={subtaskId}`
5. **Assign Template**: `POST /api/questionnaire/templates/:templateId/assign` (body: `{ subtaskId: "...", ... }`)

## Frontend Changes Required

### 1. Update Checklist Button Location

**Current (WRONG):**
- Checklist button appears in the "CHECKLIST" column at the **task row level**
- Opens modal with `taskId` parameter

**Required (CORRECT):**
- Checklist button should appear at the **sub-task row level**
- Opens modal with `subtaskId` parameter instead of `taskId`

### 2. Update Modal Opening Logic

**In `MainTable.js` or `ProjectRow.js`:**

**Before:**
```javascript
// When checklist button clicked on task
const handleOpenChecklist = (taskId) => {
  if (isManager) {
    onOpenQuestionnaireModal({ taskId, projectId });
  } else {
    onOpenQuestionnaireResponseModal({ taskId, projectId });
  }
};
```

**After:**
```javascript
// When checklist button clicked on sub-task
const handleOpenChecklist = (subtaskId, projectId) => {
  if (isManager) {
    onOpenQuestionnaireModal({ subtaskId, projectId });
  } else {
    onOpenQuestionnaireResponseModal({ subtaskId, projectId });
  }
};
```

### 3. Update QuestionnaireModal Component

**In `QuestionnaireModal.js`:**

**Before:**
```javascript
// Fetch questions for task
const fetchQuestions = async () => {
  const response = await getQuestions({ taskId: modalTarget.taskId });
  // ...
};
```

**After:**
```javascript
// Fetch questions for sub-task
const fetchQuestions = async () => {
  const response = await getQuestions({ 
    subtaskId: modalTarget.subtaskId 
  });
  // ...
};

// Create question for sub-task
const handleCreateQuestion = async (questionData) => {
  await createQuestion({
    ...questionData,
    subtaskId: modalTarget.subtaskId,
    projectId: modalTarget.projectId,
  });
};
```

### 4. Update QuestionnaireResponseModal Component

**In `QuestionnaireResponseModal.js`:**

**Before:**
```javascript
// Fetch questions for task
const fetchQuestions = async () => {
  const response = await getQuestions({ taskId: modalTarget.taskId });
  // ...
};

// Get status for task
const fetchStatus = async () => {
  const response = await getQuestionnaireStatus({ taskId: modalTarget.taskId });
  // ...
};
```

**After:**
```javascript
// Fetch questions for sub-task
const fetchQuestions = async () => {
  const response = await getQuestions({ 
    subtaskId: modalTarget.subtaskId 
  });
  // ...
};

// Get status for sub-task
const fetchStatus = async () => {
  const response = await getQuestionnaireStatus({ 
    subtaskId: modalTarget.subtaskId 
  });
  // ...
};
```

### 5. Update API Service Calls

**In `questionnaireAPI.js`:**

Ensure all API calls support `subtaskId`:

```javascript
// Get questions
export const getQuestions = async (params = {}) => {
  const { projectId, taskId, subtaskId } = params;
  const queryParams = new URLSearchParams();
  if (projectId) queryParams.append('projectId', projectId);
  if (taskId) queryParams.append('taskId', taskId);
  if (subtaskId) queryParams.append('subtaskId', subtaskId);
  
  const response = await fetch(
    `${API_BASE_URL}/questionnaire/questions?${queryParams}`,
    {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    }
  );
  return response.json();
};

// Create question
export const createQuestion = async (questionData) => {
  const { projectId, taskId, subtaskId, ...rest } = questionData;
  const body = {
    ...rest,
    projectId: projectId || null,
    taskId: taskId || null,
    subtaskId: subtaskId || null,
  };
  
  const response = await fetch(`${API_BASE_URL}/questionnaire/questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
  return response.json();
};

// Get status
export const getQuestionnaireStatus = async (params = {}) => {
  const { projectId, taskId, subtaskId } = params;
  const queryParams = new URLSearchParams();
  if (projectId) queryParams.append('projectId', projectId);
  if (taskId) queryParams.append('taskId', taskId);
  if (subtaskId) queryParams.append('subtaskId', subtaskId);
  
  const response = await fetch(
    `${API_BASE_URL}/questionnaire/status?${queryParams}`,
    {
      headers: {
        'Authorization': `Bearer ${getToken()}`,
      },
    }
  );
  return response.json();
};

// Assign template
export const assignTemplate = async (templateId, assignmentData) => {
  const { projectId, taskId, subtaskId } = assignmentData;
  const body = {
    projectId: projectId || null,
    taskId: taskId || null,
    subtaskId: subtaskId || null,
  };
  
  const response = await fetch(
    `${API_BASE_URL}/questionnaire/templates/${templateId}/assign`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
    }
  );
  return response.json();
};
```

### 6. Update Sub-Task Row Rendering

**In the component that renders sub-tasks:**

**Before:**
```javascript
// Checklist column shows button for task
<td>
  <button onClick={() => handleOpenChecklist(task.id)}>
    Manage Checklist
  </button>
</td>
```

**After:**
```javascript
// Checklist column shows button for sub-task
<td>
  <button onClick={() => handleOpenChecklist(subtask.id, project.id)}>
    Manage Checklist
  </button>
</td>
```

## Key Points

1. **Remove checklist from task level**: The checklist button should NOT appear in the task row
2. **Add checklist to sub-task level**: The checklist button should appear in the sub-task row
3. **Use `subtaskId` instead of `taskId`**: All API calls should use `subtaskId` parameter
4. **Keep `projectId`**: Still pass `projectId` for context, but primary identifier is `subtaskId`

## Testing Checklist

After making changes:

- [ ] Checklist button appears in sub-task row (not task row)
- [ ] Clicking checklist button opens modal with correct `subtaskId`
- [ ] Managers can create questions for sub-tasks
- [ ] Employees can answer questions for sub-tasks
- [ ] Status shows correctly for sub-tasks
- [ ] Templates can be assigned to sub-tasks
- [ ] No checklist functionality available at task level

## Backend Verification

The backend is already configured correctly. To verify:

```bash
# Test getting questions for a sub-task
curl -X GET "http://localhost:3001/api/questionnaire/questions?subtaskId=YOUR_SUBTASK_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Test creating a question for a sub-task
curl -X POST "http://localhost:3001/api/questionnaire/questions" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subtaskId": "YOUR_SUBTASK_ID",
    "projectId": "YOUR_PROJECT_ID",
    "questionText": "Test question",
    "isRequired": true
  }'
```

## Summary

The backend is ready. The frontend needs to:
1. Move checklist button from task row to sub-task row
2. Change all API calls from using `taskId` to using `subtaskId`
3. Update modal components to work with `subtaskId` instead of `taskId`
