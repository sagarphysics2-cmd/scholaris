import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { can, requirePermission } from "@/lib/auth/actor";
import { formatDate } from "@/lib/utils";
import { listExams } from "@/server/services/exams.service";
import { saveExamAction } from "./actions";
import { ExamForm } from "./forms";

export const metadata: Metadata = { title: "Examinations" };

export default async function ExamsPage() {
  const actor = await requirePermission("exams.read");
  const exams = await listExams(actor);
  const canManage = can(actor, "exams.manage");
  return (
    <>
      <PageHeader
        title="Examinations"
        description="Exam schedules, papers and marks for the current academic year."
        actions={canManage && <ModalButton label="New examination" icon={<Plus />} title="Create examination"><ExamForm action={saveExamAction.bind(null, undefined)} /></ModalButton>}
      />
      <Card>
        {exams.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title="No examinations yet" description={canManage ? "Create an examination and add papers to its schedule." : "Nothing scheduled yet."} />
        ) : (
          <Table>
            <THead><TR><TH>Examination</TH><TH>Dates</TH><TH>Papers</TH><TH>Classes</TH><TH>Status</TH></TR></THead>
            <TBody>
              {exams.map((e) => (
                <TR key={e.id}>
                  <TD><Link href={`/exams/${e.id}`} className="font-medium hover:text-primary">{e.name}</Link>{e.term && <p className="text-xs text-muted-foreground">{e.term}</p>}</TD>
                  <TD label="Dates" className="whitespace-nowrap">{formatDate(e.startDate)} – {formatDate(e.endDate)}</TD>
                  <TD label="Papers" className="tabular-nums">{e._count.subjects}</TD>
                  <TD label="Classes" className="tabular-nums">{e.subjects.length}</TD>
                  <TD label="Status"><StatusBadge status={e.status} label={e.status === "PUBLISHED" ? "Results published" : undefined} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
