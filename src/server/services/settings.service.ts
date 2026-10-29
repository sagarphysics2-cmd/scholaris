import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { DEFAULT_GRADE_SCALE } from "@/lib/grading";
import { PERMISSION_KEYS, type PermissionKey, type RoleKey } from "@/lib/permissions/catalog";
import { parseSettings, type SchoolSettings } from "@/lib/validation/settings";
import { toNumber } from "@/lib/utils";
import { audit, diff } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { sendInvite } from "./auth.service";
import { deleteStoredFile, storeUpload } from "./files.service";
import { roleId } from "./users.service";

export async function getSchoolSettingsBundle(actor: Actor) {
  assertCan(actor, "settings.manage");
  const schoolId = requireSchoolId(actor);
  const [school, grades] = await Promise.all([
    db.school.findUniqueOrThrow({ where: { id: schoolId } }),
    db.gradeScale.findMany({ where: { schoolId }, orderBy: { minPercent: "desc" } }),
  ]);
  return { school, settings: parseSettings(school.settings), grades: grades.map((g) => ({ grade: g.grade, minPercent: toNumber(g.minPercent), gradePoint: g.gradePoint === null ? null : toNumber(g.gradePoint), remark: g.remark })) };
}

export async function updateSchoolProfile(actor: Actor, input: { name: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null }, logo?: File) {
  assertCan(actor, "settings.manage");
  const schoolId = requireSchoolId(actor);
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  const data = { name: input.name, address: input.address ?? null, phone: input.phone ?? null, email: input.email ?? null, website: input.website ?? null };
  let logoFileId = school.logoFileId;
  if (logo) {
    const f = await storeUpload(actor, logo, "SCHOOL_LOGO");
    logoFileId = f.id;
  }
  await db.school.update({ where: { id: schoolId }, data: { ...data, logoFileId } });
  if (logo && school.logoFileId) await deleteStoredFile(school.logoFileId);
  await audit(actor, { action: "settings.school_profile", entity: "School", entityId: schoolId, metadata: { changes: diff(school as unknown as Record<string, unknown>, data), logo: Boolean(logo) } });
}

/** Merges a settings section into the JSON settings, validating the result as a whole. */
export async function updateSettingsSection<K extends keyof SchoolSettings>(actor: Actor, section: K, value: SchoolSettings[K]) {
  assertCan(actor, "settings.manage");
  const schoolId = requireSchoolId(actor);
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  const current = parseSettings(school.settings);
  const next = parseSettings({ ...current, [section]: value });
  await db.school.update({ where: { id: schoolId }, data: { settings: next as unknown as Prisma.InputJsonValue } });
  await audit(actor, { action: `settings.${String(section)}`, entity: "School", entityId: schoolId, metadata: { from: current[section], to: next[section] } as Record<string, unknown> });
}

export async function updateGeneralSettings(actor: Actor, input: { currency: string; timezone: string; schoolDays: number[] }) {
  assertCan(actor, "settings.manage");
  const schoolId = requireSchoolId(actor);
  const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
  const current = parseSettings(school.settings);
  try {
    new Intl.DateTimeFormat("en", { timeZone: input.timezone });
  } catch {
    throw new ValidationError(undefined, { timezone: ["Unknown time zone. Use an IANA name such as Europe/London."] });
  }
  const next = parseSettings({ ...current, currency: input.currency, timezone: input.timezone, schoolDays: [...new Set(input.schoolDays)].sort() });
  await db.school.update({ where: { id: schoolId }, data: { settings: next as unknown as Prisma.InputJsonValue } });
  await audit(actor, { action: "settings.general", entity: "School", entityId: schoolId, metadata: input });
}

export async function saveGradingRules(actor: Actor, overallPassPercent: number, grades: Array<{ grade: string; minPercent: number; gradePoint: number | null; remark: string | null }>) {
  assertCan(actor, "settings.manage");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    await tx.gradeScale.deleteMany({ where: { schoolId } });
    await tx.gradeScale.createMany({ data: grades.map((g) => ({ schoolId, grade: g.grade.toUpperCase(), minPercent: g.minPercent, gradePoint: g.gradePoint, remark: g.remark })) });
    const school = await tx.school.findUniqueOrThrow({ where: { id: schoolId } });
    const s = parseSettings(school.settings);
    await tx.school.update({ where: { id: schoolId }, data: { settings: { ...s, exams: { overallPassPercent } } as unknown as Prisma.InputJsonValue } });
    await audit(actor, { action: "settings.grading", entity: "School", entityId: schoolId, metadata: { overallPassPercent, grades } }, tx);
  });
}

// ─── Roles & permissions ────────────────────────────────────────────────────

export async function listRoles(actor: Actor) {
  assertCan(actor, "roles.manage");
  return db.role.findMany({ include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }, orderBy: { name: "asc" } });
}

/** Permissions a Super Admin must always keep, so nobody can lock the system out. */
const SUPER_ADMIN_LOCKED: PermissionKey[] = ["roles.manage", "admins.manage", "schools.manage", "settings.manage"];

export async function setRolePermissions(actor: Actor, roleIdValue: string, keys: string[]) {
  assertCan(actor, "roles.manage");
  const role = await db.role.findUnique({ where: { id: roleIdValue }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw new NotFoundError("Role");
  const valid = keys.filter((k): k is PermissionKey => (PERMISSION_KEYS as string[]).includes(k));
  if (role.key === "SUPER_ADMIN" && SUPER_ADMIN_LOCKED.some((k) => !valid.includes(k))) {
    throw new ValidationError("Super Admins must keep the system-management permissions.");
  }
  const perms = await db.permission.findMany({ where: { key: { in: valid } } });
  const before = role.permissions.map((p) => p.permission.key as PermissionKey);
  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
    await audit(actor, { action: "role.permissions_update", entity: "Role", entityId: role.id, metadata: { role: role.key, added: valid.filter((k) => !before.includes(k)), removed: before.filter((k) => !valid.includes(k)) } }, tx);
  });
}

// ─── Administrators ─────────────────────────────────────────────────────────

export async function listAdmins(actor: Actor) {
  assertCan(actor, "admins.manage");
  return db.user.findMany({
    where: { role: { key: { in: ["SUPER_ADMIN", "SCHOOL_ADMIN"] } } },
    include: { role: true, school: { select: { name: true } } },
    orderBy: [{ role: { key: "desc" } }, { lastName: "asc" }],
  });
}

export async function createAdmin(actor: Actor, input: { firstName: string; lastName: string; email: string; phone?: string | null; role: "SCHOOL_ADMIN" | "SUPER_ADMIN"; schoolId?: string | null }) {
  assertCan(actor, "admins.manage");
  if (input.role === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  const schoolId = input.role === "SUPER_ADMIN" ? null : input.schoolId || actor.schoolId;
  if (input.role === "SCHOOL_ADMIN" && (!schoolId || !(await db.school.findUnique({ where: { id: schoolId } })))) {
    throw new ValidationError(undefined, { schoolId: ["Choose a school."] });
  }
  const user = await db.user.create({
    data: { firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone ?? null, status: "INVITED", roleId: await roleId(input.role), schoolId },
  });
  await audit(actor, { action: "admin.create", entity: "User", entityId: user.id, metadata: { role: input.role, schoolId } });
  const link = await sendInvite(user.id);
  return { user, link };
}

/** Enable/disable an account (any role). Admins cannot disable themselves. */
export async function setUserDisabled(actor: Actor, userId: string, disabled: boolean) {
  assertCan(actor, "admins.manage");
  if (userId === actor.userId) throw new ConflictError("You can't disable your own account.");
  const user = await db.user.findUnique({ where: { id: userId }, include: { role: true } });
  if (!user) throw new NotFoundError("User");
  if (user.role.key === "SUPER_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError();
  if (disabled && user.role.key === "SUPER_ADMIN") {
    const others = await db.user.count({ where: { role: { key: "SUPER_ADMIN" }, status: "ACTIVE", NOT: { id: userId } } });
    if (others === 0) throw new ConflictError("At least one active Super Admin is required.");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: disabled ? "DISABLED" : user.passwordHash ? "ACTIVE" : "INVITED" } });
    if (disabled) await tx.session.deleteMany({ where: { userId } });
    await audit(actor, { action: disabled ? "user.disable" : "user.enable", entity: "User", entityId: userId, metadata: { role: user.role.key as RoleKey } }, tx);
  });
}

// ─── Schools ───────────────────────────────────────────────────────────────

export async function listSchools(actor: Actor) {
  assertCan(actor, "schools.manage");
  return db.school.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { students: true, teachers: true, users: true } } } });
}

export async function saveSchool(actor: Actor, input: { name: string; code: string; address?: string | null; phone?: string | null; email?: string | null; website?: string | null }, id?: string) {
  assertCan(actor, "schools.manage");
  const data = { name: input.name, code: input.code, address: input.address ?? null, phone: input.phone ?? null, email: input.email ?? null, website: input.website ?? null };
  if (id) {
    await db.school.update({ where: { id }, data });
    await audit(actor, { action: "school.update", entity: "School", entityId: id, metadata: data });
    return id;
  }
  // New schools start with sensible defaults: settings, grading scale and a bell schedule.
  const school = await db.school.create({
    data: {
      ...data,
      settings: parseSettings({}) as unknown as Prisma.InputJsonValue,
      gradeScales: { create: DEFAULT_GRADE_SCALE.map((g) => ({ grade: g.grade, minPercent: g.minPercent, gradePoint: g.gradePoint, remark: g.remark })) },
      periods: {
        create: [
          ["Period 1", "08:00", "08:45"], ["Period 2", "08:50", "09:35"], ["Period 3", "09:55", "10:40"], ["Period 4", "10:45", "11:30"], ["Period 5", "12:15", "13:00"], ["Period 6", "13:05", "13:50"],
        ].map(([name, startTime, endTime], i) => ({ name: name!, startTime: startTime!, endTime: endTime!, sortOrder: i + 1 })),
      },
    },
  });
  const now = new Date();
  const y = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  await db.academicYear.create({ data: { schoolId: school.id, name: `${y}–${y + 1}`, startDate: new Date(Date.UTC(y, 7, 1)), endDate: new Date(Date.UTC(y + 1, 5, 30)), isCurrent: true } });
  await audit(actor, { action: "school.create", entity: "School", entityId: school.id, metadata: data });
  return school.id;
}

// ─── Audit log ────────────────────────────────────────────────────────────

export async function listAuditLogs(actor: Actor, p: { q?: string; entity?: string; action?: string; userId?: string; skip?: number; take?: number }) {
  assertCan(actor, "audit.view");
  const where: Prisma.AuditLogWhereInput = actor.role === "SUPER_ADMIN" ? {} : { schoolId: requireSchoolId(actor) };
  if (p.entity) where.entity = p.entity;
  if (p.action) where.action = { startsWith: p.action };
  if (p.userId) where.userId = p.userId;
  if (p.q) where.OR = [{ action: { contains: p.q, mode: "insensitive" } }, { entityId: p.q }, { user: { OR: [{ firstName: { contains: p.q, mode: "insensitive" } }, { lastName: { contains: p.q, mode: "insensitive" } }, { email: { contains: p.q, mode: "insensitive" } }] } }];
  const [total, rows, entities] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take, include: { user: { select: { firstName: true, lastName: true, email: true } } } }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
  ]);
  return { total, rows, entities: entities.map((e) => e.entity) };
}
