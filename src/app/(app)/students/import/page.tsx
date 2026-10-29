import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import students" };

export default async function ImportStudentsPage() {
  await requirePermission("students.write");
  return (
    <>
      <PageHeader title="Import students" description="Add many students at once from a CSV file." breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Import" }]} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Upload CSV" description="Imports are all-or-nothing: if any row has a problem, nothing is saved and every issue is listed." />
          <CardContent>
            <ImportForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader title="File format" />
          <CardContent className="space-y-4 text-sm">
            <p className="text-muted-foreground">The first row must contain these column headers:</p>
            <ul className="space-y-1.5">
              {[
                ["First Name", true], ["Last Name", true], ["Date of Birth", true, "YYYY-MM-DD"], ["Gender", true, "MALE / FEMALE / OTHER"],
                ["Admission Number", true], ["Admission Date", true, "YYYY-MM-DD"], ["Class", true, "e.g. Grade 6"], ["Section", true, "e.g. A"],
                ["Roll Number", false], ["Email", false], ["Phone", false], ["Address", false], ["Emergency Contact Name", false], ["Emergency Contact Phone", false],
              ].map(([name, req, hint]) => (
                <li key={name as string} className="flex justify-between gap-2">
                  <span className="font-medium">{name as string}{req ? <span className="text-danger"> *</span> : null}</span>
                  {hint && <span className="text-xs text-muted-foreground">{hint as string}</span>}
                </li>
              ))}
            </ul>
            <ButtonLink href="/api/export/students/template" variant="outline" className="w-full" prefetch={false}>
              <Download /> Download template
            </ButtonLink>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
