/**
 * Development / demo seed. Creates realistic but entirely FICTIONAL data:
 *   1 school · 1 super admin · 3 admins · 15 teachers · 100 students · 80 parents
 *   10 sections (Grades 6–10, A/B) · 7 subjects · timetable · ~2 months of attendance
 *   assignments + submissions · 2 examinations (one with published marks) · fees · notices
 *
 * Deterministic (seeded PRNG) so every run yields the same data.
 * Run with: npm run db:seed   (refuses to run when NODE_ENV=production)
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_DESCRIPTIONS, ROLE_KEYS, ROLE_LABELS } from "../src/lib/permissions/catalog";
import { DEFAULT_GRADE_SCALE, gradeFor } from "../src/lib/grading";
import { storedStatus } from "../src/lib/fees";

try {
  process.loadEnvFile();
} catch {
  /* env provided by the shell */
}

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_SEED !== "true") {
  console.error("Refusing to seed demo data in production. Set ALLOW_PRODUCTION_SEED=true to override.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// ── Deterministic random helpers ─────────────────────────────────────────────
let seed = 20262027;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p: number) => rand() < p;
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const addDays = (date: Date, n: number) => new Date(date.getTime() + n * 86400000);
const iso = (date: Date) => date.toISOString().slice(0, 10);

const FIRST_M = ["Aarav", "Liam", "Noah", "Ethan", "Mateo", "Arjun", "Lucas", "Kenji", "Omar", "Daniel", "Samuel", "Leo", "Ivan", "Kofi", "Rafael", "Hugo", "Elias", "Rohan", "Theo", "Felix", "Jonah", "Tariq", "Nikhil", "Marco", "Owen"];
const FIRST_F = ["Ava", "Mia", "Zara", "Isla", "Priya", "Sofia", "Amara", "Leila", "Hana", "Chloe", "Nora", "Ananya", "Elena", "Maya", "Yuki", "Grace", "Aisha", "Lucia", "Freya", "Ines", "Ruby", "Sara", "Diya", "Clara", "Naomi"];
const LAST = ["Patel", "Okafor", "Nakamura", "García", "Rossi", "Müller", "Kowalski", "Haddad", "Silva", "Andersen", "Mensah", "Fernandes", "Novak", "Chen", "Ibrahim", "Larsen", "Dubois", "Sato", "Kapoor", "Moreau", "Romero", "Petrov", "Hughes", "Nyambura", "Costa", "Varga", "Lindqvist", "Ortega", "Bauer", "Quinn", "Takahashi", "Mbeki", "Russo", "Keller", "Ahmed", "Walsh", "Iyer", "Santos", "Becker", "Lopez"];
const STREETS = ["Maple Avenue", "Cedar Lane", "Riverside Drive", "Hillcrest Road", "Oak Street", "Elm Court", "Lakeview Terrace", "Willow Way", "Park Crescent", "Orchard Close"];
const OCCUPATIONS = ["Engineer", "Nurse", "Accountant", "Architect", "Teacher", "Pharmacist", "Designer", "Chef", "Entrepreneur", "Civil servant", "Doctor", "Electrician"];

function phoneNo() {
  return `+1 555 ${between(100, 999)} ${String(between(0, 9999)).padStart(4, "0")}`;
}
function address() {
  return `${between(1, 240)} ${pick(STREETS)}, Brookfield`;
}
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

async function reset() {
  // Truncate everything (dev only) — order handled by CASCADE.
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  const t0 = Date.now();
  console.log("🌱 Seeding Scholaris demo data…");
  await reset();

  const password = process.env.SEED_DEMO_PASSWORD || "Scholaris!2026";
  const passwordHash = await hashPassword(password);
  const TODAY = d(new Date().toISOString().slice(0, 10));

  // ── Roles & permissions ────────────────────────────────────────────────────
  const permissionIds: Record<string, string> = {};
  for (const [key, def] of Object.entries(PERMISSIONS)) {
    const p = await db.permission.create({ data: { key, module: def.module, description: def.description } });
    permissionIds[key] = p.id;
  }
  const roles: Record<string, string> = {};
  for (const key of ROLE_KEYS) {
    const role = await db.role.create({
      data: {
        key,
        name: ROLE_LABELS[key],
        description: ROLE_DESCRIPTIONS[key],
        permissions: { create: DEFAULT_ROLE_PERMISSIONS[key].map((p) => ({ permissionId: permissionIds[p]! })) },
      },
    });
    roles[key] = role.id;
  }

  // ── School ─────────────────────────────────────────────────────────────────
  const school = await db.school.create({
    data: {
      name: "Greenfield International School",
      code: "GIS",
      address: "1200 Learning Way, Brookfield, BF 40021",
      phone: "+1 555 010 2026",
      email: "office@greenfield.example",
      website: "https://greenfield.example",
      settings: {
        currency: "USD",
        locale: "en-US",
        timezone: "UTC",
        schoolDays: [1, 2, 3, 4, 5],
        attendance: { lowAttendanceThreshold: 75, lateCountsAsPresent: true, teacherEditWindowDays: 7, notifyParentsOnAbsence: true },
        exams: { overallPassPercent: 40 },
        fees: { receiptPrefix: "GIS", reminderDaysBeforeDue: 7, showFeesToStudents: true },
        notifications: { email: {} },
      },
      gradeScales: { create: DEFAULT_GRADE_SCALE.map((g) => ({ grade: g.grade, minPercent: g.minPercent, gradePoint: g.gradePoint, remark: g.remark })) },
    },
  });
  const S = school.id;

  // A second, smaller school so the super admin school switcher has something to show.
  await db.school.create({
    data: { name: "Lakeside Primary Academy", code: "LPA", address: "45 Shore Road, Brookfield", phone: "+1 555 010 4545", email: "hello@lakeside.example", settings: {} },
  });

  const previousYear = await db.academicYear.create({
    data: { schoolId: S, name: "2025–2026", startDate: d("2025-08-01"), endDate: d("2026-06-30"), isCurrent: false },
  });
  const year = await db.academicYear.create({
    data: { schoolId: S, name: "2026–2027", startDate: d("2026-08-01"), endDate: d("2027-06-30"), isCurrent: true },
  });
  void previousYear;

  // ── Periods (bell schedule) ───────────────────────────────────────────────
  const periodDefs: Array<[string, string, string, boolean]> = [
    ["Period 1", "08:00", "08:45", false],
    ["Period 2", "08:50", "09:35", false],
    ["Morning Break", "09:35", "09:55", true],
    ["Period 3", "09:55", "10:40", false],
    ["Period 4", "10:45", "11:30", false],
    ["Lunch", "11:30", "12:15", true],
    ["Period 5", "12:15", "13:00", false],
    ["Period 6", "13:05", "13:50", false],
  ];
  const periods = [];
  for (const [i, [name, startTime, endTime, isBreak]] of periodDefs.entries()) {
    periods.push(await db.period.create({ data: { schoolId: S, name, startTime, endTime, isBreak, sortOrder: i + 1 } }));
  }
  const teachingPeriods = periods.filter((p) => !p.isBreak);

  // ── Users: super admin & admins ───────────────────────────────────────────
  await db.user.create({
    data: { email: "superadmin@scholaris.example", passwordHash, firstName: "Morgan", lastName: "Reyes", status: "ACTIVE", roleId: roles.SUPER_ADMIN!, phone: phoneNo() },
  });
  const adminNames: Array<[string, string, string]> = [
    ["admin@greenfield.example", "Helena", "Varga"],
    ["registrar@greenfield.example", "Tomas", "Lindqvist"],
    ["accounts@greenfield.example", "Adaeze", "Okafor"],
  ];
  const admins = [];
  for (const [email, firstName, lastName] of adminNames) {
    admins.push(await db.user.create({ data: { email, passwordHash, firstName, lastName, status: "ACTIVE", roleId: roles.SCHOOL_ADMIN!, schoolId: S, phone: phoneNo() } }));
  }

  // ── Subjects ───────────────────────────────────────────────────────────────
  const subjectDefs: Array<[string, string, string]> = [
    ["Mathematics", "MATH", "Number, algebra, geometry and data handling."],
    ["Science", "SCI", "Physics, chemistry and biology through inquiry."],
    ["English", "ENG", "Reading, writing, speaking and literature."],
    ["Social Studies", "SST", "History, geography and civics."],
    ["Computer Science", "CS", "Programming, digital literacy and problem solving."],
    ["Art & Design", "ART", "Visual arts and creative design."],
    ["Physical Education", "PE", "Fitness, sport and wellbeing."],
  ];
  const subjects: Record<string, { id: string; name: string }> = {};
  for (const [name, code, description] of subjectDefs) {
    subjects[code] = await db.subject.create({ data: { schoolId: S, name, code, description } });
  }

  // ── Teachers (15) ─────────────────────────────────────────────────────────
  const teacherPlan: Array<[string, string, string, string]> = [
    // email override, specialization code, gender, qualification
    ["teacher@greenfield.example", "MATH", "F", "M.Sc. Mathematics, B.Ed."],
    ["", "MATH", "M", "B.Sc. Mathematics, PGCE"],
    ["", "MATH", "F", "M.Ed. Mathematics Education"],
    ["", "SCI", "M", "M.Sc. Physics, B.Ed."],
    ["", "SCI", "F", "M.Sc. Chemistry"],
    ["", "SCI", "F", "B.Sc. Biology, PGCE"],
    ["", "ENG", "F", "M.A. English Literature"],
    ["", "ENG", "M", "B.A. English, CELTA"],
    ["", "ENG", "F", "M.A. Linguistics"],
    ["", "SST", "M", "M.A. History"],
    ["", "SST", "F", "M.A. Geography, B.Ed."],
    ["", "CS", "M", "B.Tech Computer Science"],
    ["", "CS", "F", "M.Sc. Computer Science"],
    ["", "ART", "F", "B.F.A. Fine Arts"],
    ["", "PE", "M", "B.P.Ed. Physical Education"],
  ];
  const usedEmails = new Set<string>();
  const uniqueEmail = (first: string, last: string, domain = "greenfield.example") => {
    const base = `${slug(first)}.${slug(last)}`;
    let e = `${base}@${domain}`;
    let n = 2;
    while (usedEmails.has(e)) e = `${base}${n++}@${domain}`;
    usedEmails.add(e);
    return e;
  };
  const teachers: Array<{ id: string; userId: string; spec: string; name: string }> = [];
  for (const [i, [emailOverride, spec, g, qualification]] of teacherPlan.entries()) {
    const firstName = i === 0 ? "Priya" : g === "F" ? pick(FIRST_F) : pick(FIRST_M);
    const lastName = i === 0 ? "Sharma" : pick(LAST);
    const email = emailOverride || uniqueEmail(firstName, lastName);
    usedEmails.add(email);
    const user = await db.user.create({
      data: { email, passwordHash, firstName, lastName, phone: phoneNo(), status: "ACTIVE", roleId: roles.TEACHER!, schoolId: S },
    });
    const teacher = await db.teacher.create({
      data: {
        userId: user.id,
        schoolId: S,
        employeeId: `EMP-${String(1001 + i)}`,
        gender: g === "F" ? "FEMALE" : "MALE",
        address: address(),
        qualification,
        specialization: subjects[spec]!.name,
        joiningDate: d(`20${between(12, 24)}-0${between(1, 8)}-${String(between(1, 28)).padStart(2, "0")}`),
      },
    });
    teachers.push({ id: teacher.id, userId: user.id, spec, name: `${firstName} ${lastName}` });
  }

  // ── Classes, sections, curriculum ─────────────────────────────────────────
  const sections: Array<{ id: string; classId: string; level: number; name: string; label: string }> = [];
  const classIds: Record<number, string> = {};
  const classTeacherOrder = [0, 3, 6, 9, 11, 1, 4, 7, 10, 12];
  let ctIdx = 0;
  for (const level of [6, 7, 8, 9, 10]) {
    const cls = await db.class.create({ data: { schoolId: S, name: `Grade ${level}`, level } });
    classIds[level] = cls.id;
    const codes = level <= 8 ? ["MATH", "SCI", "ENG", "SST", "CS", "ART", "PE"] : ["MATH", "SCI", "ENG", "SST", "CS", "PE"];
    for (const code of codes) {
      await db.classSubject.create({ data: { classId: cls.id, subjectId: subjects[code]!.id, academicYearId: year.id } });
    }
    for (const name of ["A", "B"]) {
      const section = await db.section.create({
        data: {
          classId: cls.id,
          academicYearId: year.id,
          name,
          room: `${level}${name === "A" ? "01" : "02"}`,
          capacity: 30,
          classTeacherId: teachers[classTeacherOrder[ctIdx++]!]!.id,
        },
      });
      sections.push({ id: section.id, classId: cls.id, level, name, label: `Grade ${level}-${name}` });
    }
  }

  // Teaching assignments: rotate subject specialists across sections.
  const teacherFor: Record<string, string> = {}; // `${sectionId}:${subjectCode}` → teacherId
  const specialistCounters: Record<string, number> = {};
  for (const section of sections) {
    const codes = section.level <= 8 ? ["MATH", "SCI", "ENG", "SST", "CS", "ART", "PE"] : ["MATH", "SCI", "ENG", "SST", "CS", "PE"];
    for (const code of codes) {
      const specialists = teachers.filter((t) => t.spec === code);
      const idx = (specialistCounters[code] = (specialistCounters[code] ?? -1) + 1);
      const teacher = specialists[idx % specialists.length]!;
      teacherFor[`${section.id}:${code}`] = teacher.id;
      await db.teacherSubject.create({ data: { teacherId: teacher.id, subjectId: subjects[code]!.id, sectionId: section.id } });
    }
  }

  // ── Timetable: greedy conflict-free schedule ─────────────────────────────
  const weeklyLoad: Record<string, number> = { MATH: 6, SCI: 6, ENG: 5, SST: 4, CS: 3, ART: 3, PE: 3 };
  const busy = new Set<string>(); // `${teacherId}:${day}:${periodId}`
  let timetableCount = 0;
  for (const section of sections) {
    const codes = Object.keys(weeklyLoad).filter((c) => teacherFor[`${section.id}:${c}`]);
    const remaining: Record<string, number> = Object.fromEntries(codes.map((c) => [c, weeklyLoad[c]!]));
    for (let day = 1; day <= 5; day++) {
      const usedToday = new Map<string, number>();
      for (const period of teachingPeriods) {
        // Prefer subjects with most remaining lessons, max 2 per day, teacher free.
        const candidates = codes
          .filter((c) => remaining[c]! > 0 && (usedToday.get(c) ?? 0) < 2)
          .filter((c) => !busy.has(`${teacherFor[`${section.id}:${c}`]}:${day}:${period.id}`))
          .sort((a, b) => remaining[b]! - remaining[a]! || rand() - 0.5);
        const code = candidates[0] ?? codes.find((c) => !busy.has(`${teacherFor[`${section.id}:${c}`]}:${day}:${period.id}`) && (usedToday.get(c) ?? 0) < 2);
        if (!code) continue; // free period
        const teacherId = teacherFor[`${section.id}:${code}`]!;
        busy.add(`${teacherId}:${day}:${period.id}`);
        remaining[code] = (remaining[code] ?? 0) - 1;
        usedToday.set(code, (usedToday.get(code) ?? 0) + 1);
        await db.timetableEntry.create({
          data: {
            academicYearId: year.id,
            sectionId: section.id,
            dayOfWeek: day,
            periodId: period.id,
            subjectId: subjects[code]!.id,
            teacherId,
            room: code === "PE" ? "Sports Hall" : code === "CS" ? "Computer Lab" : code === "SCI" && chance(0.4) ? "Science Lab" : `Room ${section.level}${section.name === "A" ? "01" : "02"}`,
          },
        });
        timetableCount++;
      }
    }
  }

  // ── Parents (80) & students (100) ─────────────────────────────────────────
  // 20 families with two children (siblings) + 60 families with one child = 100 students.
  const familyPlan = [...Array(20).fill(2), ...Array(60).fill(1)] as number[];
  const studentRecords: Array<{ id: string; userId: string; sectionId: string; level: number; parentUserIds: string[]; name: string }> = [];
  const sectionFill: Record<string, number> = Object.fromEntries(sections.map((s) => [s.id, 0]));
  let studentSeq = 0;

  for (const [f, kids] of familyPlan.entries()) {
    const lastName = pick(LAST);
    const parentGender = chance(0.55) ? "F" : "M";
    const parentFirst = f === 0 ? "Daniel" : parentGender === "F" ? pick(FIRST_F) : pick(FIRST_M);
    const parentLast = f === 0 ? "Okafor" : lastName;
    const famAddress = address();
    const parentEmail = f === 0 ? "parent@greenfield.example" : uniqueEmail(parentFirst, parentLast, "mail.example");
    const parentUser = await db.user.create({
      data: { email: parentEmail, passwordHash, firstName: parentFirst, lastName: parentLast, phone: phoneNo(), status: "ACTIVE", roleId: roles.PARENT!, schoolId: S },
    });
    const parent = await db.parent.create({ data: { userId: parentUser.id, schoolId: S, address: famAddress, occupation: pick(OCCUPATIONS) } });

    for (let k = 0; k < kids; k++) {
      studentSeq++;
      // Fill sections evenly: 10 per section.
      const section = sections.find((s) => sectionFill[s.id]! < 10 && (kids === 1 || k === 0 || true))!;
      const roll = ++sectionFill[section.id]!;
      const gender = studentSeq === 1 ? "FEMALE" : studentSeq === 2 ? "MALE" : chance(0.5) ? "FEMALE" : "MALE";
      const firstName = studentSeq === 1 ? "Amara" : studentSeq === 2 ? "Kofi" : gender === "FEMALE" ? pick(FIRST_F) : pick(FIRST_M);
      const sLast = f === 0 ? "Okafor" : lastName;
      const birthYear = 2026 - section.level - 6;
      const hasEmail = studentSeq === 1 || section.level >= 8 || chance(0.5);
      const email = studentSeq === 1 ? "student@greenfield.example" : hasEmail ? uniqueEmail(firstName, sLast, "students.greenfield.example") : null;
      const user = await db.user.create({
        data: {
          email,
          passwordHash: email ? passwordHash : null,
          firstName,
          lastName: sLast,
          phone: section.level >= 9 && chance(0.5) ? phoneNo() : null,
          status: "ACTIVE",
          roleId: roles.STUDENT!,
          schoolId: S,
        },
      });
      const student = await db.student.create({
        data: {
          userId: user.id,
          schoolId: S,
          studentCode: `STU-2026-${String(studentSeq).padStart(4, "0")}`,
          admissionNumber: `GIS/${2026 - between(0, section.level - 5)}/${String(400 + studentSeq).padStart(4, "0")}`,
          dateOfBirth: d(`${birthYear}-${String(between(1, 12)).padStart(2, "0")}-${String(between(1, 28)).padStart(2, "0")}`),
          gender,
          address: famAddress,
          emergencyContactName: `${parentFirst} ${parentLast}`,
          emergencyContactPhone: phoneNo(),
          admissionDate: d(`${2026 - between(0, Math.max(0, section.level - 6))}-04-${String(between(1, 28)).padStart(2, "0")}`),
          bloodGroup: pick(["A+", "B+", "O+", "AB+", "A-", "O-"]),
          status: "ACTIVE",
          notes: chance(0.08) ? pick(["Mild peanut allergy — EpiPen in nurse's office.", "Wears glasses; prefers front-row seating.", "Joined mid-year from another school.", "Asthma — inhaler permitted in class."]) : null,
        },
      });
      await db.parentStudent.create({ data: { parentId: parent.id, studentId: student.id, relationship: parentGender === "F" ? "MOTHER" : "FATHER", isPrimary: true } });
      await db.enrollment.create({ data: { studentId: student.id, sectionId: section.id, academicYearId: year.id, rollNumber: roll } });
      studentRecords.push({ id: student.id, userId: user.id, sectionId: section.id, level: section.level, parentUserIds: [parentUser.id], name: `${firstName} ${sLast}` });
    }
  }

  // ── Attendance: school days from 1 Sep until yesterday ───────────────────
  const absenceProne = new Set(studentRecords.filter(() => chance(0.07)).map((s) => s.id));
  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  const holidays = new Set(["2026-09-07", "2026-10-12"]);
  for (let day = d("2026-09-01"); day < TODAY; day = addDays(day, 1)) {
    const wd = day.getUTCDay();
    if (wd === 0 || wd === 6 || holidays.has(iso(day))) continue;
    for (const s of studentRecords) {
      const section = sections.find((x) => x.id === s.sectionId)!;
      const r = rand();
      const absentP = absenceProne.has(s.id) ? 0.22 : 0.035;
      const status = r < absentP ? "ABSENT" : r < absentP + 0.04 ? "LATE" : r < absentP + 0.05 ? "EXCUSED" : "PRESENT";
      attendanceRows.push({
        id: `att_${s.id}_${iso(day)}`,
        studentId: s.id,
        sectionId: s.sectionId,
        date: day,
        status,
        markedById: teachers.find((t) => t.id === (sections.find((x) => x.id === section.id) && teacherFor[`${section.id}:MATH`]))?.userId ?? null,
      });
    }
  }
  for (let i = 0; i < attendanceRows.length; i += 2000) {
    await db.attendance.createMany({ data: attendanceRows.slice(i, i + 2000) });
  }
  const noteTargets = attendanceRows.filter((a) => a.status !== "PRESENT").slice(0, 40);
  for (const a of noteTargets) {
    await db.attendanceNote.create({
      data: {
        attendanceId: a.id!,
        note: a.status === "LATE" ? pick(["Bus delayed", "Arrived 15 minutes late", "Medical appointment in the morning"]) : a.status === "EXCUSED" ? "Parent informed in advance" : pick(["No reason given", "Unwell — parent called", "Family emergency"]),
      },
    });
  }

  // ── Assignments & submissions ─────────────────────────────────────────────
  const assignmentTemplates: Record<string, string[]> = {
    MATH: ["Linear equations practice set", "Geometry: angles in polygons", "Data handling project"],
    SCI: ["Lab report: states of matter", "Research: renewable energy sources", "Food chains poster"],
    ENG: ["Persuasive essay: school uniforms", "Book review: a novel of your choice", "Poetry analysis"],
    SST: ["Map work: rivers of the world", "Timeline of the industrial revolution", "Local government case study"],
    CS: ["Scratch game: maze runner", "Python: temperature converter", "Spreadsheet budgeting task"],
  };
  let assignmentCount = 0;
  let submissionCount = 0;
  for (const section of sections) {
    const codes = Object.keys(assignmentTemplates);
    for (let a = 0; a < 4; a++) {
      const code = codes[(a + section.level) % codes.length]!;
      const title = assignmentTemplates[code]![a % 3]!;
      const due = a === 0 ? addDays(TODAY, -18) : a === 1 ? addDays(TODAY, -4) : a === 2 ? addDays(TODAY, 3) : addDays(TODAY, 10);
      due.setUTCHours(17, 0, 0, 0);
      const teacherId = teacherFor[`${section.id}:${code}`]!;
      const assignment = await db.assignment.create({
        data: {
          schoolId: S,
          title,
          description: `Complete the ${title.toLowerCase()} as discussed in class. Show your working clearly and submit before the deadline. Late submissions are accepted but marked as late.`,
          subjectId: subjects[code]!.id,
          sectionId: section.id,
          teacherId,
          dueDate: due,
          maxMarks: pick([10, 20, 25, 50]),
          status: "PUBLISHED",
          createdAt: addDays(due, -10),
        },
      });
      assignmentCount++;
      if (a <= 2) {
        for (const s of studentRecords.filter((x) => x.sectionId === section.id)) {
          if (chance(a === 2 ? 0.35 : 0.85)) {
            const submittedAt = addDays(due, a === 2 ? -1 : chance(0.15) ? 1 : -between(1, 3));
            const late = submittedAt > due;
            const graded = a === 0 && chance(0.9);
            await db.assignmentSubmission.create({
              data: {
                assignmentId: assignment.id,
                studentId: s.id,
                content: "Please find my work attached below. I found the second part challenging but interesting.",
                submittedAt,
                status: graded ? "GRADED" : late ? "LATE" : "SUBMITTED",
                marks: graded ? Math.round(assignment.maxMarks * (0.55 + rand() * 0.45)) : null,
                feedback: graded ? pick(["Well done — clear working.", "Good effort; review question 3.", "Excellent presentation!", "Please show more steps next time."]) : null,
                gradedAt: graded ? addDays(due, 2) : null,
                gradedById: graded ? teachers.find((t) => t.id === teacherId)!.userId : null,
              },
            });
            submissionCount++;
          }
        }
      }
    }
  }

  // ── Examinations ───────────────────────────────────────────────────────────
  const firstTerm = await db.examination.create({
    data: {
      schoolId: S,
      academicYearId: year.id,
      name: "First Term Examination",
      term: "Term 1",
      description: "Written examinations covering the first half of Term 1.",
      startDate: d("2026-09-21"),
      endDate: d("2026-09-25"),
      status: "PUBLISHED",
      resultsPublishedAt: d("2026-10-05"),
    },
  });
  const midTerm = await db.examination.create({
    data: {
      schoolId: S,
      academicYearId: year.id,
      name: "Mid-Term Examination",
      term: "Term 1",
      description: "Mid-term assessment of all core subjects.",
      startDate: addDays(TODAY, 18),
      endDate: addDays(TODAY, 24),
      status: "SCHEDULED",
    },
  });
  const coreCodes = ["MATH", "SCI", "ENG", "SST", "CS"];
  const ability: Record<string, number> = Object.fromEntries(studentRecords.map((s) => [s.id, 0.45 + rand() * 0.5]));
  let markCount = 0;
  for (const level of [6, 7, 8, 9, 10]) {
    for (const [i, code] of coreCodes.entries()) {
      const es = await db.examSubject.create({
        data: { examinationId: firstTerm.id, classId: classIds[level]!, subjectId: subjects[code]!.id, examDate: addDays(d("2026-09-21"), i), startTime: "09:00", endTime: "11:00", maxMarks: 100, passingMarks: 35, room: "Exam Hall" },
      });
      await db.examSubject.create({
        data: { examinationId: midTerm.id, classId: classIds[level]!, subjectId: subjects[code]!.id, examDate: addDays(midTerm.startDate, i + (i >= 3 ? 2 : 0) > 6 ? 6 : i), startTime: "09:00", endTime: "11:30", maxMarks: 100, passingMarks: 35, room: "Exam Hall" },
      });
      for (const s of studentRecords.filter((x) => x.level === level)) {
        const absent = chance(0.015);
        const raw = absent ? null : Math.max(8, Math.min(100, Math.round(ability[s.id]! * 100 + (rand() - 0.5) * 30)));
        const section = sections.find((x) => x.id === s.sectionId)!;
        await db.mark.create({
          data: {
            examSubjectId: es.id,
            studentId: s.id,
            marksObtained: raw,
            isAbsent: absent,
            grade: raw === null ? "AB" : gradeFor(raw, DEFAULT_GRADE_SCALE),
            remarks: raw !== null && raw >= 90 ? "Outstanding performance" : raw !== null && raw < 35 ? "Requires remedial support" : null,
            enteredById: teachers.find((t) => t.id === teacherFor[`${section.id}:${code}`])!.userId,
          },
        });
        markCount++;
      }
    }
  }

  // ── Fees ───────────────────────────────────────────────────────────────────
  const cat = {
    tuition: await db.feeCategory.create({ data: { schoolId: S, name: "Tuition Fee", type: "TUITION", description: "Termly tuition", defaultAmount: 1800 } }),
    transport: await db.feeCategory.create({ data: { schoolId: S, name: "Transport Fee", type: "TRANSPORT", description: "School bus service", defaultAmount: 350 } }),
    exam: await db.feeCategory.create({ data: { schoolId: S, name: "Examination Fee", type: "EXAMINATION", description: "Annual examination fee", defaultAmount: 120 } }),
    library: await db.feeCategory.create({ data: { schoolId: S, name: "Library & Activity Fee", type: "ACTIVITY", description: "Library, clubs and activities", defaultAmount: 90 } }),
  };
  let receiptSeq = 0;
  let feeCount = 0;
  const accountant = admins[2]!;
  async function createFee(studentId: string, category: { id: string }, title: string, amount: number, dueDate: Date, payRatio: number, discount = 0) {
    const net = amount - discount;
    const paidTotal = Math.round(net * payRatio * 100) / 100;
    const fee = await db.fee.create({
      data: {
        schoolId: S,
        studentId,
        categoryId: category.id,
        academicYearId: year.id,
        title,
        amount,
        discount,
        amountPaid: paidTotal,
        dueDate,
        status: storedStatus({ amount, discount, amountPaid: paidTotal }),
      },
    });
    feeCount++;
    if (paidTotal > 0) {
      const parts = payRatio < 1 || chance(0.2) ? [paidTotal] : [paidTotal];
      for (const part of parts) {
        await db.feePayment.create({
          data: {
            feeId: fee.id,
            receiptNumber: `GIS-${String(++receiptSeq).padStart(6, "0")}`,
            amount: part,
            method: pick(["CASH", "CARD", "BANK_TRANSFER", "BANK_TRANSFER", "ONLINE"]),
            reference: chance(0.6) ? `TXN${between(100000, 999999)}` : null,
            paidAt: new Date(Math.min(addDays(dueDate, -between(0, 12)).getTime(), addDays(TODAY, -between(1, 20)).getTime())),
            receivedById: accountant.id,
          },
        });
      }
    }
  }
  for (const [i, s] of studentRecords.entries()) {
    const scholarship = i % 17 === 0 ? 450 : 0;
    const r = rand();
    await createFee(s.id, cat.tuition, "Tuition Fee — Term 1", 1800, d("2026-08-20"), r < 0.78 ? 1 : r < 0.9 ? 0.5 : 0, scholarship);
    await createFee(s.id, cat.exam, "Examination Fee 2026–2027", 120, d("2026-09-10"), chance(0.85) ? 1 : 0);
    if (i % 5 < 2) await createFee(s.id, cat.transport, "Transport Fee — Term 1", 350, d("2026-08-20"), chance(0.8) ? 1 : 0.5);
    await createFee(s.id, cat.library, "Library & Activity Fee", 90, addDays(TODAY, 5), chance(0.3) ? 1 : 0);
    await createFee(s.id, cat.tuition, "Tuition Fee — Term 2", 1800, d("2026-12-15"), chance(0.12) ? 1 : 0, scholarship);
  }

  // ── Notices ───────────────────────────────────────────────────────────────
  const helena = admins[0]!;
  const notices = [
    { title: "Mid-Term Examination timetable released", message: `The Mid-Term Examination will begin on ${iso(midTerm.startDate)}. Detailed schedules are available under Examinations. Students should arrive by 8:40 AM with their ID cards and stationery.`, audience: "SCHOOL" as const, days: -2, pinned: true },
    { title: "Parent–Teacher Conference", message: "Parent–teacher conferences will be held on Saturday from 9:00 AM to 1:00 PM. Please book a slot with your child's class teacher.", audience: "PARENTS" as const, days: -5, pinned: false },
    { title: "Staff meeting — curriculum review", message: "All teaching staff are requested to attend the curriculum review meeting in the conference room on Friday at 2:30 PM.", audience: "TEACHERS" as const, days: -1, pinned: false },
    { title: "Inter-house Science Fair", message: "Registrations for the Science Fair are open! Teams of up to three students may register with their science teacher by the end of the month.", audience: "STUDENTS" as const, days: -7, pinned: false },
    { title: "Autumn break", message: "The school will remain closed for the autumn break next Monday and Tuesday. Classes resume on Wednesday.", audience: "SCHOOL" as const, days: -10, pinned: false },
    { title: "Term 2 tuition fees", message: "Term 2 tuition fees are due by 15 December. Payments can be made at the accounts office or by bank transfer. Contact accounts@greenfield.example for queries.", audience: "PARENTS" as const, days: -3, pinned: false },
  ];
  for (const n of notices) {
    await db.notice.create({
      data: { schoolId: S, title: n.title, message: n.message, audience: n.audience, publishDate: addDays(TODAY, n.days), expiryDate: addDays(TODAY, 45), isPinned: n.pinned, authorId: helena.id, notifiedAt: new Date() },
    });
  }
  const g10a = sections.find((s) => s.label === "Grade 10-A")!;
  await db.notice.create({
    data: {
      schoolId: S,
      title: "Grade 10-A: Mathematics extra class",
      message: "There will be an extra Mathematics revision class on Thursday after school (2:00–3:00 PM) in Room 1001.",
      audience: "SECTION",
      sectionId: g10a.id,
      publishDate: addDays(TODAY, -1),
      expiryDate: addDays(TODAY, 14),
      authorId: teachers[0]!.userId,
      notifiedAt: new Date(),
    },
  });
  await db.notice.create({
    data: {
      schoolId: S,
      title: "Grade 8 field trip to the Natural History Museum",
      message: "Grade 8 will visit the Natural History Museum next Friday. Signed consent forms must be returned to class teachers by Wednesday.",
      audience: "CLASS",
      classId: classIds[8]!,
      publishDate: addDays(TODAY, -4),
      authorId: helena.id,
      notifiedAt: new Date(),
    },
  });

  // ── Notifications (sample) ────────────────────────────────────────────────
  const notifs: Prisma.NotificationCreateManyInput[] = [];
  for (const s of studentRecords) {
    notifs.push({ userId: s.userId, type: "RESULT_PUBLISHED", title: "Results published", body: "Your First Term Examination results are now available.", link: "/results", createdAt: d("2026-10-05"), readAt: chance(0.6) ? d("2026-10-06") : null });
    for (const p of s.parentUserIds) {
      notifs.push({ userId: p, type: "RESULT_PUBLISHED", title: "Results published", body: `First Term Examination results for ${s.name} are available.`, link: "/results", createdAt: d("2026-10-05"), readAt: null });
    }
  }
  for (const t of teachers) {
    notifs.push({ userId: t.userId, type: "NOTICE", title: "New notice: Staff meeting", body: "Staff meeting — curriculum review on Friday at 2:30 PM.", link: "/notices", createdAt: addDays(TODAY, -1) });
  }
  await db.notification.createMany({ data: notifs });

  // ── Audit log entries for the seed itself ─────────────────────────────────
  await db.auditLog.create({ data: { schoolId: S, action: "system.seed", entity: "School", entityId: S, metadata: { students: studentRecords.length, teachers: teachers.length } } });

  console.log(`✅ Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.table({
    schools: 2,
    admins: admins.length,
    teachers: teachers.length,
    students: studentRecords.length,
    parents: familyPlan.length,
    sections: sections.length,
    timetableEntries: timetableCount,
    attendance: attendanceRows.length,
    assignments: assignmentCount,
    submissions: submissionCount,
    marks: markCount,
    fees: feeCount,
    payments: receiptSeq,
  });
  console.log("\nDemo accounts (password from SEED_DEMO_PASSWORD):");
  console.log("  Super Admin  superadmin@scholaris.example");
  console.log("  School Admin admin@greenfield.example");
  console.log("  Teacher      teacher@greenfield.example");
  console.log("  Student      student@greenfield.example");
  console.log("  Parent       parent@greenfield.example");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
