import type { FeedbackSurveyLogicRule, FeedbackSurveyQuestion, FeedbackSurveySettings } from '@prisma/client';

export const FEEDBACK_SURVEY_RECIPIENT_ROLES = ['EMPLOYEE', 'MANAGER', 'PROJECT_MANAGER'] as const;

export const SURVEY_ADMIN_ROLES = ['ADMIN', 'HR'] as const;

export const ALLOWED_QUESTION_TYPES = [
  'SHORT_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'EMAIL',
  'PHONE',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'DROPDOWN',
  'DATE',
  'TIME',
  'FILE',
  'RATING',
  'LINEAR_SCALE',
  'MATRIX',
  'TEXT',
] as const;

export type AllowedQuestionType = (typeof ALLOWED_QUESTION_TYPES)[number];

export function parseQuestionOptions(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr) ? arr.map((x) => String(x)) : null;
  } catch {
    return null;
  }
}

export function normalizeSurveyStatus(status: string | null | undefined): string {
  if (!status) return 'DRAFT';
  if (status === 'ACTIVE') return 'PUBLISHED';
  return status;
}

export function isPastClosing(settings: FeedbackSurveySettings | null, dueDate: Date | null): boolean {
  if (settings?.closingDate) {
    const end = new Date(settings.closingDate);
    end.setHours(23, 59, 59, 999);
    if (Date.now() > end.getTime()) return true;
  }
  if (dueDate) {
    const end = new Date(dueDate);
    end.setHours(23, 59, 59, 999);
    if (Date.now() > end.getTime()) return true;
  }
  return false;
}

export function isSurveyPastDue(dueDate: Date | null): boolean {
  if (!dueDate) return false;
  const end = new Date(dueDate);
  end.setHours(23, 59, 59, 999);
  return Date.now() > end.getTime();
}

function evalCondition(source: string | undefined, operator: string, rawValue: string): boolean {
  const src = source === undefined || source === null ? '' : String(source).trim();
  const val = String(rawValue ?? '').trim();
  switch (operator) {
    case 'EQUALS':
      return src === val;
    case 'NOT_EQUALS':
      return src !== val;
    case 'CONTAINS':
      return src.toLowerCase().includes(val.toLowerCase());
    case 'GT': {
      const a = Number(src);
      const b = Number(val);
      return Number.isFinite(a) && Number.isFinite(b) && a > b;
    }
    case 'LT': {
      const a = Number(src);
      const b = Number(val);
      return Number.isFinite(a) && Number.isFinite(b) && a < b;
    }
    case 'IN': {
      try {
        const arr = JSON.parse(val) as unknown;
        if (!Array.isArray(arr)) return false;
        return arr.map(String).includes(src);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

/** Questions hidden by logic rules (processed in rule order). */
export function hiddenQuestionIdsFromRules(
  rules: Pick<FeedbackSurveyLogicRule, 'sourceQuestionId' | 'operator' | 'value' | 'action' | 'targetQuestionId' | 'order'>[],
  answers: Record<string, string>,
): Set<string> {
  const hidden = new Set<string>();
  const sorted = [...rules].sort((a, b) => a.order - b.order);
  for (const r of sorted) {
    const srcVal = answers[r.sourceQuestionId];
    if (!evalCondition(srcVal, r.operator, r.value)) continue;
    if (r.action === 'HIDE_QUESTION' && r.targetQuestionId) hidden.add(r.targetQuestionId);
    if (r.action === 'SHOW_QUESTION' && r.targetQuestionId) hidden.delete(r.targetQuestionId);
  }
  return hidden;
}

export function normalizeQuestionType(t: string | undefined): string {
  if (!t) return 'SHORT_TEXT';
  if (t === 'TEXT') return 'SHORT_TEXT';
  const upper = String(t).toUpperCase();
  const allowed = new Set(ALLOWED_QUESTION_TYPES);
  if (allowed.has(upper as AllowedQuestionType)) return upper;
  return 'SHORT_TEXT';
}

export function validateAnswerForQuestion(
  q: Pick<FeedbackSurveyQuestion, 'questionType' | 'options' | 'config' | 'validation'>,
  raw: string,
): string | null {
  const val = String(raw ?? '').trim();
  const type = normalizeQuestionType(q.questionType);
  const v = q.validation as { min?: number; max?: number; regex?: string; format?: string } | null;

  if (type === 'NUMBER') {
    const n = Number(val);
    if (!Number.isFinite(n)) return 'Must be a valid number';
    if (v?.min !== undefined && n < v.min) return `Must be >= ${v.min}`;
    if (v?.max !== undefined && n > v.max) return `Must be <= ${v.max}`;
  }
  if (type === 'EMAIL' || v?.format === 'EMAIL') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Invalid email';
  }
  if (type === 'PHONE' || v?.format === 'PHONE') {
    if (val.replace(/\D/g, '').length < 6) return 'Invalid phone';
  }
  if (type === 'RATING') {
    const cfg = (q.config as { max?: number } | null) || {};
    const max = cfg.max && Number.isFinite(cfg.max) ? cfg.max : 5;
    const n = Number(val);
    if (!Number.isFinite(n) || n < 1 || n > max) return `Rating must be between 1 and ${max}`;
  }
  if (type === 'LINEAR_SCALE') {
    const cfg = (q.config as { min?: number; max?: number } | null) || {};
    const min = cfg.min ?? 1;
    const max = cfg.max ?? 10;
    const n = Number(val);
    if (!Number.isFinite(n) || n < min || n > max) return `Value must be between ${min} and ${max}`;
  }
  if (type === 'SINGLE_CHOICE' || type === 'DROPDOWN' || type === 'MULTIPLE_CHOICE') {
    const opts = parseQuestionOptions(q.options);
    if (type === 'MULTIPLE_CHOICE') {
      const parts = val ? val.split('||').map((s) => s.trim()).filter(Boolean) : [];
      if (opts && opts.length && parts.some((p) => !opts.includes(p))) return 'Invalid choice selection';
    } else if (opts && opts.length && val && !opts.includes(val)) {
      return 'Invalid option';
    }
  }
  if (v?.regex) {
    try {
      const re = new RegExp(v.regex);
      if (!re.test(val)) return 'Format invalid';
    } catch {
      /* ignore bad regex */
    }
  }
  if (type === 'MATRIX' && val) {
    try {
      JSON.parse(val);
    } catch {
      return 'Invalid matrix response';
    }
  }
  return null;
}

export function questionPayload(
  q: FeedbackSurveyQuestion & { options?: string | null },
): Record<string, unknown> {
  let parsed: string[] | null = null;
  if (q.options) {
    try {
      parsed = JSON.parse(q.options as string) as string[];
    } catch {
      parsed = null;
    }
  }
  return {
    id: q.id,
    surveyId: q.surveyId,
    sectionId: q.sectionId,
    questionText: q.questionText,
    description: q.description,
    order: q.order,
    questionType: normalizeQuestionType(q.questionType),
    options: parsed,
    placeholder: q.placeholder,
    config: q.config,
    validation: q.validation,
    isRequired: q.isRequired,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}
