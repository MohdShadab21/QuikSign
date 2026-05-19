import { PrismaClient } from "@prisma/client";

declare global {
  var prismaClient: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });
}

function hasExpectedDelegates(client: PrismaClient): boolean {
  // In long-running dev sessions, stale cached clients can miss newly added model delegates.
  const candidate = client as unknown as Record<string, unknown>;
  return Boolean(candidate.template) && Boolean(candidate.envelope) && Boolean(candidate.document);
}

const cached = global.prismaClient;
export const prisma = cached && hasExpectedDelegates(cached) ? cached : createClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaClient = prisma;
}
