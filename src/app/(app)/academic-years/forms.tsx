"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { FormGrid, SelectField, SubmitButton, TextField, type Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { academicYearSchema } from "@/lib/validation/academics";

export function AcademicYearForm({ action, defaults }: { action: FormAction; defaults?: { name: string; startDate: string; endDate: string } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={academicYearSchema} onSuccess={close} className="space-y-4">
      <TextField name="name" label="Name" required defaultValue={defaults?.name} placeholder="2027–2028" />
      <FormGrid>
        <TextField name="startDate" type="date" label="Start date" required defaultValue={defaults?.startDate} />
        <TextField name="endDate" type="date" label="End date" required defaultValue={defaults?.endDate} />
      </FormGrid>
      <div className="flex justify-end"><SubmitButton>{defaults ? "Save" : "Create year"}</SubmitButton></div>
    </ActionForm>
  );
}

export function CopyStructureForm({ action, years }: { action: FormAction; years: Option[] }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} onSuccess={close} className="space-y-4">
      <SelectField name="fromYearId" label="Copy from" required options={years} placeholder="Select…" />
      <SelectField name="toYearId" label="Copy to (must have no sections yet)" required options={years} placeholder="Select…" />
      <div className="flex justify-end"><SubmitButton>Copy structure</SubmitButton></div>
    </ActionForm>
  );
}
