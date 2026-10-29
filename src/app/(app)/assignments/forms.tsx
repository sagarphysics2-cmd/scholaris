"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { FormGrid, SelectField, SubmitButton, TextAreaField, TextField, type Option } from "@/components/forms/fields";
import { ButtonLink } from "@/components/ui/button";
import { useCloseDialog } from "@/components/ui/dialog";
import { assignmentSchema, gradeSubmissionSchema, submissionSchema } from "@/lib/validation/academics";
import { DOCUMENT_ACCEPT } from "@/lib/validation/files";

export function AssignmentForm({
  action,
  sections,
  subjectsBySection,
  defaults,
  cancelHref,
}: {
  action: FormAction;
  sections: Option[];
  subjectsBySection: Record<string, Option[]>;
  defaults?: { title: string; description: string; sectionId: string; subjectId: string; dueDate: string; maxMarks: number; status: string };
  cancelHref: string;
}) {
  const [sectionId, setSectionId] = useState(defaults?.sectionId ?? "");
  const subjects = subjectsBySection[sectionId] ?? [];
  return (
    <ActionForm action={action} schema={assignmentSchema} encType="multipart/form-data" className="space-y-5">
      <TextField name="title" label="Title" required defaultValue={defaults?.title} maxLength={150} />
      <TextAreaField name="description" label="Instructions" required rows={6} defaultValue={defaults?.description} />
      <FormGrid>
        <SelectField name="sectionId" label="Class & section" required placeholder="Select…" options={sections} value={sectionId} onChange={(e) => setSectionId(e.target.value)} />
        <SelectField key={sectionId} name="subjectId" label="Subject" required placeholder={sectionId ? "Select…" : "Choose a section first"} options={subjects} defaultValue={defaults?.sectionId === sectionId ? defaults?.subjectId : ""} disabled={!sectionId} />
        <TextField name="dueDate" type="datetime-local" label="Due date" required defaultValue={defaults?.dueDate} />
        <TextField name="maxMarks" type="number" min={1} max={1000} label="Maximum marks" required defaultValue={defaults?.maxMarks ?? 20} />
        <SelectField name="status" label="Status" defaultValue={defaults?.status ?? "PUBLISHED"} options={[{ value: "PUBLISHED", label: "Published — visible to students" }, { value: "DRAFT", label: "Draft — only staff can see it" }, { value: "CLOSED", label: "Closed — no new submissions" }]} />
        <TextField name="attachments" type="file" multiple accept={DOCUMENT_ACCEPT} label="Attachments" hint="Up to 5 files (PDF, Office, images, text)." />
      </FormGrid>
      <div className="flex justify-end gap-2 border-t pt-4">
        <ButtonLink href={cancelHref} variant="outline">Cancel</ButtonLink>
        <SubmitButton>{defaults ? "Save changes" : "Create assignment"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SubmissionForm({ action, defaultContent, resubmit }: { action: FormAction; defaultContent?: string | null; resubmit: boolean }) {
  return (
    <ActionForm action={action} schema={submissionSchema} encType="multipart/form-data" className="space-y-4">
      <TextAreaField name="content" label="Your answer" rows={6} defaultValue={defaultContent ?? ""} placeholder="Type your answer or notes for your teacher…" />
      <TextField name="files" type="file" multiple accept={DOCUMENT_ACCEPT} label="Upload files" hint={resubmit ? "Uploading new files replaces your previous files." : "Up to 5 files."} />
      <div className="flex justify-end"><SubmitButton>{resubmit ? "Resubmit" : "Submit assignment"}</SubmitButton></div>
    </ActionForm>
  );
}

export function GradeForm({ action, maxMarks, defaults }: { action: FormAction; maxMarks: number; defaults?: { marks: number | null; feedback: string | null } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={gradeSubmissionSchema} onSuccess={close} className="space-y-4">
      <TextField name="marks" type="number" step="0.5" min={0} max={maxMarks} label={`Marks (out of ${maxMarks})`} required defaultValue={defaults?.marks ?? ""} autoFocus />
      <TextAreaField name="feedback" label="Feedback" rows={4} defaultValue={defaults?.feedback ?? ""} />
      <div className="flex justify-end"><SubmitButton>Save grade</SubmitButton></div>
    </ActionForm>
  );
}
