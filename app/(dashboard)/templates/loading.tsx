export default function TemplatesLoading() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-2xl border border-white/30 bg-white/70 p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900/60"
        >
          <div className="h-6 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-4 w-72 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-10 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      ))}
    </div>
  );
}
