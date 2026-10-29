import { db, type Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { StudentStatus } from "@/generated/prisma/enums";
import { toCSV, parseCSVObjects } from "@/lib/csv";
import { parseWith } from "@/lib/validation/form";
import { studentImportRowSchema, type StudentInput } from "@/lib/validation/people";
import { audit, diff } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { assertCanViewStudent, getCurrentAcademicYear, studentScopeWhere } from "@/server/authz/scope";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { createUser, disableUser, enableUser } from "./users.service";

export type StudentListParams = {
  q?: string;
  classId?: string;
  sectionId?: string;
  status?: string;
  gender?: string;
  sort?: string;
  dir?: string;
  skip?: number;
  take?: number;
};

function listWhere(scope: Prisma.StudentWhereInput, p: StudentListParams, yearId: string | null): Prisma.StudentWhereInput {
  const and: Prisma.StudentWhereInput[] = [scope];
  if (p.q) {
    const terms = p.q.split(/\s+/).filter(Boolean).slice(0, 4);
    for (const t of terms) {
      and.push({
        OR: [
          { user: { firstName: { contains: t, mode: "insensitive" } } },
          { user: { lastName: { contains: t, mode: "insensitive" } } },
          { user: { email: { contains: t, mode: "insensitive" } } },
          { admissionNumber: { contains: t, mode: "insensitive" } },
          { studentCode: { contains: t, mode: "insensitive" } },
        ],
      });
    }
  }
  if (p.status && ["ACTIVE", "GRADUATED", "TRANSFERRED", "SUSPENDED", "ARCHIVED"].includes(p.status)) {
    and.push({ status: p.status as StudentStatus });
  } else {
    and.push({ status: { not: "ARCHIVED" } });
  }
  if (p.gender && ["MALE", "FEMALE", "OTHER"].includes(p.gender)) and.push({ gender: p.gender as "MALE" });
  if (p.sectionId) and.push({ enrollments: { some: { sectionId: p.sectionId, ...(yearId ? { academicYearId: yearId } : {}) } } });
  else if (p.classId) and.push({ enrollments: { some: { section: { classId: p.classId }, ...(yearId ? { academicYearId: yearId } : {}) } } });
  return { AND: and };
}

function orderBy(sort?: string, dir?: string): Prisma.StudentOrderByWithRelationInput[] {
  const d = dir === "desc" ? "desc" : "asc";
  switch (sort) {
    case "admission":
      return [{ admissionNumber: d }];
    case "code":
      return [{ studentCode: d }];
    case "admitted":
      return [{ admissionDate: d }];
    case "name":
    default:
      return [{ user: { firstName: d } }, { user: { lastName: d } }];
  }
}

/** Paginated, permission-scoped student list. */
export async function listStudents(actor: Actor, p: StudentListParams) {
  assertCan(actor, "students.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const where = listWhere(await studentScopeWhere(actor), p, year?.id ?? null);
  const [total, rows] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      orderBy: orderBy(p.sort, p.dir),
      skip: p.skip,
      take: p.take,
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true, avatarFileId: true, status: true } },
        enrollments: {
          where: year ? { academicYearId: year.id } : undefined,
          include: { section: { include: { class: true } } },
          take: 1,
        },
        parents: { include: { parent: { include: { user: { select: { firstName: true, lastName: true, phone: true } } } } }, take: 2 },
      },
    }),
  ]);
  return { total, rows, year };
}

export async function getStudentProfile(actor: Actor, studentId: string) {
  assertCan(actor, "students.read");
  await assertCanViewStudent(actor, studentId);
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarFileId: true, status: true, lastLoginAt: true } },
      enrollments: { include: { section: { include: { class: true, classTeacher: { include: { user: true } } } }, academicYear: true }, orderBy: { enrolledAt: "desc" } },
      parents: { include: { parent: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } } } },
    },
  });
  if (!student) throw new NotFoundError("Student");
  return student;
}

/** Next free roll number in a section. */
async function nextRollNumber(tx: Tx, sectionId: string) {
  const agg = await tx.enrollment.aggregate({ where: { sectionId }, _max: { rollNumber: true } });
  return (agg._max.rollNumber ?? 0) + 1;
}

/** Generates the next human-readable Student ID, e.g. STU-2026-0101. */
export async function nextStudentCode(tx: Tx | typeof db, schoolId: string) {
  const prefix = `STU-${new Date().getUTCFullYear()}-`;
  const last = await tx.student.findFirst({
    where: { schoolId, studentCode: { startsWith: prefix } },
    orderBy: { studentCode: "desc" },
    select: { studentCode: true },
  });
  const n = last ? Number(last.studentCode.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(4, "0")}`;
}

async function sectionForSchool(tx: Tx, schoolId: string, sectionId: string) {
  const section = await tx.section.findFirst({ where: { id: sectionId, class: { schoolId } }, include: { academicYear: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } });
  if (!section) throw new ValidationError(undefined, { sectionId: ["Select a valid class section."] });
  return section;
}

export async function createStudent(actor: Actor, input: StudentInput) {
  assertCan(actor, "students.write");
  const schoolId = requireSchoolId(actor);
  return db.$transaction(async (tx) => {
    const section = await sectionForSchool(tx, schoolId, input.sectionId);
    if (section.capacity && section._count.enrollments >= section.capacity) {
      throw new ConflictError(`Section is full (capacity ${section.capacity}).`, { sectionId: ["This section is at capacity."] });
    }
    if (input.parentId) {
      const parent = await tx.parent.findFirst({ where: { id: input.parentId, schoolId } });
      if (!parent) throw new ValidationError(undefined, { parentId: ["Select a valid parent."] });
    }
    const user = await createUser(tx, "STUDENT", schoolId, input);
    const studentCode = input.studentCode || (await nextStudentCode(tx, schoolId));
    const student = await tx.student.create({
      data: {
        userId: user.id,
        schoolId,
        studentCode,
        admissionNumber: input.admissionNumber,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        address: input.address ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        admissionDate: input.admissionDate,
        bloodGroup: input.bloodGroup ?? null,
        status: input.status,
        notes: input.notes ?? null,
      },
    });
    await tx.enrollment.create({
      data: {
        studentId: student.id,
        sectionId: section.id,
        academicYearId: section.academicYearId,
        rollNumber: input.rollNumber ?? (await nextRollNumber(tx, section.id)),
      },
    });
    if (input.parentId) {
      await tx.parentStudent.create({ data: { parentId: input.parentId, studentId: student.id, relationship: input.relationship, isPrimary: true } });
    }
    await audit(actor, { action: "student.create", entity: "Student", entityId: student.id, metadata: { studentCode, admissionNumber: input.admissionNumber, sectionId: section.id } }, tx);
    return { ...student, userId: user.id };
  });
}

export async function updateStudent(actor: Actor, studentId: string, input: StudentInput) {
  assertCan(actor, "students.write");
  const schoolId = requireSchoolId(actor);
  return db.$transaction(async (tx) => {
    const existing = await tx.student.findFirst({ where: { id: studentId, schoolId }, include: { user: true } });
    if (!existing) throw new NotFoundError("Student");
    const studentData = {
      admissionNumber: input.admissionNumber,
      studentCode: input.studentCode || existing.studentCode,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      address: input.address ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      admissionDate: input.admissionDate,
      bloodGroup: input.bloodGroup ?? null,
      status: input.status,
      notes: input.notes ?? null,
      archivedAt: input.status === "ARCHIVED" ? existing.archivedAt ?? new Date() : null,
    };
    const userData = { firstName: input.firstName, lastName: input.lastName, email: input.email ?? null, phone: input.phone ?? null };
    await tx.student.update({ where: { id: studentId }, data: studentData });
    await tx.user.update({ where: { id: existing.userId }, data: userData });
    if (input.status === "ARCHIVED" && existing.status !== "ARCHIVED") await disableUser(tx, existing.userId);
    if (input.status !== "ARCHIVED" && existing.status === "ARCHIVED") await enableUser(tx, existing.userId);

    // Section change within the current year moves the enrollment (keeps history in attendance).
    const year = await getCurrentAcademicYear(schoolId);
    const enrollment = year ? await tx.enrollment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: year.id } } }) : null;
    const section = await sectionForSchool(tx, schoolId, input.sectionId);
    if (!enrollment) {
      await tx.enrollment.create({ data: { studentId, sectionId: section.id, academicYearId: section.academicYearId, rollNumber: input.rollNumber ?? (await nextRollNumber(tx, section.id)) } });
    } else if (enrollment.sectionId !== section.id || (input.rollNumber && input.rollNumber !== enrollment.rollNumber)) {
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { sectionId: section.id, rollNumber: input.rollNumber ?? (enrollment.sectionId === section.id ? enrollment.rollNumber : await nextRollNumber(tx, section.id)) },
      });
    }
    await audit(
      actor,
      {
        action: "student.update",
        entity: "Student",
        entityId: studentId,
        metadata: { changes: { ...diff(existing as unknown as Record<string, unknown>, studentData), ...diff(existing.user as unknown as Record<string, unknown>, userData) } },
      },
      tx,
    );
    return { userId: existing.userId };
  });
}

export async function setStudentArchived(actor: Actor, studentId: string, archived: boolean) {
  assertCan(actor, "students.write");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    const s = await tx.student.findFirst({ where: { id: studentId, schoolId } });
    if (!s) throw new NotFoundError("Student");
    await tx.student.update({ where: { id: studentId }, data: { status: archived ? "ARCHIVED" : "ACTIVE", archivedAt: archived ? new Date() : null } });
    if (archived) await disableUser(tx, s.userId);
    else await enableUser(tx, s.userId);
    await audit(actor, { action: archived ? "student.archive" : "student.restore", entity: "Student", entityId: studentId }, tx);
  });
}

/**
 * Permanent deletion is only allowed for records created by mistake: a student with any
 * academic or financial history (attendance, marks, submissions, fees) must be archived.
 */
export async function deleteStudent(actor: Actor, studentId: string) {
  assertCan(actor, "students.write");
  const schoolId = requireSchoolId(actor);
  await db.$transaction(async (tx) => {
    const s = await tx.student.findFirst({
      where: { id: studentId, schoolId },
      include: { _count: { select: { attendance: true, marks: true, submissions: true, fees: true } } },
    });
    if (!s) throw new NotFoundError("Student");
    const history = s._count.attendance + s._count.marks + s._count.submissions + s._count.fees;
    if (history > 0) {
      throw new ConflictError("This student has academic or financial records and cannot be deleted. Archive the student instead.");
    }
    await tx.enrollment.deleteMany({ where: { studentId } });
    await tx.student.delete({ where: { id: studentId } });
    await tx.session.deleteMany({ where: { userId: s.userId } });
    await tx.user.delete({ where: { id: s.userId } });
    await audit(actor, { action: "student.delete", entity: "Student", entityId: studentId, metadata: { studentCode: s.studentCode, admissionNumber: s.admissionNumber } }, tx);
  });
}

export type ImportResult = { created: number; errors: Array<{ row: number; messages: string[] }> };

/**
 * Imports students from CSV. All-or-nothing: if any row is invalid nothing is written,
 * and every problem is reported with its row number so the file can be fixed in one go.
 */
export async function importStudents(actor: Actor, csvText: string): Promise<ImportResult> {
  assertCan(actor, "students.write");
  const schoolId = requireSchoolId(actor);
  const rows = parseCSVObjects(csvText);
  if (rows.length === 0) throw new ValidationError("The file has no data rows.");
  if (rows.length > 1000) throw new ValidationError("Import at most 1000 students per file.");
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) throw new ValidationError("Create an academic year before importing students.");
  const sections = await db.section.findMany({ where: { academicYearId: year.id, class: { schoolId } }, include: { class: true } });
  const sectionKey = (cls: string, sec: string) => `${cls.trim().toLowerCase()}|${sec.trim().toLowerCase()}`;
  const sectionMap = new Map(sections.map((s) => [sectionKey(s.class.name, s.name), s]));

  const errors: ImportResult["errors"] = [];
  const valid: Array<{ row: number; data: ReturnType<typeof studentImportRowSchema.parse>; sectionId: string }> = [];
  const seenAdmission = new Set<string>();
  const seenEmail = new Set<string>();
  rows.forEach((raw, i) => {
    const rowNo = i + 2; // header is row 1
    const res = parseWith(studentImportRowSchema, raw);
    if (!res.success) {
      errors.push({ row: rowNo, messages: Object.values(res.fieldErrors).flat() });
      return;
    }
    const section = sectionMap.get(sectionKey(res.data.class, res.data.section));
    const messages: string[] = [];
    if (!section) messages.push(`Unknown class/section "${res.data.class} ${res.data.section}".`);
    if (seenAdmission.has(res.data.admissionnumber)) messages.push("Duplicate admission number in file.");
    if (res.data.email && seenEmail.has(res.data.email)) messages.push("Duplicate email in file.");
    seenAdmission.add(res.data.admissionnumber);
    if (res.data.email) seenEmail.add(res.data.email);
    if (messages.length) errors.push({ row: rowNo, messages });
    else valid.push({ row: rowNo, data: res.data, sectionId: section!.id });
  });

  // Conflicts with existing data.
  const [existingAdm, existingEmails] = await Promise.all([
    db.student.findMany({ where: { schoolId, admissionNumber: { in: [...seenAdmission] } }, select: { admissionNumber: true } }),
    db.user.findMany({ where: { email: { in: [...seenEmail] } }, select: { email: true } }),
  ]);
  const admTaken = new Set(existingAdm.map((s) => s.admissionNumber));
  const emailTaken = new Set(existingEmails.map((u) => u.email));
  for (const v of valid) {
    const messages: string[] = [];
    if (admTaken.has(v.data.admissionnumber)) messages.push("Admission number already exists.");
    if (v.data.email && emailTaken.has(v.data.email)) messages.push("Email already in use.");
    if (messages.length) errors.push({ row: v.row, messages });
  }
  if (errors.length) return { created: 0, errors: errors.sort((a, b) => a.row - b.row) };

  await db.$transaction(
    async (tx) => {
      for (const v of valid) {
        const user = await createUser(tx, "STUDENT", schoolId, { firstName: v.data.firstname, lastName: v.data.lastname, email: v.data.email, phone: v.data.phone });
        const student = await tx.student.create({
          data: {
            userId: user.id,
            schoolId,
            studentCode: await nextStudentCode(tx, schoolId),
            admissionNumber: v.data.admissionnumber,
            dateOfBirth: v.data.dateofbirth,
            gender: v.data.gender,
            address: v.data.address ?? null,
            emergencyContactName: v.data.emergencycontactname ?? null,
            emergencyContactPhone: v.data.emergencycontactphone ?? null,
            admissionDate: v.data.admissiondate,
          },
        });
        await tx.enrollment.create({
          data: { studentId: student.id, sectionId: v.sectionId, academicYearId: year.id, rollNumber: v.data.rollnumber ?? (await nextRollNumber(tx, v.sectionId)) },
        });
      }
      await audit(actor, { action: "student.import", entity: "Student", metadata: { count: valid.length } }, tx);
    },
    { timeout: 60_000 },
  );
  return { created: valid.length, errors: [] };
}

export const STUDENT_IMPORT_TEMPLATE = toCSV(
  ["First Name", "Last Name", "Date of Birth", "Gender", "Admission Number", "Admission Date", "Class", "Section", "Roll Number", "Email", "Phone", "Address", "Emergency Contact Name", "Emergency Contact Phone"],
  [["Jamie", "Rivera", "2014-05-12", "FEMALE", "GIS/2026/0901", "2026-08-01", "Grade 6", "A", "", "jamie.rivera@example.com", "+1 555 123 4567", "10 Elm Court, Brookfield", "Alex Rivera", "+1 555 765 4321"]],
);

export async function exportStudentsCSV(actor: Actor, p: StudentListParams) {
  const { rows } = await listStudents(actor, { ...p, skip: 0, take: 5000 });
  await audit(actor, { action: "student.export", entity: "Student", metadata: { count: rows.length, filters: p } });
  return toCSV(
    ["Student ID", "Admission No", "First Name", "Last Name", "Gender", "Date of Birth", "Class", "Section", "Roll", "Email", "Phone", "Status", "Admission Date", "Parent/Guardian", "Parent Phone"],
    rows.map((s) => {
      const e = s.enrollments[0];
      const p0 = s.parents[0]?.parent.user;
      return [
        s.studentCode,
        s.admissionNumber,
        s.user.firstName,
        s.user.lastName,
        s.gender,
        s.dateOfBirth,
        e?.section.class.name ?? "",
        e?.section.name ?? "",
        e?.rollNumber ?? "",
        s.user.email ?? "",
        s.user.phone ?? "",
        s.status,
        s.admissionDate,
        p0 ? `${p0.firstName} ${p0.lastName}` : "",
        p0?.phone ?? "",
      ];
    }),
  );
}

/** Options for section pickers (current academic year). */
export async function sectionOptions(schoolId: string) {
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) return [];
  const sections = await db.section.findMany({
    where: { academicYearId: year.id, class: { schoolId } },
    include: { class: true },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  });
  return sections.map((s) => ({ value: s.id, label: `${s.class.name} – ${s.name}`, group: s.class.name, classId: s.classId }));
}

export async function classOptions(schoolId: string) {
  const classes = await db.class.findMany({ where: { schoolId }, orderBy: { level: "asc" } });
  return classes.map((c) => ({ value: c.id, label: c.name }));
}
