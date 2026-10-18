import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { requireAuth } from './middleware/auth.js';
import type { AuthenticatedRequest } from './middleware/auth.js';
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';
import { chromium } from 'playwright';

const app = express();
const prisma = new PrismaClient();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://client-cyan-nu-42.vercel.app'
  ],
  credentials: false
}));

app.use(express.json({ limit: '5mb' }));
const PORT = Number(process.env.PORT || 4000);
const tokenPath = path.resolve(process.env.GOOGLE_TOKEN_PATH || './google-tokens.json');
const generatedDir = path.resolve('./generated-invoices');
fs.mkdirSync(generatedDir, { recursive: true });

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'NavRasa Invoice API' }));
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('A secure JWT_SECRET must be configured in server/.env');
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const businessName =
      typeof req.body?.businessName === 'string'
        ? req.body.businessName.trim()
        : '';

    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const password =
      typeof req.body?.password === 'string'
        ? req.body.password
        : '';

    if (!businessName || !email || password.length < 12) {
      return res.status(400).json({
        error:
          'Business name, valid email, and a password of at least 12 characters are required.',
      });
    }

    if (
      businessName.length > 150 ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        error: 'Please provide a valid business name and email address.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email },
      });

      if (existing) {
        throw new Error('EMAIL_ALREADY_REGISTERED');
      }

      const business = await tx.business.create({
        data: { name: businessName },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          businessId: business.id,
        },
      });

      return { user, business };
    });

    const token = jwt.sign(
      { businessId: result.business.id },
      JWT_SECRET,
      {
        subject: result.user.id,
        algorithm: 'HS256',
        expiresIn: '8h',
      }
    );

    return res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
      },
      business: {
        id: result.business.id,
        name: result.business.name,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'EMAIL_ALREADY_REGISTERED'
    ) {
      return res.status(409).json({
        error: 'An account with this email already exists.',
      });
    }

    if ((error as { code?: string })?.code === 'P2002') {
      return res.status(409).json({
        error: 'An account with this email already exists.',
      });
    }

    console.error('Registration failed:', error);

    return res.status(500).json({
      error: 'Could not create your account.',
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : '';

    const password =
      typeof req.body?.password === 'string'
        ? req.body.password
        : '';

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required.',
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { business: true },
    });

    if (!user || !user.businessId || !user.business || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: 'Invalid email or password.',
      });
    }

    const token = jwt.sign(
      { businessId: user.businessId },
      JWT_SECRET,
      {
        subject: user.id,
        algorithm: 'HS256',
        expiresIn: '8h',
      }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
      business: {
        id: user.business.id,
        name: user.business.name,
      },
    });
  } catch (error) {
    console.error('Login failed:', error);

    return res.status(500).json({
      error: 'Could not log in.',
    });
  }
});

const toInvoiceJson = (row: any) => {
  const safeRow = { ...row };
  delete safeRow.pdfPath;
  delete safeRow.driveFileId;
  delete safeRow.driveWebViewLink;

  return {
    ...safeRow,
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    discount: Number(row.discount),
    total: Number(row.total),
    amountPaid: Number(row.amountPaid || 0),
    status:
      row.paymentStatus === 'PAID'
        ? 'Paid'
        : row.dueDate &&
            new Date(row.dueDate) < new Date() &&
            Number(row.amountPaid || 0) < Number(row.total)
          ? 'Overdue'
          : Number(row.amountPaid || 0) > 0
            ? 'Partially paid'
            : 'Pending',
  };
};
const invoiceData = (d: any) => {
  const items = Array.isArray(d.items) ? d.items : [];
  const subtotal = items.reduce((sum: number, i: any) => sum + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.rate) || 0), 0);
  const tax = items.reduce((sum: number, i: any) => sum + Math.max(0, Number(i.qty) || 0) * Math.max(0, Number(i.rate) || 0) * Math.max(0, Number(i.gst) || 0) / 100, 0);
  const discount = Math.max(0, Number(d.discount) || 0);
  return { items, subtotal, tax, discount, total: Math.max(0, subtotal + tax - discount) };
};
const saveClientFromInvoice = async (client: any, businessId: string) => {
  if (typeof client?.name !== 'string' || !client.name.trim()) return;

  const name = client.name.trim();
  const gstin = String(client.gstin || '').trim() || null;
  const existing = await prisma.client.findFirst({
    where: {
      businessId,
      name: { equals: name, mode: 'insensitive' },
      ...(gstin ? { gstin } : {}),
    },
  });

  const data = {
    name,
    address: String(client.address || ''),
    gstin,
    phone: String(client.phone || '') || null,
    email: String(client.email || '') || null,
  };

  if (existing) {
    return prisma.client.update({ where: { id: existing.id }, data });
  }

  return prisma.client.create({ data: { ...data, businessId } });
};

app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const invoices = await prisma.invoice.findMany({
      where: { businessId },
      orderBy: { invoiceDate: 'desc' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const all = invoices.map(toInvoiceJson);
    const totalInvoiced = all.reduce((sum: number, i: any) => sum + i.total, 0);
    const totalPaid = all.reduce((sum: number, i: any) => sum + i.amountPaid, 0);
    const outstanding = all.reduce((sum: number, i: any) => sum + Math.max(0, i.total - i.amountPaid), 0);
    const overdue = all.filter((i: any) => i.dueDate && new Date(i.dueDate) < today && i.total > i.amountPaid);

    return res.json({
      totalInvoiced,
      totalPaid,
      outstanding,
      overdueAmount: overdue.reduce((sum: number, i: any) => sum + Math.max(0, i.total - i.amountPaid), 0),
      invoiceCount: all.length,
      paidCount: all.filter((i: any) => i.paymentStatus === 'PAID').length,
      pendingCount: all.filter(
        (i: any) =>
          i.paymentStatus !== 'PAID' &&
        !(i.dueDate && new Date(i.dueDate) < today)
      ).length,
      overdueCount: overdue.length,
      recentInvoices: all.slice(0, 10),
    });
  } catch (error) {
    console.error('Dashboard failed:', error);
    return res.status(500).json({ error: 'Could not load dashboard data.' });
  }
});

app.get('/api/invoices', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const q = String(req.query.q || '').trim();
    const rows = await prisma.invoice.findMany({
      where: {
        businessId,
        ...(q ? {
          OR: [
            { invoiceNo: { contains: q, mode: 'insensitive' } },
            { clientName: { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: { invoiceDate: 'desc' },
    });
    return res.json(rows.map(toInvoiceJson));
  } catch (error) {
    console.error('Invoice list failed:', error);
    return res.status(500).json({ error: 'Could not load invoices.' });
  }
});

app.post('/api/invoices', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const d = req.body || {};

    if (
      typeof d.invoiceNo !== 'string' || !d.invoiceNo.trim() ||
      typeof d.client?.name !== 'string' || !d.client.name.trim() ||
      !Array.isArray(d.items) || d.items.length === 0
    ) {
      return res.status(400).json({ error: 'Invoice number, client name and at least one item are required.' });
    }

    const invoiceNo = d.invoiceNo.trim();
    const sums = invoiceData(d);
    const amountPaid = Math.max(0, Number(d.amountPaid) || 0);
    const paymentStatus = amountPaid >= sums.total && sums.total > 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID';

    await saveClientFromInvoice(d.client, businessId);
    const row = await prisma.invoice.create({
      data: {
        businessId,
        invoiceNo,
        invoiceDate: new Date(d.date || Date.now()),
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        clientName: d.client.name.trim(),
        clientAddress: d.client.address || '',
        clientGstin: d.client.gstin || null,
        clientPhone: d.client.phone || null,
        clientEmail: d.client.email || null,
        placeOfSupply: d.place || '',
        taxMode: d.taxMode || 'IGST',
        subtotal: sums.subtotal,
        tax: sums.tax,
        discount: sums.discount,
        total: sums.total,
        amountPaid,
        paymentStatus,
        notes: d.notes || null,
        items: sums.items,
      },
    });
    return res.status(201).json(toInvoiceJson(row));
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'That invoice number already exists for this business.' });
    }
    console.error('Invoice creation failed:', error);
    return res.status(500).json({ error: 'Could not save invoice.' });
  }
});


app.put('/api/invoices/:id', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const invoiceId = String(req.params.id);
    const d = req.body || {};

    const current = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
    });

    if (!current) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    if (
      typeof d.invoiceNo !== 'string' ||
      !d.invoiceNo.trim() ||
      typeof d.client?.name !== 'string' ||
      !d.client.name.trim() ||
      !Array.isArray(d.items) ||
      d.items.length === 0
    ) {
      return res.status(400).json({
        error: 'Invoice number, client name and at least one item are required.',
      });
    }

    const allowedWorkStatuses = ['PENDING', 'PARTIAL', 'COMPLETED'];
    const workStatus = String(d.workStatus || current.workStatus || 'PENDING')
      .toUpperCase();

    if (!allowedWorkStatuses.includes(workStatus)) {
      return res.status(400).json({ error: 'Invalid work status.' });
    }

    const sums = invoiceData(d);
    const amountPaid = Number(current.amountPaid);

    // Never silently remove or reduce an existing payment.
    if (amountPaid > sums.total) {
      return res.status(400).json({
        error: 'The revised invoice total cannot be less than the amount already paid.',
      });
    }

    await saveClientFromInvoice(d.client, businessId);

    const updated = await prisma.invoice.update({
      where: { id: current.id },
      data: {
        invoiceNo: d.invoiceNo.trim(),
        invoiceDate: new Date(d.date || current.invoiceDate),
        dueDate: d.dueDate ? new Date(d.dueDate) : null,
        clientName: d.client.name.trim(),
        clientAddress: d.client.address || '',
        clientGstin: d.client.gstin || null,
        clientPhone: d.client.phone || null,
        clientEmail: d.client.email || null,
        placeOfSupply: d.place || '',
        taxMode: d.taxMode || 'IGST',
        subtotal: sums.subtotal,
        tax: sums.tax,
        discount: sums.discount,
        total: sums.total,
        // Preserve the actual amount already received.
        amountPaid,
        paymentStatus:
          amountPaid >= sums.total && sums.total > 0
            ? 'PAID'
            : amountPaid > 0
              ? 'PARTIAL'
              : 'UNPAID',
        workStatus,
        notes: d.notes || null,
        items: sums.items,
      },
    });

    return res.json(toInvoiceJson(updated));
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(409).json({
        error: 'That invoice number already exists for this business.',
      });
    }

    console.error('Invoice update failed:', error);
    return res.status(500).json({ error: 'Could not update invoice.' });
  }
});


app.patch('/api/invoices/:id/work-status', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const workStatus = String(req.body?.workStatus || '').toUpperCase();
    const allowed = ['PENDING', 'PARTIAL', 'COMPLETED'];

    if (!allowed.includes(workStatus)) {
      return res.status(400).json({ error: 'Invalid work status.' });
    }

    const current = await prisma.invoice.findFirst({
      where: { id: String(req.params.id), businessId },
    });

    if (!current) {
      return res.status(404).json({ error: 'Invoice not found.' });
    }

    const workProgress = Number(
      req.body?.workProgress ?? current.workProgress ?? 0
    );

    if (!Number.isInteger(workProgress) ||
        workProgress < 0 || workProgress > 100) {
      return res.status(400).json({
        error: 'Work progress must be a whole percentage from 0 to 100.',
      });
    }

    if (workStatus === 'PARTIAL' &&
        (workProgress < 1 || workProgress > 99)) {
      return res.status(400).json({
        error: 'Partially completed work must be between 1% and 99%.',
      });
    }

    if (workStatus === 'COMPLETED' && workProgress !== 100) {
      return res.status(400).json({
        error: 'Completed work must have 100% progress.',
      });
    }

    if (workStatus === 'PENDING' && workProgress !== 0) {
      return res.status(400).json({
        error: 'Pending work must have 0% progress.',
      });
    }

    const data: any = { workStatus, workProgress };

    if (req.body?.amountPaid !== undefined) {
      const amountPaid = Number(req.body.amountPaid);
      const total = Number(current.total);

      if (!Number.isFinite(amountPaid) ||
          amountPaid < 0 || amountPaid > total) {
        return res.status(400).json({
          error: 'Payment received must be between 0 and the invoice total.',
        });
      }

      data.amountPaid = amountPaid;
      data.paymentStatus =
        amountPaid >= total && total > 0
          ? 'PAID'
          : amountPaid > 0
            ? 'PARTIAL'
            : 'UNPAID';
    }

    const updated = await prisma.invoice.update({
      where: { id: current.id },
      data,
    });

    return res.json(toInvoiceJson(updated));
  } catch (error) {
    console.error('Work status update failed:', error);
    return res.status(500).json({
      error: 'Could not update work status.',
    });
  }
});


   


app.patch('/api/invoices/:id/payment', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const invoiceId = String(req.params.id);
    const current = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
    });
    if (!current) return res.status(404).json({ error: 'Invoice not found.' });

    const amountPaid = Number(req.body?.amountPaid);
    if (!Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > Number(current.total)) {
      return res.status(400).json({ error: 'Paid amount must be between zero and the invoice total.' });
    }
    const paymentStatus = amountPaid >= Number(current.total) ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID';
    const updated = await prisma.invoice.update({ where: { id: current.id }, data: { amountPaid, paymentStatus } });
    return res.json(toInvoiceJson(updated));
  } catch (error) {
    console.error('Payment update failed:', error);
    return res.status(500).json({ error: 'Could not update payment.' });
  }
});

app.get('/api/clients', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const q = String(req.query.q || '').trim();
    const rows = await prisma.client.findMany({
      where: {
        businessId,
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { gstin: { contains: q, mode: 'insensitive' } },
        ] } : {}),
      },
      orderBy: { name: 'asc' },
    });
    return res.json(rows);
  } catch (error) {
    console.error('Client list failed:', error);
    return res.status(500).json({ error: 'Could not load clients.' });
  }
});

app.post('/api/clients', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const d = req.body || {};
    if (typeof d.name !== 'string' || !d.name.trim()) return res.status(400).json({ error: 'Client name is required.' });
    const client = await prisma.client.create({
      data: {
        businessId,
        name: d.name.trim(),
        address: d.address || '',
        gstin: d.gstin || null,
        phone: d.phone || null,
        email: d.email || null,
      },
    });
    return res.status(201).json(client);
  } catch (error) {
    console.error('Client creation failed:', error);
    return res.status(500).json({ error: 'Could not save client.' });
  }
});

app.put('/api/clients/:id', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const d = req.body || {};
    if (typeof d.name !== 'string' || !d.name.trim()) return res.status(400).json({ error: 'Client name is required.' });
    const clientId = String(req.params.id);
    const existing = await prisma.client.findFirst({
      where: { id: clientId, businessId },
});
    if (!existing) return res.status(404).json({ error: 'Client not found.' });
    const updated = await prisma.client.update({
      where: { id: existing.id },
      data: { name: d.name.trim(), address: d.address || '', gstin: d.gstin || null, phone: d.phone || null, email: d.email || null },
    });
    return res.json(updated);
  } catch (error) {
    console.error('Client update failed:', error);
    return res.status(500).json({ error: 'Could not update client.' });
  }
});

app.delete('/api/clients/:id', requireAuth, async (req, res) => {
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const clientId = String(req.params.id);
    const existing = await prisma.client.findFirst({
      where: { id: clientId, businessId },
    });
    if (!existing) return res.status(404).json({ error: 'Client not found.' });
    await prisma.client.delete({ where: { id: existing.id } });
    return res.status(204).end();
  } catch (error) {
    console.error('Client deletion failed:', error);
    return res.status(500).json({ error: 'Could not delete client.' });
  }
});


function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) return null;
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}
async function driveClient() {
  const oauth = getOAuthClient();
  if (!oauth || !fs.existsSync(tokenPath)) return null;
  oauth.setCredentials(JSON.parse(fs.readFileSync(tokenPath, 'utf8')));
  return google.drive({ version: 'v3', auth: oauth });
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money = (n: number) => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:2 }).format(n);
function invoiceHtml(d: any) {
 const logoCandidates = [
    path.resolve(process.cwd(), 'client/public/navrasa-logo.png'),
    path.resolve(process.cwd(), '../client/public/navrasa-logo.png'),
  ];

 const logoPath = logoCandidates.find((file) => fs.existsSync(file));

 const logoHtml = logoPath
    ? `<img src="data:image/png;base64,${fs.readFileSync(logoPath).toString('base64')}" alt="NavRasa" style="width:48px;height:48px;object-fit:contain;display:block;">`
    : '<div class="mark">N</div>';
 const items = Array.isArray(d.items) ? d.items : [];
 const rows = items.map((i:any,idx:number)=>`<tr><td>${idx+1}</td><td>${esc(i.description)}<small>SAC: ${esc(i.sac)}</small></td><td>${Number(i.gst)||0}%</td><td>${money((Number(i.qty)||0)*(Number(i.rate)||0))}</td><td>${money((Number(i.qty)||0)*(Number(i.rate)||0)*(Number(i.gst)||0)/100)}</td><td>${money((Number(i.qty)||0)*(Number(i.rate)||0)*(1+(Number(i.gst)||0)/100))}</td></tr>`).join('');
 const subtotal = items.reduce((s:number,i:any)=>s+(Number(i.qty)||0)*(Number(i.rate)||0),0);
 const tax = items.reduce((s:number,i:any)=>s+(Number(i.qty)||0)*(Number(i.rate)||0)*(Number(i.gst)||0)/100,0);
 const discount = Math.max(0,Number(d.discount)||0), total = Math.max(0,subtotal+tax-discount);
 const split = d.taxMode === 'SPLIT';
 return `<!doctype html><html><head><meta charset="utf-8"><style>
 @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:10px Georgia,serif;color:#202020;margin:0}.topline{font:8px Arial;color:#777;padding-bottom:18px}.head{display:flex;justify-content:space-between;align-items:flex-start}.brand{display:flex;align-items:center;gap:9px}.mark{font:bold 28px Arial;border:2px solid #111;width:35px;height:38px;display:grid;place-items:center}.brand b{font:bold 19px Georgia;letter-spacing:2px;display:block}.brand span{font:9px Arial;letter-spacing:4px}.inv{text-align:right;color:#666;font-size:9px}.inv h1{font:bold 24px Georgia;color:#222;margin:0 0 6px}.rule{height:2px;background:#222;margin:23px 0}.bills{display:grid;grid-template-columns:1fr 1fr;gap:35px;min-height:130px}.bills div{display:flex;flex-direction:column;gap:5px;overflow-wrap:anywhere}.bills b{font:bold 11px Georgia;letter-spacing:1px;margin-bottom:5px}.bills strong{font:bold 12px Georgia}.bills span{font:9px Arial;line-height:1.4}.supply{display:flex;justify-content:space-between;background:#eee;padding:11px;margin:15px 0 18px;font:bold 9px Arial}table{width:100%;border-collapse:collapse}thead{background:#151515;color:#fff}th{font:bold 9px Georgia;padding:10px 6px;text-align:right}th:nth-child(2){text-align:left}td{border:1px solid #ddd;padding:10px 6px;text-align:right;font:9px Arial;vertical-align:top}td:nth-child(2){text-align:left}small{display:block;font-size:8px;color:#666;margin-top:4px}.bottom{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:22px}.bank{display:flex;flex-direction:column;gap:5px}.bank b{font:bold 11px Georgia;letter-spacing:1px}.bank span{font:9px Arial}.totals div{display:flex;justify-content:space-between;padding:4px 0;font:10px Arial}.totals .grand{background:#111;color:#fff;padding:10px;font:bold 12px Georgia;margin-top:6px}.words{margin:22px 0;font-size:11px}.words span{font:9px Arial;color:#777}.terms b{font:bold 11px Georgia;letter-spacing:1px}.terms p{font:9px Georgia;margin:5px 0}.disclaimer{text-align:center;color:#777;font:9px Georgia;line-height:1.7;margin-top:38px}.footer{border-top:1px solid #ddd;margin-top:55px;padding-top:10px;text-align:center;font:8px Arial;color:#777}
 </style></head><body><div class="topline">NavRasa IT Solutions | Jaipur, Rajasthan</div><div class="head"><div class="brand">${logoHtml}<div><b>NAVRASA</b><span>IT SOLUTIONS</span></div></div><div class="inv"><h1>TAX INVOICE</h1><div>Invoice No.: ${esc(d.invoiceNo)}</div><div>Invoice Date: ${esc(d.date)}</div>${d.dueDate?`<div>Due Date: ${esc(d.dueDate)}</div>`:''}</div></div><div class="rule"></div><div class="bills"><div><b>BILLED BY</b><strong>NavRasa IT Solutions</strong><span>Shyam Nagar, Jaipur, Rajasthan, India - 302019</span><span>GSTIN: 08AAZFN3030G1Z2</span><span>PAN: AAZFN3030G</span><span>Email: info@navrasaitsolutions.com</span><span>Phone: +91 63770 67867</span></div><div><b>BILLED TO</b><strong>${esc(d.client?.name)}</strong><span>${esc(d.client?.address)}</span><span>GST Number: ${esc(d.client?.gstin)}</span><span>Contact Details: ${esc(d.client?.phone)}</span></div></div><div class="supply"><span>Country of Supply: India</span><span>Place of Supply: ${esc(d.place)}</span></div><table><thead><tr><th>#</th><th>Item / Description</th><th>GST Rate</th><th>Amount</th><th>${split?'Tax':'IGST'}</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="bottom"><div class="bank"><b>BANK DETAILS</b><span>Account Name: NavRasa IT Solutions</span><span>Account Number: 50200118244157</span><span>IFSC: HDFC0007653</span><span>Account Type: Current</span><span>Bank: HDFC Bank</span><span>UPI ID: navrasa@ybl</span></div><div class="totals"><div><span>Amount</span><b>${money(subtotal)}</b></div>${split?`<div><span>CGST</span><b>${money(tax/2)}</b></div><div><span>SGST</span><b>${money(tax/2)}</b></div>`:`<div><span>IGST</span><b>${money(tax)}</b></div>`}<div><span>Discount</span><b>${money(discount)}</b></div><div class="grand"><b>Total (INR)</b><b>${money(total)}</b></div></div></div><div class="words"><span>Amount in Words: </span><b>${esc(d.amountWords || '')}</b></div><div class="terms"><b>TERMS &amp; CONDITIONS</b><p>1. Payment shall be made within the due date mentioned on this invoice.</p><p>2. GST has been charged as per applicable provisions of the GST Act.</p><p>3. This invoice covers only the services described above.</p><p>4. Any additional work beyond the agreed scope shall be billed separately upon prior approval.</p><p>5. Delayed payments may result in suspension of maintenance services until outstanding dues are cleared.</p></div><div class="disclaimer">This is a computer-generated invoice and does not require a physical signature.<br>For any enquiry, reach out via finance@navrasaitsolutions.com or call +91 63770 67867</div><div class="footer">NavRasa IT Solutions • www.navrasaitsolutions.com</div></body></html>`;
}
app.post('/api/invoices/pdf', requireAuth, async (req, res) => {
  let browser: any;
  try {
    const businessId = (req as AuthenticatedRequest).auth!.businessId;
    const d = req.body || {};
    if (
      typeof d.invoiceNo !== 'string' || !d.invoiceNo.trim() ||
      typeof d.client?.name !== 'string' || !d.client.name.trim() ||
      !Array.isArray(d.items) || d.items.length === 0
    ) {
      return res.status(400).json({ error: 'Invoice number, client name and at least one item are required.' });
    }

    const invoiceNo = d.invoiceNo.trim();
    const { items, subtotal, tax, discount, total } = invoiceData(d);
    const amountPaid = Math.max(0, Number(d.amountPaid) || 0);
    if (amountPaid > total) return res.status(400).json({ error: 'Paid amount cannot exceed the invoice total.' });
    const paymentStatus = amountPaid >= total && total > 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID';

    await saveClientFromInvoice(d.client, businessId);
    const html = invoiceHtml({ ...d, subtotal, tax, total });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    await browser.close();
    browser = undefined;

    const safeBusinessId = businessId.replace(/[^a-zA-Z0-9_-]/g, '-');
    const safeInvoiceNo = invoiceNo.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${safeBusinessId}-${safeInvoiceNo}.pdf`;
    const filePath = path.join(generatedDir, filename);
    fs.writeFileSync(filePath, pdf);

    const invoiceFields = {
      invoiceDate: new Date(d.date || Date.now()),
      dueDate: d.dueDate ? new Date(d.dueDate) : null,
      clientName: d.client.name.trim(),
      clientAddress: d.client.address || '',
      clientGstin: d.client.gstin || null,
      clientPhone: d.client.phone || null,
      clientEmail: d.client.email || null,
      amountPaid,
      paymentStatus,
      notes: d.notes || null,
      placeOfSupply: d.place || '',
      taxMode: d.taxMode || 'IGST',
      subtotal,
      tax,
      discount,
      total,
      items,
      pdfPath: filePath,
    };

    const record = await prisma.invoice.upsert({
      where: { businessId_invoiceNo: { businessId, invoiceNo } },
      update: invoiceFields,
      create: { businessId, invoiceNo, ...invoiceFields },
    });

    // Google Drive currently uses one local development OAuth token. Keep it disabled
    // for multi-tenant use until credentials are stored separately per business.
    try {
      if (process.env.ENABLE_SHARED_GOOGLE_DRIVE_FOR_LOCAL_DEV === 'true') {
        const drive = await driveClient();
        if (drive) {
          const uploaded = await drive.files.create({
            requestBody: {
              name: filename,
              mimeType: 'application/pdf',
              parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : undefined,
            },
            media: { mimeType: 'application/pdf', body: fs.createReadStream(filePath) },
            fields: 'id,name,webViewLink',
          });
          await prisma.invoice.update({
            where: { id: record.id },
            data: { driveFileId: uploaded.data.id || null, driveWebViewLink: uploaded.data.webViewLink || null },
          });
        }
      }
    } catch (error) {
      console.error('Google Drive upload failed; invoice remains saved locally:', error);
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdf);
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    console.error('PDF generation failed:', error);
    return res.status(500).json({ error: 'PDF generation failed. Check server logs and Playwright browser installation.' });
  }
});
app.get('/api/google/connect', requireAuth, (req,res) => {
 const oauth=getOAuthClient(); if(!oauth)return res.status(503).send('Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in server/.env first.');
 const url=oauth.generateAuthUrl({access_type:'offline',prompt:'consent',scope:['https://www.googleapis.com/auth/drive.file']});
 res.redirect(url);
});
app.get('/api/google/callback',async(req,res)=>{
 const oauth=getOAuthClient(); if(!oauth)return res.status(503).send('Google OAuth is not configured.');
 try { const code=String(req.query.code||'');const {tokens}=await oauth.getToken(code);fs.writeFileSync(tokenPath,JSON.stringify(tokens,null,2),{mode:0o600});res.send('Google Drive connected for local development. You can close this page and return to Invoice Studio.'); }
 catch(e){console.error(e);res.status(500).send('Google OAuth failed. Check server logs and OAuth redirect URI.');}
});
app.listen(PORT,()=>console.log(`NavRasa Invoice API listening on http://localhost:${PORT}`));
process.on('SIGINT',async()=>{await prisma.$disconnect();process.exit(0);});
