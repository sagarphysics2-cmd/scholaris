import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { Relationship } from "@/generated/prisma/enums";
import type { ParentInput } from "@/lib/validation/people";
import { audit, diff } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { isSchoolWide, studentScopeWhere } from "@/server/authz/scope";
import { NotFoundError, ValidationError } from "@/server/errors";
import { createUser, disableUser, enableUser } from "./users.service";

export async function listParents(actor: Actor, p: { q?: string; status?: string; skip?: number; take?: number }) {
  assertCan(actor, "parents.read");
  const schoolId = requireSchoolId(actor);
  const and: Prisma.ParentWhereInput[] = [{ schoolId }, { status: p.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE" }];
  if (!isSchoolWide(actor)) {
    // Teachers only see parents of students they teach.
    and.push({ children: { some: { student: await studentScopeWhere(actor) } } });
  }
  if (p.q) {
    for (const t of p.q.split(/\s+/).filter(Boolean).slice(0, 4)) {
      and.push({
        OR: [
          { user: { firstName: { contains: t, mode: "insensitive" } } },
          { user: { lastName: { contains: t, mode: "insensitive" } } },
          { user: { email: { contains: t, mode: "insensitive" } } },
          { user: { phone: { contains: t } } },
          { children: { some: { student: { user: { OR: [{ firstName: { contains: t, mode: "insensitive" } }, { lastName: { contains: t, mode: "insensitive" } }] } } } } },
        ],
      });
    }
  }
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.parent.count({ where }),
    db.parent.findMany({
      where,
      orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
      skip: p.skip,
      take: p.take,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarFileId: true, status: true } },
        children: { include: { student: { include: { user: { select: { firstName: true, lastName: true } } } } } },
      },
    }),
  ]);
  return { total, rows };
}

export async function getParent(actor: Actor, parentId: string) {
  assertCan(actor, "parents.read");
  const schoolId = requireSchoolId(actor);
  const where: Prisma.ParentWhereInput = { id: parentId, schoolId };
  if (!isSchoolWide(actor)) where.children = { some: { student: await studentScopeWhere(actor) } };
  const parent = await db.parent.findFirst({
    where,
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarFileId: true, status: true, lastLoginAt: true } },
      children: {
        include: {
          student: {
            include: {
              user: { select: { firstName: true, lastName: true, avatarFileId: true } },
              enrollments: { where: { academicYear: { isCurrent: true } }, include: { section: { include: { class: true } } } },
            },
          },
        },
      },
    },
  });
  if (!parent) throw new NotFoundError("Parent");
  return parent;
}

async function assertStudentsInSchool(schoolId: string, ids: string[]) {
  if (ids.length === 0) return;
  const count = await db.student.count({ where: { id: { in: ids }, schoolId } });
  if (count !== new Set(ids).size) throw new ValidationError(undefined, { childIds: ["One or more selected students are invalid."] });
}

export async function createParent(actor: Actor, input: ParentInput) {
  assertCan(actor, "parents.write");
  const schoolId = requireSchoolId(actor);
  await assertStudentsInSchool(schoolId, input.childIds);
  return db.$transaction(async (tx) => {
    const user = await createUser(tx, "PARENT", schoolId, input);
    const parent = await tx.parent.create({ data: { userId: user.id, schoolId, address: input.address ?? null, occupation: input.occupation ?? null } });
    for (const studentId of new Set(input.childIds)) {
      await tx.parentStudent.create({ data: { parentId: parent.id, studentId, relationship: input.relationship } });
    }
    await audit(actor, { action: "parent.create", entity: "Parent", entityId: parent.id, metadata: { children: input.childIds.length } }, tx);
    return { ...parent, userId: user.id };
  });
}

export async function updateParent(actor: Actor, parentId: string, input: ParentInput) {
  assertCan(actor, "parents.write");
  const schoolId = requireSchoolId(actor);
  return db.$transaction(async (tx) => {
    const existing = await tx.parent.findFirst({ where: { id: parentId, schoolId }, include: { user: true } });
    if (!existing) throw new NotFoundError("Parent");
    const data = { address: input.address ?? null, occupation: input.occupation ?? null };
    const userData = { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone ?? null };
    await tx.parent.update({ where: { id: parentId }, data });
    await tx.user.update({ where: { id: existing.userId }, data: userData });
    await audit(actor, { action: "parent.update", entity: "Parent", entityId: parentId, metadata: { changes: { ...diff(existing as unknown as Record<string, unknown>, data), ...diff(existing.user as unknown as Record<string, unknown>, userData) } } }, tx);
    return { userId: existing.userId };
  });
}

export async function linkChild(actor: Actor, input: { parentId: string; studentId: string; relationship: Relationship; isPrimary: boolean }) {
  assertCan(actor, "parents.write");
  const schoolId = requireSchoolId(actor);
  const [parent, student] = await Promise.all([
    db.parent.findFirst({ where: { id: input.parentId, schoolId } }),
    db.student.findFirst({ where: { id: input.studentId, schoolId } }),
  ]);
  if (!parent) throw new NotFoundError("Parent");
  if (!student) throw new ValidationError(undefined, { studentId: ["Select a valid student."] });
  await db.parentStudent.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
    update: { relationship: input.relationship, isPrimary: input.isPrimary },
    create: { parentId: parent.id, studentId: student.id, relationship: input.relationship, isPrimary: input.isPrimary },
  });
  await audit(actor, { action: "parent.link_child", entity: "Parent", entityId: parent.id, metadata: { studentId: student.id, relationship: input.relationship } });
}

export async function unlinkChild(actor: Actor, parentId: string, studentId: string) {
  assertCan(actor, "parents.write");
  const schoolId = requireSchoolId(actor);
  const link = await db.parentStudent.findFirst({ where: { parentId, studentId, parent: { schoolId } } });
  if (!link) throw new NotFoundError("Link");
  await db.parentStudent.delete({ where: { parentId_studentId: { parentId, studentId } } });
  await audit(actor, { action: "parent.unlink_child", entity: "Parent", entityId: parentId, metadata: { studentId } });
}

export async function setParentArchived(actor: Actor, parentId: string, archived: boolean) {
  assertCan(actor, "parents.write");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    const p = await tx.parent.findFirst({ where: { id: parentId, schoolId } });
    if (!p) throw new NotFoundError("Parent");
    await tx.parent.update({ where: { id: parentId }, data: { status: archived ? "ARCHIVED" : "ACTIVE" } });
    if (archived) await disableUser(tx, p.userId);
    else await enableUser(tx, p.userId);
    await audit(actor, { action: archived ? "parent.archive" : "parent.restore", entity: "Parent", entityId: parentId }, tx);
  });
}

export async function studentPickerOptions(schoolId: string) {
  const students = await db.student.findMany({
    where: { schoolId, status: { not: "ARCHIVED" } },
    include: { user: true, enrollments: { where: { academicYear: { isCurrent: true } }, include: { section: { include: { class: true } } } } },
    orderBy: [{ user: { firstName: "asc" } }],
  });
  return students.map((s) => {
    const e = s.enrollments[0];
    return { value: s.id, label: `${s.user.firstName} ${s.user.lastName} · ${s.admissionNumber}${e ? ` · ${e.section.class.name}-${e.section.name}` : ""}` };
  });
}
