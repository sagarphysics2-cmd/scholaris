"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { linkChildSchema, parentSchema } from "@/lib/validation/people";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { sendInvite } from "@/server/services/auth.service";
import { createParent, linkChild, setParentArchived, unlinkChild, updateParent } from "@/server/services/parents.service";

export async function createParentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(parentSchema, formData);
    const parent = await createParent(actor, input);
    if (input.sendInvite) await sendInvite(parent.userId);
    revalidatePath("/parents");
    return { ok: true, message: input.sendInvite ? "Parent added and invitation sent." : "Parent added.", redirectTo: `/parents/${parent.id}` };
  });
}

export async function updateParentAction(parentId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateParent(actor, parentId, parseInput(parentSchema, formData));
    revalidatePath(`/parents/${parentId}`);
    return { ok: true, message: "Parent updated.", redirectTo: `/parents/${parentId}` };
  });
}

export async function linkChildAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(linkChildSchema, formData);
    await linkChild(actor, input);
    revalidatePath(`/parents/${input.parentId}`);
    revalidatePath(`/students/${input.studentId}`);
    return { ok: true, message: "Child linked." };
  });
}

export async function unlinkChildAction(parentId: string, studentId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await unlinkChild(actor, parentId, studentId);
    revalidatePath(`/parents/${parentId}`);
    return { ok: true, message: "Child unlinked." };
  });
}

export async function archiveParentAction(parentId: string, archived: boolean): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await setParentArchived(actor, parentId, archived);
    revalidatePath("/parents");
    return { ok: true, message: archived ? "Parent archived." : "Parent restored." };
  });
}
