import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],

    // Applies migrations to the test database once, before anything runs.
    globalSetup: ['tests/helpers/globalSetup.ts'],

    // Points DATABASE_URL at TEST_DATABASE_URL before any test file — and
    // therefore before the Prisma client module — is evaluated.
    setupFiles: ['tests/helpers/setup.ts'],

    // Every test file shares one database and truncates it between files. Run
    // them in a single process, one at a time, or they would delete each
    // other's fixtures halfway through.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    sequence: { concurrent: false },

    // The database is a managed Postgres over the network, and the concurrency
    // tests deliberately queue on row locks.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
