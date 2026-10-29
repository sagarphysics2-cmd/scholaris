import type { NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { csvResponse, handleRouteError } from "@/server/http";
import { exportFeesCSV } from "@/server/services/fees.service";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActorOrThrow();
    const p = req.nextUrl.searchParams;
    const get = (k: string) => p.get(k)?.slice(0, 200) || undefined;
    const csv = await exportFeesCSV(actor, { q: get("q"), status: get("status"), categoryId: get("categoryId"), classId: get("classId"), sectionId: get("sectionId") });
    return csvResponse(csv, `fees-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return handleRouteError(err);
  }
}
