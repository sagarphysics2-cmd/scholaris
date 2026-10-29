"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { classSchema, curriculumSchema, sectionSchema } from "@/lib/validation/academics";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { deleteClass, deleteSection, saveClass, saveSection, setCurriculum } from "@/server/services/academics.service";

export async function saveClassAction(id: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveClass(actor, parseInput(classSchema, formData), id);
    revalidatePath("/classes");
    return { ok: true, message: id ? "Class updated." : "Class created." };
  });
}

export async function deleteClassAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteClass(actor, id);
    revalidatePath("/classes");
    return { ok: true, message: "Class deleted." };
  });
}

export async function saveSectionAction(id: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveSection(actor, parseInput(sectionSchema, formData), id);
    revalidatePath("/classes");
    if (id) revalidatePath(`/classes/${id}`);
    return { ok: true, message: id ? "Section updated." : "Section created." };
  });
}

export async function deleteSectionAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteSection(actor, id);
    revalidatePath("/classes");
    return { ok: true, message: "Section deleted.", redirectTo: "/classes" };
  });
}

export async function setCurriculumAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(curriculumSchema, formData);
    await setCurriculum(actor, input.classId, input.subjectIds);
    revalidatePath("/classes");
    return { ok: true, message: "Subjects updated." };
  });
}
