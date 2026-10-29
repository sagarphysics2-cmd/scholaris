"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { subjectSchema } from "@/lib/validation/academics";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { deleteSubject, saveSubject, setSubjectArchived } from "@/server/services/academics.service";

export async function saveSubjectAction(id: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveSubject(actor, parseInput(subjectSchema, formData), id);
    revalidatePath("/subjects");
    return { ok: true, message: id ? "Subject updated." : "Subject created." };
  });
}

export async function archiveSubjectAction(id: string, archived: boolean): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setSubjectArchived(actor, id, archived);
    revalidatePath("/subjects");
    return { ok: true, message: archived ? "Subject archived." : "Subject restored." };
  });
}

export async function deleteSubjectAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteSubject(actor, id);
    revalidatePath("/subjects");
    return { ok: true, message: "Subject deleted." };
  });
}
