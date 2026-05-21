# Word → PDF for QuikSign

Signing needs a **PDF**. QuikSign never edits your `.docx` — it converts a **copy** to PDF, then draws signature fields on that PDF only.

## If you use Word Online only (no desktop Word on office PC)

**Best option:** [Microsoft Graph setup](./MICROSOFT_GRAPH_SETUP.md) — uses your company Microsoft 365 cloud (same quality as Word Online). Works on **localhost** and **Vercel** once IT adds four env vars.

**Quick fallback:** In Word Online → **File → Download as PDF** → upload that PDF in QuikSign.

## Production (Vercel)

| Option | Desktop Word needed? | Quality |
|--------|----------------------|---------|
| **Microsoft Graph** | No | Same as Word Online |
| **Gotenberg** (Docker URL) | No | Good (LibreOffice in cloud) |

Set `MS_GRAPH_*` and/or `GOTENBERG_URL` in Vercel environment variables.

## Local PC with desktop Word installed

QuikSign auto-detects Word and converts like **File → Save As PDF**.

## Local PC with LibreOffice only

```env
WORD_PDF_CONVERSION=false
LIBRE_OFFICE_EXE=C:\Program Files\LibreOffice\program\soffice.exe
```

Layout may differ slightly from Word Online.

## PDF uploads

PDF files are stored **unchanged**. Only signature fields are overlaid.
