"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href || (href === "/dashboard" && pathname === "/");

  return (
    <Link
      href={href}
      className={clsx(
        "rounded-lg px-3 py-2 text-sm font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "bg-primary text-white shadow-sm" : "text-text hover:bg-surface/80",
      )}
    >
      {label}
    </Link>
  );
}

export function DashboardHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/85 shadow-sm backdrop-blur-md">
      <div className="flex w-full items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-bold text-white shadow-sm">
              QS
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-text">QuikSign</p>
              <p className="text-xs text-muted">Control Center</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <NavLink href="/dashboard" label="Dashboard" />
            <NavLink href="/sign-documents" label="Sign Document" />
            <NavLink href="/templates" label="Templates" />
            <NavLink href="/settings" label="Settings" />
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle className="hidden sm:inline-flex" />
          <div
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-bg text-xs font-bold text-text shadow-sm"
            aria-label="User avatar"
            role="img"
          >
            U
          </div>
        </div>
      </div>
    </header>
  );
}

