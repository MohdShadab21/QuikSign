"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appAuthHeaders, withJsonHeaders } from "@/lib/client/api";
import { mapApiErrorMessage } from "@/lib/client/error-messages";
import { Button } from "@/components/ui/button";

type EnvelopeActionsProps = {
  envelopeId: string;
  status: string;
};

export function EnvelopeActions({ envelopeId, status }: EnvelopeActionsProps) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const callEndpoint = async (url: string, body?: Record<string, string>) => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json()) as { error?: string; status?: string; signerEmail?: string };
      if (!response.ok) {
        throw new Error(mapApiErrorMessage(data.error ?? "Action failed"));
      }
      setMessage(data.status ? `Success: ${data.status}` : "Success");
      router.refresh();
    } catch (error) {
      setMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const downloadCompletedPacket = async () => {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/envelopes/${envelopeId}/packet`, {
        method: "GET",
        headers: appAuthHeaders(),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(mapApiErrorMessage(data.error ?? "Packet download failed"));
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `envelope-${envelopeId}-packet.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);
      setMessage("Packet download started.");
      router.refresh();
    } catch (error) {
      setMessage(mapApiErrorMessage((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-border bg-bg p-3 text-xs">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          disabled={busy || status !== "SENT"}
          onClick={() => callEndpoint(`/api/envelopes/${envelopeId}/remind`)}
        >
          Remind
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={busy || status === "COMPLETED" || status === "VOIDED"}
          onClick={() => callEndpoint(`/api/envelopes/${envelopeId}/void`, { reason: "Voided by sender" })}
        >
          Void
        </Button>
        <Button
          size="sm"
          variant="success"
          disabled={busy || status !== "COMPLETED"}
          onClick={downloadCompletedPacket}
        >
          Download packet
        </Button>
      </div>
      {message && <p className="mt-2">{message}</p>}
    </div>
  );
}
