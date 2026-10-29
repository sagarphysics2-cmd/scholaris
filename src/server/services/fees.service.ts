import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { FeeCategoryType, PaymentMethod } from "@/generated/prisma/enums";
import { toCSV } from "@/lib/csv";
import { balance, displayStatus, netAmount, paymentError, storedStatus } from "@/lib/fees";
import { addDays, round2, todayUTC, toISODate, toNumber } from "@/lib/utils";
import { audit, diff } from "@/server/audit";
import { assertCan, requireSchoolId, type Actor } from "@/server/authz/guards";
import { assertCanViewStudent, getCurrentAcademicYear, isSchoolWide, parentChildIds } from "@/server/authz/scope";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { dispatchExternal, notifyUsers, studentAndParentUserIds } from "@/server/notifications";
import { paymentProvider } from "@/server/payments";
import { schoolSettings } from "./attendance.service";

// ─── Categories ─────────────────────────────────────────────────────────────

export async function listFeeCategories(actor: Actor) {
  assertCan(actor, "fees.read");
  return db.feeCategory.findMany({ where: { schoolId: requireSchoolId(actor) }, orderBy: { name: "asc" }, include: { _count: { select: { fees: true } } } });
}

export async function saveFeeCategory(actor: Actor, input: { name: string; type: FeeCategoryType; description?: string | null; defaultAmount?: number }, id?: string) {
  assertCan(actor, "fees.manage");
  const schoolId = requireSchoolId(actor);
  const data = { name: input.name, type: input.type, description: input.description ?? null, defaultAmount: input.defaultAmount ?? null };
  if (id) {
    if (!(await db.feeCategory.findFirst({ where: { id, schoolId } }))) throw new NotFoundError("Category");
    await db.feeCategory.update({ where: { id }, data });
  } else await db.feeCategory.create({ data: { ...data, schoolId } });
  await audit(actor, { action: id ? "fee_category.update" : "fee_category.create", entity: "FeeCategory", entityId: id, metadata: data });
}

export async function deleteFeeCategory(actor: Actor, id: string) {
  assertCan(actor, "fees.manage");
  const c = await db.feeCategory.findFirst({ where: { id, schoolId: requireSchoolId(actor) }, include: { _count: { select: { fees: true } } } });
  if (!c) throw new NotFoundError("Category");
  if (c._count.fees) throw new ConflictError("This category has fees and cannot be deleted.");
  await db.feeCategory.delete({ where: { id } });
  await audit(actor, { action: "fee_category.delete", entity: "FeeCategory", entityId: id, metadata: { name: c.name } });
}

// ─── Fees ───────────────────────────────────────────────────────────────────

/** Learners: whose fees may they see? Students only when the school allows it. */
async function learnerStudentIds(actor: Actor) {
  if (actor.parentId) return parentChildIds(actor.parentId);
  if (actor.studentId) {
    const settings = await schoolSettings(requireSchoolId(actor));
    if (!settings.fees.showFeesToStudents) throw new ForbiddenError("Fee information is shared with parents only.");
    return [actor.studentId];
  }
  return [];
}

function statusWhere(status?: string): Prisma.FeeWhereInput | null {
  const today = todayUTC();
  switch (status) {
    case "PAID":
      return { status: "PAID" };
    case "WAIVED":
      return { status: "WAIVED" };
    case "PARTIALLY_PAID":
      return { status: "PARTIALLY_PAID", dueDate: { gte: today } };
    case "PENDING":
      return { status: "PENDING", dueDate: { gte: today } };
    case "OVERDUE":
      return { status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: today } };
    case "OUTSTANDING":
      return { status: { in: ["PENDING", "PARTIALLY_PAID"] } };
    default:
      return null;
  }
}

export type FeeListParams = { q?: string; status?: string; categoryId?: string; classId?: string; sectionId?: string; studentId?: string; skip?: number; take?: number };

export async function listFees(actor: Actor, p: FeeListParams) {
  assertCan(actor, "fees.read");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const and: Prisma.FeeWhereInput[] = [{ schoolId }];
  if (!isSchoolWide(actor)) and.push({ studentId: { in: await learnerStudentIds(actor) } });
  if (p.studentId) and.push({ studentId: p.studentId });
  const sw = statusWhere(p.status);
  if (sw) and.push(sw);
  if (p.categoryId) and.push({ categoryId: p.categoryId });
  if (p.sectionId) and.push({ student: { enrollments: { some: { sectionId: p.sectionId, academicYearId: year?.id } } } });
  else if (p.classId) and.push({ student: { enrollments: { some: { section: { classId: p.classId }, academicYearId: year?.id } } } });
  if (p.q) {
    for (const t of p.q.split(/\s+/).filter(Boolean).slice(0, 3)) {
      and.push({ OR: [{ title: { contains: t, mode: "insensitive" } }, { student: { admissionNumber: { contains: t, mode: "insensitive" } } }, { student: { user: { OR: [{ firstName: { contains: t, mode: "insensitive" } }, { lastName: { contains: t, mode: "insensitive" } }] } } }] });
    }
  }
  const where = { AND: and };
  const [total, rows, sums] = await Promise.all([
    db.fee.count({ where }),
    db.fee.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      skip: p.skip,
      take: p.take,
      include: {
        category: true,
        student: { include: { user: { select: { firstName: true, lastName: true, avatarFileId: true } }, enrollments: { where: { academicYearId: year?.id }, include: { section: { include: { class: true } } } } } },
      },
    }),
    db.fee.aggregate({ where, _sum: { amount: true, discount: true, amountPaid: true } }),
  ]);
  const billed = toNumber(sums._sum.amount) - toNumber(sums._sum.discount);
  return { total, rows: rows.map((f) => ({ ...f, display: displayStatus(f), balance: balance(f), net: netAmount(f) })), totals: { billed: round2(billed), paid: round2(toNumber(sums._sum.amountPaid)), outstanding: round2(billed - toNumber(sums._sum.amountPaid)) } };
}

export async function getFee(actor: Actor, id: string) {
  assertCan(actor, "fees.read");
  const schoolId = requireSchoolId(actor);
  const fee = await db.fee.findFirst({
    where: { id, schoolId },
    include: {
      category: true,
      academicYear: true,
      payments: { orderBy: { paidAt: "desc" } },
      student: { include: { user: true, enrollments: { where: { academicYear: { isCurrent: true } }, include: { section: { include: { class: true } } } } } },
    },
  });
  if (!fee) throw new NotFoundError("Fee");
  if (!isSchoolWide(actor) && !(await learnerStudentIds(actor)).includes(fee.studentId)) throw new NotFoundError("Fee");
  return { ...fee, display: displayStatus(fee), balance: balance(fee), net: netAmount(fee) };
}

type AssignInput = { categoryId: string; title: string; amount: number; discount: number; dueDate: Date; target: "CLASS" | "SECTION" | "STUDENTS"; classId?: string | null; sectionId?: string | null; studentIds: string[]; notes?: string | null };

/** Bills a fee to a whole class, a section or selected students. Duplicate titles are skipped. */
export async function assignFees(actor: Actor, input: AssignInput) {
  assertCan(actor, "fees.manage");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  if (!year) throw new ValidationError("Create an academic year first.");
  const category = await db.feeCategory.findFirst({ where: { id: input.categoryId, schoolId } });
  if (!category) throw new ValidationError(undefined, { categoryId: ["Choose a valid category."] });
  let studentIds: string[];
  if (input.target === "STUDENTS") {
    studentIds = (await db.student.findMany({ where: { id: { in: input.studentIds }, schoolId, status: "ACTIVE" }, select: { id: true } })).map((s) => s.id);
  } else {
    const enrollmentWhere = input.target === "SECTION" ? { sectionId: input.sectionId!, section: { class: { schoolId } } } : { section: { classId: input.classId!, class: { schoolId } } };
    studentIds = (await db.enrollment.findMany({ where: { ...enrollmentWhere, academicYearId: year.id, status: "ACTIVE", student: { status: "ACTIVE" } }, select: { studentId: true } })).map((e) => e.studentId);
  }
  if (studentIds.length === 0) throw new ValidationError("No active students match the selection.");
  const existing = new Set((await db.fee.findMany({ where: { studentId: { in: studentIds }, categoryId: category.id, title: input.title, academicYearId: year.id }, select: { studentId: true } })).map((f) => f.studentId));
  const targets = studentIds.filter((id) => !existing.has(id));
  const status = storedStatus({ amount: input.amount, discount: input.discount, amountPaid: 0 });
  await db.$transaction(async (tx) => {
    await tx.fee.createMany({
      data: targets.map((studentId) => ({ schoolId, studentId, categoryId: category.id, academicYearId: year.id, title: input.title, amount: input.amount, discount: input.discount, dueDate: input.dueDate, notes: input.notes ?? null, status })),
    });
    await audit(actor, { action: "fee.assign", entity: "Fee", metadata: { title: input.title, amount: input.amount, discount: input.discount, target: input.target, created: targets.length, skipped: existing.size } }, tx);
  });
  if (targets.length) {
    const userIds = await studentAndParentUserIds(targets);
    await notifyUsers(userIds, { type: "FEE_REMINDER", title: "New fee", body: `${input.title} is due on ${toISODate(input.dueDate)}.`, link: "/fees" });
  }
  return { created: targets.length, skipped: existing.size };
}

export async function updateFee(actor: Actor, id: string, input: { title: string; amount: number; discount: number; dueDate: Date; notes?: string | null }) {
  assertCan(actor, "fees.manage");
  const fee = await getFee(actor, id);
  if (round2(input.amount - input.discount) < toNumber(fee.amountPaid)) {
    throw new ValidationError(undefined, { amount: [`Already paid ${toNumber(fee.amountPaid).toFixed(2)}; net amount cannot be lower.`] });
  }
  const data = { title: input.title, amount: input.amount, discount: input.discount, dueDate: input.dueDate, notes: input.notes ?? null, status: storedStatus({ ...input, amountPaid: fee.amountPaid }) };
  await db.fee.update({ where: { id }, data });
  await audit(actor, { action: "fee.update", entity: "Fee", entityId: id, metadata: { changes: diff(fee as unknown as Record<string, unknown>, data) } });
}

export async function deleteFee(actor: Actor, id: string) {
  assertCan(actor, "fees.manage");
  const fee = await getFee(actor, id);
  if (fee.payments.length) throw new ConflictError("This fee has payments. Adjust it with a discount instead of deleting.");
  await db.fee.delete({ where: { id } });
  await audit(actor, { action: "fee.delete", entity: "Fee", entityId: id, metadata: { title: fee.title, studentId: fee.studentId, amount: toNumber(fee.amount) } });
}

async function nextReceiptNumber(tx: Prisma.TransactionClient, schoolId: string) {
  const settings = await schoolSettings(schoolId);
  const prefix = `${settings.fees.receiptPrefix}-${new Date().getUTCFullYear()}-`;
  const last = await tx.feePayment.findFirst({ where: { receiptNumber: { startsWith: prefix }, fee: { schoolId } }, orderBy: { receiptNumber: "desc" }, select: { receiptNumber: true } });
  const n = last ? Number(last.receiptNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(Number.isFinite(n) ? n : 1).padStart(6, "0")}`;
}

/**
 * Records a payment. The fee row is locked (SELECT … FOR UPDATE) so two cashiers can't
 * overpay the same fee concurrently; amountPaid and status are updated atomically.
 */
export async function recordPayment(actor: Actor, feeId: string, input: { amount: number; method: PaymentMethod; reference?: string | null; paidAt: Date; notes?: string | null }) {
  assertCan(actor, "fees.manage");
  const schoolId = requireSchoolId(actor);
  if (input.paidAt > addDays(todayUTC(), 1)) throw new ValidationError(undefined, { paidAt: ["Payment date cannot be in the future."] });
  const provider = paymentProvider();
  const payment = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM fees WHERE id = ${feeId} AND school_id = ${schoolId} FOR UPDATE`;
    const fee = await tx.fee.findFirst({ where: { id: feeId, schoolId } });
    if (!fee) throw new NotFoundError("Fee");
    const err = paymentError(fee, input.amount);
    if (err) throw new ValidationError(err, { amount: [err] });
    const receiptNumber = await nextReceiptNumber(tx, schoolId);
    const created = await tx.feePayment.create({
      data: { feeId, receiptNumber, amount: round2(input.amount), method: input.method, reference: provider.normaliseReference(input.method, input.reference), paidAt: input.paidAt, notes: input.notes ?? null, receivedById: actor.userId },
    });
    const amountPaid = round2(toNumber(fee.amountPaid) + input.amount);
    await tx.fee.update({ where: { id: feeId }, data: { amountPaid, status: storedStatus({ ...fee, amountPaid }) } });
    await audit(actor, { action: "fee.payment", entity: "Fee", entityId: feeId, metadata: { receiptNumber, amount: input.amount, method: input.method } }, tx);
    return { ...created, studentId: fee.studentId, title: fee.title };
  });
  const userIds = await studentAndParentUserIds([payment.studentId]);
  const notice = { type: "FEE_REMINDER" as const, title: "Payment received", body: `Payment of ${input.amount.toFixed(2)} received for ${payment.title}. Receipt ${payment.receiptNumber}.`, link: `/fees/receipts/${payment.id}` };
  await notifyUsers(userIds, notice);
  return payment;
}

export async function getReceipt(actor: Actor, paymentId: string) {
  assertCan(actor, "fees.read");
  const schoolId = requireSchoolId(actor);
  const p = await db.feePayment.findFirst({ where: { id: paymentId, fee: { schoolId } }, include: { fee: { include: { category: true, academicYear: true } } } });
  if (!p) throw new NotFoundError("Receipt");
  const fee = await getFee(actor, p.feeId); // re-checks learner access
  const receivedBy = p.receivedById ? await db.user.findUnique({ where: { id: p.receivedById }, select: { firstName: true, lastName: true } }) : null;
  return { payment: p, fee, receivedBy };
}

// ─── Summaries ──────────────────────────────────────────────────────────────

export async function feeOverview(actor: Actor) {
  assertCan(actor, "fees.manage");
  const schoolId = requireSchoolId(actor);
  const year = await getCurrentAcademicYear(schoolId);
  const today = todayUTC();
  const base: Prisma.FeeWhereInput = { schoolId, academicYearId: year?.id };
  const [all, overdue, byCategory, payments, sections] = await Promise.all([
    db.fee.aggregate({ where: base, _sum: { amount: true, discount: true, amountPaid: true }, _count: true }),
    db.fee.aggregate({ where: { ...base, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lt: today } }, _sum: { amount: true, discount: true, amountPaid: true }, _count: true }),
    db.fee.groupBy({ by: ["categoryId"], where: base, _sum: { amount: true, discount: true, amountPaid: true } }),
    db.feePayment.findMany({ where: { fee: base, paidAt: { gte: addDays(today, -180) } }, select: { amount: true, paidAt: true } }),
    db.section.findMany({ where: { academicYearId: year?.id ?? "__none__", class: { schoolId } }, include: { class: true }, orderBy: [{ class: { level: "asc" } }, { name: "asc" }] }),
  ]);
  const categories = await db.feeCategory.findMany({ where: { schoolId } });
  const net = (s: { amount: unknown; discount: unknown }) => toNumber(s.amount as never) - toNumber(s.discount as never);
  const billed = net(all._sum);
  const collected = toNumber(all._sum.amountPaid);
  const months = new Map<string, number>();
  for (const p of payments) months.set(toISODate(p.paidAt).slice(0, 7), (months.get(toISODate(p.paidAt).slice(0, 7)) ?? 0) + toNumber(p.amount));
  const statusCounts = await db.fee.groupBy({ by: ["status"], where: base, _count: true });
  const bySection = [];
  for (const s of sections) {
    const agg = await db.fee.aggregate({ where: { ...base, student: { enrollments: { some: { sectionId: s.id } } } }, _sum: { amount: true, discount: true, amountPaid: true } });
    const b = net(agg._sum);
    bySection.push({ id: s.id, label: `${s.class.name.replace("Grade ", "G")}-${s.name}`, billed: round2(b), collected: round2(toNumber(agg._sum.amountPaid)), outstanding: round2(b - toNumber(agg._sum.amountPaid)) });
  }
  return {
    year,
    billed: round2(billed),
    collected: round2(collected),
    outstanding: round2(billed - collected),
    collectionRate: billed ? round2((collected / billed) * 100) : null,
    overdue: { count: overdue._count, amount: round2(net(overdue._sum) - toNumber(overdue._sum.amountPaid)) },
    statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
    byCategory: byCategory.map((c) => ({ name: categories.find((x) => x.id === c.categoryId)?.name ?? "—", billed: round2(net(c._sum)), collected: round2(toNumber(c._sum.amountPaid)) })),
    monthly: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }), amount: round2(v) })),
    bySection,
  };
}

/** Fee summary for one student (profile, parent dashboard). */
export async function studentFeeSummary(actor: Actor, studentId: string) {
  assertCan(actor, "fees.read");
  await assertCanViewStudent(actor, studentId);
  if (!isSchoolWide(actor) && !(await learnerStudentIds(actor)).includes(studentId)) throw new ForbiddenError();
  const fees = await db.fee.findMany({ where: { studentId }, orderBy: { dueDate: "asc" }, include: { category: true, payments: { orderBy: { paidAt: "desc" } } } });
  const rows = fees.map((f) => ({ ...f, display: displayStatus(f), balance: balance(f), net: netAmount(f) }));
  return {
    rows,
    totalDue: round2(rows.reduce((a, f) => a + f.net, 0)),
    totalPaid: round2(rows.reduce((a, f) => a + toNumber(f.amountPaid), 0)),
    outstanding: round2(rows.reduce((a, f) => a + Math.max(0, f.balance), 0)),
    overdue: rows.filter((f) => f.display === "OVERDUE"),
    nextDue: rows.find((f) => f.balance > 0 && f.display !== "OVERDUE") ?? null,
  };
}

export async function listPayments(actor: Actor, p: { from?: Date; to?: Date; method?: string; skip?: number; take?: number }) {
  assertCan(actor, "fees.manage");
  const schoolId = requireSchoolId(actor);
  const where: Prisma.FeePaymentWhereInput = { fee: { schoolId }, paidAt: { gte: p.from, lte: p.to ? addDays(p.to, 1) : undefined } };
  if (p.method) where.method = p.method as PaymentMethod;
  const [total, rows, sum] = await Promise.all([
    db.feePayment.count({ where }),
    db.feePayment.findMany({ where, orderBy: { paidAt: "desc" }, skip: p.skip, take: p.take, include: { fee: { include: { category: true, student: { include: { user: { select: { firstName: true, lastName: true } } } } } } } }),
    db.feePayment.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { total, rows, sum: round2(toNumber(sum._sum.amount)) };
}

export async function exportFeesCSV(actor: Actor, p: FeeListParams) {
  assertCan(actor, "fees.manage");
  const { rows } = await listFees(actor, { ...p, skip: 0, take: 10000 });
  await audit(actor, { action: "fee.export", entity: "Fee", metadata: { count: rows.length, filters: p } });
  return toCSV(
    ["Student", "Admission No", "Class", "Fee", "Category", "Amount", "Discount", "Net", "Paid", "Balance", "Due date", "Status"],
    rows.map((f) => {
      const e = f.student.enrollments[0];
      return [`${f.student.user.firstName} ${f.student.user.lastName}`, f.student.admissionNumber, e ? `${e.section.class.name}-${e.section.name}` : "", f.title, f.category.name, toNumber(f.amount), toNumber(f.discount), f.net, toNumber(f.amountPaid), f.balance, f.dueDate, f.display];
    }),
  );
}

/** Cron: remind families about fees due soon or overdue (at most once every 3 days per fee). */
export async function sendFeeReminders() {
  const schools = await db.school.findMany({ select: { id: true } });
  let sent = 0;
  for (const s of schools) {
    const settings = await schoolSettings(s.id);
    const horizon = addDays(todayUTC(), settings.fees.reminderDaysBeforeDue);
    const fees = await db.fee.findMany({ where: { schoolId: s.id, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueDate: { lte: horizon } }, include: { student: { include: { user: true } } } });
    for (const f of fees) {
      const link = `/fees/${f.id}`;
      const recent = await db.notification.findFirst({ where: { link, type: "FEE_REMINDER", createdAt: { gte: addDays(new Date(), -3) } } });
      if (recent) continue;
      const overdue = f.dueDate < todayUTC();
      const input = { type: "FEE_REMINDER" as const, title: overdue ? "Fee overdue" : "Fee due soon", body: `${f.title} for ${f.student.user.firstName}: ${balance(f).toFixed(2)} ${overdue ? "was" : "is"} due on ${toISODate(f.dueDate)}.`, link };
      const userIds = await studentAndParentUserIds([f.studentId]);
      sent += await notifyUsers(userIds, input);
      await dispatchExternal(s.id, userIds, input);
    }
  }
  return sent;
}
