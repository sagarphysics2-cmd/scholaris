import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "./tokens";

export const SESSION_COOKIE = "scholaris_session";
export const SCHOOL_COOKIE = "scholaris_school";

const DAY = 24 * 60 * 60 * 1000;

function ttlMs() {
  return env().SESSION_TTL_DAYS * DAY;
}

/** Creates a DB session and sets an httpOnly cookie holding the raw token. */
export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlMs());
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, ipAddress: meta.ip ?? null, userAgent: meta.userAgent ?? null },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Validates the session token. Implements sliding expiration: once less than half of
 * the lifetime remains, the expiry is pushed forward (DB only — the cookie keeps the
 * original expiry unless refreshed by a later login, which is acceptable for a 7 day TTL).
 */
export async function validateSessionToken(token: string) {
  const id = hashToken(token);
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await db.session.delete({ where: { id } }).catch(() => undefined);
    return null;
  }
  if (session.expiresAt.getTime() - now < ttlMs() / 2 || now - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    const expiresAt =
      session.expiresAt.getTime() - now < ttlMs() / 2 ? new Date(now + ttlMs()) : session.expiresAt;
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now), expiresAt } }).catch(() => undefined);
  }
  return session;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
  jar.delete(SCHOOL_COOKIE);
}

export async function destroyAllSessions(userId: string, exceptToken?: string | null) {
  await db.session.deleteMany({
    where: { userId, ...(exceptToken ? { NOT: { id: hashToken(exceptToken) } } : {}) },
  });
}

export function currentSessionId(token: string | null) {
  return token ? hashToken(token) : null;
}
