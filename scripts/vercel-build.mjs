// Build script for Vercel (and any CI): check configuration, apply database migrations,
// optionally load the demo school into an EMPTY database, then build the app.
// Every failure prints a plain-language explanation of what to fix.
import { execSync } from "node:child_process";
import pg from "pg";

const fail = (title, fix) => {
  console.error(`\n✖ ${title}\n\n${fix}\n`);
  process.exit(1);
};
const run = (cmd, extraEnv = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  fail(
    "DATABASE_URL is not set.",
    "In Vercel: Project → Settings → Environment Variables → add DATABASE_URL.\n" +
      "With Supabase use the 'Session pooler' string (Connect button → Session pooler), e.g.\n" +
      "postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres\n" +
      "Then redeploy (Deployments → ⋯ → Redeploy).",
  );
}
if (!/^postgres(ql)?:\/\//.test(url)) fail("DATABASE_URL must start with postgresql://", "Copy the full connection string from your database provider.");
if (/\[YOUR-PASSWORD\]|<password>|YOUR_PASSWORD/i.test(url)) {
  fail("DATABASE_URL still contains the password placeholder.", "Replace [YOUR-PASSWORD] with your real database password (Supabase → Project Settings → Database → Reset password if you don't know it).");
}
if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
  fail(
    "DATABASE_URL uses Supabase's direct connection, which Vercel cannot reach (it is IPv6-only).",
    "Use the 'Session pooler' string instead: Supabase → Connect → Session pooler (host ends in pooler.supabase.com, port 5432).",
  );
}
if (/pooler\.supabase\.com:6543/.test(url)) {
  fail("DATABASE_URL uses the Transaction pooler (port 6543), which can't run migrations.", "Use the 'Session pooler' string (same host, port 5432).");
}

// Fail fast with a readable message if the database can't be reached.
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
} catch (err) {
  const msg = String(err?.message ?? err);
  if (/password authentication failed/i.test(msg)) fail("The database password in DATABASE_URL is wrong.", "Reset it in Supabase (Project Settings → Database) and update DATABASE_URL in Vercel. If the password has symbols like @ # / ?, URL-encode them or choose a password with letters and numbers only.");
  if (/ENOTFOUND|getaddrinfo/i.test(msg)) fail("The database host in DATABASE_URL can't be found.", "Copy the connection string again from your database provider; check the project isn't paused (Supabase pauses free projects after a week).");
  fail(`Could not connect to the database: ${msg}`, "Check DATABASE_URL and that the database is running (not paused).");
}

console.log("▶ Applying database migrations…");
run("npx prisma migrate deploy");

// Accept "true", "TRUE", " yes ", "1" etc. — values pasted into dashboards are often slightly off.
const seedFlag = (process.env.SEED_DEMO_DATA ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase();
if (["true", "yes", "1", "on"].includes(seedFlag)) {
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n === 0) {
    console.log("▶ Empty database and SEED_DEMO_DATA=true — loading the fictional demo school (takes a few minutes)…");
    run("npx tsx prisma/seed.ts", { ALLOW_PRODUCTION_SEED: "true" });
  } else {
    console.log(`▶ SEED_DEMO_DATA=true but the database already has ${rows[0].n} users — skipping demo data (it never overwrites existing data).`);
  }
} else {
  const { rows } = await client.query("SELECT COUNT(*)::int AS n FROM users");
  console.log(
    rows[0].n === 0
      ? "▶ The database has no users yet. To load the demo school, add SEED_DEMO_DATA=true (Production environment) in Vercel and redeploy."
      : `▶ Demo data not requested (SEED_DEMO_DATA is ${process.env.SEED_DEMO_DATA === undefined ? "not set" : `"${process.env.SEED_DEMO_DATA}"`}); database has ${rows[0].n} users.`,
  );
}
await client.end();

console.log("▶ Building the app…");
run("npx next build");
