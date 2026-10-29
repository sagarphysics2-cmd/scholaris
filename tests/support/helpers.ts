import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { buildActor } from "@/server/authz/build-actor";
import type { Actor } from "@/server/authz/guards";

/** Seeded demo accounts. */
export const EMAIL = {
  superAdmin: "superadmin@scholaris.example",
  admin: "admin@greenfield.example",
  teacher: "teacher@greenfield.example",
  student: "student@greenfield.example",
  parent: "parent@greenfield.example",
} as const;

export async function actorFor(email: string): Promise<Actor> {
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const actor = await buildActor(user.id, `test-${randomUUID()}`);
  if (!actor) throw new Error(`User ${email} is not active`);
  return actor;
}

export const uniq = (prefix = "T") => `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;

/** A section the seeded teacher does NOT teach and is not class teacher of. */
export async function sectionNotTaughtBy(teacherId: string) {
  return db.section.findFirstOrThrow({ where: { classTeacherId: { not: teacherId }, teacherSubjects: { none: { teacherId } } }, include: { class: true } });
}

/** A (section, subject) the teacher teaches. */
export async function teachingOf(teacherId: string) {
  return db.teacherSubject.findFirstOrThrow({ where: { teacherId }, include: { section: { include: { class: true } }, subject: true } });
}

export function fd(obj: Record<string, string | string[]>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
}
