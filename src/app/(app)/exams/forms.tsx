"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { FormGrid, SelectField, SubmitButton, TextAreaField, TextField, type Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { examSchema, examSubjectSchema } from "@/lib/validation/academics";

export function ExamForm({ action, defaults }: { action: FormAction; defaults?: { name: string; term: string | null; description: string | null; startDate: string; endDate: string; status: string } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={examSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <TextField name="name" label="Name" required defaultValue={defaults?.name} placeholder="Final Examination" />
        <TextField name="term" label="Term" defaultValue={defaults?.term ?? ""} placeholder="Term 2" />
        <TextField name="startDate" type="date" label="Start date" required defaultValue={defaults?.startDate} />
        <TextField name="endDate" type="date" label="End date" required defaultValue={defaults?.endDate} />
        {defaults?.status !== "PUBLISHED" && (
          <SelectField name="status" label="Status" defaultValue={defaults?.status ?? "SCHEDULED"} options={[{ value: "DRAFT", label: "Draft (hidden)" }, { value: "SCHEDULED", label: "Scheduled" }, { value: "ONGOING", label: "Ongoing" }, { value: "COMPLETED", label: "Completed" }]} />
        )}
      </FormGrid>
      <TextAreaField name="description" label="Description" rows={3} defaultValue={defaults?.description ?? ""} />
      <div className="flex justify-end"><SubmitButton>{defaults ? "Save" : "Create examination"}</SubmitButton></div>
    </ActionForm>
  );
}

export function PaperForm({
  action,
  classes,
  subjectsByClass,
  defaults,
  minDate,
  maxDate,
}: {
  action: FormAction;
  classes: Option[];
  subjectsByClass: Record<string, Option[]>;
  defaults?: { classId: string; subjectId: string; examDate: string; startTime: string | null; endTime: string | null; maxMarks: number; passingMarks: number; room: string | null };
  minDate: string;
  maxDate: string;
}) {
  const close = useCloseDialog();
  const allSubjects = [...new Map(Object.values(subjectsByClass).flat().map((s) => [s.value, s])).values()];
  return (
    <ActionForm action={action} schema={examSubjectSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <SelectField name="classId" label="Class" required placeholder="Select…" options={classes} defaultValue={defaults?.classId ?? ""} />
        <SelectField name="subjectId" label="Subject" required placeholder="Select…" options={allSubjects} defaultValue={defaults?.subjectId ?? ""} hint="Must be part of the class curriculum." />
        <TextField name="examDate" type="date" label="Date" required min={minDate} max={maxDate} defaultValue={defaults?.examDate ?? minDate} />
        <TextField name="room" label="Room" defaultValue={defaults?.room ?? "Exam Hall"} />
        <TextField name="startTime" type="time" label="Start" defaultValue={defaults?.startTime ?? "09:00"} />
        <TextField name="endTime" type="time" label="End" defaultValue={defaults?.endTime ?? "11:00"} />
        <TextField name="maxMarks" type="number" min={1} label="Maximum marks" required defaultValue={defaults?.maxMarks ?? 100} />
        <TextField name="passingMarks" type="number" min={0} label="Passing marks" required defaultValue={defaults?.passingMarks ?? 35} />
      </FormGrid>
      <div className="flex justify-end"><SubmitButton>{defaults ? "Save paper" : "Add paper"}</SubmitButton></div>
    </ActionForm>
  );
}
