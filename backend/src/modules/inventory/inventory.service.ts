import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { inventoryResponse } from './availability';
import type { AdjustInventoryInput, ListInventoryQuery } from './inventory.schema';

export async function listInventory(query: ListInventoryQuery) {
  const search = normaliseSearch(query.search);

  const where: Prisma.ProductWhereInput = {
    isActive: true,
    ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
    ...(search
      ? {
          OR: [
            { productCode: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { productCode: 'asc' },
      select: {
        id: true,
        productCode: true,
        name: true,
        category: true,
        unit: true,
        basePrice: true,
        inventory: { select: { physicalQty: true, reservedQty: true, updatedAt: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.product.count({ where }),
  ]);

  const shaped = rows.map(({ inventory, ...product }) => ({
    ...product,
    ...inventoryResponse(inventory),
    updatedAt: inventory?.updatedAt ?? null,
  }));

  const filtered =
    query.maxAvailable === undefined
      ? shaped
      : shaped.filter((r) => r.availableQty <= query.maxAvailable!);

  return { rows: filtered, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getInventoryForProduct(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      productCode: true,
      name: true,
      unit: true,
      inventory: { select: { physicalQty: true, reservedQty: true, updatedAt: true } },
    },
  });

  if (!product) throw AppError.notFound('Product not found');

  const { inventory, ...rest } = product;
  return { ...rest, ...inventoryResponse(inventory), updatedAt: inventory?.updatedAt ?? null };
}

/**
 * Adjusts physical stock. ADMIN only.
 *
 * The write is a single conditional UPDATE rather than read-check-write:
 *
 *   UPDATE inventory SET "physicalQty" = <new>
 *    WHERE "productId" = $id AND <new> >= "reservedQty" AND <new> >= 0
 *
 * The guard travels with the write, so the row cannot change between the check
 * and the update. Reading the row, validating in JavaScript and writing it back
 * would let a concurrent reservation slip in between and leave physical stock
 * below what has already been promised.
 *
 * Zero rows affected means a guard failed. Only then is the row re-read, to
 * turn the failure into a message that says which rule was broken.
 *
 * This is the same technique the sales order reservation uses, on a smaller
 * scale.
 */
export async function adjustInventory(productId: string, input: AdjustInventoryInput) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, productCode: true, name: true, unit: true },
  });
  if (!product) throw AppError.notFound('Product not found');

  const updated =
    input.physicalQty !== undefined
      ? await prisma.$executeRaw`
          UPDATE "inventory"
             SET "physicalQty" = ${input.physicalQty}, "updatedAt" = NOW()
           WHERE "productId" = ${productId}
             AND ${input.physicalQty} >= "reservedQty"
        `
      : await prisma.$executeRaw`
          UPDATE "inventory"
             SET "physicalQty" = "physicalQty" + ${input.delta}, "updatedAt" = NOW()
           WHERE "productId" = ${productId}
             AND "physicalQty" + ${input.delta} >= "reservedQty"
             AND "physicalQty" + ${input.delta} >= 0
        `;

  if (updated === 0) {
    const current = await getInventoryForProduct(productId);
    const target =
      input.physicalQty !== undefined
        ? input.physicalQty
        : current.physicalQty + (input.delta ?? 0);

    if (target < 0) {
      throw AppError.conflict(
        `Cannot adjust ${product.productCode} to ${target} ${product.unit}: physical stock cannot go negative. ` +
          `Current physical stock is ${current.physicalQty}.`,
      );
    }

    throw AppError.conflict(
      `Cannot set ${product.productCode} to ${target} ${product.unit}: ` +
        `${current.reservedQty} ${product.unit} are already reserved against confirmed orders. ` +
        `Physical stock cannot fall below what has been promised.`,
    );
  }

  return getInventoryForProduct(productId);
}
