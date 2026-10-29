import { db, type Tx } from "@/lib/db";
import type { NotificationType } from "@/generated/prisma/enums";
import { sendMail } from "./mail";

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
};

/**
 * Notification delivery is channel-based. In-app delivery is always on; additional
 * channels (email today, push later) implement `NotificationChannel` and are enabled
 * per school via Settings → Notifications. Adding web-push later means adding one
 * channel here — callers do not change.
 */
export interface NotificationChannel {
  name: string;
  deliver(userIds: string[], input: NotificationInput): Promise<void>;
}

const emailChannel: NotificationChannel = {
  name: "email",
  async deliver(userIds, input) {
    const users = await db.user.findMany({
      where: { id: { in: userIds }, email: { not: null }, status: "ACTIVE" },
      select: { email: true, firstName: true },
    });
    await Promise.allSettled(
      users.map((u) =>
        sendMail({
          to: u.email!,
          subject: input.title,
          text: `Hello ${u.firstName},\n\n${input.body}\n\n— Scholaris`,
        }),
      ),
    );
  },
};

/** Creates in-app notifications (inside the caller's transaction if given). */
export async function notifyUsers(userIds: string[], input: NotificationInput, client: Tx | typeof db = db) {
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return 0;
  await client.notification.createMany({
    data: unique.map((userId) => ({ userId, ...input })),
  });
  return unique.length;
}

/**
 * Fan-out to optional external channels. Runs after the DB work is committed and never
 * throws — a failing email server must not break marking attendance.
 */
export async function dispatchExternal(schoolId: string | null, userIds: string[], input: NotificationInput) {
  if (!schoolId || userIds.length === 0) return;
  try {
    const school = await db.school.findUnique({ where: { id: schoolId }, select: { settings: true } });
    const settings = (school?.settings ?? {}) as { notifications?: { email?: Partial<Record<NotificationType, boolean>> } };
    const channels: NotificationChannel[] = [];
    if (settings.notifications?.email?.[input.type]) channels.push(emailChannel);
    await Promise.allSettled(channels.map((c) => c.deliver(userIds, input)));
  } catch (err) {
    console.error("[notifications] external dispatch failed", err);
  }
}

/** Users who should hear about a student: the student (if they can log in) and parents. */
export async function studentAndParentUserIds(studentIds: string[]) {
  const students = await db.student.findMany({
    where: { id: { in: studentIds } },
    select: { userId: true, parents: { select: { parent: { select: { userId: true } } } } },
  });
  return students.flatMap((s) => [s.userId, ...s.parents.map((p) => p.parent.userId)]);
}

export async function sectionStudentAndParentUserIds(sectionId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { sectionId, status: "ACTIVE" },
    select: { studentId: true },
  });
  return studentAndParentUserIds(enrollments.map((e) => e.studentId));
}
