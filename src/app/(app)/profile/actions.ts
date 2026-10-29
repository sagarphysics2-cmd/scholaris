"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { getSessionToken } from "@/lib/auth/session";
import { changePasswordSchema } from "@/lib/validation/auth";
import { optionalPhone } from "@/lib/validation/common";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { ValidationError } from "@/server/errors";
import { changePassword } from "@/server/services/auth.service";
import { filesFromForm } from "@/server/services/files.service";
import { removeUserAvatar, revokeOtherSessions, revokeOwnSession, setUserAvatar, updateOwnContact } from "@/server/services/profile.service";

export async function updateContactAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const { phone } = parseInput(z.object({ phone: optionalPhone }), fd);
    await updateOwnContact(actor, phone ?? null);
    revalidatePath("/profile");
    return { ok: true, message: "Contact details saved." };
  });
}

export async function uploadAvatarAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const [file] = filesFromForm(fd, "avatar");
    if (!file) throw new ValidationError(undefined, { avatar: ["Choose an image."] });
    await setUserAvatar(actor, actor.userId, file);
    revalidatePath("/", "layout");
    return { ok: true, message: "Profile photo updated." };
  });
}

export async function removeAvatarAction(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await removeUserAvatar(actor, actor.userId);
    revalidatePath("/", "layout");
    return { ok: true, message: "Profile photo removed." };
  });
}

export async function changePasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(changePasswordSchema, fd);
    await changePassword(actor.userId, input.currentPassword, input.password, actor.sessionId);
    revalidatePath("/profile");
    return { ok: true, message: "Password changed. Other devices have been signed out." };
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    if (sessionId === actor.sessionId || !(await getSessionToken())) throw new ValidationError("Use “Sign out” to end your current session.");
    await revokeOwnSession(actor, sessionId);
    revalidatePath("/profile");
    return { ok: true, message: "Session signed out." };
  });
}

export async function revokeOthersAction(): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const n = await revokeOtherSessions(actor);
    revalidatePath("/profile");
    return { ok: true, message: n ? `Signed out of ${n} other session${n === 1 ? "" : "s"}.` : "No other sessions." };
  });
}
