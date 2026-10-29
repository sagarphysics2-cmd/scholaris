# API reference

Scholaris exposes two kinds of server endpoints:

1. **Route handlers** under `/api/*` — for file downloads, CSV exports, polling and jobs.
2. **Server actions** — typed RPC functions invoked by forms (Next.js transports them as
   POST requests with an action id). They are the write API of the application.

All endpoints authenticate with the `scholaris_session` cookie (set at sign-in) unless
noted. Authorization is always enforced on the server in the service layer.

## Conventions

* **Errors (route handlers)** — JSON `{ "error": string, "code": string, "fieldErrors"?: Record<string,string[]> }`
  with status `401` (not signed in), `403` (missing permission), `404` (not found *or not
  visible to you*), `409` (conflict), `422` (validation), `429` (rate limited), `500`.
* **Server action result** — `ActionState`:
  ```ts
  { ok: boolean; message?: string; fieldErrors?: Record<string, string[]>; data?: T; redirectTo?: string; ts: number }
  ```
* **CSV** — UTF-8 with BOM, CRLF line endings, formula-injection safe.

## Route handlers

| Method & path | Auth / permission | Description |
|---|---|---|
| `GET /api/health` | public | Liveness/readiness (checks DB). `200 {status:"ok"}` or `503`. |
| `GET /api/files/:id` | signed in + per-file rule | Streams an uploaded file. Avatars/logos: same school. Assignment attachments: anyone who can see the assignment. Submissions: the student, their parents, staff of that section. Notice attachments: the notice audience. `?download=1` forces download. |
| `GET /api/notifications/unread` | signed in | `{ count }` — unread notifications for the current user (polled by the bell every 60 s). |
| `GET /api/export/students` | `students.write` | CSV of students; accepts the list filters `q, classId, sectionId, status, gender, sort, dir`. |
| `GET /api/export/students/template` | `students.write` | CSV import template. |
| `GET /api/export/teachers` | `teachers.write` | CSV of teachers (`q, status, subjectId`). |
| `GET /api/export/attendance?sectionId&month=YYYY-MM` | `attendance.read` + section access | Monthly register CSV. |
| `GET /api/export/results?examId&sectionId` | `results.read` (staff) | Result sheet CSV. |
| `GET /api/export/fees` | `fees.manage` | Fee list CSV (`q, status, categoryId, classId, sectionId`). |
| `GET /api/reports/:key` | `reports.view` (+ `fees.manage` for finance) | CSV for any report; same filters as the report page (`date, month, from, to, classId, sectionId, examId, status`). Keys: `student-list, daily-attendance, monthly-attendance, student-attendance, exam-results, class-performance, subject-performance, student-performance, paid-fees, pending-fees, overdue-fees, fee-collection-summary`. |
| `GET|POST /api/cron/:job` | `Authorization: Bearer $CRON_SECRET` | Scheduled jobs: `publish-notices` (notify audiences of scheduled notices), `assignment-reminders` (due within 24 h, not submitted), `fee-reminders` (due soon/overdue, max every 3 days per fee), `cleanup` (expired sessions/tokens/rate-limit windows). Returns `{ job, ok, count }`. Disabled when `CRON_SECRET` is empty. |

## Server actions

Grouped by module (file → action). Every action validates with the listed Zod schema
(`src/lib/validation/*`) and then calls the service shown, which performs permission and
row-scope checks.

### Authentication — `src/app/(auth)/actions.ts`
| Action | Input | Service |
|---|---|---|
| `loginAction` | `loginSchema` {email, password, next} | `authenticate` + `createSession` |
| `logoutAction` | — | `destroyCurrentSession` |
| `forgotPasswordAction` | `forgotPasswordSchema` | `requestPasswordReset` (rate limited, no enumeration) |
| `resetPasswordAction` | `resetPasswordSchema` {token, password, confirmPassword} | `completePasswordToken(PASSWORD_RESET)` |
| `acceptInviteAction` | `resetPasswordSchema` | `completePasswordToken(INVITE)` + session |

### Profile — `src/app/(app)/profile/actions.ts`
`updateContactAction`, `uploadAvatarAction`, `removeAvatarAction`, `changePasswordAction`
(`changePasswordSchema`), `revokeSessionAction(sessionId)`, `revokeOthersAction`.

### Students — `src/app/(app)/students/actions.ts` (`students.write`)
`createStudentAction` (`studentSchema` + optional `photo` file), `updateStudentAction(id)`,
`archiveStudentAction(id, archived)`, `deleteStudentAction(id)` (refused with history),
`importStudentsAction` (CSV file ≤ 2 MB → `{created, errors[]}`), `resendInviteAction(userId)`.

### Teachers — `src/app/(app)/teachers/actions.ts`
`createTeacherAction`, `updateTeacherAction(id)` (`teacherSchema`, `teachers.write`),
`archiveTeacherAction(id, archived)`, `assignTeachingAction` (`teachingAssignmentSchema`,
`subjects.write`), `unassignTeachingAction(teacherSubjectId)`.

### Parents — `src/app/(app)/parents/actions.ts` (`parents.write`)
`createParentAction`, `updateParentAction(id)` (`parentSchema`), `linkChildAction`
(`linkChildSchema`), `unlinkChildAction(parentId, studentId)`, `archiveParentAction(id, archived)`.

### Classes, subjects, academic years
* `classes/actions.ts`: `saveClassAction(id?)`, `deleteClassAction`, `saveSectionAction(id?)`,
  `deleteSectionAction`, `setCurriculumAction` (`curriculumSchema`).
* `subjects/actions.ts`: `saveSubjectAction(id?)`, `archiveSubjectAction`, `deleteSubjectAction`.
* `academic-years/actions.ts`: `saveAcademicYearAction(id?)`, `setCurrentYearAction`,
  `deleteYearAction`, `copyStructureAction`.

### Attendance — `attendance/actions.ts`
`saveAttendanceAction` — `attendanceSaveSchema` `{ sectionId, date, records: JSON [{studentId, status, note?}] }`.
Teachers: own sections, within the edit window; admins: any section/date in the year.

### Timetable — `timetable/actions.ts` (`timetable.manage`)
`saveEntryAction` (`timetableEntrySchema`; rejects teacher/room clashes), `deleteEntryAction`,
`savePeriodAction(id?)` (`periodSchema`; rejects overlapping periods), `deletePeriodAction`.

### Assignments — `assignments/actions.ts`
`createAssignmentAction` / `updateAssignmentAction(id)` (`assignmentSchema` + `attachments[]`),
`setAssignmentStatusAction(id, status)`, `deleteAssignmentAction`, `removeAttachmentAction`,
`submitAssignmentAction(id)` (students; `submissionSchema` + `files[]`),
`gradeSubmissionAction(submissionId, assignmentId)` (`gradeSubmissionSchema`, marks ≤ max).

### Examinations — `exams/actions.ts`
`saveExamAction(id?)` (`examSchema`), `deleteExamAction`, `saveExamSubjectAction(examId, paperId?)`
(`examSubjectSchema`; date within exam, curriculum and time-clash checks),
`deleteExamSubjectAction`, `setExamStatusAction(id, status)` (publishing notifies families),
`saveMarksAction` (`marksEntrySchema`; marks ≤ max, audited, locked after publishing for teachers).

### Fees — `fees/actions.ts` (`fees.manage`)
`saveCategoryAction(id?)`, `deleteCategoryAction`, `assignFeesAction` (`assignFeeSchema` —
class / section / students), `updateFeeAction(id)` (`editFeeSchema`), `deleteFeeAction`,
`recordPaymentAction(feeId)` (`paymentSchema`; row-locked, generates receipt).

### Notices & notifications
* `notices/actions.ts`: `createNoticeAction` / `updateNoticeAction(id)` (`noticeSchema` +
  attachments; teachers limited to their classes/sections), `deleteNoticeAction`.
* `notifications/actions.ts`: `markReadAction(id)`, `markAllReadAction`, `clearReadAction`.

### Settings & administration
* `settings/actions.ts` (`settings.manage`): `saveProfileAction` (+logo), `saveGeneralAction`,
  `saveAttendanceAction`, `saveExamAction` (grading scale), `saveFeesAction`,
  `saveNotificationsAction`, `saveRoleAction` (`roles.manage`; Super Admin keeps
  system permissions).
* `admins/actions.ts`: `createAdminAction` (`admins.manage`), `setUserDisabledAction`,
  `saveSchoolAction(id?)` (`schools.manage`).
* `shell-actions.ts`: `switchSchoolAction(schoolId)` (Super Admin school context).

## Permission keys

`schools.manage, admins.manage, roles.manage, settings.manage, audit.view,
students.read, students.write, teachers.read, teachers.write, parents.read, parents.write,
classes.read, classes.write, subjects.read, subjects.write, academic_years.manage,
attendance.read, attendance.mark, attendance.manage, timetable.read, timetable.manage,
assignments.read, assignments.write, assignments.submit, exams.read, exams.manage,
marks.enter, results.read, fees.read, fees.manage, notices.read, notices.publish,
notices.manage, reports.view`

Default grants per role are defined in `src/lib/permissions/catalog.ts` (seed source) and
can be changed at runtime in **Settings → Roles & permissions**.
