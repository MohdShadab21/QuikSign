"use client";

type ExternalAuthFieldsProps = {
  userId: string;
  userEmail: string;
  orgId: string;
  onUserIdChange: (value: string) => void;
  onUserEmailChange: (value: string) => void;
  onOrgIdChange: (value: string) => void;
};

export function ExternalAuthFields({
  userId,
  userEmail,
  orgId,
  onUserIdChange,
  onUserEmailChange,
  onOrgIdChange,
}: ExternalAuthFieldsProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-white/20 bg-white/20 p-4 md:grid-cols-3 dark:bg-zinc-900/20">
      <label className="text-xs font-medium">
        x-user-id
        <input
          value={userId}
          onChange={(event) => onUserIdChange(event.target.value)}
          placeholder="user_1"
          className="mt-1 w-full rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        />
      </label>
      <label className="text-xs font-medium">
        x-user-email
        <input
          value={userEmail}
          onChange={(event) => onUserEmailChange(event.target.value)}
          placeholder="owner@company.com"
          className="mt-1 w-full rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        />
      </label>
      <label className="text-xs font-medium">
        x-org-id (optional)
        <input
          value={orgId}
          onChange={(event) => onOrgIdChange(event.target.value)}
          placeholder="org_acme"
          className="mt-1 w-full rounded-md border border-white/30 bg-white/70 px-3 py-2 text-sm dark:bg-zinc-900/50"
        />
      </label>
    </div>
  );
}
