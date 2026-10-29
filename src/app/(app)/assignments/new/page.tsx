import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { assignmentFormOptions } from "@/server/services/assignments.service";
import { createAssignmentAction } from "../actions";
import { AssignmentForm } from "../forms";

export const metadata: Metadata = { title: "New assignment" };

export default async function NewAssignmentPage() {
  const actor = await requirePermission("assignments.write");
  const opts = await assignmentFormOptions(actor);
  return (
    <>
      <PageHeader title="New assignment" breadcrumbs={[{ label: "Assignments", href: "/assignments" }, { label: "New" }]} />
      <Card>
        <CardContent>
          {opts.sections.length === 0 ? (
            <EmptyState title="No teaching assignments" description="You need to be assigned a subject in a section before creating assignments." />
          ) : (
            <AssignmentForm action={createAssignmentAction} sections={opts.sections} subjectsBySection={opts.subjectsBySection} cancelHref="/assignments" />
          )}
        </CardContent>
      </Card>
    </>
  );
}
