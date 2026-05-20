import type { Prisma } from "@prisma/client";
import type { RequestUser } from "@/lib/auth/request-user";

/** Scope envelopes to the current org or creator email. */
export function envelopeScopeWhere(user: RequestUser): Prisma.EnvelopeWhereInput {
  if (user.orgId) {
    return { orgId: user.orgId };
  }
  return { createdByEmail: user.userEmail.toLowerCase() };
}

/** Scope documents to the current org or uploader email. */
export function documentScopeWhere(user: RequestUser): Prisma.DocumentWhereInput {
  if (user.orgId) {
    return { orgId: user.orgId };
  }
  return { uploadedByEmail: user.userEmail.toLowerCase() };
}

/** Scope templates to the current org or creator email. */
export function templateScopeWhere(user: RequestUser): Prisma.TemplateWhereInput {
  if (user.orgId) {
    return { orgId: user.orgId };
  }
  return { createdByEmail: user.userEmail.toLowerCase() };
}
