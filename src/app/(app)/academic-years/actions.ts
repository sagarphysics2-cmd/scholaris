"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { academicYearSchema } from "@/lib/validation/academics";
import { id } from "@/lib/validation/common";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { copyStructure, deleteAcademicYear, saveAcademicYear, setCurrentAcademicYear } from "@/server/services/academics.service";

export async function saveAcademicYearAction(yearId: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveAcademicYear(actor, parseInput(academicYearSchema, formData), yearId);
    revalidatePath("/academic-years");
    return { ok: true, message: yearId ? "Academic year updated." : "Academic year created." };
  });
}

export async function setCurrentYearAction(yearId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setCurrentAcademicYear(actor, yearId);
    revalidatePath("/", "layout");
    return { ok: true, message: "Current academic year changed." };
  });
}

export async function deleteYearAction(yearId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteAcademicYear(actor, yearId);
    revalidatePath("/academic-years");
    return { ok: true, message: "Academic year deleted." };
  });
}

export async function copyStructureAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(z.object({ fromYearId: id("Source year"), toYearId: id("Target year") }), formData);
    if (input.fromYearId === input.toYearId) return { ok: false, message: "Choose two different years." };
    await copyStructure(actor, input.fromYearId, input.toYearId);
    revalidatePath("/academic-years");
    return { ok: true, message: "Sections, curriculum and teaching assignments copied." };
  });
}
