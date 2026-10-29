import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { assignmentFormOptions, getAssignment } from "@/server/services/assignments.service";
import { updateAssignmentAction } from "../../actions";
import { AssignmentForm } from "../../forms";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Edit assignment" };

function toLocalInput(d: Date) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export default async function EditAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("assignments.write");
  const [{ assignment: a, canManage }, opts] = await Promise.all([load(getAssignment(actor, id)), assignmentFormOptions(actor)]);
  if (!canManage) notFound();
  return (
    <>
      <PageHeader title={`Edit: ${a.title}`} breadcrumbs={[{ label: "Assignments", href: "/assignments" }, { label: a.title, href: `/assignments/${id}` }, { label: "Edit" }]} />
      <Card>
        <CardContent>
          <AssignmentForm
            action={updateAssignmentAction.bind(null, id)}
            sections={opts.sections}
            subjectsBySection={opts.subjectsBySection}
            cancelHref={`/assignments/${id}`}
            defaults={{ title: a.title, description: a.description, sectionId: a.sectionId, subjectId: a.subjectId, dueDate: toLocalInput(a.dueDate), maxMarks: a.maxMarks, status: a.status }}
          />
        </CardContent>
      </Card>
    </>
  );
}
