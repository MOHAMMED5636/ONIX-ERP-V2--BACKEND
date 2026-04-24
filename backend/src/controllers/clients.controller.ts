import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { CLIENT_IMPORT_SCHEMA } from '../config/clientImportSchema';
import { buildXlsxBuffer, safeCellString } from '../utils/excel';

// Generate client reference number: O-CL-YYYY/NNNN (serial resets per year)
// Requirement: no gaps — if a number is missing (e.g., deleted), reuse it before advancing.
function parseClientSerial(ref: string, year: number): number | null {
  const prefix = `O-CL-${year}/`;
  if (!ref.startsWith(prefix)) return null;
  const s = ref.slice(prefix.length).trim();
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatClientRef(year: number, serial: number): string {
  return `O-CL-${year}/${String(serial).padStart(4, '0')}`;
}

async function generateNextClientReferenceNumber(tx: typeof prisma, year: number): Promise<string> {
  const prefix = `O-CL-${year}/`;
  const rows = await tx.client.findMany({
    where: { referenceNumber: { startsWith: prefix } },
    select: { referenceNumber: true },
  });
  const used = new Set<number>();
  let minUsed: number | null = null;
  for (const r of rows) {
    const n = parseClientSerial(r.referenceNumber, year);
    if (n != null) {
      used.add(n);
      if (minUsed == null || n < minUsed) minUsed = n;
    }
  }
  // We never issue numbers below the smallest existing serial for that year.
  // This avoids surprising "backfill" like creating /0001 after the system started at /0004.
  let serial = minUsed ?? 1;
  while (used.has(serial)) serial += 1;
  return formatClientRef(year, serial);
}

async function generateReferenceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  return generateNextClientReferenceNumber(prisma, year);
}

// Get all clients with filters
export const getAllClients = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      search,
      type, // isCorporate filter (legacy)
      corporate, // alias used by some frontend builds
      leadSource,
      rank,
      page = '1',
      limit = '50',
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    // Allow larger limits so the ERP Clients page can load "all clients" in one call when needed.
    // Keep a hard cap to prevent accidental huge queries.
    const limitNum = Math.max(1, Math.min(5000, parseInt(limit as string, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { referenceNumber: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const corporateFilter = (type || corporate) as string | undefined;
    if (corporateFilter) {
      where.isCorporate = corporateFilter;
    }

    if (leadSource) {
      where.leadSource = leadSource as string;
    }

    if (rank) {
      where.rank = rank as string;
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
        include: {
          _count: {
            select: {
              projects: true,
              tenders: true,
            },
          },
        },
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        clients,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch clients',
      error: error.message,
    });
  }
};

// Get client statistics
export const getClientStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [totalClients, clientsByType, clientsBySource, clientsByRank] = await Promise.all([
      prisma.client.count(),
      prisma.client.groupBy({
        by: ['isCorporate'],
        _count: {
          id: true,
        },
      }),
      prisma.client.groupBy({
        by: ['leadSource'],
        _count: {
          id: true,
        },
        where: {
          leadSource: {
            not: null,
          },
        },
      }),
      prisma.client.groupBy({
        by: ['rank'],
        _count: {
          id: true,
        },
        where: {
          rank: {
            not: null,
          },
        },
      }),
    ]);

    // Transform data for frontend
    const statsByType: Record<string, number> = {};
    clientsByType.forEach((item) => {
      const key = item.isCorporate || 'Unknown';
      statsByType[key] = item._count.id;
    });

    const statsBySource: Record<string, number> = {};
    clientsBySource.forEach((item) => {
      const key = item.leadSource || 'Unknown';
      statsBySource[key] = item._count.id;
    });

    const statsByRank: Record<string, number> = {};
    clientsByRank.forEach((item) => {
      const key = item.rank || 'Unknown';
      statsByRank[key] = item._count.id;
    });

    res.json({
      success: true,
      data: {
        totalClients,
        byType: statsByType,
        bySource: statsBySource,
        byRank: statsByRank,
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching client statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client statistics',
      error: error.message,
    });
  }
};

// Get a single client by ID
export const getClientById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        projects: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
            createdAt: true,
          },
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
        },
        tenders: {
          select: {
            id: true,
            name: true,
            referenceNumber: true,
            status: true,
            createdAt: true,
          },
          take: 10,
          orderBy: {
            createdAt: 'desc',
          },
        },
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    res.json({
      success: true,
      data: client,
    });
  } catch (error: any) {
    console.error('❌ Error fetching client:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch client',
      error: error.message,
    });
  }
};

// Create a new client
export const createClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      isCorporate,
      leadSource,
      rank,
      email,
      phone,
      address,
      nationality,
      idNumber,
      idExpiryDate,
      passportNumber,
      birthDate,
      documentType,
      representativeName,
      representativeEmail,
      representativePhone,
      representativeNationality,
      representativeIdNumber,
      representativeIdExpiryDate,
      representativePassportNumber,
      representativeBirthDate,
      representativeAddress,
      representativeType,
      representativeLeadSource,
      representativeRank,
      representativeCorporateName,
      representativeWebsite,
      representativeLicenseNumber,
      representativeCompanyAddress,
      representativeCompanyDescription,
      representativeTrnNumber,
      representativeIbanNumber,
    } = req.body;

    // Validation
    if (!name || !name.trim()) {
      res.status(400).json({
        success: false,
        message: 'Client name is required',
      });
      return;
    }

    if (!isCorporate) {
      res.status(400).json({
        success: false,
        message: 'Client type (Person/Company) is required',
      });
      return;
    }

    // Prevent duplicates by email/phone (if provided).
    const emailNorm = email ? normalizeEmail(String(email)) : '';
    const phoneNorm = phone ? String(phone).trim() : '';
    if (emailNorm && !isValidEmail(emailNorm)) {
      res.status(400).json({ success: false, message: 'Invalid email format' });
      return;
    }
    if (emailNorm || phoneNorm) {
      const exists = await prisma.client.findFirst({
        where: {
          OR: [
            ...(emailNorm ? [{ email: { equals: emailNorm, mode: 'insensitive' as any } }] : []),
            ...(phoneNorm ? [{ phone: { equals: phoneNorm } }] : []),
          ],
        },
        select: { id: true, referenceNumber: true, name: true, email: true, phone: true },
      });
      if (exists) {
        res.status(409).json({
          success: false,
          message: 'Duplicate client: email or phone already exists',
          data: {
            existingClient: {
              id: exists.id,
              referenceNumber: exists.referenceNumber,
              name: exists.name,
              email: exists.email,
              phone: exists.phone,
            },
          },
        });
        return;
      }
    }

    // Generate reference number (gapless). Use transaction + retry to avoid race conditions.
    const year = new Date().getFullYear();
    let client: any = null;
    const MAX_REF_RETRIES = 5;

    // Handle document uploads: from upload.fields() we get req.files only (req.file is not set)
    let documentAttachment: string | null = null;
    let documentAttachments: string | null = null;
    let representativePowerOfAttorneyPath: string | null = null;
    let representativePowerOfAttorneyOriginalName: string | null = null;
    let undertakingLetterPath: string | null = null;
    let undertakingLetterOriginalName: string | null = null;
    const files: Express.Multer.File[] = [];
    const filesObj = req.files as {
      document?: Express.Multer.File[];
      documents?: Express.Multer.File[];
      representativePowerOfAttorney?: Express.Multer.File[];
      undertakingLetter?: Express.Multer.File[];
    } | undefined;
    if (filesObj?.document?.length) files.push(...filesObj.document);
    if (filesObj?.documents?.length) files.push(...filesObj.documents);
    if (files.length > 0) {
      let documentTypes: string[] = [];
      try {
        if (typeof req.body.documentTypes === 'string') {
          documentTypes = JSON.parse(req.body.documentTypes) || [];
        }
      } catch (_) {}
      const attachments = files.map((f, i) => ({
        documentType: documentTypes[i] || 'DOC',
        path: `/uploads/documents/${f.filename}`,
        originalName: f.originalname,
      }));
      documentAttachment = attachments[0].path;
      documentAttachments = JSON.stringify(attachments);
      console.log('📄 Client documents uploaded:', attachments.length, attachments);
    }

    if (filesObj?.representativePowerOfAttorney?.length) {
      const f = filesObj.representativePowerOfAttorney[0];
      representativePowerOfAttorneyPath = `/uploads/documents/${f.filename}`;
      representativePowerOfAttorneyOriginalName = f.originalname;
    }

    if (filesObj?.undertakingLetter?.length) {
      const f = filesObj.undertakingLetter[0];
      undertakingLetterPath = `/uploads/documents/${f.filename}`;
      undertakingLetterOriginalName = f.originalname;
    }

    // Parse dates
    let parsedBirthDate: Date | null = null;
    let parsedIdExpiryDate: Date | null = null;
    let parsedRepresentativeBirthDate: Date | null = null;
    let parsedRepresentativeIdExpiryDate: Date | null = null;

    if (birthDate) {
      parsedBirthDate = new Date(birthDate);
      if (isNaN(parsedBirthDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid birth date format',
        });
        return;
      }
    }

    if (idExpiryDate) {
      parsedIdExpiryDate = new Date(idExpiryDate);
      if (isNaN(parsedIdExpiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid ID expiry date format',
        });
        return;
      }
    }

    if (representativeBirthDate) {
      parsedRepresentativeBirthDate = new Date(representativeBirthDate);
      if (isNaN(parsedRepresentativeBirthDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid representative birth date format',
        });
        return;
      }
    }

    if (representativeIdExpiryDate) {
      parsedRepresentativeIdExpiryDate = new Date(representativeIdExpiryDate);
      if (isNaN(parsedRepresentativeIdExpiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid representative ID expiry date format',
        });
        return;
      }
    }

    for (let attempt = 1; attempt <= MAX_REF_RETRIES; attempt += 1) {
      try {
        client = await prisma.$transaction(async (tx) => {
          const referenceNumber = await generateNextClientReferenceNumber(tx as any, year);
          return tx.client.create({
            data: {
              referenceNumber,
              name: name.trim(),
              isCorporate,
              leadSource: leadSource || null,
              rank: rank || null,
              email: email?.trim() || null,
              phone: phone?.trim() || null,
              address: address?.trim() || null,
              nationality: nationality || null,
              idNumber: idNumber?.trim() || null,
              idExpiryDate: parsedIdExpiryDate,
              passportNumber: passportNumber?.trim() || null,
              birthDate: parsedBirthDate,
              representativeName: representativeName?.trim() || null,
              representativeEmail: representativeEmail?.trim() || null,
              representativePhone: representativePhone?.trim() || null,
              representativeNationality: representativeNationality || null,
              representativeIdNumber: representativeIdNumber?.trim() || null,
              representativeIdExpiryDate: parsedRepresentativeIdExpiryDate,
              representativePassportNumber: representativePassportNumber?.trim() || null,
              representativeBirthDate: parsedRepresentativeBirthDate,
              representativeAddress: representativeAddress?.trim() || null,
              representativeType: representativeType || null,
              representativeLeadSource: representativeLeadSource || null,
              representativeRank: representativeRank || null,
              representativeCorporateName: representativeCorporateName?.trim() || null,
              representativeWebsite: representativeWebsite?.trim() || null,
              representativeLicenseNumber: representativeLicenseNumber?.trim() || null,
              representativeCompanyAddress: representativeCompanyAddress?.trim() || null,
              representativeCompanyDescription: representativeCompanyDescription?.trim() || null,
              representativeTrnNumber: representativeTrnNumber?.trim() || null,
              representativeIbanNumber: representativeIbanNumber?.trim() || null,
              representativePowerOfAttorneyPath,
              representativePowerOfAttorneyOriginalName,
              undertakingLetterPath,
              undertakingLetterOriginalName,
              documentType: documentType || null,
              documentAttachment,
              documentAttachments,
            },
            include: {
              _count: {
                select: {
                  projects: true,
                  tenders: true,
                },
              },
            },
          });
        });
        break;
      } catch (e: any) {
        // If referenceNumber collided due to concurrent create, retry.
        if (e?.code === 'P2002' && attempt < MAX_REF_RETRIES) continue;
        throw e;
      }
    }
    if (!client) {
      throw new Error('Failed to allocate reference number. Please try again.');
    }

    console.log('✅ Client created:', client.referenceNumber);

    res.status(201).json({
      success: true,
      data: client,
      message: 'Client created successfully',
    });
  } catch (error: any) {
    console.error('❌ Error creating client:', error);

    // Handle unique constraint violations
    if (error.code === 'P2002') {
      res.status(400).json({
        success: false,
        message: 'A client with this reference number already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create client',
      error: error.message,
    });
  }
};

// ---------------- Client Import/Export (Excel) ----------------

export const getClientImportSchema = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, data: CLIENT_IMPORT_SCHEMA });
  } catch (e: any) {
    res.status(500).json({ success: false, message: 'Failed to load schema', error: e?.message });
  }
};

export const downloadClientTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ONIX ERP';
    wb.created = new Date();

    const ws = wb.addWorksheet('Client Template', { views: [{ state: 'frozen', ySplit: 2 }] });
    const instr = wb.addWorksheet('Instructions');
    const lists = wb.addWorksheet('_lists');
    lists.state = 'veryHidden';

    // Header rows: Row1 labels (with *), Row2 keys (hidden)
    const labels = CLIENT_IMPORT_SCHEMA.map((f) => `${f.label}${f.required ? ' *' : ''}`);
    const keys = CLIENT_IMPORT_SCHEMA.map((f) => f.key);
    ws.addRow(labels);
    ws.addRow(keys);
    ws.getRow(2).hidden = true;

    // Sample row
    ws.addRow(CLIENT_IMPORT_SCHEMA.map((f) => f.sample || ''));

    // Styling
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 20;
    ws.getRow(3).height = 18;

    // Column widths
    CLIENT_IMPORT_SCHEMA.forEach((f, idx) => {
      const base = Math.max(14, Math.min(40, (f.label.length || 10) + 10));
      ws.getColumn(idx + 1).width = base;
    });

    // Build dropdown lists in hidden sheet
    let listCol = 1;
    for (const field of CLIENT_IMPORT_SCHEMA) {
      if (field.type !== 'select' || !field.options?.length) continue;
      const colLetter = lists.getColumn(listCol).letter;
      lists.getCell(`${colLetter}1`).value = field.key;
      field.options.forEach((opt, i) => {
        lists.getCell(`${colLetter}${i + 2}`).value = opt;
      });
      const range = `'_lists'!$${colLetter}$2:$${colLetter}$${field.options.length + 1}`;

      // Apply data validation to a reasonable row range (from row3 downward)
      const targetColIdx = CLIENT_IMPORT_SCHEMA.findIndex((f) => f.key === field.key) + 1;
      for (let r = 3; r <= 2002; r++) {
        ws.getCell(r, targetColIdx).dataValidation = {
          type: 'list',
          allowBlank: !field.required,
          formulae: [range],
          showErrorMessage: true,
          errorStyle: 'error',
          errorTitle: 'Invalid value',
          error: `Choose a value from the list for ${field.label}.`,
        };
      }

      listCol += 1;
    }

    // Instructions sheet
    instr.addRow(['Client Import Instructions']);
    instr.getRow(1).font = { bold: true, size: 14 };
    instr.addRow([]);
    instr.addRow(['1) Fill rows starting from row 3 (row 2 is hidden keys).']);
    instr.addRow(['2) Required columns are marked with * in the header.']);
    instr.addRow(['3) Dates must be in YYYY-MM-DD format.']);
    instr.addRow(['4) Do not change header row names or order.']);
    instr.addRow([]);
    instr.addRow(['Field notes']);
    instr.getRow(instr.lastRow!.number).font = { bold: true };
    CLIENT_IMPORT_SCHEMA.filter((f) => f.note).forEach((f) => {
      instr.addRow([`${f.label}: ${f.note}`]);
    });
    instr.columns = [{ width: 110 }];

    const buffer = await buildXlsxBuffer(wb);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="client-import-template.xlsx"');
    res.send(buffer);
  } catch (e: any) {
    console.error('downloadClientTemplate error:', e);
    res.status(500).json({ success: false, message: 'Failed to generate template', error: e?.message });
  }
};

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

function isValidEmail(v: string): boolean {
  // simple pragmatic check
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function parseDateOrNull(v: string): Date | null {
  const s = v.trim();
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d;
}

export const importClientsExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file?.buffer) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets['Client Template'] || workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      res.status(400).json({ success: false, message: 'Invalid Excel file (no sheets)' });
      return;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as any;
    if (!rows.length || rows.length < 2) {
      res.status(400).json({ success: false, message: 'Template is empty' });
      return;
    }

    const headerLabels = (rows[0] || []).map((x) => safeCellString(x));
    const headerKeys = (rows[1] || []).map((x) => safeCellString(x));
    const expectedKeys = CLIENT_IMPORT_SCHEMA.map((f) => f.key);

    const keysToUse = headerKeys.every((k) => k) ? headerKeys : headerLabels.map((l) => {
      const cleaned = l.replace(/\s*\*$/, '').trim().toLowerCase();
      const match = CLIENT_IMPORT_SCHEMA.find((f) => f.label.toLowerCase() === cleaned);
      return match?.key || '';
    });

    if (keysToUse.join('|') !== expectedKeys.join('|')) {
      res.status(400).json({
        success: false,
        message: 'Template columns do not match the current Client template. Please download a fresh template.',
      });
      return;
    }

    const dataRows = rows.slice(2); // start at row 3 in Excel
    const errors: Array<{ rowNumber: number; field: string; message: string }> = [];
    let processed = 0;
    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const excelRowNumber = i + 3;
      const values = dataRows[i] || [];
      // Skip empty rows
      const isEmpty = values.every((v) => !safeCellString(v));
      if (isEmpty) continue;
      processed += 1;

      const payload: any = {};
      CLIENT_IMPORT_SCHEMA.forEach((f, idx) => {
        payload[f.key] = safeCellString(values[idx]);
      });

      // Validate required
      for (const f of CLIENT_IMPORT_SCHEMA) {
        if (f.required && !payload[f.key]) {
          errors.push({ rowNumber: excelRowNumber, field: f.label, message: 'Required field is missing' });
        }
      }

      // Validate email
      if (payload.email && !isValidEmail(payload.email)) {
        errors.push({ rowNumber: excelRowNumber, field: 'Email', message: 'Invalid email format' });
      }

      // Validate selects
      for (const f of CLIENT_IMPORT_SCHEMA) {
        if (f.type === 'select' && payload[f.key]) {
          const ok = (f.options || []).includes(payload[f.key]);
          if (!ok) {
            errors.push({ rowNumber: excelRowNumber, field: f.label, message: `Invalid value. Allowed: ${(f.options || []).join(', ')}` });
          }
        }
      }

      // Validate dates
      const parsedIdExpiryDate = payload.idExpiryDate ? parseDateOrNull(payload.idExpiryDate) : null;
      if (payload.idExpiryDate && !parsedIdExpiryDate) {
        errors.push({ rowNumber: excelRowNumber, field: 'ID Expiry Date', message: 'Invalid date (use YYYY-MM-DD)' });
      }
      const parsedBirthDate = payload.birthDate ? parseDateOrNull(payload.birthDate) : null;
      if (payload.birthDate && !parsedBirthDate) {
        errors.push({ rowNumber: excelRowNumber, field: 'Birth Date', message: 'Invalid date (use YYYY-MM-DD)' });
      }

      // Dedupe (email/phone) if provided
      const emailNorm = payload.email ? normalizeEmail(payload.email) : '';
      const phoneNorm = payload.phone ? payload.phone.trim() : '';
      if (emailNorm || phoneNorm) {
        const exists = await prisma.client.findFirst({
          where: {
            OR: [
              ...(emailNorm ? [{ email: { equals: emailNorm, mode: 'insensitive' as any } }] : []),
              ...(phoneNorm ? [{ phone: { equals: phoneNorm } }] : []),
            ],
          },
          select: { id: true },
        });
        if (exists) {
          errors.push({ rowNumber: excelRowNumber, field: 'Email/Phone', message: 'Duplicate client (email/phone already exists)' });
        }
      }

      const rowErrors = errors.filter((e) => e.rowNumber === excelRowNumber);
      if (rowErrors.length) {
        failedCount += 1;
        continue;
      }

      try {
        const year = new Date().getFullYear();
        const created = await prisma.$transaction(async (tx) => {
          const referenceNumber = await generateNextClientReferenceNumber(tx as any, year);
          return tx.client.create({
            data: {
              referenceNumber,
              name: payload.name,
              isCorporate: payload.isCorporate,
              leadSource: payload.leadSource || null,
              rank: payload.rank || null,
              email: payload.email ? payload.email.trim() : null,
              phone: payload.phone ? payload.phone.trim() : null,
              address: payload.address || null,
              nationality: payload.nationality || null,
              idNumber: payload.idNumber || null,
              idExpiryDate: parsedIdExpiryDate,
              passportNumber: payload.passportNumber || null,
              birthDate: parsedBirthDate,
            },
          });
        });
        void created;
        successCount += 1;
      } catch (e: any) {
        failedCount += 1;
        errors.push({ rowNumber: excelRowNumber, field: 'Row', message: e?.message ? String(e.message) : 'Failed to create client' });
      }
    }

    // Build error report if any
    let errorReportBase64: string | null = null;
    if (errors.length) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Import Errors');
      ws.addRow(['Row Number', 'Field', 'Error Message']);
      ws.getRow(1).font = { bold: true };
      errors.forEach((e) => ws.addRow([e.rowNumber, e.field, e.message]));
      ws.columns = [{ width: 12 }, { width: 26 }, { width: 80 }];
      const buf = await buildXlsxBuffer(wb);
      errorReportBase64 = buf.toString('base64');
    }

    res.json({
      success: true,
      data: {
        processed,
        imported: successCount,
        failed: failedCount,
        errorCount: errors.length,
        errorReportBase64,
      },
    });
  } catch (e: any) {
    console.error('importClientsExcel error:', e);
    res.status(500).json({ success: false, message: 'Import failed', error: e?.message });
  }
};

export const exportClientsExcel = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const clients = await prisma.client.findMany({ orderBy: { createdAt: 'desc' } });
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clients', { views: [{ state: 'frozen', ySplit: 1 }] });
    const labels = CLIENT_IMPORT_SCHEMA.map((f) => `${f.label}${f.required ? ' *' : ''}`);
    ws.addRow(labels);
    ws.getRow(1).font = { bold: true };

    clients.forEach((c) => {
      const row = CLIENT_IMPORT_SCHEMA.map((f) => {
        const v: any = (c as any)[f.key];
        if (!v) return '';
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v);
      });
      ws.addRow(row);
    });

    CLIENT_IMPORT_SCHEMA.forEach((f, idx) => {
      ws.getColumn(idx + 1).width = Math.max(14, Math.min(40, (f.label.length || 10) + 10));
    });

    const buffer = await buildXlsxBuffer(wb);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="clients-export.xlsx"');
    res.send(buffer);
  } catch (e: any) {
    console.error('exportClientsExcel error:', e);
    res.status(500).json({ success: false, message: 'Export failed', error: e?.message });
  }
};

// Update a client
export const updateClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const {
      name,
      isCorporate,
      leadSource,
      rank,
      email,
      phone,
      address,
      nationality,
      idNumber,
      idExpiryDate,
      passportNumber,
      birthDate,
      documentType,
      representativeName,
      representativeEmail,
      representativePhone,
      representativeNationality,
      representativeIdNumber,
      representativeIdExpiryDate,
      representativePassportNumber,
      representativeBirthDate,
      representativeAddress,
      representativeType,
      representativeLeadSource,
      representativeRank,
      representativeCorporateName,
      representativeWebsite,
      representativeLicenseNumber,
      representativeCompanyAddress,
      representativeCompanyDescription,
      representativeTrnNumber,
      representativeIbanNumber,
    } = req.body;

    // Check if client exists
    const existingClient = await prisma.client.findUnique({
      where: { id },
    });

    if (!existingClient) {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    // Handle document uploads: existing (from body) + new files
    let documentAttachment = existingClient.documentAttachment;
    let documentAttachments: string | null = existingClient.documentAttachments;
    let documentsUpdated = false;
    const filesObj = req.files as {
      document?: Express.Multer.File[];
      documents?: Express.Multer.File[];
      representativePowerOfAttorney?: Express.Multer.File[];
      undertakingLetter?: Express.Multer.File[];
    } | undefined;
    const files: Express.Multer.File[] = [];
    if (filesObj?.document?.length) files.push(...filesObj.document);
    if (filesObj?.documents?.length) files.push(...filesObj.documents);

    if (files.length > 0 || req.body.existingDocumentAttachments !== undefined) {
      documentsUpdated = true;
      let existingAttachments: Array<{ documentType: string; path: string; originalName: string }> = [];
      try {
        if (typeof req.body.existingDocumentAttachments === 'string' && req.body.existingDocumentAttachments) {
          existingAttachments = JSON.parse(req.body.existingDocumentAttachments) || [];
        }
      } catch (_) {}

      let documentTypes: string[] = [];
      try {
        if (typeof req.body.documentTypes === 'string') {
          documentTypes = JSON.parse(req.body.documentTypes) || [];
        }
      } catch (_) {}

      const newAttachments = files.map((f, i) => ({
        documentType: documentTypes[i] || 'DOC',
        path: `/uploads/documents/${f.filename}`,
        originalName: f.originalname,
      }));
      const allAttachments = [...existingAttachments, ...newAttachments];
      documentAttachments = allAttachments.length > 0 ? JSON.stringify(allAttachments) : null;
      documentAttachment = allAttachments.length > 0 ? allAttachments[0].path : null;
      if (files.length > 0) {
        console.log('📄 Client documents updated:', { existing: existingAttachments.length, new: newAttachments.length });
      }
    }

    // Parse dates
    let parsedBirthDate: Date | null | undefined = undefined;
    let parsedIdExpiryDate: Date | null | undefined = undefined;
    let parsedRepresentativeBirthDate: Date | null | undefined = undefined;
    let parsedRepresentativeIdExpiryDate: Date | null | undefined = undefined;

    if (birthDate !== undefined) {
      if (birthDate === null || birthDate === '') {
        parsedBirthDate = null;
      } else {
        parsedBirthDate = new Date(birthDate);
        if (isNaN(parsedBirthDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid birth date format',
          });
          return;
        }
      }
    }

    if (idExpiryDate !== undefined) {
      if (idExpiryDate === null || idExpiryDate === '') {
        parsedIdExpiryDate = null;
      } else {
        parsedIdExpiryDate = new Date(idExpiryDate);
        if (isNaN(parsedIdExpiryDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid ID expiry date format',
          });
          return;
        }
      }
    }

    if (representativeBirthDate !== undefined) {
      if (representativeBirthDate === null || representativeBirthDate === '') {
        parsedRepresentativeBirthDate = null;
      } else {
        parsedRepresentativeBirthDate = new Date(representativeBirthDate);
        if (isNaN(parsedRepresentativeBirthDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid representative birth date format',
          });
          return;
        }
      }
    }

    if (representativeIdExpiryDate !== undefined) {
      if (representativeIdExpiryDate === null || representativeIdExpiryDate === '') {
        parsedRepresentativeIdExpiryDate = null;
      } else {
        parsedRepresentativeIdExpiryDate = new Date(representativeIdExpiryDate);
        if (isNaN(parsedRepresentativeIdExpiryDate.getTime())) {
          res.status(400).json({
            success: false,
            message: 'Invalid representative ID expiry date format',
          });
          return;
        }
      }
    }

    // Build update data
    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (isCorporate !== undefined) updateData.isCorporate = isCorporate;
    if (leadSource !== undefined) updateData.leadSource = leadSource || null;
    if (rank !== undefined) updateData.rank = rank || null;
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (nationality !== undefined) updateData.nationality = nationality || null;
    if (idNumber !== undefined) updateData.idNumber = idNumber?.trim() || null;
    if (parsedIdExpiryDate !== undefined) updateData.idExpiryDate = parsedIdExpiryDate;
    if (passportNumber !== undefined) updateData.passportNumber = passportNumber?.trim() || null;
    if (parsedBirthDate !== undefined) updateData.birthDate = parsedBirthDate;
    if (representativeName !== undefined) updateData.representativeName = representativeName?.trim() || null;
    if (representativeEmail !== undefined) updateData.representativeEmail = representativeEmail?.trim() || null;
    if (representativePhone !== undefined) updateData.representativePhone = representativePhone?.trim() || null;
    if (representativeNationality !== undefined) updateData.representativeNationality = representativeNationality || null;
    if (representativeIdNumber !== undefined) updateData.representativeIdNumber = representativeIdNumber?.trim() || null;
    if (parsedRepresentativeIdExpiryDate !== undefined) updateData.representativeIdExpiryDate = parsedRepresentativeIdExpiryDate;
    if (representativePassportNumber !== undefined) updateData.representativePassportNumber = representativePassportNumber?.trim() || null;
    if (parsedRepresentativeBirthDate !== undefined) updateData.representativeBirthDate = parsedRepresentativeBirthDate;
    if (representativeAddress !== undefined) updateData.representativeAddress = representativeAddress?.trim() || null;
    if (representativeType !== undefined) updateData.representativeType = representativeType || null;
    if (representativeLeadSource !== undefined) updateData.representativeLeadSource = representativeLeadSource || null;
    if (representativeRank !== undefined) updateData.representativeRank = representativeRank || null;
    if (representativeCorporateName !== undefined) updateData.representativeCorporateName = representativeCorporateName?.trim() || null;
    if (representativeWebsite !== undefined) updateData.representativeWebsite = representativeWebsite?.trim() || null;
    if (representativeLicenseNumber !== undefined) updateData.representativeLicenseNumber = representativeLicenseNumber?.trim() || null;
    if (representativeCompanyAddress !== undefined) updateData.representativeCompanyAddress = representativeCompanyAddress?.trim() || null;
    if (representativeCompanyDescription !== undefined) updateData.representativeCompanyDescription = representativeCompanyDescription?.trim() || null;
    if (representativeTrnNumber !== undefined) updateData.representativeTrnNumber = representativeTrnNumber?.trim() || null;
    if (representativeIbanNumber !== undefined) updateData.representativeIbanNumber = representativeIbanNumber?.trim() || null;

    if (filesObj?.representativePowerOfAttorney?.length) {
      const f = filesObj.representativePowerOfAttorney[0];
      updateData.representativePowerOfAttorneyPath = `/uploads/documents/${f.filename}`;
      updateData.representativePowerOfAttorneyOriginalName = f.originalname;
    }

    if (filesObj?.undertakingLetter?.length) {
      const f = filesObj.undertakingLetter[0];
      updateData.undertakingLetterPath = `/uploads/documents/${f.filename}`;
      updateData.undertakingLetterOriginalName = f.originalname;
    }
    if (documentType !== undefined) updateData.documentType = documentType || null;
    if (documentsUpdated) {
      updateData.documentAttachment = documentAttachment;
      updateData.documentAttachments = documentAttachments;
    }

    // Update client
    const updatedClient = await prisma.client.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    console.log('✅ Client updated:', updatedClient.referenceNumber);

    res.json({
      success: true,
      data: updatedClient,
      message: 'Client updated successfully',
    });
  } catch (error: any) {
    console.error('❌ Error updating client:', error);

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update client',
      error: error.message,
    });
  }
};

// Delete a client
export const deleteClient = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if client exists
    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            projects: true,
            tenders: true,
          },
        },
      },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    // Check if client has associated projects or tenders
    if (client._count.projects > 0 || client._count.tenders > 0) {
      res.status(400).json({
        success: false,
        message: `Cannot delete client. Client has ${client._count.projects} project(s) and ${client._count.tenders} tender(s) associated.`,
      });
      return;
    }

    // Delete document file if exists
    if (client.documentAttachment) {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), client.documentAttachment);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log('📄 Deleted client document:', filePath);
        }
      } catch (fileError) {
        console.error('⚠️ Error deleting document file:', fileError);
        // Continue with client deletion even if file deletion fails
      }
    }

    // Delete client
    await prisma.client.delete({
      where: { id },
    });

    console.log('✅ Client deleted:', client.referenceNumber);

    res.json({
      success: true,
      message: 'Client deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting client:', error);

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Client not found',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete client',
      error: error.message,
    });
  }
};

// Delete all clients (admin only)
export const deleteAllClients = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get all clients first to handle document attachments
    const allClients = await prisma.client.findMany({
      select: {
        id: true,
        referenceNumber: true,
        documentAttachment: true,
      },
    });

    // Delete document files if they exist
    const fs = require('fs');
    const path = require('path');
    
    for (const client of allClients) {
      if (client.documentAttachment) {
        const filePath = path.join(process.cwd(), client.documentAttachment);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('📄 Deleted client document:', filePath);
          }
        } catch (fileError) {
          console.error('⚠️ Error deleting document file:', fileError);
          // Continue even if file deletion fails
        }
      }
    }

    // First, set clientId to null in all projects and tenders
    await Promise.all([
      prisma.project.updateMany({
        where: {
          clientId: {
            not: null,
          },
        },
        data: {
          clientId: null,
        },
      }),
      prisma.tender.updateMany({
        where: {
          clientId: {
            not: null,
          },
        },
        data: {
          clientId: null,
        },
      }),
    ]);

    // Delete all clients
    const deleteResult = await prisma.client.deleteMany({});

    console.log(`✅ Deleted ${deleteResult.count} client(s)`);

    res.json({
      success: true,
      message: `Successfully deleted ${deleteResult.count} client(s)`,
      data: {
        deletedCount: deleteResult.count,
      },
    });
  } catch (error: any) {
    console.error('❌ Error deleting all clients:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all clients',
      error: error.message,
    });
  }
};
