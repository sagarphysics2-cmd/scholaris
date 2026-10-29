"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { periodSchema, timetableEntrySchema } from "@/lib/validation/academics";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { deletePeriod, deleteTimetableEntry, savePeriod, saveTimetableEntry } from "@/server/services/timetable.service";

export async function saveEntryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveTimetableEntry(actor, parseInput(timetableEntrySchema, formData));
    revalidatePath("/timetable");
    return { ok: true, message: "Lesson saved." };
  });
}

export async function deleteEntryAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteTimetableEntry(actor, id);
    revalidatePath("/timetable");
    return { ok: true, message: "Lesson removed." };
  });
}

export async function savePeriodAction(id: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await savePeriod(actor, parseInput(periodSchema, formData), id);
    revalidatePath("/timetable");
    return { ok: true, message: id ? "Period updated." : "Period added." };
  });
}

export async function deletePeriodAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deletePeriod(actor, id);
    revalidatePath("/timetable");
    return { ok: true, message: "Period deleted." };
  });
}
