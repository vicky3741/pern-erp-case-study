import type { Prisma } from '@prisma/client';
import { prisma, TX_OPTIONS } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { availableQty, inventoryResponse } from '../inventory/availability';
import type { CreateProductInput, ListProductsQuery, UpdateProductInput } from './product.schema';

const productWithInventory = {
  inventory: { select: { physicalQty: true, reservedQty: true, updatedAt: true } },
} satisfies Prisma.ProductInclude;

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productWithInventory }>;

/** Flattens the inventory relation into the three numbers a client cares about. */
function shape(product: ProductRow) {
  const { inventory, ...rest } = product;
  return { ...rest, inventory: inventoryResponse(inventory) };
}

export async function createProduct(input: CreateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { productCode: input.productCode },
  });
  if (existing) {
    throw AppError.conflict(`Product code ${input.productCode} is already used by ${existing.name}`);
  }

  // The product and its inventory row are created together. A product without
  // an inventory row would force every availability lookup to handle null.
  const product = await prisma.$transaction(
    async (tx) =>
      tx.product.create({
        data: {
          productCode: input.productCode,
          name: input.name,
          category: input.category,
          unit: input.unit,
          basePrice: input.basePrice,
          inventory: { create: { physicalQty: input.openingQty, reservedQty: 0 } },
        },
        include: productWithInventory,
      }),
    TX_OPTIONS,
  );

  return shape(product);
}

export async function listProducts(query: ListProductsQuery) {
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
      include: productWithInventory,
      ...toSkipTake(query),
    }),
    prisma.product.count({ where }),
  ]);

  const shaped = rows.map(shape);

  // Availability is derived, so it cannot be filtered in SQL without
  // duplicating the rule in a WHERE clause. Filtering here keeps one definition
  // of "available"; the cost is that this page may return fewer rows than the
  // page size. That is an acceptable trade for a low-cardinality product master
  // — and the alternative, a stored column, is the thing being avoided.
  const filtered =
    query.maxAvailable === undefined
      ? shaped
      : shaped.filter((p) => p.inventory.availableQty <= query.maxAvailable!);

  return { rows: filtered, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getProductById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productWithInventory,
  });
  if (!product) throw AppError.notFound('Product not found');
  return shape(product);
}

export async function listCategories() {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    distinct: ['category'],
    select: { category: true },
    orderBy: { category: 'asc' },
  });
  return rows.map((r) => r.category);
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) throw AppError.notFound('Product not found');

  const updated = await prisma.product.update({
    where: { id },
    data: input,
    include: productWithInventory,
  });
  return shape(updated);
}

/**
 * Soft delete. Quotations, orders and dispatches reference products, and every
 * foreign key is onDelete: Restrict, so a hard delete would either fail or
 * orphan history.
 */
export async function deactivateProduct(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: productWithInventory,
  });
  if (!product) throw AppError.notFound('Product not found');

  if (availableQty(product.inventory) !== product.inventory?.physicalQty) {
    throw AppError.conflict(
      `${product.productCode} has stock reserved against open orders and cannot be deactivated yet`,
    );
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { isActive: false },
    include: productWithInventory,
  });
  return shape(updated);
}
