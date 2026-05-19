require('dotenv').config();

const cors = require('cors');
const Database = require('better-sqlite3');
const express = require('express');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');
const PDFDocument = require('pdfkit');
const session = require('express-session');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');
const BILL_OUTPUT_DIR = path.join(__dirname, 'generated-bills');
const DB_PATH = path.join(DATA_DIR, 'bijonsikha.db');
const BILL_LOGO_PATH = path.join(ROOT_DIR, 'companylogo', 'medmitra', 'bijonsikha.jpg');
const BILL_EMAIL_RECIPIENTS = [
  'arnab.c@bijonsikha.com',
  'partha.c2005@rediffmail.com',
];

const DEFAULT_ADMIN_EMAIL = 'customercare@bijonsikha.com';
const ADMIN_EMAIL_ALIASES = [
  DEFAULT_ADMIN_EMAIL,
  'customercare@bijonsikhal.com',
].map((value) => value.toLowerCase());

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BILL_OUTPUT_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    message TEXT NOT NULL,
    emailed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS generated_bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_name TEXT NOT NULL,
    member_address TEXT NOT NULL,
    care_plan_name TEXT NOT NULL,
    membership_duration TEXT NOT NULL,
    doctor_visits TEXT NOT NULL,
    membership_amount TEXT NOT NULL,
    escort_charges TEXT NOT NULL,
    total_amount TEXT NOT NULL,
    mode_of_payment TEXT NOT NULL,
    service_tenure TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const saveSubmission = db.prepare(`
  INSERT INTO submissions (name, email, phone, message)
  VALUES (@name, @email, @phone, @message)
`);

const markSubmissionEmailed = db.prepare(`
  UPDATE submissions
  SET emailed = 1
  WHERE id = ?
`);

const getDashboardSummary = db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM submissions) AS totalSubmissions,
    (SELECT COUNT(*) FROM submissions WHERE emailed = 1) AS emailedSubmissions,
    (SELECT COUNT(*) FROM generated_bills) AS totalBills
`);

const getRecentSubmissions = db.prepare(`
  SELECT id, name, email, phone, message, emailed, created_at AS createdAt
  FROM submissions
  ORDER BY datetime(created_at) DESC
  LIMIT 8
`);

const saveGeneratedBill = db.prepare(`
  INSERT INTO generated_bills (
    member_name,
    member_address,
    care_plan_name,
    membership_duration,
    doctor_visits,
    membership_amount,
    escort_charges,
    total_amount,
    mode_of_payment,
    service_tenure
  ) VALUES (
    @memberName,
    @memberAddress,
    @carePlanName,
    @membershipDuration,
    @doctorVisits,
    @membershipAmount,
    @escortCharges,
    @totalAmount,
    @modeOfPayment,
    @serviceTenure
  )
`);

const transporter =
  process.env.EMAIL_USER && process.env.EMAIL_PASS
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      })
    : null;

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'bijonsikha-local-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function requireAdmin(req, res, next) {
  if (!req.session?.isAdmin) {
    return res.status(401).json({
      success: false,
      message: 'Please sign in to access the admin dashboard.',
    });
  }

  return next();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFilename(value) {
  return String(value || 'member')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^-+|-+$/g, '')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'member';
}

function getTimestampForFilename() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}

function createBillPdf(payload) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 42,
      bufferPages: true,
    });

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const {
      memberName,
      memberAddress,
      carePlanName,
      membershipDuration,
      doctorVisits,
      membershipAmount,
      escortCharges,
      totalAmount,
      modeOfPayment,
      serviceTenure,
      billDate,
    } = payload;

    const companyAddress = [
      'Building No./Flat No.: A 10/2',
      'Road/Street: NA',
      'Locality/Sub Locality: Purba Diganta, Santoshpur',
      'City: Kolkata',
      'State: West Bengal',
      'PIN Code: 700075',
    ];

    const rows = [
      ['Company Name', 'BijonSikha'],
      ['Company Website', 'www.bijonsikha.com'],
      ['Customer Support', 'customercare@bijonsikha.com'],
      ['Venue', 'Kolkata'],
      ['Bill Date', billDate],
      ['Member Name', memberName],
      ['Member Address', memberAddress],
      ['Care Plan Name', carePlanName],
      ['Membership Duration', membershipDuration],
      ['Doctor Visits', doctorVisits],
      ['Membership Amount', membershipAmount],
      ['Escort Charges', escortCharges],
      ['Total Amount', totalAmount],
      ['Mode of Payment', modeOfPayment],
      ['Service Tenure', serviceTenure],
      ['Company Address', companyAddress.join('\n')],
    ];

    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(24).text('BijonSikha', 42, 36);
    doc.font('Helvetica').fontSize(10).fillColor('#475569');
    doc.text('Compassionate elder care, beautifully coordinated', 42, 64);

    if (fs.existsSync(BILL_LOGO_PATH)) {
      doc.image(BILL_LOGO_PATH, 395, 18, {
        fit: [155, 82],
        align: 'right',
        valign: 'top',
      });
    }

    doc.roundedRect(42, 96, 528, 34, 10).fill('#dbeafe');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(14).text('ELECTRONIC BILL', 42, 107, {
      width: 528,
      align: 'center',
    });

    let y = 148;
    const leftX = 42;
    const rightX = 230;
    const tableWidth = 340;
    const gap = 10;

    rows.forEach(([label, value], index) => {
      const labelHeight = doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .heightOfString(`${label}:`, { width: 170 });
      const valueHeight = doc
        .font('Helvetica')
        .fontSize(10)
        .heightOfString(String(value), { width: tableWidth - gap * 2 });
      const rowHeight = Math.max(30, labelHeight, valueHeight) + 12;

      if (index % 2 === 0) {
        doc.roundedRect(leftX, y, 528, rowHeight, 0).fill('#f8fafc');
      }

      doc
        .fillColor('#0f172a')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`${label}:`, leftX + gap, y + 8, { width: 170 });

      doc
        .fillColor('#334155')
        .font('Helvetica')
        .fontSize(10)
        .text(String(value), rightX + gap, y + 8, { width: tableWidth - gap * 2 });

      doc
        .lineWidth(0.5)
        .strokeColor('#cbd5e1')
        .moveTo(leftX, y + rowHeight)
        .lineTo(leftX + 528, y + rowHeight)
        .stroke();

      y += rowHeight;

      if (y > 680 && index < rows.length - 1) {
        doc.addPage();
        y = 42;
      }
    });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#64748b')
      .text('This bill was generated from the BijonSikha admin dashboard.', 42, 730, {
        align: 'center',
        width: 528,
      });

    doc.end();
  });
}

app.post('/api/submit', async (req, res) => {
  const name = normalizeText(req.body.name);
  const email = normalizeEmail(req.body.email);
  const phone = normalizeText(req.body.phone);
  const message = normalizeText(req.body.message);

  if (!name || !email || !phone || !message) {
    return res.status(400).json({
      success: false,
      message: 'All fields are required.',
    });
  }

  try {
    const result = saveSubmission.run({ name, email, phone, message });

    if (!transporter) {
      console.warn('Email credentials are missing. Submission saved without email notification.');
      return res.status(201).json({
        success: true,
        message: 'Form submitted successfully. Email notifications are not configured yet.',
      });
    }

    await transporter.sendMail({
      from: `"BijonSikha Website" <${process.env.EMAIL_USER}>`,
      to: 'customercare@bijonsikha.com',
      subject: 'New Contact Form Submission',
      html: `
        <h2>New Inquiry from BijonSikha Website</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(phone)}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
      `,
    });

    markSubmissionEmailed.run(result.lastInsertRowid);

    return res.status(201).json({
      success: true,
      message: 'Form submitted successfully.',
    });
  } catch (error) {
    console.error('Error processing submission:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred on the server.',
    });
  }
});

app.post('/api/admin/login', (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = normalizeText(req.body.password);
  const configuredEmail = normalizeEmail(process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL);
  const configuredPassword = normalizeText(process.env.ADMIN_PASSWORD || 'BijonSikha123@');
  const validEmail = email === configuredEmail || ADMIN_EMAIL_ALIASES.includes(email);

  if (!validEmail || password !== configuredPassword) {
    return res.status(401).json({
      success: false,
      message: 'Invalid admin credentials.',
    });
  }

  req.session.isAdmin = true;
  req.session.adminEmail = email;

  return res.json({
    success: true,
    message: 'Admin login successful.',
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.json({
      success: true,
      message: 'Logged out successfully.',
    });
  });
});

app.get('/api/admin/me', (req, res) => {
  if (!req.session?.isAdmin) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated.',
    });
  }

  return res.json({
    success: true,
    adminEmail: req.session.adminEmail,
  });
});

app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
  return res.json({
    success: true,
    summary: getDashboardSummary.get(),
    recentSubmissions: getRecentSubmissions.all(),
  });
});

app.post('/api/admin/bills/generate', requireAdmin, async (req, res) => {
  const payload = {
    billDate: normalizeText(req.body.billDate) || new Date().toLocaleDateString('en-GB'),
    memberName: normalizeText(req.body.memberName),
    memberAddress: normalizeText(req.body.memberAddress),
    carePlanName: normalizeText(req.body.carePlanName),
    membershipDuration: normalizeText(req.body.membershipDuration),
    doctorVisits: normalizeText(req.body.doctorVisits),
    membershipAmount: normalizeText(req.body.membershipAmount),
    escortCharges: normalizeText(req.body.escortCharges),
    totalAmount: normalizeText(req.body.totalAmount),
    modeOfPayment: normalizeText(req.body.modeOfPayment),
    serviceTenure: normalizeText(req.body.serviceTenure),
  };

  const missingField = Object.entries(payload).find(
    ([key, value]) => key !== 'billDate' && !value
  );

  if (missingField) {
    return res.status(400).json({
      success: false,
      message: `Please provide ${missingField[0]}.`,
    });
  }

  try {
    const pdfBuffer = await createBillPdf(payload);
    saveGeneratedBill.run(payload);

    const safeName = sanitizeFilename(payload.memberName);
    const timestamp = getTimestampForFilename();
    const downloadName = `${safeName}_${timestamp}.pdf`;
    const outputPath = path.join(BILL_OUTPUT_DIR, downloadName);
    fs.writeFileSync(outputPath, pdfBuffer);

    if (transporter) {
      await transporter.sendMail({
        from: `"BijonSikha Billing" <${process.env.EMAIL_USER}>`,
        to: BILL_EMAIL_RECIPIENTS.join(', '),
        subject: `BijonSikha Bill | ${payload.memberName} | ${payload.billDate}`,
        html: `
          <h2>BijonSikha Membership Bill</h2>
          <p>Please find the generated bill attached to this email.</p>
          <p><strong>Member Name:</strong> ${escapeHtml(payload.memberName)}</p>
          <p><strong>Care Plan Name:</strong> ${escapeHtml(payload.carePlanName)}</p>
          <p><strong>Total Amount:</strong> ${escapeHtml(payload.totalAmount)}</p>
          <p><strong>Bill Date:</strong> ${escapeHtml(payload.billDate)}</p>
          <p>This email was generated automatically from the BijonSikha admin billing dashboard.</p>
        `,
        attachments: [
          {
            filename: downloadName,
            content: pdfBuffer,
            contentType: 'application/pdf',
          },
        ],
      });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('Failed to generate bill:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate the PDF bill.',
    });
  }
});

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'admin.html'));
});

app.use(express.static(ROOT_DIR));

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Using SQLite database at ${DB_PATH}`);
});
