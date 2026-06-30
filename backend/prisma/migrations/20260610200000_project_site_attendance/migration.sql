-- Smart site attendance: project geofence + labor cost logs

CREATE TYPE "AttendanceCategory" AS ENUM ('OFFICE', 'SITE', 'LABOR');

ALTER TABLE "users" ADD COLUMN "attendanceCategory" "AttendanceCategory" NOT NULL DEFAULT 'OFFICE';

ALTER TABLE "labour_details" ADD COLUMN "hourlyRate" DECIMAL(10,2);

ALTER TABLE "projects" ADD COLUMN "siteLatitude" DOUBLE PRECISION;
ALTER TABLE "projects" ADD COLUMN "siteLongitude" DOUBLE PRECISION;
ALTER TABLE "projects" ADD COLUMN "geofenceRadiusM" DOUBLE PRECISION DEFAULT 100;

CREATE TABLE "project_attendance_logs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "punchIn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "punchOut" TIMESTAMP(3),
    "costAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "workedHours" DOUBLE PRECISION,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "distanceFromSiteM" DOUBLE PRECISION,
    "isWithinGeofence" BOOLEAN,
    "punchOutLatitude" DOUBLE PRECISION,
    "punchOutLongitude" DOUBLE PRECISION,
    "facePhotoPath" TEXT,
    "faceMatchScore" DOUBLE PRECISION,
    "faceVerified" BOOLEAN NOT NULL DEFAULT false,
    "autoClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_attendance_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_attendance_logs_employeeId_idx" ON "project_attendance_logs"("employeeId");
CREATE INDEX "project_attendance_logs_projectId_idx" ON "project_attendance_logs"("projectId");
CREATE INDEX "project_attendance_logs_supervisorId_idx" ON "project_attendance_logs"("supervisorId");
CREATE INDEX "project_attendance_logs_punchIn_idx" ON "project_attendance_logs"("punchIn");
CREATE INDEX "project_attendance_logs_employeeId_punchOut_idx" ON "project_attendance_logs"("employeeId", "punchOut");

ALTER TABLE "project_attendance_logs" ADD CONSTRAINT "project_attendance_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_attendance_logs" ADD CONSTRAINT "project_attendance_logs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_attendance_logs" ADD CONSTRAINT "project_attendance_logs_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
