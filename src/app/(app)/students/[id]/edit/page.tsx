import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { getCurrentAcademicYear } from "@/server/authz/scope";
import { getStudentProfile, sectionOptions } from "@/server/services/students.service";
import { toISODate } from "@/lib/utils";
import { updateStudentAction } from "../../actions";
import { StudentForm } from "../../student-form";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("students.write");
  const [student, sections, year] = await Promise.all([load(getStudentProfile(actor, id)), sectionOptions(actor.schoolId!), getCurrentAcademicYear(actor.schoolId!)]);
  const enrollment = student.enrollments.find((e) => e.academicYearId === year?.id);
  const name = `${student.user.firstName} ${student.user.lastName}`;
  return (
    <>
      <PageHeader title={`Edit ${name}`} breadcrumbs={[{ label: "Students", href: "/students" }, { label: name, href: `/students/${id}` }, { label: "Edit" }]} />
      <Card>
        <CardContent>
          <StudentForm
            mode="edit"
            action={updateStudentAction.bind(null, id)}
            sections={sections}
            cancelHref={`/students/${id}`}
            defaults={{
              firstName: student.user.firstName,
              lastName: student.user.lastName,
              email: student.user.email ?? "",
              phone: student.user.phone ?? "",
              dateOfBirth: toISODate(student.dateOfBirth),
              gender: student.gender,
              address: student.address ?? "",
              emergencyContactName: student.emergencyContactName ?? "",
              emergencyContactPhone: student.emergencyContactPhone ?? "",
              admissionNumber: student.admissionNumber,
              studentCode: student.studentCode,
              admissionDate: toISODate(student.admissionDate),
              sectionId: enrollment?.sectionId,
              rollNumber: enrollment?.rollNumber,
              status: student.status,
              bloodGroup: student.bloodGroup ?? "",
              notes: student.notes ?? "",
            }}
          />
        </CardContent>
      </Card>
    </>
  );
}
