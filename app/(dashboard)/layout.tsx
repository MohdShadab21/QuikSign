import { ReactNode } from "react";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { ToastProvider } from "@/components/ui/toast-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="min-h-screen">
        <DashboardHeader />
        <main className="w-full px-4 py-6 md:px-6 md:py-8">{children}</main>
      </div>
    </ToastProvider>
  );
}
