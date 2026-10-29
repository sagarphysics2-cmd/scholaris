import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UsersRound } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Toolbar } from "@/components/ui/misc";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination, pageParams, sp } from "@/components/ui/pagination";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FilterSelect, SearchInput } from "@/components/ui/url-controls";
import { can, requirePermission } from "@/lib/auth/actor";
import { fullName } from "@/lib/utils";
import { listParents } from "@/server/services/parents.service";

export const metadata: Metadata = { title: "Parents" };

export default async function ParentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requirePermission("parents.read");
  const params = await searchParams;
  const { page, pageSize, skip, take } = pageParams(params);
  const { total, rows } = await listParents(actor, { q: sp(params, "q"), status: sp(params, "status"), skip, take });
  const canWrite = can(actor, "parents.write");
  return (
    <>
      <PageHeader title="Parents & Guardians" description={`${total} ${sp(params, "status") === "ARCHIVED" ? "archived" : "active"} parent account${total === 1 ? "" : "s"}.`} actions={canWrite && <ButtonLink href="/parents/new"><Plus /> Add parent</ButtonLink>} />
      <Card>
        <Toolbar>
          <SearchInput placeholder="Search parent or child name, email, phone…" />
          <FilterSelect param="status" label="Filter by status" placeholder="Active" options={[{ value: "ARCHIVED", label: "Archived" }]} />
        </Toolbar>
        {rows.length === 0 ? (
          <EmptyState icon={<UsersRound />} title="No parents found" action={canWrite && <ButtonLink href="/parents/new"><Plus /> Add parent</ButtonLink>} />
        ) : (
          <>
            <Table>
              <THead>
                <TR><TH>Parent</TH><TH>Phone</TH><TH>Children</TH><TH>Account</TH></TR>
              </THead>
              <TBody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <Link href={`/parents/${p.id}`} className="flex items-center gap-3 font-medium hover:text-primary">
                        <Avatar name={fullName(p.user)} fileId={p.user.avatarFileId} size="sm" />
                        <span className="min-w-0 text-left">
                          <span className="block truncate">{fullName(p.user)}</span>
                          <span className="block truncate text-xs font-normal text-muted-foreground">{p.user.email}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD label="Phone">{p.user.phone ?? "—"}</TD>
                    <TD label="Children">
                      <div className="flex flex-wrap justify-end gap-1 md:justify-start">
                        {p.children.length ? p.children.map((c) => <Badge key={c.studentId}>{fullName(c.student.user)}</Badge>) : "—"}
                      </div>
                    </TD>
                    <TD label="Account"><StatusBadge status={p.status === "ARCHIVED" ? "ARCHIVED" : p.user.status} /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={total} basePath="/parents" searchParams={params} />
          </>
        )}
      </Card>
    </>
  );
}
