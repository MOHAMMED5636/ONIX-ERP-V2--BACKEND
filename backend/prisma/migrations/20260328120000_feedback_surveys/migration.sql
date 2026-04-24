-- CreateTable
CREATE TABLE "feedback_surveys" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_survey_questions" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "questionType" TEXT NOT NULL DEFAULT 'TEXT',
    "options" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_survey_assignments" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "feedback_survey_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_survey_responses" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_survey_questions_surveyId_idx" ON "feedback_survey_questions"("surveyId");

-- CreateIndex
CREATE INDEX "feedback_survey_assignments_userId_idx" ON "feedback_survey_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_survey_assignments_surveyId_userId_key" ON "feedback_survey_assignments"("surveyId", "userId");

-- CreateIndex
CREATE INDEX "feedback_survey_responses_surveyId_idx" ON "feedback_survey_responses"("surveyId");

-- CreateIndex
CREATE INDEX "feedback_survey_responses_userId_idx" ON "feedback_survey_responses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_survey_responses_questionId_userId_key" ON "feedback_survey_responses"("questionId", "userId");

-- AddForeignKey
ALTER TABLE "feedback_surveys" ADD CONSTRAINT "feedback_surveys_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_survey_questions" ADD CONSTRAINT "feedback_survey_questions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_survey_assignments" ADD CONSTRAINT "feedback_survey_assignments_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_survey_assignments" ADD CONSTRAINT "feedback_survey_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_survey_responses" ADD CONSTRAINT "feedback_survey_responses_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "feedback_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_survey_responses" ADD CONSTRAINT "feedback_survey_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "feedback_survey_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_survey_responses" ADD CONSTRAINT "feedback_survey_responses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
