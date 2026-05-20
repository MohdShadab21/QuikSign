import { clsx } from "clsx";

type LoadingSkeletonProps = {
  className?: string;
};

export function LoadingSkeleton({ className }: LoadingSkeletonProps) {
  return <div className={clsx("animate-pulse rounded-lg bg-border/50", className)} aria-hidden />;
}

export function PageLoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
      <LoadingSkeleton className="h-7 w-48" />
      <LoadingSkeleton className="h-4 w-80 max-w-full" />
      <div className="grid gap-3 md:grid-cols-4">
        {Array.from({ length: rows }).map((_, index) => (
          <LoadingSkeleton key={index} className="h-10" />
        ))}
      </div>
      <LoadingSkeleton className="h-56" />
      <LoadingSkeleton className="h-11 w-36" />
    </div>
  );
}
