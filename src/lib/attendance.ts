/**
 * Attendance rate rules (pure — unit tested).
 * rate = attended / countable, where:
 *   attended  = PRESENT (+ LATE when the school counts late as present)
 *   countable = all marked days except EXCUSED (excused absences don't penalise a student)
 */
export type AttendanceCounts = { PRESENT: number; ABSENT: number; LATE: number; EXCUSED: number };

export function emptyCounts(): AttendanceCounts {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
}

export function attendanceRate(c: AttendanceCounts, lateCountsAsPresent = true): number | null {
  const countable = c.PRESENT + c.ABSENT + c.LATE;
  if (countable === 0) return null;
  const attended = c.PRESENT + (lateCountsAsPresent ? c.LATE : 0);
  return Math.round((attended / countable) * 1000) / 10;
}

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

/** Status colours for charts — the validated status palette, always shown with labels. */
export const ATTENDANCE_COLORS: Record<(typeof ATTENDANCE_STATUSES)[number], string> = {
  PRESENT: "var(--status-good)",
  ABSENT: "var(--status-critical)",
  LATE: "var(--status-warning)",
  EXCUSED: "var(--chart-1)",
};
