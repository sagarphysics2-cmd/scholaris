import "server-only";
import { headers } from "next/headers";

/** Best-effort client metadata for audit logs and sessions. */
export async function getRequestMeta() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip = (forwarded ? forwarded.split(",")[0]!.trim() : h.get("x-real-ip")) || "unknown";
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}
