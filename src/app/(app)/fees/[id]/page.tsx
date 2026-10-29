import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Receipt, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { DescriptionList, ProgressBar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, requirePermission } from "@/lib/auth/actor";
import { formatCurrency, formatDate, fullName, titleCase, toISODate, toNumber } from "@/lib/utils";
import { schoolSettings } from "@/server/services/attendance.service";
import { getFee } from "@/server/services/fees.service";
import { deleteFeeAction, recordPaymentAction, updateFeeAction } from "../actions";
import { EditFeeForm, PaymentForm } from "../forms";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Fee" };

export default async function FeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("fees.read");
  const fee = await load(getFee(actor, id));
  const { currency } = await schoolSettings(actor.schoolId!);
  const money = (v: number | { toString(): string }) => formatCurrency(v, currency);
  const manage = can(actor, "fees.manage");
  const e = fee.student.enrollments[0];
  const paidPct = fee.net > 0 ? (toNumber(fee.amountPaid) / fee.net) * 100 : 100;

  return (
    <>
      <PageHeader
        title={fee.title}
        description={`${fee.category.name} · ${fee.academicYear.name}`}
        breadcrumbs={[{ label: "Fees", href: manage ? "/fees?tab=fees" : "/fees" }, { label: fee.title }]}
        actions={
          manage && (
            <>
              <ModalButton variant="outline" icon={<Pencil />} label="Edit" title="Edit fee">
                <EditFeeForm action={updateFeeAction.bind(null, fee.id)} defaults={{ title: fee.title, amount: toNumber(fee.amount), discount: toNumber(fee.discount), dueDate: toISODate(fee.dueDate), notes: fee.notes }} />
              </ModalButton>
              {fee.payments.length === 0 && <ConfirmAction action={deleteFeeAction.bind(null, fee.id)} icon={<Trash2 />} label="Delete" title="Delete this fee?" description="Only fees without payments can be deleted." confirmLabel="Delete" />}
            </>
          )
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={manage ? `/students/${fee.studentId}` : "#"} className="flex items-center gap-3">
                  <Avatar name={fullName(fee.student.user)} fileId={fee.student.user.avatarFileId} />
                  <span><span className="block font-medium">{fullName(fee.student.user)}</span><span className="block text-sm text-muted-foreground">{fee.student.admissionNumber}{e ? ` · ${e.section.class.name}-${e.section.name}` : ""}</span></span>
                </Link>
                <StatusBadge status={fee.display} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm"><span>Paid {money(fee.amountPaid)}</span><span className="text-muted-foreground">of {money(fee.net)}</span></div>
                <ProgressBar value={paidPct} tone={fee.display === "OVERDUE" ? "danger" : paidPct >= 100 ? "success" : "primary"} label="Paid" />
              </div>
              <DescriptionList
                items={[
                  { label: "Amount", value: money(fee.amount) },
                  { label: "Discount", value: money(fee.discount) },
                  { label: "Balance", value: <strong>{money(fee.balance)}</strong> },
                  { label: "Due date", value: formatDate(fee.dueDate) },
                  ...(fee.notes ? [{ label: "Notes", value: fee.notes }] : []),
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader title="Payments" icon={<Receipt />} />
            {fee.payments.length === 0 ? (
              <EmptyState title="No payments yet" />
            ) : (
              <Table>
                <THead><TR><TH>Receipt</TH><TH>Date</TH><TH>Method</TH><TH>Reference</TH><TH className="text-right">Amount</TH></TR></THead>
                <TBody>
                  {fee.payments.map((p) => (
                    <TR key={p.id}>
                      <TD><Link href={`/fees/receipts/${p.id}`} className="font-medium text-primary hover:underline">{p.receiptNumber}</Link></TD>
                      <TD label="Date">{formatDate(p.paidAt)}</TD>
                      <TD label="Method"><Badge>{titleCase(p.method)}</Badge></TD>
                      <TD label="Reference" className="text-muted-foreground">{p.reference ?? "—"}</TD>
                      <TD label="Amount" className="text-right tabular-nums">{money(p.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </div>
        {manage && fee.balance > 0 && (
          <Card className="self-start">
            <CardHeader title="Record payment" description="A receipt is generated automatically." />
            <CardContent><PaymentForm action={recordPaymentAction.bind(null, fee.id)} balance={fee.balance} currency={currency} /></CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
