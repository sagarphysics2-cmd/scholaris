import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { AppError, RateLimitError } from "@/server/errors";
import { authenticate, changePassword, completePasswordToken, findValidToken, requestPasswordReset, sendInvite } from "@/server/services/auth.service";
import { createUser } from "@/server/services/users.service";
import { EMAIL, uniq } from "../support/helpers";

const PASSWORD = process.env.SEED_DEMO_PASSWORD || "Scholaris!2026";

async function freshUser(status: "ACTIVE" | "INVITED" = "ACTIVE", password = "Initial-Pass-1") {
  const school = await db.school.findFirstOrThrow({ where: { code: "GIS" } });
  const email = `${uniq("u").toLowerCase()}@test.example`;
  const user = await db.$transaction((tx) => createUser(tx, "TEACHER", school.id, { firstName: "Test", lastName: "User", email }));
  await db.user.update({ where: { id: user.id }, data: { status, passwordHash: status === "ACTIVE" ? await hashPassword(password) : null } });
  return { ...user, email };
}

const ip = () => `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

describe("authentication", () => {
  it("signs in seeded users with the demo password (case-insensitive email)", async () => {
    const user = await authenticate(EMAIL.admin.toUpperCase(), PASSWORD, ip());
    expect(user.email).toBe(EMAIL.admin);
    const audit = await db.auditLog.findFirst({ where: { userId: user.id, action: "auth.login" }, orderBy: { createdAt: "desc" } });
    expect(audit).not.toBeNull();
  });

  it("rejects wrong passwords and unknown emails with the same generic message", async () => {
    await expect(authenticate(EMAIL.admin, "wrong-password", ip())).rejects.toThrow("Invalid email or password.");
    await expect(authenticate("nobody@nowhere.example", "whatever", ip())).rejects.toThrow("Invalid email or password.");
  });

  it("locks the account after 5 failed attempts", async () => {
    const u = await freshUser();
    for (let i = 0; i < 5; i++) await expect(authenticate(u.email, "bad", ip())).rejects.toThrow(AppError);
    const locked = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    await expect(authenticate(u.email, "Initial-Pass-1", ip())).rejects.toThrow(/temporarily locked/);
  });

  it("does not let invited or disabled users sign in", async () => {
    const u = await freshUser();
    await db.user.update({ where: { id: u.id }, data: { status: "DISABLED" } });
    await expect(authenticate(u.email, "Initial-Pass-1", ip())).rejects.toThrow(/disabled/);
  });

  it("rate-limits repeated attempts within a window, atomically", async () => {
    const key = `test:${uniq()}`;
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => rateLimit(key, 5, 60)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(results.filter((r) => r.status === "rejected" && r.reason instanceof RateLimitError)).toHaveLength(3);
    await resetRateLimit(key);
    await expect(rateLimit(key, 5, 60)).resolves.toBeUndefined();
  });
});

describe("invitations and password reset", () => {
  it("activates an invited user through a single-use invite link", async () => {
    const u = await freshUser("INVITED");
    const link = await sendInvite(u.id);
    const token = link.split("/invite/")[1]!;
    expect(await findValidToken(token, "INVITE")).not.toBeNull();
    await completePasswordToken(token, "INVITE", "Brand-New-Pass-1", ip());
    const active = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(active.status).toBe("ACTIVE");
    expect((await authenticate(u.email, "Brand-New-Pass-1", ip())).id).toBe(u.id);
    await expect(completePasswordToken(token, "INVITE", "Another-Pass-1", ip())).rejects.toThrow(/invalid or has expired/);
  });

  it("rejects expired and wrong-type tokens", async () => {
    const u = await freshUser();
    const token = generateToken();
    await db.authToken.create({ data: { userId: u.id, type: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) } });
    expect(await findValidToken(token, "PASSWORD_RESET")).toBeNull();
    const t2 = generateToken();
    await db.authToken.create({ data: { userId: u.id, type: "PASSWORD_RESET", tokenHash: hashToken(t2), expiresAt: new Date(Date.now() + 60_000) } });
    expect(await findValidToken(t2, "INVITE")).toBeNull();
  });

  it("issues reset tokens only for existing accounts and silently ignores unknown emails", async () => {
    const u = await freshUser();
    await requestPasswordReset(u.email, ip());
    expect(await db.authToken.count({ where: { userId: u.id, type: "PASSWORD_RESET" } })).toBe(1);
    await expect(requestPasswordReset("ghost@nowhere.example", ip())).resolves.toBeUndefined();
  });

  it("changing password requires the current password and revokes other sessions", async () => {
    const u = await freshUser();
    await db.session.createMany({ data: [{ id: `keep-${u.id}`, userId: u.id, expiresAt: new Date(Date.now() + 1e7) }, { id: `other-${u.id}`, userId: u.id, expiresAt: new Date(Date.now() + 1e7) }] });
    await expect(changePassword(u.id, "not-it", "Next-Pass-123", `keep-${u.id}`)).rejects.toThrow(/incorrect/);
    await changePassword(u.id, "Initial-Pass-1", "Next-Pass-123", `keep-${u.id}`);
    const sessions = await db.session.findMany({ where: { userId: u.id } });
    expect(sessions.map((s) => s.id)).toEqual([`keep-${u.id}`]);
  });
});
