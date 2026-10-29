"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { CheckboxField, FormGrid, SelectField, SubmitButton, TextAreaField, TextField, type Option } from "@/components/forms/fields";
import { ButtonLink } from "@/components/ui/button";
import { DOCUMENT_ACCEPT } from "@/lib/validation/files";
import { AUDIENCE_LABELS, NOTICE_AUDIENCES, noticeSchema } from "@/lib/validation/notices";

export function NoticeForm({
  action,
  manage,
  classes,
  sections,
  defaults,
  cancelHref,
}: {
  action: FormAction;
  manage: boolean;
  classes: Option[];
  sections: Option[];
  defaults?: { title: string; message: string; audience: string; classId: string | null; sectionId: string | null; publishDate: string; expiryDate: string; isPinned: boolean };
  cancelHref: string;
}) {
  const audiences = manage ? NOTICE_AUDIENCES : (["SECTION", "CLASS"] as const);
  const [audience, setAudience] = useState(defaults?.audience ?? (manage ? "SCHOOL" : "SECTION"));
  // Lazy initial state: computed once on mount, keeps render pure.
  const [now] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  return (
    <ActionForm action={action} schema={noticeSchema} encType="multipart/form-data" className="space-y-5">
      <TextField name="title" label="Title" required maxLength={150} defaultValue={defaults?.title} />
      <TextAreaField name="message" label="Message" required rows={8} defaultValue={defaults?.message} />
      <FormGrid>
        <SelectField name="audience" label="Audience" required value={audience} onChange={(e) => setAudience(e.target.value)} options={audiences.map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))} hint={manage ? undefined : "Teachers can post to classes and sections they teach."} />
        {audience === "CLASS" && <SelectField name="classId" label="Class" required placeholder="Select…" options={classes} defaultValue={defaults?.classId ?? ""} />}
        {audience === "SECTION" && <SelectField name="sectionId" label="Section" required placeholder="Select…" options={sections} defaultValue={defaults?.sectionId ?? ""} />}
        <TextField name="publishDate" type="datetime-local" label="Publish" required defaultValue={defaults?.publishDate ?? now} hint="Set a future time to schedule." />
        <TextField name="expiryDate" type="datetime-local" label="Expires" defaultValue={defaults?.expiryDate ?? ""} hint="Optional — hidden after this time." />
        <TextField name="attachments" type="file" multiple accept={DOCUMENT_ACCEPT} label="Attachments" hint="Up to 5 files." />
      </FormGrid>
      {manage && <CheckboxField name="isPinned" label="Pin to the top" defaultChecked={defaults?.isPinned} />}
      <div className="flex justify-end gap-2 border-t pt-4">
        <ButtonLink href={cancelHref} variant="outline">Cancel</ButtonLink>
        <SubmitButton>{defaults ? "Save changes" : "Publish notice"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
