import type { Metadata } from "next";
import { Building2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/actor";
import { formatDate } from "@/lib/utils";
import { listSchools } from "@/server/services/settings.service";
import { SchoolForm } from "../admins/forms";

export const metadata: Metadata = { title: "Schools" };

export default async function SchoolsPage() {
  const actor = await requirePermission("schools.manage");
  const schools = await listSchools(actor);
  return (
    <>
      <PageHeader title="Schools" description="Use the school switcher in the top bar to work inside a school." actions={<ModalButton icon={<Plus />} label="New school" title="Create school" dialogSize="lg"><SchoolForm /></ModalButton>} />
      <Card>
        {schools.length === 0 ? (
          <EmptyState icon={<Building2 />} title="No schools yet" />
        ) : (
          <Table>
            <THead><TR><TH>School</TH><TH>Code</TH><TH>Students</TH><TH>Teachers</TH><TH>Users</TH><TH>Created</TH><TH className="text-right">Edit</TH></TR></THead>
            <TBody>
              {schools.map((s) => (
                <TR key={s.id}>
                  <TD><p className="font-medium">{s.name} {s.id === actor.schoolId && <Badge tone="primary" className="ml-1">Active</Badge>}</p><p className="text-xs text-muted-foreground">{s.address}</p></TD>
                  <TD label="Code"><code className="rounded bg-muted px-1.5 text-xs">{s.code}</code></TD>
                  <TD label="Students" className="tabular-nums">{s._count.students}</TD>
                  <TD label="Teachers" className="tabular-nums">{s._count.teachers}</TD>
                  <TD label="Users" className="tabular-nums">{s._count.users}</TD>
                  <TD label="Created">{formatDate(s.createdAt)}</TD>
                  <TD className="text-right"><ModalButton variant="ghost" size="icon-sm" icon={<Pencil />} ariaLabel={`Edit ${s.name}`} title={`Edit ${s.name}`} dialogSize="lg"><SchoolForm id={s.id} defaults={s} /></ModalButton></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
