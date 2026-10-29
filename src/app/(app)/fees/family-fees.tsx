import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, Wallet } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatDate, toNumber } from "@/lib/utils";
import type { studentFeeSummary } from "@/server/services/fees.service";

/** Fee view for students, parents and the student profile. */
export function FamilyFees({ summary, currency }: { summary: Awaited<ReturnType<typeof studentFeeSummary>>; currency: string }) {
  const money = (v: number | { toString(): string }) => formatCurrency(v, currency);
  const payments = summary.rows.flatMap((f) => f.payments.map((p) => ({ ...p, title: f.title }))).sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime());
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total fees" value={money(summary.totalDue)} icon={<Wallet />} />
        <StatCard label="Paid" value={money(summary.totalPaid)} icon={<CheckCircle2 />} tone="success" />
        <StatCard label="Outstanding" value={money(summary.outstanding)} icon={<CalendarClock />} tone={summary.outstanding > 0 ? "warning" : "success"} hint={summary.nextDue ? `Next due ${formatDate(summary.nextDue.dueDate)}` : undefined} />
        <StatCard label="Overdue" value={summary.overdue.length} icon={<AlertTriangle />} tone={summary.overdue.length ? "danger" : "success"} hint={summary.overdue.length ? money(summary.overdue.reduce((a, f) => a + f.balance, 0)) : "Nothing overdue"} />
      </div>
      <Card>
        <CardHeader title="Fee statement" />
        {summary.rows.length === 0 ? (
          <EmptyState title="No fees" />
        ) : (
          <Table>
            <THead><TR><TH>Fee</TH><TH>Due date</TH><TH className="text-right">Amount</TH><TH className="text-right">Paid</TH><TH className="text-right">Balance</TH><TH>Status</TH></TR></THead>
            <TBody>
              {summary.rows.map((f) => (
                <TR key={f.id}>
                  <TD><Link href={`/fees/${f.id}`} className="font-medium hover:text-primary">{f.title}</Link><p className="text-xs text-muted-foreground">{f.category.name}{toNumber(f.discount) > 0 && ` · discount ${money(f.discount)}`}</p></TD>
                  <TD label="Due">{formatDate(f.dueDate)}</TD>
                  <TD label="Amount" className="text-right tabular-nums">{money(f.net)}</TD>
                  <TD label="Paid" className="text-right tabular-nums">{money(f.amountPaid)}</TD>
                  <TD label="Balance" className="text-right font-medium tabular-nums">{money(f.balance)}</TD>
                  <TD label="Status"><StatusBadge status={f.display} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Payment history" />
        {payments.length === 0 ? (
          <EmptyState title="No payments yet" />
        ) : (
          <Table>
            <THead><TR><TH>Receipt</TH><TH>Date</TH><TH>For</TH><TH>Method</TH><TH className="text-right">Amount</TH></TR></THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD><Link href={`/fees/receipts/${p.id}`} className="font-medium text-primary hover:underline">{p.receiptNumber}</Link></TD>
                  <TD label="Date">{formatDate(p.paidAt)}</TD>
                  <TD label="For">{p.title}</TD>
                  <TD label="Method"><StatusBadge status="PAID" label={p.method.replace("_", " ").toLowerCase()} /></TD>
                  <TD label="Amount" className="text-right tabular-nums">{money(p.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
