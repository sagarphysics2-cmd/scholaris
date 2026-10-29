"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { examSchema, examSubjectSchema, marksEntrySchema } from "@/lib/validation/academics";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { deleteExam, deleteExamSubject, saveExam, saveExamSubject, saveMarks, setExamStatus } from "@/server/services/exams.service";

export async function saveExamAction(id: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const examId = await saveExam(actor, parseInput(examSchema, formData), id);
    revalidatePath("/exams");
    return { ok: true, message: id ? "Examination updated." : "Examination created.", redirectTo: id ? undefined : `/exams/${examId}` };
  });
}

export async function deleteExamAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteExam(actor, id);
    revalidatePath("/exams");
    return { ok: true, message: "Examination deleted.", redirectTo: "/exams" };
  });
}

export async function saveExamSubjectAction(examId: string, paperId: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveExamSubject(actor, examId, parseInput(examSubjectSchema, formData), paperId);
    revalidatePath(`/exams/${examId}`);
    return { ok: true, message: paperId ? "Paper updated." : "Paper added to the schedule." };
  });
}

export async function deleteExamSubjectAction(examId: string, paperId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteExamSubject(actor, paperId);
    revalidatePath(`/exams/${examId}`);
    return { ok: true, message: "Paper removed." };
  });
}

export async function setExamStatusAction(id: string, status: "SCHEDULED" | "ONGOING" | "COMPLETED" | "PUBLISHED"): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setExamStatus(actor, id, status);
    revalidatePath(`/exams/${id}`);
    revalidatePath("/results");
    return { ok: true, message: status === "PUBLISHED" ? "Results published. Students and parents have been notified." : "Status updated." };
  });
}

export async function saveMarksAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(marksEntrySchema, formData);
    const res = await saveMarks(actor, input.examSubjectId, input.sectionId, input.records);
    revalidatePath("/exams");
    revalidatePath("/results");
    return { ok: true, message: res.changed ? `Marks saved (${res.changed} change${res.changed === 1 ? "" : "s"}).` : "Marks saved — no changes." };
  });
}
