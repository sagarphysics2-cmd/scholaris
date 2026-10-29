"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { adminUserSchema, schoolSchema } from "@/lib/validation/admin";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { inviteLinkForAdmin } from "@/server/services/profile.service";
import { createAdmin, saveSchool, setUserDisabled } from "@/server/services/settings.service";

export async function createAdminAction(_p: ActionState, fd: FormData): Promise<ActionState<{ link: string | null }>> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const { link } = await createAdmin(actor, parseInput(adminUserSchema, fd));
    revalidatePath("/admins");
    return { ok: true, message: "Administrator invited.", data: { link: inviteLinkForAdmin(link) } };
  });
}

export async function setUserDisabledAction(userId: string, disabled: boolean): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setUserDisabled(actor, userId, disabled);
    revalidatePath("/admins");
    return { ok: true, message: disabled ? "Account disabled and signed out everywhere." : "Account enabled." };
  });
}

export async function saveSchoolAction(id: string | undefined, _p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveSchool(actor, parseInput(schoolSchema, fd), id);
    revalidatePath("/schools");
    revalidatePath("/", "layout");
    return { ok: true, message: id ? "School updated." : "School created with a default academic year, grading scale and bell schedule." };
  });
}
