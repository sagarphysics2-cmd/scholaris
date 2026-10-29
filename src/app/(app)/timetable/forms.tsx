"use client";

import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextField, type Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { periodSchema, timetableEntrySchema } from "@/lib/validation/academics";
import { saveEntryAction, savePeriodAction } from "./actions";

export function EntryForm({
  sectionId,
  dayOfWeek,
  periodId,
  subjects,
  teachers,
  subjectTeacher,
  defaults,
}: {
  sectionId: string;
  dayOfWeek: number;
  periodId: string;
  subjects: Option[];
  teachers: Option[];
  /** subjectId → teacherId assigned to teach it in this section (auto-fills the teacher). */
  subjectTeacher: Record<string, string>;
  defaults?: { subjectId: string; teacherId: string; room: string | null };
}) {
  const close = useCloseDialog();
  const [teacherId, setTeacherId] = useState(defaults?.teacherId ?? "");
  return (
    <ActionForm action={saveEntryAction} schema={timetableEntrySchema} onSuccess={close} className="space-y-4">
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="dayOfWeek" value={dayOfWeek} />
      <input type="hidden" name="periodId" value={periodId} />
      <SelectField
        name="subjectId"
        label="Subject"
        required
        placeholder="Select…"
        options={subjects}
        defaultValue={defaults?.subjectId ?? ""}
        onChange={(e) => subjectTeacher[e.target.value] && setTeacherId(subjectTeacher[e.target.value]!)}
      />
      <SelectField name="teacherId" label="Teacher" required placeholder="Select…" options={teachers} value={teacherId} onChange={(e) => setTeacherId(e.target.value)} hint="Pre-filled from the section's teaching assignments." />
      <TextField name="room" label="Room" defaultValue={defaults?.room ?? ""} placeholder="e.g. Science Lab" />
      <div className="flex justify-end"><SubmitButton>Save lesson</SubmitButton></div>
    </ActionForm>
  );
}

export function PeriodForm({ id, defaults }: { id?: string; defaults?: { name: string; startTime: string; endTime: string; sortOrder: number; isBreak: boolean } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={savePeriodAction.bind(null, id)} schema={periodSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <TextField name="name" label="Name" required defaultValue={defaults?.name} placeholder="Period 7" />
        <TextField name="sortOrder" type="number" min={1} label="Order" required defaultValue={defaults?.sortOrder} />
        <TextField name="startTime" type="time" label="Starts" required defaultValue={defaults?.startTime} />
        <TextField name="endTime" type="time" label="Ends" required defaultValue={defaults?.endTime} />
      </FormGrid>
      <CheckboxField name="isBreak" label="Break / lunch (no lessons)" defaultChecked={defaults?.isBreak} />
      <div className="flex justify-end"><SubmitButton>{id ? "Save period" : "Add period"}</SubmitButton></div>
    </ActionForm>
  );
}
