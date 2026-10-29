import "server-only";
import { db } from "@/lib/db";
import { RateLimitError } from "@/server/errors";

/**
 * Fixed-window rate limiter persisted in PostgreSQL (works across multiple server
 * instances without Redis). A single atomic upsert keeps it race-free.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const rows = await db.$queryRaw<Array<{ count: number }>>`
    INSERT INTO rate_limits (key, count, window_start)
    VALUES (${key}, 1, NOW())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < NOW() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < NOW() - make_interval(secs => ${windowSeconds}) THEN NOW() ELSE rate_limits.window_start END
    RETURNING count`;
  if ((rows[0]?.count ?? 0) > limit) throw new RateLimitError();
}

export async function resetRateLimit(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}
