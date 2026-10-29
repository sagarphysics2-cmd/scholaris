import { NextResponse } from "next/server";
import { AppError, fromDatabaseError } from "./errors";

/** Converts errors in route handlers into safe JSON responses. */
export function handleRouteError(err: unknown) {
  const known = err instanceof AppError ? err : fromDatabaseError(err);
  if (known) return NextResponse.json({ error: known.message, code: known.code, fieldErrors: known.fieldErrors }, { status: known.status });
  console.error("[api] unexpected error", err);
  return NextResponse.json({ error: "Something went wrong on our side. Please try again." }, { status: 500 });
}

export function csvResponse(csv: string, filename: string) {
  return new NextResponse(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`,
      "Cache-Control": "no-store",
    },
  });
}
