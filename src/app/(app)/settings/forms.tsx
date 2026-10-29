"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { CheckboxField, FormGrid, SubmitButton, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { DAYS, titleCase } from "@/lib/utils";
import { IMAGE_ACCEPT } from "@/lib/validation/files";
import { attendanceSettingsSchema, feeSettingsSchema, generalSettingsSchema, schoolProfileSchema } from "@/lib/validation/admin";
import { NOTIFICATION_TYPES, type SchoolSettings } from "@/lib/validation/settings";
import { saveAttendanceAction, saveExamAction, saveFeesAction, saveGeneralAction, saveNotificationsAction, saveProfileAction, saveRoleAction } from "./actions";

const Footer = ({ label = "Save changes" }: { label?: string }) => (
  <div className="mt-6 flex justify-end border-t pt-4"><SubmitButton>{label}</SubmitButton></div>
);

export function ProfileForm({ school }: { school: { name: string; address: string | null; phone: string | null; email: string | null; website: string | null; logoFileId: string | null } }) {
  return (
    <ActionForm action={saveProfileAction} schema={schoolProfileSchema} encType="multipart/form-data">
      <FormGrid>
        <TextField name="name" label="School name" required defaultValue={school.name} containerClassName="sm:col-span-2" />
        <TextField name="address" label="Address" defaultValue={school.address ?? ""} containerClassName="sm:col-span-2" />
        <TextField name="phone" type="tel" label="Phone" defaultValue={school.phone ?? ""} />
        <TextField name="email" type="email" label="Email" defaultValue={school.email ?? ""} />
        <TextField name="website" type="url" label="Website" defaultValue={school.website ?? ""} />
        <div className="flex items-end gap-3">
          {school.logoFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${school.logoFileId}`} alt="Current logo" className="size-10 rounded-lg border object-contain" />
          )}
          <TextField name="logo" type="file" accept={IMAGE_ACCEPT} label="Logo" containerClassName="flex-1" />
        </div>
      </FormGrid>
      <Footer />
    </ActionForm>
  );
}

export function GeneralForm({ settings }: { settings: SchoolSettings }) {
  return (
    <ActionForm action={saveGeneralAction} schema={generalSettingsSchema}>
      <FormGrid>
        <TextField name="currency" label="Currency code" required defaultValue={settings.currency} maxLength={3} className="uppercase" hint="ISO 4217, e.g. USD, EUR, INR, GBP." />
        <TextField name="timezone" label="Time zone" required defaultValue={settings.timezone} hint="IANA name, e.g. Asia/Kolkata." />
      </FormGrid>
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium">School days</legend>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => (
            <label key={d} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
              <input type="checkbox" name="schoolDays" value={i + 1} defaultChecked={settings.schoolDays.includes(i + 1)} className="accent-[var(--primary)]" />
              {d.slice(0, 3)}
            </label>
          ))}
        </div>
      </fieldset>
      <Footer />
    </ActionForm>
  );
}

export function AttendanceForm({ settings }: { settings: SchoolSettings["attendance"] }) {
  return (
    <ActionForm action={saveAttendanceAction} schema={attendanceSettingsSchema} className="space-y-5">
      <FormGrid>
        <TextField name="lowAttendanceThreshold" type="number" min={0} max={100} label="Minimum attendance (%)" defaultValue={settings.lowAttendanceThreshold} hint="Students below this are flagged." />
        <TextField name="teacherEditWindowDays" type="number" min={0} max={365} label="Teacher edit window (days)" defaultValue={settings.teacherEditWindowDays} hint="After this, only admins can change records." />
      </FormGrid>
      <CheckboxField name="lateCountsAsPresent" label="Count late arrivals as present" defaultChecked={settings.lateCountsAsPresent} />
      <CheckboxField name="notifyParentsOnAbsence" label="Notify parents when a student is marked absent" defaultChecked={settings.notifyParentsOnAbsence} />
      <Footer />
    </ActionForm>
  );
}

type Grade = { grade: string; minPercent: number; gradePoint: number | null; remark: string | null };

export function GradingForm({ grades: initial, overallPassPercent }: { grades: Grade[]; overallPassPercent: number }) {
  const [grades, setGrades] = useState<Grade[]>(initial.length ? initial : [{ grade: "A", minPercent: 80, gradePoint: 4, remark: "" }, { grade: "F", minPercent: 0, gradePoint: 0, remark: "" }]);
  const set = (i: number, patch: Partial<Grade>) => setGrades((g) => g.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const sorted = [...grades].sort((a, b) => b.minPercent - a.minPercent);
  return (
    <ActionForm action={saveExamAction}>
      <input type="hidden" name="grades" value={JSON.stringify(grades.map((g) => ({ ...g, remark: g.remark || null })))} />
      <TextField name="overallPassPercent" type="number" min={0} max={100} label="Overall pass percentage" defaultValue={overallPassPercent} hint="Students must also pass every subject's passing marks." containerClassName="max-w-xs" />
      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase text-muted-foreground"><th className="pb-2 pr-2">Grade</th><th className="pb-2 pr-2">Min %</th><th className="pb-2 pr-2">Grade point</th><th className="pb-2 pr-2">Remark</th><th /></tr></thead>
          <tbody>
            {grades.map((g, i) => (
              <tr key={i}>
                <td className="py-1 pr-2"><input aria-label="Grade" value={g.grade} maxLength={5} onChange={(e) => set(i, { grade: e.target.value })} className="h-9 w-20 rounded-lg border border-input bg-card px-2" /></td>
                <td className="py-1 pr-2"><input aria-label="Minimum percent" type="number" min={0} max={100} value={g.minPercent} onChange={(e) => set(i, { minPercent: Number(e.target.value) })} className="h-9 w-24 rounded-lg border border-input bg-card px-2" /></td>
                <td className="py-1 pr-2"><input aria-label="Grade point" type="number" step="0.1" min={0} max={10} value={g.gradePoint ?? ""} onChange={(e) => set(i, { gradePoint: e.target.value === "" ? null : Number(e.target.value) })} className="h-9 w-24 rounded-lg border border-input bg-card px-2" /></td>
                <td className="py-1 pr-2"><input aria-label="Remark" value={g.remark ?? ""} maxLength={60} onChange={(e) => set(i, { remark: e.target.value })} className="h-9 w-full min-w-40 rounded-lg border border-input bg-card px-2" /></td>
                <td className="py-1"><Button variant="ghost" size="icon-sm" aria-label="Remove grade" onClick={() => setGrades((x) => x.filter((_, j) => j !== i))}><Trash2 /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" size="sm" className="mt-2" onClick={() => setGrades((g) => [...g, { grade: "", minPercent: 0, gradePoint: null, remark: "" }])}><Plus /> Add grade</Button>
      <p className="mt-4 text-xs text-muted-foreground">Preview: {sorted.map((g) => `${g.grade || "?"} ≥ ${g.minPercent}%`).join(" · ")}</p>
      <Footer label="Save grading rules" />
    </ActionForm>
  );
}

export function FeesForm({ settings }: { settings: SchoolSettings["fees"] }) {
  return (
    <ActionForm action={saveFeesAction} schema={feeSettingsSchema} className="space-y-5">
      <FormGrid>
        <TextField name="receiptPrefix" label="Receipt number prefix" required defaultValue={settings.receiptPrefix} hint="Receipts look like PREFIX-2026-000123." />
        <TextField name="reminderDaysBeforeDue" type="number" min={0} max={60} label="Send reminders (days before due)" defaultValue={settings.reminderDaysBeforeDue} />
      </FormGrid>
      <CheckboxField name="showFeesToStudents" label="Show fee information to students" hint="Parents always see their children's fees." defaultChecked={settings.showFeesToStudents} />
      <Footer />
    </ActionForm>
  );
}

export function NotificationsForm({ settings }: { settings: SchoolSettings["notifications"] }) {
  return (
    <ActionForm action={saveNotificationsAction} className="space-y-4">
      <p className="text-sm text-muted-foreground">In-app notifications are always on. Choose which events are also sent by email (requires SMTP to be configured).</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {NOTIFICATION_TYPES.map((t) => (
          <CheckboxField key={t} name={t} label={titleCase(t)} defaultChecked={Boolean(settings.email[t])} containerClassName="rounded-lg border p-3" />
        ))}
      </div>
      <Footer />
    </ActionForm>
  );
}

export function RoleForm({ role, permissions }: { role: { id: string; key: string; granted: string[] }; permissions: Array<{ key: string; module: string; description: string }> }) {
  const modules = [...new Set(permissions.map((p) => p.module))];
  return (
    <ActionForm action={saveRoleAction}>
      <input type="hidden" name="roleId" value={role.id} />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <fieldset key={m} className="rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m}</legend>
            <div className="space-y-2">
              {permissions.filter((p) => p.module === m).map((p) => (
                <label key={p.key} className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" name="permissions" value={p.key} defaultChecked={role.granted.includes(p.key)} className="mt-0.5 size-4 accent-[var(--primary)]" />
                  <span><span className="font-mono text-xs">{p.key}</span><span className="block text-xs text-muted-foreground">{p.description}</span></span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <Footer label={`Save ${titleCase(role.key)} permissions`} />
    </ActionForm>
  );
}
