import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * Shared shell for the public signing experience. Mirrors the dashboard header so a
 * signer who lands here from an email still feels like they're inside the same
 * product, without exposing dashboard navigation.
 */
export function SigningPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-surface/85 shadow-sm backdrop-blur-md">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-3 md:px-6">
          <Link href="#" className="flex items-center gap-2" aria-label="QuikSign">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-bold text-white shadow-sm">
              QS
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-text">QuikSign</p>
              <p className="text-xs text-muted">Secure document signing</p>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-medium text-body sm:inline">
              Public signing session
            </span>
            <ThemeToggle className="hidden sm:inline-flex" />
          </div>
        </div>
      </header>
      <main className="w-full px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
