import { db, type Tx } from "@/lib/db";
import type { RoleKey } from "@/lib/permissions/catalog";
import { NotFoundError } from "@/server/errors";

const roleCache = new Map<string, string>();

export async function roleId(key: RoleKey, client: Tx | typeof db = db): Promise<string> {
  const cached = roleCache.get(key);
  if (cached) return cached;
  const role = await client.role.findUnique({ where: { key }, select: { id: true } });
  if (!role) throw new NotFoundError(`Role ${key}`);
  roleCache.set(key, role.id);
  return role.id;
}

export type PersonInput = {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
};

/**
 * Creates the login identity for a person. Users with an email start as INVITED until
 * they set a password via their invitation link; users without email cannot sign in.
 */
export async function createUser(tx: Tx, role: RoleKey, schoolId: string | null, p: PersonInput) {
  return tx.user.create({
    data: {
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email ?? null,
      phone: p.phone ?? null,
      // No email → no portal login; nothing to "invite", so the record is simply active.
      status: p.email ? "INVITED" : "ACTIVE",
      roleId: await roleId(role, tx),
      schoolId,
    },
  });
}

/** Disables login and revokes every session (used when archiving a person). */
export async function disableUser(tx: Tx, userId: string) {
  await tx.user.update({ where: { id: userId }, data: { status: "DISABLED" } });
  await tx.session.deleteMany({ where: { userId } });
}

/** Re-enables a user: ACTIVE if they already set a password, otherwise INVITED. */
export async function enableUser(tx: Tx, userId: string) {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  await tx.user.update({ where: { id: userId }, data: { status: u.passwordHash ? "ACTIVE" : "INVITED" } });
}
