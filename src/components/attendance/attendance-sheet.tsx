"use client";

import { AlertTriangle, CheckCheck, Lock, MessageSquareText } from "lucide-react";
import { useMemo, useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/fields";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { saveAttendanceAction } from "@/app/(app)/attendance/actions";

type Status = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type Row = { studentId: string; rollNumber: number; name: string; avatarFileId: string | null; status: Status | null; note: string };

const OPTIONS: Array<{ value: Status; label: string; short: string; cls: string }> = [
  { value: "PRESENT", label: "Present", short: "P", cls: "data-[on=true]:bg-success data-[on=true]:text-white data-[on=true]:border-success" },
  { value: "ABSENT", label: "Absent", short: "A", cls: "data-[on=true]:bg-danger data-[on=true]:text-white data-[on=true]:border-danger" },
  { value: "LATE", label: "Late", short: "L", cls: "data-[on=true]:bg-warning data-[on=true]:text-black data-[on=true]:border-warning" },
  { value: "EXCUSED", label: "Excused", short: "E", cls: "data-[on=true]:bg-info data-[on=true]:text-white data-[on=true]:border-info" },
];

export function AttendanceSheet({
  sectionId,
  date,
  rows: initial,
  alreadyMarked,
  locked,
  editWindowDays,
  isSchoolDay,
}: {
  sectionId: string;
  date: string;
  rows: Row[];
  alreadyMarked: boolean;
  locked: boolean;
  editWindowDays: number;
  isSchoolDay: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set(initial.filter((r) => r.note).map((r) => r.studentId)));
  const counts = useMemo(() => {
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, UNMARKED: 0 };
    rows.forEach((r) => (r.status ? c[r.status]++ : c.UNMARKED++));
    return c;
  }, [rows]);

  const set = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.studentId === id ? { ...r, ...patch } : r)));
  const markAll = (status: Status) => setRows((rs) => rs.map((r) => ({ ...r, status: r.status && r.status !== "PRESENT" && status === "PRESENT" ? r.status : status })));
  const records = rows.filter((r) => r.status).map((r) => ({ studentId: r.studentId, status: r.status, note: r.note || null }));

  return (
    <ActionForm action={saveAttendanceAction}>
      <input type="hidden" name="sectionId" value={sectionId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="records" value={JSON.stringify(records)} />

      {!isSchoolDay && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm"><AlertTriangle className="size-4 text-warning" /> This date is not a configured school day.</div>
      )}
      {alreadyMarked && !locked && (
        <div className="mx-5 mt-4 rounded-lg bg-info-soft px-3 py-2 text-sm">Attendance was already taken for this date — saving will <strong>update</strong> the existing records (changes are audited).</div>
      )}
      {locked && (
        <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"><Lock className="size-4" /> Records older than {editWindowDays} days can only be changed by an administrator.</div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <div className="flex flex-wrap gap-2 text-xs font-medium" aria-live="polite">
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-success">Present {counts.PRESENT}</span>
          <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">Absent {counts.ABSENT}</span>
          <span className="rounded-full bg-warning-soft px-2.5 py-1">Late {counts.LATE}</span>
          <span className="rounded-full bg-info-soft px-2.5 py-1 text-info">Excused {counts.EXCUSED}</span>
          {counts.UNMARKED > 0 && <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">Unmarked {counts.UNMARKED}</span>}
        </div>
        {!locked && (
          <Button size="sm" variant="secondary" className="ml-auto" onClick={() => markAll("PRESENT")}>
            <CheckCheck /> Mark rest present
          </Button>
        )}
      </div>

      <ul className="divide-y">
        {rows.map((r) => (
          <li key={r.studentId} className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-7 text-sm tabular-nums text-muted-foreground">{r.rollNumber}</span>
              <Avatar name={r.name} fileId={r.avatarFileId} size="sm" />
              <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <div role="radiogroup" aria-label={`Attendance for ${r.name}`} className="flex gap-1.5">
                {OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={r.status === o.value}
                    aria-label={o.label}
                    title={o.label}
                    data-on={r.status === o.value}
                    disabled={locked}
                    onClick={() => set(r.studentId, { status: o.value })}
                    className={cn("grid h-10 min-w-10 place-items-center rounded-lg border px-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted disabled:opacity-60 sm:min-w-20", o.cls)}
                  >
                    <span className="sm:hidden">{o.short}</span>
                    <span className="hidden sm:inline">{o.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setNotesOpen((s) => new Set(s.has(r.studentId) ? [...s].filter((x) => x !== r.studentId) : [...s, r.studentId]))}
                  className={cn("grid size-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted", r.note && "text-primary")}
                  aria-label={`Note for ${r.name}`}
                  aria-expanded={notesOpen.has(r.studentId)}
                >
                  <MessageSquareText className="size-4" />
                </button>
              </div>
            </div>
            {notesOpen.has(r.studentId) && (
              <input
                value={r.note}
                maxLength={500}
                disabled={locked}
                onChange={(e) => set(r.studentId, { note: e.target.value })}
                placeholder="Add a note (e.g. reason for absence)…"
                aria-label={`Note for ${r.name}`}
                className="mt-2 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm sm:ml-[4.5rem] sm:w-[calc(100%-4.5rem)]"
              />
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <div className="sticky bottom-16 flex items-center justify-between gap-3 border-t bg-card/95 px-5 py-3 backdrop-blur lg:bottom-0">
          <p className="text-sm text-muted-foreground">{records.length} of {rows.length} marked</p>
          <SubmitButton>{alreadyMarked ? "Update attendance" : "Save attendance"}</SubmitButton>
        </div>
      )}
    </ActionForm>
  );
}
