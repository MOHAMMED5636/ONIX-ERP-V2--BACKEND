# Add Manager Name to Contract Details View

## Backend

The contract details API already returns the manager name:

- **Endpoint**: `GET /api/contracts/:id` (`getContractById`)
- **Response**: `data.projectManager` (string, optional) — project manager name

No backend changes are required.

---

## Frontend – Contract Details Modal / Page

Add the **Manager** (project manager) field to the Contract Details view so it appears in the **Contract Overview** section (e.g. after "Client" or "Company").

### 1. Data

The contract object from the API includes:

- `contract.projectManager` — manager name (may be `null` or empty)

### 2. Display in Contract Overview

In the component that renders the Contract Overview card (the one that shows Contract Reference, Status, Category, Total Value, Company, Client), add a row for the manager.

**Example (React/JSX):**

```jsx
{/* Contract Overview section */}
<div><span className="font-semibold">Contract Reference:</span> {selectedContract.referenceNumber}</div>
<div><span className="font-semibold">Status:</span> {selectedContract.status}</div>
<div><span className="font-semibold">Category:</span> {selectedContract.contractCategory}</div>
<div><span className="font-semibold">Total Value:</span> {selectedContract.contractValue} {selectedContract.currency}</div>
<div><span className="font-semibold">Company:</span> {selectedContract.companyName}</div>
<div><span className="font-semibold">Client:</span> {selectedContract.client?.name || selectedContract.clientName}</div>
{/* Add Manager row */}
<div><span className="font-semibold">Manager:</span> {selectedContract.projectManager || '—'}</div>
```

### 3. Edit mode (if Contract Details are editable)

If the Contract Details form has an edit mode and you want the manager to be editable there:

- **View mode**: show `selectedContract.projectManager || '—'`
- **Edit mode**: use an input (or existing project manager selector) bound to the same field and send it as `projectManagerName` when saving (see PROJECT_MANAGER_IN_CONTRACT.md).

### 4. Summary

| Location        | Field / API              | Display / Save                    |
|----------------|---------------------------|-----------------------------------|
| Contract Overview | `contract.projectManager` | Show as "Manager: &lt;name&gt;" or "—" |
| API response   | `GET /api/contracts/:id`  | `data.projectManager`             |

After adding this row, the Manager name will appear in the Contract Details view.
