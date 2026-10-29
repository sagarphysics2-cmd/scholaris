import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { studentPickerOptions } from "@/server/services/parents.service";
import { createParentAction } from "../actions";
import { ParentForm } from "../parent-form";

export const metadata: Metadata = { title: "Add parent" };

export default async function NewParentPage() {
  const actor = await requirePermission("parents.write");
  const students = await studentPickerOptions(actor.schoolId!);
  return (
    <>
      <PageHeader title="Add parent / guardian" breadcrumbs={[{ label: "Parents", href: "/parents" }, { label: "New" }]} />
      <Card><CardContent><ParentForm mode="create" action={createParentAction} students={students} cancelHref="/parents" /></CardContent></Card>
    </>
  );
}
