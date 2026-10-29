import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requirePermission } from "@/lib/auth/actor";
import { getParent } from "@/server/services/parents.service";
import { updateParentAction } from "../../actions";
import { ParentForm } from "../../parent-form";
import { load } from "@/server/page";

export const metadata: Metadata = { title: "Edit parent" };

export default async function EditParentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requirePermission("parents.write");
  const p = await load(getParent(actor, id));
  const name = `${p.user.firstName} ${p.user.lastName}`;
  return (
    <>
      <PageHeader title={`Edit ${name}`} breadcrumbs={[{ label: "Parents", href: "/parents" }, { label: name, href: `/parents/${id}` }, { label: "Edit" }]} />
      <Card>
        <CardContent>
          <ParentForm mode="edit" action={updateParentAction.bind(null, id)} cancelHref={`/parents/${id}`} defaults={{ firstName: p.user.firstName, lastName: p.user.lastName, email: p.user.email ?? "", phone: p.user.phone ?? "", address: p.address ?? "", occupation: p.occupation ?? "" }} />
        </CardContent>
      </Card>
    </>
  );
}
