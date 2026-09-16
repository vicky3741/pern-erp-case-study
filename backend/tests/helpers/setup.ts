/**
 * Runs before any test file is evaluated.
 *
 * The whole application reads DATABASE_URL — env.ts validates it at import and
 * the Prisma client is built from it. Rather than threading a second client
 * through the code, the variable is repointed at TEST_DATABASE_URL here, before
 * the first `import { prisma }` in a test file resolves.
 *
 * This is also the safety catch: the suite truncates every table between files,
 * so if TEST_DATABASE_URL is missing or is the same database as the real one,
 * the run is aborted rather than risk emptying a database someone is using.
 *
 * The comparison reads the values as written in .env rather than from
 * process.env. Every test file re-runs this setup inside the same process, and
 * after the first run process.env.DATABASE_URL has already been repointed —
 * comparing against it would make the second file look like a misconfiguration.
 * dotenv.config() does not overwrite existing process.env entries, so `parsed`
 * always reflects the file itself.
 */
import dotenv from 'dotenv';

const { parsed } = dotenv.config();

const testUrl = process.env.TEST_DATABASE_URL ?? parsed?.TEST_DATABASE_URL;
const configuredDevUrl = parsed?.DATABASE_URL;

if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. The test suite truncates every table and refuses to run without a database of its own. See backend/.env.example.',
  );
}

if (configuredDevUrl && testUrl === configuredDevUrl) {
  throw new Error(
    'TEST_DATABASE_URL points at the same database as DATABASE_URL. The test suite truncates every table; give it a database of its own.',
  );
}

process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
