import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import {
  drawHrAuthorizationBlock,
  drawLetterheadFooter,
  drawLetterheadHeader,
  ensureSpace,
  fmtDate,
  resolveCompanyBranding,
} from './leaveCertificate.service';

const DOC_DIR = path.join(process.cwd(), 'uploads', 'resignation-letters');
const PAGE_MARGIN = 50;
const FOOTER_MAX_H = 72;
const SIGNATURE_BLOCK_H = 130;

const resignationUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  employeeId: true,
  department: true,
  position: true,
  jobTitle: true,
  company: true,
  joiningDate: true,
} as const;

function ensureDocDir(): void {
  if (!fs.existsSync(DOC_DIR)) fs.mkdirSync(DOC_DIR, { recursive: true });
}

function buildRefNo(prefix: string, resignationId: string, date: Date): string {
  return `${prefix}-${date.getFullYear()}-${resignationId.slice(-6).toUpperCase()}`;
}

function relativeDocPath(filename: string): string {
  return `/uploads/resignation-letters/${filename}`;
}

export function getResignationDocumentPath(relativePath: string): string {
  const raw = relativePath.trim().replace(/^\/+/, '');
  const rel = raw.startsWith('uploads/') ? raw.slice('uploads/'.length) : raw;
  const basename = path.basename(rel);
  return path.join(DOC_DIR, basename);
}

export function resignationDocumentExists(relativePath: string | null | undefined): boolean {
  if (!relativePath?.trim() || relativePath === 'pending-generation') return false;
  return fs.existsSync(getResignationDocumentPath(relativePath));
}

async function loadResignationForDocument(resignationId: string) {
  const row = await prisma.resignationRequest.findUnique({
    where: { id: resignationId },
    include: {
      user: { select: resignationUserSelect },
      hrFinalBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!row || row.workflowStage !== 'RESIGNATION_COMPLETED') {
    throw new Error('Resignation not found or not completed');
  }
  return row;
}

function bottomReserve(branding: { footerPath: string | null }): number {
  return (
    (branding.footerPath ? FOOTER_MAX_H + PAGE_MARGIN + 12 : PAGE_MARGIN + 20) +
    SIGNATURE_BLOCK_H +
    16
  );
}

/** Human-readable service period from joining date through last working day (inclusive). */
export function calculateEmploymentTenure(
  joiningDate: Date | null | undefined,
  lastWorkingDay: Date,
): { years: number; months: number; days: number; label: string } {
  if (!joiningDate || Number.isNaN(joiningDate.getTime())) {
    return { years: 0, months: 0, days: 0, label: '—' };
  }

  const start = new Date(joiningDate);
  const end = new Date(lastWorkingDay);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end < start) {
    return { years: 0, months: 0, days: 0, label: '—' };
  }

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    days += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months > 0) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  if (days > 0 || parts.length === 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);

  let label: string;
  if (parts.length === 1) label = parts[0];
  else if (parts.length === 2) label = `${parts[0]} and ${parts[1]}`;
  else label = `${parts[0]}, ${parts[1]} and ${parts[2]}`;

  return { years, months, days, label };
}

function drawCompactDetailGrid(
  doc: PDFKit.PDFDocument,
  left: number,
  contentW: number,
  rows: [string, string][],
): void {
  const gap = 16;
  const colW = (contentW - gap) / 2;
  const rowH = 14;

  for (let i = 0; i < rows.length; i += 2) {
    const y = doc.y;
    const [l1, v1] = rows[i];
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`${l1}: `, left, y, {
      continued: true,
      width: colW,
    });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(v1, { width: colW });

    if (rows[i + 1]) {
      const [l2, v2] = rows[i + 1];
      const x2 = left + colW + gap;
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text(`${l2}: `, x2, y, {
        continued: true,
        width: colW,
      });
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text(v2, { width: colW });
    }
    doc.y = y + rowH;
  }
}

function drawCompactHrBlock(
  doc: PDFKit.PDFDocument,
  branding: Awaited<ReturnType<typeof resolveCompanyBranding>>,
  left: number,
  contentW: number,
): void {
  const stampSize = 72;
  doc.moveDown(0.6);
  const rowY = doc.y;
  const stampX = left + contentW - stampSize - 4;
  const sigW = contentW - stampSize - 16;

  if (branding.stampPath) {
    try {
      doc.image(branding.stampPath, stampX, rowY, { fit: [stampSize, stampSize], align: 'center' });
    } catch {
      /* skip */
    }
  }

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#0f172a')
    .text('Human Resources Department', left, rowY, { width: sigW });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#475569')
    .text('Authorized Signatory', left, rowY + 14, { width: sigW });

  const lineY = rowY + 52;
  doc
    .moveTo(left, lineY)
    .lineTo(left + 180, lineY)
    .strokeColor('#334155')
    .lineWidth(0.5)
    .stroke();

  const signatory = process.env.LEAVE_CERT_HR_SIGNATORY_NAME || 'Abdullah A. Al Akhras';
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#0f172a')
    .text(signatory, left, lineY + 6, { width: sigW });

  doc.y = lineY + 28;
}

function drawExperienceIntro(
  doc: PDFKit.PDFDocument,
  left: number,
  contentW: number,
  employeeName: string,
  companyName: string,
  joiningLabel: string,
  lastDayLabel: string,
  tenureLabel: string,
): void {
  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  doc.text('This is to certify that ', left, doc.y, { continued: true, width: contentW, lineGap: 1 });
  doc.font('Helvetica-Bold').text(employeeName, { continued: true });
  doc.font('Helvetica').text(' was employed with ', { continued: true });
  doc.font('Helvetica-Bold').text(companyName, { continued: true });
  doc.font('Helvetica').text(' from ', { continued: true });
  doc.font('Helvetica-Bold').text(joiningLabel, { continued: true });
  doc.font('Helvetica').text(' to ', { continued: true });
  doc.font('Helvetica-Bold').text(lastDayLabel, { continued: true });
  doc.font('Helvetica').text(', completing a total service period of ', { continued: true });
  doc.font('Helvetica-Bold').text(`${tenureLabel}.`, { width: contentW, align: 'justify', lineGap: 1 });
  doc.moveDown(0.55);
}

function drawExperienceConductParagraph(
  doc: PDFKit.PDFDocument,
  left: number,
  contentW: number,
  employeeName: string,
  position: string,
  department: string | null | undefined,
  companyName: string,
): void {
  doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
  doc.text('During this tenure, ', left, doc.y, { continued: true, width: contentW, lineGap: 1 });
  doc.font('Helvetica-Bold').text(employeeName, { continued: true });
  doc.font('Helvetica').text(' served as ', { continued: true });
  doc.font('Helvetica-Bold').text(position, { continued: true });
  if (department?.trim()) {
    doc.font('Helvetica').text(' in the ', { continued: true });
    doc.font('Helvetica-Bold').text(department, { continued: true });
    doc.font('Helvetica').text(' department', { continued: true });
  }
  doc.font('Helvetica').text(
    ' and discharged duties with professionalism and accountability, upholding the values and standards of ',
    { continued: true },
  );
  doc.font('Helvetica-Bold').text(companyName, { continued: true });
  doc.font('Helvetica').text(
    ' and demonstrating commitment to the company throughout their employment.',
    { width: contentW, align: 'justify', lineGap: 1 },
  );
  doc.moveDown(0.55);
}

async function writePdf(
  filePath: string,
  render: (doc: PDFKit.PDFDocument, branding: Awaited<ReturnType<typeof resolveCompanyBranding>>) => void,
  companyText: string | null | undefined,
): Promise<void> {
  const branding = await resolveCompanyBranding(companyText);
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    render(doc, branding);
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export async function generateRelievingLetter(resignationId: string): Promise<string> {
  ensureDocDir();
  const row = await loadResignationForDocument(resignationId);
  const employeeName = `${row.user.firstName || ''} ${row.user.lastName || ''}`.trim();
  const branding = await resolveCompanyBranding(row.user.company);
  const approvalDate = row.hrFinalAt || new Date();
  const lastDay = row.finalExitDate || row.intendedLastWorkingDay;
  const refNo = buildRefNo('RL', resignationId, approvalDate);
  const filename = `relieving-${resignationId}-${Date.now()}.pdf`;
  const absPath = path.join(DOC_DIR, filename);
  const reserve = bottomReserve(branding);

  await writePdf(absPath, (doc, brand) => {
    const left = PAGE_MARGIN;
    const contentW = doc.page.width - PAGE_MARGIN * 2;

    doc.y = drawLetterheadHeader(doc, brand);

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#475569')
      .text(`Date: ${fmtDate(approvalDate)}`, left, doc.y, { width: contentW / 2, align: 'left' });
    doc.text(`Ref: ${refNo}`, left + contentW / 2, doc.y - 12, { width: contentW / 2, align: 'right' });
    doc.moveDown(1.2);

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor('#0f172a')
      .text('RELIEVING LETTER', left, doc.y, { width: contentW, align: 'center', underline: true });
    doc.moveDown(1.5);

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#1e293b')
      .text(`Dear ${employeeName},`, left, doc.y, { width: contentW });
    doc.moveDown(0.8);

    const position = row.user.jobTitle || row.user.position || 'the assigned role';
    const paragraphs = [
      `This is to confirm that we have accepted your resignation from ${brand.name}.`,
      `Your last working day with the company was ${fmtDate(lastDay)}. You have been relieved of your duties as ${position}${row.user.department ? ` in the ${row.user.department} department` : ''} with effect from the close of business on that date.`,
      'We acknowledge receipt of company assets and completion of exit formalities as applicable. We wish you success in your future endeavours.',
    ];

    for (const paragraph of paragraphs) {
      ensureSpace(doc, 40, reserve);
      doc.text(paragraph, left, doc.y, { width: contentW, align: 'justify' });
      doc.moveDown(0.8);
    }

    doc.moveDown(0.5);
    doc.text('Yours sincerely,', left, doc.y, { width: contentW });
    drawHrAuthorizationBlock(doc, brand, reserve);
    drawLetterheadFooter(doc, brand);
  }, row.user.company);

  return relativeDocPath(filename);
}

export async function generateExperienceCertificate(resignationId: string): Promise<string> {
  ensureDocDir();
  const row = await loadResignationForDocument(resignationId);
  const employeeName = `${row.user.firstName || ''} ${row.user.lastName || ''}`.trim();
  const empId = row.user.employeeId || row.user.id.slice(0, 8).toUpperCase();
  const approvalDate = row.hrFinalAt || new Date();
  const lastDay = row.finalExitDate || row.intendedLastWorkingDay;
  const joiningDate = row.user.joiningDate;
  const tenure = calculateEmploymentTenure(joiningDate, lastDay);
  const refNo = buildRefNo('EC', resignationId, approvalDate);
  const filename = `experience-${resignationId}-${Date.now()}.pdf`;
  const absPath = path.join(DOC_DIR, filename);
  const position = row.user.jobTitle || row.user.position || '—';
  const joiningLabel = fmtDate(joiningDate);
  const lastDayLabel = fmtDate(lastDay);

  await writePdf(absPath, (doc, brand) => {
    const left = PAGE_MARGIN;
    const contentW = doc.page.width - PAGE_MARGIN * 2;
    const companyName = brand.name;

    doc.y = drawLetterheadHeader(doc, brand);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#475569')
      .text(`Date: ${fmtDate(approvalDate)}`, left, doc.y, { width: contentW / 2, align: 'left' });
    doc.text(`Ref: ${refNo}`, left + contentW / 2, doc.y - 11, { width: contentW / 2, align: 'right' });
    doc.moveDown(0.7);

    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor('#0f172a')
      .text('EXPERIENCE CERTIFICATE', left, doc.y, { width: contentW, align: 'center', underline: true });
    doc.moveDown(0.8);

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#1e293b')
      .text('To Whom It May Concern,', left, doc.y, { width: contentW });
    doc.moveDown(0.5);

    drawExperienceIntro(
      doc,
      left,
      contentW,
      employeeName,
      companyName,
      joiningLabel,
      lastDayLabel,
      tenure.label,
    );

    drawExperienceConductParagraph(
      doc,
      left,
      contentW,
      employeeName,
      position,
      row.user.department,
      companyName,
    );

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#0f172a')
      .text('Employment Details', left, doc.y, { width: contentW });
    doc.moveDown(0.35);

    drawCompactDetailGrid(doc, left, contentW, [
      ['Employee Name', employeeName],
      ['Employee ID', empId],
      ['Department', row.user.department || '—'],
      ['Position', position],
      ['Date of Joining', joiningLabel],
      ['Last Working Day', lastDayLabel],
      ['Period of Service', tenure.label],
      ['Clearance Date', fmtDate(approvalDate)],
    ]);

    doc.moveDown(0.45);
    doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
    doc.text(`${employeeName} has separated from `, left, doc.y, { continued: true, width: contentW, lineGap: 1 });
    doc.font('Helvetica-Bold').text(companyName, { continued: true });
    doc.font('Helvetica').text(
      ' on amicable terms after completing all exit formalities. ',
      { continued: true },
    );
    doc.font('Helvetica-Bold').text(employeeName, { continued: true });
    doc.font('Helvetica').text(
      ' has cleared all obligations including financial settlement, asset return, and exit interview. No pending liabilities remain at issuance.',
      { width: contentW, align: 'justify', lineGap: 1 },
    );
    doc.moveDown(0.35);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text(
        'Issued upon HR final approval for official use only.',
        left,
        doc.y,
        { width: contentW, align: 'justify' },
      );

    drawCompactHrBlock(doc, brand, left, contentW);
    drawLetterheadFooter(doc, brand);
  }, row.user.company);

  return relativeDocPath(filename);
}

export async function generateResignationDocuments(
  resignationId: string,
  options: { includeExperienceCertificate?: boolean } = {},
): Promise<{ relievingLetterPath: string; experienceCertificatePath?: string }> {
  const relievingLetterPath = await generateRelievingLetter(resignationId);
  let experienceCertificatePath: string | undefined;
  if (options.includeExperienceCertificate !== false) {
    experienceCertificatePath = await generateExperienceCertificate(resignationId);
  }
  return { relievingLetterPath, experienceCertificatePath };
}
