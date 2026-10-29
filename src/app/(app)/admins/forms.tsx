"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ActionForm } from "@/components/forms/action-form";
import { FormGrid, SelectField, SubmitButton, TextField, type Option } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { useCloseDialog } from "@/components/ui/dialog";
import { adminUserSchema, schoolSchema } from "@/lib/validation/admin";
import type { ActionState } from "@/server/action";
import { createAdminAction, saveSchoolAction } from "./actions";

export function AdminForm({ schools, allowSuper, defaultSchoolId }: { schools: Option[]; allowSuper: boolean; defaultSchoolId: string | null }) {
  const [role, setRole] = useState("SCHOOL_ADMIN");
  const [link, setLink] = useState<string | null>(null);
  if (link) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Email is in console mode, so share this one-time invitation link (valid 72 hours):</p>
        <code className="block break-all rounded-lg bg-muted p-3 text-xs">{link}</code>
        <div className="flex justify-end"><Button onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}><Copy /> Copy link</Button></div>
      </div>
    );
  }
  return (
    <ActionForm action={createAdminAction} schema={adminUserSchema} onSuccess={(s: NonNullable<ActionState>) => setLink((s.data as { link: string | null } | undefined)?.link ?? null)} className="space-y-4">
      <FormGrid>
        <TextField name="firstName" label="First name" required />
        <TextField name="lastName" label="Last name" required />
        <TextField name="email" type="email" label="Email" required />
        <TextField name="phone" type="tel" label="Phone" />
        <SelectField name="role" label="Role" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: "SCHOOL_ADMIN", label: "School Admin" }, ...(allowSuper ? [{ value: "SUPER_ADMIN", label: "Super Admin (all schools)" }] : [])]} />
        {role === "SCHOOL_ADMIN" && <SelectField name="schoolId" label="School" required options={schools} defaultValue={defaultSchoolId ?? ""} placeholder="Select…" />}
      </FormGrid>
      <div className="flex justify-end"><SubmitButton>Send invitation</SubmitButton></div>
    </ActionForm>
  );
}

export function SchoolForm({ id, defaults }: { id?: string; defaults?: { name: string; code: string; address: string | null; phone: string | null; email: string | null; website: string | null } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={saveSchoolAction.bind(null, id)} schema={schoolSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <TextField name="name" label="School name" required defaultValue={defaults?.name} containerClassName="sm:col-span-2" />
        <TextField name="code" label="Short code" required defaultValue={defaults?.code} className="uppercase" />
        <TextField name="phone" type="tel" label="Phone" defaultValue={defaults?.phone ?? ""} />
        <TextField name="email" type="email" label="Email" defaultValue={defaults?.email ?? ""} />
        <TextField name="website" type="url" label="Website" defaultValue={defaults?.website ?? ""} />
        <TextField name="address" label="Address" defaultValue={defaults?.address ?? ""} containerClassName="sm:col-span-2" />
      </FormGrid>
      <div className="flex justify-end"><SubmitButton>{id ? "Save school" : "Create school"}</SubmitButton></div>
    </ActionForm>
  );
}
