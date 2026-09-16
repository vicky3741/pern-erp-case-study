/**
 * Empties every table.
 *
 *   npm run db:reset     # truncate, then re-seed
 *
 * Running the smoke test leaves behind the documents and test products it
 * created. That is fine while building, but a demo wants a database that looks
 * like a fresh install, so this puts it back to one.
 *
 * TRUNCATE ... CASCADE rather than deleting row by row: it ignores foreign key
 * ordering and is effectively instant. RESTART IDENTITY resets any sequences,
 * and document_sequences is included so numbering starts again at 0001.
 */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const TABLES = [
  'dispatch_items',
  'dispatches',
  'sales_order_items',
  'sales_orders',
  'quotation_items',
  'quotations',
  'enquiry_items',
  'enquiries',
  'inventory',
  'products',
  'customers',
  'users',
  'document_sequences',
];

async function main() {
  const target = process.env.DATABASE_URL ?? '';
  // Show which database is about to be emptied, with the password masked.
  console.log(`[reset] target: ${target.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')}`);

  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

  console.log(`[reset] truncated ${TABLES.length} tables`);
  console.log('[reset] run `npm run seed` to repopulate, or use `npm run db:reset`');
}

main()
  .catch((err) => {
    console.error('[reset] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
