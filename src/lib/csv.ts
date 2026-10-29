/**
 * Minimal RFC 4180 CSV utilities (no dependency).
 * `toCSV` neutralises spreadsheet formula injection: cells starting with = + - @ (or
 * tab/CR) are prefixed with an apostrophe so Excel/Sheets treat them as text.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

/** Parses CSV text into rows of strings. Handles quoted fields, escaped quotes and CRLF. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Parses CSV with a header row into objects keyed by normalised header names. */
export function parseCSVObjects(text: string): Array<Record<string, string>> {
  const [header, ...rows] = parseCSV(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim().replace(/\s+/g, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
