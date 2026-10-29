import type { Metadata } from "next";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatCurrency, formatDate, formatDateTime, fullName, titleCase } from "@/lib/utils";
import { schoolSettings } from "@/server/services/attendance.service";
import { getReceipt } from "@/server/services/fees.service";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const actor = await requirePermission("fees.read");
  const { payment, fee, receivedBy } = await load(getReceipt(actor, paymentId));
  const [school, settings] = await Promise.all([db.school.findUniqueOrThrow({ where: { id: actor.schoolId! } }), schoolSettings(actor.schoolId!)]);
  const money = (v: number | { toString(): string }) => formatCurrency(v, settings.currency);
  const e = fee.student.enrollments[0];
  return (
    <>
      <div className="no-print mb-4 flex justify-between gap-2">
        <ButtonLink href={`/fees/${fee.id}`} variant="ghost">← Back to fee</ButtonLink>
        <PrintButton label="Print receipt" />
      </div>
      <Card className="print-area mx-auto max-w-2xl p-6 sm:p-10">
        <header className="flex items-start justify-between gap-4 border-b pb-6">
          <div className="flex items-center gap-3">
            {school.logoFileId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/files/${school.logoFileId}`} alt="" className="size-12 object-contain" />
            ) : (
              <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground"><GraduationCap className="size-6" /></span>
            )}
            <div>
              <p className="text-lg font-semibold">{school.name}</p>
              <p className="text-xs text-muted-foreground">{school.address}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Payment receipt</p>
            <p className="font-mono font-semibold">{payment.receiptNumber}</p>
          </div>
        </header>
        <div className="my-6 flex items-center gap-3 rounded-xl bg-success-soft p-4">
          <CheckCircle2 className="size-6 text-success" />
          <div>
            <p className="text-2xl font-semibold tabular-nums">{money(payment.amount)}</p>
            <p className="text-sm text-muted-foreground">received on {formatDate(payment.paidAt)}</p>
          </div>
        </div>
        <dl className="grid gap-y-3 text-sm sm:grid-cols-2 sm:gap-x-8">
          {[
            ["Student", fullName(fee.student.user)],
            ["Admission no.", fee.student.admissionNumber],
            ["Class", e ? `${e.section.class.name} – ${e.section.name}` : "—"],
            ["Academic year", fee.academicYear.name],
            ["Fee", fee.title],
            ["Category", fee.category.name],
            ["Payment method", titleCase(payment.method)],
            ["Reference", payment.reference ?? "—"],
            ["Fee amount (net)", money(fee.net)],
            ["Balance after payments", money(fee.balance)],
            ["Received by", receivedBy ? fullName(receivedBy) : "—"],
            ["Recorded", formatDateTime(payment.createdAt)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-dashed pb-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {payment.notes && <p className="mt-4 text-sm text-muted-foreground">Note: {payment.notes}</p>}
        <p className="mt-10 text-center text-xs text-muted-foreground">This is a computer-generated receipt from {school.name}. {school.phone && `Queries: ${school.phone}`} {school.email}</p>
      </Card>
    </>
  );
}
