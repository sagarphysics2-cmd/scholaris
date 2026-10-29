"use client";

import { useState } from "react";
import { ActionForm, type FormAction } from "@/components/forms/action-form";
import { FormGrid, SelectField, SubmitButton, TextAreaField, TextField, type Option } from "@/components/forms/fields";
import { useCloseDialog } from "@/components/ui/dialog";
import { titleCase } from "@/lib/utils";
import { FEE_CATEGORY_TYPES, PAYMENT_METHODS, assignFeeSchema, editFeeSchema, feeCategorySchema, paymentSchema } from "@/lib/validation/fees";

export function CategoryForm({ action, defaults }: { action: FormAction; defaults?: { name: string; type: string; description: string | null; defaultAmount: number | null } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={feeCategorySchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <TextField name="name" label="Name" required defaultValue={defaults?.name} />
        <SelectField name="type" label="Type" required defaultValue={defaults?.type ?? "TUITION"} options={FEE_CATEGORY_TYPES.map((t) => ({ value: t, label: titleCase(t) }))} />
        <TextField name="defaultAmount" type="number" step="0.01" min={0} label="Default amount" defaultValue={defaults?.defaultAmount ?? ""} />
      </FormGrid>
      <TextAreaField name="description" label="Description" rows={2} defaultValue={defaults?.description ?? ""} />
      <div className="flex justify-end"><SubmitButton>Save category</SubmitButton></div>
    </ActionForm>
  );
}

export function AssignFeeForm({
  action,
  categories,
  classes,
  sections,
  students,
}: {
  action: FormAction;
  categories: Array<Option & { defaultAmount: number | null }>;
  classes: Option[];
  sections: Option[];
  students: Option[];
}) {
  const close = useCloseDialog();
  const [target, setTarget] = useState("CLASS");
  const [amount, setAmount] = useState("");
  return (
    <ActionForm action={action} schema={assignFeeSchema} onSuccess={close} className="space-y-4">
      <FormGrid>
        <SelectField
          name="categoryId"
          label="Category"
          required
          placeholder="Select…"
          options={categories}
          onChange={(e) => {
            const c = categories.find((x) => x.value === e.target.value);
            if (c?.defaultAmount && !amount) setAmount(String(c.defaultAmount));
          }}
        />
        <TextField name="title" label="Title" required placeholder="Tuition Fee — Term 3" />
        <TextField name="amount" type="number" step="0.01" min={0} label="Amount" required value={amount} onChange={(e) => setAmount(e.target.value)} />
        <TextField name="discount" type="number" step="0.01" min={0} label="Discount (per student)" defaultValue={0} />
        <TextField name="dueDate" type="date" label="Due date" required />
        <SelectField name="target" label="Bill to" value={target} onChange={(e) => setTarget(e.target.value)} options={[{ value: "CLASS", label: "A whole class" }, { value: "SECTION", label: "A section" }, { value: "STUDENTS", label: "Selected students" }]} />
        {target === "CLASS" && <SelectField name="classId" label="Class" required placeholder="Select…" options={classes} containerClassName="sm:col-span-2" />}
        {target === "SECTION" && <SelectField name="sectionId" label="Section" required placeholder="Select…" options={sections} containerClassName="sm:col-span-2" />}
        {target === "STUDENTS" && <SelectField name="studentIds" label="Students" multiple size={8} options={students} containerClassName="sm:col-span-2" hint="Hold Ctrl / ⌘ to select several." />}
      </FormGrid>
      <TextAreaField name="notes" label="Notes" rows={2} />
      <div className="flex justify-end"><SubmitButton>Assign fee</SubmitButton></div>
    </ActionForm>
  );
}

export function EditFeeForm({ action, defaults }: { action: FormAction; defaults: { title: string; amount: number; discount: number; dueDate: string; notes: string | null } }) {
  const close = useCloseDialog();
  return (
    <ActionForm action={action} schema={editFeeSchema} onSuccess={close} className="space-y-4">
      <TextField name="title" label="Title" required defaultValue={defaults.title} />
      <FormGrid>
        <TextField name="amount" type="number" step="0.01" min={0} label="Amount" required defaultValue={defaults.amount} />
        <TextField name="discount" type="number" step="0.01" min={0} label="Discount / waiver" defaultValue={defaults.discount} />
        <TextField name="dueDate" type="date" label="Due date" required defaultValue={defaults.dueDate} />
      </FormGrid>
      <TextAreaField name="notes" label="Notes" rows={2} defaultValue={defaults.notes ?? ""} />
      <div className="flex justify-end"><SubmitButton>Save</SubmitButton></div>
    </ActionForm>
  );
}

export function PaymentForm({ action, balance, currency }: { action: FormAction; balance: number; currency: string }) {
  return (
    <ActionForm action={action} schema={paymentSchema} className="space-y-4">
      <FormGrid>
        <TextField name="amount" type="number" step="0.01" min={0.01} max={balance} label={`Amount (${currency})`} required defaultValue={balance} hint={`Outstanding: ${balance.toFixed(2)}`} />
        <SelectField name="method" label="Method" required defaultValue="CASH" options={PAYMENT_METHODS.map((m) => ({ value: m, label: titleCase(m) }))} />
        <TextField name="paidAt" type="date" label="Payment date" required defaultValue={new Date().toISOString().slice(0, 10)} />
        <TextField name="reference" label="Reference / transaction no." />
      </FormGrid>
      <TextAreaField name="notes" label="Notes" rows={2} />
      <div className="flex justify-end"><SubmitButton>Record payment</SubmitButton></div>
    </ActionForm>
  );
}
