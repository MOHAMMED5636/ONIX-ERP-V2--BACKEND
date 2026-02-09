# ✅ Load Out Feature - Contract to Project Conversion

## 🎯 Overview

The **Load Out** feature allows users to automatically create a new project in the Project List from an existing contract. When a user clicks the "Load Out" button on any contract, the system fetches all contract details and creates a corresponding project entry with all relevant fields mapped.

## ✨ Features

1. **Automatic Project Creation**: Creates a new project from contract data with a single click
2. **Complete Data Mapping**: Maps all contract fields to corresponding project fields
3. **Duplicate Prevention**: Prevents creating duplicate projects if contract is already linked
4. **User Notifications**: Shows success/error messages with project reference numbers
5. **Automatic Linking**: Links the contract to the created project

## 🔧 Implementation Details

### Backend (`contracts.controller.ts`)

**Endpoint**: `POST /api/contracts/:id/load-out`

**Functionality**:
- Fetches contract with all details (client, creator, existing project)
- Checks if project already exists (prevents duplicates)
- Generates unique project reference number (`PRJ-XXXXX`)
- Maps contract fields to project fields:
  - `contract.title` → `project.name`
  - `contract.description` → `project.description`
  - `contract.clientId` → `project.clientId`
  - `contract.developerName` → `project.owner`
  - `contract.creator` → `project.projectManager` (full name)
  - `contract.startDate` → `project.startDate`
  - `contract.endDate` → `project.endDate` and `project.deadline`
  - `contract.specialClauses/termsAndConditions` → `project.remarks`
  - `contract.paymentTerms` → `project.assigneeNotes`
  - Calculates `planDays` from contract dates
- Creates project with status `OPEN`
- Links contract to project (`contract.projectId`)
- Returns project and contract details

**Access Control**: Requires `ADMIN`, `HR`, or `PROJECT_MANAGER` role (EMPLOYEE role is denied)

### Frontend (`ContractList.js`)

**UI Components**:
- **Load Out Button**: Purple button with arrow icon in contract table "Options" column
- **Loading State**: Shows spinner and "Loading..." text while processing
- **Disabled State**: Button is disabled if contract is already linked to a project
- **Success Notification**: Green banner showing contract → project mapping
- **Error Handling**: Alert dialogs for errors

**User Flow**:
1. User clicks "Load Out" button on a contract
2. Confirmation dialog appears
3. System creates project (shows loading state)
4. Success notification appears with project reference
5. Contract list updates to show linked project
6. User can navigate to Project List to view new project

### API Service (`contractsAPI.js`)

**Method**: `ContractsAPI.loadOutContract(contractId)`

- Makes POST request to `/api/contracts/:id/load-out`
- Handles authentication token
- Returns response with project and contract data
- Throws errors for error handling

## 📋 Field Mapping

| Contract Field | Project Field | Notes |
|---------------|---------------|-------|
| `title` | `name` | Contract title becomes project name |
| `description` | `description` | Direct mapping |
| `clientId` | `clientId` | Links to same client |
| `developerName` | `owner` | Developer name as project owner |
| `creator.firstName + lastName` | `projectManager` | Full name, max 100 chars |
| `startDate` | `startDate` | Date conversion |
| `endDate` | `endDate` | Date conversion |
| `endDate` | `deadline` | Uses contract end date |
| `specialClauses` or `termsAndConditions` | `remarks` | Fallback to terms if no clauses |
| `paymentTerms` | `assigneeNotes` | Payment terms as notes |
| Calculated from dates | `planDays` | Days between start and end |
| Auto-generated | `referenceNumber` | Format: `PRJ-XXXXX` |
| Default | `status` | Always `OPEN` |

## 🔒 Duplicate Prevention

The system prevents duplicate entries by:
1. Checking if `contract.projectId` exists before creating
2. Checking if `contract.project` relation exists
3. Returning error message with existing project reference if found
4. Disabling Load Out button in UI if contract is already linked

## 📊 Example Response

```json
{
  "success": true,
  "message": "Project PRJ-ABC123 created successfully from contract O-CT-XYZ789",
  "data": {
    "project": {
      "id": "project-uuid",
      "referenceNumber": "PRJ-ABC123",
      "name": "Dubai Marina Tower Construction",
      "status": "OPEN",
      "clientId": "client-uuid",
      "clientName": "ABC Construction Company"
    },
    "contract": {
      "id": "contract-uuid",
      "referenceNumber": "O-CT-XYZ789",
      "title": "Dubai Marina Tower Construction"
    }
  }
}
```

## 🚨 Error Handling

### Contract Already Linked
```json
{
  "success": false,
  "message": "This contract is already linked to project PRJ-EXISTING. Duplicate entries are not allowed.",
  "existingProject": {
    "id": "project-uuid",
    "referenceNumber": "PRJ-EXISTING",
    "name": "Existing Project"
  }
}
```

### Contract Not Found
```json
{
  "success": false,
  "message": "Contract not found"
}
```

### Access Denied
```json
{
  "success": false,
  "message": "Access Denied: You do not have permission to create projects.",
  "code": "ACCESS_DENIED"
}
```

## 🧪 Testing Checklist

- [x] Load Out button appears in contract table
- [x] Button is disabled for contracts already linked to projects
- [x] Confirmation dialog appears before creating project
- [x] Loading state shows during API call
- [x] Success notification appears after creation
- [x] Project is created with correct fields mapped
- [x] Contract is linked to created project
- [x] Duplicate prevention works correctly
- [x] Error messages display properly
- [x] Project appears in Project List after creation

## 📝 Notes

- **Project Reference**: Auto-generated format `PRJ-XXXXX` (8 random alphanumeric characters)
- **Project Status**: Always set to `OPEN` (can be changed later)
- **Plan Days**: Calculated automatically from contract start/end dates
- **Project Manager**: Extracted from contract creator's full name
- **Contract Linking**: Contract's `projectId` is updated after project creation
- **UI Updates**: Contract list refreshes to show linked project status

## 🔄 Future Enhancements

Potential improvements:
- Allow user to customize project reference number
- Allow user to set initial project status
- Show preview of project data before creation
- Bulk Load Out for multiple contracts
- Option to copy contract attachments to project
- Integration with project templates
