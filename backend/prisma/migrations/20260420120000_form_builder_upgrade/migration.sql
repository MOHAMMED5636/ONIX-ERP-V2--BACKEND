-- Form Builder upgrade: sections, submissions, answers, settings, logic, sharing, collaborators, ERP actions

-- Survey metadata
ALTER TABLE "feedback_surveys" ADD COLUMN "department" TEXT;
ALTER TABLE "feedback_surveys" ADD COLUMN "ownerId" TEXT;

UPDATE "feedback_surveys" SET "status" = 'PUBLISHED' WHERE "status" = 'ACTIVE';
ALTER TABLE "feedback_surveys" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

UPDATE "feedback_surveys" SET "ownerId" = "createdBy" WHERE "ownerId" IS NULL AND "createdBy" IS NOT NULL;

ALTER TABLE "feedback_surveys" ADD CONSTRAINT "feedback_surveys_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sections
CREATE TABLE "feedback_survey_sections" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_sections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_survey_sections_surveyId_idx" ON "feedback_survey_sections"("surveyId");

ALTER TABLE "feedback_survey_sections" ADD CONSTRAINT "feedback_survey_sections_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Question extensions
ALTER TABLE "feedback_survey_questions" ADD COLUMN "sectionId" TEXT;
ALTER TABLE "feedback_survey_questions" ADD COLUMN "placeholder" TEXT;
ALTER TABLE "feedback_survey_questions" ADD COLUMN "config" JSONB;
ALTER TABLE "feedback_survey_questions" ADD COLUMN "validation" JSONB;

UPDATE "feedback_survey_questions" SET "questionType" = 'SHORT_TEXT' WHERE "questionType" = 'TEXT';

ALTER TABLE "feedback_survey_questions" ADD CONSTRAINT "feedback_survey_questions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "feedback_survey_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "feedback_survey_questions_sectionId_idx" ON "feedback_survey_questions"("sectionId");

-- Settings (one row per survey)
CREATE TABLE "feedback_survey_settings" (
    "surveyId" TEXT NOT NULL,
    "allowMultipleSubmissions" BOOLEAN NOT NULL DEFAULT false,
    "requireLogin" BOOLEAN NOT NULL DEFAULT true,
    "closingDate" TIMESTAMP(3),
    "notifyOnSubmit" BOOLEAN NOT NULL DEFAULT false,
    "confirmationMessage" TEXT,
    "allowEditAfterSubmit" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_settings_pkey" PRIMARY KEY ("surveyId")
);

ALTER TABLE "feedback_survey_settings" ADD CONSTRAINT "feedback_survey_settings_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "feedback_survey_settings" ("surveyId", "allowMultipleSubmissions", "requireLogin", "notifyOnSubmit", "allowEditAfterSubmit", "createdAt", "updatedAt")
SELECT "id", false, true, false, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "feedback_surveys";

-- Logic rules
CREATE TABLE "feedback_survey_logic_rules" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "sourceQuestionId" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetQuestionId" TEXT,
    "targetSectionId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_logic_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_survey_logic_rules_surveyId_idx" ON "feedback_survey_logic_rules"("surveyId");
CREATE INDEX "feedback_survey_logic_rules_sourceQuestionId_idx" ON "feedback_survey_logic_rules"("sourceQuestionId");

ALTER TABLE "feedback_survey_logic_rules" ADD CONSTRAINT "feedback_survey_logic_rules_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_logic_rules" ADD CONSTRAINT "feedback_survey_logic_rules_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "feedback_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_logic_rules" ADD CONSTRAINT "feedback_survey_logic_rules_targetQuestionId_fkey" FOREIGN KEY ("targetQuestionId") REFERENCES "feedback_survey_questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_logic_rules" ADD CONSTRAINT "feedback_survey_logic_rules_targetSectionId_fkey" FOREIGN KEY ("targetSectionId") REFERENCES "feedback_survey_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Share links
CREATE TABLE "feedback_survey_share_links" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "requireLogin" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_survey_share_links_token_key" ON "feedback_survey_share_links"("token");
CREATE INDEX "feedback_survey_share_links_surveyId_idx" ON "feedback_survey_share_links"("surveyId");

ALTER TABLE "feedback_survey_share_links" ADD CONSTRAINT "feedback_survey_share_links_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_share_links" ADD CONSTRAINT "feedback_survey_share_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Submissions + answers
CREATE TABLE "feedback_survey_submissions" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT,
    "shareLinkId" TEXT,
    "sessionToken" TEXT,
    "submittedAt" TIMESTAMP(3),
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_survey_submissions_sessionToken_key" ON "feedback_survey_submissions"("sessionToken");
CREATE INDEX "feedback_survey_submissions_surveyId_idx" ON "feedback_survey_submissions"("surveyId");
CREATE INDEX "feedback_survey_submissions_userId_idx" ON "feedback_survey_submissions"("userId");

ALTER TABLE "feedback_survey_submissions" ADD CONSTRAINT "feedback_survey_submissions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_submissions" ADD CONSTRAINT "feedback_survey_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_submissions" ADD CONSTRAINT "feedback_survey_submissions_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "feedback_survey_share_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "feedback_survey_answers" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_answers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_survey_answers_submissionId_questionId_key" ON "feedback_survey_answers"("submissionId", "questionId");
CREATE INDEX "feedback_survey_answers_questionId_idx" ON "feedback_survey_answers"("questionId");

ALTER TABLE "feedback_survey_answers" ADD CONSTRAINT "feedback_survey_answers_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "feedback_survey_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_answers" ADD CONSTRAINT "feedback_survey_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "feedback_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Collaborators
CREATE TABLE "feedback_survey_collaborators" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_collaborators_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feedback_survey_collaborators_surveyId_userId_key" ON "feedback_survey_collaborators"("surveyId", "userId");
CREATE INDEX "feedback_survey_collaborators_userId_idx" ON "feedback_survey_collaborators"("userId");

ALTER TABLE "feedback_survey_collaborators" ADD CONSTRAINT "feedback_survey_collaborators_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feedback_survey_collaborators" ADD CONSTRAINT "feedback_survey_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ERP post-submit actions
CREATE TABLE "feedback_survey_actions" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "fieldMap" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "feedback_survey_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feedback_survey_actions_surveyId_idx" ON "feedback_survey_actions"("surveyId");

ALTER TABLE "feedback_survey_actions" ADD CONSTRAINT "feedback_survey_actions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill submissions + answers from legacy feedback_survey_responses (if any)
CREATE TEMP TABLE "_fb_sub_map" ON COMMIT DROP AS
SELECT gen_random_uuid()::text AS "subId", "surveyId", "userId"
FROM (SELECT DISTINCT "surveyId", "userId" FROM "feedback_survey_responses") AS d;

INSERT INTO "feedback_survey_submissions" ("id", "surveyId", "userId", "submittedAt", "isComplete", "createdAt", "updatedAt")
SELECT m."subId", m."surveyId", m."userId",
  (SELECT MAX(r."createdAt") FROM "feedback_survey_responses" r WHERE r."surveyId" = m."surveyId" AND r."userId" = m."userId"),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "_fb_sub_map" m;

INSERT INTO "feedback_survey_answers" ("id", "submissionId", "questionId", "value", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, m."subId", r."questionId", r."answer", r."createdAt", r."updatedAt"
FROM "feedback_survey_responses" r
JOIN "_fb_sub_map" m ON m."surveyId" = r."surveyId" AND m."userId" = r."userId";
