import { NextResponse } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { assertCan } from "@/server/authz/guards";
import { handleRouteError } from "@/server/http";
import { STUDENT_IMPORT_TEMPLATE } from "@/server/services/students.service";

export async function GET() {
  try {
    const actor = await requireActorOrThrow();
    assertCan(actor, "students.write");
    return new NextResponse(STUDENT_IMPORT_TEMPLATE, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="student-import-template.csv"' },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
