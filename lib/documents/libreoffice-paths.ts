import fs from "node:fs";

export function resolveSofficeBinaryPaths(): string[] {
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

  add(process.env.LIBRE_OFFICE_EXE);

  if (process.platform === "win32") {
    const prefixes = [
      process.env["ProgramFiles"],
      process.env["ProgramFiles(x86)"],
      "C:\\Program Files",
      "C:\\Program Files (x86)",
    ].filter(Boolean) as string[];

    for (const prefix of prefixes) {
      add(`${prefix}\\LibreOffice\\program\\soffice.exe`);
    }
  } else if (process.platform === "darwin") {
    add("/Applications/LibreOffice.app/Contents/MacOS/soffice");
  } else {
    add("/usr/bin/soffice");
    add("/usr/bin/libreoffice");
  }

  return paths;
}
