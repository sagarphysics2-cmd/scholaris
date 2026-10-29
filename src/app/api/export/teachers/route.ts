import type { NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { csvResponse, handleRouteError } from "@/server/http";
import { exportTeachersCSV } from "@/server/services/teachers.service";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActorOrThrow();
    const p = req.nextUrl.searchParams;
    const get = (k: string) => p.get(k)?.slice(0, 200) || undefined;
    const csv = await exportTeachersCSV(actor, { q: get("q"), status: get("status"), subjectId: get("subjectId") });
    return csvResponse(csv, `teachers-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return handleRouteError(err);
  }
}
