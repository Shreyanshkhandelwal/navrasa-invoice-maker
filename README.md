# NavRasa Invoice Studio

A React + TypeScript frontend and Express + Prisma + PostgreSQL backend for creating and tracking NavRasa invoices. The dashboard, invoice list and client directory use API/database records; there are no hardcoded sample invoice totals or sample invoice rows.

## Requirements
- Node.js 20+
- PostgreSQL
- Google Cloud OAuth credentials only if Google Drive PDF uploads are needed

## Install
From the project root:

```bash
npm install
npm run install:all
```

Keep your existing `server/.env` file. If configuring for the first time, copy `server/.env.example` to `server/.env`, then set `DATABASE_URL` to your local PostgreSQL database. The frontend can optionally use `client/.env` with `VITE_API_URL=http://localhost:4000`.

## Apply the database schema
The current schema adds a persistent client directory and payment tracking fields to invoices. Run this from the `server` directory:

```bash
npx prisma migrate dev --name real_invoice_management
npx prisma generate
```

Existing invoice rows are retained; new fields receive defaults. Dashboard totals will start at zero if there are no actual invoice records. The app intentionally does not seed fake clients or invoices.

## Start the app
From the project root:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- API health check: http://localhost:4000/api/health

## Current working features
- Dashboard totals calculated from saved invoices and payment records.
- Searchable invoice list loaded from PostgreSQL.
- Invoice creation with itemized line items and GST calculations.
- Save invoice records to PostgreSQL and generate a PDF.
- Client directory with create, edit and delete operations.
- Client details entered during invoice creation are also saved for reuse.
- Payment tracking supports partial and full payments; overdue balances are calculated from due dates.
- Optional Google Drive PDF upload when OAuth is configured.

## Company details and invoice compliance
The PDF template uses the company name, address, GSTIN, PAN, contact and bank details visible in the supplied NavRasa invoice reference. Verify every legal and bank detail before issuing invoices. These values are currently template constants, not yet editable through an in-app company settings page. Check GST treatment, SAC/HSN codes, invoice numbering, and disclosures with your accountant.

## Google Drive
1. Enable Google Drive API in Google Cloud Console.
2. Configure OAuth consent screen and create OAuth 2.0 Web application credentials.
3. Add `http://localhost:4000/api/google/callback` as an authorized redirect URI.
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and optionally `GOOGLE_DRIVE_FOLDER_ID` in `server/.env`.
5. Open `http://localhost:4000/api/google/connect` and complete consent.

Tokens are currently stored in a local JSON file for development. Do not commit `.env` or `server/google-tokens.json`.

## Production readiness limitations
This is a local MVP, not yet a secure multi-user SaaS product. Before using it for multiple customers or deploying publicly, add authentication/authorization, tenant isolation, editable company settings, invoice edit/cancel and audit history, backups, deployment secrets, secure OAuth state/token handling, robust invoice numbering, automated tests, and accountant-reviewed tax rules. Never expose this development server publicly as-is.
