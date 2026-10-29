import Link from "next/link";
import { CalendarRange, ClipboardList, Megaphone, Pin } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatDate, fullName, relativeTime } from "@/lib/utils";

export function Greeting({ name, subtitle }: { name: string; subtitle: ReactNode }) {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">Good {part}, {name} 👋</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

type Lesson = { id: string; period: { name: string; startTime: string; endTime: string }; subject: { name: string }; teacher: { user: { firstName: string; lastName: string } }; section: { name: string; class: { name: string } }; room: string | null };

export function TodayTimetable({ lessons, mode }: { lessons: Lesson[]; mode: "teacher" | "student" }) {
  const nowHM = new Date().toTimeString().slice(0, 5);
  return (
    <Card>
      <CardHeader title="Today's timetable" icon={<CalendarRange />} action={<ButtonLink href="/timetable" variant="ghost" size="sm">Full week</ButtonLink>} />
      {lessons.length === 0 ? (
        <EmptyState title="No lessons today" description="Enjoy the free day!" className="py-8" />
      ) : (
        <ol className="space-y-1 p-3">
          {lessons.map((l) => {
            const current = nowHM >= l.period.startTime && nowHM < l.period.endTime;
            const past = nowHM >= l.period.endTime;
            return (
              <li key={l.id} className={cn("flex items-center gap-3 rounded-lg px-3 py-2", current && "bg-primary-soft", past && "opacity-55")}>
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{l.period.startTime}–{l.period.endTime}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.subject.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {mode === "teacher" ? `${l.section.class.name}-${l.section.name}` : fullName(l.teacher.user)}
                    {l.room ? ` · ${l.room}` : ""}
                  </span>
                </span>
                {current && <Badge tone="primary">Now</Badge>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

type Paper = { id: string; examDate: Date; startTime: string | null; subject: { name: string }; class: { name: string }; examination: { name: string; id: string } };

export function UpcomingExams({ papers, showClass = true }: { papers: Paper[]; showClass?: boolean }) {
  return (
    <Card>
      <CardHeader title="Upcoming exams" icon={<ClipboardList />} action={<ButtonLink href="/exams" variant="ghost" size="sm">All exams</ButtonLink>} />
      {papers.length === 0 ? (
        <EmptyState title="No upcoming exams" className="py-8" />
      ) : (
        <ul className="divide-y">
          {papers.map((p) => (
            <li key={p.id}>
              <Link href={`/exams/${p.examination.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/50">
                <span className="grid w-12 shrink-0 place-items-center rounded-lg bg-muted py-1 text-center leading-tight">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">{p.examDate.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
                  <span className="text-lg font-semibold">{p.examDate.getUTCDate()}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.subject.name}{showClass && ` · ${p.class.name}`}</span>
                  <span className="block truncate text-xs text-muted-foreground">{p.examination.name}{p.startTime ? ` · ${p.startTime}` : ""}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

type NoticeRow = { id: string; title: string; isPinned: boolean; publishDate: Date; author: { firstName: string; lastName: string } };

export function RecentNotices({ notices }: { notices: NoticeRow[] }) {
  return (
    <Card>
      <CardHeader title="Notices" icon={<Megaphone />} action={<ButtonLink href="/notices" variant="ghost" size="sm">View all</ButtonLink>} />
      {notices.length === 0 ? (
        <EmptyState title="No notices" className="py-8" />
      ) : (
        <ul className="divide-y">
          {notices.map((n) => (
            <li key={n.id}>
              <Link href={`/notices/${n.id}`} className="block px-5 py-3 hover:bg-muted/50">
                <span className="flex items-center gap-1.5 text-sm font-medium">{n.isPinned && <Pin className="size-3.5 text-warning" aria-label="Pinned" />}<span className="truncate">{n.title}</span></span>
                <span className="text-xs text-muted-foreground">{fullName(n.author)} · {relativeTime(n.publishDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function dueLabel(d: Date) {
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: "Overdue", tone: "danger" as const };
  if (days === 0) return { text: "Due today", tone: "warning" as const };
  if (days === 1) return { text: "Due tomorrow", tone: "warning" as const };
  return { text: `Due ${formatDate(d)}`, tone: "neutral" as const };
}
