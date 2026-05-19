# QuikSign Project Context

## Architecture
- Framework: Next.js App Router with TypeScript.
- API layer: Route handlers under `app/api`.
- Data layer: Prisma ORM with PostgreSQL.
- Storage layer: Cloudinary raw authenticated uploads for PDFs.
- PDF rendering/generation layer: `react-pdf` for page preview/placement, `pdf-lib` for in-place source PDF stamping, and `@react-pdf/renderer` for completion certificate artifacts.
- Notification layer: SMTP email delivery for signer invites and envelope completion with provider presets and retry/backoff.
- Integration layer: optional outbound webhooks with HMAC signatures for host-app synchronization.
- Security model: External auth headers (`x-user-id`, `x-user-email`, optional `x-org-id`) enforced in middleware.
- Security model: External auth headers are enforced in middleware and injected by client API layer for demo UX (not exposed as user-facing form fields).
- UI layer: Tailwind CSS glassmorphism dashboard, template manager, envelope builder with field designer, and public signing page.
- UX feedback layer: global toast notifications, inline spinners, and route-level skeleton loading states.

## API Structure
- `POST /api/documents`: upload PDF to Cloudinary and persist document metadata.
- `GET /api/documents`: list documents by tenant context and include signed download URLs.
- `GET /api/documents/:id`: fetch a single document and signed preview/download URL.
- `POST /api/envelopes`: create envelope, signers, fields, signing token, and sent audit event.
- `POST /api/envelopes`: also sends invitation email to first signer in signing order.
- `GET /api/envelopes/:id`: envelope detail with signers, fields, audit logs, source download URL, and completed artifact URLs.
- `GET /api/envelopes/:id/packet`: download completed packet zip (signed document + certificate + audit log JSON).
- `POST /api/envelopes/:id/remind`: resend invite to next pending signer and rotate signing token.
- `POST /api/envelopes/:id/void`: void envelope (authenticated) with optional reason.
- `GET /api/sign/:token`: validate public signing token, return envelope context, and log signer viewed.
- `POST /api/sign`: submit signer action and log signer signed event.
- `POST /api/sign`: also sends handoff email to next signer, or completion email to sender.
- `POST /api/sign/approve`: approver-only action path with optional note.
- `POST /api/sign/decline`: decline signing with reason (public token-based).
- `GET /api/templates`: list reusable templates.
- `POST /api/templates`: create template with role-based signers and field definitions.
- `GET /api/templates/:id`: fetch full template detail.
- `POST /api/templates/:id/create-envelope`: instantiate a live envelope from a template and recipient mapping.

## DB Schema
- `User`: optional external identity reference only.
- `Document`: uploaded PDF metadata and ownership context.
- `Envelope`: central aggregate linking document, status, signers, token, fields, and generated completion artifacts (signed PDF + certificate).
- `Signer`: envelope recipients with signing order, role (`SIGNER`, `APPROVER`, `CC`) and status.
- `SignatureField`: per-signer field coordinates and signature type.
- `Template`, `TemplateSigner`, `TemplateField`: reusable agreement workflows and role-based field layouts.
- `AuditLog`: immutable event stream with IP/user-agent metadata.
- Shared rules:
  - UUID primary keys on all models.
  - `createdAt` and `updatedAt` timestamps where applicable.
  - Enum-based statuses for envelope/signer lifecycle.

## Environment Variables
- `DATABASE_URL=` PostgreSQL connection string.
- `JWT_SECRET=` optional secret for internal token workflows.
- `NEXT_PUBLIC_APP_URL=` canonical base URL.
- `CLOUDINARY_CLOUD_NAME=` Cloudinary cloud name.
- `CLOUDINARY_API_KEY=` Cloudinary API key.
- `CLOUDINARY_API_SECRET=` Cloudinary API secret.
- `SMTP_HOST=` SMTP server host.
- `SMTP_PORT=` SMTP server port (default `587`).
- `SMTP_USER=` SMTP username.
- `SMTP_PASS=` SMTP password or app password.
- `SMTP_FROM=` sender identity used for outbound emails.
- `SMTP_PROVIDER=` `custom`, `gmail`, `outlook`, or `sendgrid`.
- `SMTP_RETRIES=` retry count after first send attempt (default `2`).
- `WEBHOOK_URL=` optional HTTPS endpoint for outbound events.
- `WEBHOOK_SECRET=` optional HMAC secret for `x-quiksign-signature` header verification.

## Features (MVP)
- Document upload API with PDF validation and Cloudinary persistence.
- Envelope creation with signer ordering and signature field mapping.
- Template authoring and template-to-envelope instantiation for repeat workflows.
- Role-based recipients (`Signer`, `Approver`, `CC`) in envelope lifecycle.
- Public tokenized signing flow with no signer login requirement.
- Approver-specific workflow action (`/api/sign/approve`) alongside signer and decline paths.
- Hybrid completion artifact generation:
  - signed source PDF with in-place field stamping (`pdf-lib`)
  - certificate of completion (`@react-pdf/renderer`)
  - both stored in Cloudinary
- Enterprise packet export endpoint producing a single downloadable zip archive.
- SMTP-powered branded email notifications for signing invitations and completion notices.
- Email provider presets for Gmail, Outlook, SendGrid, and custom SMTP host/port.
- Automatic retry with incremental backoff for transient SMTP failures.
- Audit logging for:
  - `document.created`
  - `document.sent`
  - `signer.viewed`
  - `signer.signed`
  - `signer.declined`
  - `signer.reminded`
  - `envelope.voided`
- Webhook events (when `WEBHOOK_URL` set): `envelope.sent`, `signer.signed`, `envelope.completed`, `envelope.voided`, `envelope.declined`, `envelope.reminder_sent`.
- Glassmorphism dashboard pages:
  - Dashboard overview
  - Upload instructions page
  - Envelope builder in guided step flow (Select Document → Recipients → Fields → Review & Send)
  - Envelope builder with page-aware visual field designer and React PDF page preview
  - Template manager page
  - Public signing page with sign + approve + decline actions
- Light/dark theme toggle.
- Dashboard intelligence cards: completion rate, completed count, pending count.
- User feedback system:
  - Success/error/info toasts
  - Inline loading spinners on primary actions
  - Skeleton loaders for dashboard/send/templates routes
