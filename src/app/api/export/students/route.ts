import type { NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { assertCan } from "@/server/authz/guards";
import { exportStudentsCSV } from "@/server/services/students.service";
import { csvResponse, handleRouteError } from "@/server/http";

export async function GET(req: NextRequest) {
  try {
    const actor = await requireActorOrThrow();
    assertCan(actor, "students.write");
    const p = req.nextUrl.searchParams;
    const get = (k: string) => p.get(k)?.slice(0, 200) || undefined;
    const csv = await exportStudentsCSV(actor, { q: get("q"), classId: get("classId"), sectionId: get("sectionId"), status: get("status"), gender: get("gender"), sort: get("sort"), dir: get("dir") });
    return csvResponse(csv, `students-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return handleRouteError(err);
  }
}

