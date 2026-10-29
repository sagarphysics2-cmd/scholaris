"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { studentSchema } from "@/lib/validation/people";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { sendInvite } from "@/server/services/auth.service";
import { filesFromForm } from "@/server/services/files.service";
import { assertCanManageUser, inviteLinkForAdmin, setUserAvatar } from "@/server/services/profile.service";
import {
  createStudent,
  deleteStudent,
  importStudents,
  setStudentArchived,
  updateStudent,
  type ImportResult,
} from "@/server/services/students.service";
import { ValidationError } from "@/server/errors";

export async function createStudentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(studentSchema, formData);
    const student = await createStudent(actor, input);
    const [photo] = filesFromForm(formData, "photo");
    if (photo) await setUserAvatar(actor, student.userId, photo);
    let message = "Student created.";
    if (input.sendInvite && input.email) {
      await sendInvite(student.userId);
      message = "Student created and invitation sent.";
    }
    revalidatePath("/students");
    return { ok: true, message, redirectTo: `/students/${student.id}` };
  });
}

export async function updateStudentAction(studentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(studentSchema, formData);
    const student = await updateStudent(actor, studentId, input);
    const [photo] = filesFromForm(formData, "photo");
    if (photo) await setUserAvatar(actor, student.userId, photo);
    revalidatePath("/students");
    revalidatePath(`/students/${studentId}`);
    return { ok: true, message: "Student updated.", redirectTo: `/students/${studentId}` };
  });
}

export async function archiveStudentAction(studentId: string, archived: boolean): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setStudentArchived(actor, studentId, archived);
    revalidatePath("/students");
    return { ok: true, message: archived ? "Student archived. Their login has been disabled." : "Student restored." };
  });
}

export async function deleteStudentAction(studentId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteStudent(actor, studentId);
    revalidatePath("/students");
    return { ok: true, message: "Student deleted.", redirectTo: "/students" };
  });
}

export async function importStudentsAction(_prev: ActionState, formData: FormData): Promise<ActionState<ImportResult>> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ValidationError(undefined, { file: ["Choose a CSV file to import."] });
    if (file.size > 2 * 1024 * 1024) throw new ValidationError(undefined, { file: ["CSV files must be smaller than 2 MB."] });
    if (!file.name.toLowerCase().endsWith(".csv")) throw new ValidationError(undefined, { file: ["Only .csv files are supported."] });
    const result = await importStudents(actor, await file.text());
    if (result.errors.length) {
      return { ok: false, message: `No students were imported — ${result.errors.length} row(s) need attention.`, data: result };
    }
    revalidatePath("/students");
    return { ok: true, message: `Imported ${result.created} student(s).`, data: result };
  });
}

export async function resendInviteAction(userId: string): Promise<ActionState<{ link: string | null }>> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await assertCanManageUser(actor, userId);
    const link = await sendInvite(userId);
    return { ok: true, message: "Invitation sent.", data: { link: inviteLinkForAdmin(link) } };
  });
}
