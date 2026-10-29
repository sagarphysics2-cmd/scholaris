import { execSync } from "node:child_process";

/**
 * Prepares the TEST database once per run: apply pending migrations (non-destructive),
 * then load the demo seed (which clears the test data first). Refuses to run unless a
 * separate TEST_DATABASE_URL is configured.
 */
export default function setup() {
  try {
    process.loadEnvFile();
  } catch {
    /* CI provides env vars */
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set — refusing to run integration tests.");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL (the test DB is wiped).");
  const env = { ...process.env, DATABASE_URL: url, NODE_ENV: "test" as const };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
