"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { SubmitButton, TextField } from "@/components/forms/fields";
import { resetPasswordSchema } from "@/lib/validation/auth";

export function SetPasswordForm({ token, action, submitLabel }: { token: string; action: FormAction; submitLabel: string }) {
  return (
    <ActionForm action={action} schema={resetPasswordSchema} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <TextField
        name="password"
        type="password"
        label="New password"
        autoComplete="new-password"
        hint="At least 10 characters, with upper & lower case letters and a number."
        required
        autoFocus
      />
      <TextField name="confirmPassword" type="password" label="Confirm password" autoComplete="new-password" required />
      <SubmitButton className="w-full">{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
