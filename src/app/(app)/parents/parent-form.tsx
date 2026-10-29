"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { CheckboxField, FormGrid, FormSection, SelectField, SubmitButton, TextAreaField, TextField, type Option } from "@/components/forms/fields";
import { ButtonLink } from "@/components/ui/button";
import { RELATIONSHIPS, linkChildSchema, parentSchema } from "@/lib/validation/people";
import { titleCase } from "@/lib/utils";

export type ParentDefaults = Partial<Record<"firstName" | "lastName" | "email" | "phone" | "address" | "occupation", string>>;

export function ParentForm({ action, students, defaults = {}, mode, cancelHref }: { action: FormAction; students?: Option[]; defaults?: ParentDefaults; mode: "create" | "edit"; cancelHref: string }) {
  return (
    <ActionForm action={action} schema={parentSchema}>
      <FormSection title="Parent / guardian">
        <FormGrid>
          <TextField name="firstName" label="First name" required defaultValue={defaults.firstName} />
          <TextField name="lastName" label="Last name" required defaultValue={defaults.lastName} />
          <TextField name="email" type="email" label="Email" required defaultValue={defaults.email} autoComplete="off" hint="Used to sign in to the parent portal." />
          <TextField name="phone" type="tel" label="Phone" defaultValue={defaults.phone} />
          <TextField name="occupation" label="Occupation" defaultValue={defaults.occupation} />
          <TextAreaField name="address" label="Address" rows={2} defaultValue={defaults.address} containerClassName="sm:col-span-2" />
        </FormGrid>
      </FormSection>
      {mode === "create" && students && (
        <FormSection title="Children" description="Hold Ctrl / ⌘ to select several. You can link more later.">
          <FormGrid>
            <SelectField name="childIds" label="Linked students" multiple size={8} options={students} containerClassName="sm:col-span-2" />
            <SelectField name="relationship" label="Relationship" defaultValue="GUARDIAN" options={RELATIONSHIPS.map((r) => ({ value: r, label: titleCase(r) }))} />
          </FormGrid>
          <CheckboxField name="sendInvite" defaultChecked label="Send portal invitation" containerClassName="mt-4" />
        </FormSection>
      )}
      <div className="flex justify-end gap-2 border-t pt-4">
        <ButtonLink href={cancelHref} variant="outline">Cancel</ButtonLink>
        <SubmitButton>{mode === "create" ? "Add parent" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function LinkChildForm({ action, parentId, students, onDone }: { action: FormAction; parentId: string; students: Option[]; onDone?: () => void }) {
  return (
    <ActionForm action={action} schema={linkChildSchema} onSuccess={onDone} className="space-y-4">
      <input type="hidden" name="parentId" value={parentId} />
      <SelectField name="studentId" label="Student" required placeholder="Select a student…" options={students} />
      <SelectField name="relationship" label="Relationship" defaultValue="GUARDIAN" options={RELATIONSHIPS.map((r) => ({ value: r, label: titleCase(r) }))} />
      <CheckboxField name="isPrimary" label="Primary contact" />
      <div className="flex justify-end"><SubmitButton>Link child</SubmitButton></div>
    </ActionForm>
  );
}
