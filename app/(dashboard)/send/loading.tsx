export default function SendLoading() {
  return (
    <div className="w-full space-y-4 rounded-2xl border border-white/30 bg-white/70 p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/60">
      <div className="h-7 w-56 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="h-4 w-96 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>
      <div className="h-56 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
      <div className="h-12 w-40 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-700" />
    </div>
  );
}
