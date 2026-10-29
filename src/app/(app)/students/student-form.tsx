"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { CheckboxField, FormGrid, FormSection, SelectField, SubmitButton, TextAreaField, TextField, type Option } from "@/components/forms/fields";
import { ButtonLink } from "@/components/ui/button";
import { IMAGE_ACCEPT } from "@/lib/validation/files";
import { RELATIONSHIPS, studentSchema } from "@/lib/validation/people";
import { titleCase } from "@/lib/utils";

export type StudentDefaults = Partial<{
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  email: string;
  phone: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  admissionNumber: string;
  studentCode: string;
  admissionDate: string;
  sectionId: string;
  rollNumber: number;
  status: string;
  bloodGroup: string;
  notes: string;
}>;

export function StudentForm({
  action,
  sections,
  parents,
  defaults = {},
  mode,
  cancelHref,
}: {
  action: FormAction;
  sections: Option[];
  parents?: Option[];
  defaults?: StudentDefaults;
  mode: "create" | "edit";
  cancelHref: string;
}) {
  return (
    <ActionForm action={action} schema={studentSchema} encType="multipart/form-data">
      <FormSection title="Personal details" description="Basic information about the student.">
        <FormGrid>
          <TextField name="firstName" label="First name" required defaultValue={defaults.firstName} autoComplete="off" />
          <TextField name="lastName" label="Last name" required defaultValue={defaults.lastName} autoComplete="off" />
          <TextField name="dateOfBirth" type="date" label="Date of birth" required defaultValue={defaults.dateOfBirth} />
          <SelectField
            name="gender"
            label="Gender"
            required
            placeholder="Select…"
            defaultValue={defaults.gender ?? ""}
            options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]}
          />
          <SelectField
            name="bloodGroup"
            label="Blood group"
            placeholder="Unknown"
            defaultValue={defaults.bloodGroup ?? ""}
            options={["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ value: b, label: b }))}
          />
          <TextField name="photo" type="file" accept={IMAGE_ACCEPT} label="Profile photo" hint="JPG, PNG, WebP or GIF." />
        </FormGrid>
      </FormSection>

      <FormSection title="Admission" description="Identifiers and class placement for the current academic year.">
        <FormGrid>
          <TextField name="admissionNumber" label="Admission number" required defaultValue={defaults.admissionNumber} placeholder="e.g. GIS/2026/0512" />
          <TextField name="studentCode" label="Student ID" defaultValue={defaults.studentCode} hint={mode === "create" ? "Leave blank to generate automatically." : undefined} />
          <TextField name="admissionDate" type="date" label="Admission date" required defaultValue={defaults.admissionDate ?? new Date().toISOString().slice(0, 10)} />
          <SelectField name="sectionId" label="Class & section" required placeholder="Select a section…" options={sections} defaultValue={defaults.sectionId ?? ""} />
          <TextField name="rollNumber" type="number" min={1} label="Roll number" defaultValue={defaults.rollNumber} hint="Leave blank to assign the next available number." />
          <SelectField
            name="status"
            label="Status"
            defaultValue={defaults.status ?? "ACTIVE"}
            options={["ACTIVE", "SUSPENDED", "GRADUATED", "TRANSFERRED", "ARCHIVED"].map((s) => ({ value: s, label: titleCase(s) }))}
          />
        </FormGrid>
      </FormSection>

      <FormSection title="Contact" description="Optional. An email lets the student sign in to the portal.">
        <FormGrid>
          <TextField name="email" type="email" label="Email" defaultValue={defaults.email} autoComplete="off" />
          <TextField name="phone" type="tel" label="Phone" defaultValue={defaults.phone} />
          <TextAreaField name="address" label="Address" rows={2} defaultValue={defaults.address} containerClassName="sm:col-span-2" />
          <TextField name="emergencyContactName" label="Emergency contact name" defaultValue={defaults.emergencyContactName} />
          <TextField name="emergencyContactPhone" type="tel" label="Emergency contact phone" defaultValue={defaults.emergencyContactPhone} />
          {mode === "create" && (
            <CheckboxField name="sendInvite" label="Send portal invitation" hint="Emails a link to set a password (requires an email)." containerClassName="sm:col-span-2" />
          )}
        </FormGrid>
      </FormSection>

      {mode === "create" && parents && (
        <FormSection title="Parent / guardian" description="Link an existing parent now, or later from the parent's page.">
          <FormGrid>
            <SelectField name="parentId" label="Parent" placeholder="No parent yet" options={parents} />
            <SelectField name="relationship" label="Relationship" defaultValue="GUARDIAN" options={RELATIONSHIPS.map((r) => ({ value: r, label: titleCase(r) }))} />
          </FormGrid>
        </FormSection>
      )}

      <FormSection title="Notes" description="Medical, learning or other notes visible to staff.">
        <TextAreaField name="notes" label="Notes" rows={3} defaultValue={defaults.notes} />
      </FormSection>

      <div className="sticky bottom-16 z-10 -mx-5 flex justify-end gap-2 border-t bg-card/95 px-5 py-3 backdrop-blur lg:bottom-0">
        <ButtonLink href={cancelHref} variant="outline">Cancel</ButtonLink>
        <SubmitButton>{mode === "create" ? "Create student" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
