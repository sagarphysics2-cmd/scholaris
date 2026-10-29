import type { Metadata } from "next";
import { CalendarDays, Copy, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/actor";
import { formatDate, toISODate } from "@/lib/utils";
import { listAcademicYears } from "@/server/services/academics.service";
import { copyStructureAction, deleteYearAction, saveAcademicYearAction, setCurrentYearAction } from "./actions";
import { AcademicYearForm, CopyStructureForm } from "./forms";

export const metadata: Metadata = { title: "Academic Years" };

export default async function AcademicYearsPage() {
  const actor = await requirePermission("academic_years.manage");
  const years = await listAcademicYears(actor);
  return (
    <>
      <PageHeader
        title="Academic Years"
        description="The current year drives class sections, enrollments, attendance, exams and fees across the app."
        actions={
          <>
            {years.length > 1 && (
              <ModalButton variant="outline" icon={<Copy />} label="Copy structure" title="Copy class structure" description="Copy sections, curriculum and teaching assignments into a new year.">
                <CopyStructureForm action={copyStructureAction} years={years.map((y) => ({ value: y.id, label: y.name }))} />
              </ModalButton>
            )}
            <ModalButton icon={<Plus />} label="New academic year" title="Create academic year"><AcademicYearForm action={saveAcademicYearAction.bind(null, undefined)} /></ModalButton>
          </>
        }
      />
      <Card>
        {years.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="No academic years" description="Create the first academic year to get started." />
        ) : (
          <Table>
            <THead><TR><TH>Year</TH><TH>Dates</TH><TH>Sections</TH><TH>Enrollments</TH><TH>Exams</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {years.map((y) => (
                <TR key={y.id}>
                  <TD><span className="font-medium">{y.name}</span> {y.isCurrent && <Badge tone="success" className="ml-2">Current</Badge>}</TD>
                  <TD label="Dates">{formatDate(y.startDate)} – {formatDate(y.endDate)}</TD>
                  <TD label="Sections" className="tabular-nums">{y._count.sections}</TD>
                  <TD label="Enrollments" className="tabular-nums">{y._count.enrollments}</TD>
                  <TD label="Exams" className="tabular-nums">{y._count.examinations}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {!y.isCurrent && (
                        <ConfirmAction action={setCurrentYearAction.bind(null, y.id)} variant="ghost" size="sm" icon={<Star />} label="Set current" title={`Make ${y.name} current?`} description="Dashboards, attendance, classes and timetables will switch to this year for everyone." confirmLabel="Set as current" confirmVariant="primary" />
                      )}
                      <ModalButton variant="ghost" size="icon-sm" icon={<Pencil />} ariaLabel={`Edit ${y.name}`} title={`Edit ${y.name}`}>
                        <AcademicYearForm action={saveAcademicYearAction.bind(null, y.id)} defaults={{ name: y.name, startDate: toISODate(y.startDate), endDate: toISODate(y.endDate) }} />
                      </ModalButton>
                      {!y.isCurrent && (
                        <ConfirmAction action={deleteYearAction.bind(null, y.id)} variant="danger-ghost" size="icon-sm" icon={<Trash2 />} ariaLabel={`Delete ${y.name}`} title={`Delete ${y.name}?`} description="Only years without sections, enrollments, exams or fees can be deleted." confirmLabel="Delete" />
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
