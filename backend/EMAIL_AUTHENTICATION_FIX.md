# 🔧 Email Authentication Fix Guide

## Problem
SMTP authentication is failing with error: `535 5.7.3 Authentication unsuccessful`

## Current Configuration
```
EMAIL_HOST=smtp.office365.com
EMAIL_PORT=587
EMAIL_USER=noreply@onixgroup.ae
EMAIL_PASS=DXB$onix2024
```

## Solutions

### Option 1: Verify Password
1. Try logging into `noreply@onixgroup.ae` via webmail
2. Confirm the password is correct
3. Make sure there are no typos

### Option 2: Use App Password (If MFA Enabled)
If the account has Multi-Factor Authentication (MFA) enabled:

1. **For Microsoft 365:**
   - Go to: https://account.microsoft.com/security
   - Sign in with `noreply@onixgroup.ae`
   - Go to **Security** → **Advanced security options**
   - Under **App passwords**, create a new app password
   - Use that app password in `.env` instead of regular password

2. **Update `.env`:**
   ```env
   EMAIL_PASS=your-app-password-here
   ```

### Option 3: Check Account Settings
1. Verify the account exists and is active
2. Check if SMTP access is enabled for this account
3. Contact your IT admin to verify account permissions

### Option 4: Try Different SMTP Host
If `noreply@onixgroup.ae` is hosted on a different server:

**For cPanel/WHM Email:**
```env
EMAIL_HOST=mail.onixgroup.ae
EMAIL_PORT=587
EMAIL_USER=noreply@onixgroup.ae
EMAIL_PASS=DXB$onix2024
```

**For Google Workspace:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=noreply@onixgroup.ae
EMAIL_PASS=your-app-password
```

### Option 5: Test with Different Email Account
If you have another email account that works, test with that first:

```env
EMAIL_USER=your-working-email@onixgroup.ae
EMAIL_PASS=your-working-password
```

## Testing
After making changes, test the connection:
```bash
cd backend
node test-smtp-connection.js
```

## Common Issues

### Issue: Password Contains Special Characters
If password has `$`, `#`, `@`, etc., make sure they're properly escaped in `.env`:
- No quotes needed usually
- If issues persist, try wrapping in quotes: `EMAIL_PASS="DXB$onix2024"`

### Issue: Account Restrictions
- Check if account has "Less secure app access" enabled (for older systems)
- Verify account isn't locked or suspended
- Check if IP restrictions are blocking your connection

### Issue: Wrong SMTP Server
- Contact your email administrator to confirm SMTP server
- Check email client settings (Outlook, etc.) for SMTP details
- Try `mail.onixgroup.ae` or `smtp.onixgroup.ae` instead

## Next Steps
1. Verify password with email administrator
2. Try creating App Password if MFA is enabled
3. Test with test script: `node test-smtp-connection.js`
4. Check backend logs for detailed error messages
