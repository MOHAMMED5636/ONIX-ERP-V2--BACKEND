# 📧 Email Configuration Guide - SMTP Setup

## What is SMTP Host?

**SMTP (Simple Mail Transfer Protocol)** is the standard protocol used to send emails over the internet. 

**SMTP Host** is the server address that handles sending your emails. Think of it as the "post office" that delivers your emails.

### Common SMTP Hosts:

| Email Provider | SMTP Host | Port | Security |
|---------------|-----------|------|----------|
| **Gmail** | `smtp.gmail.com` | 587 (TLS) or 465 (SSL) | TLS/SSL |
| **Outlook/Hotmail** | `smtp-mail.outlook.com` | 587 | TLS |
| **Yahoo** | `smtp.mail.yahoo.com` | 587 or 465 | TLS/SSL |
| **Custom Domain** | `smtp.yourdomain.com` | 587 or 465 | TLS/SSL |
| **SendGrid** | `smtp.sendgrid.net` | 587 | TLS |
| **Mailgun** | `smtp.mailgun.org` | 587 | TLS |

---

## 📋 Email Configuration Requirements

To send emails from your ERP system, you need to configure these environment variables in `backend/.env`:

### Required Variables:

```env
EMAIL_HOST=smtp.gmail.com          # SMTP server address
EMAIL_PORT=587                     # Port number (587 for TLS, 465 for SSL)
EMAIL_USER=your-email@gmail.com    # Your email address (username)
EMAIL_PASS=your-app-password       # Your email password or app password
EMAIL_FROM=noreply@onixgroup.ae    # Display "From" address (can be different from EMAIL_USER)
```

---

## 🔧 Setup Instructions by Provider

### Option 1: Gmail Setup (Recommended for Testing)

#### Step 1: Enable 2-Step Verification
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**

#### Step 2: Generate App Password
1. Go to [Google App Passwords](https://myaccount.google.com/apppasswords)
2. Select **Mail** and **Other (Custom name)**
3. Enter name: "ONIX ERP System"
4. Click **Generate**
5. Copy the 16-character password (no spaces)

#### Step 3: Configure `.env` File
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx    # The 16-character app password
EMAIL_FROM=noreply@onixgroup.ae
```

**⚠️ Important:** 
- Use **App Password**, NOT your regular Gmail password
- Remove spaces from the app password when pasting
- Gmail has sending limits: ~500 emails/day for free accounts

---

### Option 2: Outlook/Hotmail Setup

#### Step 1: Enable App Passwords
1. Go to [Microsoft Account Security](https://account.microsoft.com/security)
2. Enable **Two-step verification**
3. Go to **App passwords** section
4. Generate a new app password

#### Step 2: Configure `.env` File
```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASS=your-app-password
EMAIL_FROM=noreply@onixgroup.ae
```

---

### Option 3: Custom Domain Email (Professional Setup)

If you have your own domain (e.g., `onixgroup.ae`), you can use your domain's email:

#### Example: Using cPanel/WHM Email
```env
EMAIL_HOST=mail.onixgroup.ae       # Your domain's mail server
EMAIL_PORT=587
EMAIL_USER=noreply@onixgroup.ae    # Your email account
EMAIL_PASS=your-email-password
EMAIL_FROM=noreply@onixgroup.ae
```

#### Example: Using Microsoft 365 (Office 365)
```env
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_USER=noreply@onixgroup.ae
EMAIL_PASS=your-office365-password
EMAIL_FROM=noreply@onixgroup.ae
```

---

### Option 4: Email Service Providers (Recommended for Production)

#### SendGrid Setup:
1. Sign up at [SendGrid](https://sendgrid.com)
2. Create API Key
3. Verify sender email
4. Configure:

```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey                  # Literally "apikey"
EMAIL_PASS=your-sendgrid-api-key   # Your SendGrid API key
EMAIL_FROM=noreply@onixgroup.ae
```

#### Mailgun Setup:
1. Sign up at [Mailgun](https://www.mailgun.com)
2. Get SMTP credentials from dashboard
3. Configure:

```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=postmaster@your-domain.mailgun.org
EMAIL_PASS=your-mailgun-password
EMAIL_FROM=noreply@onixgroup.ae
```

**Benefits of Email Service Providers:**
- ✅ Higher sending limits (thousands per day)
- ✅ Better deliverability
- ✅ Email analytics and tracking
- ✅ Professional reputation management
- ✅ Free tiers available

---

## 🔍 Current Configuration Check

Your current `.env` file shows:
```env
EMAIL_HOST=smtp.gmail.com          ✅ Set
EMAIL_PORT=587                     ✅ Set
EMAIL_USER=                        ❌ EMPTY - Need to fill this!
EMAIL_PASS=                        ❌ EMPTY - Need to fill this!
EMAIL_FROM=noreply@onixgroup.ae    ✅ Set
```

**⚠️ Action Required:** Fill in `EMAIL_USER` and `EMAIL_PASS` for emails to work!

---

## 🧪 Testing Email Configuration

### Test Script (Create `backend/test-email.js`):

```javascript
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function testEmail() {
  try {
    console.log('Testing email configuration...');
    console.log('Host:', process.env.EMAIL_HOST);
    console.log('Port:', process.env.EMAIL_PORT);
    console.log('User:', process.env.EMAIL_USER);
    console.log('From:', process.env.EMAIL_FROM);
    
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'your-test-email@gmail.com', // Change this to your email
      subject: 'Test Email from ONIX ERP',
      html: '<h1>Email Test Successful!</h1><p>Your email configuration is working correctly.</p>',
    });
    
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
  } catch (error) {
    console.error('❌ Email test failed:');
    console.error('Error:', error.message);
    if (error.code === 'EAUTH') {
      console.error('\n💡 Authentication failed. Check:');
      console.error('   - EMAIL_USER is correct');
      console.error('   - EMAIL_PASS is correct (use App Password for Gmail)');
    }
  }
}

testEmail();
```

**Run test:**
```bash
cd backend
node test-email.js
```

---

## 🔒 Security Best Practices

1. **Never commit `.env` file** to Git (it's already in `.gitignore`)
2. **Use App Passwords** instead of regular passwords
3. **Use environment-specific credentials** (different for dev/production)
4. **Rotate passwords regularly**
5. **Use email service providers** for production (better security & deliverability)

---

## 🚨 Common Issues & Solutions

### Issue 1: "Authentication Failed"
**Solution:**
- For Gmail: Use App Password, not regular password
- Check if 2-Step Verification is enabled
- Verify EMAIL_USER and EMAIL_PASS are correct

### Issue 2: "Connection Timeout"
**Solution:**
- Check firewall/network allows SMTP port (587 or 465)
- Verify EMAIL_HOST is correct
- Try port 465 with `secure: true` in code

### Issue 3: "Gmail Sending Limits Exceeded"
**Solution:**
- Gmail free accounts: ~500 emails/day limit
- Use email service provider (SendGrid, Mailgun) for production
- Or upgrade to Google Workspace

### Issue 4: "Emails Going to Spam"
**Solution:**
- Use professional email service provider
- Set up SPF, DKIM, DMARC records for your domain
- Use verified sender email
- Avoid spam trigger words in subject/content

---

## 📝 Quick Setup Checklist

- [ ] Choose email provider (Gmail for testing, SendGrid/Mailgun for production)
- [ ] Set up authentication (App Password for Gmail)
- [ ] Fill in `EMAIL_USER` in `.env`
- [ ] Fill in `EMAIL_PASS` in `.env`
- [ ] Verify `EMAIL_HOST` matches your provider
- [ ] Verify `EMAIL_PORT` (587 for TLS, 465 for SSL)
- [ ] Set `EMAIL_FROM` to desired sender address
- [ ] Test email sending with test script
- [ ] Restart backend server after changes

---

## 🎯 Recommended Setup for ONIX ERP

### For Development/Testing:
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-personal-email@gmail.com
EMAIL_PASS=your-gmail-app-password
EMAIL_FROM=noreply@onixgroup.ae
```

### For Production:
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASS=your-sendgrid-api-key
EMAIL_FROM=noreply@onixgroup.ae
```

---

## 📚 Additional Resources

- [Nodemailer Documentation](https://nodemailer.com/about/)
- [Gmail App Passwords Guide](https://support.google.com/accounts/answer/185833)
- [SendGrid SMTP Setup](https://docs.sendgrid.com/for-developers/sending-email/getting-started-smtp)
- [Mailgun SMTP Setup](https://documentation.mailgun.com/en/latest/user_manual.html#sending-via-smtp)

---

**Need Help?** Check backend logs when sending emails - they will show specific error messages if configuration is incorrect.
