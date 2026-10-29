import { defineConfig } from "prisma/config";

// Prisma 7 no longer loads .env automatically; Node's built-in loader is enough.
try {
  process.loadEnvFile();
} catch {
  // No .env file (e.g. in CI / production) — rely on the real environment.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
