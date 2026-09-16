/**
 * Applies migrations to the test database once, before the suite starts.
 *
 * `migrate deploy` only applies migrations that have not run yet, so this is
 * cheap on a warm database and correct on an empty one — including in CI,
 * where the test database starts with no schema at all.
 */
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config();

export default function globalSetup() {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL is not set');

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
