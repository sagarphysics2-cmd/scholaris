import { db } from "@/lib/db";
import { addDays } from "@/lib/utils";
import type { Actor } from "@/server/authz/guards";
import { notifyUsers } from "@/server/notifications";

/** A user's own notifications — always scoped by userId, so ids can't be used to read others'. */
export async function listNotifications(actor: Actor, p: { unread?: boolean; skip?: number; take?: number }) {
  const where = { userId: actor.userId, ...(p.unread ? { readAt: null } : {}) };
  const [total, unread, rows] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { userId: actor.userId, readAt: null } }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: p.skip, take: p.take }),
  ]);
  return { total, unread, rows };
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(actor: Actor, id: string) {
  await db.notification.updateMany({ where: { id, userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
}

export async function markAllRead(actor: Actor) {
  const res = await db.notification.updateMany({ where: { userId: actor.userId, readAt: null }, data: { readAt: new Date() } });
  return res.count;
}

export async function deleteReadNotifications(actor: Actor) {
  const res = await db.notification.deleteMany({ where: { userId: actor.userId, readAt: { not: null } } });
  return res.count;
}

/** Cron: remind students (and parents) about assignments due within 24h that are not submitted. */
export async function sendAssignmentDueReminders() {
  const now = new Date();
  const soon = await db.assignment.findMany({
    where: { status: "PUBLISHED", dueDate: { gt: now, lte: addDays(now, 1) } },
    include: { section: { include: { enrollments: { where: { status: "ACTIVE" }, include: { student: { include: { parents: { include: { parent: true } } } } } } } }, submissions: { select: { studentId: true } } },
  });
  let sent = 0;
  for (const a of soon) {
    const link = `/assignments/${a.id}`;
    const submitted = new Set(a.submissions.map((s) => s.studentId));
    for (const e of a.section.enrollments) {
      if (submitted.has(e.studentId)) continue;
      const already = await db.notification.findFirst({ where: { userId: e.student.userId, link, type: "ASSIGNMENT_DUE" } });
      if (already) continue;
      sent += await notifyUsers([e.student.userId, ...e.student.parents.map((p) => p.parent.userId)], {
        type: "ASSIGNMENT_DUE",
        title: "Assignment due soon",
        body: `"${a.title}" is due ${a.dueDate.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`,
        link,
      });
    }
  }
  return sent;
}
