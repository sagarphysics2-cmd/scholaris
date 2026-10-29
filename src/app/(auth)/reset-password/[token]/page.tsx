import type { Metadata } from "next";
import { findValidToken } from "@/server/services/auth.service";
import { resetPasswordAction } from "../../actions";
import { InvalidLink } from "../../invalid-link";
import { SetPasswordForm } from "../../set-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await findValidToken(token, "PASSWORD_RESET");
  if (!record) return <InvalidLink kind="reset" />;
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">For {record.user.email}. You&apos;ll be signed out of all devices.</p>
      <div className="mt-8">
        <SetPasswordForm token={token} action={resetPasswordAction} submitLabel="Update password" />
      </div>
    </div>
  );
}
