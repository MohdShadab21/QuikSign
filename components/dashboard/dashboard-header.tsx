"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
import { pageEdgePaddingClass } from "@/lib/ui/layout";

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
  compact,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || (href === "/dashboard" && pathname === "/");

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={clsx(
        "inline-flex items-center gap-2 rounded-lg font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        compact ? "w-full px-3 py-2.5 text-sm" : "px-3 py-2 text-sm whitespace-nowrap",
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

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <header className="sticky top-0 z-50 w-full min-w-0 border-b border-border bg-surface/95 shadow-sm backdrop-blur-md">
      <div
        className={clsx(
          "flex w-full min-w-0 items-center justify-between gap-3 py-3 sm:gap-4",
          pageEdgePaddingClass,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-5 lg:gap-8">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-bold text-white shadow-sm">
              QS
            </div>
            <div className="hidden leading-tight sm:block">
              <p className="text-sm font-bold text-text">QuikSign</p>
              <p className="text-xs text-muted">Document signing</p>
            </div>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex" aria-label="Main">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg text-text md:hidden"
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
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <nav
            id="mobile-nav"
            className={clsx(
              "fixed left-0 right-0 top-[var(--app-header-height)] z-50 max-h-[calc(100dvh-var(--app-header-height))] overflow-y-auto overscroll-contain border-t border-border bg-surface py-3 shadow-lg md:hidden",
              pageEdgePaddingClass,
            )}
            aria-label="Main mobile"
          >
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <NavLink key={item.href} {...item} compact onNavigate={() => setMobileOpen(false)} />
              ))}
              <div className="mt-2 border-t border-border pt-3 sm:hidden">
                <ThemeToggle />
              </div>
            </div>
          </nav>
        </>
      ) : null}
    </header>
  );
}
