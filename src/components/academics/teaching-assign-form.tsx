"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { SelectField, SubmitButton, type Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { teachingAssignmentSchema } from "@/lib/validation/people";

/** Assign a teacher to a subject in a section. Any of the three can be fixed via hidden defaults. */
export function TeachingAssignForm({
  action,
  teachers,
  sections,
  subjects,
  fixed = {},
}: {
  action: FormAction;
  teachers?: Option[];
  sections?: Option[];
  subjects: Option[];
  fixed?: { teacherId?: string; sectionId?: string };
}) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={teachingAssignmentSchema} onSuccess={close} className="space-y-4">
      {fixed.teacherId ? <input type="hidden" name="teacherId" value={fixed.teacherId} /> : <SelectField name="teacherId" label="Teacher" required placeholder="Select a teacher…" options={teachers ?? []} />}
      {fixed.sectionId ? <input type="hidden" name="sectionId" value={fixed.sectionId} /> : <SelectField name="sectionId" label="Class & section" required placeholder="Select a section…" options={sections ?? []} />}
      <SelectField name="subjectId" label="Subject" required placeholder="Select a subject…" options={subjects} hint="If another teacher already teaches this subject in the section, they will be replaced." />
      <div className="flex justify-end">
        <SubmitButton>Save assignment</SubmitButton>
      </div>
    </ActionForm>
  );
}
