import type { Prisma } from '@prisma/client';

export type DocumentPrefix = 'ENQ' | 'QT' | 'SO' | 'DSP';

/**
 * Hands out the next human-readable document number, e.g. ENQ-202609-0001.
 *
 * MUST be called with a transaction client, inside the same transaction that
 * creates the document. If the document insert later fails, the counter rolls
 * back with it and the number is not burned.
 *
 * Why a counter table and not `SELECT max(number) + 1`:
 *
 *   max()+1 reads a value, then writes a row derived from it. Two concurrent
 *   requests both read the same max and both produce the same number; one
 *   fails on the unique index, or worse, succeeds if there is no unique index.
 *
 *   The statement below is a single atomic INSERT ... ON CONFLICT DO UPDATE.
 *   The first transaction to reach a given key takes a row lock; the second
 *   blocks until the first commits and then increments the value it left
 *   behind. Neither can observe a stale counter.
 *
 * The counter is keyed per prefix per month, so numbering restarts at 0001
 * each month and the key itself carries the period: "ENQ-202609".
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: DocumentPrefix,
  when: Date = new Date(),
): Promise<string> {
  const period = `${when.getFullYear()}${String(when.getMonth() + 1).padStart(2, '0')}`;
  const key = `${prefix}-${period}`;

  const rows = await tx.$queryRaw<Array<{ lastNumber: number }>>`
    INSERT INTO document_sequences ("key", "lastNumber")
    VALUES (${key}, 1)
    ON CONFLICT ("key")
      DO UPDATE SET "lastNumber" = document_sequences."lastNumber" + 1
    RETURNING "lastNumber"
  `;

  const lastNumber = rows[0]?.lastNumber;
  if (lastNumber === undefined) {
    // Cannot happen — the statement always returns exactly one row — but the
    // type says it might, and silently producing "ENQ-202609-NaN" would be
    // worse than failing here.
    throw new Error(`Failed to allocate a document number for ${key}`);
  }

  return `${key}-${String(lastNumber).padStart(4, '0')}`;
}
