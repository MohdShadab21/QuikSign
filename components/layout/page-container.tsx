import { clsx } from "clsx";
import type { ReactNode } from "react";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

/** Standard max-width wrapper for dashboard pages. */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={clsx("mx-auto w-full max-w-7xl space-y-6", className)}>{children}</div>;
}
