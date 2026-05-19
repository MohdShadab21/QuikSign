import crypto from "node:crypto";
import jwt from "jsonwebtoken";

type SignerTokenPayload = {
  envelopeId: string;
  signerId: string;
  signerEmail: string;
};

const defaultSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";

export function createRawSigningToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashSigningToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function createSignerJwtToken(payload: SignerTokenPayload): string {
  return jwt.sign(payload, defaultSecret, { expiresIn: "7d" });
}

export function verifySignerJwtToken(token: string): SignerTokenPayload {
  return jwt.verify(token, defaultSecret) as SignerTokenPayload;
}
