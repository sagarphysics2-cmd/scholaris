"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { teacherSchema, teachingAssignmentSchema } from "@/lib/validation/people";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { sendInvite } from "@/server/services/auth.service";
import { filesFromForm } from "@/server/services/files.service";
import { setUserAvatar } from "@/server/services/profile.service";
import { assignTeaching, createTeacher, setTeacherArchived, unassignTeaching, updateTeacher } from "@/server/services/teachers.service";

export async function createTeacherAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(teacherSchema, formData);
    const teacher = await createTeacher(actor, input);
    const [photo] = filesFromForm(formData, "photo");
    if (photo) await setUserAvatar(actor, teacher.userId, photo);
    if (input.sendInvite) await sendInvite(teacher.userId);
    revalidatePath("/teachers");
    return { ok: true, message: input.sendInvite ? "Teacher added and invitation sent." : "Teacher added.", redirectTo: `/teachers/${teacher.id}` };
  });
}

export async function updateTeacherAction(teacherId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(teacherSchema, formData);
    const t = await updateTeacher(actor, teacherId, input);
    const [photo] = filesFromForm(formData, "photo");
    if (photo) await setUserAvatar(actor, t.userId, photo);
    revalidatePath(`/teachers/${teacherId}`);
    return { ok: true, message: "Teacher updated.", redirectTo: `/teachers/${teacherId}` };
  });
}

export async function archiveTeacherAction(teacherId: string, archived: boolean): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setTeacherArchived(actor, teacherId, archived);
    revalidatePath("/teachers");
    return { ok: true, message: archived ? "Teacher archived. Their classes and timetable slots were released." : "Teacher restored." };
  });
}

export async function assignTeachingAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await assignTeaching(actor, parseInput(teachingAssignmentSchema, formData));
    revalidatePath("/teachers");
    revalidatePath("/classes");
    return { ok: true, message: "Teaching assignment saved." };
  });
}

export async function unassignTeachingAction(teacherSubjectId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await unassignTeaching(actor, teacherSubjectId);
    revalidatePath("/teachers");
    revalidatePath("/classes");
    return { ok: true, message: "Teaching assignment removed." };
  });
}
