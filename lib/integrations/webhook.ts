import crypto from "node:crypto";

type WebhookEventType =
  | "envelope.sent"
  | "signer.signed"
  | "envelope.completed"
  | "envelope.voided"
  | "envelope.declined"
  | "envelope.reminder_sent";

type WebhookPayload = {
  event: WebhookEventType;
  envelopeId: string;
  orgId?: string | null;
  data?: Record<string, unknown>;
  occurredAt: string;
};

function createSignature(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

export async function publishWebhook(payload: WebhookPayload): Promise<void> {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    return;
  }

  const serialized = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    headers["x-quiksign-signature"] = createSignature(serialized, secret);
  }

  await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: serialized,
  });
}
