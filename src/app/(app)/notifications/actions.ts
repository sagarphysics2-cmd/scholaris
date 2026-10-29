"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { runAction, type ActionState } from "@/server/action";
import { deleteReadNotifications, markAllRead, markRead } from "@/server/services/notifications.service";

export async function markReadAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await markRead(actor, id);
    revalidatePath("/notifications");
    return { ok: true };
  });
}

export async function markAllReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const n = await markAllRead(actor);
    revalidatePath("/", "layout");
    return { ok: true, message: n ? `Marked ${n} notification${n === 1 ? "" : "s"} as read.` : "Everything is already read." };
  });
}

export async function clearReadAction(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const n = await deleteReadNotifications(actor);
    revalidatePath("/notifications");
    return { ok: true, message: `Removed ${n} read notification${n === 1 ? "" : "s"}.` };
  });
}
