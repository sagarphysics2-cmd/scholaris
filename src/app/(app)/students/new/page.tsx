import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { sectionOptions } from "@/server/services/students.service";
import { createStudentAction } from "../actions";
import { StudentForm } from "../student-form";

export const metadata: Metadata = { title: "Add student" };

export default async function NewStudentPage() {
  const actor = await requirePermission("students.write");
  const [sections, parents] = await Promise.all([
    sectionOptions(actor.schoolId!),
    db.parent.findMany({ where: { schoolId: actor.schoolId!, status: "ACTIVE" }, include: { user: true }, orderBy: { user: { lastName: "asc" } } }),
  ]);
  return (
    <>
      <PageHeader title="Add student" breadcrumbs={[{ label: "Students", href: "/students" }, { label: "New" }]} />
      <Card>
        <CardContent>
          <StudentForm
            mode="create"
            action={createStudentAction}
            sections={sections}
            parents={parents.map((p) => ({ value: p.id, label: `${p.user.firstName} ${p.user.lastName}${p.user.email ? ` (${p.user.email})` : ""}` }))}
            cancelHref="/students"
          />
        </CardContent>
      </Card>
    </>
  );
}
