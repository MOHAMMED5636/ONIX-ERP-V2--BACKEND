import prisma from '../config/database';
import { sendEmail } from './email.service';

export const EMPLOYEE_ERP_ACCESS_TEMPLATE = 'employee_erp_login_details_v1';

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildEmployeeErpAccessEmailHtml(vars: {
  employeeName?: string;
  email?: string;
  password?: string;
  loginUrl?: string;
  companyName?: string;
  department?: string;
}): string {
  const EmployeeName = esc(vars.employeeName);
  const Email = esc(vars.email);
  const Password = esc(vars.password);
  const LoginURL = esc(vars.loginUrl);
  const CompanyName = esc(vars.companyName);
  const Department = esc(vars.department);

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #111827; }
      .container { max-width: 640px; margin: 0 auto; padding: 20px; }
      .header { background: #111827; color: #fff; padding: 18px 20px; border-radius: 12px 12px 0 0; }
      .content { background: #f9fafb; padding: 20px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: 0; }
      .row { margin: 10px 0; }
      .label { color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
      .value { font-size: 14px; color: #111827; }
      .pill { display: inline-block; padding: 8px 12px; border-radius: 999px; background: #eef2ff; color: #3730a3; font-weight: 600; }
      .btn { display: inline-block; padding: 12px 16px; border-radius: 10px; background: #4f46e5; color: #fff !important; text-decoration: none; font-weight: 600; }
      .footer { color: #6b7280; font-size: 12px; margin-top: 18px; }
      code { background: #fff; padding: 2px 6px; border: 1px solid #e5e7eb; border-radius: 6px; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div style="font-size: 18px; font-weight: 700;">Your ERP Login Details – ONIX Group</div>
      </div>
      <div class="content">
        <p>Hello <strong>${EmployeeName}</strong>,</p>
        <p>Your ONIX ERP access has been created. Please use the details below to log in.</p>

        <div class="row">
          <div class="label">Company</div>
          <div class="value">${CompanyName}</div>
        </div>
        <div class="row">
          <div class="label">Department</div>
          <div class="value">${Department}</div>
        </div>
        <div class="row">
          <div class="label">Email</div>
          <div class="value"><code>${Email}</code></div>
        </div>
        <div class="row">
          <div class="label">Password</div>
          <div class="value">${Password ? `<code>${Password}</code>` : `<span class="pill">Use the password provided by HR / onboarding</span>`}</div>
        </div>

        <div class="row" style="margin-top: 18px;">
          <div class="label">Login URL</div>
          <div class="value"><a href="${LoginURL}" class="btn">Open ERP Login</a></div>
          <div class="value" style="margin-top: 8px;"><code>${LoginURL}</code></div>
        </div>

        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export async function sendEmployeeErpAccessEmail(params: {
  employeeId: string;
  toEmail: string;
  employeeName: string;
  department?: string | null;
  passwordToSend?: string | null;
}): Promise<{ status: 'SENT' | 'FAILED'; errorMessage?: string | null }> {
  const subject = 'Your ERP Login Details – ONIX Group';
  const html = buildEmployeeErpAccessEmailHtml({
    employeeName: params.employeeName,
    email: params.toEmail,
    password: params.passwordToSend || '',
    loginUrl: 'https://erp.onixgroup.ae/login',
    companyName: 'ONIX Group',
    department: params.department || '',
  });

  try {
    await sendEmail(params.toEmail, subject, html);
    await prisma.emailLog.create({
      data: {
        recipientEmail: params.toEmail,
        subject,
        template: EMPLOYEE_ERP_ACCESS_TEMPLATE,
        status: 'SENT',
        relatedEmployeeId: params.employeeId,
        errorMessage: null,
      },
    });
    return { status: 'SENT', errorMessage: null };
  } catch (e: any) {
    const msg = e?.message ? String(e.message) : String(e);
    await prisma.emailLog.create({
      data: {
        recipientEmail: params.toEmail,
        subject,
        template: EMPLOYEE_ERP_ACCESS_TEMPLATE,
        status: 'FAILED',
        relatedEmployeeId: params.employeeId,
        errorMessage: msg,
      },
    });
    return { status: 'FAILED', errorMessage: msg };
  }
}

