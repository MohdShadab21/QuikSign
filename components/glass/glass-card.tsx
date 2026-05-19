"use client";

import { clsx } from "clsx";
import { ReactNode } from "react";

type GlassCardProps = {
  children: ReactNode;
  className?: string;
};

export function GlassCard({ children, className }: GlassCardProps) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-surface p-6 shadow-sm dark:border-white/10 dark:bg-surface/80 dark:shadow-xl dark:backdrop-blur-md",
        className,
      )}
    >
      {children}
    </div>
  );
}
