import { describe, expect, it } from "vitest";
import { attendanceRate } from "@/lib/attendance";

describe("attendance rate", () => {
  it("excludes excused days and counts late as present by default", () => {
    expect(attendanceRate({ PRESENT: 8, ABSENT: 1, LATE: 1, EXCUSED: 5 })).toBe(90);
  });
  it("can count late arrivals as absent", () => {
    expect(attendanceRate({ PRESENT: 8, ABSENT: 1, LATE: 1, EXCUSED: 0 }, false)).toBe(80);
  });
  it("returns null with nothing countable", () => {
    expect(attendanceRate({ PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 3 })).toBeNull();
  });
});
