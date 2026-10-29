"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { noticeSchema } from "@/lib/validation/notices";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { filesFromForm } from "@/server/services/files.service";
import { createNotice, deleteNotice, updateNotice } from "@/server/services/notices.service";

export async function createNoticeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const n = await createNotice(actor, parseInput(noticeSchema, formData), filesFromForm(formData, "attachments"));
    revalidatePath("/notices");
    revalidatePath("/dashboard");
    return { ok: true, message: n.publishDate > new Date() ? "Notice scheduled." : "Notice published.", redirectTo: `/notices/${n.id}` };
  });
}

export async function updateNoticeAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateNotice(actor, id, parseInput(noticeSchema, formData), filesFromForm(formData, "attachments"));
    revalidatePath("/notices");
    return { ok: true, message: "Notice updated.", redirectTo: `/notices/${id}` };
  });
}

export async function deleteNoticeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteNotice(actor, id);
    revalidatePath("/notices");
    return { ok: true, message: "Notice deleted.", redirectTo: "/notices" };
  });
}
