import type { Prisma } from '@prisma/client';
import { AppError } from '../../utils/AppError';
import { availableQty } from './availability';

/**
 * Row-level locking for inventory.
 *
 * ---------------------------------------------------------------------------
 * The problem this exists to solve
 * ---------------------------------------------------------------------------
 * Available stock is 100. Two confirmations arrive at the same instant, one for
 * 80 units and one for 50. Both must not succeed.
 *
 * The obvious implementation is wrong:
 *
 *     const inv = await read(productId);           // both read 100 available
 *     if (inv.available < needed) throw ...;       // both pass
 *     await write(inv.reserved + needed);          // both write
 *
 * Nothing in that sequence prevents the second request from reading before the
 * first has written. Both see 100, both pass the check, and the database ends
 * up with 130 units reserved against 100 units of stock. Moving the check into
 * React makes it worse, not better — it just moves the same race further from
 * the data.
 *
 * ---------------------------------------------------------------------------
 * How it is actually solved
 * ---------------------------------------------------------------------------
 * SELECT ... FOR UPDATE takes a write lock on each row it returns, held until
 * the transaction commits or rolls back. The second transaction blocks on that
 * lock at the SELECT — before it has read anything — and resumes only once the
 * first has committed. It then reads the NEW reserved figure and correctly
 * fails its own check.
 *
 * The queueing is the point. It is not a performance problem to be optimised
 * away; it is the mechanism that makes the answer correct.
 *
 * ---------------------------------------------------------------------------
 * Why ORDER BY "productId"
 * ---------------------------------------------------------------------------
 * Two orders can touch overlapping products in different sequences. Order A
 * holds a lock on bearings and waits for valves; order B holds valves and waits
 * for bearings. Neither can proceed — a deadlock, which Postgres resolves by
 * killing one of them.
 *
 * Sorting the ids means every transaction acquires locks in the same sequence,
 * so one always gets both and the other always waits for both. A cycle can
 * never form.
 */

export interface LockedInventoryRow {
  productId: string;
  physicalQty: number;
  reservedQty: number;
}

export async function lockInventoryRows(
  tx: Prisma.TransactionClient,
  productIds: string[],
): Promise<Map<string, LockedInventoryRow>> {
  // Deduplicated and sorted: the deterministic lock order that prevents
  // deadlock between two transactions touching the same products.
  const ids = [...new Set(productIds)].sort();

  const rows = await tx.$queryRaw<LockedInventoryRow[]>`
    SELECT "productId", "physicalQty", "reservedQty"
      FROM "inventory"
     WHERE "productId" = ANY(${ids})
     ORDER BY "productId"
       FOR UPDATE
  `;

  return new Map(rows.map((row) => [row.productId, row]));
}

export interface StockRequirement {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  required: number;
}

export interface Shortfall {
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  required: number;
  available: number;
  shortBy: number;
}

/**
 * Checks every requirement against the locked rows and throws if any line is
 * short.
 *
 * All shortfalls are collected before throwing, rather than failing on the
 * first. A warehouse manager confirming a ten-line order wants to know
 * everything that is missing in one go, not to discover it one rejection at a
 * time.
 *
 * Throwing rolls the transaction back, so no line is reserved. A partially
 * reserved order would be worse than a rejected one — it holds stock for an
 * order that was never confirmed.
 */
export function assertSufficientStock(
  requirements: StockRequirement[],
  locked: Map<string, LockedInventoryRow>,
): void {
  const shortfalls: Shortfall[] = [];

  for (const requirement of requirements) {
    const row = locked.get(requirement.productId);

    if (!row) {
      // Cannot happen: every product is created with an inventory row in the
      // same transaction. Treated as zero stock rather than ignored.
      shortfalls.push({ ...requirement, available: 0, shortBy: requirement.required });
      continue;
    }

    const available = availableQty(row);
    if (available < requirement.required) {
      shortfalls.push({
        ...requirement,
        available,
        shortBy: requirement.required - available,
      });
    }
  }

  if (shortfalls.length === 0) return;

  const summary = shortfalls
    .map(
      (s) =>
        `${s.productCode} needs ${s.required} ${s.unit}, only ${s.available} available (short by ${s.shortBy})`,
    )
    .join('; ');

  throw AppError.conflict(`Insufficient stock: ${summary}`, { insufficientStock: shortfalls });
}
