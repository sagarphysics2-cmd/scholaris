import type { NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { csvResponse, handleRouteError } from "@/server/http";
import { exportRegisterCSV } from "@/server/services/attendance.service";
import { ValidationError } from "@/server/errors";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActorOrThrow();
    const sectionId = req.nextUrl.searchParams.get("sectionId") ?? "";
    const month = req.nextUrl.searchParams.get("month") ?? "";
    if (!sectionId || !/^\d{4}-\d{2}$/.test(month)) throw new ValidationError("sectionId and month (YYYY-MM) are required.");
    const csv = await exportRegisterCSV(actor, sectionId, month);
    return csvResponse(csv, `attendance-${month}.csv`);
  } catch (err) {
    return handleRouteError(err);
  }
}
