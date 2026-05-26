import { sendApprovalEmail, sendDeclineEmail } from './email';
import dotenv from 'dotenv';

dotenv.config();

async function testEmailFlow() {
  const testEmail = process.env.SMTP_USER && process.env.SMTP_USER !== 'your-email@gmail.com'
    ? process.env.SMTP_USER
    : 'test-recipient@example.com';

  console.log('--------------------------------------------------');
  console.log('AKKFG automated email workflow validation test');
  console.log(`Target Recipient Email: ${testEmail}`);
  console.log('--------------------------------------------------\n');

  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';

  if (!smtpUser || smtpUser === 'your-email@gmail.com' || !smtpPass || smtpPass === 'your-app-password') {
    console.log('⚠️  [TEST REPORT] SMTP Configuration contains default placeholder credentials.');
    console.log('   Please configure real SMTP credentials in your .env file to enable live email delivery.');
    console.log('   Testing dry-run flow...\n');
  }

  // 1. Test Approval with ID Card PDF Attachment
  console.log('1. Initiating "Approval Email" with dynamic ID Card PDF generation...');
  try {
    const approved = await sendApprovalEmail(
      testEmail,
      'John Doe',
      'Student',
      'AKKFG-S-0418',
      '15/08/2005',
      'Male',
      'KKFI-9988',
      'NSRS-7766',
      'https://files.catbox.moe/vl5lw8.jpg' // Test picture
    );

    if (approved) {
      console.log('✅ Success: Approval email sent successfully with dynamic PDF attachment!\n');
    } else {
      console.log('ℹ️  Skipped/Failed: Email was skipped (incomplete configuration) or failed to send.\n');
    }
  } catch (err: any) {
    console.error('❌ Error: Exception occurred while sending approval email:', err.message || err);
  }

  // 2. Test Decline/Rejection Email
  console.log('2. Initiating "Decline Email" workflow...');
  try {
    const declined = await sendDeclineEmail(
      testEmail,
      'John Doe',
      'Student'
    );

    if (declined) {
      console.log('✅ Success: Decline email sent successfully!\n');
    } else {
      console.log('ℹ️  Skipped/Failed: Email was skipped (incomplete configuration) or failed to send.\n');
    }
  } catch (err: any) {
    console.error('❌ Error: Exception occurred while sending decline email:', err.message || err);
  }

  console.log('--------------------------------------------------');
  console.log('End of validation test');
  console.log('--------------------------------------------------');
}

testEmailFlow();
