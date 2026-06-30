import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import prisma from '../config/database';
import { Prisma } from '@prisma/client';
import { buildCompanyNameAliases } from '../utils/company-name-aliases';

const CERT_DIR = path.join(process.cwd(), 'uploads', 'leave-certificates');
const PAGE_MARGIN = 50;
const HEADER_MAX_H = 110;
export const FOOTER_MAX_H = 72;
export const SIGNATURE_BLOCK_H = 130;
const STAMP_SIZE = 88;
const SUPPORTED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const DEFAULT_HR_SIGNATORY_NAME =
  process.env.LEAVE_CERT_HR_SIGNATORY_NAME || 'Abdullah A. Al Akhras';

function isSupportedImageFile(filePath: string): boolean {
  return SUPPORTED_IMAGE_EXT.has(path.extname(filePath).toLowerCase());
}

export type CompanyBranding = {
  name: string;
  letterheadPath: string | null;
  payslipTemplatePath: string | null;
  headerPath: string | null;
  footerPath: string | null;
  logoPath: string | null;
  stampPath: string | null;
};

function ensureCertDir(): void {
  if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });
}

export function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function nextWorkingDay(after: Date): Date {
  const d = new Date(after);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function computeReturnToWorkDate(endDate: Date): Date {
  return nextWorkingDay(endDate);
}

export function buildCertificateRefNo(leaveId: string, approvalDate: Date): string {
  return `ALC-${approvalDate.getFullYear()}-${leaveId.slice(-6).toUpperCase()}`;
}

function uploadPathToFs(relativePath: string | null | undefined): string | null {
  if (!relativePath?.trim()) return null;
  const raw = relativePath.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return null;
  const rel = raw.replace(/^\/+/, '');
  const abs = path.join(process.cwd(), rel);
  if (!fs.existsSync(abs)) return null;
  // PDFKit only embeds raster images — skip PDF/SVG/etc. and fall back to header/logo.
  if (!isSupportedImageFile(abs)) return null;
  return abs;
}

async function resolveCompanyStampPath(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const attachments = await prisma.companyAttachment.findMany({
    where: { companyId },
    select: { label: true, filePath: true, fileName: true, category: true },
    orderBy: { createdAt: 'desc' },
    take: 40,
  });
  for (const att of attachments) {
    const hay = `${att.label || ''} ${att.fileName || ''}`.toLowerCase();
    if (hay.includes('stamp') || hay.includes('seal') || hay.includes('ختم')) {
      const fsPath = uploadPathToFs(att.filePath);
      if (fsPath) return fsPath;
    }
  }
  const identity = attachments.find((a) => a.category === 'COMPANY_IDENTITY');
  if (identity) {
    const fsPath = uploadPathToFs(identity.filePath);
    if (fsPath) return fsPath;
  }
  return null;
}

export async function resolveCompanyBranding(companyText: string | null | undefined): Promise<CompanyBranding> {
  const defaultName = 'Onix Engineering Consultancy';
  const aliases = buildCompanyNameAliases(companyText || defaultName);

  let record: {
    id: string;
    name: string;
    logo: string | null;
    header: string | null;
    footer: string | null;
    letterhead: string | null;
    payslipTemplate?: string | null;
    stamp?: string | null;
  } | null = null;

  for (const alias of aliases) {
    record = await prisma.company.findFirst({
      where: { name: { equals: alias, mode: 'insensitive' } },
      select: {
        id: true,
        name: true,
        logo: true,
        header: true,
        footer: true,
        letterhead: true,
        payslipTemplate: true,
        stamp: true,
      } as Prisma.CompanySelect,
    });
    if (record) break;
  }

  if (!record) {
    record = await prisma.company.findFirst({
      where: {
        OR: [
          { name: { contains: 'ONIX', mode: 'insensitive' } },
          { letterhead: { not: null } },
          { header: { not: null } },
        ],
      },
      select: {
        id: true,
        name: true,
        logo: true,
        header: true,
        footer: true,
        letterhead: true,
        payslipTemplate: true,
        stamp: true,
      } as Prisma.CompanySelect,
      orderBy: { name: 'asc' },
    });
  }

  const attachmentStamp = record ? await resolveCompanyStampPath(record.id) : null;
  const companyStamp = uploadPathToFs(record?.stamp ?? null);

  return {
    name: record?.name || companyText?.trim() || defaultName,
    letterheadPath: uploadPathToFs(record?.letterhead),
    payslipTemplatePath: uploadPathToFs(record?.payslipTemplate ?? null),
    headerPath: uploadPathToFs(record?.header),
    footerPath: uploadPathToFs(record?.footer),
    logoPath: uploadPathToFs(record?.logo),
    stampPath: companyStamp || attachmentStamp,
  };
}

function drawImageFit(
  doc: PDFKit.PDFDocument,
  imagePath: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
): number {
  try {
    const img = (doc as PDFKit.PDFDocument & { openImage: (p: string) => { width: number; height: number } }).openImage(
      imagePath,
    );
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    doc.image(imagePath, x, y, { width: w, height: h });
    return h;
  } catch (err) {
    console.warn('[leave-certificate] Skipping unreadable image:', imagePath, err);
    return 0;
  }
}

export function drawLetterheadHeader(doc: PDFKit.PDFDocument, branding: CompanyBranding): number {
  const pageWidth = doc.page.width;
  const left = PAGE_MARGIN;
  const contentW = pageWidth - PAGE_MARGIN * 2;
  let y = 28;

  if (branding.letterheadPath) {
    const drawnH = drawImageFit(doc, branding.letterheadPath, left, y, contentW, 150);
    y += Math.max(drawnH, 90) + 22;
  } else if (branding.headerPath) {
    const drawnH = drawImageFit(doc, branding.headerPath, left, y, contentW, HEADER_MAX_H);
    y += Math.max(drawnH, 60) + 16;
  } else if (branding.logoPath) {
    const drawnH = drawImageFit(doc, branding.logoPath, left, y, 100, 56);
    doc
      .font('Helvetica-Bold')
      .fontSize(17)
      .fillColor('#0f172a')
      .text(branding.name, left + 112, y + 14, { width: contentW - 112 });
    y += Math.max(drawnH, 56) + 12;
  } else {
    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#0f172a')
      .text(branding.name, left, y, { width: contentW, align: 'center' });
    y += 36;
  }

  doc
    .moveTo(left, y)
    .lineTo(pageWidth - PAGE_MARGIN, y)
    .strokeColor('#cbd5e1')
    .lineWidth(1)
    .stroke();

  return y + 18;
}

export function drawLetterheadFooter(doc: PDFKit.PDFDocument, branding: CompanyBranding): void {
  if (!branding.footerPath) return;
  const left = PAGE_MARGIN;
  const contentW = doc.page.width - PAGE_MARGIN * 2;
  const footerY = doc.page.height - PAGE_MARGIN - FOOTER_MAX_H;
  drawImageFit(doc, branding.footerPath, left, footerY, contentW, FOOTER_MAX_H);
}

/** Draw official company seal — bottom-left above footer by default (Onix payslip layout). */
export function drawCompanyStamp(
  doc: PDFKit.PDFDocument,
  branding: CompanyBranding,
  opts?: { pageMargin?: number; align?: 'left' | 'right' },
): void {
  if (!branding.stampPath) return;
  const margin = opts?.pageMargin ?? PAGE_MARGIN;
  const footerH = branding.footerPath ? FOOTER_MAX_H : 0;
  const stampSize = STAMP_SIZE;
  const left = margin;
  const contentW = doc.page.width - margin * 2;
  const footerY = doc.page.height - margin - footerH;
  const stampY = footerH > 0 ? footerY - stampSize + 8 : doc.page.height - margin - stampSize - 16;
  const stampX = opts?.align === 'right' ? left + contentW - stampSize - 8 : left + 8;
  drawImageFit(doc, branding.stampPath, stampX, stampY, stampSize, stampSize);
}

export function ensureSpace(doc: PDFKit.PDFDocument, needed: number, bottomReserve: number): void {
  if (doc.y + needed <= doc.page.height - bottomReserve) return;
  doc.addPage();
  doc.y = PAGE_MARGIN;
}

export function drawHrAuthorizationBlock(
  doc: PDFKit.PDFDocument,
  branding: CompanyBranding,
  bottomReserve: number,
  fixedTopY?: number,
): void {
  const left = PAGE_MARGIN;
  const contentW = doc.page.width - PAGE_MARGIN * 2;

  if (fixedTopY == null) {
    ensureSpace(doc, SIGNATURE_BLOCK_H, bottomReserve);
    doc.moveDown(2.5);
  }

  const rowY = fixedTopY ?? doc.y;
  const stampX = left + contentW - STAMP_SIZE - 8;

  if (branding.stampPath) {
    drawImageFit(doc, branding.stampPath, stampX, rowY, STAMP_SIZE, STAMP_SIZE);
  }

  const sigW = contentW - STAMP_SIZE - 24;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#0f172a')
    .text('Human Resources Department', left, rowY, { width: sigW });
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#475569')
    .text('Authorized Signatory', left, rowY + 18, { width: sigW });

  const lineY = rowY + 72;
  doc
    .moveTo(left, lineY)
    .lineTo(left + 220, lineY)
    .strokeColor('#334155')
    .lineWidth(0.6)
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor('#0f172a')
    .text(DEFAULT_HR_SIGNATORY_NAME, left, lineY + 8, { width: sigW });

  doc.y = rowY + SIGNATURE_BLOCK_H;
}

export async function generateAnnualLeaveCertificate(leaveId: string): Promise<string> {
  ensureCertDir();

  const leave = await prisma.leave.findUnique({
    where: { id: leaveId },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          department: true,
          position: true,
          company: true,
        },
      },
    },
  });
  if (!leave || leave.type !== 'ANNUAL') {
    throw new Error('Leave not found or not annual');
  }

  const branding = await resolveCompanyBranding(leave.user.company);
  const employeeName = `${leave.user.firstName || ''} ${leave.user.lastName || ''}`.trim();
  const empId = leave.user.employeeId || leave.user.id.slice(0, 8).toUpperCase();
  const approvalDate = leave.hrFinalApprovedAt || leave.approvedAt || new Date();
  const returnDate = leave.returnToWorkDate || computeReturnToWorkDate(leave.endDate);
  const refNo = buildCertificateRefNo(leaveId, approvalDate);

  const filename = `leave-cert-${leaveId}-${Date.now()}.pdf`;
  const filePath = path.join(CERT_DIR, filename);
  const bottomReserve =
    (branding.footerPath ? FOOTER_MAX_H + PAGE_MARGIN + 12 : PAGE_MARGIN + 20) +
    SIGNATURE_BLOCK_H +
    16;

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const left = PAGE_MARGIN;
    const labelW = 170;
    const contentW = doc.page.width - PAGE_MARGIN * 2;

    doc.y = drawLetterheadHeader(doc, branding);

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
      .text('ANNUAL LEAVE CERTIFICATE', left, doc.y, { width: contentW, align: 'center', underline: true });
    doc.moveDown(1.5);

    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#1e293b')
      .text('To Whom It May Concern,', left, doc.y, { width: contentW });
    doc.moveDown(0.8);
    doc.text(
      `This is to certify that the employee named below has been granted annual leave in accordance with ${branding.name} policies and UAE labour regulations.`,
      { width: contentW, align: 'justify' },
    );
    doc.moveDown(1.2);

    const rows: [string, string][] = [
      ['Employee Name', employeeName],
      ['Employee ID', empId],
      ['Department', leave.user.department || '—'],
      ['Position', leave.user.position || '—'],
      ['Leave Type', 'Annual Leave'],
      ['Leave Start Date', fmtDate(leave.startDate)],
      ['Leave End Date', fmtDate(leave.endDate)],
      ['Total Leave Days', String(leave.days)],
      ['Approval Date', fmtDate(approvalDate)],
      ['Return to Work Date', fmtDate(returnDate)],
    ];

    for (const [label, value] of rows) {
      ensureSpace(doc, 20, bottomReserve);
      const rowY = doc.y;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155').text(`${label}:`, left, rowY, {
        width: labelW,
      });
      doc.font('Helvetica').fontSize(10).fillColor('#0f172a').text(value, left + labelW, rowY, {
        width: contentW - labelW,
      });
      doc.y = rowY + 16;
    }

    doc.moveDown(1);
    ensureSpace(doc, 80, bottomReserve);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#1e293b')
      .text(
        `The employee is expected to resume official duties on ${fmtDate(returnDate)}. This certificate is issued for official and administrative purposes upon HR approval.`,
        { width: contentW, align: 'justify' },
      );

    drawHrAuthorizationBlock(doc, branding, bottomReserve);
    drawLetterheadFooter(doc, branding);

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  await prisma.leave.update({
    where: { id: leaveId },
    data: {
      certificateFilename: filename,
      certificateGeneratedAt: new Date(),
      returnToWorkDate: returnDate,
      workflowStage: 'CERTIFICATE_GENERATED',
    },
  });

  return filename;
}

export function getCertificatePath(filename: string): string {
  const safe = path.basename(filename);
  return path.join(CERT_DIR, safe);
}

export function certificateExists(filename: string): boolean {
  return fs.existsSync(getCertificatePath(filename));
}
