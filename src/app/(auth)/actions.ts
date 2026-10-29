"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/auth/redirect";
import { getRequestMeta } from "@/lib/auth/request";
import { createSession, destroyCurrentSession } from "@/lib/auth/session";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validation/auth";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { authenticate, completePasswordToken, requestPasswordReset } from "@/server/services/auth.service";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(loginSchema, formData);
    const meta = await getRequestMeta();
    const user = await authenticate(input.email, input.password, meta.ip);
    await createSession(user.id, meta);
    // Redirect on the server: setting the cookie re-renders /login, whose layout would
    // otherwise send the now-signed-in user to /dashboard and drop ?next=.
    redirect(safeNext(formData.get("next")));
  });
}

export async function logoutAction() {
  await destroyCurrentSession();
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(forgotPasswordSchema, formData);
    const meta = await getRequestMeta();
    await requestPasswordReset(input.email, meta.ip);
    return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
  });
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(resetPasswordSchema, formData);
    const meta = await getRequestMeta();
    await completePasswordToken(input.token, "PASSWORD_RESET", input.password, meta.ip);
    return { ok: true, message: "Password updated. Please sign in with your new password.", redirectTo: "/login" };
  });
}

export async function acceptInviteAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const input = parseInput(resetPasswordSchema, formData);
    const meta = await getRequestMeta();
    const user = await completePasswordToken(input.token, "INVITE", input.password, meta.ip);
    await createSession(user.id, meta);
    redirect("/dashboard");
  });
}
