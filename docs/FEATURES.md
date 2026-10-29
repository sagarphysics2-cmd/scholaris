# Features, limitations & roadmap

## Completed features

### Platform
- [x] Email/password authentication, sessions (DB-backed, hashed tokens, sliding expiry)
- [x] Invitations, forgot/reset password, change password, per-device session revocation
- [x] Account lockout (5 failures → 15 min), DB-backed rate limiting (per IP & per email)
- [x] 5 roles × 33 permissions stored in the database, editable by Super Admins
- [x] Row-level authorization (teacher sections, parent children, own records) on every query
- [x] Multi-school support with a Super Admin school switcher
- [x] Audit log of logins, CRUD on sensitive records, marks/attendance/fee changes (before→after), permission changes, exports
- [x] Object storage abstraction (local / S3-compatible), validated uploads, authorised downloads
- [x] In-app notifications with live unread count; channel layer with email support (per-event toggles)
- [x] Scheduled jobs: notice publishing, assignment-due and fee reminders, cleanup
- [x] Global permission-aware search
- [x] Light/dark theme, responsive layout (sidebar, drawer, bottom nav, card tables), PWA with offline page
- [x] Accessible forms (labels, `aria-invalid`, error association, focus management), skip link, reduced-motion support
- [x] 404, 403, error boundary, global error, offline pages; safe error messages

### Modules
- [x] Role-specific dashboards (admin, teacher, student, parent) with charts
- [x] Students: CRUD, archive/restore, safe delete, search/filter/sort/paginate, CSV import & export, profile tabs, printable report, photo, invitations
- [x] Teachers: CRUD, archive (releases assignments), subject/section assignment, export
- [x] Parents: CRUD, multiple children, relationships, primary contact
- [x] Academic years (current year, copy structure), classes, sections (capacity, room, class teacher), curriculum, subjects
- [x] Attendance: roll call with notes, edit window, duplicates impossible, absence alerts, analytics, monthly register + CSV, student history
- [x] Timetable: bell schedule, grid editor, teacher/room/section clash prevention, section/teacher/student/parent views
- [x] Assignments: attachments, draft/publish/close, submissions with files, late flag, grading/feedback, missing tracking
- [x] Examinations: schedule, papers, time-clash checks, marks entry with validation, grades, publish/unpublish (locks marks), results, ranks, averages, report cards
- [x] Fees: categories, bulk billing, discounts, payments (row-locked), receipts, overdue logic, analytics, reminders, export
- [x] Notices: audiences, scheduling, expiry, pinning, attachments, teacher class announcements
- [x] Reports: 12 reports (students, attendance ×3, academic ×4, finance ×4), print + CSV
- [x] Settings: school profile/logo, currency, time zone, school days, grading scale, pass rules, attendance/fee/notification settings, roles & permissions, administrators, schools

### Quality
- [x] TypeScript strict, ESLint (Next.js + React hooks rules) clean
- [x] 87 unit + integration tests against PostgreSQL (auth, permissions, CRUD, attendance, marks, assignments, files, fees incl. concurrency, notices, DB constraints)
- [x] Playwright E2E on desktop and mobile (auth, authorization, URL tampering, flows, responsive)
- [x] Production build, Dockerfile, docker-compose, Vercel config with crons, GitHub Actions CI

## Known limitations

1. **Time zone** — calendar "today" (attendance date, overdue fees, due-soon reminders) is
   computed in UTC/server time. Run the server with `TZ` set to the school's zone. The
   per-school `timezone` setting is stored and validated but not yet applied to date math,
   so multi-school deployments across time zones need care.
2. **Payments** — payments are recorded manually by staff. The `PaymentProvider` interface
   (`src/server/payments`) is ready for a gateway, but no gateway is integrated.
3. **Email/push** — email requires SMTP; push notifications are not implemented (the
   notification channel interface is ready).
4. **PDFs** — report cards, receipts and reports are print-optimised pages; PDF files are
   produced with the browser's "Save as PDF" rather than server-side rendering.
5. **Import formats** — CSV only (no XLSX) and students only (teachers/parents are added
   individually).
6. **Timetable** — manual editing with clash detection; no automatic timetable generation.
   Substitutions/cover lessons are not modelled.
7. **Grading** — one overall grading scale per school; no weighted terms/continuous
   assessment or GPA transcripts across years.
8. **Promotion** — moving students to the next academic year is done by copying the
   structure and re-enrolling (edit/import); there is no one-click bulk promotion yet.
9. **Uploads on serverless** — platform request-size limits may be lower than
   `MAX_UPLOAD_MB` (see the deployment guide).
10. **Offline** — the PWA shows an offline page; it does not provide offline data entry
    (by design, to avoid leaving private data cached on shared devices).
11. **Localisation** — UI is English only; currency and number formatting follow settings.

## Future improvements

- Native iOS/Android apps using the existing service layer via a versioned JSON API
- Online fee payments (Stripe / Razorpay / PayPal) with webhooks and reconciliation
- Web push and SMS notifications; parent–teacher messaging
- Per-school time-zone aware date handling throughout
- One-click year-end promotion and graduation workflows
- Weighted gradebooks, continuous assessment, transcripts, GPA
- Automatic timetable generation and substitution management
- Single sign-on (Google Workspace / Microsoft 365) and optional 2FA (TOTP)
- XLSX import/export, bulk teacher/parent import
- Server-side PDF generation and bulk report-card printing
- Library, transport, hostel, inventory and HR/payroll modules
- Multi-language UI (i18n) and RTL support
- Data retention policies and GDPR/FERPA export tooling
