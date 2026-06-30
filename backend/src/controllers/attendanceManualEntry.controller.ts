import { Response } from 'express';

import { AuthRequest } from '../middleware/auth.middleware';

import {

  isValidAttendanceYmd,

  isValidYearMonth,

  isFutureYearMonth,

  listEmployeesForManualAttendance,

  listEmployeesForManualAttendanceMonth,

  saveManualAttendanceEntries,

  type ManualAttendanceSaveEntry,

} from '../utils/attendance-manual-entry';



function parseYearMonthQuery(req: AuthRequest): { year: number; month: number } | null {
  const yearRaw =
    req.query.year != null && req.query.year !== ''
      ? String(req.query.year).trim()
      : '';
  const monthRaw =
    req.query.month != null && req.query.month !== ''
      ? String(req.query.month).trim()
      : '';
  if (!yearRaw || !monthRaw) return null;

  const year = parseInt(yearRaw, 10);
  const month = parseInt(monthRaw, 10);
  if (!isValidYearMonth(year, month)) return null;
  return { year, month };
}



/**

 * List active employees with editable attendance fields for a month or single date.

 * GET /api/attendance/manual-entry/employees?year=2026&month=5&companyId=&search=

 * GET /api/attendance/manual-entry/employees?date=YYYY-MM-DD&companyId=&search=

 */

export const getManualEntryEmployees = async (

  req: AuthRequest,

  res: Response,

): Promise<void> => {

  try {

    const companyId =

      typeof req.query.companyId === 'string' ? req.query.companyId.trim() : undefined;

    const search =

      typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

    const filters = { companyId, search };



    const yearMonth = parseYearMonthQuery(req);

    if (yearMonth) {

      if (isFutureYearMonth(yearMonth.year, yearMonth.month)) {
        res.status(400).json({
          success: false,
          message: 'Cannot load attendance for a future month',
        });
        return;
      }

      const result = await listEmployeesForManualAttendanceMonth(

        yearMonth.year,

        yearMonth.month,

        filters,

      );



      res.json({

        success: true,

        data: {

          period: result.period,

          employees: result.employees,

          publicHolidays: result.publicHolidays,

          total: result.employees.length,

        },

      });

      return;

    }



    const date =

      typeof req.query.date === 'string' ? req.query.date.trim() : '';

    if (!date || !isValidAttendanceYmd(date)) {

      res.status(400).json({

        success: false,

        message: 'Query parameters year and month, or date (YYYY-MM-DD), are required',

      });

      return;

    }



    const result = await listEmployeesForManualAttendance(date, filters);



    res.json({

      success: true,

      data: {

        date: result.date,

        employees: result.employees,

        publicHolidays: result.publicHolidays,

        total: result.employees.length,

      },

    });

  } catch (error) {

    console.error('getManualEntryEmployees error:', error);

    res.status(500).json({ success: false, message: 'Internal server error' });

  }

};



/**

 * Save manual check-in / check-out for one or more employees.

 * POST /api/attendance/manual-entry/save

 * Body: {

 *   date?: "YYYY-MM-DD",

 *   entries: [{ userId, date?, checkInTime?, checkOutTime?, status? }]

 * }

 */

export const saveManualEntryAttendance = async (

  req: AuthRequest,

  res: Response,

): Promise<void> => {

  try {

    const defaultDate =

      typeof req.body?.date === 'string' ? req.body.date.trim() : '';

    const hasDefaultDate = defaultDate && isValidAttendanceYmd(defaultDate);



    const rawEntries = req.body?.entries;

    if (!Array.isArray(rawEntries) || rawEntries.length === 0) {

      res.status(400).json({

        success: false,

        message: 'Body field entries must be a non-empty array',

      });

      return;

    }



    const entries: ManualAttendanceSaveEntry[] = rawEntries.map((e: Record<string, unknown>) => ({

      userId: String(e.userId ?? ''),

      date: e.date != null ? String(e.date) : null,

      checkInTime: e.checkInTime != null ? String(e.checkInTime) : null,

      checkOutTime: e.checkOutTime != null ? String(e.checkOutTime) : null,

      status: e.status != null ? String(e.status) : null,

    }));



    const entriesNeedDefaultDate = entries.some(

      (e) => !e.date || !isValidAttendanceYmd(String(e.date).trim()),

    );

    if (entriesNeedDefaultDate && !hasDefaultDate) {

      res.status(400).json({

        success: false,

        message: 'Each entry needs date (YYYY-MM-DD), or provide body.date for all entries',

      });

      return;

    }



    const result = await saveManualAttendanceEntries(

      hasDefaultDate ? defaultDate : null,

      entries,

      req.user?.id,

    );



    res.json({

      success: true,

      message: `Saved ${result.saved} employee attendance record(s)`,

      data: result,

    });

  } catch (error) {

    console.error('saveManualEntryAttendance error:', error);

    res.status(500).json({ success: false, message: 'Internal server error' });

  }

};

