import type { Metadata } from "next";
import Link from "next/link";
import { Download, GraduationCap, Plus, Upload } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput, SortHeader } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { formatDate, fullName } from "@/lib/utils";
import { classOptions, listStudents, sectionOptions } from "@/server/services/students.service";

export const metadata: Metadata = { title: "Students" };

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function StudentsPage({ searchParams }: { searchParams: SP }) {
  const actor = await requirePermission("students.read");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const filters = {
    q: sp(params, "q"),
    classId: sp(params, "classId"),
    sectionId: sp(params, "sectionId"),
    status: sp(params, "status"),
    gender: sp(params, "gender"),
    sort: sp(params, "sort"),
    dir: sp(params, "dir"),
  };
  const [{ total, rows }, classes, sections] = await Promise.all([
    listStudents(actor, { ...filters, skip, take }),
    classOptions(actor.schoolId!),
    sectionOptions(actor.schoolId!),
  ]);
  const canWrite = can(actor, "students.write");
  const isParent = actor.role === "PARENT";
  const exportQs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title={isParent ? "My Children" : actor.role === "TEACHER" ? "My Students" : "Students"}
        description={isParent ? "Children linked to your account." : `${total} student${total === 1 ? "" : "s"} ${filters.q || filters.classId || filters.sectionId || filters.status ? "match your filters" : "enrolled"}.`}
        actions={
          canWrite && (
            <>
              <ButtonLink href={`/api/export/students${exportQs ? `?${exportQs}` : ""}`} variant="outline" prefetch={false}>
                <Download /> Export
              </ButtonLink>
              <ButtonLink href="/students/import" variant="outline">
                <Upload /> Import
              </ButtonLink>
              <ButtonLink href="/students/new">
                <Plus /> Add student
              </ButtonLink>
            </>
          )
        }
      />
      <Card>
        {!isParent && (
          <Toolbar>
            <SearchInput placeholder="Search name, email, admission no…" />
            <FilterSelect param="classId" label="Filter by class" placeholder="All classes" options={classes} />
            <FilterSelect
              param="sectionId"
              label="Filter by section"
              placeholder="All sections"
              options={sections.filter((s) => !filters.classId || s.classId === filters.classId)}
            />
            <FilterSelect
              param="status"
              label="Filter by status"
              placeholder="Current students"
              options={["ACTIVE", "SUSPENDED", "GRADUATED", "TRANSFERRED", "ARCHIVED"].map((s) => ({ value: s, label: s[0] + s.slice(1).toLowerCase() }))}
            />
            <FilterSelect param="gender" label="Filter by gender" placeholder="Any gender" options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} />
          </Toolbar>
        )}
        {rows.length === 0 ? (
          <EmptyState
            icon={<GraduationCap />}
            title={filters.q || filters.classId || filters.status ? "No students match your filters" : "No students yet"}
            description={canWrite ? "Add students one by one or import a CSV file." : "There are no students to show."}
            action={canWrite && <ButtonLink href="/students/new"><Plus /> Add student</ButtonLink>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH><SortHeader field="name" label="Student" /></TH>
                  <TH><SortHeader field="admission" label="Admission No" /></TH>
                  <TH>Class</TH>
                  <TH>Roll</TH>
                  <TH>Parent / Guardian</TH>
                  <TH><SortHeader field="admitted" label="Admitted" /></TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((s) => {
                  const e = s.enrollments[0];
                  const parent = s.parents[0]?.parent.user;
                  return (
                    <TR key={s.id}>
                      <TD>
                        <Link href={`/students/${s.id}`} className="flex items-center gap-3 font-medium hover:text-primary max-md:w-full">
                          <Avatar name={fullName(s.user)} fileId={s.user.avatarFileId} size="sm" />
                          <span className="min-w-0 text-left">
                            <span className="block truncate">{fullName(s.user)}</span>
                            <span className="block truncate text-xs font-normal text-muted-foreground">{s.studentCode}</span>
                          </span>
                        </Link>
                      </TD>
                      <TD label="Admission" className="tabular-nums">{s.admissionNumber}</TD>
                      <TD label="Class">{e ? `${e.section.class.name} – ${e.section.name}` : <span className="text-muted-foreground">Not enrolled</span>}</TD>
                      <TD label="Roll" className="tabular-nums">{e?.rollNumber ?? "—"}</TD>
                      <TD label="Parent">{parent ? <span>{fullName(parent)}<span className="block text-xs text-muted-foreground">{parent.phone}</span></span> : "—"}</TD>
                      <TD label="Admitted">{formatDate(s.admissionDate)}</TD>
                      <TD label="Status"><StatusBadge status={s.status} /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/students" searchParams={params} />
          </>
        )}
      </Card>
    </>
  );
}
