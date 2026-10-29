# Deployment guide

Scholaris is a standard Next.js 16 Node.js application plus PostgreSQL and (optionally)
S3-compatible object storage. Three tested paths are described below.

## Production checklist

- [ ] PostgreSQL 14+ (managed: Neon, Supabase, RDS, Cloud SQL, Railway, Render…) with
      automated **daily backups** and point-in-time recovery
- [ ] `DATABASE_URL` points at it (use the pooled URL on serverless platforms)
- [ ] `APP_URL` set to the public HTTPS origin (used in invitation/reset links)
- [ ] `STORAGE_DRIVER=s3` with a **private** bucket (files are served through the app,
      never by public URL). Local storage is fine only on a single VM with a persistent disk.
- [ ] `MAIL_DRIVER=smtp` and SMTP credentials (Postmark, SES, Resend SMTP, Mailgun…)
- [ ] `CRON_SECRET` set (`openssl rand -hex 32`) and the four cron jobs scheduled
- [ ] HTTPS only (the app sets HSTS); the session cookie is `Secure` in production
- [ ] Run `prisma migrate deploy` on every release **before** the new code starts serving
- [ ] Do **not** run the demo seed in production — create the first Super Admin as below

### Creating the first Super Admin in production

The seed is for development only. To bootstrap an empty production database:

```bash
npx prisma migrate deploy
```

```bash
ALLOW_PRODUCTION_SEED=true SEED_DEMO_PASSWORD='<temporary strong password>' npm run db:seed
```

…then sign in as `superadmin@scholaris.example`, invite your real Super Admin from
**Administrators**, sign in as them, disable the demo accounts and delete the demo school
data — **or**, preferably, insert roles/permissions and a single Super Admin with a short
SQL script adapted from `prisma/seed.ts` (the roles & permissions section) so no demo data
ever reaches production. Change the temporary password immediately (Profile → Password).

## Option A — Vercel + managed Postgres + R2/S3

1. Create a Postgres database (e.g. Neon) and a private bucket (Cloudflare R2 or S3).
2. Import the repository in Vercel. Framework preset: Next.js.
3. Environment variables (Project → Settings → Environment Variables): everything from
   `.env.example` with production values (`STORAGE_DRIVER=s3`, `S3_*`, `MAIL_DRIVER=smtp`,
   `SMTP_*`, `APP_URL`, `CRON_SECRET`).
4. `vercel.json` already sets the build command (`prisma generate && prisma migrate deploy
   && next build`) and schedules the cron endpoints. Vercel sends
   `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET` is defined.
5. Deploy. Check `https://<domain>/api/health` returns `{"status":"ok"}`.

Notes: server actions accept up to 12 MB (uploads are limited by `MAX_UPLOAD_MB`, default
10). On Vercel the function body limit is ~4.5 MB on the Hobby plan — lower `MAX_UPLOAD_MB`
accordingly or use a plan/platform with larger limits.

## Option B — Docker (any VM / Kubernetes / ECS / Cloud Run)

The provided multi-stage `Dockerfile` builds a standalone image that runs migrations on
start and exposes a health check.

```bash
docker build -t scholaris .
```

```bash
docker run -d --name scholaris -p 3000:3000 --env-file .env.production scholaris
```

For a complete local production-like stack (Postgres + MinIO + app):

```bash
docker compose up --build
```

Schedule cron jobs with your platform scheduler or a crontab, for example:

```cron
*/15 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://school.example/api/cron/publish-notices
0 * * * *    curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://school.example/api/cron/assignment-reminders
30 7 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://school.example/api/cron/fee-reminders
15 3 * * *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://school.example/api/cron/cleanup
```

Put a TLS-terminating reverse proxy (Caddy, Nginx, a cloud load balancer) in front, and
make sure it forwards `X-Forwarded-For` (used for rate limiting and audit IPs).

## Option C — Railway / Render / Fly.io

* Build command: `npm ci --legacy-peer-deps && npx prisma generate && npm run build`
* Release / pre-deploy command: `npx prisma migrate deploy`
* Start command: `npm start` (or `node .next/standalone/server.js` after copying
  `.next/static` and `public` as in the Dockerfile)
* Add a Postgres plugin and set the env vars; add cron jobs as above.

## Operations

* **Migrations** — create in development with `npm run db:migrate -- --name <change>`;
  commit `prisma/migrations`; deploy with `npm run db:deploy`.
* **Backups** — rely on managed Postgres PITR plus periodic `pg_dump`; back up the object
  storage bucket (versioning recommended).
* **Monitoring** — `/api/health` for uptime checks; application errors are logged to
  stdout (`[action] unexpected error`, `[api] unexpected error`) — ship logs to your
  platform's log drain / Sentry.
* **Security** — rotate `CRON_SECRET` and SMTP/S3 keys periodically; review the Audit Log;
  keep at least two Super Admins.
* **Scaling** — the app is stateless (sessions and rate limits live in Postgres), so it
  scales horizontally behind a load balancer. Use a connection pooler (PgBouncer / Neon
  pooled URL) when running many instances.
* **Time zone** — run the server in the school's time zone (`TZ=Asia/Kolkata`, etc.) so
  "today" for attendance and due dates matches the school day (see Known limitations).
