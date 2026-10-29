import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import type { AuthTokenType } from "@/generated/prisma/enums";
import { audit } from "@/server/audit";
import { AppError, ValidationError } from "@/server/errors";
import { sendMail } from "@/server/mail";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const INVITE_TTL_HOURS = 72;
const RESET_TTL_MINUTES = 60;

/** Deliberately vague so attackers cannot enumerate accounts. */
const INVALID = "Invalid email or password.";

/**
 * Verifies credentials with rate limiting (per IP and per email) and account lockout.
 * Returns the user on success; throws an AppError otherwise.
 */
export async function authenticate(emailInput: string, password: string, ip: string) {
  const email = emailInput.trim().toLowerCase();
  // Generous per-IP limit: a whole school often shares one public IP (NAT). The per-email
  // limit and account lockout below are the main brute-force defences.
  await rateLimit(`login:ip:${ip}`, 300, 15 * 60);
  await rateLimit(`login:email:${email}`, 10, 15 * 60);

  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { role: true },
  });

  if (!user || !user.passwordHash) {
    await verifyPassword(password, await getDummyHash()); // equalise timing
    throw new AppError(INVALID, 401, "INVALID_CREDENTIALS");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(
      `This account is temporarily locked after too many failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.`,
      423,
      "LOCKED",
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const failed = user.failedLoginCount + 1;
    await db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit({ userId: user.id, schoolId: user.schoolId }, { action: "auth.login_failed", entity: "User", entityId: user.id, metadata: { attempts: failed } }, db, ip);
    throw new AppError(INVALID, 401, "INVALID_CREDENTIALS");
  }

  if (user.status !== "ACTIVE") {
    throw new AppError(
      user.status === "INVITED" ? "Please accept your invitation email to activate your account." : "This account has been disabled. Contact your school administrator.",
      403,
      "INACTIVE",
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  await resetRateLimit(`login:email:${email}`);
  await audit({ userId: user.id, schoolId: user.schoolId }, { action: "auth.login", entity: "User", entityId: user.id }, db, ip);
  return user;
}

async function issueToken(userId: string, type: AuthTokenType, ttlMs: number) {
  const token = generateToken();
  // Only one live token of each type per user.
  await db.authToken.deleteMany({ where: { userId, type, usedAt: null } });
  await db.authToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

/** Creates an invitation link for an INVITED user and emails it. Returns the link. */
export async function sendInvite(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, include: { school: true } });
  if (!user.email) throw new ValidationError("This person has no email address, so they cannot be invited.");
  if (user.status === "DISABLED") throw new ValidationError("This account is disabled.");
  const token = await issueToken(user.id, "INVITE", INVITE_TTL_HOURS * 3600_000);
  const link = `${env().APP_URL}/invite/${token}`;
  await sendMail({
    to: user.email,
    subject: `You're invited to ${user.school?.name ?? "Scholaris"}`,
    text: `Hello ${user.firstName},\n\nAn account has been created for you on Scholaris${user.school ? ` for ${user.school.name}` : ""}.\nSet your password using the link below (valid for ${INVITE_TTL_HOURS} hours):\n\n${link}\n\nIf you were not expecting this, you can ignore this email.`,
  });
  return link;
}

/** Always resolves silently, whether or not the account exists (prevents enumeration). */
export async function requestPasswordReset(emailInput: string, ip: string) {
  const email = emailInput.trim().toLowerCase();
  await rateLimit(`reset:ip:${ip}`, 10, 60 * 60);
  await rateLimit(`reset:email:${email}`, 3, 60 * 60);
  const user = await db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" }, status: "ACTIVE" } });
  if (!user) return;
  const token = await issueToken(user.id, "PASSWORD_RESET", RESET_TTL_MINUTES * 60_000);
  await sendMail({
    to: user.email!,
    subject: "Reset your Scholaris password",
    text: `Hello ${user.firstName},\n\nWe received a request to reset your password. Use the link below within ${RESET_TTL_MINUTES} minutes:\n\n${env().APP_URL}/reset-password/${token}\n\nIf you did not request this, you can safely ignore this email.`,
  });
  await audit({ userId: user.id, schoolId: user.schoolId }, { action: "auth.password_reset_requested", entity: "User", entityId: user.id }, db, ip);
}

/** Looks up a valid, unused token of the given type. */
export async function findValidToken(token: string, type: AuthTokenType) {
  const record = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

/** Consumes a reset/invite token and sets the password. Signs out all other sessions. */
export async function completePasswordToken(token: string, type: AuthTokenType, newPassword: string, ip: string) {
  await rateLimit(`token:ip:${ip}`, 20, 15 * 60);
  const record = await findValidToken(token, type);
  if (!record) throw new ValidationError("This link is invalid or has expired. Please request a new one.");
  if (record.user.status === "DISABLED") throw new ValidationError("This account is disabled.");
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    // Conditional update makes the token single-use even under concurrent requests.
    const used = await tx.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
    if (used.count !== 1) throw new ValidationError("This link has already been used.");
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash, status: "ACTIVE", failedLoginCount: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: record.userId } });
    await audit(
      { userId: record.userId, schoolId: record.user.schoolId },
      { action: type === "INVITE" ? "auth.invite_accepted" : "auth.password_reset", entity: "User", entityId: record.userId },
      tx,
      ip,
    );
  });
  return record.user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId: string) {
  await rateLimit(`pwchange:${userId}`, 5, 15 * 60);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ValidationError("Current password is incorrect.", { currentPassword: ["Current password is incorrect."] });
  }
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    // Sign out every other device.
    await tx.session.deleteMany({ where: { userId, NOT: { id: keepSessionId } } });
    await audit({ userId, schoolId: user.schoolId }, { action: "auth.password_changed", entity: "User", entityId: userId }, tx);
  });
}
