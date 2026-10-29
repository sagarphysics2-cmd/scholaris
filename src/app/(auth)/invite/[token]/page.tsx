import type { Metadata } from "next";
import { findValidToken } from "@/server/services/auth.service";
import { acceptInviteAction } from "../../actions";
import { InvalidLink } from "../../invalid-link";
import { SetPasswordForm } from "../../set-password-form";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await findValidToken(token, "INVITE");
  if (!record) return <InvalidLink kind="invite" />;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {record.user.firstName}!</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">Create a password to activate your account ({record.user.email}).</p>
      <div className="mt-8">
        <SetPasswordForm token={token} action={acceptInviteAction} submitLabel="Activate account" />
      </div>
    </div>
  );
}
