"use client";

import { CheckCircle2 } from "lucide-react";
import { startTransition, useActionState, useEffect } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { inputClass } from "@/components/forms/fields";
import { importStudentsAction } from "../actions";

export function ImportForm() {
  const [state, dispatch, pending] = useActionState(importStudentsAction, null);
  const router = useRouter();
  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success(state.message);
      router.refresh();
    } else if (state.message) toast.error(state.message);
  }, [state, router]);

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => dispatch(fd));
        }}
        className="space-y-4"
      >
        <div className="space-y-1.5">
          <label htmlFor="csv" className="block text-sm font-medium">CSV file</label>
          <input id="csv" name="file" type="file" accept=".csv,text/csv" required className={`${inputClass} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1`} />
          {state?.fieldErrors?.file && <p className="text-xs font-medium text-danger">{state.fieldErrors.file[0]}</p>}
        </div>
        <Button type="submit" loading={pending}>Validate & import</Button>
      </form>

      {state?.ok && state.data && (
        <div className="flex items-start gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm" role="status">
          <CheckCircle2 className="mt-0.5 size-5 text-success" />
          <div>
            <p className="font-medium">{state.data.created} students imported successfully.</p>
            <ButtonLink href="/students" variant="link" className="mt-1">View students →</ButtonLink>
          </div>
        </div>
      )}

      {state && !state.ok && state.data?.errors && state.data.errors.length > 0 && (
        <div className="rounded-xl border border-danger/30" role="alert">
          <p className="border-b border-danger/20 bg-danger-soft px-4 py-2.5 text-sm font-medium text-danger">
            {state.data.errors.length} row(s) need attention
          </p>
          <ul className="max-h-80 divide-y overflow-y-auto text-sm">
            {state.data.errors.map((e) => (
              <li key={e.row} className="flex gap-4 px-4 py-2">
                <span className="w-14 shrink-0 font-medium tabular-nums">Row {e.row}</span>
                <span className="text-muted-foreground">{e.messages.join(" ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
