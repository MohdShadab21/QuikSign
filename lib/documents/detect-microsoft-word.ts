import fs from "node:fs";
import path from "node:path";

let cachedInstalled: boolean | null = null;

/** Desktop Word paths on Windows (Office 365 / Office 2016+). */
export function resolveWinWordExePaths(): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  const add = (candidate: string | undefined) => {
    const trimmed = candidate?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    if (fs.existsSync(trimmed)) {
      seen.add(trimmed);
      paths.push(trimmed);
    }
  };

  add(process.env.WINWORD_EXE);

  const prefixes = [
    process.env["ProgramFiles"],
    process.env["ProgramFiles(x86)"],
    "C:\\Program Files",
    "C:\\Program Files (x86)",
  ].filter(Boolean) as string[];

  for (const prefix of prefixes) {
    add(path.join(prefix, "Microsoft Office", "root", "Office16", "WINWORD.EXE"));
    add(path.join(prefix, "Microsoft Office", "Office16", "WINWORD.EXE"));
    add(path.join(prefix, "Microsoft Office", "root", "Office15", "WINWORD.EXE"));
  }

  return paths;
}

/** True when Microsoft Word is installed locally (Windows). */
export function isMicrosoftWordInstalled(): boolean {
  if (process.platform !== "win32") {
    return false;
  }
  if (process.env.WORD_PDF_CONVERSION === "false") {
    return false;
  }
  if (cachedInstalled !== null) {
    return cachedInstalled;
  }
  cachedInstalled = resolveWinWordExePaths().length > 0;
  return cachedInstalled;
}
