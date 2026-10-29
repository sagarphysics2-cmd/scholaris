import type { Metadata } from "next";
import { Ban, CheckCircle2, Plus, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ModalButton } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requirePermission } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { formatDateTime, fullName } from "@/lib/utils";
import { listAdmins } from "@/server/services/settings.service";
import { setUserDisabledAction } from "./actions";
import { AdminForm } from "./forms";

export const metadata: Metadata = { title: "Administrators" };

export default async function AdminsPage() {
  const actor = await requirePermission("admins.manage");
  const [admins, schools] = await Promise.all([listAdmins(actor), db.school.findMany({ orderBy: { name: "asc" } })]);
  return (
    <>
      <PageHeader
        title="Administrators"
        description="Super Admins manage every school; School Admins run a single school."
        actions={<ModalButton icon={<Plus />} label="Invite administrator" title="Invite administrator"><AdminForm schools={schools.map((s) => ({ value: s.id, label: s.name }))} allowSuper={actor.role === "SUPER_ADMIN"} defaultSchoolId={actor.schoolId} /></ModalButton>}
      />
      <Card>
        {admins.length === 0 ? (
          <EmptyState icon={<ShieldCheck />} title="No administrators" />
        ) : (
          <Table>
            <THead><TR><TH>Administrator</TH><TH>Role</TH><TH>School</TH><TH>Last sign-in</TH><TH>Status</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {admins.map((u) => (
                <TR key={u.id}>
                  <TD><span className="flex items-center gap-3"><Avatar name={fullName(u)} fileId={u.avatarFileId} size="sm" /><span><span className="block font-medium">{fullName(u)}{u.id === actor.userId && " (you)"}</span><span className="block text-xs text-muted-foreground">{u.email}</span></span></span></TD>
                  <TD label="Role"><Badge tone={u.role.key === "SUPER_ADMIN" ? "primary" : "neutral"}>{u.role.name}</Badge></TD>
                  <TD label="School">{u.school?.name ?? "All schools"}</TD>
                  <TD label="Last sign-in">{formatDateTime(u.lastLoginAt)}</TD>
                  <TD label="Status"><StatusBadge status={u.status} /></TD>
                  <TD className="text-right">
                    {u.id !== actor.userId &&
                      (u.status === "DISABLED" ? (
                        <ConfirmAction action={setUserDisabledAction.bind(null, u.id, false)} size="sm" variant="ghost" icon={<CheckCircle2 />} label="Enable" title={`Enable ${fullName(u)}?`} description="They will be able to sign in again." confirmLabel="Enable" confirmVariant="primary" />
                      ) : (
                        <ConfirmAction action={setUserDisabledAction.bind(null, u.id, true)} size="sm" variant="danger-ghost" icon={<Ban />} label="Disable" title={`Disable ${fullName(u)}?`} description="They will be signed out of all devices and unable to sign in." confirmLabel="Disable account" />
                      ))}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </>
  );
}
