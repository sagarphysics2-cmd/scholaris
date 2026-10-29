// Runs in each test worker before test files are imported.
try {
  process.loadEnvFile();
} catch {
  /* env from CI */
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.MAIL_DRIVER = "console";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = "./storage/test";
