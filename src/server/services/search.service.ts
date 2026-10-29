import { db } from "@/lib/db";
import { can, requireSchoolId, type Actor } from "@/server/authz/guards";
import { getCurrentAcademicYear, isSchoolWide, teacherSectionIds } from "@/server/authz/scope";
import { listAssignments } from "./assignments.service";
import { listNotices } from "./notices.service";
import { listStudents } from "./students.service";
import { listTeachers } from "./teachers.service";

export type SearchHit = { id: string; title: string; subtitle: string; href: string; avatarFileId?: string | null };
export type SearchGroup = { key: string; label: string; hits: SearchHit[] };

/**
 * Global search. Each group reuses the module's own permission-scoped query, so search can
 * never reveal a record the user couldn't open directly.
 */
export async function globalSearch(actor: Actor, raw: string): Promise<SearchGroup[]> {
  const q = raw.trim().slice(0, 100);
  if (q.length < 2) return [];
  const schoolId = requireSchoolId(actor);
  const take = 8;
  const groups: Array<Promise<SearchGroup | null>> = [];

  if (can(actor, "students.read")) {
    groups.push(
      listStudents(actor, { q, take }).then(({ rows }) => ({
        key: "students",
        label: actor.parentId ? "My children" : "Students",
        hits: rows.map((s) => {
          const e = s.enrollments[0];
          return { id: s.id, title: `${s.user.firstName} ${s.user.lastName}`, subtitle: `${s.studentCode} · ${s.admissionNumber}${e ? ` · ${e.section.class.name}-${e.section.name}` : ""}`, href: `/students/${s.id}`, avatarFileId: s.user.avatarFileId };
        }),
      })),
    );
  }
  if (can(actor, "teachers.read")) {
    groups.push(
      listTeachers(actor, { q, take }).then(({ rows }) => ({
        key: "teachers",
        label: "Teachers",
        hits: rows.map((t) => ({ id: t.id, title: `${t.user.firstName} ${t.user.lastName}`, subtitle: `${t.employeeId}${t.specialization ? ` · ${t.specialization}` : ""}`, href: `/teachers/${t.id}`, avatarFileId: t.user.avatarFileId })),
      })),
    );
  }
  if (can(actor, "classes.read")) {
    groups.push(
      (async () => {
        const year = await getCurrentAcademicYear(schoolId);
        const restrict = !isSchoolWide(actor) && actor.teacherId ? await teacherSectionIds(actor.teacherId, year?.id) : null;
        // Sections per school are few, so match labels like "Grade 6 A" / "6-A" in memory.
        const all = await db.section.findMany({
          where: { academicYearId: year?.id ?? "__none__", class: { schoolId }, ...(restrict ? { id: { in: restrict } } : {}) },
          include: { class: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
          orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
        });
        const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
        const needle = norm(q);
        const sections = all.filter((sec) => norm(`${sec.class.name}${sec.name}`).includes(needle) || norm(sec.room ?? "") === needle).slice(0, take);
        return { key: "classes", label: "Classes", hits: sections.map((s) => ({ id: s.id, title: `${s.class.name} – ${s.name}`, subtitle: `${s._count.enrollments} students${s.room ? ` · Room ${s.room}` : ""}`, href: `/classes/${s.id}` })) };
      })(),
    );
  }
  if (can(actor, "subjects.read")) {
    groups.push(
      db.subject
        .findMany({ where: { schoolId, OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] }, take })
        .then((rows) => ({ key: "subjects", label: "Subjects", hits: rows.map((s) => ({ id: s.id, title: s.name, subtitle: s.code, href: can(actor, "subjects.write") ? "/subjects" : "/timetable" })) })),
    );
  }
  if (can(actor, "assignments.read")) {
    groups.push(
      listAssignments(actor, { q, take }).then(({ rows }) => ({
        key: "assignments",
        label: "Assignments",
        hits: rows.map((a) => ({ id: a.id, title: a.title, subtitle: `${a.subject.name} · ${a.section.class.name}-${a.section.name}`, href: `/assignments/${a.id}` })),
      })),
    );
  }
  if (can(actor, "notices.read")) {
    groups.push(
      listNotices(actor, { q, take }).then(({ rows }) => ({ key: "notices", label: "Notices", hits: rows.map((n) => ({ id: n.id, title: n.title, subtitle: n.message.slice(0, 90), href: `/notices/${n.id}` })) })),
    );
  }
  const results = await Promise.all(groups.map((g) => g.catch(() => null)));
  return results.filter((g): g is SearchGroup => Boolean(g && g.hits.length));
}
