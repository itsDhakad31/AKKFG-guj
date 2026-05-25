import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create SMTP transporter if environment variables are configured
const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '⚠️ SMTP Configuration missing or incomplete in environment variables. Email notifications will be skipped.'
    );
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for port 465, false for other ports (like 587)
    auth: {
      user,
      pass
    }
  });
};

/**
 * Sends a beautifully styled official approval email to the registrant
 */
export const sendApprovalEmail = async (
  recipientEmail: string,
  registrantName: string,
  role: string,
  uniqueId: string,
  dob: string,
  gender: string
): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log(`[Email Skipped] Would have sent approval email to ${recipientEmail} for ID ${uniqueId}`);
      return false;
    }

    const roleLabel = role === 'Student' ? 'Player' : role === 'Technical' ? 'Technical Team' : role;
    const kkfiId = uniqueId.replace('AKKFG', 'KKFI');
    const nsrsId = uniqueId.replace('AKKFG', 'NSRS');
    const fromAddress = process.env.SMTP_FROM || '"Amateur Kho-Kho Federation Gujarat" <no-reply@akkfg.com>';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Official Registration Approved - AKKFG</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          background-color: #f8fafc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          color: #334155;
          -webkit-font-smoothing: antialiased;
        }
        .container {
          max-w: 600px;
          margin: 40px auto;
          background-color: #ffffff;
          border-radius: 24px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05), 0 4px 6px -4px rgba(0, 0, 0, 0.05);
          overflow: hidden;
          border: 1px solid #e2e8f0;
        }
        .header {
          background-color: #0f172a; /* Slate 900 (akkfg-blue) */
          padding: 32px;
          text-align: center;
          border-bottom: 4px solid #f97316; /* Orange 500 (akkfg-orange) */
        }
        .logo {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .title {
          color: #ffffff;
          font-size: 20px;
          font-weight: 800;
          margin-top: 16px;
          margin-bottom: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .subtitle {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 600;
          margin-top: 4px;
          margin-bottom: 0;
          text-transform: uppercase;
          letter-spacing: 1.5px;
        }
        .content {
          padding: 40px 32px;
        }
        .welcome-msg {
          font-size: 22px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 0;
          margin-bottom: 12px;
        }
        .welcome-text {
          font-size: 15px;
          line-height: 1.6;
          color: #64748b;
          margin-bottom: 32px;
        }
        .id-card {
          background-color: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 32px;
          position: relative;
        }
        .card-header {
          border-bottom: 2px dashed #cbd5e1;
          padding-bottom: 16px;
          margin-bottom: 16px;
          text-align: center;
        }
        .card-role {
          font-size: 12px;
          font-weight: 800;
          color: #f97316;
          text-transform: uppercase;
          letter-spacing: 2px;
          margin: 0;
        }
        .card-name {
          font-size: 20px;
          font-weight: 700;
          color: #0f172a;
          margin: 4px 0 0 0;
        }
        .id-grid {
          margin-bottom: 16px;
        }
        .id-row {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .id-row:last-child {
          border-bottom: none;
        }
        .id-label {
          font-size: 12px;
          font-weight: 700;
          color: #64748b;
          font-family: sans-serif;
        }
        .id-value {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          font-family: monospace, Courier, monospace;
        }
        .detail-row {
          display: inline-block;
          width: 48%;
          box-sizing: border-box;
          margin-top: 12px;
        }
        .detail-label {
          font-size: 10px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          margin: 0;
        }
        .detail-value {
          font-size: 13px;
          font-weight: 700;
          color: #334155;
          margin: 2px 0 0 0;
        }
        .btn-container {
          text-align: center;
          margin-top: 36px;
        }
        .btn {
          display: inline-block;
          background-color: #f97316;
          color: #ffffff !important;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          padding: 16px 36px;
          border-radius: 12px;
          box-shadow: 0 4px 6px -1px rgba(249, 115, 22, 0.2), 0 2px 4px -1px rgba(249, 115, 22, 0.1);
          transition: background-color 0.2s;
        }
        .footer {
          background-color: #f1f5f9;
          padding: 24px;
          text-align: center;
          border-top: 1px solid #e2e8f0;
        }
        .footer-text {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.5;
          margin: 0;
        }
        .footer-links {
          margin-top: 12px;
        }
        .footer-link {
          font-size: 11px;
          color: #64748b;
          text-decoration: none;
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://files.catbox.moe/u0lznd.jpg" alt="AKKFG Logo" class="logo" />
          <div class="title">Amateur Kho-Kho Federation Gujarat</div>
          <div class="subtitle">Official Portal Credentials</div>
        </div>
        <div class="content">
          <h2 class="welcome-msg">Congratulations, ${registrantName}!</h2>
          <p class="welcome-text">
            We are pleased to inform you that your official registration with the **Amateur Kho-Kho Federation Gujarat (AKKFG)** has been reviewed and successfully **Approved**. 
            
            Below are your officially allocated federation credentials and unique identification numbers.
          </p>

          <div class="id-card">
            <div class="card-header">
              <p class="card-role">${roleLabel}</p>
              <h3 class="card-name">${registrantName}</h3>
            </div>
            
            <div class="id-grid">
              <div class="id-row">
                <span class="id-label">AKKFG ID:</span>
                <span class="id-value">${uniqueId}</span>
              </div>
              <div class="id-row">
                <span class="id-label">KKFI ID:</span>
                <span class="id-value">${kkfiId}</span>
              </div>
              <div class="id-row">
                <span class="id-label">NSRS ID:</span>
                <span class="id-value">${nsrsId}</span>
              </div>
            </div>

            <div style="border-top: 1px solid #e2e8f0; padding-top: 8px;">
              <div class="detail-row">
                <p class="detail-label">DOB</p>
                <p class="detail-value">${dob}</p>
              </div>
              <div class="detail-row">
                <p class="detail-label">GENDER</p>
                <p class="detail-value">${gender}</p>
              </div>
            </div>
          </div>

          <p class="welcome-text" style="margin-bottom: 0;">
            You can now log in to your official federation dashboard to view your profile, manage credentials, and download your high-resolution **Official ID Card** directly.
          </p>

          <div class="btn-container">
            <a href="https://akkfg.com" class="btn" target="_blank">Access Your Dashboard</a>
          </div>
        </div>
        <div class="footer">
          <p class="footer-text">
            © 2026 Amateur Kho-Kho Federation Gujarat (AKKFG). All rights reserved.
          </p>
          <p class="footer-text" style="margin-top: 4px;">
            This is an automatically generated official communication. Please do not reply directly to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
    `;

    await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject: `Official Registration Approved - ${uniqueId} - AKKFG`,
      html: htmlContent
    });

    console.log(`[SMTP Success] Sent approval email to ${recipientEmail} for ID ${uniqueId}`);
    return true;
  } catch (err) {
    console.error(`[SMTP Error] Failed to send approval email to ${recipientEmail}:`, err);
    return false;
  }
};
