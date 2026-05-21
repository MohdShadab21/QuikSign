/** Serialize Word→PDF jobs so only one soffice/Word instance runs at a time (faster, fewer Windows printer dialogs). */
let chain: Promise<unknown> = Promise.resolve();

export function withOfficeConversionLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
