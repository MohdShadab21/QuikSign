import { clsx } from "clsx";
import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: "solid" | "muted";
  padding?: "none" | "sm" | "md" | "lg";
};

const paddingClass = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

export function Card({ children, className, variant = "solid", padding = "lg" }: CardProps) {
  const base =
    variant === "muted"
      ? "rounded-xl border border-border bg-bg shadow-sm"
      : "rounded-xl border border-border bg-surface shadow-sm";

  return <div className={clsx(base, paddingClass[padding], className)}>{children}</div>;
}
