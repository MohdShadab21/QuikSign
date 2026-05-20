"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import {
  FileSignature,
  LayoutDashboard,
  Menu,
  Send,
  Settings,
  X,
  Layers,
} from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/send", label: "Send", icon: Send },
  { href: "/sign-documents", label: "Documents", icon: FileSignature },
  { href: "/templates", label: "Templates", icon: Layers },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href === "/dashboard" && pathname === "/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={clsx(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active ? "bg-primary text-white shadow-sm" : "text-text hover:bg-bg",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

export function DashboardHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-surface/95 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3 md:gap-6">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-bold text-white shadow-sm">
              QS
            </div>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold text-text">QuikSign</p>
              <p className="text-xs text-muted">Document signing</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg text-text lg:hidden"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </button>
          <div
            className="grid h-9 w-9 place-items-center rounded-full border border-border bg-bg text-xs font-bold text-text"
            aria-label="User"
            role="img"
          >
            U
          </div>
        </div>
      </div>

      {mobileOpen ? (
        <nav
          id="mobile-nav"
          className="border-t border-border bg-surface px-4 py-3 lg:hidden"
          aria-label="Main mobile"
        >
          <div className="flex flex-col gap-1">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} onNavigate={() => setMobileOpen(false)} />
            ))}
            <div className="mt-2 border-t border-border pt-2">
              <ThemeToggle />
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
