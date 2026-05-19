"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";

type ThemeMode = "light" | "dark";

function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "light";
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function ThemeToggle({ className }: { className?: string }) {
  // Keep first render deterministic for SSR hydration.
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [mounted, setMounted] = useState(false);

  const label = useMemo(() => (theme === "dark" ? "Dark" : "Light"), [theme]);

  useEffect(() => {
    const stored = window.localStorage.getItem("quiksign-theme");
    const initial = stored === "dark" || stored === "light" ? (stored as ThemeMode) : getSystemTheme();
    applyTheme(initial);
    window.localStorage.setItem("quiksign-theme", initial);
    queueMicrotask(() => {
      setTheme(initial);
      setMounted(true);
    });
  }, []);

  const onToggle = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem("quiksign-theme", next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Toggle theme"
      className={clsx(
        "inline-flex items-center gap-2 rounded-xl bg-surface px-3 py-2 text-sm font-medium text-text shadow-sm",
        "border border-border hover:bg-surface/95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <span className="text-body">Theme</span>
      <span className="rounded-lg bg-bg px-2 py-1 text-xs text-text">{mounted ? label : "Light"}</span>
    </button>
  );
}

