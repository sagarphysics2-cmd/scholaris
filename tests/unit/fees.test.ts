import { describe, expect, it } from "vitest";
import { balance, displayStatus, netAmount, paymentError, storedStatus } from "@/lib/fees";

const fee = (amount: number, discount = 0, amountPaid = 0, dueDate = new Date("2030-01-01T00:00:00Z")) => ({ amount, discount, amountPaid, dueDate });

describe("fee calculations", () => {
  it("computes net amount and balance", () => {
    expect(netAmount(fee(1000, 150))).toBe(850);
    expect(balance(fee(1000, 150, 300))).toBe(550);
  });

  it("derives stored status from amounts", () => {
    expect(storedStatus(fee(100))).toBe("PENDING");
    expect(storedStatus(fee(100, 0, 40))).toBe("PARTIALLY_PAID");
    expect(storedStatus(fee(100, 0, 100))).toBe("PAID");
    expect(storedStatus(fee(100, 100))).toBe("WAIVED");
  });

  it("shows OVERDUE only for unpaid fees past their due date", () => {
    const past = new Date("2020-01-01T00:00:00Z");
    expect(displayStatus(fee(100, 0, 0, past))).toBe("OVERDUE");
    expect(displayStatus(fee(100, 0, 50, past))).toBe("OVERDUE");
    expect(displayStatus(fee(100, 0, 100, past))).toBe("PAID");
    expect(displayStatus(fee(100))).toBe("PENDING");
  });

  it("rejects zero, negative and over-payments", () => {
    expect(paymentError(fee(100), 0)).toMatch(/greater than zero/);
    expect(paymentError(fee(100), -5)).toMatch(/greater than zero/);
    expect(paymentError(fee(100, 0, 60), 50)).toMatch(/exceeds/);
    expect(paymentError(fee(100, 0, 100), 1)).toMatch(/already fully paid/);
    expect(paymentError(fee(100, 0, 60), 40)).toBeNull();
  });
});
