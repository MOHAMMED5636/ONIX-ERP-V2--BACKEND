# How to View Your Prisma Database

## Option 1: Prisma Studio (Visual Interface) ⭐ RECOMMENDED

### Start Prisma Studio:
```bash
cd backend
npm run prisma:studio
```

Or directly:
```bash
cd backend
npx prisma studio
```

### Access:
- Open your browser to: **http://localhost:5555**
- You'll see a visual interface to browse all your database tables
- Can view, edit, add, and delete records

---

## Option 2: View Schema File

The database schema is defined in: `backend/prisma/schema.prisma`

### Database Models Overview:

#### 1. **User** (users table)
- `id` - UUID (primary key)
- `email` - String (unique)
- `password` - String (hashed)
- `firstName` - String
- `lastName` - String
- `role` - UserRole enum (ADMIN, TENDER_ENGINEER, PROJECT_MANAGER, CONTRACTOR)
- `isActive` - Boolean
- `createdAt` - DateTime
- `updatedAt` - DateTime

#### 2. **Client** (clients table)
- `id` - UUID (primary key)
- `referenceNumber` - String (unique)
- `name` - String
- `isCorporate` - String ("Person" or "Company")
- `leadSource` - String?
- `rank` - String?
- `email` - String?
- `phone` - String?
- `address` - String?
- `nationality` - String?
- `idNumber` - String?
- `passportNumber` - String?
- `birthDate` - DateTime?

#### 3. **Project** (projects table)
- `id` - UUID (primary key)
- `name` - String
- `referenceNumber` - String (unique)
- `clientId` - String? (foreign key to Client)
- `owner` - String?
- `description` - String?
- `status` - String (default: "Open")
- `deadline` - DateTime?
- `createdBy` - String? (foreign key to User)

#### 4. **Tender** (tenders table)
- `id` - UUID (primary key)
- `projectId` - String (foreign key to Project)
- `name` - String
- `referenceNumber` - String (unique)
- `clientId` - String? (foreign key to Client)
- `status` - TenderStatus enum (OPEN, CLOSED, AWARDED, REJECTED, CANCELLED)
- `scopeOfWork` - String?
- `technicalDrawingsLink` - String?
- `hasInvitationFees` - Boolean
- `invitationFeeAmount` - Decimal?
- `tenderAcceptanceDeadline` - DateTime?
- `bidSubmissionDeadline` - DateTime?
- `additionalNotes` - String?
- `attachmentFile` - String?

#### 5. **TenderInvitation** (tender_invitations table)
- `id` - UUID (primary key)
- `tenderId` - String (foreign key to Tender)
- `engineerId` - String (foreign key to User)
- `invitationToken` - String (unique)
- `status` - InvitationStatus enum (PENDING, ACCEPTED, REJECTED, EXPIRED)
- `assignedAt` - DateTime
- `acceptedAt` - DateTime?

#### 6. **TechnicalSubmission** (technical_submissions table)
- `id` - UUID (primary key)
- `tenderId` - String (foreign key to Tender)
- `engineerId` - String
- `submittedAt` - DateTime
- `status` - SubmissionStatus enum (SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED)

#### 7. **Document** (documents table)
- `id` - UUID (primary key)
- `module` - String ("PRJ", "HR", "CLI", "FIN", "GEN")
- `entityCode` - String (Reference number)
- `documentType` - String ("CNTR", "DRW", "RPT", etc.)
- `year` - Int
- `sequence` - String
- `referenceCode` - String (unique)
- `fileName` - String
- `filePath` - String
- `fileUrl` - String?
- `fileSize` - Int
- `mimeType` - String
- `projectId` - String? (foreign key to Project)
- `submissionId` - String? (foreign key to TechnicalSubmission)
- `uploadedBy` - String?
- `uploadedAt` - DateTime

---

## Option 3: Use PostgreSQL Client

If you have pgAdmin, DBeaver, or another PostgreSQL client:

1. Connect using your `DATABASE_URL` from `.env` file
2. Database name: `onix_erp` (or whatever is in your connection string)
3. Browse tables directly

---

## Option 4: Prisma CLI Commands

### View database status:
```bash
cd backend
npx prisma db pull      # Pull schema from database
npx prisma format       # Format schema file
npx prisma validate     # Validate schema
```

### Generate Prisma Client:
```bash
cd backend
npx prisma generate
```

### Run migrations:
```bash
cd backend
npm run prisma:migrate
```

---

## Default Users (After Seeding)

After running `npm run db:seed`, you'll have:

1. **Admin User:**
   - Email: `admin@onixgroup.ae`
   - Password: `admin123`
   - Role: `ADMIN`

2. **Tender Engineer User:**
   - Email: `engineer@onixgroup.ae`
   - Password: `engineer@123`
   - Role: `TENDER_ENGINEER`

---

## Quick Start

1. **Start Prisma Studio:**
   ```bash
   cd backend
   npm run prisma:studio
   ```

2. **Open browser:**
   Go to: http://localhost:5555

3. **Browse your data:**
   Click on any table name to view its records!

**Note:** Make sure your backend server is NOT running on port 5555, or Prisma Studio will use a different port.







