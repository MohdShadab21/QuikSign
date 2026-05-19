# QuikSign

A Next.js (App Router) e-signature service: upload PDFs, build envelopes, send
to recipients, sign in the browser, and produce a tamper-evident signed packet.

## Stack

- Next.js 16 (Turbopack) · React 19 · Tailwind v4
- Prisma + PostgreSQL
- Cloudinary (raw authenticated PDF storage)
- `pdf-lib` for in-place PDF stamping, `@react-pdf/renderer` for certificates
- `react-pdf` for the browser preview, self-hosted pdf.js worker
- Nodemailer SMTP for invites + completion emails

## Local development

```bash
cp .env.example .env   # fill in DATABASE_URL, CLOUDINARY_*, SMTP_*
npm install
npx prisma migrate dev
npm run dev            # serves on http://localhost:3030
```

`postinstall` and `prebuild` copy `pdf.worker.min.mjs` into `/public` so
react-pdf serves the worker from your own origin (no CDN dependency).

## Deployment (Vercel)

1. Push the repo to GitHub.
2. In Vercel, **New Project → Import** the repo. Framework auto-detects as Next.js.
3. Add the env vars from `.env.example`. At minimum:
   - `DATABASE_URL` (Neon / Supabase / Railway pooled URL)
   - `NEXT_PUBLIC_APP_URL` = `https://your-app.vercel.app`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_PROVIDER`
4. **Build & deploy.** `vercel.json` allocates 60s / 1024MB to the PDF-heavy
   routes (envelope create, sign, download, packet, sign-documents save).
5. Run `prisma migrate deploy` once against your prod DB (use the Vercel CLI
   or a one-off job).

### Caveats on serverless

- `.docx` uploads work via a mammoth text-only fallback. Page layout will differ
  from Microsoft Word. Upload a PDF for a faithful layout.
- `.doc` (legacy binary) is rejected on Vercel — install LibreOffice on a
  self-hosted server and set `LIBRE_OFFICE_EXE` if you need it.

## Smoke tests

PowerShell scripts in `scripts/` exercise the public API surface against a
running dev server. See `scripts/smoke-test-api.ps1` for the entry point.
