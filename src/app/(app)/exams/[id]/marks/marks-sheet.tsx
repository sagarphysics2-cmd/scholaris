"use client";

import { Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/fields";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { saveMarksAction } from "../../actions";

type Row = { studentId: string; roll: number; name: string; avatarFileId: string | null; marks: number | null; absent: boolean; remarks: string; grade: string | null };

export function MarksSheet({ paperId, sectionId, maxMarks, passingMarks, rows: initial, locked }: { paperId: string; sectionId: string; maxMarks: number; passingMarks: number; rows: Row[]; locked: boolean }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, input: r.marks === null ? "" : String(r.marks) })));
  const set = (id: string, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r) => (r.studentId === id ? { ...r, ...patch } : r)));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    for (const r of rows) {
      if (r.absent || r.input.trim() === "") continue;
      const n = Number(r.input);
      if (!Number.isFinite(n)) e[r.studentId] = "Not a number";
      else if (n < 0) e[r.studentId] = "Cannot be negative";
      else if (n > maxMarks) e[r.studentId] = `Max ${maxMarks}`;
    }
    return e;
  }, [rows, maxMarks]);

  const records = rows.map((r) => ({ studentId: r.studentId, absent: r.absent, marks: r.absent || r.input.trim() === "" ? null : Number(r.input), remarks: r.remarks || null }));
  const entered = rows.filter((r) => r.absent || r.input.trim() !== "").length;
  const vals = rows.filter((r) => !r.absent && r.input.trim() !== "" && !errors[r.studentId]).map((r) => Number(r.input));
  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
  const failing = vals.filter((v) => v < passingMarks).length;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <ActionForm action={saveMarksAction}>
      <input type="hidden" name="examSubjectId" value={paperId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="records" value={JSON.stringify(records)} />
      {locked && <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"><Lock className="size-4" /> Results are published. Marks are read-only.</div>}
      <div className="flex flex-wrap gap-2 border-b px-5 py-3 text-xs font-medium">
        <span className="rounded-full bg-muted px-2.5 py-1">Entered {entered}/{rows.length}</span>
        <span className="rounded-full bg-primary-soft px-2.5 py-1">Average {avg}</span>
        <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Below pass mark {failing}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-14 px-4 py-2">Roll</th>
              <th className="px-4 py-2">Student</th>
              <th className="w-40 px-4 py-2">Marks / {maxMarks}</th>
              <th className="w-24 px-4 py-2">Absent</th>
              <th className="min-w-48 px-4 py-2">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.studentId} className="border-b last:border-0">
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.roll}</td>
                <td className="px-4 py-2"><span className="flex items-center gap-2 font-medium"><Avatar name={r.name} fileId={r.avatarFileId} size="sm" /><span className="truncate">{r.name}</span></span></td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    max={maxMarks}
                    value={r.input}
                    disabled={locked || r.absent}
                    onChange={(e) => set(r.studentId, { input: e.target.value })}
                    aria-label={`Marks for ${r.name}`}
                    aria-invalid={Boolean(errors[r.studentId])}
                    className={cn("h-10 w-24 rounded-lg border border-input bg-card px-3 tabular-nums disabled:opacity-50", errors[r.studentId] && "border-danger", !errors[r.studentId] && r.input !== "" && Number(r.input) < passingMarks && "text-danger")}
                  />
                  {errors[r.studentId] && <p className="mt-1 text-xs text-danger">{errors[r.studentId]}</p>}
                </td>
                <td className="px-4 py-2">
                  <input type="checkbox" checked={r.absent} disabled={locked} onChange={(e) => set(r.studentId, { absent: e.target.checked, input: e.target.checked ? "" : r.input })} aria-label={`${r.name} absent`} className="size-5 accent-[var(--primary)]" />
                </td>
                <td className="px-4 py-2">
                  <input value={r.remarks} maxLength={300} disabled={locked} onChange={(e) => set(r.studentId, { remarks: e.target.value })} aria-label={`Remarks for ${r.name}`} className="h-10 w-full rounded-lg border border-input bg-card px-3 disabled:opacity-50" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="sticky bottom-16 flex items-center justify-between gap-3 border-t bg-card/95 px-5 py-3 backdrop-blur lg:bottom-0">
          <p className="text-sm text-muted-foreground">{hasErrors ? <span className="text-danger">Fix highlighted marks before saving.</span> : "Leave blank if not yet marked. Changes are audited."}</p>
          {hasErrors ? <span className="text-sm" /> : <SubmitButton>Save marks</SubmitButton>}
        </div>
      )}
    </ActionForm>
  );
}
