-- CreateEnum
CREATE TYPE "QuestionnaireAnswer" AS ENUM ('ACTION_PLAN_APPLIED', 'NOT_AVAILABLE', 'NOT_APPLIED', 'PENDING');

-- CreateTable: Questionnaire Templates
CREATE TABLE "questionnaire_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Questionnaire Questions
CREATE TABLE "questionnaire_questions" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "questionText" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT,
    "taskId" TEXT,
    "subtaskId" TEXT,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "questionnaire_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Questionnaire Responses
CREATE TABLE "questionnaire_responses" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answer" "QuestionnaireAnswer" NOT NULL DEFAULT 'PENDING',
    "remarks" TEXT,
    "answeredBy" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Questionnaire Assignments
CREATE TABLE "questionnaire_assignments" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "subtaskId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_assignments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey: Questionnaire Templates -> User (creator)
ALTER TABLE "questionnaire_templates" ADD CONSTRAINT "questionnaire_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Questions -> Template
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "questionnaire_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Questions -> Project
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Questions -> Task
ALTER TABLE "questionnaire_questions" ADD CONSTRAINT "questionnaire_questions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Responses -> Question
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questionnaire_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Responses -> User (answeredBy)
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_answeredBy_fkey" FOREIGN KEY ("answeredBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Assignments -> Template
ALTER TABLE "questionnaire_assignments" ADD CONSTRAINT "questionnaire_assignments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "questionnaire_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Assignments -> Project
ALTER TABLE "questionnaire_assignments" ADD CONSTRAINT "questionnaire_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: Questionnaire Assignments -> Task
ALTER TABLE "questionnaire_assignments" ADD CONSTRAINT "questionnaire_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: Unique constraint for one response per employee per question
CREATE UNIQUE INDEX "questionnaire_responses_questionId_answeredBy_key" ON "questionnaire_responses"("questionId", "answeredBy");
