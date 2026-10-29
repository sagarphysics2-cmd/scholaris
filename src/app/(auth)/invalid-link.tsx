import { LinkIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export function InvalidLink({ kind }: { kind: "invite" | "reset" }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-danger-soft text-danger">
        <LinkIcon className="size-5" />
      </div>
      <h1 className="text-xl font-semibold">This link is no longer valid</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {kind === "invite"
          ? "Invitation links expire after 72 hours or once used. Ask your school administrator to resend your invitation."
          : "Password reset links expire after 60 minutes or once used. Please request a new one."}
      </p>
      <ButtonLink href={kind === "invite" ? "/login" : "/forgot-password"} className="mt-6" variant="outline">
        {kind === "invite" ? "Go to sign in" : "Request a new link"}
      </ButtonLink>
    </div>
  );
}
