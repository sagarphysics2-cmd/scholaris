"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { FormGrid, SelectField, SubmitButton, TextField, type Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { classSchema, curriculumSchema, sectionSchema } from "@/lib/validation/academics";

export function ClassForm({ action, defaults }: { action: FormAction; defaults?: { name: string; level: number } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={classSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <TextField name="name" label="Class name" required defaultValue={defaults?.name} placeholder="e.g. Grade 11" />
        <TextField name="level" type="number" min={0} max={20} label="Level" required defaultValue={defaults?.level} hint="Used for ordering." />
      </FormGrid>
      <div className="flex justify-end"><SubmitButton>{defaults ? "Save" : "Create class"}</SubmitButton></div>
    </ActionForm>
  );
}

export function SectionForm({
  action,
  classes,
  teachers,
  defaults,
}: {
  action: FormAction;
  classes: Option[];
  teachers: Option[];
  defaults?: { classId?: string; name?: string; room?: string | null; capacity?: number | null; classTeacherId?: string | null };
}) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={sectionSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <SelectField name="classId" label="Class" required options={classes} defaultValue={defaults?.classId ?? ""} placeholder="Select…" />
        <TextField name="name" label="Section" required defaultValue={defaults?.name} placeholder="e.g. C" />
        <TextField name="room" label="Home room" defaultValue={defaults?.room ?? ""} />
        <TextField name="capacity" type="number" min={1} label="Capacity" defaultValue={defaults?.capacity ?? ""} />
        <SelectField name="classTeacherId" label="Class teacher" options={teachers} defaultValue={defaults?.classTeacherId ?? ""} placeholder="Not assigned" containerClassName="sm:col-span-2" />
      </FormGrid>
      <div className="flex justify-end"><SubmitButton>{defaults?.name ? "Save section" : "Create section"}</SubmitButton></div>
    </ActionForm>
  );
}

export function CurriculumForm({ action, classId, subjects, selected }: { action: FormAction; classId: string; subjects: Option[]; selected: string[] }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={curriculumSchema} onSuccess={close} className="space-y-4">
      <input type="hidden" name="classId" value={classId} />
      <fieldset>
        <legend className="mb-2 text-sm text-muted-foreground">Removing a subject also removes its teaching assignments and timetable slots for this class.</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {subjects.map((s) => (
            <label key={s.value} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="checkbox" name="subjectIds" value={s.value} defaultChecked={selected.includes(s.value)} className="size-4 accent-[var(--primary)]" />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end"><SubmitButton>Save subjects</SubmitButton></div>
    </ActionForm>
  );
}
