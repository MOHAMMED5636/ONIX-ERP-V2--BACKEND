export type ProjectImportFieldType = 'text' | 'select' | 'date' | 'number';

export type ProjectImportField = {
  key: string;
  label: string;
  required?: boolean;
  type?: ProjectImportFieldType;
  options?: string[];
  sample?: string;
  note?: string;
};

/** Flat rows: one PROJECT row per project, then SUBTASK / CHILD rows (matches Main Table TASK IDs). */
export const PROJECT_IMPORT_SCHEMA: ProjectImportField[] = [
  { key: 'rowType', label: 'Row Type', required: true, type: 'select', options: ['PROJECT', 'SUBTASK', 'CHILD'], sample: 'SUBTASK' },
  { key: 'projectNumber', label: 'Project Number', required: true, type: 'number', sample: '2583' },
  { key: 'taskId', label: 'Task ID', sample: '2583-3-1', note: 'Hierarchical ID from Main Table (e.g. 2583-3 or 2583-3-1). Leave empty on PROJECT rows.' },
  { key: 'taskDbId', label: 'Task DB Id', note: 'System UUID — do not edit. Required to update subtasks/child tasks on import.' },
  { key: 'projectName', label: 'Project Name', sample: 'Villa Project' },
  { key: 'taskName', label: 'Task Name', sample: 'SOIL INVESTIGATION REPORT' },
  { key: 'projectStatus', label: 'Project Status', type: 'select', options: ['OPEN', 'IN_PROGRESS', 'SUBMITTED_IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'CLOSED'] },
  { key: 'status', label: 'Task Status', type: 'select', options: ['Not Started', 'In Progress', 'Submitted-IN PROGRESS', 'Done', 'Not Required', 'On Hold', 'Cancelled'] },
  { key: 'phase', label: 'Phase / Category', sample: 'Concept Design' },
  { key: 'priority', label: 'Priority', type: 'select', options: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
  { key: 'predecessors', label: 'Predecessors', sample: '2583-2' },
  { key: 'assignedEmployeeEmail', label: 'Assigned Employee Email', sample: 'user@onixgroup.ae' },
  { key: 'startDate', label: 'Start Date', type: 'date', sample: '2026-05-21' },
  { key: 'dueDate', label: 'Due Date', type: 'date', sample: '2026-06-30' },
  { key: 'planDays', label: 'Plan Days', type: 'number', sample: '10' },
  { key: 'plotNumber', label: 'Plot Number', sample: '4238252' },
  { key: 'community', label: 'Community', sample: 'AL WARQA THIRD' },
  { key: 'projectType', label: 'Project Type', sample: 'Residential' },
  { key: 'projectFloor', label: 'No. Of Floors', sample: '3' },
  { key: 'developerProject', label: 'Developer Name', sample: '' },
  { key: 'location', label: 'Location', sample: '' },
  { key: 'remarks', label: 'Remarks', sample: '' },
  { key: 'assigneeNotes', label: 'Assignee Notes', sample: '' },
  { key: 'referenceNumber', label: 'Reference Number', note: 'PROJECT rows only — unique project reference.' },
  { key: 'projectManager', label: 'Project Manager', note: 'PROJECT rows only — display name.' },
];
