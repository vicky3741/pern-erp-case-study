import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * A single PrismaClient for the whole process.
 *
 * In development `tsx watch` reloads this module on every save; without the
 * globalThis cache each reload would open a new connection pool and eventually
 * exhaust the database's connection limit.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.isDev ? ['warn', 'error'] : ['error'],
  });

if (env.isDev) globalForPrisma.prisma = prisma;

/**
 * Shared options for every interactive transaction in the application.
 *
 * Prisma defaults to a 5 second timeout and a 2 second wait for a connection.
 * Those are reasonable for a database on localhost, but this application talks
 * to a managed Postgres over the network, and several of its transactions hold
 * row locks on purpose:
 *
 *   - document numbering locks one counter row per prefix per month
 *   - confirming a sales order locks the inventory rows it is about to reserve
 *
 * When requests contend for those locks they queue, by design — that queueing
 * is what makes the reservation correct. With a round trip of tens of
 * milliseconds per statement, a genuinely correct transaction at the back of
 * the queue can easily sit for more than five seconds and be killed mid-flight
 * with P2028, which looks like a bug but is only an impatient default.
 *
 * `timeout` is how long a transaction may run once started; `maxWait` is how
 * long it may wait for a free connection from the pool.
 */
export const TX_OPTIONS = {
  timeout: 20_000,
  maxWait: 15_000,
} as const;

/** Verifies the database is reachable before the server starts accepting traffic. */
export async function connectDatabase() {
  await prisma.$connect();
  // eslint-disable-next-line no-console
  console.log('[db] connected');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
}
