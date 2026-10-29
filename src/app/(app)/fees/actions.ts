"use server";

import { revalidatePath } from "next/cache";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { assignFeeSchema, editFeeSchema, feeCategorySchema, paymentSchema } from "@/lib/validation/fees";
import { parseInput, runAction, type ActionState } from "@/server/action";
import { assignFees, deleteFee, deleteFeeCategory, recordPayment, saveFeeCategory, updateFee } from "@/server/services/fees.service";

export async function saveCategoryAction(id: string | undefined, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await saveFeeCategory(actor, parseInput(feeCategorySchema, formData), id);
    revalidatePath("/fees");
    return { ok: true, message: id ? "Category updated." : "Category created." };
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteFeeCategory(actor, id);
    revalidatePath("/fees");
    return { ok: true, message: "Category deleted." };
  });
}

export async function assignFeesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const res = await assignFees(actor, parseInput(assignFeeSchema, formData));
    revalidatePath("/fees");
    return { ok: true, message: `Fee assigned to ${res.created} student(s)${res.skipped ? `; ${res.skipped} already had it` : ""}.` };
  });
}

export async function updateFeeAction(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await updateFee(actor, id, parseInput(editFeeSchema, formData));
    revalidatePath(`/fees/${id}`);
    return { ok: true, message: "Fee updated." };
  });
}

export async function deleteFeeAction(id: string): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    await deleteFee(actor, id);
    revalidatePath("/fees");
    return { ok: true, message: "Fee deleted.", redirectTo: "/fees?tab=fees" };
  });
}

export async function recordPaymentAction(feeId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const actor = await requireActorOrThrow();
    const p = await recordPayment(actor, feeId, parseInput(paymentSchema, formData));
    revalidatePath(`/fees/${feeId}`);
    revalidatePath("/fees");
    return { ok: true, message: `Payment recorded. Receipt ${p.receiptNumber}.`, redirectTo: `/fees/receipts/${p.id}` };
  });
}
