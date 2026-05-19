import { GlassCard } from "@/components/glass/glass-card";

export default function SettingsPage() {
  return (
    <GlassCard className="w-full">
      <h2 className="text-heading text-xl">Settings</h2>
      <p className="mt-2 max-w-2xl text-body text-sm">
        Settings will live here (profile, notifications, default signing preferences). This is a placeholder page for the
        new navigation.
      </p>
    </GlassCard>
  );
}

