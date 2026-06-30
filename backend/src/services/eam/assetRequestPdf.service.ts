import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import prisma from '../../config/database';
import {
  drawHrAuthorizationBlock,
  drawLetterheadFooter,
  drawLetterheadHeader,
  fmtDate,
  FOOTER_MAX_H,
  resolveCompanyBranding,
  SIGNATURE_BLOCK_H,
} from '../leaveCertificate.service';

const DOC_DIR = path.join(process.cwd(), 'uploads', 'asset-custody');
const PAGE_MARGIN = 50;

function ensureDocDir(): void {
  if (!fs.existsSync(DOC_DIR)) fs.mkdirSync(DOC_DIR, { recursive: true });
}

function relativeDocPath(filename: string): string {
  return `/uploads/asset-custody/${filename}`;
}

export function getCustodyDocumentPath(relativePath: string): string {
  const raw = relativePath.trim().replace(/^\/+/, '');
  const rel = raw.startsWith('uploads/') ? raw.slice('uploads/'.length) : raw;
  return path.join(DOC_DIR, path.basename(rel));
}

export async function regenerateCustodyPdfForRequest(requestId: string): Promise<string> {
  const row = await prisma.assetRequest.findUnique({
    where: { id: requestId },
    include: {
      assignments: { orderBy: { issueDate: 'desc' }, take: 1 },
    },
  });
  if (!row?.assignments?.length) throw new Error('NO_ASSIGNMENT');

  const assignment = row.assignments[0];
  const custodyPath = await generateCustodyAgreementPdf({
    requestId,
    assetId: assignment.assetId,
    assignedById: assignment.assignedById || row.employeeId,
  });

  await prisma.$transaction([
    prisma.assetRequest.update({
      where: { id: requestId },
      data: { custodyDocumentPath: custodyPath },
    }),
    prisma.assetRequestAssignment.update({
      where: { id: assignment.id },
      data: { custodyDocPath: custodyPath },
    }),
  ]);

  return custodyPath;
}

export async function generateCustodyAgreementPdf(input: {
  requestId: string;
  assetId: string;
  assignedById: string;
}): Promise<string> {
  ensureDocDir();

  const [request, asset, assigner] = await Promise.all([
    prisma.assetRequest.findUnique({
      where: { id: input.requestId },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeId: true,
            department: true,
            jobTitle: true,
            company: true,
          },
        },
        category: true,
        project: { select: { name: true, referenceNumber: true, projectNumber: true } },
      },
    }),
    prisma.asset.findUnique({
      where: { id: input.assetId },
      include: { category: true },
    }),
    prisma.user.findUnique({
      where: { id: input.assignedById },
      select: { firstName: true, lastName: true, role: true },
    }),
  ]);

  if (!request || !asset) throw new Error('REQUEST_OR_ASSET_NOT_FOUND');

  const branding = await resolveCompanyBranding(request.employee.company);
  const filename = `custody-${request.requestNumber.replace(/\//g, '-')}-${Date.now()}.pdf`;
  const fullPath = path.join(DOC_DIR, filename);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    const stream = fs.createWriteStream(fullPath);
    doc.pipe(stream);

    const left = PAGE_MARGIN;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const contentW = pageW - PAGE_MARGIN * 2;

    const headerBottom = drawLetterheadHeader(doc, branding);
    const footerBandH = branding.footerPath ? FOOTER_MAX_H + 10 : 0;
    const footerTop = pageH - PAGE_MARGIN - footerBandH;
    const signatureTop = footerTop - SIGNATURE_BLOCK_H - 18;

    let y = headerBottom + 6;

    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    doc.text(`Reference: ${request.requestNumber}`, left, y, { width: contentW / 2, lineBreak: false });
    doc.text(`Issue date: ${fmtDate(new Date())}`, left + contentW / 2, y, {
      width: contentW / 2,
      align: 'right',
      lineBreak: false,
    });
    y += 24;

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor('#0f172a')
      .text('Asset Custody & Responsibility Agreement', left, y, {
        width: contentW,
        align: 'center',
        underline: true,
      });
    y += 32;

    const projectLabel = request.project
      ? `${request.project.projectNumber || request.project.referenceNumber || ''} — ${request.project.name}`.trim()
      : '—';

    const rows: [string, string][] = [
      ['Employee', `${request.employee.firstName} ${request.employee.lastName}`],
      ['Employee ID', request.employee.employeeId || '—'],
      ['Department', request.department || request.employee.department || '—'],
      ['Project', projectLabel],
      ['Designation', request.designation || request.employee.jobTitle || '—'],
      ['Asset category', asset.category.name],
      ['Asset tag', asset.assetTag],
      ['Serial number', asset.serialNumber || '—'],
      ['Brand / model', [request.brandPreference, request.modelPreference].filter(Boolean).join(' / ') || '—'],
      ['Condition', 'As issued'],
      ['Asset value (AED)', String(asset.purchaseCost)],
      ['Assigned by', assigner ? `${assigner.firstName} ${assigner.lastName}` : 'Asset Management'],
    ];

    const labelW = 135;
    const rowGap = 17;

    for (const [label, value] of rows) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#475569').text(label, left, y, { width: labelW });
      doc.font('Helvetica').fontSize(10).fillColor('#0f172a').text(value, left + labelW, y, {
        width: contentW - labelW,
      });
      y += rowGap;
    }

    y += 10;
    const ackText =
      'I acknowledge receipt of the company asset listed above. I understand that I am the designated custodian of this asset and accept responsibility for its care, protection, security, proper use, and return upon transfer, resignation, termination, or company request.';
    doc.font('Helvetica').fontSize(10).fillColor('#1e293b');
    const ackH = doc.heightOfString(ackText, { width: contentW, align: 'justify', lineGap: 3 });
    if (y + ackH > signatureTop - 8) {
      y = Math.max(headerBottom + 6, signatureTop - ackH - 8);
    }
    doc.text(ackText, left, y, { width: contentW, align: 'justify', lineGap: 3 });

    drawHrAuthorizationBlock(doc, branding, 0, signatureTop);
    drawLetterheadFooter(doc, branding);

    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });

  return relativeDocPath(filename);
}
