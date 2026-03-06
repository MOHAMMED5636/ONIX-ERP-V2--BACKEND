-- AlterTable: Make attendance location fields optional (location-based attendance is now optional)
ALTER TABLE "attendances" 
  ALTER COLUMN "employeeLatitude" DROP NOT NULL,
  ALTER COLUMN "employeeLongitude" DROP NOT NULL,
  ALTER COLUMN "distanceFromOffice" DROP NOT NULL,
  ALTER COLUMN "isWithinRadius" DROP NOT NULL;
