# Auto-Fill Project Data from Contract Reference

## Feature Overview

When creating a new project, users can enter a **Contract Reference Number**. The system automatically retrieves relevant contract details and pre-fills the project creation form, saving time and ensuring data consistency.

---

## 🎯 Backend Implementation

### **API Endpoint**

**GET** `/api/contracts/by-reference?referenceNumber={referenceNumber}`

**Purpose:** Fetch contract data by reference number for project auto-fill

**Authentication:** Required (JWT token)

**Query Parameters:**
- `referenceNumber` (required) - The contract reference number to lookup

**Response Format:**

```json
{
  "success": true,
  "data": {
    // Full contract object with all fields
    "id": "uuid",
    "referenceNumber": "O-CT-ABC123",
    "title": "Dubai Marina Tower Project",
    "description": "High-rise residential tower",
    "clientId": "uuid",
    "client": {
      "id": "uuid",
      "name": "ABC Construction Company",
      "email": "contact@abc.com",
      "phone": "+971501234567",
      // ... other client fields
    },
    "startDate": "2026-02-18T00:00:00.000Z",
    "endDate": "2026-12-31T00:00:00.000Z",
    "contractType": "Construction",
    "contractCategory": "Residential",
    "developerName": "XYZ Developers",
    "plotNumber": "12345",
    "numberOfFloors": 25,
    "region": "Dubai Marina",
    "community": "Marina District",
    "makaniNumber": "1234567890",
    // ... other contract fields
  },
  "projectData": {
    // Pre-formatted data ready for project form
    "clientId": "uuid",
    "clientName": "ABC Construction Company",
    "name": "Dubai Marina Tower Project",
    "description": "High-rise residential tower",
    "startDate": "2026-02-18",
    "endDate": "2026-12-31",
    "owner": "XYZ Developers",
    "projectManager": "John Doe",
    "contractType": "Construction",
    "contractCategory": "Residential",
    "plotNumber": "12345",
    "numberOfFloors": 25,
    "region": "Dubai Marina",
    "community": "Marina District",
    "makaniNumber": "1234567890"
  },
  "message": "Contract found. Project form can be auto-filled."
}
```

**Error Response (Contract Not Found):**

```json
{
  "success": false,
  "data": null,
  "message": "Contract not found with the provided reference number. Please verify the reference number and try again."
}
```

---

## 📋 Field Mapping: Contract → Project

| Contract Field | Project Field | Notes |
|---------------|---------------|-------|
| `title` | `name` | Contract title becomes project name |
| `description` | `description` | Direct mapping |
| `clientId` | `clientId` | Links project to same client |
| `client.name` | `clientName` | For display purposes |
| `startDate` | `startDate` | Formatted as YYYY-MM-DD |
| `endDate` | `endDate` | Formatted as YYYY-MM-DD |
| `developerName` | `owner` | Developer name as project owner |
| `creator.firstName + lastName` | `projectManager` | Contract creator as project manager |
| `contractType` | - | Additional info (not mapped to project) |
| `contractCategory` | - | Additional info (not mapped to project) |
| `plotNumber` | - | Additional info (not mapped to project) |
| `numberOfFloors` | - | Additional info (not mapped to project) |
| `region` | - | Additional info (not mapped to project) |
| `community` | - | Additional info (not mapped to project) |
| `makaniNumber` | - | Additional info (not mapped to project) |

---

## 🔄 Project Creation Flow

### **Current Implementation**

The `createProject` endpoint (`POST /api/projects`) already supports auto-population:

1. **Request Body:**
   ```json
   {
     "referenceNumber": "PRJ-001",
     "contractReferenceNumber": "O-CT-ABC123",  // ← Contract reference
     "name": "Project Name",  // Optional - will use contract.title if not provided
     "clientId": "uuid",  // Optional - will use contract.clientId if not provided
     // ... other fields
   }
   ```

2. **Backend Logic:**
   - If `contractReferenceNumber` is provided, backend fetches contract
   - Auto-populates: `clientId`, `startDate`, `endDate`, `description`
   - Auto-generates project name from contract title if not provided
   - Links contract to project after creation

---

## 💻 Frontend Implementation Guide

### **Step 1: Add Contract Reference Input Field**

Add a field in the project creation form:

```jsx
<div className="form-group">
  <label>Contract Reference Number (Optional)</label>
  <input
    type="text"
    value={contractReference}
    onChange={(e) => {
      setContractReference(e.target.value);
      // Auto-fill when reference is entered
      if (e.target.value.trim()) {
        fetchContractData(e.target.value.trim());
      }
    }}
    placeholder="Enter contract reference (e.g., O-CT-ABC123)"
    onBlur={() => {
      // Fetch when user leaves the field
      if (contractReference.trim()) {
        fetchContractData(contractReference.trim());
      }
    }}
  />
  {contractLoading && <span>Loading contract data...</span>}
  {contractError && <span className="error">{contractError}</span>}
</div>
```

### **Step 2: Create API Function**

```javascript
// In your API service file (e.g., contractAPI.js or projectAPI.js)
export const getContractByReference = async (referenceNumber) => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/contracts/by-reference?referenceNumber=${encodeURIComponent(referenceNumber)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching contract:', error);
    throw error;
  }
};
```

### **Step 3: Auto-Fill Logic**

```javascript
const [contractReference, setContractReference] = useState('');
const [contractLoading, setContractLoading] = useState(false);
const [contractError, setContractError] = useState('');

const fetchContractData = async (referenceNumber) => {
  if (!referenceNumber || referenceNumber.trim() === '') {
    return;
  }

  setContractLoading(true);
  setContractError('');

  try {
    const response = await getContractByReference(referenceNumber);
    
    if (response.success && response.projectData) {
      // Auto-fill project form fields
      setFormData(prev => ({
        ...prev,
        // Map contract data to project fields
        clientId: response.projectData.clientId || prev.clientId,
        name: response.projectData.name || prev.name,
        description: response.projectData.description || prev.description,
        startDate: response.projectData.startDate || prev.startDate,
        endDate: response.projectData.endDate || prev.endDate,
        owner: response.projectData.owner || prev.owner,
        projectManager: response.projectData.projectManager || prev.projectManager,
        // Store contract reference for linking
        contractReferenceNumber: referenceNumber,
      }));
      
      // Show success message
      showToast('Contract data loaded successfully. Form fields have been auto-filled.', 'success');
    } else {
      setContractError(response.message || 'Contract not found');
      showToast('Contract not found. Please verify the reference number.', 'error');
    }
  } catch (error) {
    setContractError('Failed to fetch contract data');
    showToast('Error loading contract data. Please try again.', 'error');
  } finally {
    setContractLoading(false);
  }
};
```

### **Step 4: Include Contract Reference in Project Creation**

When submitting the project form, include the contract reference:

```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  const projectData = {
    ...formData,
    contractReferenceNumber: contractReference, // Include contract reference
    // ... other project fields
  };
  
  try {
    const response = await createProject(projectData);
    // Handle success
  } catch (error) {
    // Handle error
  }
};
```

---

## ✅ Benefits

1. **Time Savings:** Eliminates manual data entry for common fields
2. **Data Consistency:** Ensures contract and project data match
3. **Error Reduction:** Reduces typos and data entry mistakes
4. **User Experience:** Instant validation and feedback
5. **Workflow Efficiency:** Streamlines project creation process

---

## 🔍 Validation & Error Handling

### **Frontend Validation:**

- ✅ Check if reference number is not empty before API call
- ✅ Show loading state while fetching
- ✅ Display user-friendly error messages
- ✅ Allow user to proceed even if contract not found
- ✅ Allow manual override of auto-filled fields

### **Backend Validation:**

- ✅ Reference number is required in query parameter
- ✅ Returns 400 if reference number missing
- ✅ Returns success: false if contract not found (not 404, for better UX)
- ✅ Includes full contract data + pre-formatted projectData
- ✅ Handles database errors gracefully

---

## 📝 Example Usage Flow

1. **User opens "Create Project" form**
2. **User enters contract reference:** `O-CT-ABC123`
3. **Frontend calls:** `GET /api/contracts/by-reference?referenceNumber=O-CT-ABC123`
4. **Backend returns:** Contract data + projectData object
5. **Frontend auto-fills:**
   - Project Name: "Dubai Marina Tower Project"
   - Client: "ABC Construction Company"
   - Start Date: "2026-02-18"
   - End Date: "2026-12-31"
   - Owner: "XYZ Developers"
   - Project Manager: "John Doe"
6. **User reviews and adjusts fields if needed**
7. **User submits project form** (includes contractReferenceNumber)
8. **Backend creates project and links to contract**

---

## 🚀 Testing

### **Test Cases:**

1. ✅ Valid contract reference → Auto-fills successfully
2. ✅ Invalid contract reference → Shows error message
3. ✅ Empty reference → No API call
4. ✅ Network error → Shows error message
5. ✅ User can override auto-filled fields
6. ✅ Project creation with contract reference links contract

---

## 📚 Related Endpoints

- **GET** `/api/contracts/by-reference` - Fetch contract for auto-fill
- **POST** `/api/projects` - Create project (supports `contractReferenceNumber`)
- **GET** `/api/contracts` - List all contracts
- **GET** `/api/contracts/:id` - Get contract by ID

---

**Last Updated:** 2026-02-03
**Status:** ✅ Backend ready, Frontend implementation pending
