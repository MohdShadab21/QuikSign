import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Profile, notifications, and signing preferences." />
      <SectionCard>
        <p className="text-sm text-body">
          Settings will be available in a future update. Use the navigation to send documents, manage templates, or sign
          files directly.
        </p>
      </SectionCard>
    </div>
  );
}
