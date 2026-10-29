import { db } from "@/lib/db";
import type { PermissionKey, RoleKey } from "@/lib/permissions/catalog";
import type { Actor } from "./guards";

/**
 * Builds an Actor from a user id: role, DB-granted permissions and profile ids.
 * Pure data loading (no cookies/headers) so tests and scripts can use it too.
 * `preferredSchoolId` is the school a Super Admin chose with the switcher.
 */
export async function buildActor(userId: string, sessionId: string, preferredSchoolId?: string | null): Promise<Actor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
      teacher: { select: { id: true, status: true } },
      student: { select: { id: true, status: true } },
      parent: { select: { id: true, status: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") return null;

  const role = user.role.key as RoleKey;
  let schoolId = user.schoolId;
  if (role === "SUPER_ADMIN") {
    const school = preferredSchoolId ? await db.school.findUnique({ where: { id: preferredSchoolId }, select: { id: true } }) : null;
    schoolId = school?.id ?? (await db.school.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
  }

  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarFileId: user.avatarFileId,
    role,
    roleName: user.role.name,
    permissions: new Set(user.role.permissions.map((rp) => rp.permission.key as PermissionKey)),
    schoolId,
    homeSchoolId: user.schoolId,
    teacherId: user.teacher?.status === "ACTIVE" ? user.teacher.id : null,
    studentId: user.student && user.student.status !== "ARCHIVED" ? user.student.id : null,
    parentId: user.parent?.status === "ACTIVE" ? user.parent.id : null,
    sessionId,
  };
}
