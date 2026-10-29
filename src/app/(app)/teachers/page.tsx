import type { Metadata } from "next";
import Link from "next/link";
import { Download, Plus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput, SortHeader } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatDate, fullName } from "@/lib/utils";
import { listTeachers } from "@/server/services/teachers.service";

export const metadata: Metadata = { title: "Teachers" };

export default async function TeachersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("teachers.read");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const filters = { q: sp(params, "q"), status: sp(params, "status"), subjectId: sp(params, "subjectId"), sort: sp(params, "sort"), dir: sp(params, "dir") };
  const [{ total, rows }, subjects] = await Promise.all([
    listTeachers(actor, { ...filters, skip, take }),
    db.subject.findMany({ where: { schoolId: actor.schoolId! }, orderBy: { name: "asc" } }),
  ]);
  const canWrite = can(actor, "teachers.write");
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader
        title="Teachers"
        description={`${total} ${filters.status === "ARCHIVED" ? "archived" : "active"} teacher${total === 1 ? "" : "s"}.`}
        actions={
          canWrite && (
            <>
              <ButtonLink href={`/api/export/teachers${qs ? `?${qs}` : ""}`} variant="outline" prefetch={false}><Download /> Export</ButtonLink>
              <ButtonLink href="/teachers/new"><Plus /> Add teacher</ButtonLink>
            </>
          )
        }
      />
      <Card>
        <Toolbar>
          <SearchInput placeholder="Search name, email, employee ID…" />
          <FilterSelect param="subjectId" label="Filter by subject" placeholder="All subjects" options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          <FilterSelect param="status" label="Filter by status" placeholder="Active" options={[{ value: "ARCHIVED", label: "Archived" }]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={<Users />} title="No teachers found" description={canWrite ? "Add your first teacher to start assigning classes." : undefined} action={canWrite && <ButtonLink href="/teachers/new"><Plus /> Add teacher</ButtonLink>} />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH><SortHeader field="name" label="Teacher" /></TH>
                  <TH><SortHeader field="employee" label="Employee ID" /></TH>
                  <TH>Subjects</TH>
                  <TH>Class teacher</TH>
                  <TH>Phone</TH>
                  <TH><SortHeader field="joined" label="Joined" /></TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((t) => {
                  const subjectsTaught = [...new Set(t.teacherSubjects.map((s) => s.subject.name))];
                  return (
                    <TR key={t.id}>
                      <TD>
                        <Link href={`/teachers/${t.id}`} className="flex items-center gap-3 font-medium hover:text-primary">
                          <Avatar name={fullName(t.user)} fileId={t.user.avatarFileId} size="sm" />
                          <span className="min-w-0 text-left">
                            <span className="block truncate">{fullName(t.user)}</span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">{t.user.email}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD label="Employee ID" className="tabular-nums">{t.employeeId}</TD>
                      <TD label="Subjects">
                        <div className="flex flex-wrap justify-end gap-1 md:justify-start">
                          {subjectsTaught.length ? subjectsTaught.map((s) => <Badge key={s} tone="primary">{s}</Badge>) : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TD>
                      <TD label="Class teacher">{t.classTeacherOf.map((s) => `${s.class.name}-${s.name}`).join(", ") || "—"}</TD>
                      <TD label="Phone">{t.user.phone ?? "—"}</TD>
                      <TD label="Joined">{formatDate(t.joiningDate)}</TD>
                      <TD label="Status"><StatusBadge status={t.user.status === "INVITED" && t.status === "ACTIVE" ? "INVITED" : t.status} /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/teachers" searchParams={params} />
          </>
        )}
      </Card>
    </>
  );
}
