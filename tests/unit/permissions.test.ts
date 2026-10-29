import { describe, expect, it } from "vitest";
import { buildNav } from "@/lib/navigation";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSION_KEYS, type PermissionKey } from "@/lib/permissions/catalog";
import { assertCan, can } from "@/server/authz/guards";
import { ForbiddenError } from "@/server/errors";

const actor = (perms: PermissionKey[]) => ({ permissions: new Set(perms) });

describe("default role permissions", () => {
  it("gives Super Admin every permission", () => {
    expect(new Set(DEFAULT_ROLE_PERMISSIONS.SUPER_ADMIN)).toEqual(new Set(PERMISSION_KEYS));
  });

  it("keeps system management away from School Admins", () => {
    for (const p of ["schools.manage", "admins.manage", "roles.manage"] as const) expect(DEFAULT_ROLE_PERMISSIONS.SCHOOL_ADMIN).not.toContain(p);
  });

  it("never lets students or parents write academic or financial records", () => {
    const writes: PermissionKey[] = ["students.write", "marks.enter", "exams.manage", "fees.manage", "attendance.mark", "attendance.manage", "assignments.write", "notices.publish"];
    for (const role of ["STUDENT", "PARENT"] as const) {
      for (const p of writes) expect(DEFAULT_ROLE_PERMISSIONS[role], `${role} must not have ${p}`).not.toContain(p);
    }
  });

  it("does not let teachers see fees or manage exams", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.TEACHER).not.toContain("fees.read");
    expect(DEFAULT_ROLE_PERMISSIONS.TEACHER).not.toContain("exams.manage");
    expect(DEFAULT_ROLE_PERMISSIONS.TEACHER).toContain("marks.enter");
  });
});

describe("guards", () => {
  it("assertCan throws ForbiddenError when a permission is missing", () => {
    expect(() => assertCan(actor(["students.read"]), "students.write")).toThrow(ForbiddenError);
    expect(() => assertCan(actor(["students.read", "students.write"]), "students.write")).not.toThrow();
    expect(can(actor(["fees.read"]), "fees.read", "fees.manage")).toBe(false);
  });
});

describe("navigation", () => {
  it("only shows items the role can access", () => {
    const student = buildNav("STUDENT", new Set(DEFAULT_ROLE_PERMISSIONS.STUDENT)).map((n) => n.href);
    expect(student).toContain("/timetable");
    expect(student).not.toContain("/students");
    expect(student).not.toContain("/settings");
    const parent = buildNav("PARENT", new Set(DEFAULT_ROLE_PERMISSIONS.PARENT));
    expect(parent.find((n) => n.href === "/students")?.label).toBe("My Children");
  });
});
