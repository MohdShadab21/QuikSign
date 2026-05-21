# Word Online → PDF (no desktop Word on your PC)

If your company uses **Microsoft 365 in the browser** (Word Online) and you **cannot install Word** on your office PC, use **Microsoft Graph**. QuikSign uploads your `.docx` to your company’s Microsoft cloud, converts it with the **same engine as Word Online**, downloads the PDF, then places signature fields on that PDF only.

Your original Word file is **not modified**.

---

## Who does this setup?

Usually **one IT admin** (15–20 minutes, once). After that, every developer and production (Vercel) use the same four environment variables.

---

## Step 1 — Azure app registration

1. Open [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**.
2. Name: `QuikSign Word Conversion`.
3. Supported account types: **Accounts in this organizational directory only**.
4. Register. Copy:
   - **Application (client) ID** → `MS_GRAPH_CLIENT_ID`
   - **Directory (tenant) ID** → `MS_GRAPH_TENANT_ID`

## Step 2 — Client secret

1. **Certificates & secrets** → **New client secret**.
2. Copy the **Value** immediately → `MS_GRAPH_CLIENT_SECRET` (it is shown only once).

## Step 3 — API permissions

1. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**.
2. Add **Files.ReadWrite.All**.
3. Click **Grant admin consent for [your org]** (requires admin).

## Step 4 — SharePoint folder for temporary files

Create a private SharePoint site or library for QuikSign temp uploads (IT can restrict access).

Example site URL:

`https://yourcompany.sharepoint.com/sites/QuikSignConvert`

Set in `.env` (and Vercel):

```env
MS_GRAPH_SITE_HOST=yourcompany.sharepoint.com
MS_GRAPH_SITE_PATH=/sites/QuikSignConvert
```

**Or** copy the library **Drive ID** from Graph Explorer / SharePoint admin and set:

```env
MS_GRAPH_DRIVE_ID=b!xxxxxxxx...
```

## Step 5 — Add to QuikSign

`.env` on your office PC **and** Vercel production:

```env
MS_GRAPH_TENANT_ID=your-tenant-id
MS_GRAPH_CLIENT_ID=your-client-id
MS_GRAPH_CLIENT_SECRET=your-secret
MS_GRAPH_SITE_HOST=yourcompany.sharepoint.com
MS_GRAPH_SITE_PATH=/sites/QuikSignConvert
```

Restart `npm run dev`. Upload a `.docx`. The success toast should say **`converted with Microsoft 365 (Word Online)`**.

---

## Word Online manual fallback (no IT setup)

1. Open the document in **Word Online**.
2. **File → Download as PDF**.
3. Upload the **PDF** in QuikSign (unchanged, best fidelity).

---

## Troubleshooting

| Error | Fix |
|--------|-----|
| Authentication failed | Check tenant id, client id, secret |
| 403 on upload | Admin consent for **Files.ReadWrite.All** |
| Could not resolve SharePoint drive | Fix `MS_GRAPH_SITE_HOST` / `MS_GRAPH_SITE_PATH` |
| Empty PDF | File may be corrupt; try Download as PDF manually |
