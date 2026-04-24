import { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { config } from '../config/env';
import {
  FEEDBACK_SURVEY_RECIPIENT_ROLES,
  SURVEY_ADMIN_ROLES,
  hiddenQuestionIdsFromRules,
  isPastClosing,
  isSurveyPastDue,
  normalizeQuestionType,
  normalizeSurveyStatus,
  parseQuestionOptions,
  questionPayload,
  validateAnswerForQuestion,
} from '../utils/feedbackSurvey.helpers';
import { runFeedbackSurveyErpActions } from '../services/feedbackSurveyErp.service';

const FEEDBACK_RECIPIENT_ROLES: UserRole[] = [...FEEDBACK_SURVEY_RECIPIENT_ROLES];

function canManageOrgSurveys(role: string | undefined): boolean {
  return !!role && (SURVEY_ADMIN_ROLES as readonly string[]).includes(role);
}

type QuestionInput = {
  id?: string;
  questionText: string;
  description?: string | null;
  order?: number;
  questionType?: string;
  options?: string[] | null;
  isRequired?: boolean;
  placeholder?: string | null;
  config?: unknown;
  validation?: unknown;
};

type SectionInput = {
  id?: string;
  title: string;
  description?: string | null;
  order?: number;
  questions?: QuestionInput[];
};

type Access = 'NONE' | 'RESPOND' | 'REVIEW' | 'EDIT' | 'HR_ADMIN';

async function resolveAccess(surveyId: string, userId: string | undefined, role: string | undefined): Promise<Access> {
  if (!userId) return 'NONE';
  if (role && (SURVEY_ADMIN_ROLES as readonly string[]).includes(role)) return 'HR_ADMIN';
  const survey = await prisma.feedbackSurvey.findUnique({
    where: { id: surveyId },
    select: { createdBy: true, ownerId: true },
  });
  if (!survey) return 'NONE';
  if (survey.ownerId === userId || survey.createdBy === userId) return 'EDIT';
  const collab = await prisma.feedbackSurveyCollaborator.findUnique({
    where: { surveyId_userId: { surveyId, userId } },
  });
  if (collab?.role === 'REVIEWER') return 'REVIEW';
  if (collab?.role === 'EDITOR') return 'EDIT';
  const a = await prisma.feedbackSurveyAssignment.findUnique({
    where: { surveyId_userId: { surveyId, userId } },
  });
  if (a) return 'RESPOND';
  return 'NONE';
}

function assertAccess(min: Access, actual: Access, res: Response): boolean {
  const rank: Record<Access, number> = {
    NONE: 0,
    RESPOND: 1,
    REVIEW: 2,
    EDIT: 3,
    HR_ADMIN: 4,
  };
  if (rank[actual] < rank[min]) {
    res.status(403).json({ success: false, message: 'Forbidden' });
    return false;
  }
  return true;
}

function canViewResponses(acc: Access): boolean {
  return acc === 'HR_ADMIN' || acc === 'REVIEW' || acc === 'EDIT';
}

async function maybeNotifyOwner(surveyId: string, submitterEmail?: string): Promise<void> {
  const s = await prisma.feedbackSurvey.findUnique({
    where: { id: surveyId },
    include: {
      settings: true,
      owner: { select: { email: true } },
      creator: { select: { email: true } },
    },
  });
  if (!s?.settings?.notifyOnSubmit) return;
  const to = s.owner?.email || s.creator?.email;
  if (!to || !config.email.host) return;
  const transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.port === 465,
    auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
  });
  await transporter.sendMail({
    from: config.email.from,
    to,
    subject: `Form submitted: ${s.title}`,
    text: `A new response was submitted for "${s.title}".${submitterEmail ? ` Submitter: ${submitterEmail}` : ''}`,
  });
}

function mapQuestionsCreate(
  questions: QuestionInput[],
  ids?: { surveyId: string; sectionId: string | null },
): Record<string, unknown>[] {
  return questions.map((q, index) => ({
    ...(ids
      ? { surveyId: ids.surveyId, sectionId: ids.sectionId }
      : {}),
    questionText: String(q.questionText).trim(),
    description: q.description ? String(q.description).trim() : null,
    order: typeof q.order === 'number' ? q.order : index,
    questionType: normalizeQuestionType(q.questionType),
    options:
      Array.isArray(q.options) && q.options.length > 0 ? JSON.stringify(q.options.map(String)) : null,
    isRequired: q.isRequired !== false,
    placeholder: q.placeholder ? String(q.placeholder).trim() : null,
    config: q.config === undefined || q.config === null ? undefined : (q.config as object),
    validation: q.validation === undefined || q.validation === null ? undefined : (q.validation as object),
  }));
}

async function saveSubmissionInternal(params: {
  surveyId: string;
  userId: string;
  answers: Record<string, string>;
  markComplete: boolean;
  userEmail?: string;
}): Promise<{ ok: false; status: number; message: string } | { ok: true; submissionId: string }> {
  const { surveyId, userId, answers, markComplete, userEmail } = params;

  const assignment = await prisma.feedbackSurveyAssignment.findUnique({
    where: { surveyId_userId: { surveyId, userId } },
    include: {
      survey: {
        include: {
          questions: { orderBy: { order: 'asc' } },
          settings: true,
          logicRules: { orderBy: { order: 'asc' } },
        },
      },
    },
  });
  if (!assignment) {
    return { ok: false, status: 403, message: 'You are not assigned to this survey.' };
  }
  const survey = assignment.survey;
  const st = normalizeSurveyStatus(survey.status);
  if (!(st === 'PUBLISHED' || st === 'ACTIVE')) {
    return { ok: false, status: 400, message: 'This survey is not accepting responses.' };
  }
  if (isPastClosing(survey.settings, survey.dueDate) || isSurveyPastDue(survey.dueDate)) {
    return { ok: false, status: 400, message: 'This survey is closed.' };
  }

  const settings = survey.settings;
  const hidden = hiddenQuestionIdsFromRules(survey.logicRules, answers);

  for (const q of survey.questions) {
    const val = answers[q.id];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      const err = validateAnswerForQuestion(q, String(val));
      if (err) return { ok: false, status: 400, message: err };
      const qt = normalizeQuestionType(q.questionType);
      if (qt === 'MULTIPLE_CHOICE') {
        const opts = parseQuestionOptions(q.options);
        const parts = String(val)
          .split('||')
          .map((s) => s.trim())
          .filter(Boolean);
        if (opts && parts.some((p) => !opts.includes(p))) {
          return { ok: false, status: 400, message: 'Invalid choice' };
        }
      }
    }
  }

  for (const q of survey.questions) {
    if (!q.isRequired || hidden.has(q.id)) continue;
    const a = answers[q.id];
    if (markComplete && (a === undefined || a === null || String(a).trim() === '')) {
      return { ok: false, status: 400, message: `Required question not answered: ${q.questionText}` };
    }
  }

  if (markComplete && settings && !settings.allowMultipleSubmissions) {
    const prevDone = await prisma.feedbackSurveySubmission.findFirst({
      where: { surveyId, userId, isComplete: true },
    });
    if (prevDone && !settings.allowEditAfterSubmit) {
      return { ok: false, status: 400, message: 'You already submitted this form.' };
    }
  }

  let submission = await prisma.feedbackSurveySubmission.findFirst({
    where: { surveyId, userId, isComplete: false },
    orderBy: { updatedAt: 'desc' },
  });
  if (!submission) {
    submission = await prisma.feedbackSurveySubmission.create({
      data: { surveyId, userId, isComplete: false },
    });
  }

  const entries = Object.entries(answers).filter(
    ([, v]) => v !== undefined && v !== null && String(v).trim() !== '',
  );

  await prisma.$transaction(async (tx) => {
    for (const [questionId, value] of entries) {
      const q = survey.questions.find((x) => x.id === questionId);
      if (!q) continue;
      await tx.feedbackSurveyAnswer.upsert({
        where: { submissionId_questionId: { submissionId: submission!.id, questionId } },
        create: {
          submissionId: submission!.id,
          questionId,
          value: String(value).trim(),
        },
        update: { value: String(value).trim() },
      });
    }

    if (markComplete) {
      const requiredIds = survey.questions.filter((q) => q.isRequired && !hidden.has(q.id)).map((q) => q.id);
      const saved = await tx.feedbackSurveyAnswer.findMany({
        where: { submissionId: submission!.id, questionId: { in: requiredIds } },
      });
      const allOk =
        requiredIds.length === 0 ||
        requiredIds.every((id) => {
          const row = saved.find((r) => r.questionId === id);
          return row && row.value.trim() !== '';
        });
      if (allOk) {
        await tx.feedbackSurveySubmission.update({
          where: { id: submission!.id },
          data: { isComplete: true, submittedAt: new Date() },
        });
        await tx.feedbackSurveyAssignment.update({
          where: { id: assignment.id },
          data: { completedAt: new Date() },
        });
      } else {
        await tx.feedbackSurveyAssignment.update({
          where: { id: assignment.id },
          data: { completedAt: null },
        });
      }
    }
  });

  if (markComplete) {
    const freshSub = await prisma.feedbackSurveySubmission.findUnique({ where: { id: submission.id } });
    if (freshSub?.isComplete) {
      await runFeedbackSurveyErpActions(surveyId, submission.id);
      await maybeNotifyOwner(surveyId, userEmail);
    }
  }

  return { ok: true, submissionId: submission.id };
}

/** --- Create (DRAFT, no assignments) --- */
export const createFeedbackSurvey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!canManageOrgSurveys(role)) {
      res.status(403).json({ success: false, message: 'Only admin or HR can create feedback surveys.' });
      return;
    }

    const body = req.body as {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      department?: string | null;
      ownerId?: string | null;
      sections?: SectionInput[];
      questions?: QuestionInput[];
      settings?: {
        allowMultipleSubmissions?: boolean;
        requireLogin?: boolean;
        closingDate?: string | null;
        notifyOnSubmit?: boolean;
        confirmationMessage?: string | null;
        allowEditAfterSubmit?: boolean;
      };
    };

    if (!body.title?.trim()) {
      res.status(400).json({ success: false, message: 'Title is required.' });
      return;
    }

    let sectionsInput: SectionInput[] = Array.isArray(body.sections) ? body.sections : [];
    if (sectionsInput.length === 0 && Array.isArray(body.questions) && body.questions.length > 0) {
      sectionsInput = [
        {
          title: 'General',
          description: null,
          order: 0,
          questions: body.questions,
        },
      ];
    }

    const userId = req.user!.id;
    const due = body.dueDate ? new Date(body.dueDate) : null;
    if (due && Number.isNaN(due.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid dueDate.' });
      return;
    }

    const totalQs = sectionsInput.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
    if (totalQs === 0) {
      res.status(400).json({ success: false, message: 'Add at least one question (in a section).' });
      return;
    }

    const survey = await prisma.$transaction(async (tx) => {
      const s = await tx.feedbackSurvey.create({
        data: {
          title: body.title!.trim(),
          description: body.description?.trim() || null,
          dueDate: due,
          department: body.department?.trim() || null,
          ownerId: body.ownerId?.trim() || userId,
          status: 'DRAFT',
          createdBy: userId,
          settings: {
            create: {
              allowMultipleSubmissions: Boolean(body.settings?.allowMultipleSubmissions),
              requireLogin: body.settings?.requireLogin !== false,
              closingDate: body.settings?.closingDate ? new Date(body.settings.closingDate) : null,
              notifyOnSubmit: Boolean(body.settings?.notifyOnSubmit),
              confirmationMessage: body.settings?.confirmationMessage?.trim() || null,
              allowEditAfterSubmit: Boolean(body.settings?.allowEditAfterSubmit),
            },
          },
        },
      });

      for (let si = 0; si < sectionsInput.length; si++) {
        const sec = sectionsInput[si];
        const section = await tx.feedbackSurveySection.create({
          data: {
            surveyId: s.id,
            title: String(sec.title || `Section ${si + 1}`).trim(),
            description: sec.description ? String(sec.description).trim() : null,
            order: typeof sec.order === 'number' ? sec.order : si,
          },
        });
        const rows = mapQuestionsCreate(sec.questions || [], { surveyId: s.id, sectionId: section.id });
        if (rows.length) {
          await tx.feedbackSurveyQuestion.createMany({ data: rows as any });
        }
      }

      return tx.feedbackSurvey.findUnique({
        where: { id: s.id },
        include: {
          sections: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
          settings: true,
        },
      });
    });

    res.status(201).json({
      success: true,
      message: 'Form created as draft. Publish when ready.',
      data: survey,
    });
  } catch (error) {
    console.error('createFeedbackSurvey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/** Replace structure (DRAFT only, no completed submissions). */
export const updateFeedbackSurvey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { surveyId } = req.params;
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;

    const existing = await prisma.feedbackSurvey.findUnique({
      where: { id: surveyId },
      include: { settings: true },
    });
    if (!existing || existing.status !== 'DRAFT') {
      res.status(400).json({ success: false, message: 'Only draft forms can be edited with this endpoint.' });
      return;
    }

    const completed = await prisma.feedbackSurveySubmission.count({
      where: { surveyId, isComplete: true },
    });
    if (completed > 0) {
      res.status(400).json({ success: false, message: 'Cannot replace questions: completed submissions exist.' });
      return;
    }

    const body = req.body as {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      department?: string | null;
      ownerId?: string | null;
      sections?: SectionInput[];
      settings?: Record<string, unknown>;
      logicRules?: Array<{
        id?: string;
        sourceQuestionId: string;
        operator: string;
        value: string;
        action: string;
        targetQuestionId?: string | null;
        targetSectionId?: string | null;
        order?: number;
      }>;
    };

    const sectionsInput: SectionInput[] = Array.isArray(body.sections) ? body.sections : [];
    if (sectionsInput.length === 0) {
      res.status(400).json({ success: false, message: 'sections[] is required.' });
      return;
    }

    const totalQs = sectionsInput.reduce((n, s) => n + (s.questions?.length ?? 0), 0);
    if (totalQs === 0) {
      res.status(400).json({ success: false, message: 'At least one question is required.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.feedbackSurveyLogicRule.deleteMany({ where: { surveyId } });
      await tx.feedbackSurveyAnswer.deleteMany({
        where: { submission: { surveyId } },
      });
      await tx.feedbackSurveySubmission.deleteMany({ where: { surveyId } });
      await tx.feedbackSurveyQuestion.deleteMany({ where: { surveyId } });
      await tx.feedbackSurveySection.deleteMany({ where: { surveyId } });

      for (let si = 0; si < sectionsInput.length; si++) {
        const sec = sectionsInput[si];
        const section = await tx.feedbackSurveySection.create({
          data: {
            surveyId,
            title: String(sec.title || `Section ${si + 1}`).trim(),
            description: sec.description ? String(sec.description).trim() : null,
            order: typeof sec.order === 'number' ? sec.order : si,
          },
        });
        const rows = mapQuestionsCreate(sec.questions || [], { surveyId, sectionId: section.id });
        if (rows.length) {
          await tx.feedbackSurveyQuestion.createMany({ data: rows as any });
        }
      }

      const data: Record<string, unknown> = {};
      if (body.title !== undefined) data.title = String(body.title).trim();
      if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
      if (body.dueDate !== undefined) {
        data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      }
      if (body.department !== undefined) data.department = body.department ? String(body.department).trim() : null;
      if (body.ownerId !== undefined) data.ownerId = body.ownerId ? String(body.ownerId).trim() : null;

      await tx.feedbackSurvey.update({
        where: { id: surveyId },
        data: data as any,
      });

      if (body.settings && existing.settings) {
        await tx.feedbackSurveySettings.update({
          where: { surveyId },
          data: {
            allowMultipleSubmissions:
              body.settings.allowMultipleSubmissions !== undefined
                ? Boolean(body.settings.allowMultipleSubmissions)
                : undefined,
            requireLogin:
              body.settings.requireLogin !== undefined ? Boolean(body.settings.requireLogin) : undefined,
            closingDate:
              body.settings.closingDate !== undefined
                ? body.settings.closingDate
                  ? new Date(String(body.settings.closingDate))
                  : null
                : undefined,
            notifyOnSubmit:
              body.settings.notifyOnSubmit !== undefined ? Boolean(body.settings.notifyOnSubmit) : undefined,
            confirmationMessage:
              body.settings.confirmationMessage !== undefined
                ? body.settings.confirmationMessage
                  ? String(body.settings.confirmationMessage)
                  : null
                : undefined,
            allowEditAfterSubmit:
              body.settings.allowEditAfterSubmit !== undefined
                ? Boolean(body.settings.allowEditAfterSubmit)
                : undefined,
          },
        });
      }

      if (Array.isArray(body.logicRules) && body.logicRules.length) {
        const questions = await tx.feedbackSurveyQuestion.findMany({ where: { surveyId }, select: { id: true } });
        const qids = new Set(questions.map((q) => q.id));
        for (let i = 0; i < body.logicRules.length; i++) {
          const r = body.logicRules[i];
          if (!r.sourceQuestionId || !qids.has(r.sourceQuestionId)) continue;
          await tx.feedbackSurveyLogicRule.create({
            data: {
              surveyId,
              sourceQuestionId: r.sourceQuestionId,
              operator: String(r.operator),
              value: String(r.value),
              action: String(r.action),
              targetQuestionId: r.targetQuestionId && qids.has(r.targetQuestionId) ? r.targetQuestionId : null,
              targetSectionId: r.targetSectionId || null,
              order: typeof r.order === 'number' ? r.order : i,
            },
          });
        }
      }
    });

    const fresh = await prisma.feedbackSurvey.findUnique({
      where: { id: surveyId },
      include: {
        sections: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
        settings: true,
        logicRules: { orderBy: { order: 'asc' } },
      },
    });

    res.json({ success: true, data: fresh });
  } catch (error) {
    console.error('updateFeedbackSurvey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const publishFeedbackSurvey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { surveyId } = req.params;
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const survey = await prisma.feedbackSurvey.findUnique({
      where: { id: surveyId },
      include: { _count: { select: { questions: true } } },
    });
    if (!survey) {
      res.status(404).json({ success: false, message: 'Survey not found.' });
      return;
    }
    if (survey._count.questions === 0) {
      res.status(400).json({ success: false, message: 'Add questions before publishing.' });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.feedbackSurvey.update({
        where: { id: surveyId },
        data: { status: 'PUBLISHED' },
      });
      const recipients = await tx.user.findMany({
        where: { isActive: true, role: { in: FEEDBACK_RECIPIENT_ROLES } },
        select: { id: true },
      });
      if (recipients.length > 0) {
        await tx.feedbackSurveyAssignment.createMany({
          data: recipients.map((u) => ({ surveyId, userId: u.id })),
          skipDuplicates: true,
        });
      }
    });

    res.json({ success: true, message: 'Published and assigned to staff roles.' });
  } catch (error) {
    console.error('publishFeedbackSurvey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const duplicateFeedbackSurvey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const { surveyId } = req.params;
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const src = await prisma.feedbackSurvey.findUnique({
      where: { id: surveyId },
      include: {
        sections: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
        settings: true,
        logicRules: { orderBy: { order: 'asc' } },
      },
    });
    if (!src) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }

    const copy = await prisma.$transaction(async (tx) => {
      const s = await tx.feedbackSurvey.create({
        data: {
          title: `${src.title} (copy)`,
          description: src.description,
          dueDate: src.dueDate,
          department: src.department,
          ownerId: userId,
          status: 'DRAFT',
          createdBy: userId,
          settings: {
            create: {
              allowMultipleSubmissions: src.settings?.allowMultipleSubmissions ?? false,
              requireLogin: src.settings?.requireLogin ?? true,
              closingDate: src.settings?.closingDate ?? null,
              notifyOnSubmit: src.settings?.notifyOnSubmit ?? false,
              confirmationMessage: src.settings?.confirmationMessage ?? null,
              allowEditAfterSubmit: src.settings?.allowEditAfterSubmit ?? false,
            },
          },
        },
      });

      const idMap = new Map<string, string>();
      const secMap = new Map<string, string>();

      for (const sec of src.sections) {
        const ns = await tx.feedbackSurveySection.create({
          data: {
            surveyId: s.id,
            title: sec.title,
            description: sec.description,
            order: sec.order,
          },
        });
        secMap.set(sec.id, ns.id);
        for (const q of sec.questions) {
          const nq = await tx.feedbackSurveyQuestion.create({
            data: {
              surveyId: s.id,
              sectionId: ns.id,
              questionText: q.questionText,
              description: q.description,
              order: q.order,
              questionType: q.questionType,
              options: q.options,
              placeholder: q.placeholder,
              config: q.config === null ? undefined : q.config,
              validation: q.validation === null ? undefined : q.validation,
              isRequired: q.isRequired,
            },
          });
          idMap.set(q.id, nq.id);
        }
      }

      const orphanQs = await tx.feedbackSurveyQuestion.findMany({
        where: { surveyId: src.id, sectionId: null },
      });
      for (const q of orphanQs) {
        const nq = await tx.feedbackSurveyQuestion.create({
          data: {
            surveyId: s.id,
            sectionId: null,
            questionText: q.questionText,
            description: q.description,
            order: q.order,
            questionType: q.questionType,
            options: q.options,
            placeholder: q.placeholder,
            config: q.config === null ? undefined : q.config,
            validation: q.validation === null ? undefined : q.validation,
            isRequired: q.isRequired,
          },
        });
        idMap.set(q.id, nq.id);
      }

      for (const r of src.logicRules) {
        const nSq = r.targetSectionId ? secMap.get(r.targetSectionId) : null;
        const nTq = r.targetQuestionId ? idMap.get(r.targetQuestionId) : null;
        const nSrc = idMap.get(r.sourceQuestionId);
        if (!nSrc) continue;
        await tx.feedbackSurveyLogicRule.create({
          data: {
            surveyId: s.id,
            sourceQuestionId: nSrc,
            operator: r.operator,
            value: r.value,
            action: r.action,
            targetQuestionId: nTq || null,
            targetSectionId: nSq || null,
            order: r.order,
          },
        });
      }

      return s;
    });

    res.status(201).json({ success: true, data: copy });
  } catch (error) {
    console.error('duplicateFeedbackSurvey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getFeedbackSurveyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!canManageOrgSurveys(req.user?.role)) {
      res.status(403).json({ success: false, message: 'Only admin or HR can view survey statistics.' });
      return;
    }

    const [totalSurveys, publishedSurveys, closedSurveys, completedSubmissions, surveysForAvg] = await Promise.all([
      prisma.feedbackSurvey.count(),
      prisma.feedbackSurvey.count({ where: { status: { in: ['PUBLISHED', 'ACTIVE'] } } }),
      prisma.feedbackSurvey.count({ where: { status: 'CLOSED' } }),
      prisma.feedbackSurveyAssignment.count({ where: { completedAt: { not: null } } }),
      prisma.feedbackSurvey.findMany({
        select: {
          id: true,
          _count: { select: { assignments: true } },
        },
      }),
    ]);

    const completedBySurvey = await prisma.feedbackSurveyAssignment.groupBy({
      by: ['surveyId'],
      where: { completedAt: { not: null } },
      _count: true,
    });
    const completedMap = new Map(completedBySurvey.map((r) => [r.surveyId, r._count]));

    let sumRates = 0;
    let surveysWithRecipients = 0;
    for (const s of surveysForAvg) {
      const n = s._count.assignments;
      if (n <= 0) continue;
      surveysWithRecipients += 1;
      const done = completedMap.get(s.id) ?? 0;
      sumRates += (done / n) * 100;
    }
    const avgCompletionPercent =
      surveysWithRecipients > 0 ? Math.round((sumRates / surveysWithRecipients) * 10) / 10 : 0;

    res.json({
      success: true,
      data: {
        totalSurveys,
        activeSurveys: publishedSurveys,
        closedSurveys,
        totalCompletedSubmissions: completedSubmissions,
        avgCompletionPercent,
      },
    });
  } catch (error) {
    console.error('getFeedbackSurveyStats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listFeedbackSurveys = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const where = canManageOrgSurveys(role)
      ? {}
      : {
          assignments: { some: { userId } },
        };

    const surveys = await prisma.feedbackSurvey.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          select: { id: true, questionText: true, order: true, questionType: true },
        },
        ...(canManageOrgSurveys(role)
          ? {}
          : {
              assignments: {
                where: { userId },
                select: { id: true, completedAt: true },
                take: 1,
              },
            }),
        _count: {
          select: {
            assignments: true,
            questions: true,
            responses: true,
            submissions: true,
          },
        },
      },
    });

    const surveyIds = surveys.map((s) => s.id);
    const completedBySurvey =
      surveyIds.length === 0 || !canManageOrgSurveys(role)
        ? new Map<string, number>()
        : (
            await prisma.feedbackSurveyAssignment.groupBy({
              by: ['surveyId'],
              where: { surveyId: { in: surveyIds }, completedAt: { not: null } },
              _count: true,
            })
          ).reduce((m, row) => {
            m.set(row.surveyId, row._count);
            return m;
          }, new Map<string, number>());

    const data = surveys.map((s) => {
      const totalRecipients = s._count.assignments;
      const completedAssignments = canManageOrgSurveys(role)
        ? completedBySurvey.get(s.id) ?? 0
        : (s as { assignments?: { completedAt: Date | null }[] }).assignments?.[0]?.completedAt != null
          ? 1
          : 0;

      const completionRatePercent =
        totalRecipients > 0
          ? Math.round(((completedAssignments / totalRecipients) * 100) * 10) / 10
          : 0;

      return {
        id: s.id,
        title: s.title,
        description: s.description,
        dueDate: s.dueDate,
        department: s.department,
        ownerId: s.ownerId,
        status: normalizeSurveyStatus(s.status),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        questionCount: s._count.questions,
        totalRecipients,
        responseRows: s._count.responses,
        submissionCount: s._count.submissions,
        completedCount: completedAssignments,
        completionRatePercent,
        questions: s.questions,
        myAssignment: !canManageOrgSurveys(role)
          ? (s as { assignments?: { id: string; completedAt: Date | null }[] }).assignments?.[0] ?? null
          : undefined,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('listFeedbackSurveys error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getFeedbackSurvey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const survey = await prisma.feedbackSurvey.findUnique({
      where: { id: surveyId },
      include: {
        sections: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
        questions: { orderBy: { order: 'asc' } },
        creator: { select: { id: true, firstName: true, lastName: true, email: true } },
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
        settings: true,
        logicRules: { orderBy: { order: 'asc' } },
      },
    });

    if (!survey) {
      res.status(404).json({ success: false, message: 'Survey not found.' });
      return;
    }

    let myAssignment: { id: string; completedAt: Date | null } | null = null;
    if (!canManageOrgSurveys(role)) {
      myAssignment = await prisma.feedbackSurveyAssignment.findFirst({
        where: { surveyId, userId },
        select: { id: true, completedAt: true },
      });
      if (!myAssignment) {
        res.status(403).json({ success: false, message: 'You are not assigned to this survey.' });
        return;
      }
    }

    const [legacyResponses, draftSubmission, latestComplete, totalAssigned, completedAssigned] =
      await Promise.all([
        prisma.feedbackSurveyResponse.findMany({ where: { surveyId, userId } }),
        prisma.feedbackSurveySubmission.findFirst({
          where: { surveyId, userId, isComplete: false },
          orderBy: { updatedAt: 'desc' },
          include: { answers: true },
        }),
        prisma.feedbackSurveySubmission.findFirst({
          where: { surveyId, userId, isComplete: true },
          orderBy: { submittedAt: 'desc' },
          include: { answers: true },
        }),
        canManageOrgSurveys(role)
          ? prisma.feedbackSurveyAssignment.count({ where: { surveyId } })
          : Promise.resolve(0),
        canManageOrgSurveys(role)
          ? prisma.feedbackSurveyAssignment.count({ where: { surveyId, completedAt: { not: null } } })
          : Promise.resolve(0),
      ]);

    const answers: Record<string, string> = {};
    legacyResponses.forEach((r) => {
      answers[r.questionId] = r.answer;
    });
    if (latestComplete) {
      latestComplete.answers.forEach((a) => {
        answers[a.questionId] = a.value;
      });
    }
    if (draftSubmission) {
      draftSubmission.answers.forEach((a) => {
        answers[a.questionId] = a.value;
      });
    }

    const questions = survey.questions.map((q) => questionPayload(q));

    const sectionsOut =
      survey.sections.length > 0
        ? survey.sections.map((sec) => ({
            id: sec.id,
            title: sec.title,
            description: sec.description,
            order: sec.order,
            questions: sec.questions.map((q) => questionPayload(q)),
          }))
        : [
            {
              id: null,
              title: 'General',
              description: null,
              order: 0,
              questions,
            },
          ];

    res.json({
      success: true,
      data: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        dueDate: survey.dueDate,
        department: survey.department,
        ownerId: survey.ownerId,
        status: normalizeSurveyStatus(survey.status),
        createdAt: survey.createdAt,
        creator: survey.creator,
        owner: survey.owner,
        settings: survey.settings,
        logicRules: survey.logicRules,
        sections: sectionsOut,
        questions,
        answers,
        draftSubmissionId: draftSubmission?.id ?? null,
        assignmentStats:
          canManageOrgSurveys(role) && role
            ? { totalAssigned, completedAssigned }
            : undefined,
        myAssignment: !canManageOrgSurveys(role) ? myAssignment : undefined,
      },
    });
  } catch (error) {
    console.error('getFeedbackSurvey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const submitFeedbackSurveyResponses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { surveyId } = req.params;
    const { answers } = req.body as { answers?: Record<string, string> };

    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ success: false, message: 'answers object is required.' });
      return;
    }

    const result = await saveSubmissionInternal({
      surveyId,
      userId,
      answers,
      markComplete: true,
      userEmail: req.user?.email,
    });
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, message: 'Responses saved.', submissionId: result.submissionId });
  } catch (error) {
    console.error('submitFeedbackSurveyResponses error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const postSurveySubmission = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { surveyId } = req.params;
    const { answers, markComplete } = req.body as { answers?: Record<string, string>; markComplete?: boolean };
    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ success: false, message: 'answers object is required.' });
      return;
    }
    const result = await saveSubmissionInternal({
      surveyId,
      userId,
      answers,
      markComplete: Boolean(markComplete),
      userEmail: req.user?.email,
    });
    if (!result.ok) {
      res.status(result.status).json({ success: false, message: result.message });
      return;
    }
    res.json({ success: true, submissionId: result.submissionId });
  } catch (error) {
    console.error('postSurveySubmission error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listSurveySubmissions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!canViewResponses(acc)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));

    const where: { surveyId: string; isComplete: boolean } = { surveyId, isComplete: true };
    const [rows, total] = await Promise.all([
      prisma.feedbackSurveySubmission.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
          answers: { include: { question: { select: { id: true, questionText: true } } } },
        },
      }),
      prisma.feedbackSurveySubmission.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        items: rows.map((r) => ({
          id: r.id,
          submittedAt: r.submittedAt,
          user: r.user,
          answerPreview: r.answers.slice(0, 5).map((a) => ({ question: a.question.questionText, value: a.value })),
        })),
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error('listSurveySubmissions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getSurveySubmissionDetail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId, submissionId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!canViewResponses(acc)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const sub = await prisma.feedbackSurveySubmission.findFirst({
      where: { id: submissionId, surveyId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        answers: { include: { question: true } },
      },
    });
    if (!sub) {
      res.status(404).json({ success: false, message: 'Not found' });
      return;
    }
    res.json({ success: true, data: sub });
  } catch (error) {
    console.error('getSurveySubmissionDetail error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getSurveyAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!canViewResponses(acc)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const subs = await prisma.feedbackSurveySubmission.count({ where: { surveyId, isComplete: true } });
    const assigned = await prisma.feedbackSurveyAssignment.count({ where: { surveyId } });
    const questions = await prisma.feedbackSurveyQuestion.findMany({
      where: { surveyId },
      orderBy: { order: 'asc' },
    });
    const answers = await prisma.feedbackSurveyAnswer.findMany({
      where: { submission: { surveyId, isComplete: true } },
    });

    const byQ = new Map<string, string[]>();
    for (const a of answers) {
      const list = byQ.get(a.questionId) || [];
      list.push(a.value);
      byQ.set(a.questionId, list);
    }

    const perQuestion = questions.map((q) => {
      const vals = byQ.get(q.id) || [];
      const qt = normalizeQuestionType(q.questionType);
      if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'DROPDOWN'].includes(qt)) {
        const counts: Record<string, number> = {};
        for (const v of vals) {
          if (qt === 'MULTIPLE_CHOICE') {
            v.split('||')
              .map((s) => s.trim())
              .forEach((p) => {
                counts[p] = (counts[p] || 0) + 1;
              });
          } else counts[v] = (counts[v] || 0) + 1;
        }
        return { questionId: q.id, questionText: q.questionText, type: qt, distribution: counts };
      }
      if (qt === 'RATING' || qt === 'LINEAR_SCALE' || qt === 'NUMBER') {
        const nums = vals.map(Number).filter((n) => Number.isFinite(n));
        const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
        return {
          questionId: q.id,
          questionText: q.questionText,
          type: qt,
          average: Math.round(avg * 100) / 100,
          min: nums.length ? Math.min(...nums) : null,
          max: nums.length ? Math.max(...nums) : null,
          count: nums.length,
        };
      }
      return { questionId: q.id, questionText: q.questionText, type: qt, responseCount: vals.length };
    });

    res.json({
      success: true,
      data: {
        totalSubmissions: subs,
        assignedUsers: assigned,
        completionRatePercent: assigned > 0 ? Math.round((subs / assigned) * 1000) / 10 : 0,
        perQuestion,
      },
    });
  } catch (error) {
    console.error('getSurveyAnalytics error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const exportSurveyCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!canViewResponses(acc)) {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }

    const survey = await prisma.feedbackSurvey.findUnique({
      where: { id: surveyId },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!survey) {
      res.status(404).end();
      return;
    }
    const subs = await prisma.feedbackSurveySubmission.findMany({
      where: { surveyId, isComplete: true },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        answers: true,
      },
    });

    const headers = ['submissionId', 'submittedAt', 'user', ...survey.questions.map((q) => q.questionText)];
    const lines = [headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(',')];
    for (const s of subs) {
      const map = new Map(s.answers.map((a) => [a.questionId, a.value]));
      const row = [
        s.id,
        s.submittedAt?.toISOString() || '',
        `${s.user?.firstName || ''} ${s.user?.lastName || ''} (${s.user?.email || ''})`.trim(),
        ...survey.questions.map((q) => map.get(q.id) || ''),
      ];
      lines.push(row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    }
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="form-${surveyId}.csv"`);
    res.send(lines.join('\n'));
  } catch (error) {
    console.error('exportSurveyCsv error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteFeedbackSurvey = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!role || !['ADMIN', 'HR'].includes(role)) {
      res.status(403).json({ success: false, message: 'Only admin or HR can delete surveys.' });
      return;
    }

    const { surveyId } = req.params;
    await prisma.feedbackSurvey.delete({
      where: { id: surveyId },
    });

    res.json({ success: true, message: 'Survey deleted.' });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Survey not found.' });
      return;
    }
    console.error('deleteFeedbackSurvey error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const updateFeedbackSurveyStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role;
    if (!role || !['ADMIN', 'HR'].includes(role)) {
      res.status(403).json({ success: false, message: 'Only admin or HR can update survey status.' });
      return;
    }

    const { surveyId } = req.params;
    const { status } = req.body as { status?: string };
    const allowed = ['DRAFT', 'PUBLISHED', 'CLOSED', 'ACTIVE'];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ success: false, message: 'status must be DRAFT, PUBLISHED, CLOSED (or legacy ACTIVE).' });
      return;
    }
    const normalized = status === 'ACTIVE' ? 'PUBLISHED' : status;

    const updated = await prisma.feedbackSurvey.update({
      where: { id: surveyId },
      data: { status: normalized },
    });

    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      res.status(404).json({ success: false, message: 'Survey not found.' });
      return;
    }
    console.error('updateFeedbackSurveyStatus error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listSurveyShareLinks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const links = await prisma.feedbackSurveyShareLink.findMany({
      where: { surveyId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: links });
  } catch (error) {
    console.error('listSurveyShareLinks error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const createSurveyShareLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const token = crypto.randomBytes(24).toString('hex');
    const link = await prisma.feedbackSurveyShareLink.create({
      data: {
        surveyId,
        token,
        requireLogin: (req.body as { requireLogin?: boolean })?.requireLogin !== false,
        isActive: true,
        createdById: userId,
      },
    });
    res.status(201).json({ success: true, data: link });
  } catch (error) {
    console.error('createSurveyShareLink error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const revokeSurveyShareLink = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId, linkId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    await prisma.feedbackSurveyShareLink.updateMany({
      where: { id: linkId, surveyId },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('revokeSurveyShareLink error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const addSurveyCollaborator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    const { targetUserId, collabRole } = req.body as { targetUserId?: string; collabRole?: string };
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    if (!targetUserId || !['EDITOR', 'REVIEWER'].includes(String(collabRole))) {
      res.status(400).json({ success: false, message: 'targetUserId and collabRole EDITOR|REVIEWER required' });
      return;
    }
    const row = await prisma.feedbackSurveyCollaborator.upsert({
      where: { surveyId_userId: { surveyId, userId: targetUserId } },
      create: { surveyId, userId: targetUserId, role: String(collabRole) },
      update: { role: String(collabRole) },
    });
    res.status(201).json({ success: true, data: row });
  } catch (error) {
    console.error('addSurveyCollaborator error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listSurveyCollaborators = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const rows = await prisma.feedbackSurveyCollaborator.findMany({
      where: { surveyId },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('listSurveyCollaborators error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const removeSurveyCollaborator = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId, userId: otherId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    await prisma.feedbackSurveyCollaborator.deleteMany({ where: { surveyId, userId: otherId } });
    res.json({ success: true });
  } catch (error) {
    console.error('removeSurveyCollaborator error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const upsertSurveyActions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const { actions } = req.body as {
      actions?: Array<{ id?: string; actionType: string; fieldMap: Record<string, string>; isActive?: boolean }>;
    };
    if (!Array.isArray(actions)) {
      res.status(400).json({ success: false, message: 'actions[] required' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.feedbackSurveyAction.deleteMany({ where: { surveyId } });
      for (const a of actions) {
        await tx.feedbackSurveyAction.create({
          data: {
            surveyId,
            actionType: a.actionType,
            fieldMap: a.fieldMap as object,
            isActive: a.isActive !== false,
          },
        });
      }
    });
    const rows = await prisma.feedbackSurveyAction.findMany({ where: { surveyId } });
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('upsertSurveyActions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listSurveyActions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    const { surveyId } = req.params;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    const acc = await resolveAccess(surveyId, userId, role);
    if (!assertAccess('EDIT', acc, res)) return;
    const rows = await prisma.feedbackSurveyAction.findMany({ where: { surveyId } });
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('listSurveyActions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getPublicFormByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const link = await prisma.feedbackSurveyShareLink.findFirst({
      where: { token, isActive: true },
      include: {
        survey: {
          include: {
            sections: { orderBy: { order: 'asc' }, include: { questions: { orderBy: { order: 'asc' } } } },
            questions: { orderBy: { order: 'asc' } },
            settings: true,
            logicRules: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!link || !link.survey) {
      res.status(404).json({ success: false, message: 'Invalid or expired link.' });
      return;
    }
    if (link.expiresAt && new Date(link.expiresAt) < new Date()) {
      res.status(410).json({ success: false, message: 'Link expired.' });
      return;
    }
    const st = normalizeSurveyStatus(link.survey.status);
    if (st !== 'PUBLISHED' && st !== 'ACTIVE') {
      res.status(400).json({ success: false, message: 'Form is not published.' });
      return;
    }
    const questions = link.survey.questions.map((q) => questionPayload(q));
    res.json({
      success: true,
      data: {
        surveyId: link.survey.id,
        title: link.survey.title,
        description: link.survey.description,
        settings: {
          requireLogin: link.requireLogin && (link.survey.settings?.requireLogin ?? true),
          confirmationMessage: link.survey.settings?.confirmationMessage,
        },
        logicRules: link.survey.logicRules,
        sections:
          link.survey.sections.length > 0
            ? link.survey.sections.map((sec) => ({
                id: sec.id,
                title: sec.title,
                description: sec.description,
                order: sec.order,
                questions: sec.questions.map((q) => questionPayload(q)),
              }))
            : [{ id: null, title: 'General', description: null, order: 0, questions }],
        questions,
      },
    });
  } catch (error) {
    console.error('getPublicFormByToken error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const submitPublicFormByToken = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { answers } = req.body as { answers?: Record<string, string> };
    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ success: false, message: 'answers required' });
      return;
    }

    const link = await prisma.feedbackSurveyShareLink.findFirst({
      where: { token, isActive: true },
      include: {
        survey: {
          include: {
            questions: { orderBy: { order: 'asc' } },
            settings: true,
            logicRules: { orderBy: { order: 'asc' } },
          },
        },
      },
    });
    if (!link?.survey) {
      res.status(404).json({ success: false, message: 'Invalid link' });
      return;
    }
    const needLogin = link.requireLogin && (link.survey.settings?.requireLogin ?? true);
    if (needLogin && !req.user?.id) {
      res.status(401).json({ success: false, message: 'Login required' });
      return;
    }

    const survey = link.survey;
    const st = normalizeSurveyStatus(survey.status);
    if (!(st === 'PUBLISHED' || st === 'ACTIVE')) {
      res.status(400).json({ success: false, message: 'Not accepting responses' });
      return;
    }
    if (isPastClosing(survey.settings, survey.dueDate)) {
      res.status(400).json({ success: false, message: 'Closed' });
      return;
    }

    const hidden = hiddenQuestionIdsFromRules(survey.logicRules, answers);
    for (const q of survey.questions) {
      const val = answers[q.id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const err = validateAnswerForQuestion(q, String(val));
        if (err) {
          res.status(400).json({ success: false, message: err });
          return;
        }
      }
    }
    for (const q of survey.questions) {
      if (!q.isRequired || hidden.has(q.id)) continue;
      const a = answers[q.id];
      if (a === undefined || a === null || String(a).trim() === '') {
        res.status(400).json({ success: false, message: `Required: ${q.questionText}` });
        return;
      }
    }

    const userId = req.user?.id || null;
    const submission = await prisma.feedbackSurveySubmission.create({
      data: {
        surveyId: survey.id,
        userId,
        shareLinkId: link.id,
        isComplete: true,
        submittedAt: new Date(),
      },
    });

    await prisma.$transaction(async (tx) => {
      for (const [questionId, value] of Object.entries(answers)) {
        if (value === undefined || value === null || String(value).trim() === '') continue;
        const q = survey.questions.find((x) => x.id === questionId);
        if (!q) continue;
        await tx.feedbackSurveyAnswer.create({
          data: { submissionId: submission.id, questionId, value: String(value).trim() },
        });
      }
    });

    await runFeedbackSurveyErpActions(survey.id, submission.id);
    await maybeNotifyOwner(survey.id, req.user?.email);

    res.json({ success: true, submissionId: submission.id });
  } catch (error) {
    console.error('submitPublicFormByToken error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
