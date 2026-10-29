import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { createTeacherAction } from "../actions";
import { TeacherForm } from "../teacher-form";

export const metadata: Metadata = { title: "Add teacher" };

export default async function NewTeacherPage() {
  await requirePermission("teachers.write");
  return (
    <>
      <PageHeader title="Add teacher" breadcrumbs={[{ label: "Teachers", href: "/teachers" }, { label: "New" }]} />
      <Card><CardContent><TeacherForm mode="create" action={createTeacherAction} cancelHref="/teachers" /></CardContent></Card>
    </>
  );
}
