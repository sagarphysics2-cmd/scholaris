"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireActorOrThrow, assertCan } from "@/lib/auth/actor";
import { SCHOOL_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { audit } from "@/server/audit";

/** Super admins choose which school they are currently working in. */
export async function switchSchoolAction(schoolId: string) {
  const actor = await requireActorOrThrow();
  assertCan(actor, "schools.manage");
  const school = await db.school.findUnique({ where: { id: String(schoolId) }, select: { id: true } });
  if (!school) return;
  (await cookies()).set(SCHOOL_COOKIE, school.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  await audit({ userId: actor.userId, schoolId: school.id }, { action: "school.switch", entity: "School", entityId: school.id });
  redirect("/dashboard");
}
