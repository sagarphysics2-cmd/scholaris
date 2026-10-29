"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { assignmentSchema, gradeSubmissionSchema, submissionSchema } from "@/lib/validation/academics";
import { parseInput, runAction, type ActionState } from "@/server/action";
import {
  createAssignment,
  deleteAssignment,
  gradeSubmission,
  removeAttachment,
  setAssignmentStatus,
  submitAssignment,
  updateAssignment,
} from "@/server/services/assignments.service";
import { filesFromForm } from "@/server/services/files.service";

export async function createAssignmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const a = await createAssignment(actor, parseInput(assignmentSchema, formData), filesFromForm(formData, "attachments"));
    revalidatePath("/assignments");
    return { ok: true, message: a.status === "PUBLISHED" ? "Assignment published. Students have been notified." : "Draft saved.", redirectTo: `/assignments/${a.id}` };
  });
}

export async function updateAssignmentAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateAssignment(actor, id, parseInput(assignmentSchema, formData), filesFromForm(formData, "attachments"));
    revalidatePath(`/assignments/${id}`);
    return { ok: true, message: "Assignment updated.", redirectTo: `/assignments/${id}` };
  });
}

export async function setAssignmentStatusAction(id: string, status: "PUBLISHED" | "CLOSED"): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setAssignmentStatus(actor, id, status);
    revalidatePath(`/assignments/${id}`);
    return { ok: true, message: status === "CLOSED" ? "Assignment closed to new submissions." : "Assignment published." };
  });
}

export async function deleteAssignmentAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteAssignment(actor, id);
    revalidatePath("/assignments");
    return { ok: true, message: "Assignment deleted.", redirectTo: "/assignments" };
  });
}

export async function removeAttachmentAction(assignmentId: string, fileId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await removeAttachment(actor, assignmentId, fileId);
    revalidatePath(`/assignments/${assignmentId}`);
    return { ok: true, message: "Attachment removed." };
  });
}

export async function submitAssignmentAction(assignmentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(submissionSchema, formData);
    const res = await submitAssignment(actor, assignmentId, input.content, filesFromForm(formData, "files"));
    revalidatePath(`/assignments/${assignmentId}`);
    return { ok: true, message: res.late ? "Submitted (after the due date — marked late)." : "Submitted successfully." };
  });
}

export async function gradeSubmissionAction(submissionId: string, assignmentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(gradeSubmissionSchema, formData);
    await gradeSubmission(actor, submissionId, input.marks, input.feedback);
    revalidatePath(`/assignments/${assignmentId}`);
    return { ok: true, message: "Grade saved. The student has been notified." };
  });
}
