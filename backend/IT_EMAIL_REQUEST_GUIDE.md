# 📧 Information to Request from IT Department

## What You Need to Ask IT For Email Configuration

When setting up email sending for your ERP system, you need the following information from your IT department:

---

## ✅ Required Information

### 1. **Email Account Details**
Ask for:
- ✅ **Email Address**: `noreply@onixgroup.ae` (or whatever email you want to use)
- ✅ **Password**: The password for this email account
- ✅ **Account Status**: Is this account active and enabled for sending emails?

**Example Question:**
> "I need an email account for sending automated emails from our ERP system. Can you provide me with:
> - Email address: `noreply@onixgroup.ae`
> - Password for this account
> - Confirmation that the account is active and can send emails"

---

### 2. **SMTP Server Information**
Ask for:
- ✅ **SMTP Host/Server**: What is the SMTP server address?
  - Examples: `smtp.office365.com`, `mail.onixgroup.ae`, `smtp.gmail.com`
- ✅ **SMTP Port**: What port should be used?
  - Usually: `587` (TLS) or `465` (SSL)
- ✅ **Encryption Type**: TLS or SSL?
  - Port 587 = TLS
  - Port 465 = SSL

**Example Question:**
> "What are the SMTP server settings for sending emails from our domain?
> - SMTP server/host address?
> - SMTP port number?
> - Encryption type (TLS or SSL)?"

---

### 3. **Authentication Requirements**
Ask for:
- ✅ **Does the account require App Password?**
  - If Multi-Factor Authentication (MFA) is enabled, you'll need an App Password
  - Regular password won't work if MFA is enabled
- ✅ **Is "Less Secure App Access" needed?**
  - Some older systems require this setting
- ✅ **Are there IP restrictions?**
  - Some email servers only allow connections from specific IP addresses

**Example Question:**
> "Does the email account have Multi-Factor Authentication enabled?
> If yes, I'll need an App Password instead of the regular password.
> Also, are there any IP restrictions or firewall rules that might block SMTP connections?"

---

### 4. **Domain Information**
Ask for:
- ✅ **Email Domain**: `onixgroup.ae`
- ✅ **Email Provider**: Who hosts your email?
  - Microsoft 365 / Office 365
  - Google Workspace
  - cPanel / WHM
  - Other hosting provider
- ✅ **Can we use `noreply@onixgroup.ae`?**
  - Or do they want a different address like `erp@onixgroup.ae` or `system@onixgroup.ae`?

**Example Question:**
> "What email provider/hosting service do we use for `@onixgroup.ae` emails?
> Can I use `noreply@onixgroup.ae` for automated system emails, or should I use a different address?"

---

## 📋 Complete Checklist for IT Request

Copy and send this to your IT department:

```
Subject: Email Configuration Request for ERP System

Hi IT Team,

I need email configuration details to set up automated email sending 
from our ERP system (for OTP login codes, notifications, etc.).

Please provide the following information:

1. EMAIL ACCOUNT:
   - Email address: (e.g., noreply@onixgroup.ae)
   - Password: (or App Password if MFA is enabled)
   - Is the account active and enabled for sending?

2. SMTP SERVER SETTINGS:
   - SMTP Host/Server: (e.g., smtp.office365.com or mail.onixgroup.ae)
   - SMTP Port: (usually 587 or 465)
   - Encryption: TLS or SSL?

3. AUTHENTICATION:
   - Is Multi-Factor Authentication (MFA) enabled?
   - Do I need an App Password instead of regular password?
   - Are there any IP restrictions for SMTP access?

4. DOMAIN INFO:
   - Email provider: (Microsoft 365, Google Workspace, cPanel, etc.)
   - Preferred sender email address for system emails

Thank you!
```

---

## 🔍 Common Email Provider Configurations

### Microsoft 365 / Office 365
```
SMTP Host: smtp.office365.com
Port: 587
Encryption: TLS
Requires: App Password if MFA enabled
```

### Google Workspace
```
SMTP Host: smtp.gmail.com
Port: 587
Encryption: TLS
Requires: App Password (always required)
```

### cPanel / WHM Email
```
SMTP Host: mail.onixgroup.ae (or smtp.onixgroup.ae)
Port: 587 or 465
Encryption: TLS (port 587) or SSL (port 465)
Requires: Regular password usually works
```

---

## ⚠️ Important Questions to Ask

1. **"Can I use `noreply@onixgroup.ae` or should I use a different address?"**
   - Some companies prefer `erp@`, `system@`, or `notifications@`

2. **"Is there a daily sending limit?"**
   - Some email accounts have limits (e.g., 500 emails/day for Gmail free)

3. **"Do I need to whitelist any IP addresses?"**
   - Your server's IP might need to be added to allowed list

4. **"What happens if the account password changes?"**
   - How will you be notified to update the configuration?

5. **"Is there a test email account I can use first?"**
   - Good to test with a non-critical account first

---

## 📝 What to Provide IT (If They Ask)

If IT asks what you need this for, tell them:

> "We need to send automated emails from our ERP system, including:
> - Login OTP codes for passwordless authentication
> - Password reset emails
> - System notifications
> - Employee invitations
> 
> The system uses SMTP protocol to send emails programmatically."

---

## ✅ After You Get the Information

Once IT provides the details, update your `backend/.env` file:

```env
EMAIL_HOST=smtp.office365.com          # From IT
EMAIL_PORT=587                          # From IT
EMAIL_USER=noreply@onixgroup.ae        # From IT
EMAIL_PASS=your-password-or-app-password  # From IT
EMAIL_FROM=noreply@onixgroup.ae        # Usually same as EMAIL_USER
```

Then test the configuration:
```bash
cd backend
node test-smtp-connection.js
```

---

## 🆘 If IT Doesn't Know

If your IT department isn't sure about SMTP settings, ask them to:

1. **Check email client settings** (Outlook, Thunderbird, etc.)
   - SMTP settings are usually visible in account settings

2. **Check hosting provider documentation**
   - cPanel: Check Email Accounts section
   - Microsoft 365: Check Exchange Admin Center
   - Google Workspace: Check Admin Console

3. **Contact email hosting provider**
   - If email is hosted externally, contact the provider

---

## 📞 Quick Reference

**What You Need:**
- ✅ Email address
- ✅ Password (or App Password)
- ✅ SMTP server address
- ✅ SMTP port
- ✅ Encryption type

**What IT Needs to Know:**
- Purpose: Automated emails from ERP system
- Type: SMTP protocol
- Volume: Low to medium (depends on usage)

---

**Good luck! Once you have this information, email configuration will be straightforward.** 📧
