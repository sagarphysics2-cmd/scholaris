import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { handleRouteError } from "@/server/http";
import { sendFeeReminders } from "@/server/services/fees.service";
import { notifyDueNotices } from "@/server/services/notices.service";
import { sendAssignmentDueReminders } from "@/server/services/notifications.service";
import { db } from "@/lib/db";

const JOBS: Record<string, () => Promise<number>> = {
  "fee-reminders": sendFeeReminders,
  "assignment-reminders": sendAssignmentDueReminders,
  "publish-notices": notifyDueNotices,
  // Housekeeping: expired sessions, used/expired tokens and stale rate-limit windows.
  cleanup: async () => {
    const now = new Date();
    const [s, t, r] = await Promise.all([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } }),
      db.rateLimit.deleteMany({ where: { windowStart: { lt: new Date(now.getTime() - 86400000) } } }),
    ]);
    return s.count + t.count + r.count;
  },
};

/**
 * Scheduled jobs, called by the platform scheduler (e.g. Vercel Cron) with
 * `Authorization: Bearer $CRON_SECRET`. Disabled when CRON_SECRET is not set.
 */
async function run(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  try {
    const secret = env().CRON_SECRET;
    const auth = req.headers.get("authorization") ?? "";
    const expected = `Bearer ${secret}`;
    if (!secret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { job } = await params;
    const fn = JOBS[job];
    if (!fn) return NextResponse.json({ error: "Unknown job" }, { status: 404 });
    const count = await fn();
    return NextResponse.json({ job, ok: true, count });
  } catch (err) {
    return handleRouteError(err);
  }
}

export { run as GET, run as POST };
