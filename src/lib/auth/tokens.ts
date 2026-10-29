import { createHash, randomBytes } from "node:crypto";

/** 256-bit URL-safe random token. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are only ever stored hashed, so a database leak does not leak live sessions/links. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
