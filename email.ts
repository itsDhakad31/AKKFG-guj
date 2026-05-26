import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import { jsPDF } from 'jspdf';

dotenv.config();

// Create SMTP transporter if environment variables are configured
const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // Skip SMTP initialization if credentials are missing or default placeholders are found
  if (
    !host || 
    !user || 
    !pass || 
    user === 'your-email@gmail.com' || 
    pass === 'your-app-password'
  ) {
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

// Helper to fetch remote image and convert to Base64 (with fast timeout abort)
async function fetchImageAsBase64(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000); // 2-second timeout

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.log(`[ID Card Generation] Fetch failed/timed out for image: ${url.substring(0, 80)}... Reason: ${err.message || err}`);
    return null;
  }
}

/**
 * Generates a high-quality, professional PDF ID Card matching the frontend styling exactly
 */
export const generateIDCardPDF = async (data: any): Promise<Buffer> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: [380, 640]
  });

  // 1. Draw premium background & brand accents
  // White card base
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 380, 640, 'F');

  // Navy Blue header block (#1E3A8A)
  doc.setFillColor(30, 58, 138);
  doc.rect(0, 0, 380, 95, 'F');

  // Orange divider line (#f57e20)
  doc.setFillColor(245, 126, 32);
  doc.rect(0, 95, 380, 5, 'F');

  // 2. Fetch and embed Logo (AKKFG official round logo)
  const logoUrl = 'https://files.catbox.moe/u0lznd.jpg';
  const logoBase64 = await fetchImageAsBase64(logoUrl);
  if (logoBase64) {
    doc.addImage(logoBase64, 'JPEG', 20, 20, 55, 55);
  } else {
    // Premium fallback vector logo badge
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(245, 126, 32);
    doc.setLineWidth(2);
    doc.circle(47.5, 47.5, 27.5, 'FD');
    
    doc.setTextColor(30, 58, 138);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('AKKFG', 47.5, 51, { align: 'center' });
  }

  // 3. Header text
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('AMATEUR KHO KHO', 85, 35);
  doc.text('FEDERATION GUJARAT', 85, 52);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225); // Light slate
  doc.text('Bhau Kale Lane, Nr. Thakorbhai Hospital, Vadodara-390001', 85, 68);

  // 4. Card Type Title Banner
  const roleLabel = data.role === 'Student' ? 'PLAYER' : data.role === 'Technical' ? 'TECHNICAL OFFICIAL' : data.role.toUpperCase();
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${roleLabel} I-CARD`, 190, 130, { align: 'center' });

  // 5. Fetch and embed User Photo
  const photoBase64 = await fetchImageAsBase64(data.doc_photo);
  
  // Photo frame border
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1.5);
  doc.rect(130, 150, 120, 144, 'D');

  if (photoBase64) {
    doc.addImage(photoBase64, 'JPEG', 131, 151, 118, 142);
  } else {
    // Elegant fallback Vector Silhouette
    doc.setFillColor(241, 245, 249); // slate-100 background
    doc.rect(131, 151, 118, 142, 'F');
    
    doc.setFillColor(148, 163, 184); // slate-400 for silhouette
    // Head circle
    doc.circle(190, 205, 24, 'F');
    // Body curve (shoulder ellipse)
    doc.ellipse(190, 260, 42, 28, 'F');
  }

  // 6. User Full Name
  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17.5);
  doc.text(data.name.toUpperCase(), 190, 315, { align: 'center' });

  // 7. Details Table / List (DOB, Gender, UID, KKFI, NSRS)
  doc.setFontSize(13);
  doc.setTextColor(30, 58, 138);
  
  // DOB & Gender
  doc.setFont('helvetica', 'bold');
  doc.text('D.O.B. :', 105, 345);
  doc.text('GENDER :', 105, 365);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(data.dob, 160, 345);
  doc.text(data.gender.toUpperCase(), 170, 365);

  // UID Box (matching front-end pill accent)
  // Draw pill background
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(1.5);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(100, 385, 180, 26, 13, 13, 'D');
  // Fill text inside UID
  doc.setFillColor(30, 58, 138);
  doc.roundedRect(100, 385, 55, 26, 13, 13, 'F');
  // Fix the right-edge corners of UID block so it's a clean pill divide
  doc.rect(125, 385, 30, 26, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('UID', 127, 402, { align: 'center' });

  doc.setTextColor(30, 58, 138);
  doc.setFont('courier', 'bold');
  doc.setFontSize(13);
  doc.text(data.unique_id || 'PENDING', 165, 402);

  // Secondary IDs (KKFI, NSRS)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(13);
  doc.text('KKFI ID :', 105, 435);
  doc.text('NSRS ID :', 105, 455);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(data.kkfi_id || 'PENDING', 165, 435);
  doc.text(data.nsrs_id || 'PENDING', 165, 455);

  // 8. Authorized Signatures Bottom Banner
  doc.setDrawColor(226, 232, 240); // Slate 200 divider
  doc.setLineWidth(1);
  doc.line(40, 530, 340, 530);

  doc.setTextColor(30, 58, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PRESIDENT', 85, 560, { align: 'center' });
  doc.text('SECRETARY', 295, 560, { align: 'center' });

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
};

/**
 * Sends a beautifully styled official approval email to the registrant with ID card attached
 */
export const sendApprovalEmail = async (
  recipientEmail: string,
  registrantName: string,
  role: string,
  uniqueId: string,
  dob: string,
  gender: string,
  kkfiId?: string,
  nsrsId?: string,
  photoUrl?: string
): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log(`[Email Skipped] Would have sent approval email to ${recipientEmail} for ID ${uniqueId}`);
      return false;
    }

    const roleLabel = role === 'Student' ? 'Player' : role === 'Technical' ? 'Technical Official' : role;
    const finalKkfiId = kkfiId || 'PENDING';
    const finalNsrsId = nsrsId || 'PENDING';
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
            
            Below are your officially allocated federation credentials and unique identification numbers. We have also generated and attached your high-resolution **Official ID Card (PDF)** directly to this email for your convenience.
          </p>

          <div class="id-card">
            <div class="card-header">
              <p class="card-role">${roleLabel}</p>
              <h3 class="card-name">${registrantName}</h3>
            </div>
            
            <div class="id-grid">
              <div class="id-row">
                <span class="id-label">UID:</span>
                <span class="id-value">${uniqueId}</span>
              </div>
              <div class="id-row">
                <span class="id-label">KKFI ID:</span>
                <span class="id-value">${finalKkfiId}</span>
              </div>
              <div class="id-row">
                <span class="id-label">NSRS ID:</span>
                <span class="id-value">${finalNsrsId}</span>
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
            You can now log in to your official federation dashboard to view your profile, manage credentials, and download your ID Card at any time.
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

    // Generate PDF dynamically in memory
    console.log(`[SMTP] Generating ID Card PDF for ${registrantName} (${uniqueId})...`);
    const pdfBuffer = await generateIDCardPDF({
      name: registrantName,
      role,
      unique_id: uniqueId,
      dob,
      gender,
      kkfi_id: kkfiId,
      nsrs_id: nsrsId,
      doc_photo: photoUrl
    });

    await transporter.sendMail({
      from: fromAddress,
      to: recipientEmail,
      subject: `Official Registration Approved - ${uniqueId} - AKKFG`,
      html: htmlContent,
      attachments: [
        {
          filename: `AKKFG_ID_Card_${uniqueId}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    console.log(`[SMTP Success] Sent approval email with ID Card attachment to ${recipientEmail} for ID ${uniqueId}`);
    return true;
  } catch (err) {
    console.error(`[SMTP Error] Failed to send approval email to ${recipientEmail}:`, err);
    return false;
  }
};

/**
 * Sends an officially styled rejection email to the registrant
 */
export const sendDeclineEmail = async (
  recipientEmail: string,
  registrantName: string,
  role: string
): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    if (!transporter) {
      console.log(`[Email Skipped] Would have sent decline email to ${recipientEmail}`);
      return false;
    }

    const roleLabel = role === 'Student' ? 'Player' : role === 'Technical' ? 'Technical Official' : role;
    const fromAddress = process.env.SMTP_FROM || '"Amateur Kho-Kho Federation Gujarat" <no-reply@akkfg.com>';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Registration Application Status - AKKFG</title>
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
          margin-bottom: 24px;
        }
        .decline-box {
          background-color: #fff1f2;
          border: 1px solid #ffe4e6;
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 32px;
        }
        .decline-title {
          font-size: 16px;
          font-weight: 800;
          color: #be123c;
          text-transform: uppercase;
          margin: 0 0 8px 0;
        }
        .decline-text {
          font-size: 14px;
          color: #9f1239;
          line-height: 1.5;
          margin: 0;
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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="https://files.catbox.moe/u0lznd.jpg" alt="AKKFG Logo" class="logo" />
          <div class="title">Amateur Kho-Kho Federation Gujarat</div>
          <div class="subtitle">Official Portal Notification</div>
        </div>
        <div class="content">
          <h2 class="welcome-msg">Dear ${registrantName},</h2>
          <p class="welcome-text">
            Thank you for submitting your registration application for the role of **${roleLabel}** with the **Amateur Kho-Kho Federation Gujarat (AKKFG)**.
          </p>

          <div class="decline-box">
            <h3 class="decline-title">Application Status Update</h3>
            <p class="decline-text">
              After careful review of your registration documents and details, we regret to inform you that your application has been **Declined** at this time. 
            </p>
          </div>

          <p class="welcome-text">
            This decision is usually due to incomplete documentation, mismatched details, or unreadable ID proofs. We encourage you to log back into the portal, review the documents you uploaded, and submit a new, corrected application.
          </p>

          <p class="welcome-text" style="margin-bottom: 0;">
            If you believe this was an error, or if you have any questions regarding your application requirements, please feel free to reach out to our support team at **amateurkhokhofederationgujarat@gmail.com**.
          </p>
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
      subject: `Registration Application Update - AKKFG`,
      html: htmlContent
    });

    console.log(`[SMTP Success] Sent decline email to ${recipientEmail}`);
    return true;
  } catch (err) {
    console.error(`[SMTP Error] Failed to send decline email to ${recipientEmail}:`, err);
    return false;
  }
};
