import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CircleDollarSign, Download, Pencil, Percent, Plus, Trash2, Wallet } from "lucide-react";
import { BarsChart, DonutChart, TrendChart } from "@/components/charts/charts";
import { ChildSwitcher } from "@/components/people/child-switcher";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { StatCard } from "@/components/ui/stat-card";
import { LinkTabs } from "@/components/ui/tabs";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { formatCurrency, formatDate, formatPercent, fullName, titleCase, toNumber } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/validation/fees";
import { resolveStudentContext } from "@/server/authz/scope";
import { schoolSettings } from "@/server/services/attendance.service";
import { feeOverview, listFeeCategories, listFees, listPayments, studentFeeSummary } from "@/server/services/fees.service";
import { studentPickerOptions } from "@/server/services/parents.service";
import { classOptions, sectionOptions } from "@/server/services/students.service";
import { assignFeesAction, deleteCategoryAction, saveCategoryAction } from "./actions";
import { FamilyFees } from "./family-fees";
import { AssignFeeForm, CategoryForm } from "./forms";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Fees" };

type SP = Record<string, string | string[] | undefined>;

export default async function FeesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requirePermission("fees.read");
  const params = await searchParams;
  const settings = await schoolSettings(actor.schoolId!);
  const currency = settings.currency;

  if (!can(actor, "fees.manage")) {
    const ctx = await load(resolveStudentContext(actor, sp(params, "studentId")));
    if (!ctx.studentId) return <><PageHeader title="Fees" /><Card><EmptyState title="No linked students" /></Card></>;
    const summary = await studentFeeSummary(actor, ctx.studentId);
    return (
      <>
        <PageHeader title="Fees" description="Fee statement, outstanding balances and receipts." />
        <ChildSwitcher items={ctx.children} active={ctx.studentId} basePath="/fees" />
        <FamilyFees summary={summary} currency={currency} />
      </>
    );
  }

  const tab = sp(params, "tab") ?? "overview";
  const tabs = [
    { key: "overview", label: "Overview", href: "/fees" },
    { key: "fees", label: "Student fees", href: "/fees?tab=fees" },
    { key: "payments", label: "Collections", href: "/fees?tab=payments" },
    { key: "categories", label: "Categories", href: "/fees?tab=categories" },
  ];
  const categories = await listFeeCategories(actor);
  const [classes, sections, students] = await Promise.all([classOptions(actor.schoolId!), sectionOptions(actor.schoolId!), studentPickerOptions(actor.schoolId!)]);
  const money = (v: number | { toString(): string } | null) => formatCurrency(v ?? 0, currency);

  return (
    <>
      <PageHeader
        title="Fees"
        description="Bill fees, record payments and follow collections."
        actions={
          <ModalButton icon={<Plus />} label="Assign fee" title="Assign a fee" description="Bill a fee to a class, section or selected students." dialogSize="lg">
            <AssignFeeForm action={assignFeesAction} categories={categories.map((c) => ({ value: c.id, label: c.name, defaultAmount: c.defaultAmount ? toNumber(c.defaultAmount) : null }))} classes={classes} sections={sections} students={students} />
          </ModalButton>
        }
      />
      <LinkTabs tabs={tabs} active={tab} />

      {tab === "overview" && <Overview money={money} actor={actor} />}

      {tab === "fees" && <FeesTab params={params} money={money} actor={actor} classes={classes} sections={sections} categories={categories.map((c) => ({ value: c.id, label: c.name }))} />}

      {tab === "payments" && <PaymentsTab params={params} money={money} actor={actor} />}

      {tab === "categories" && (
        <Card>
          <CardHeader title="Fee categories" action={<ModalButton size="sm" icon={<Plus />} label="New category" title="New fee category"><CategoryForm action={saveCategoryAction.bind(null, undefined)} /></ModalButton>} />
          {categories.length === 0 ? (
            <EmptyState title="No categories" description="Create categories such as Tuition, Transport and Examination fees." />
          ) : (
            <Table>
              <THead><TR><TH>Name</TH><TH>Type</TH><TH>Default amount</TH><TH>Fees billed</TH><TH className="text-right">Actions</TH></TR></THead>
              <TBody>
                {categories.map((c) => (
                  <TR key={c.id}>
                    <TD><p className="font-medium">{c.name}</p>{c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}</TD>
                    <TD label="Type"><Badge>{titleCase(c.type)}</Badge></TD>
                    <TD label="Default" className="tabular-nums">{c.defaultAmount ? money(c.defaultAmount) : "—"}</TD>
                    <TD label="Fees" className="tabular-nums">{c._count.fees}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <ModalButton variant="ghost" size="icon-sm" icon={<Pencil />} ariaLabel={`Edit ${c.name}`} title={`Edit ${c.name}`}><CategoryForm action={saveCategoryAction.bind(null, c.id)} defaults={{ ...c, defaultAmount: c.defaultAmount ? toNumber(c.defaultAmount) : null }} /></ModalButton>
                        {c._count.fees === 0 && <ConfirmAction action={deleteCategoryAction.bind(null, c.id)} variant="danger-ghost" size="icon-sm" icon={<Trash2 />} ariaLabel={`Delete ${c.name}`} title="Delete category?" description={c.name} confirmLabel="Delete" />}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}

type Money = (v: number | { toString(): string } | null) => string;
type ActorT = Awaited<ReturnType<typeof requirePermission>>;

async function Overview({ money, actor }: { money: Money; actor: ActorT }) {
  const o = await feeOverview(actor);
  const sc = o.statusCounts as Record<string, number>;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total billed" value={money(o.billed)} hint={o.year?.name} icon={<Wallet />} />
        <StatCard label="Collected" value={money(o.collected)} icon={<CircleDollarSign />} tone="success" />
        <StatCard label="Collection rate" value={formatPercent(o.collectionRate)} hint={`${money(o.outstanding)} outstanding`} icon={<Percent />} tone="info" />
        <StatCard label="Overdue" value={money(o.overdue.amount)} hint={`${o.overdue.count} fees past due`} icon={<AlertTriangle />} tone="danger" href="/fees?tab=fees&status=OVERDUE" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader title="Collections by month" description="Payments received, last 6 months" />
          <div className="p-4">{o.monthly.length ? <TrendChart data={o.monthly} xKey="month" series={[{ key: "amount", label: "Collected", color: "var(--chart-3)" }]} yDomain={[0, "auto"]} /> : <EmptyState title="No payments yet" />}</div>
        </Card>
        <Card>
          <CardHeader title="Fee status" description="Number of fee items" />
          <div className="p-5">
            <DonutChart
              centerValue={String(Object.values(sc).reduce((a, b) => a + b, 0))}
              centerLabel="fees"
              data={[
                { name: "Paid", value: sc.PAID ?? 0, color: "var(--status-good)" },
                { name: "Partially paid", value: sc.PARTIALLY_PAID ?? 0, color: "var(--chart-1)" },
                { name: "Pending / overdue", value: sc.PENDING ?? 0, color: "var(--status-warning)" },
                { name: "Waived", value: sc.WAIVED ?? 0, color: "var(--muted-foreground)" },
              ]}
            />
          </div>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="By section" description="Billed vs collected" />
          <div className="p-4"><BarsChart data={o.bySection} xKey="label" series={[{ key: "collected", label: "Collected", color: "var(--chart-3)" }, { key: "outstanding", label: "Outstanding", color: "var(--chart-2)" }]} stacked /></div>
        </Card>
        <Card>
          <CardHeader title="By category" />
          <Table>
            <THead><TR><TH>Category</TH><TH className="text-right">Billed</TH><TH className="text-right">Collected</TH><TH className="text-right">Rate</TH></TR></THead>
            <TBody>
              {o.byCategory.map((c) => (
                <TR key={c.name}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD label="Billed" className="text-right tabular-nums">{money(c.billed)}</TD>
                  <TD label="Collected" className="text-right tabular-nums">{money(c.collected)}</TD>
                  <TD label="Rate" className="text-right">{formatPercent(c.billed ? (c.collected / c.billed) * 100 : null)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

async function FeesTab({ params, money, actor, classes, sections, categories }: { params: SP; money: Money; actor: ActorT; classes: Array<{ value: string; label: string }>; sections: Array<{ value: string; label: string; classId: string }>; categories: Array<{ value: string; label: string }> }) {
  const { page, pageSize, skip, take } = pageParams(params, 25);
  const filters = { q: sp(params, "q"), status: sp(params, "status"), categoryId: sp(params, "categoryId"), classId: sp(params, "classId"), sectionId: sp(params, "sectionId") };
  const { total, rows, totals } = await listFees(actor, { ...filters, skip, take });
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <Card>
      <Toolbar>
        <SearchInput placeholder="Student, admission no or fee…" />
        <FilterSelect param="status" label="Status" placeholder="Any status" options={[{ value: "OUTSTANDING", label: "Outstanding" }, { value: "OVERDUE", label: "Overdue" }, { value: "PENDING", label: "Pending" }, { value: "PARTIALLY_PAID", label: "Partially paid" }, { value: "PAID", label: "Paid" }, { value: "WAIVED", label: "Waived" }]} />
        <FilterSelect param="categoryId" label="Category" placeholder="All categories" options={categories} />
        <FilterSelect param="classId" label="Class" placeholder="All classes" options={classes} />
        <FilterSelect param="sectionId" label="Section" placeholder="All sections" options={sections.filter((s) => !filters.classId || s.classId === filters.classId)} />
        <ButtonLink variant="outline" href={`/api/export/fees${qs ? `?${qs}` : ""}`} prefetch={false} className="sm:ml-auto"><Download /> Export</ButtonLink>
      </Toolbar>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-b px-5 py-2.5 text-sm">
        <span>Billed <strong className="tabular-nums">{money(totals.billed)}</strong></span>
        <span>Paid <strong className="tabular-nums text-success">{money(totals.paid)}</strong></span>
        <span>Outstanding <strong className="tabular-nums text-danger">{money(totals.outstanding)}</strong></span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No fees match" />
      ) : (
        <>
          <Table>
            <THead><TR><TH>Student</TH><TH>Fee</TH><TH>Due</TH><TH className="text-right">Net</TH><TH className="text-right">Paid</TH><TH className="text-right">Balance</TH><TH>Status</TH></TR></THead>
            <TBody>
              {rows.map((f) => {
                const e = f.student.enrollments[0];
                return (
                  <TR key={f.id}>
                    <TD>
                      <Link href={`/fees/${f.id}`} className="flex items-center gap-2 font-medium hover:text-primary">
                        <Avatar name={fullName(f.student.user)} fileId={f.student.user.avatarFileId} size="sm" />
                        <span className="text-left"><span className="block">{fullName(f.student.user)}</span><span className="block text-xs font-normal text-muted-foreground">{e ? `${e.section.class.name}-${e.section.name}` : f.student.admissionNumber}</span></span>
                      </Link>
                    </TD>
                    <TD label="Fee"><Link href={`/fees/${f.id}`} className="hover:text-primary">{f.title}</Link></TD>
                    <TD label="Due" className="whitespace-nowrap">{formatDate(f.dueDate)}</TD>
                    <TD label="Net" className="text-right tabular-nums">{money(f.net)}</TD>
                    <TD label="Paid" className="text-right tabular-nums">{money(f.amountPaid)}</TD>
                    <TD label="Balance" className="text-right font-medium tabular-nums">{money(f.balance)}</TD>
                    <TD label="Status"><StatusBadge status={f.display} /></TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} basePath="/fees" searchParams={params} />
        </>
      )}
    </Card>
  );
}

async function PaymentsTab({ params, money, actor }: { params: SP; money: Money; actor: ActorT }) {
  const { page, pageSize, skip, take } = pageParams(params, 25);
  const { total, rows, sum } = await listPayments(actor, { method: sp(params, "method"), skip, take });
  return (
    <Card>
      <Toolbar>
        <FilterSelect param="method" label="Method" placeholder="All methods" options={PAYMENT_METHODS.map((m) => ({ value: m, label: titleCase(m) }))} />
        <p className="text-sm text-muted-foreground sm:ml-auto">Total collected: <strong className="text-foreground">{money(sum)}</strong></p>
      </Toolbar>
      {rows.length === 0 ? (
        <EmptyState title="No payments" />
      ) : (
        <>
          <Table>
            <THead><TR><TH>Receipt</TH><TH>Date</TH><TH>Student</TH><TH>Fee</TH><TH>Method</TH><TH className="text-right">Amount</TH></TR></THead>
            <TBody>
              {rows.map((p) => (
                <TR key={p.id}>
                  <TD><Link href={`/fees/receipts/${p.id}`} className="font-medium text-primary hover:underline">{p.receiptNumber}</Link></TD>
                  <TD label="Date">{formatDate(p.paidAt)}</TD>
                  <TD label="Student">{fullName(p.fee.student.user)}</TD>
                  <TD label="Fee">{p.fee.title}</TD>
                  <TD label="Method"><Badge>{titleCase(p.method)}</Badge></TD>
                  <TD label="Amount" className="text-right tabular-nums">{money(p.amount)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={total} basePath="/fees" searchParams={params} />
        </>
      )}
    </Card>
  );
}
