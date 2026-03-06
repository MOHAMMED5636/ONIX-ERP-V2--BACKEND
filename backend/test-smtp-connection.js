// Quick SMTP Connection Test Script
// Run: node test-smtp-connection.js

require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('🔍 Testing SMTP Configuration...\n');
console.log('SMTP Settings:');
console.log('  Host:', process.env.EMAIL_HOST);
console.log('  Port:', process.env.EMAIL_PORT);
console.log('  User:', process.env.EMAIL_USER);
console.log('  From:', process.env.EMAIL_FROM);
console.log('  Pass:', process.env.EMAIL_PASS ? '***' + process.env.EMAIL_PASS.slice(-4) : 'NOT SET');
console.log('');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  requireTLS: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false,
  },
  debug: true,
  logger: true,
});

async function testConnection() {
  try {
    console.log('📡 Testing SMTP connection...\n');
    
    // Verify connection
    await transporter.verify();
    console.log('✅ SMTP connection successful!\n');
    
    // Try sending a test email
    console.log('📧 Sending test email...\n');
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER, // Send to yourself
      subject: 'Test Email from ONIX ERP',
      html: '<h1>Test Email</h1><p>If you receive this, your SMTP configuration is working correctly!</p>',
    });
    
    console.log('✅ Test email sent successfully!');
    console.log('   Message ID:', info.messageId);
    console.log('   Response:', info.response);
    console.log('\n💡 Check your inbox for the test email.');
    
  } catch (error) {
    console.error('\n❌ SMTP Test Failed:\n');
    console.error('Error Code:', error.code);
    console.error('Error Message:', error.message);
    console.error('Error Response:', error.response);
    console.error('Error Command:', error.command);
    
    console.log('\n💡 Troubleshooting Tips:');
    
    if (error.code === 'EAUTH') {
      console.log('   - Authentication failed');
      console.log('   - Check EMAIL_USER and EMAIL_PASS in .env');
      console.log('   - For Office 365: Make sure you\'re using the correct password');
      console.log('   - For Gmail: Use App Password, not regular password');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      console.log('   - Cannot connect to SMTP server');
      console.log('   - Check EMAIL_HOST and EMAIL_PORT');
      console.log('   - Verify firewall/network allows SMTP connections');
      console.log('   - Try different SMTP hosts:');
      console.log('     * smtp.office365.com (Microsoft 365)');
      console.log('     * mail.onixgroup.ae (cPanel/WHM)');
      console.log('     * smtp.gmail.com (Gmail)');
    } else if (error.code === 'EENVELOPE') {
      console.log('   - Invalid email address');
      console.log('   - Check EMAIL_FROM format');
    }
    
    process.exit(1);
  }
}

testConnection();
