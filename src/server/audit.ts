import { db, type Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type AuditEntry = {
  action: string; // verb-style key, e.g. "student.update"
  entity: string; // e.g. "Student"
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

type AuditActor = { userId: string; schoolId: string | null } | null;

/**
 * Records an audit log entry. Pass the transaction client when the audited change is
 * part of a transaction so the log is committed (or rolled back) atomically with it.
 */
export async function audit(actor: AuditActor, entry: AuditEntry, client: Tx | typeof db = db, ip?: string | null) {
  ip ??= await requestIp();
  await client.auditLog.create({
    data: {
      userId: actor?.userId ?? null,
      schoolId: actor?.schoolId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      ipAddress: ip ?? null,
    },
  });
}

/** Lists the fields whose values changed — stored in audit metadata for edits. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const a = normalise(before[key]);
    const b = normalise(after[key]);
    if (a !== b) changes[key] = { from: before[key] ?? null, to: after[key] ?? null };
  }
  return changes;
}

function normalise(v: unknown) {
  if (v instanceof Date) return v.toISOString();
  if (v && typeof v === "object" && "toString" in v) return String(v);
  return v ?? null;
}

/** Client IP of the current request, or null outside a request (tests, scripts, cron). */
async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}
