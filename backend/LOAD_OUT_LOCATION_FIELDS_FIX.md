# Load Out Location Fields Fix

## Problem
When using the "Load Out" feature to create a project from a contract, the following fields were not being populated:
- Location / Makani Number
- Community
- Project Type
- Number of Floors
- Plot Number
- Developer Project

## Root Cause
The `Project` model in the database schema did not have fields to store location and project detail information. These fields existed in the `Contract` model but were not being transferred to the `Project` model when creating a project via Load Out.

## Solution
Added the following fields to the `Project` model in the database schema:

1. **location** (String?) - Location string (coordinates or address)
2. **makaniNumber** (String?) - Makani number (UAE addressing system)
3. **plotNumber** (String?) - Plot number
4. **community** (String?) - Community name
5. **projectType** (String?) - Project type (e.g., "Residential", "Commercial")
6. **projectFloor** (String?) - Number of floors (stored as string)
7. **developerProject** (String?) - Developer name/project

## Changes Made

### 1. Database Schema (`backend/prisma/schema.prisma`)
- Added 7 new optional fields to the `Project` model

### 2. Database Migration (`backend/prisma/migrations/20260204010000_add_location_fields_to_projects/migration.sql`)
- Created migration to add the new columns to the `projects` table
- Migration executed successfully ✅

### 3. Load Out Function (`backend/src/controllers/contracts.controller.ts`)
- Updated `loadOutContract` to:
  - Fetch location fields from contract
  - Build location string from makani number or coordinates
  - Map all location fields from contract to project when creating
  - Include location fields in the API response

### 4. Create Project Function (`backend/src/controllers/projects.controller.ts`)
- Updated `createProject` to:
  - Accept location fields in request body
  - Auto-populate location fields from contract if `contractReferenceNumber` is provided
  - Save location fields to the database

### 5. Update Project Function (`backend/src/controllers/projects.controller.ts`)
- Updated `updateProject` to accept and update location fields

### 6. Frontend Mapping (`ERP-FRONTEND/ONIX-ERP-V2/src/components/tasks/MainTable.js`)
- Updated project mapping to prioritize project fields over contract fields
- Changed from: `primaryContract?.plotNumber || project.plotNumber`
- Changed to: `project.plotNumber || primaryContract?.plotNumber`

## Testing Checklist

1. **Load Out Feature**
   - [ ] Create a contract with location fields (makani number, plot number, community, project type, number of floors, developer name)
   - [ ] Click "Load Out" on the contract
   - [ ] Verify the new project appears in the Project List
   - [ ] Verify all location fields are populated correctly:
     - [ ] Location/Makani Number
     - [ ] Plot Number
     - [ ] Community
     - [ ] Project Type
     - [ ] Number of Floors
     - [ ] Developer Project

2. **Create Project with Contract Reference**
   - [ ] Create a new project and provide a contract reference number
   - [ ] Verify location fields are auto-populated from the contract

3. **Edit Project**
   - [ ] Edit a project's location fields
   - [ ] Verify changes are saved correctly

4. **Project List Display**
   - [ ] Verify location fields display correctly in the project list table
   - [ ] Verify fields are editable in the table

## Next Steps

1. **Restart TypeScript Server** (if you see TypeScript errors):
   - In VS Code/Cursor: Press `Ctrl+Shift+P` → "TypeScript: Restart TS Server"
   - This will reload the Prisma client types

2. **Restart Backend Server**:
   - Stop the current dev server
   - Run `npm run dev` or your start command
   - The new fields will be available in the API

3. **Test the Load Out Feature**:
   - Use a contract with location data
   - Click "Load Out" and verify all fields are populated

## Notes

- The migration has been executed successfully
- Prisma client has been regenerated
- All backend functions have been updated
- Frontend mapping has been updated to prioritize project fields

If you see TypeScript errors about missing fields, restart the TypeScript server in your IDE. The Prisma client has been regenerated and the types are correct.
