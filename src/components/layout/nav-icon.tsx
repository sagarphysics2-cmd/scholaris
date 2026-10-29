import {
  BarChart3, BookOpen, Building2, CalendarCheck2, CalendarDays, CalendarRange, ClipboardList, FileText, GraduationCap,
  LayoutDashboard, Megaphone, NotebookPen, ScrollText, Settings, ShieldCheck, Trophy, Users, UsersRound, Wallet, Baby, School,
} from "lucide-react";
import type { NavIcon as Key } from "@/lib/navigation";

const ICONS = {
  dashboard: LayoutDashboard,
  students: GraduationCap,
  teachers: Users,
  parents: UsersRound,
  classes: School,
  subjects: BookOpen,
  attendance: CalendarCheck2,
  timetable: CalendarRange,
  assignments: NotebookPen,
  exams: ClipboardList,
  results: Trophy,
  fees: Wallet,
  notices: Megaphone,
  reports: BarChart3,
  settings: Settings,
  schools: Building2,
  admins: ShieldCheck,
  audit: ScrollText,
  calendar: CalendarDays,
  children: Baby,
  file: FileText,
} as const;

export function NavIcon({ name, className }: { name: Key; className?: string }) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={className} aria-hidden />;
}
