import { clsx } from "clsx";
import type { ReactNode } from "react";

type SectionCardProps = {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
};

const paddingClass = {
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

/** Primary content panel — use instead of ad-hoc bordered divs. */
export function SectionCard({ children, className, padding = "md" }: SectionCardProps) {
  return (
    <div
      className={clsx(
        "rounded-xl border border-border bg-surface shadow-sm",
        paddingClass[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}
