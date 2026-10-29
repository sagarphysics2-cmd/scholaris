"use client";

import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { CheckboxField, FormGrid, FormSection, SelectField, SubmitButton, TextAreaField, TextField } from "@/components/forms/fields";
import { ButtonLink } from "@/components/ui/button";
import { IMAGE_ACCEPT } from "@/lib/validation/files";
import { teacherSchema } from "@/lib/validation/people";

export type TeacherDefaults = Partial<Record<"firstName" | "lastName" | "email" | "phone" | "employeeId" | "gender" | "dateOfBirth" | "address" | "qualification" | "specialization" | "joiningDate", string>>;

export function TeacherForm({ action, defaults = {}, mode, cancelHref }: { action: FormAction; defaults?: TeacherDefaults; mode: "create" | "edit"; cancelHref: string }) {
  return (
    <ActionForm action={action} schema={teacherSchema} encType="multipart/form-data">
      <FormSection title="Personal details">
        <FormGrid>
          <TextField name="firstName" label="First name" required defaultValue={defaults.firstName} />
          <TextField name="lastName" label="Last name" required defaultValue={defaults.lastName} />
          <SelectField name="gender" label="Gender" placeholder="Prefer not to say" defaultValue={defaults.gender ?? ""} options={[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }]} />
          <TextField name="dateOfBirth" type="date" label="Date of birth" defaultValue={defaults.dateOfBirth} />
          <TextField name="photo" type="file" accept={IMAGE_ACCEPT} label="Profile photo" containerClassName="sm:col-span-2" />
        </FormGrid>
      </FormSection>
      <FormSection title="Employment">
        <FormGrid>
          <TextField name="employeeId" label="Employee ID" required defaultValue={defaults.employeeId} placeholder="e.g. EMP-1016" />
          <TextField name="joiningDate" type="date" label="Joining date" required defaultValue={defaults.joiningDate ?? new Date().toISOString().slice(0, 10)} />
          <TextField name="qualification" label="Qualification" defaultValue={defaults.qualification} placeholder="e.g. M.Sc. Physics, B.Ed." />
          <TextField name="specialization" label="Specialization" defaultValue={defaults.specialization} placeholder="e.g. Mathematics" />
        </FormGrid>
      </FormSection>
      <FormSection title="Contact" description="The email is used for signing in.">
        <FormGrid>
          <TextField name="email" type="email" label="Email" required defaultValue={defaults.email} autoComplete="off" />
          <TextField name="phone" type="tel" label="Phone" defaultValue={defaults.phone} />
          <TextAreaField name="address" label="Address" rows={2} defaultValue={defaults.address} containerClassName="sm:col-span-2" />
          {mode === "create" && <CheckboxField name="sendInvite" defaultChecked label="Send portal invitation" hint="Emails a link so the teacher can set their password." containerClassName="sm:col-span-2" />}
        </FormGrid>
      </FormSection>
      <div className="flex justify-end gap-2 border-t pt-4">
        <ButtonLink href={cancelHref} variant="outline">Cancel</ButtonLink>
        <SubmitButton>{mode === "create" ? "Add teacher" : "Save changes"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
