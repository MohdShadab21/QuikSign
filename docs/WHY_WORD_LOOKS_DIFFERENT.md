# Why your Word file looks different after upload

## What QuikSign does

1. You upload `.docx` (or `.doc`).
2. The server **converts it to PDF** so you can place signature fields (the app cannot sign inside Word directly).
3. QuikSign **does not edit** your original Word file.
4. Signing **only draws** signatures and field values on top of the PDF.

If step 2 uses the **wrong converter**, the PDF will look like a plain document (wrong fonts, no logo, no highlights) even though your Word file is correct.

## What is happening on your PC

Your `.env` does **not** include Microsoft Graph (`MS_GRAPH_*`). You also cannot use **desktop Word** on your office PC.

So QuikSign falls back to **LibreOffice** (if installed). LibreOffice is **not** Microsoft Word. It often:

- Changes fonts (e.g. Times New Roman → Arial)
- Drops or moves header logos
- Loses yellow/cyan highlights
- Changes spacing

That is **not a bug in QuikSign signing** — it is the **conversion engine** producing a different PDF.

Check the upload toast:

| Toast says | Meaning |
|------------|---------|
| **Microsoft 365 / Word Online** | Good — same family as Word Online |
| **Microsoft Word** | Good — desktop Word export |
| **LibreOffice — layout may differ** | Your issue — styling often changes |
| **Original PDF** | No conversion — exact file |

## How to fix it (pick one)

### A. Best today — no IT setup (5 minutes)

1. Open the document in **Word Online**.
2. **File → Download as PDF**.
3. Upload that **PDF** in QuikSign (not the `.docx`).

The PDF is stored **unchanged**. Design and fonts match Word Online exactly.

### B. Best long-term — Word Online in the cloud (IT once)

Ask IT to configure **Microsoft Graph** so QuikSign converts using **Microsoft’s servers** (same as Word Online).

Guide: [MICROSOFT_GRAPH_SETUP.md](./MICROSOFT_GRAPH_SETUP.md)

Add to `.env` and Vercel, restart the app, upload `.docx` again. Toast should say **Microsoft 365 / Word Online**.

### C. Production without Graph

Set `GOTENBERG_URL` on Vercel (Docker service). Better than plain text, but still LibreOffice-based — complex legal templates may still differ slightly from Word.

### D. Do not rely on

- **LibreOffice alone** for contracts with logos, custom fonts, and highlights — expect differences.
- **react-pdf** to “read Word” — it only displays PDF; it cannot preserve `.docx` design.

## Summary

| You want | Do this |
|----------|---------|
| Exact design **now** | Word Online → Download as PDF → upload PDF |
| Exact design **from .docx` upload** | IT sets up **Microsoft Graph** |
| Office PC, no Word install | Graph or PDF download — not LibreOffice alone |
