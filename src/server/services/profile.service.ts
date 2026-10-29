import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { RoleKey } from "@/lib/permissions/catalog";
import type { PermissionKey } from "@/lib/permissions/catalog";
import { audit } from "@/server/audit";
import { can, type Actor } from "@/server/authz/guards";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { deleteStoredFile, storeUpload } from "./files.service";

const MANAGE_PERMISSION: Record<RoleKey, PermissionKey> = {
  STUDENT: "students.write",
  TEACHER: "teachers.write",
  PARENT: "parents.write",
  SCHOOL_ADMIN: "admins.manage",
  SUPER_ADMIN: "admins.manage",
};

/** The actor may manage a user when it is themselves, or an admin with the right permission in the same school. */
export async function assertCanManageUser(actor: Actor, userId: string) {
  if (userId === actor.userId) return;
  const target = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!target) throw new NotFoundError("User");
  const role = target.role.key as RoleKey;
  if (!can(actor, MANAGE_PERMISSION[role])) throw new ForbiddenError();
  if (role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  if (role !== "SUPER_ADMIN" && target.schoolId !== actor.schoolId) throw new NotFoundError("User");
}

export async function setUserAvatar(actor: Actor, userId: string, file: File) {
  await assertCanManageUser(actor, userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarFileId: true, schoolId: true } });
  const stored = await storeUpload({ userId: actor.userId, schoolId: user.schoolId }, file, "AVATAR");
  await db.user.update({ where: { id: userId }, data: { avatarFileId: stored.id } });
  if (user.avatarFileId) await deleteStoredFile(user.avatarFileId);
  await audit(actor, { action: "user.avatar_update", entity: "User", entityId: userId });
}

export async function removeUserAvatar(actor: Actor, userId: string) {
  await assertCanManageUser(actor, userId);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarFileId: true } });
  if (!user.avatarFileId) return;
  await db.user.update({ where: { id: userId }, data: { avatarFileId: null } });
  await deleteStoredFile(user.avatarFileId);
}

export async function updateOwnContact(actor: Actor, phone: string | null) {
  await db.user.update({ where: { id: actor.userId }, data: { phone } });
  await audit(actor, { action: "user.profile_update", entity: "User", entityId: actor.userId, metadata: { phone: Boolean(phone) } });
}

export async function listOwnSessions(actor: Actor) {
  return db.session.findMany({
    where: { userId: actor.userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });
}

export async function revokeOwnSession(actor: Actor, sessionId: string) {
  // Scoped by userId so nobody can revoke someone else's session by guessing an id.
  await db.session.deleteMany({ where: { id: sessionId, userId: actor.userId } });
  await audit(actor, { action: "auth.session_revoked", entity: "Session" });
}

export async function revokeOtherSessions(actor: Actor) {
  const res = await db.session.deleteMany({ where: { userId: actor.userId, NOT: { id: actor.sessionId } } });
  await audit(actor, { action: "auth.sessions_revoked", entity: "Session", metadata: { count: res.count } });
  return res.count;
}

/**
 * When email is not configured (console driver), admins may copy the invite link to
 * share it manually. With real email delivery the link is never exposed in the UI.
 */
export function inviteLinkForAdmin(link: string) {
  return env().MAIL_DRIVER === "console" ? link : null;
}
