/**
 * Permission catalog.
 *
 * This file is the *seed source* for the `permissions`, `roles` and `role_permissions`
 * tables. At runtime the application never reads these defaults — it loads the
 * permissions granted to the user's role from the database (see server/auth/actor.ts),
 * so a Super Admin can change grants from Settings → Roles & permissions without a deploy.
 *
 * Row-level scoping (a teacher only sees their own sections, a parent only their
 * children, ...) is enforced separately in server/authz/scope.ts.
 */

export const ROLE_KEYS = ["SUPER_ADMIN", "SCHOOL_ADMIN", "TEACHER", "STUDENT", "PARENT"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "School Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
  PARENT: "Parent / Guardian",
};

export const PERMISSIONS = {
  "schools.manage": { module: "System", description: "Create and manage schools" },
  "admins.manage": { module: "System", description: "Manage administrator accounts" },
  "roles.manage": { module: "System", description: "Change role permissions" },
  "settings.manage": { module: "System", description: "Configure school settings" },
  "audit.view": { module: "System", description: "View the audit log" },

  "students.read": { module: "Students", description: "View students (scoped)" },
  "students.write": { module: "Students", description: "Create, edit, import and archive students" },
  "teachers.read": { module: "Teachers", description: "View teachers" },
  "teachers.write": { module: "Teachers", description: "Create, edit and archive teachers" },
  "parents.read": { module: "Parents", description: "View parents (scoped)" },
  "parents.write": { module: "Parents", description: "Create, edit and link parents" },

  "classes.read": { module: "Academics", description: "View classes and sections" },
  "classes.write": { module: "Academics", description: "Manage classes, sections and enrollments" },
  "subjects.read": { module: "Academics", description: "View subjects" },
  "subjects.write": { module: "Academics", description: "Manage subjects and teaching assignments" },
  "academic_years.manage": { module: "Academics", description: "Manage academic years" },

  "attendance.read": { module: "Attendance", description: "View attendance (scoped)" },
  "attendance.mark": { module: "Attendance", description: "Mark attendance for own sections" },
  "attendance.manage": { module: "Attendance", description: "Mark and edit attendance for any section" },

  "timetable.read": { module: "Timetable", description: "View timetables (scoped)" },
  "timetable.manage": { module: "Timetable", description: "Configure periods and timetables" },

  "assignments.read": { module: "Assignments", description: "View assignments (scoped)" },
  "assignments.write": { module: "Assignments", description: "Create assignments and grade submissions" },
  "assignments.submit": { module: "Assignments", description: "Submit assignments" },

  "exams.read": { module: "Examinations", description: "View examinations and schedules" },
  "exams.manage": { module: "Examinations", description: "Create examinations and publish results" },
  "marks.enter": { module: "Examinations", description: "Enter marks for own subjects" },
  "results.read": { module: "Examinations", description: "View results (scoped)" },

  "fees.read": { module: "Fees", description: "View fees (scoped)" },
  "fees.manage": { module: "Fees", description: "Configure fees and record payments" },

  "notices.read": { module: "Communication", description: "View notices" },
  "notices.publish": { module: "Communication", description: "Publish notices (teachers: own sections only)" },
  "notices.manage": { module: "Communication", description: "Edit or delete any notice" },

  "reports.view": { module: "Reports", description: "View and export reports" },
} as const satisfies Record<string, { module: string; description: string }>;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

const ALL = PERMISSION_KEYS;

const SCHOOL_ADMIN: PermissionKey[] = ALL.filter(
  (p) => !["schools.manage", "admins.manage", "roles.manage"].includes(p),
);

/** Default grants written by the seed script. */
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ALL,
  SCHOOL_ADMIN,
  TEACHER: [
    "students.read",
    "teachers.read",
    "parents.read",
    "classes.read",
    "subjects.read",
    "attendance.read",
    "attendance.mark",
    "timetable.read",
    "assignments.read",
    "assignments.write",
    "exams.read",
    "marks.enter",
    "results.read",
    "notices.read",
    "notices.publish",
  ],
  STUDENT: [
    "attendance.read",
    "timetable.read",
    "assignments.read",
    "assignments.submit",
    "exams.read",
    "results.read",
    "fees.read",
    "notices.read",
    "subjects.read",
  ],
  PARENT: [
    "students.read",
    "attendance.read",
    "timetable.read",
    "assignments.read",
    "exams.read",
    "results.read",
    "fees.read",
    "notices.read",
    "subjects.read",
  ],
};

export const ROLE_DESCRIPTIONS: Record<RoleKey, string> = {
  SUPER_ADMIN: "Full control of every school, administrator and system setting.",
  SCHOOL_ADMIN: "Runs day-to-day operations of one school.",
  TEACHER: "Teaches assigned sections: attendance, assignments, marks and announcements.",
  STUDENT: "Views their own timetable, attendance, assignments, results and fees.",
  PARENT: "Follows the progress of their linked children.",
};
