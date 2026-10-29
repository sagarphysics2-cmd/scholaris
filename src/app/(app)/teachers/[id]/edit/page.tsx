import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { toISODate } from "@/lib/utils";
import { getTeacher } from "@/server/services/teachers.service";
import { updateTeacherAction } from "../../actions";
import { TeacherForm } from "../../teacher-form";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Edit teacher" };

export default async function EditTeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("teachers.write");
  const t = await load(getTeacher(actor, id));
  const name = `${t.user.firstName} ${t.user.lastName}`;
  return (
    <>
      <PageHeader title={`Edit ${name}`} breadcrumbs={[{ label: "Teachers", href: "/teachers" }, { label: name, href: `/teachers/${id}` }, { label: "Edit" }]} />
      <Card>
        <CardContent>
          <TeacherForm
            mode="edit"
            action={updateTeacherAction.bind(null, id)}
            cancelHref={`/teachers/${id}`}
            defaults={{
              firstName: t.user.firstName, lastName: t.user.lastName, email: t.user.email ?? "", phone: t.user.phone ?? "", employeeId: t.employeeId,
              gender: t.gender ?? "", dateOfBirth: t.dateOfBirth ? toISODate(t.dateOfBirth) : "", address: t.address ?? "",
              qualification: t.qualification ?? "", specialization: t.specialization ?? "", joiningDate: toISODate(t.joiningDate),
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
