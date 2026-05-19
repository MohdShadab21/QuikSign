import { clsx } from "clsx";
import { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: "glass" | "solid";
};

export function Card({ children, className, variant = "glass" }: CardProps) {
  const base =
    variant === "glass"
      ? "rounded-2xl border border-white/10 bg-surface/80 shadow-lg backdrop-blur-md dark:bg-surface/80"
      : "rounded-2xl border border-border bg-surface shadow-sm";

  return <div className={clsx(base, "p-6", className)}>{children}</div>;
}

