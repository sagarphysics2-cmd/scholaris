import type { PermissionKey, RoleKey } from "@/lib/permissions/catalog";

export type NavIcon =
  | "dashboard" | "students" | "teachers" | "parents" | "classes" | "subjects" | "attendance" | "timetable"
  | "assignments" | "exams" | "results" | "fees" | "notices" | "reports" | "settings" | "schools" | "admins"
  | "audit" | "calendar" | "children";

export type NavItem = { href: string; label: string; icon: NavIcon; section: string };

type NavDef = NavItem & {
  /** Any one of these permissions makes the item visible. */
  anyOf?: PermissionKey[];
  roles?: RoleKey[];
  labelFor?: Partial<Record<RoleKey, string>>;
};

const NAV: NavDef[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard", section: "Overview" },
  { href: "/students", label: "Students", icon: "students", section: "People", anyOf: ["students.read"], labelFor: { PARENT: "My Children", TEACHER: "My Students" } },
  { href: "/teachers", label: "Teachers", icon: "teachers", section: "People", anyOf: ["teachers.read"] },
  { href: "/parents", label: "Parents", icon: "parents", section: "People", anyOf: ["parents.write"] },
  { href: "/classes", label: "Classes & Sections", icon: "classes", section: "Academics", anyOf: ["classes.read"], labelFor: { TEACHER: "My Classes" } },
  { href: "/subjects", label: "Subjects", icon: "subjects", section: "Academics", anyOf: ["subjects.write"] },
  { href: "/attendance", label: "Attendance", icon: "attendance", section: "Academics", anyOf: ["attendance.read"] },
  { href: "/timetable", label: "Timetable", icon: "timetable", section: "Academics", anyOf: ["timetable.read"] },
  { href: "/assignments", label: "Assignments", icon: "assignments", section: "Academics", anyOf: ["assignments.read"] },
  { href: "/exams", label: "Examinations", icon: "exams", section: "Academics", anyOf: ["exams.read"] },
  { href: "/results", label: "Results", icon: "results", section: "Academics", anyOf: ["results.read"] },
  { href: "/fees", label: "Fees", icon: "fees", section: "Administration", anyOf: ["fees.read"] },
  { href: "/notices", label: "Notices", icon: "notices", section: "Administration", anyOf: ["notices.read"] },
  { href: "/reports", label: "Reports", icon: "reports", section: "Administration", anyOf: ["reports.view"] },
  { href: "/academic-years", label: "Academic Years", icon: "calendar", section: "System", anyOf: ["academic_years.manage"] },
  { href: "/schools", label: "Schools", icon: "schools", section: "System", anyOf: ["schools.manage"] },
  { href: "/admins", label: "Administrators", icon: "admins", section: "System", anyOf: ["admins.manage"] },
  { href: "/audit-logs", label: "Audit Log", icon: "audit", section: "System", anyOf: ["audit.view"] },
  { href: "/settings", label: "Settings", icon: "settings", section: "System", anyOf: ["settings.manage"] },
];

export function buildNav(role: RoleKey, permissions: ReadonlySet<PermissionKey>): NavItem[] {
  return NAV.filter((n) => (!n.roles || n.roles.includes(role)) && (!n.anyOf || n.anyOf.some((p) => permissions.has(p)))).map(
    ({ href, icon, section, label, labelFor }) => ({ href, icon, section, label: labelFor?.[role] ?? label }),
  );
}

/** Up to four primary destinations for the mobile bottom bar. */
export function bottomNav(items: NavItem[], role: RoleKey): NavItem[] {
  const prefs: Record<RoleKey, string[]> = {
    SUPER_ADMIN: ["/dashboard", "/students", "/attendance", "/fees"],
    SCHOOL_ADMIN: ["/dashboard", "/students", "/attendance", "/fees"],
    TEACHER: ["/dashboard", "/attendance", "/assignments", "/timetable"],
    STUDENT: ["/dashboard", "/timetable", "/assignments", "/results"],
    PARENT: ["/dashboard", "/attendance", "/results", "/fees"],
  };
  return prefs[role].map((h) => items.find((i) => i.href === h)).filter(Boolean) as NavItem[];
}
