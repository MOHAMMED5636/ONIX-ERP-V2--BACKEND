import prisma from '../config/database';
import { allocateNextProjectNumber } from '../utils/project-number';

async function nextClientReference(): Promise<string> {
  const year = new Date().getFullYear();
  const next = await prisma.clientReferenceSequence.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `O-CL-${year}/${String(next.lastNumber).padStart(4, '0')}`;
}

/** Run ERP actions after a submission is marked complete. Best-effort; logs errors. */
export async function runFeedbackSurveyErpActions(surveyId: string, submissionId: string): Promise<void> {
  const actions = await prisma.feedbackSurveyAction.findMany({
    where: { surveyId, isActive: true },
  });
  if (!actions.length) return;

  const rows = await prisma.feedbackSurveyAnswer.findMany({
    where: { submissionId },
  });
  const byQuestion = new Map(rows.map((r) => [r.questionId, r.value]));

  for (const act of actions) {
    const fieldMap = act.fieldMap as Record<string, string>;
    const pick = (erpField: string) => {
      const qid = fieldMap[erpField];
      if (!qid) return '';
      const v = String(byQuestion.get(qid) ?? '').trim();
      return v;
    };

    try {
      if (act.actionType === 'CREATE_CLIENT') {
        const name = pick('name');
        if (!name) continue;
        const ref = await nextClientReference();
        await prisma.client.create({
          data: {
            referenceNumber: ref,
            name,
            isCorporate: pick('isCorporate') || 'Company',
            email: pick('email') || null,
            phone: pick('phone') || null,
            address: pick('address') || null,
            nationality: pick('nationality') || null,
            leadSource: pick('leadSource') || null,
            rank: pick('rank') || null,
          },
        });
      } else if (act.actionType === 'CREATE_PROJECT') {
        const name = pick('name');
        if (!name) continue;
        const projectNumber = await allocateNextProjectNumber(prisma);
        const ref = `O-FM-${submissionId.slice(0, 8).toUpperCase()}-${projectNumber}`;
        const cid = pick('clientId');
        await prisma.project.create({
          data: {
            name,
            referenceNumber: ref,
            projectNumber,
            description: pick('description') || null,
            clientId: cid && /^[0-9a-f-]{36}$/i.test(cid) ? cid : null,
            projectManager: pick('projectManager') || null,
            location: pick('location') || null,
            projectType: pick('projectType') || null,
          },
        });
      } else if (act.actionType === 'CREATE_EMPLOYEE') {
        // Directory-style employee creation is multi-step; store intent as activity log only for now.
        console.warn(
          '[FeedbackSurvey ERP] CREATE_EMPLOYEE action is registered but not auto-provisioned. Submission:',
          submissionId,
        );
      }
    } catch (e) {
      console.error('[FeedbackSurvey ERP] action failed', act.actionType, e);
    }
  }
}
