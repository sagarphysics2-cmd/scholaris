"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { attendanceSettingsSchema, examSettingsSchema, feeSettingsSchema, generalSettingsSchema, notificationSettingsSchema, schoolProfileSchema } from "@/lib/validation/admin";
import { id, idList } from "@/lib/validation/common";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { filesFromForm } from "@/server/services/files.service";
import { saveGradingRules, setRolePermissions, updateGeneralSettings, updateSchoolProfile, updateSettingsSection } from "@/server/services/settings.service";

const done = (message: string): NonNullable<ActionState> => {
  revalidatePath("/", "layout");
  return { ok: true, message, ts: Date.now() };
};

export async function saveProfileAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateSchoolProfile(actor, parseInput(schoolProfileSchema, fd), filesFromForm(fd, "logo")[0]);
    return done("School profile saved.");
  });
}

export async function saveGeneralAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateGeneralSettings(actor, parseInput(generalSettingsSchema, fd));
    return done("General settings saved.");
  });
}

export async function saveAttendanceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateSettingsSection(actor, "attendance", parseInput(attendanceSettingsSchema, fd));
    return done("Attendance settings saved.");
  });
}

export async function saveExamAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(examSettingsSchema, fd);
    await saveGradingRules(actor, input.overallPassPercent, input.grades);
    return done("Grading rules saved. New marks will use the updated scale.");
  });
}

export async function saveFeesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateSettingsSection(actor, "fees", parseInput(feeSettingsSchema, fd));
    return done("Fee settings saved.");
  });
}

export async function saveNotificationsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateSettingsSection(actor, "notifications", { email: parseInput(notificationSettingsSchema, fd) });
    return done("Notification settings saved.");
  });
}

export async function saveRoleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const input = parseInput(z.object({ roleId: id("Role"), permissions: idList }), fd);
    await setRolePermissions(actor, input.roleId, input.permissions);
    return done("Role permissions updated. Changes apply on users' next request.");
  });
}
