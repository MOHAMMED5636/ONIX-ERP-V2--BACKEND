# Rule Management System Documentation

## Overview

The Rule Management System allows administrators to define dynamic access control rules based on roles, actions, and fields (both form fields and sidebar menu items). This system provides fine-grained permission control across the entire ERP application.

## System Components

### 1. Entities (Roles)

The system supports multiple roles:
- **Admin** - Full system access
- **Manager** - Department/team management access
- **Supervisor** - Supervisory access
- **Employee** - Basic employee access
- **HR Manager** - Human resources management
- **Finance Manager** - Financial operations access
- **Department Head** - Department-level access
- **Custom Roles** - Administrators can create custom roles as needed

### 2. Actions

Available actions that can be assigned to roles:
- **View** - Read-only access
- **Edit** - Modify existing records
- **Delete** - Remove records
- **Create** - Add new records
- **Manage** - Full management capabilities (create, edit, delete, view)

**Note**: Multiple actions can be selected simultaneously for any role.

### 3. Fields

Fields are organized into two main categories:

#### A. Form Fields (Employee Information)
These represent data fields in forms, particularly employee-related forms:
- `name`, `email`, `phone`, `salary`
- `department`, `position`, `hireDate`
- `manager`, `location`, `status`
- `employeeId`, `passportNumber`, `nationalId`
- `insurance`, `bankDetails`, `emergencyContact`
- `performanceRating`, `attendance`, `leaveBalance`

#### B. Sidebar Menu Items
These represent navigation menu items and pages:
- `company-policy` - Company Policy page
- `attendance` - Attendance management
- `leave` - Leave management
- `feedback` - Feedback system
- `survey` - Survey functionality
- `project-list` - Project listing
- `tender` - Tender management
- `supervision` - Supervision module
- `contracts` - Contract management
- `clients` - Client management
- `task-category-list` - Task categories
- `team` - Team management
- `project-tracker` - Project tracking
- `project-lifecycle` - Project lifecycle
- `project-overview` - Project overview
- `project-management` - Project management
- `team-members` - Team members
- `progress-tracking` - Progress tracking
- `reports` - Reports and analytics
- `suppliers` - Supplier management
- `companies` - Company management
- `contractors` - Contractor management
- `bank-reconciliation` - Bank reconciliation
- `it-support` - IT support
- `ai-employee-evaluations` - AI evaluations
- `settings` - System settings

**Custom Fields**: Administrators can add custom fields dynamically using the "+" button.

## Workflow

### Creating a Rule

1. **Select Roles** (Multiple Selection)
   - Click on role checkboxes to select one or more roles
   - Use "Select All" to select all roles
   - Use "Deselect All" to clear selections
   - Selected roles are displayed below the checkboxes

2. **Select Actions** (Multiple Selection)
   - Click on action checkboxes to select one or more actions
   - Use "Select All" to select all actions
   - Use "Deselect All" to clear selections
   - Selected actions are displayed below the checkboxes

3. **Select Field**
   - Choose from dropdown organized by categories:
     - **Form Fields** - Employee information fields
     - **Sidebar Menu Items** - Navigation menu items
     - **Custom Fields** - User-defined fields (if any)
   - Use the "+" button to add custom fields

4. **Add Conditions** (Optional)
   - Define conditions to further restrict rule application
   - Select a field, operator (equals, contains, etc.), and value
   - Add multiple conditions as needed

5. **Enter Description**
   - Provide a clear description of what the rule does
   - Example: "Managers can view and edit employee salary for IT department only"

6. **Set Active Status**
   - Check "Rule is active" to enable the rule immediately
   - Uncheck to disable without deleting

7. **Create Rule**
   - Click "Create Rule" to save
   - The rule will apply the selected actions to all selected roles for the chosen field

### Editing a Rule

1. Click the edit icon on an existing rule
2. Modify any aspect of the rule (roles, actions, field, conditions, description)
3. Click "Update Rule" to save changes

### Rule Application Logic

When a rule is created:
- The selected **actions** are applied to all selected **roles**
- The rule applies to the chosen **field** (form field or sidebar menu item)
- **Conditions** further restrict when the rule applies
- Multiple rules can exist for the same role/action/field combination with different conditions

### Example Rules

**Example 1: Manager Access to Employee Salary**
- **Roles**: Manager, Department Head
- **Actions**: View, Edit
- **Field**: salary
- **Conditions**: department equals "IT"
- **Description**: "Managers and Department Heads can view and edit salary for IT department employees"

**Example 2: HR Access to Attendance Menu**
- **Roles**: HR Manager, Admin
- **Actions**: View, Create, Edit, Delete, Manage
- **Field**: attendance
- **Conditions**: (none)
- **Description**: "HR Managers and Admins have full access to the Attendance module"

**Example 3: Employee Access to Company Policy**
- **Roles**: Employee
- **Actions**: View
- **Field**: company-policy
- **Conditions**: (none)
- **Description**: "All employees can view company policy documents"

## Data Flow

```
Admin Creates Rule
    ↓
Select Multiple Roles (e.g., Admin, Manager)
    ↓
Select Multiple Actions (e.g., View, Edit, Delete, Create)
    ↓
Select Field (Form Field or Sidebar Menu Item)
    ↓
Add Conditions (Optional - e.g., department = "IT")
    ↓
Save Rule
    ↓
Rule Applied to All Selected Roles
    ↓
System Enforces Permissions Based on Rules
```

## Technical Implementation

### Frontend Components
- **RuleBuilder.js** - Main component for rule management
- **constants.js** - Defines roles, actions, and field categories
- **utils.js** - Validation and utility functions

### Field Categories Structure
```javascript
FIELD_CATEGORIES = {
  formFields: {
    label: 'Form Fields (Employee Information)',
    fields: [...]
  },
  sidebarMenu: {
    label: 'Sidebar Menu Items',
    fields: [...]
  }
}
```

### Rule Data Structure
```javascript
{
  role: 'admin,manager',        // Comma-separated string
  roles: ['admin', 'manager'],   // Array of roles
  action: 'view,edit,delete',    // Comma-separated string
  actions: ['view', 'edit', 'delete'], // Array of actions
  field: 'salary',               // Selected field
  conditions: [...],             // Array of condition objects
  description: '...',            // Rule description
  isActive: true                 // Active status
}
```

## Benefits

1. **Flexibility**: Support for multiple roles and actions per rule
2. **Granular Control**: Rules can apply to specific form fields or entire menu sections
3. **Conditional Logic**: Conditions allow context-specific permissions
4. **Extensibility**: Custom roles and fields can be added dynamically
5. **User-Friendly**: Clear categorization and intuitive UI
6. **Scalability**: Easy to add new roles, actions, or fields as the system grows

## Best Practices

1. **Descriptive Names**: Use clear, descriptive rule descriptions
2. **Principle of Least Privilege**: Grant only necessary permissions
3. **Regular Review**: Periodically review and update rules
4. **Test Rules**: Test rules in a development environment before production
5. **Documentation**: Document complex rules with detailed descriptions
6. **Group Related Rules**: Use consistent naming for related rules

## Future Enhancements

- Rule templates for common scenarios
- Rule import/export functionality
- Rule conflict detection
- Audit log for rule changes
- Rule testing/preview mode
- Bulk rule operations
