# Scholaris — School Management System

A production-ready, responsive school management platform (web + installable PWA) for
**Super Admins, School Admins, Teachers, Students and Parents**. Built with Next.js 16,
React 19, TypeScript, Tailwind CSS 4, PostgreSQL and Prisma 7.

Everything is real: authentication, database-driven role permissions, row-level access
rules, validated CRUD, attendance, timetables, assignments with file uploads, exams and
report cards, fees and receipts, notices, notifications, reports, search, audit logging
and a full test-suite.

---

## Contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Quick start (local development)](#quick-start-local-development)
4. [Demo accounts](#demo-accounts-development-only)
5. [Environment variables](#environment-variables)
6. [Scripts](#scripts)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Documentation](#documentation)
10. [Known limitations](#known-limitations)
11. [Future improvements](#future-improvements)

---

## Features

| Area | What's included |
|---|---|
| **Authentication** | Email/password sign-in, invitations (admin creates user → user sets password), forgot/reset password, change password, session list & remote sign-out, account lockout after 5 failures, DB-backed rate limiting, secure httpOnly cookies, hashed tokens. |
| **Roles & permissions** | 5 roles, 33 permissions stored in the database and editable by Super Admins (Settings → Roles & permissions). Row-level rules: teachers see only their sections, parents only their children, students only themselves. Every page, server action and API route checks permissions on the server. |
| **Dashboards** | Role-specific: admin KPIs, attendance trend, fee collection, class distribution, upcoming exams, notices; teacher classes, today's lessons, grading queue, attendance reminders; student/parent attendance, assignments, results, fees, timetable. |
| **Students** | Create/edit/archive/restore, guarded permanent delete, search, filters, sorting, pagination, CSV import (all-or-nothing with row errors) and export, profile with attendance/results/assignments/fees tabs, printable student report, photo upload, portal invitations. |
| **Teachers & parents** | Full CRUD, archive, subject/section teaching assignments, multi-child parent linking, invitations, exports. |
| **Classes & subjects** | Academic years (with "copy structure to new year"), classes, sections, capacity, class teachers, curriculum per class, subject management. |
| **Attendance** | Roll-call sheet (Present/Absent/Late/Excused + notes), duplicate prevention, audited edits, teacher edit window, absence notifications, monthly register with CSV, school analytics (trend, per-section, frequent absentees), student/parent history. |
| **Timetable** | Bell schedule (periods/breaks), weekly grid editor, teacher/room/section clash prevention, views per section/teacher/student/child, mobile day-list view. |
| **Assignments** | Create with attachments, draft/publish/close, student submissions with files, late detection, grading & feedback, missing-submission tracking, notifications. |
| **Exams & results** | Examinations, papers (schedule, max/pass marks, time-clash checks), marks entry with live validation, grades from configurable scale, totals/percentage/rank/pass-fail, subject & class averages, publish/unpublish, printable report cards, CSV. |
| **Fees** | Categories, bulk billing (class/section/students), discounts, payments with locked transactions (no overpayment, even concurrently), receipts, Paid/Partially paid/Pending/Overdue, collection analytics, reminders, modular payment-provider layer. |
| **Notices & notifications** | Audience targeting (school, class, section, teachers, students, parents), scheduling & expiry, attachments, pinning; in-app notifications with read/unread, history, live bell count; channel architecture for email/push. |
| **Reports** | 12 printable + CSV-exportable reports across students, attendance, academics and finance. |
| **Search** | Global, permission-scoped search across students, teachers, classes, subjects, assignments and notices. |
| **Settings** | School profile & logo, currency, time zone, school days, grading scale, pass rules, attendance rules, fee rules, email notification preferences, roles & permissions, administrators, multiple schools. |
| **Audit log** | Logins, failed logins, every student/teacher/parent change, marks/attendance/fee changes with before→after, notices, permission changes, exports. |
| **UI/UX** | SaaS-style design system, light & dark themes, sidebar + mobile drawer + bottom nav, responsive tables that become cards, modals, confirmation dialogs, toasts, skeletons, empty/error states, accessible forms (labels, aria, keyboard), print styles. |
| **PWA** | Installable manifest, icons, service worker with offline page (never caches private data). |

## Tech stack

- **Next.js 16** (App Router, Server Components, Server Actions, `proxy.ts`), **React 19**, **TypeScript**
- **Tailwind CSS 4** with semantic design tokens (light/dark)
- **PostgreSQL 16** + **Prisma 7** (driver adapter `@prisma/adapter-pg`), SQL check constraints & partial indexes
- **Zod 4** shared client/server validation · **Recharts** charts · **lucide-react** icons · **sonner** toasts
- Object storage: local disk (dev) or any **S3-compatible** store (AWS S3, Cloudflare R2, MinIO)
- Email: console (dev) or **SMTP** (nodemailer)
- Tests: **Vitest** (unit + DB integration) and **Playwright** (E2E, desktop + mobile)

## Quick start (local development)

Prerequisites: **Node.js 22+** and **PostgreSQL 14+** (16 recommended).

```bash
git clone <your-repo-url> scholaris && cd scholaris
```

```bash
npm install --legacy-peer-deps
```

Create the databases (adjust user/password to your setup):

```bash
createdb scholaris && createdb scholaris_test
```

```bash
cp .env.example .env
```

Edit `.env` — at minimum set `DATABASE_URL`, `TEST_DATABASE_URL` and `SEED_DEMO_PASSWORD`.

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open <http://localhost:3000> and sign in with a demo account below.

> `--legacy-peer-deps` is needed only because one of Vitest's optional peer dependencies
> trips npm's resolver; it does not affect the runtime.

## Demo accounts (development only)

The seed creates fictional data: 2 schools, 1 super admin, 3 admins, 15 teachers, 100
students, 80 parents, 10 sections, timetable, ~2 months of attendance, 40 assignments,
2 examinations (one with published results), 440 fees and notices.

All demo accounts use the password from `SEED_DEMO_PASSWORD` (`.env.example` suggests a
value; the seed falls back to `Scholaris!2026`).

| Role | Email |
|---|---|
| Super Admin | `superadmin@scholaris.example` |
| School Admin | `admin@greenfield.example` |
| Teacher | `teacher@greenfield.example` |
| Student | `student@greenfield.example` |
| Parent (two children) | `parent@greenfield.example` |

The seed refuses to run when `NODE_ENV=production`. **Never use demo credentials in production.**

## Environment variables

See [`.env.example`](.env.example) for the full annotated list.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `APP_URL` | ✅ (prod) | Public URL used in invitation / reset emails |
| `SESSION_TTL_DAYS` | | Sliding session lifetime (default 7) |
| `STORAGE_DRIVER` | | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | | Upload folder for the local driver |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | when `s3` | Object storage |
| `MAX_UPLOAD_MB` | | Upload size limit (default 10) |
| `MAIL_DRIVER` | | `console` (default) or `smtp` |
| `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_SECURE` | when `smtp` | Email delivery |
| `CRON_SECRET` | for scheduled jobs | Bearer token for `/api/cron/*` |
| `TEST_DATABASE_URL` | tests | Separate DB for integration tests (it is wiped) |
| `SEED_DEMO_PASSWORD` | seed | Password for demo accounts |

Secrets are only read on the server (`src/lib/env.ts` is `server-only` and validated with Zod at start-up).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint (Next.js + React rules) |
| `npm run db:migrate` | Create/apply a migration in development |
| `npm run db:deploy` | Apply migrations (production/CI) |
| `npm run db:seed` | Load demo data (development only) |
| `npm test` | Unit + integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run icons` | Regenerate PWA icons from `public/icons/icon.svg` |

## Testing

```bash
npm test
```

Runs **unit tests** (grading, fees, attendance maths, validation, CSV safety, password
hashing, permission matrix) and **integration tests against a real PostgreSQL database**
(`TEST_DATABASE_URL`): authentication & lockout, invitations/reset tokens, server-side
permissions and row-level scoping, student/teacher CRUD, CSV import, attendance,
marks & publishing, assignments & file access, fees (including concurrent payments),
notice audiences and database constraints.

```bash
npm run build && npm run test:e2e
```

Starts the production server on port 3100 and runs Playwright on desktop and a Pixel 7
profile: login/logout, validation messages, API authorization (401/403), URL tampering,
admin creating a student, teacher taking attendance, search, dark mode, and responsive
checks (no horizontal overflow, bottom nav, drawer, stacked tables). To test an already
running server: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e`.

## Deployment

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for step-by-step guides (Vercel + managed
Postgres + R2/S3, Docker / any VM, Railway/Render/Fly). In short:

```bash
npx prisma migrate deploy && npm run build && npm start
```

Schedule the cron endpoints (`vercel.json` already does on Vercel) and set `CRON_SECRET`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — structure, request flow, security model, data model
- [API reference](docs/API.md) — route handlers and server actions
- [Deployment](docs/DEPLOYMENT.md) — production setup, backups, operations
- [Features & status](docs/FEATURES.md) — completed features, known limitations, roadmap

## Known limitations

See [docs/FEATURES.md](docs/FEATURES.md#known-limitations) — e.g. single time-zone per
deployment server, no online payment gateway wired yet (the provider interface is ready),
email notifications need SMTP, no push notifications yet, PDF output uses the browser's
print-to-PDF.

## Future improvements

See [docs/FEATURES.md](docs/FEATURES.md#future-improvements) — native mobile apps (the
service layer is UI-independent), online payments, web push, SSO, timetable
auto-generation, gradebook weighting, multi-language UI, library/transport/hostel modules.
