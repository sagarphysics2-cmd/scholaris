"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { attendanceSaveSchema } from "@/lib/validation/academics";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { saveAttendance } from "@/server/services/attendance.service";

export async function saveAttendanceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(attendanceSaveSchema, formData);
    const res = await saveAttendance(actor, input.sectionId, input.date, input.records);
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
    return { ok: true, message: `Attendance saved for ${res.saved} students${res.changed ? ` (${res.changed} changed)` : ""}.` };
  });
}
