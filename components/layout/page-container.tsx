import { clsx } from "clsx";
import type { ReactNode } from "react";
import { pageContainerClass } from "@/lib/ui/layout";

type PageContainerProps = {
  children: ReactNode;
  className?: string;
};

/** Full-width page content wrapper (matches dashboard shell padding via parent main). */
export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={clsx(pageContainerClass, "space-y-6", className)}>{children}</div>;
}
