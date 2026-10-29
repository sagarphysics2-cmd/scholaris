import type { Metadata } from "next";
import { ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput } from "@/components/ui/url-controls";
import { requirePermission } from "@/lib/auth/actor";
import { formatDateTime, fullName } from "@/lib/utils";
import { listAuditLogs } from "@/server/services/settings.service";

export const metadata: Metadata = { title: "Audit Log" };

const tone = (action: string) => (action.includes("delete") || action.includes("disable") || action.includes("failed") ? "danger" : action.includes("create") || action.includes("login") ? "success" : action.includes("update") || action.includes("marks") || action.includes("permission") ? "warning" : "neutral");

function Meta({ data }: { data: unknown }) {
  if (!data || typeof data !== "object") return <span className="text-muted-foreground">—</span>;
  const text = JSON.stringify(data);
  return (
    <details className="max-w-md">
      <summary className="cursor-pointer truncate text-xs text-muted-foreground">{text.slice(0, 80)}{text.length > 80 ? "…" : ""}</summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-relaxed">{JSON.stringify(data, null, 2)}</pre>
    </details>
  );
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("audit.view");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params, 30);
  const { total, rows, entities } = await listAuditLogs(actor, { q: sp(params, "q"), entity: sp(params, "entity"), action: sp(params, "action"), skip, take });
  return (
    <>
      <PageHeader title="Audit Log" description="An append-only record of sign-ins and every change to sensitive records." />
      <Card>
        <Toolbar>
          <SearchInput placeholder="Search user, action or record id…" />
          <FilterSelect param="entity" label="Entity" placeholder="All entities" options={entities.map((e) => ({ value: e, label: e }))} />
          <FilterSelect param="action" label="Action" placeholder="All actions" options={["auth", "student", "teacher", "parent", "attendance", "marks", "exam", "fee", "notice", "role", "settings", "assignment", "submission"].map((a) => ({ value: a, label: a }))} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={<ScrollText />} title="No audit entries" />
        ) : (
          <>
            <Table>
              <THead><TR><TH>When</TH><TH>User</TH><TH>Action</TH><TH>Record</TH><TH>Details</TH><TH>IP</TH></TR></THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD label="When" className="whitespace-nowrap text-sm">{formatDateTime(r.createdAt)}</TD>
                    <TD label="User" className="text-sm">{r.user ? <><span className="block font-medium">{fullName(r.user)}</span><span className="block text-xs text-muted-foreground">{r.user.email}</span></> : <span className="text-muted-foreground">System</span>}</TD>
                    <TD label="Action"><Badge tone={tone(r.action)}><code>{r.action}</code></Badge></TD>
                    <TD label="Record" className="text-xs"><span className="font-medium">{r.entity}</span>{r.entityId && <span className="block truncate font-mono text-muted-foreground">{r.entityId}</span>}</TD>
                    <TD label="Details"><Meta data={r.metadata} /></TD>
                    <TD label="IP" className="font-mono text-xs text-muted-foreground">{r.ipAddress ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/audit-logs" searchParams={params} />
          </>
        )}
      </Card>
    </>
  );
}
