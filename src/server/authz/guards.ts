import type { PermissionKey, RoleKey } from "@/lib/permissions/catalog";
import { ForbiddenError } from "@/server/errors";

/** The authenticated user, with role, permissions and profile ids resolved from the DB. */
export type Actor = {
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  role: RoleKey;
  roleName: string;
  permissions: ReadonlySet<PermissionKey>;
  /** Effective school: the user's school, or the school a Super Admin is currently working in. */
  schoolId: string | null;
  homeSchoolId: string | null;
  teacherId: string | null;
  studentId: string | null;
  parentId: string | null;
  sessionId: string;
};

export function can(actor: Pick<Actor, "permissions">, ...perms: PermissionKey[]) {
  return perms.every((p) => actor.permissions.has(p));
}

export function canAny(actor: Pick<Actor, "permissions">, ...perms: PermissionKey[]) {
  return perms.some((p) => actor.permissions.has(p));
}

export function assertCan(actor: Pick<Actor, "permissions">, ...perms: PermissionKey[]) {
  if (!can(actor, ...perms)) throw new ForbiddenError();
}

export function assertCanAny(actor: Pick<Actor, "permissions">, ...perms: PermissionKey[]) {
  if (!canAny(actor, ...perms)) throw new ForbiddenError();
}

export function requireSchoolId(actor: Actor): string {
  if (!actor.schoolId) throw new ForbiddenError("No school is selected.");
  return actor.schoolId;
}

export function isAdmin(actor: Pick<Actor, "role">) {
  return actor.role === "SUPER_ADMIN" || actor.role === "SCHOOL_ADMIN";
}
