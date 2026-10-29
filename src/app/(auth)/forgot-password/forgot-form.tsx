"use client";

import { MailCheck } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton, TextField } from "@/components/forms/fields";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { forgotPasswordAction } from "../actions";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  if (sent) {
    return (
      <div className="rounded-xl border bg-success-soft p-5 text-sm" role="status">
        <MailCheck className="mb-2 size-6 text-success" />
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-muted-foreground">If an account exists for that email, a reset link valid for 60 minutes has been sent.</p>
      </div>
    );
  }
  return (
    <ActionForm action={forgotPasswordAction} schema={forgotPasswordSchema} onSuccess={() => setSent(true)} silent className="space-y-4">
      <TextField name="email" type="email" label="Email" autoComplete="email" required autoFocus />
      <SubmitButton className="w-full">Send reset link</SubmitButton>
    </ActionForm>
  );
}
