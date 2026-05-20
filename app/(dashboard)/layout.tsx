import { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ToastProvider } from "@/components/ui/toast-provider";
import { appShellClass, pageContainerClass, pageMainClass } from "@/lib/ui/layout";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className={appShellClass}>
        <DashboardHeader />
        <main className={pageMainClass}>
          <div className={pageContainerClass}>{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
