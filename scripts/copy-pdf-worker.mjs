#!/usr/bin/env node
// Copies pdf.js worker from react-pdf's bundled pdfjs-dist into /public, so it can be
// served as a same-origin static asset. Run automatically before `next build` so
// production deploys (Vercel) include the file. Safe to re-run.

import { copyFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC_DIR = join(ROOT, "public");

const candidates = [
  join(ROOT, "node_modules", "react-pdf", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  join(ROOT, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
];

async function detectReactPdfVersion() {
  const reactPdfRoot = join(ROOT, "node_modules", "react-pdf", "node_modules", "pdfjs-dist", "package.json");
  const fallbackRoot = join(ROOT, "node_modules", "pdfjs-dist", "package.json");
  const target = existsSync(reactPdfRoot) ? reactPdfRoot : fallbackRoot;
  if (!existsSync(target)) return null;
  try {
    const json = JSON.parse(await readFile(target, "utf8"));
    return json.version ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const source = candidates.find((path) => existsSync(path));
  if (!source) {
    console.warn("[copy-pdf-worker] No pdf.worker.min.mjs found in node_modules; skipping.");
    return;
  }

  await mkdir(PUBLIC_DIR, { recursive: true });
  const destination = join(PUBLIC_DIR, "pdf.worker.min.mjs");
  await copyFile(source, destination);
  const version = await detectReactPdfVersion();
  console.log(
    `[copy-pdf-worker] Copied ${source.replace(ROOT, ".")} → public/pdf.worker.min.mjs` +
      (version ? ` (pdfjs-dist@${version})` : ""),
  );
}

main().catch((error) => {
  console.error("[copy-pdf-worker] Failed:", error);
  process.exitCode = 1;
});
