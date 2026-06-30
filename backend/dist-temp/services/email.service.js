"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendLoginOtpEmail = exports.sendTenderInvitationEmail = exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const env_1 = require("../config/env");
// Create transporter with better error handling
const transporter = nodemailer_1.default.createTransport({
    host: env_1.config.email.host,
    port: env_1.config.email.port,
    secure: false, // Use TLS (port 587) instead of SSL (port 465)
    requireTLS: true, // Require TLS encryption
    auth: {
        user: env_1.config.email.user,
        pass: env_1.config.email.pass,
    },
    tls: {
        // Do not fail on invalid certificates
        rejectUnauthorized: false,
    },
    // Connection timeout
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
    // Debug mode in development
    debug: process.env.NODE_ENV === 'development',
    logger: process.env.NODE_ENV === 'development',
});
const sendEmail = async (to, subject, html, attachments) => {
    try {
        console.log('📧 Attempting to send email...');
        console.log('   From:', env_1.config.email.from);
        console.log('   To:', to);
        console.log('   Subject:', subject);
        console.log('   SMTP Host:', env_1.config.email.host);
        console.log('   SMTP Port:', env_1.config.email.port);
        console.log('   SMTP User:', env_1.config.email.user);
        const info = await transporter.sendMail({
            from: env_1.config.email.from,
            to,
            subject,
            html,
            attachments,
        });
        console.log('✅ Email sent successfully:', info.messageId);
        return { success: true, messageId: info.messageId };
    }
    catch (error) {
        console.error('❌ Email sending failed:');
        console.error('   Error Code:', error.code);
        console.error('   Error Message:', error.message);
        console.error('   Error Response:', error.response);
        console.error('   Error ResponseCode:', error.responseCode);
        console.error('   Error Command:', error.command);
        // Provide more specific error messages
        if (error.code === 'EAUTH') {
            const response = String(error.response || error.message || '');
            if (/smtp_auth_disabled|SmtpClientAuthentication is disabled/i.test(response)) {
                console.error('   ❌ Microsoft 365 SMTP AUTH is disabled for this tenant/mailbox');
                throw new Error('Office 365 SMTP authentication is disabled for your organization. Ask your IT admin to enable SMTP AUTH (see https://aka.ms/smtp_auth_disabled) for the mailbox used by the ERP.');
            }
            if (/basic authentication|basicauth/i.test(response)) {
                console.error('   ❌ Basic auth / SMTP AUTH blocked by Microsoft 365 policy');
                throw new Error('Office 365 blocked SMTP login for this mailbox. Enable SMTP AUTH for the sender mailbox or use an app-specific mail relay.');
            }
            console.error('   ❌ Authentication failed - check EMAIL_USER and EMAIL_PASS');
            throw new Error('SMTP authentication failed. Please check your email credentials.');
        }
        else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
            console.error('   ❌ Connection failed - check EMAIL_HOST and EMAIL_PORT');
            throw new Error(`Cannot connect to SMTP server ${env_1.config.email.host}:${env_1.config.email.port}. Check your SMTP settings.`);
        }
        else if (error.code === 'EENVELOPE') {
            console.error('   ❌ Invalid email address');
            throw new Error('Invalid email address format.');
        }
        else {
            throw error;
        }
    }
};
exports.sendEmail = sendEmail;
const sendTenderInvitationEmail = async (engineerEmail, engineerName, tenderData, invitationLink, attachmentPath) => {
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
        </html>
  `;
    const attachments = attachmentPath ? [{ path: attachmentPath }] : undefined;
    return await (0, exports.sendEmail)(engineerEmail, subject, html, attachments);
};
exports.sendTenderInvitationEmail = sendTenderInvitationEmail;
const sendLoginOtpEmail = async (userEmail, userName, otp) => {
    const subject = 'Your Login OTP - ONIX ERP System';
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { padding: 30px; background: #f9f9f9; border-radius: 0 0 10px 10px; }
        .otp-box { background: white; border: 3px solid #667eea; border-radius: 10px; padding: 30px; text-align: center; margin: 20px 0; }
        .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; }
        .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🔐 Login Verification Code</h1>
        </div>
        <div class="content">
          <p>Dear ${userName},</p>
          <p>You have requested to log in to the ONIX ERP System using passwordless authentication.</p>
          
          <div class="otp-box">
            <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">Your verification code is:</p>
            <div class="otp-code">${otp}</div>
            <p style="margin: 10px 0 0 0; color: #666; font-size: 12px;">This code will expire in 10 minutes</p>
          </div>
          
          <div class="warning">
            <strong>⚠️ Security Notice:</strong>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li>Never share this code with anyone</li>
              <li>ONIX staff will never ask for your OTP</li>
              <li>If you didn't request this code, please ignore this email</li>
            </ul>
          </div>
          
          <p>Enter this code on the login page to complete your authentication.</p>
          <p>If you have any questions or concerns, please contact your system administrator.</p>
          <p>Best regards,<br><strong>ONIX ERP System</strong></p>
        </div>
        <div class="footer">
          <p>This is an automated message. Please do not reply to this email.</p>
          <p>© ${new Date().getFullYear()} ONIX Group. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
    return await (0, exports.sendEmail)(userEmail, subject, html);
};
exports.sendLoginOtpEmail = sendLoginOtpEmail;
//# sourceMappingURL=email.service.js.map