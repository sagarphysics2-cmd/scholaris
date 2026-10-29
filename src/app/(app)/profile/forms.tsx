"use client";

import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton, TextField } from "@/components/forms/fields";
import { changePasswordSchema } from "@/lib/validation/auth";
import { IMAGE_ACCEPT } from "@/lib/validation/files";
import { changePasswordAction, updateContactAction, uploadAvatarAction } from "./actions";

export function ContactForm({ phone }: { phone: string | null }) {
  return (
    <ActionForm action={updateContactAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextField name="phone" type="tel" label="Phone" defaultValue={phone ?? ""} containerClassName="flex-1" />
      <SubmitButton variant="outline">Save</SubmitButton>
    </ActionForm>
  );
}

export function AvatarForm() {
  return (
    <ActionForm action={uploadAvatarAction} encType="multipart/form-data" resetOnSuccess className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <TextField name="avatar" type="file" accept={IMAGE_ACCEPT} label="New photo" containerClassName="flex-1" />
      <SubmitButton variant="outline">Upload</SubmitButton>
    </ActionForm>
  );
}

export function PasswordForm() {
  return (
    <ActionForm action={changePasswordAction} schema={changePasswordSchema} resetOnSuccess className="space-y-4">
      <TextField name="currentPassword" type="password" label="Current password" autoComplete="current-password" required />
      <TextField name="password" type="password" label="New password" autoComplete="new-password" required hint="At least 10 characters with upper & lower case letters and a number." />
      <TextField name="confirmPassword" type="password" label="Confirm new password" autoComplete="new-password" required />
      <div className="flex justify-end"><SubmitButton>Change password</SubmitButton></div>
    </ActionForm>
  );
}
