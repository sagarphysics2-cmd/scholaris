"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { FormGrid, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { subjectSchema } from "@/lib/validation/academics";

export function SubjectForm({ action, defaults }: { action: FormAction; defaults?: { name: string; code: string; description: string | null } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={subjectSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <TextField name="name" label="Subject name" required defaultValue={defaults?.name} />
        <TextField name="code" label="Code" required defaultValue={defaults?.code} placeholder="e.g. MATH" className="uppercase" />
      </FormGrid>
      <TextAreaField name="description" label="Description" rows={3} defaultValue={defaults?.description ?? ""} />
      <div className="flex justify-end"><SubmitButton>{defaults ? "Save" : "Create subject"}</SubmitButton></div>
    </ActionForm>
  );
}
