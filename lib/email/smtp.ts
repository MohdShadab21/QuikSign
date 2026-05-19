import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";

type SigningInviteInput = {
  toEmail: string;
  toName: string;
  envelopeTitle: string;
  signingLink: string;
  emailSubject?: string;
  emailBody?: string;
};

type SmtpProvider = "custom" | "gmail" | "outlook" | "sendgrid";

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const smtpProvider = (process.env.SMTP_PROVIDER ?? "custom").toLowerCase() as SmtpProvider;
const smtpHost = process.env.SMTP_HOST;
const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM;
const smtpRetries = process.env.SMTP_RETRIES ? Number(process.env.SMTP_RETRIES) : 2;

const providerDefaults: Record<SmtpProvider, { host: string; port: number; secure: boolean } | null> = {
  custom: null,
  gmail: { host: "smtp.gmail.com", port: 587, secure: false },
  outlook: { host: "smtp.office365.com", port: 587, secure: false },
  sendgrid: { host: "smtp.sendgrid.net", port: 587, secure: false },
};

function getResolvedSmtpConfig(): { host: string; port: number; secure: boolean } | null {
  if (smtpProvider === "custom") {
    if (!smtpHost) {
      return null;
    }
    return {
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
    };
  }

  return providerDefaults[smtpProvider];
}

function isSmtpConfigured(): boolean {
  const resolved = getResolvedSmtpConfig();
  return Boolean(resolved && smtpUser && smtpPass && smtpFrom);
}

function getTransporter() {
  const resolved = getResolvedSmtpConfig();
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!resolved) {
    return null;
  }

  const transport: SMTPTransport.Options = {
    host: resolved.host,
    port: resolved.port,
    secure: resolved.secure,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
  };

  return nodemailer.createTransport(transport);
}

function buildEmailShell(content: string): string {
  return `
    <div style="font-family: Inter, Arial, sans-serif; background: linear-gradient(135deg, #eff6ff, #f5f3ff); padding: 24px;">
      <div style="max-width: 640px; margin: 0 auto; border-radius: 16px; border: 1px solid rgba(148,163,184,0.25); background: rgba(255,255,255,0.75); backdrop-filter: blur(10px); padding: 24px;">
        <div style="margin-bottom: 18px;">
          <h2 style="margin: 0; color: #0f172a;">QuikSign</h2>
          <p style="margin: 6px 0 0; color: #475569; font-size: 14px;">Secure agreement lifecycle module</p>
        </div>
        ${content}
      </div>
    </div>
  `;
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function sendWithRetry(message: EmailMessage): Promise<void> {
  const transporter = getTransporter();
  if (!transporter || !smtpFrom) {
    console.warn("SMTP not configured. Skipping outbound email.");
    return;
  }

  const attempts = Math.max(1, smtpRetries + 1);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await transporter.sendMail({
        from: smtpFrom,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(attempt * 500);
      }
    }
  }

  throw lastError;
}

export async function sendSigningInviteEmail(input: SigningInviteInput): Promise<void> {
  const intro =
    input.emailBody?.trim() ||
    "You have received a document to sign via QuikSign.";
  const text = [
    `Hi ${input.toName},`,
    "",
    intro,
    `Envelope: ${input.envelopeTitle}`,
    `Signing link: ${input.signingLink}`,
    "",
    "If you were not expecting this email, please ignore it.",
  ].join("\n");

  const bodyHtml = input.emailBody?.trim()
    ? `<p style="margin: 0 0 12px; color: #1e293b; white-space: pre-wrap;">${input.emailBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`
    : `<p style="margin: 0 0 10px; color: #1e293b;">You have received a document to sign via <strong>QuikSign</strong>.</p>`;

  const html = buildEmailShell(`
      <p style="margin: 0 0 10px; color: #0f172a;">Hi ${input.toName},</p>
      ${bodyHtml}
      <p style="margin: 0 0 16px; color: #1e293b;"><strong>Envelope:</strong> ${input.envelopeTitle}</p>
      <a href="${input.signingLink}" style="display: inline-block; border-radius: 10px; background: #2563eb; color: #ffffff; padding: 10px 14px; text-decoration: none; font-weight: 600;">
        Open signing link
      </a>
      <p style="margin: 14px 0 0; color: #475569; font-size: 13px;">If you were not expecting this email, please ignore it.</p>
  `);

  await sendWithRetry({
    to: input.toEmail,
    subject: input.emailSubject?.trim() || `Please sign: ${input.envelopeTitle}`,
    text,
    html,
  });
}

export async function sendSigningCompletedEmail(params: {
  toEmail: string;
  envelopeTitle: string;
}): Promise<void> {
  const text = [
    `The envelope "${params.envelopeTitle}" has been fully signed.`,
    "You can now retrieve the signed document from your host application.",
  ].join("\n");

  const html = buildEmailShell(`
      <p style="margin: 0 0 12px; color: #1e293b;">The envelope <strong>${params.envelopeTitle}</strong> has been fully signed.</p>
      <p style="margin: 0; color: #1e293b;">You can now retrieve the signed document from your host application.</p>
  `);

  await sendWithRetry({
    to: params.toEmail,
    subject: `Completed: ${params.envelopeTitle}`,
    text,
    html,
  });
}

export async function sendSigningDeclinedEmail(params: {
  toEmail: string;
  envelopeTitle: string;
  declinedByEmail: string;
  declinedByName?: string;
  reason: string;
}): Promise<void> {
  const actor = params.declinedByName?.trim() ? `${params.declinedByName} (${params.declinedByEmail})` : params.declinedByEmail;
  const safeReason = params.reason.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = [
    `${actor} declined to sign "${params.envelopeTitle}" on QuikSign.`,
    "",
    `Reason: ${params.reason}`,
    "",
    "The envelope workflow has been stopped. You can void or duplicate it from your dashboard.",
  ].join("\n");

  const html = buildEmailShell(`
      <p style="margin: 0 0 10px; color: #0f172a;">${actor} declined to sign:</p>
      <p style="margin: 0 0 12px; color: #1e293b;"><strong>${params.envelopeTitle}</strong></p>
      <p style="margin: 0 0 12px; color: #1e293b;"><strong>Reason:</strong> ${safeReason}</p>
      <p style="margin: 0; color: #475569; font-size: 13px;">The envelope workflow has been stopped. You can void or duplicate it from your dashboard.</p>
  `);

  await sendWithRetry({
    to: params.toEmail,
    subject: `Declined: ${params.envelopeTitle}`,
    text,
    html,
  });
}

export async function sendEnvelopeVoidedEmail(params: {
  toEmail: string;
  toName?: string;
  envelopeTitle: string;
  reason?: string | null;
}): Promise<void> {
  const reasonLine = params.reason?.trim() ? `Reason: ${params.reason}\n` : "";
  const text = [
    `Hi ${params.toName ?? ""}`.trim() + ",",
    "",
    `The envelope "${params.envelopeTitle}" has been voided by the sender. No further action is required.`,
    "",
    reasonLine,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const safeReason = params.reason ? params.reason.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
  const html = buildEmailShell(`
      <p style="margin: 0 0 10px; color: #0f172a;">Hi ${params.toName ?? ""},</p>
      <p style="margin: 0 0 12px; color: #1e293b;">The envelope <strong>${params.envelopeTitle}</strong> has been voided by the sender. No further action is required.</p>
      ${safeReason ? `<p style="margin: 0 0 0; color: #475569; font-size: 13px;"><strong>Reason:</strong> ${safeReason}</p>` : ""}
  `);

  await sendWithRetry({
    to: params.toEmail,
    subject: `Voided: ${params.envelopeTitle}`,
    text,
    html,
  });
}

export async function sendDocumentShareEmail(params: {
  toEmail: string;
  sharedByEmail: string;
  documentTitle: string;
  documentLink: string;
}): Promise<void> {
  const text = [
    `${params.sharedByEmail} shared a document with you via QuikSign.`,
    "",
    `Document: ${params.documentTitle}`,
    `Open link: ${params.documentLink}`,
  ].join("\n");

  const html = buildEmailShell(`
      <p style="margin: 0 0 10px; color: #0f172a;">${params.sharedByEmail} shared a document with you via QuikSign.</p>
      <p style="margin: 0 0 14px; color: #1e293b;"><strong>Document:</strong> ${params.documentTitle}</p>
      <a href="${params.documentLink}" style="display: inline-block; border-radius: 10px; background: #2563eb; color: #ffffff; padding: 10px 14px; text-decoration: none; font-weight: 600;">
        Open document
      </a>
  `);

  await sendWithRetry({
    to: params.toEmail,
    subject: `Document shared: ${params.documentTitle}`,
    text,
    html,
  });
}
