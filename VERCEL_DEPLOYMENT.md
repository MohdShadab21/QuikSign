# Deploy QuikSign on Vercel

This guide walks you through deploying QuikSign from scratch on [Vercel](https://vercel.com). Allow about 30–60 minutes the first time (mostly waiting on accounts and DNS).

---

## What you need before you start

| Service | Purpose |
|--------|---------|
| **GitHub** (or GitLab / Bitbucket) | Host your code so Vercel can build from it |
| **PostgreSQL** | App database (Neon, Supabase, or Railway recommended) |
| **Cloudinary** | Store PDFs and signed documents |
| **SMTP** | Send signing invites and completion emails (Gmail, Outlook, SendGrid, etc.) |
| **Vercel account** | Hosting |

**Not available on Vercel:** LibreOffice (`soffice`). Word `.docx` uploads use a text-only fallback; legacy `.doc` is rejected. For exact Word layout, upload **PDF** files.

---

## Step 1 — Push your code to Git

1. Create a repository on GitHub (if you have not already).
2. From your project folder:

```bash
git init
git add .
git commit -m "Initial QuikSign commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Do **not** commit `.env` (it is in `.gitignore`). Secrets go only into Vercel.

---

## Step 2 — Create a production database

Pick one provider and create a **PostgreSQL** database.

### Option A: Neon (recommended)

1. Go to [https://neon.tech](https://neon.tech) and sign up.
2. Create a project → copy the **pooled** connection string (often ends with `?sslmode=require`).
3. Save it — this becomes `DATABASE_URL`.

### Option B: Supabase

1. Go to [https://supabase.com](https://supabase.com) → New project.
2. **Settings → Database → Connection string → URI** (use **Transaction** pooler for serverless).
3. Save as `DATABASE_URL`.

### Option C: Vercel Postgres

1. In the Vercel dashboard, **Storage → Create Database → Postgres**.
2. Connect it to your project later; Vercel can inject `DATABASE_URL` automatically.

---

## Step 3 — Run database migrations (one time)

Your production database must match `prisma/schema.prisma`. Run migrations **from your machine** (or CI), not inside the Vercel build.

1. Install dependencies locally if needed: `npm install`
2. Set `DATABASE_URL` to your **production** connection string (temporarily in a local `.env` or inline):

```bash
# PowerShell (Windows)
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require"
npx prisma migrate deploy
```

```bash
# macOS / Linux
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require" npx prisma migrate deploy
```

You should see migrations applied successfully. If this fails, fix the connection string before deploying the app.

---

## Step 4 — Set up Cloudinary

1. Sign up at [https://cloudinary.com](https://cloudinary.com).
2. From the dashboard, note:
   - **Cloud name** → `CLOUDINARY_CLOUD_NAME`
   - **API Key** → `CLOUDINARY_API_KEY`
   - **API Secret** → `CLOUDINARY_API_SECRET`
3. Uploads use **authenticated raw** resources under folders like `quiksign/documents`. Default Cloudinary settings are fine for a new account.

---

## Step 5 — Set up SMTP (email)

QuikSign sends:

- Signing invitation emails (with link `/sign/{token}`)
- Completion emails to the sender

Configure any SMTP provider. Examples:

| Provider | `SMTP_PROVIDER` | Notes |
|----------|-----------------|--------|
| Gmail | `gmail` | Use an [App Password](https://support.google.com/accounts/answer/185833), not your normal password |
| Outlook / Microsoft 365 | `outlook` | `SMTP_HOST=smtp.office365.com`, port `587` |
| SendGrid | `sendgrid` | Use SMTP credentials from SendGrid |
| Custom host | `custom` | Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |

Required variables:

- `SMTP_HOST`, `SMTP_PORT` (usually `587`)
- `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM` (e.g. `QuikSupport@yourdomain.com`)
- `SMTP_PROVIDER` (see table)
- `SMTP_RETRIES=2` (optional)

---

## Step 6 — Import the project on Vercel

1. Go to [https://vercel.com/new](https://vercel.com/new).
2. **Import** your Git repository.
3. Framework preset should detect **Next.js** automatically.
4. **Do not change** these unless you know you need to:
   - **Build Command:** `next build` (default; `prebuild` runs `prisma generate` + PDF worker copy via `package.json`)
   - **Install Command:** `npm install` (or use `npm install --include=optional` as in `vercel.json`)
   - **Output Directory:** leave default (Next.js)

5. **Stop before clicking Deploy** — add environment variables first (Step 7).

---

## Step 7 — Add environment variables on Vercel

In the import screen (or later: **Project → Settings → Environment Variables**), add these for **Production** (and **Preview** if you want preview deployments to work fully).

### Required

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Your Neon/Supabase pooled Postgres URL |
| `NEXT_PUBLIC_APP_URL` | `https://your-project.vercel.app` (no trailing slash). **Update after first deploy** if you use a custom domain |
| `CLOUDINARY_CLOUD_NAME` | From Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | From Cloudinary dashboard |
| `CLOUDINARY_API_SECRET` | From Cloudinary dashboard |
| `SMTP_HOST` | e.g. `smtp.office365.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your SMTP username |
| `SMTP_PASS` | Your SMTP password or app password |
| `SMTP_FROM` | Sender address recipients see |
| `SMTP_PROVIDER` | `custom`, `gmail`, `outlook`, or `sendgrid` |

### Recommended (demo auth headers)

The dashboard sends these as `x-user-id` / `x-user-email` / `x-org-id`:

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_DEMO_USER_ID` | `user_1` |
| `NEXT_PUBLIC_DEMO_USER_EMAIL` | `owner@company.com` |
| `NEXT_PUBLIC_DEMO_ORG_ID` | `org_demo` |

### Optional

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Random string, 32+ characters, if you use JWT features |
| `WEBHOOK_URL` | HTTPS endpoint for envelope events |
| `WEBHOOK_SECRET` | HMAC secret for webhook signatures |

### Do **not** set on Vercel

| Variable | Reason |
|----------|--------|
| `LIBRE_OFFICE_EXE` | LibreOffice is not installed on Vercel |

---

## Step 8 — Deploy

1. Click **Deploy**.
2. Wait for the build log. A successful build shows:
   - `prisma generate` (from `prebuild`)
   - `copy-pdf-worker` (from `postinstall` / `prebuild`)
   - `next build` completed
3. Open the deployment URL (e.g. `https://quiksign-xxx.vercel.app`).

---

## Step 9 — Fix `NEXT_PUBLIC_APP_URL` after first deploy

Signing links and emails use `NEXT_PUBLIC_APP_URL`.

1. Copy your live URL from Vercel (e.g. `https://quiksign-xxx.vercel.app`).
2. **Settings → Environment Variables** → set `NEXT_PUBLIC_APP_URL` to that exact URL (no `/` at the end).
3. **Redeploy** (Deployments → ⋮ on latest → Redeploy) so the client bundle picks up the new value.

If you add a custom domain later, update this variable again and redeploy.

---

## Step 10 — Smoke-test production

1. **Dashboard** — open `/dashboard`. You should see the UI (empty list is OK).
2. **Upload** — `/upload` or Send flow: upload a **PDF** (most reliable on Vercel).
3. **Send envelope** — `/send`: add a recipient, place fields, send.
4. **Signing link** — open the link from the API response or email; path looks like `/sign/{token}`.
5. **Sign and finish** — complete fields, submit; check completion email if SMTP is configured.
6. **Download** — from the signing completion screen or envelope detail, download the signed PDF.

If emails do not arrive, check Vercel **Functions** logs for the `/api/envelopes` or `/api/sign` routes and verify SMTP credentials.

---

## Step 11 — Custom domain (optional)

1. **Project → Settings → Domains** → add your domain.
2. Follow Vercel DNS instructions.
3. Set `NEXT_PUBLIC_APP_URL` to `https://yourdomain.com`.
4. Redeploy.

---

## How this repo is configured for Vercel

- **`vercel.json`** — Gives PDF-heavy API routes **60s** timeout and **1024 MB** memory (signing, uploads, packet zip).
- **`package.json`** — `postinstall` and `prebuild` copy `pdf.worker.min.mjs` into `/public` for react-pdf (no CDN dependency).
- **Word uploads** — `.docx` uses mammoth text fallback on Vercel; page layout may differ from Word. Prefer PDF uploads in production.

---

## Troubleshooting

### Build fails on Prisma

- Ensure `DATABASE_URL` is set in Vercel (needed for `prisma generate` during build in some setups).
- If generate fails without DB, you can add a dummy URL only for build — but **migrations** must still run against the real database (Step 3).

### `Application error` or 500 on API routes

- Open **Vercel → Project → Logs** (Functions).
- Common causes: wrong `DATABASE_URL`, Cloudinary credentials, or missing env vars.

### Signing links go to `localhost`

- `NEXT_PUBLIC_APP_URL` is wrong or was not set before build. Fix in Vercel and **redeploy**.

### PDF preview blank in browser

- Confirm build log mentions `copy-pdf-worker`.
- Check browser network tab for `/pdf.worker.min.mjs` (should return 200).

### Emails not sent

- Verify all `SMTP_*` variables.
- For Gmail, use an App Password and `SMTP_PROVIDER=gmail`.
- Check function logs for `Failed to send signing invite email`.

### Word upload fails or layout is wrong

- Expected on Vercel without LibreOffice. Upload **PDF** instead, or save Word as PDF before upload.

### Database “relation does not exist”

- Run `npx prisma migrate deploy` against production `DATABASE_URL` (Step 3).

---

## Quick checklist

- [ ] Code pushed to Git
- [ ] Postgres created; `DATABASE_URL` saved
- [ ] `npx prisma migrate deploy` run against production DB
- [ ] Cloudinary credentials ready
- [ ] SMTP credentials ready
- [ ] Vercel project imported; all required env vars set
- [ ] First deploy succeeded
- [ ] `NEXT_PUBLIC_APP_URL` set to live URL and redeployed
- [ ] Tested: upload PDF → send envelope → sign → download

---

## Useful commands (local)

```bash
npm install
npm run dev          # http://localhost:3030
npm run build        # same as Vercel production build
npm test
npx prisma migrate deploy   # apply migrations to DATABASE_URL in .env
```

For a full feature overview, see `PROJECT_CONTEXT.md`.
