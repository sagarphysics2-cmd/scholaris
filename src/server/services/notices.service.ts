import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { NoticeInput } from "@/lib/validation/notices";
import { audit } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { getCurrentAcademicYear, isSchoolWide, parentChildIds, teacherSectionIds } from "@/server/authz/scope";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { dispatchExternal, notifyUsers } from "@/server/notifications";
import { deleteStoredFile, storeUpload } from "./files.service";

/** Audience filter: which notices this actor is addressed by. */
async function audienceWhere(actor: Actor): Promise<Prisma.NoticeWhereInput> {
  if (isSchoolWide(actor)) return {};
  const year = await getCurrentAcademicYear(requireSchoolId(actor));
  let sectionIds: string[] = [];
  const roleAudience: Array<"TEACHERS" | "STUDENTS" | "PARENTS"> = [];
  if (actor.teacherId) {
    roleAudience.push("TEACHERS");
    sectionIds = await teacherSectionIds(actor.teacherId, year?.id);
  }
  if (actor.studentId || actor.parentId) {
    roleAudience.push(actor.studentId ? "STUDENTS" : "PARENTS");
    const studentIds = actor.studentId ? [actor.studentId] : await parentChildIds(actor.parentId!);
    const enr = await db.enrollment.findMany({ where: { studentId: { in: studentIds }, academicYearId: year?.id }, select: { sectionId: true } });
    sectionIds = enr.map((e) => e.sectionId);
  }
  const classIds = (await db.section.findMany({ where: { id: { in: sectionIds } }, select: { classId: true } })).map((s) => s.classId);
  return {
    OR: [
      { audience: "SCHOOL" },
      { audience: { in: roleAudience } },
      { audience: "CLASS", classId: { in: classIds } },
      { audience: "SECTION", sectionId: { in: sectionIds } },
      { authorId: actor.userId },
    ],
  };
}

function liveWhere(now = new Date()): Prisma.NoticeWhereInput {
  return { publishDate: { lte: now }, OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] };
}

export async function listNotices(actor: Actor, p: { q?: string; scope?: string; skip?: number; take?: number }) {
  assertCan(actor, "notices.read");
  const schoolId = requireSchoolId(actor);
  const and: Prisma.NoticeWhereInput[] = [{ schoolId }, await audienceWhere(actor)];
  const canSeeAll = actor.permissions.has("notices.manage");
  const now = new Date();
  if (p.scope === "scheduled" && canSeeAll) and.push({ publishDate: { gt: now } });
  else if (p.scope === "expired" && canSeeAll) and.push({ expiryDate: { lte: now } });
  else if (p.scope === "mine") and.push({ authorId: actor.userId });
  else and.push(liveWhere(now));
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { message: { contains: p.q, mode: "insensitive" } }] });
  const where = { AND: and };
  const [total, rows] = await Promise.all([
    db.notice.count({ where }),
    db.notice.findMany({
      where,
      orderBy: [{ isPinned: "desc" }, { publishDate: "desc" }],
      skip: p.skip,
      take: p.take,
      include: { author: { select: { firstName: true, lastName: true, avatarFileId: true } }, class: true, section: { include: { class: true } }, _count: { select: { attachments: true } } },
    }),
  ]);
  return { total, rows };
}

export async function recentNotices(actor: Actor, take = 5) {
  return (await listNotices(actor, { take })).rows;
}

export async function getNotice(actor: Actor, id: string) {
  assertCan(actor, "notices.read");
  const schoolId = requireSchoolId(actor);
  const notice = await db.notice.findFirst({
    where: { AND: [{ id, schoolId }, await audienceWhere(actor), actor.permissions.has("notices.manage") ? {} : { OR: [liveWhere(), { authorId: actor.userId }] }] },
    include: { author: { select: { firstName: true, lastName: true, avatarFileId: true } }, class: true, section: { include: { class: true } }, attachments: true },
  });
  if (!notice) throw new NotFoundError("Notice");
  const canEdit = actor.permissions.has("notices.manage") || (notice.authorId === actor.userId && actor.permissions.has("notices.publish"));
  return { ...notice, canEdit };
}

/** Teachers may only address sections/classes they teach; admins may address anyone. */
async function assertCanAddress(actor: Actor, input: NoticeInput) {
  const schoolId = requireSchoolId(actor);
  if (input.classId && !(await db.class.findFirst({ where: { id: input.classId, schoolId } }))) throw new ValidationError(undefined, { classId: ["Choose a valid class."] });
  if (input.sectionId && !(await db.section.findFirst({ where: { id: input.sectionId, class: { schoolId } } }))) throw new ValidationError(undefined, { sectionId: ["Choose a valid section."] });
  if (actor.permissions.has("notices.manage")) return;
  if (!actor.teacherId) throw new ForbiddenError();
  const mine = await teacherSectionIds(actor.teacherId);
  if (input.audience === "SECTION" && input.sectionId && mine.includes(input.sectionId)) return;
  if (input.audience === "CLASS" && input.classId) {
    const sections = await db.section.findMany({ where: { classId: input.classId, id: { in: mine } } });
    if (sections.length) return;
  }
  throw new ForbiddenError("Teachers can only post announcements to classes or sections they teach.");
}

/** Users a notice is addressed to (used for in-app notifications). */
export async function noticeAudienceUserIds(n: { schoolId: string; audience: string; classId: string | null; sectionId: string | null }) {
  const year = await getCurrentAcademicYear(n.schoolId);
  const usersOf = async (role: string) =>
    (await db.user.findMany({ where: { schoolId: n.schoolId, status: "ACTIVE", role: { key: role } }, select: { id: true } })).map((u) => u.id);
  if (n.audience === "SCHOOL") return [...(await usersOf("TEACHER")), ...(await usersOf("STUDENT")), ...(await usersOf("PARENT")), ...(await usersOf("SCHOOL_ADMIN"))];
  if (n.audience === "TEACHERS") return usersOf("TEACHER");
  if (n.audience === "STUDENTS") return usersOf("STUDENT");
  if (n.audience === "PARENTS") return usersOf("PARENT");
  const sectionFilter = n.audience === "SECTION" ? { sectionId: n.sectionId! } : { section: { classId: n.classId! } };
  const enrollments = await db.enrollment.findMany({
    where: { ...sectionFilter, academicYearId: year?.id, status: "ACTIVE" },
    select: { student: { select: { userId: true, parents: { select: { parent: { select: { userId: true } } } } } } },
  });
  return enrollments.flatMap((e) => [e.student.userId, ...e.student.parents.map((p) => p.parent.userId)]);
}

async function notifyAudience(notice: { id: string; schoolId: string; title: string; audience: string; classId: string | null; sectionId: string | null; authorId: string }) {
  const ids = (await noticeAudienceUserIds(notice)).filter((id) => id !== notice.authorId);
  const input = { type: "NOTICE" as const, title: `New notice: ${notice.title}`, body: notice.title, link: `/notices/${notice.id}` };
  await notifyUsers(ids, input);
  await db.notice.update({ where: { id: notice.id }, data: { notifiedAt: new Date() } });
  await dispatchExternal(notice.schoolId, ids, input);
}

export async function createNotice(actor: Actor, input: NoticeInput, files: File[]) {
  assertCan(actor, "notices.publish");
  const schoolId = requireSchoolId(actor);
  await assertCanAddress(actor, input);
  if (files.length > 5) throw new ValidationError("Attach at most 5 files.");
  const data = {
    ...input,
    classId: input.audience === "CLASS" ? input.classId ?? null : null,
    sectionId: input.audience === "SECTION" ? input.sectionId ?? null : null,
    isPinned: actor.permissions.has("notices.manage") ? input.isPinned : false,
  };
  const notice = await db.notice.create({ data: { ...data, schoolId, authorId: actor.userId } });
  try {
    for (const f of files) await storeUpload(actor, f, "NOTICE_ATTACHMENT", { noticeId: notice.id });
  } catch (err) {
    await db.notice.delete({ where: { id: notice.id } });
    throw err;
  }
  await audit(actor, { action: "notice.publish", entity: "Notice", entityId: notice.id, metadata: { title: notice.title, audience: notice.audience, publishDate: notice.publishDate } });
  if (notice.publishDate <= new Date()) await notifyAudience(notice);
  return notice;
}

export async function updateNotice(actor: Actor, id: string, input: NoticeInput, files: File[]) {
  const existing = await getNotice(actor, id);
  if (!existing.canEdit) throw new ForbiddenError();
  await assertCanAddress(actor, input);
  if (existing.attachments.length + files.length > 5) throw new ValidationError("A notice can have at most 5 attachments.");
  await db.notice.update({
    where: { id },
    data: {
      ...input,
      classId: input.audience === "CLASS" ? input.classId ?? null : null,
      sectionId: input.audience === "SECTION" ? input.sectionId ?? null : null,
      isPinned: actor.permissions.has("notices.manage") ? input.isPinned : existing.isPinned,
    },
  });
  for (const f of files) await storeUpload(actor, f, "NOTICE_ATTACHMENT", { noticeId: id });
  await audit(actor, { action: "notice.update", entity: "Notice", entityId: id, metadata: { title: input.title } });
}

export async function deleteNotice(actor: Actor, id: string) {
  const existing = await getNotice(actor, id);
  if (!existing.canEdit) throw new ForbiddenError();
  for (const f of existing.attachments) await deleteStoredFile(f.id);
  await db.notice.delete({ where: { id } });
  await audit(actor, { action: "notice.delete", entity: "Notice", entityId: id, metadata: { title: existing.title } });
}

/** Cron: notify audiences of scheduled notices that have gone live. */
export async function notifyDueNotices() {
  const due = await db.notice.findMany({ where: { notifiedAt: null, publishDate: { lte: new Date() } }, take: 100 });
  for (const n of due) await notifyAudience(n);
  return due.length;
}

export async function noticeTargetOptions(actor: Actor) {
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const manage = actor.permissions.has("notices.manage");
  const mine = !manage && actor.teacherId ? await teacherSectionIds(actor.teacherId, year?.id) : null;
  const sections = await db.section.findMany({
    where: { academicYearId: year?.id ?? "__none__", class: { schoolId }, ...(mine ? { id: { in: mine } } : {}) },
    include: { class: true },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  });
  const classes = new Map(sections.map((s) => [s.classId, s.class.name]));
  return {
    manage,
    classes: [...classes.entries()].map(([value, label]) => ({ value, label })),
    sections: sections.map((s) => ({ value: s.id, label: `${s.class.name} – ${s.name}` })),
  };
}
