export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>
    </div>
  );
}
