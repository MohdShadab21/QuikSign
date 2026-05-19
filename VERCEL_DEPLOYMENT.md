# Deploy QuikSign on Vercel

This guide walks you through deploying QuikSign on [Vercel](https://vercel.com). Allow about 30–60 minutes the first time (mostly waiting on accounts).

---

## Automatic on every deploy (no manual steps)

After your **one-time** Vercel setup below, each `git push` → Vercel redeploy does this for you:

| Task | How |
|------|-----|
| Database tables | `prisma migrate deploy` runs in **`prebuild`** |
| `DATABASE_URL` | `scripts/ensure-deploy-env.mjs` copies from Prisma Postgres vars (`POSTGRES_URL`, `DATABASE_URL_POSTGRES_URL`, `DATABASE_URL_DATABASE_URL`, etc.) if `DATABASE_URL` is missing |
| Signing link domain | `lib/utils/app-url.ts` uses request host + `VERCEL_*`; build script sets `NEXT_PUBLIC_APP_URL` from `VERCEL_PROJECT_PRODUCTION_URL` when unset |
| PDF.js worker | Copied to `/public` on `postinstall` / `prebuild` |

You do **not** need to run migrations by hand or rename `DATABASE_URL_DATABASE_URL` manually.

---

## One-time setup in Vercel (required secrets only)

Set these **once** in **Settings → Environment Variables** (Production). After that, only deploy:

| Variable | Required? | Notes |
|----------|-----------|--------|
| **Prisma Postgres** or `DATABASE_URL` | Yes | Link **Storage → Prisma Postgres** to the project *or* add `DATABASE_URL` — aliases are mapped automatically |
| `CLOUDINARY_*` (3 vars) | Yes | PDF storage |
| `SMTP_*` | Yes | Signing emails |
| `NEXT_PUBLIC_APP_URL` | Recommended | `https://quik-sign.vercel.app` — auto-filled from Vercel if omitted |
| `NEXT_PUBLIC_DEMO_*` | Optional | Demo dashboard identity headers |

Do **not** commit `.env` to Git. Production secrets live only in Vercel.

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

### Option C: Vercel Postgres / Prisma Postgres

1. In the Vercel dashboard, **Storage → Create Database** (Postgres or Prisma Postgres).
2. Vercel may create several variables (`POSTGRES_URL`, `PRISMA_DATABASE_URL`, etc.).
3. **Important:** QuikSign only reads **`DATABASE_URL`** (see `prisma/schema.prisma`).
4. Add a **new** environment variable:
   - **Name:** `DATABASE_URL`
   - **Value:** the same `postgres://...` connection string (copy from `POSTGRES_URL` or `PRISMA_DATABASE_URL`)
   - **Environments:** Production (and Preview if needed)
5. Redeploy after saving.

Names like `DATABASE_URL_POSTGRES_URL` are **not** used by the app — the name must be exactly `DATABASE_URL`.

---

## Step 3 — Database (usually automatic)

1. In Vercel: **Storage → Create → Prisma Postgres** (or Postgres) → **Connect to project**.
2. Deploy. The build log should show:
   - `[ensure-deploy-env] DATABASE_URL set from …`
   - `Applying migration` / `All migrations have been applied`

If you see `The table public.Envelope does not exist`, open the build log — migrations failed (wrong DB URL or DB unreachable). Fix storage connection and redeploy.

**Manual fallback (rare):** run `npx prisma migrate deploy` locally with the same `DATABASE_URL` as Vercel.

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
| `NEXT_PUBLIC_APP_URL` | Recommended: `https://quik-sign.vercel.app` (no trailing slash). **Optional on Vercel** — build auto-sets from `VERCEL_PROJECT_PRODUCTION_URL` if missing; do not set to `localhost` |
| `APP_URL` | Optional; same as `NEXT_PUBLIC_APP_URL` |
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

## Step 9 — Signing URLs (usually automatic)

Signing links use `NEXT_PUBLIC_APP_URL` and/or the live request host.

- **Recommended:** set `NEXT_PUBLIC_APP_URL` = `https://quik-sign.vercel.app` and redeploy once.
- **If you skip it:** the build script sets it from Vercel’s `VERCEL_PROJECT_PRODUCTION_URL`; runtime emails also use the request host (`lib/utils/app-url.ts`).

If you add a **custom domain**, set `NEXT_PUBLIC_APP_URL` to that domain and redeploy.

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

**Cause:** `NEXT_PUBLIC_APP_URL` in Vercel (or your local `.env` copied to Vercel) is `http://localhost:3030` or empty with an old fallback.

**Fix:**

1. Vercel → **Settings → Environment Variables**
2. Set **`NEXT_PUBLIC_APP_URL`** = `https://quik-sign.vercel.app` (your live URL, no trailing `/`)
3. Remove or fix any value that says `localhost`
4. **Redeploy**

After the code update in `lib/utils/app-url.ts`, new deploys also derive the URL from the request host on Vercel when `NEXT_PUBLIC_APP_URL` is wrong — but you should still set the env var for consistency.

**Note:** Envelopes already sent contain the old link in the email. Use **Remind** on the envelope or send a new envelope after fixing.

### PDF preview blank in browser

- Confirm build log mentions `copy-pdf-worker`.
- Check browser network tab for `/pdf.worker.min.mjs` (should return 200).

### Emails not sent

- Verify all `SMTP_*` variables.
- For Gmail, use an App Password and `SMTP_PROVIDER=gmail`.
- Check function logs for `Failed to send signing invite email`.

### Word upload fails or layout is wrong

- Expected on Vercel without LibreOffice. Upload **PDF** instead, or save Word as PDF before upload.

### `The table public.Envelope does not exist` (or Document / AuditLog)

**Cause:** Migrations were never applied to the database Vercel uses.

**Fix:**

1. In Vercel → **Settings → Environment Variables**, copy `DATABASE_URL`.
2. On your machine, run `npx prisma migrate deploy` with that exact URL (see Step 3, Option B).
3. Or **Redeploy** after confirming `DATABASE_URL` is set (migrations run in `prebuild`).

Also verify `DATABASE_URL` on Vercel points to the **same** database you migrated — not an old empty database.

---

## Quick checklist

- [ ] Code pushed to Git
- [ ] Postgres created; `DATABASE_URL` saved
- [ ] `npx prisma migrate deploy` run against production DB
- [ ] Cloudinary credentials ready
- [ ] SMTP credentials ready
- [ ] Vercel project imported; all required env vars set
- [ ] First deploy succeeded
- [ ] Build log shows migrations applied + `[ensure-deploy-env]` messages
- [ ] Tested: send envelope → email link uses `https://quik-sign.vercel.app` (not localhost)

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
