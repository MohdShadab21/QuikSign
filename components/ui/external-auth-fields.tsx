"use client";

import { uiControlClass } from "@/lib/ui/classes";

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
    <div className="grid gap-3 rounded-xl border border-border bg-bg p-4 md:grid-cols-3">
      <label className="text-xs font-medium text-text">
        x-user-id
        <input
          value={userId}
          onChange={(event) => onUserIdChange(event.target.value)}
          placeholder="user_1"
          className={uiControlClass}
        />
      </label>
      <label className="text-xs font-medium text-text">
        x-user-email
        <input
          value={userEmail}
          onChange={(event) => onUserEmailChange(event.target.value)}
          placeholder="owner@company.com"
          className={uiControlClass}
        />
      </label>
      <label className="text-xs font-medium text-text">
        x-org-id (optional)
        <input
          value={orgId}
          onChange={(event) => onOrgIdChange(event.target.value)}
          placeholder="org_acme"
          className={uiControlClass}
        />
      </label>
    </div>
  );
}
