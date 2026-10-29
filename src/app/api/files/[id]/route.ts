import { NextResponse, type NextRequest } from "next/server";
import { requireActorOrThrow } from "@/lib/auth/actor";
import { handleRouteError } from "@/server/http";
import { authorizeFileAccess } from "@/server/services/files.service";
import { storage } from "@/server/storage";

/** Streams a stored file after a per-file authorisation check (no public bucket URLs). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActorOrThrow();
    const { id } = await params;
    const file = await authorizeFileAccess(actor, id);
    const body = await storage().get(file.storageKey);
    const inline = req.nextUrl.searchParams.get("download") !== "1" && (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf");
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(body.length),
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.originalName)}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        // Uploaded content must never run scripts in our origin.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
