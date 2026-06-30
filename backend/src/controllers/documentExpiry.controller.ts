import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getAllExpiryRecords,
  getExpirySummary,
  resolveAccessScope,
  resolveAccessScopeForUser,
  ExpiryFilters,
} from '../services/documentExpiry.service';
import { buildExpiryReportExcelBuffer } from '../services/documentExpiryExport.service';

function parseFilters(query: AuthRequest['query']): ExpiryFilters {
  const q = query as Record<string, string | undefined>;
  return {
    companyId: q.companyId?.trim() || undefined,
    branchName: q.branchName?.trim() || undefined,
    employeeId: q.employeeId?.trim() || undefined,
    documentType: q.documentType?.trim() || undefined,
    search: q.search?.trim() || undefined,
    expiringThisWeek: q.expiringThisWeek === 'true' || q.expiringThisWeek === '1',
    expiringThisMonth: q.expiringThisMonth === 'true' || q.expiringThisMonth === '1',
    alreadyExpired: q.alreadyExpired === 'true' || q.alreadyExpired === '1',
    maxDays: q.maxDays ? Number(q.maxDays) : undefined,
  };
}

function forbidden(res: Response): void {
  res.status(403).json({ success: false, message: 'Access denied' });
}

function userCompany(req: AuthRequest): string | null | undefined {
  return (req.user as { company?: string | null } | undefined)?.company;
}

/**
 * GET /api/document-expiry/dashboard
 */
export const getExpiryDashboard = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role || '';
    const scope = await resolveAccessScopeForUser(role, {
      id: req.user?.id || '',
      company: userCompany(req),
    });

    if (scope.mode === 'self') {
      forbidden(res);
      return;
    }

    const filters = parseFilters(req.query);
    const ctx = { userId: req.user?.id, userRole: role };
    const data = await getAllExpiryRecords(scope, filters, ctx);
    res.json({ success: true, data });
  } catch (error) {
    console.error('getExpiryDashboard error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/document-expiry/mine — employee own documents
 */
export const getMyExpiryRecords = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const scope = resolveAccessScope(req.user?.role || 'EMPLOYEE', {
      id: req.user?.id || '',
      company: userCompany(req),
    });
    const filters = parseFilters(req.query);
    const data = await getAllExpiryRecords(
      scope.mode === 'self' ? scope : { mode: 'self', companyNames: [], companyIds: [], userId: req.user?.id },
      filters,
    );
    res.json({ success: true, data: data.employees });
  } catch (error) {
    console.error('getMyExpiryRecords error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/document-expiry/summary — dashboard widget counts
 */
export const getExpirySummaryHandler = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const role = req.user?.role || '';
    const scope =
      role === 'EMPLOYEE'
        ? { mode: 'self' as const, companyNames: [], companyIds: [], userId: req.user?.id }
        : await resolveAccessScopeForUser(role, { id: req.user?.id || '', company: userCompany(req) });

    const data = await getExpirySummary(scope, { userId: req.user?.id, userRole: role });
    res.json({ success: true, data });
  } catch (error) {
    console.error('getExpirySummary error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

function includeCompanySheetsInExport(scope: ReturnType<typeof resolveAccessScope>): boolean {
  return scope.mode !== 'hr_employees' && scope.mode !== 'all_employees';
}

async function sendExpiryExcelReport(req: AuthRequest, res: Response): Promise<void> {
  const role = req.user?.role || '';
  const scope = await resolveAccessScopeForUser(role, {
    id: req.user?.id || '',
    company: userCompany(req),
  });

  if (scope.mode === 'self') {
    forbidden(res);
    return;
  }

  const filters = parseFilters(req.query);
  const data = await getAllExpiryRecords(scope, filters, {
    userId: req.user?.id,
    userRole: role,
  });

  const buffer = await buildExpiryReportExcelBuffer({
    employees: data.employees,
    companies: data.companies,
    projectDocuments: data.projectDocuments,
    includeCompanySheets: includeCompanySheetsInExport(scope),
  });

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="document-expiry-report-${stamp}.xlsx"`);
  res.send(buffer);
}

/**
 * GET /api/document-expiry/report — filtered report (JSON) or Excel (?format=xlsx)
 */
export const getExpiryReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const format = String((req.query as Record<string, string | undefined>).format || '')
      .trim()
      .toLowerCase();
    if (format === 'xlsx' || format === 'excel') {
      await sendExpiryExcelReport(req, res);
      return;
    }

    const role = req.user?.role || '';
    const scope = await resolveAccessScopeForUser(role, {
      id: req.user?.id || '',
      company: userCompany(req),
    });

    if (scope.mode === 'self') {
      forbidden(res);
      return;
    }

    const filters = parseFilters(req.query);
    const data = await getAllExpiryRecords(scope, filters, {
      userId: req.user?.id,
      userRole: role,
    });
    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        filters,
        employees: data.employees,
        companies: data.companies,
        projectDocuments: data.projectDocuments,
        total: data.employees.length + data.companies.length + data.projectDocuments.length,
      },
    });
  } catch (error) {
    console.error('getExpiryReport error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * GET /api/document-expiry/export/excel — color-coded Excel report (alias)
 */
export const exportExpiryReportExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await sendExpiryExcelReport(req, res);
  } catch (error) {
    console.error('exportExpiryReportExcel error:', error);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
};
