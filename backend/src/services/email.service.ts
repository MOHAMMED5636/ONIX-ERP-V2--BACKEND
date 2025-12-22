import nodemailer from 'nodemailer';
import { config } from '../config/env';

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: false,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

export const sendEmail = async (to: string, subject: string, html: string, attachments?: any[]) => {
  try {
    const info = await transporter.sendMail({
      from: config.email.from,
      to,
      subject,
      html,
      attachments,
    });
    
    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email error:', error);
    throw error;
  }
};

export const sendTenderInvitationEmail = async (
  engineerEmail: string,
  engineerName: string,
  tenderData: any,
  invitationLink: string,
  attachmentPath?: string
) => {
  const subject = `Tender Invitation: ${tenderData.name}`;
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Tender Invitation</h1>
        </div>
        <div class="content">
          <p>Dear ${engineerName},</p>
          <p>You have been invited to participate in the following tender opportunity:</p>
          <hr>
          <h3>TENDER DETAILS</h3>
          <p><strong>Project Name:</strong> ${tenderData.name}</p>
          <p><strong>Reference Number:</strong> ${tenderData.referenceNumber || 'N/A'}</p>
          <p><strong>Client:</strong> ${tenderData.client || 'N/A'}</p>
          <hr>
          <p>Please click on the link below to view the complete tender details and submit your technical submission:</p>
          <a href="${invitationLink}" class="button">View Tender Invitation</a>
          <p>You will be able to:</p>
          <ul>
            <li>Review all tender requirements</li>
            <li>Upload technical documentation</li>
            <li>Submit your bid response</li>
            <li>Track submission status</li>
          </ul>
          <p>If you have any questions, please contact our tender management team.</p>
          <p>Best regards,<br>ONIX Engineering Team</p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const attachments = attachmentPath ? [{ path: attachmentPath }] : undefined;
  
  return await sendEmail(engineerEmail, subject, html, attachments);
};

