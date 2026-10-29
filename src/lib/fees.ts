import { round2, toNumber } from "./utils";

type Num = number | { toString(): string };

/** Display status: stored status plus derived "OVERDUE" for unpaid fees past due. */
export type FeeDisplayStatus = "PAID" | "PARTIALLY_PAID" | "PENDING" | "OVERDUE" | "WAIVED";

export function netAmount(fee: { amount: Num; discount: Num }) {
  return round2(toNumber(fee.amount) - toNumber(fee.discount));
}

export function balance(fee: { amount: Num; discount: Num; amountPaid: Num }) {
  return round2(netAmount(fee) - toNumber(fee.amountPaid));
}

/** Stored status derived from amounts (OVERDUE is never stored — it depends on today's date). */
export function storedStatus(fee: { amount: Num; discount: Num; amountPaid: Num }): "PAID" | "PARTIALLY_PAID" | "PENDING" | "WAIVED" {
  const net = netAmount(fee);
  const paid = toNumber(fee.amountPaid);
  if (net <= 0) return "WAIVED";
  if (paid >= net) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "PENDING";
}

export function displayStatus(
  fee: { amount: Num; discount: Num; amountPaid: Num; dueDate: Date; status?: string },
  today: Date = new Date(),
): FeeDisplayStatus {
  const s = storedStatus(fee);
  if ((s === "PENDING" || s === "PARTIALLY_PAID") && fee.dueDate.getTime() < Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) {
    return "OVERDUE";
  }
  return s;
}

/** Validates a payment amount against the outstanding balance. Returns an error message or null. */
export function paymentError(fee: { amount: Num; discount: Num; amountPaid: Num }, amount: number): string | null {
  if (!(amount > 0)) return "Payment amount must be greater than zero.";
  const due = balance(fee);
  if (due <= 0) return "This fee is already fully paid.";
  if (round2(amount) > due) return `Payment exceeds the outstanding balance (${due.toFixed(2)}).`;
  return null;
}
