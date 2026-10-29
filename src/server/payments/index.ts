import type { PaymentMethod } from "@/generated/prisma/enums";

/**
 * Payment provider layer. Today all payments are recorded manually by the accounts
 * office (cash, card terminal, bank transfer, cheque). To accept online payments later,
 * implement `PaymentProvider` for a gateway (Stripe, Razorpay, PayPal, …): `startCheckout`
 * returns a redirect URL, and the gateway's webhook calls `recordPayment` in
 * fees.service.ts with method "ONLINE" and the gateway transaction id as `reference`.
 * Fee records, receipts and reports need no changes.
 */
export interface PaymentProvider {
  readonly id: string;
  readonly methods: PaymentMethod[];
  /** For online gateways: begin a hosted checkout for an outstanding amount. */
  startCheckout?(input: { feeId: string; amount: number; currency: string; description: string; returnUrl: string }): Promise<{ redirectUrl: string }>;
  /** Normalises/validates provider-specific references before a payment is stored. */
  normaliseReference(method: PaymentMethod, reference: string | null | undefined): string | null;
}

export const manualProvider: PaymentProvider = {
  id: "manual",
  methods: ["CASH", "CARD", "BANK_TRANSFER", "CHEQUE", "ONLINE"],
  normaliseReference(method, reference) {
    const ref = reference?.trim() || null;
    return method === "CASH" ? ref : ref?.toUpperCase() ?? null;
  },
};

const providers: Record<string, PaymentProvider> = { manual: manualProvider };

export function paymentProvider(id = "manual"): PaymentProvider {
  return providers[id] ?? manualProvider;
}
