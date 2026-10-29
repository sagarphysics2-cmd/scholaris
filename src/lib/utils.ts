import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Numeric = number | string | { toString(): string } | null | undefined;

/** Converts Prisma Decimal / string / number into a JS number (null-safe). */
export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : 0;
}

/** Rounds to 2 decimals, avoiding binary floating point artefacts (1.005 → 1.01). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: Numeric, currency = "USD", locale = "en-US") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 2 }).format(
    toNumber(value),
  );
}

export function formatNumber(value: Numeric, digits = 0) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(
    toNumber(value),
  );
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Formats a calendar date (stored as UTC midnight) without timezone drift. */
export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  return dateFmt.format(new Date(value));
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return dateTimeFmt.format(new Date(value));
}

export function relativeTime(value: Date | string) {
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(value);
}

/** "YYYY-MM-DD" for a Date, using its UTC calendar day. */
export function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Parses "YYYY-MM-DD" into a UTC-midnight Date (how @db.Date columns are represented). */
export function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Today's calendar date as UTC midnight. */
export function todayUTC(): Date {
  return parseISODate(new Date().toISOString().slice(0, 10));
}

export function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export function fullName(p: { firstName: string; lastName: string } | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}`.trim() : "—";
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function titleCase(s: string) {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** ISO weekday 1..7 (Mon..Sun) for a UTC date. */
export function isoWeekday(d: Date) {
  const day = d.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Current time for server components. Server components render once per request, so
 * reading the clock is deterministic for that render; this helper makes that explicit.
 */
export function requestNow(): number {
  return Date.now();
}
