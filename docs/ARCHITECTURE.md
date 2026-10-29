# Architecture

Scholaris is a single Next.js application with a strict layering: **UI → server actions /
route handlers → services → database**. Services contain all business rules and all
authorization, so the same rules apply whether a request comes from a page, a form, an
API route, a cron job or (later) a native mobile app.

## Directory structure

```
prisma/
  schema.prisma          # Normalized data model (snake_case tables)
  migrations/            # SQL migrations incl. CHECK constraints & partial indexes
  seed.ts                # Deterministic fictional demo data (dev only)
src/
  proxy.ts               # Edge gate: bounce visitors without a session cookie (UX only)
  app/
    (auth)/              # login, forgot-password, reset-password/[token], invite/[token]
    (app)/               # authenticated app (sidebar layout)
      dashboard/ students/ teachers/ parents/ classes/ subjects/ academic-years/
      attendance/ timetable/ assignments/ exams/ results/ fees/ notices/
      notifications/ reports/ search/ settings/ admins/ schools/ audit-logs/ profile/
      */actions.ts       # Server actions: parse → service → revalidate → ActionState
    api/                 # Route handlers: files, exports, reports, notifications, cron, health
    manifest.ts          # PWA manifest
  components/
    ui/                  # Design system: Button, Card, Table, Dialog, Badge, Tabs, …
    forms/               # ActionForm (client+server validation), fields
    charts/              # Recharts wrappers (one axis, tooltips, legends, tokens)
    layout/              # Sidebar, topbar, mobile drawer, bottom nav, theme
    attendance/ dashboard/ people/ files/ academics/
  lib/
    auth/                # password (scrypt), tokens, sessions, rate limit, actor
    permissions/         # permission catalog (seed source)
    validation/          # Zod schemas shared by client & server
    grading.ts fees.ts attendance.ts csv.ts utils.ts navigation.ts env.ts db.ts
  server/
    authz/               # guards (permission checks), scope (row-level rules), build-actor
    services/            # domain services — the only place that touches the DB for writes
    storage/             # StorageDriver: local disk & S3-compatible
    payments/            # PaymentProvider interface (manual today, gateways later)
    audit.ts notifications.ts mail.ts errors.ts action.ts http.ts
  generated/prisma/      # Prisma client (generated, git-ignored)
tests/
  unit/ integration/ e2e/ support/
```

## Request flow

```
Browser ──► proxy.ts (cookie present? else → /login?next=…)
        ──► Server Component page ── requirePermission("…")  ──► service (scoped query)
        ──► <ActionForm> ── client Zod validation ──► server action
                 └─ runAction: requireActorOrThrow → parseInput(schema) → service → revalidatePath
        ──► /api/* route handler ── requireActorOrThrow → service → JSON / CSV / file stream
```

* **Actor** (`lib/auth/actor.ts`, `server/authz/build-actor.ts`): resolved once per request
  from the session cookie → `sessions` row → user, role, **permissions loaded from
  `role_permissions`**, and profile ids (teacherId / studentId / parentId). Super Admins
  carry the school they selected with the switcher.
* **Guards** (`server/authz/guards.ts`): `assertCan(actor, "students.write")` etc.
* **Scope** (`server/authz/scope.ts`): row-level rules — e.g. `studentScopeWhere(actor)`
  returns a Prisma filter limiting students to the school (admins), the teacher's
  sections, the parent's children, or the student themself. Unauthorized ids raise
  `NotFoundError` so the existence of other students' records is never revealed.
* **Errors** (`server/errors.ts`): typed `AppError`s are converted by `runAction` /
  `handleRouteError` into safe messages; Prisma unique/foreign-key errors are mapped to
  friendly field errors; anything unexpected is logged server-side and shown generically.

## Security model

| Concern | Implementation |
|---|---|
| Passwords | scrypt (N=2¹⁵, r=8, p=1, 64-byte key, random salt), constant-time compare, dummy hash for unknown users |
| Sessions | 256-bit random token in an httpOnly, SameSite=Lax, Secure (prod) cookie; only its SHA-256 is stored; sliding expiry; per-device revocation; all sessions revoked on password reset |
| Brute force | DB-backed fixed-window rate limits (per IP and per email) + 15-minute account lockout after 5 failures |
| Tokens | Invite/reset tokens hashed at rest, single-use (conditional update), short-lived (72h / 60 min) |
| Authorization | Every page, action and route handler calls the service layer, which asserts permissions and row scope; the proxy is only a UX redirect |
| CSRF | Server actions are POST-only with Next.js origin checks; cookies are SameSite=Lax; route handlers that change state don't exist outside actions (cron uses a bearer secret) |
| Injection | Prisma parameterised queries; the two raw SQL statements use tagged templates (parameterised) |
| XSS | React escaping everywhere; no `dangerouslySetInnerHTML` with user data; uploads served with `Content-Security-Policy: sandbox` and `nosniff` |
| Uploads | Allow-listed MIME types + matching extension + magic-byte sniffing + size limit; random storage keys; downloads authorised per file |
| CSV export | Formula-injection neutralised (`=`, `+`, `-`, `@` prefixed) |
| Headers | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, `poweredByHeader: false` |
| Secrets | Only in env vars; `env.ts` is `server-only` and validated at start-up |
| Data integrity | DB CHECK constraints (non-negative marks/fees, passing ≤ max, discount ≤ amount, paid ≤ net, date ranges), unique keys (attendance per student/section/date, roll numbers, timetable clashes), partial unique index (one current academic year) |
| Concurrency | Fee payments lock the fee row (`SELECT … FOR UPDATE`) — concurrent payments cannot overpay |
| Audit | `audit_logs` records actor, action, entity, id, before/after metadata and IP — inside the same transaction as the change where applicable |
| Privacy | Service worker never caches HTML or API responses; profile/file routes are `private` cache |

## Data model

Core entities (PostgreSQL tables):

* **Identity & access** — `users`, `roles`, `permissions`, `role_permissions`, `sessions`,
  `auth_tokens`, `rate_limits`
* **Structure** — `schools` (JSON settings validated by Zod), `academic_years`, `classes`,
  `sections`, `subjects`, `class_subjects` (curriculum), `teacher_subjects` (teaching
  assignments), `periods`, `timetables`
* **People** — `teachers`, `students`, `parents`, `parent_students` (many-to-many with
  relationship), `enrollments` (student ↔ section per academic year, roll number)
* **Academics** — `attendance`, `attendance_notes`, `examinations`, `exam_subjects`,
  `marks`, `grade_scales`, `assignments`, `assignment_submissions`
* **Finance** — `fee_categories`, `fees`, `fee_payments`
* **Communication** — `notices`, `notifications`
* **Platform** — `files`, `audit_logs`

Design notes:

* Names, email and phone live on `users` for every person; role profiles (`students`,
  `teachers`, `parents`) hold role-specific data. Students without an email are users that
  simply cannot sign in.
* Class placement is not stored on the student: it comes from the `enrollments` row for
  the academic year, preserving history across years.
* `fees.amount_paid` caches the sum of payments and is only changed in the payment
  transaction; a CHECK constraint keeps it within the net amount. "Overdue" is derived from
  the due date at read time and never stored.
* Archiving (students, teachers, parents, subjects) is preferred to deletion; permanent
  deletion is refused when academic or financial history exists.

## Front-end architecture

* Server Components fetch data through services; interactive pieces are small client
  components (`"use client"`).
* `ActionForm` wraps server actions with `useActionState`, runs the same Zod schema in the
  browser for instant feedback, keeps entered values on error, shows toasts and follows
  `redirectTo`.
* List state (search, filters, sort, page) lives in the URL, so views are shareable and
  server-rendered.
* Theme tokens are CSS variables (`globals.css`); dark mode swaps the variables.
* Chart palette was validated for colour-vision deficiencies; charts always carry labels or
  legends so colour is never the only signal.

## Extending to native mobile apps

All business logic is in `src/server/services/*` and depends only on an `Actor`. A mobile
API can be added as route handlers (e.g. `/api/v1/...`) that authenticate with a bearer
session token (the `sessions` table already supports it) and call the same services.
