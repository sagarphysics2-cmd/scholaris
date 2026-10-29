import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-warning-soft text-warning">
        <ShieldAlert className="size-6" />
      </div>
      <p className="text-sm font-semibold text-muted-foreground">403</p>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your role doesn&apos;t include permission for this area. If you think this is a mistake, contact your school administrator.
      </p>
      <ButtonLink href="/dashboard" className="mt-6">
        Back to dashboard
      </ButtonLink>
    </div>
  );
}
