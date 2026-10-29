import { NextResponse } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { handleRouteError } from "@/server/http";
import { unreadCount } from "@/server/services/notifications.service";

export async function GET() {
  try {
    const actor = await requireActorOrThrow();
    return NextResponse.json({ count: await unreadCount(actor.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return handleRouteError(err);
  }
}
