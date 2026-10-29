import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { sp } from "@/components/ui/pagination";
import { requireAnyPermission } from "@/lib/auth/actor";
import { formatDate } from "@/lib/utils";
import { getMarksSheet } from "@/server/services/exams.service";
import { MarksSheet } from "./marks-sheet";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Enter marks" };

export default async function MarksPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const actor = await requireAnyPermission("marks.enter", "exams.manage");
  const paperId = sp(q, "paperId");
  const sectionId = sp(q, "sectionId");
  if (!paperId || !sectionId) notFound();
  const sheet = await load(getMarksSheet(actor, paperId, sectionId));
  if (sheet.paper.examinationId !== id) notFound();
  const p = sheet.paper;
  return (
    <>
      <PageHeader
        title={`${p.subject.name} — ${p.class.name} ${sheet.section.name}`}
        description={`${p.examination.name} · ${formatDate(p.examDate)} · Max ${p.maxMarks}, pass ${p.passingMarks}`}
        breadcrumbs={[{ label: "Examinations", href: "/exams" }, { label: p.examination.name, href: `/exams/${id}` }, { label: "Marks" }]}
      />
      <Card>
        <MarksSheet paperId={p.id} sectionId={sectionId} maxMarks={p.maxMarks} passingMarks={p.passingMarks} rows={sheet.rows} locked={sheet.locked} />
      </Card>
    </>
  );
}
