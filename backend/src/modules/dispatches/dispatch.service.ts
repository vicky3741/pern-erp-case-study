import type { Prisma } from '@prisma/client';
import { prisma, TX_OPTIONS } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { nextDocumentNumber } from '../../utils/documentNumber';
import { lockInventoryRows } from '../inventory/reservation';
import type { CreateDispatchInput, ListDispatchesQuery } from './dispatch.schema';

const dispatchDetailInclude = {
  salesOrder: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      customer: { select: { id: true, companyName: true, city: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, productCode: true, name: true, unit: true } },
    },
  },
} satisfies Prisma.DispatchInclude;

/**
 * Dispatches goods against a CONFIRMED sales order.
 *
 * This is the only operation that reduces physical stock. Both numbers fall
 * together:
 *
 *   before   physical 100   reserved 60   available 40
 *   dispatch 60
 *   after    physical  40   reserved  0   available 40
 *
 * Available is unchanged, which is correct: those 60 units were already spoken
 * for and were never available to anyone else. Dispatch converts a promise into
 * a delivery, it does not free up stock.
 *
 * Partial dispatch is supported. dispatchedQty on each order line records how
 * much has left, and a dispatch may never exceed (quantity - dispatchedQty) —
 * which is exactly what makes dispatching the same quantity twice impossible.
 */
export async function createDispatch(
  salesOrderId: string,
  input: CreateDispatchInput,
  createdById: string,
) {
  const dispatchDate = input.dispatchDate ?? new Date();

  const dispatch = await prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findUnique({
      where: { id: salesOrderId },
      include: {
        items: {
          include: {
            product: { select: { id: true, productCode: true, name: true, unit: true } },
          },
        },
      },
    });

    if (!order) throw AppError.notFound('Sales order not found');

    // Only a confirmed order has stock reserved against it. A PENDING order
    // has reserved nothing, a CANCELLED order must never ship, and a fully
    // DISPATCHED order has nothing left to send.
    if (order.status !== 'CONFIRMED') {
      const reason =
        order.status === 'PENDING'
          ? 'it has not been confirmed, so no stock is reserved for it'
          : order.status === 'CANCELLED'
            ? 'it has been cancelled'
            : 'it has already been fully dispatched';
      throw AppError.conflict(`Sales order ${order.orderNumber} cannot be dispatched: ${reason}.`);
    }

    const orderLines = new Map(order.items.map((item) => [item.productId, item]));

    // Validate every line before touching anything, and report all problems at
    // once rather than one rejection at a time.
    const problems: string[] = [];
    for (const line of input.items) {
      const orderLine = orderLines.get(line.productId);

      if (!orderLine) {
        problems.push(`product ${line.productId} is not on sales order ${order.orderNumber}`);
        continue;
      }

      const remaining = orderLine.quantity - orderLine.dispatchedQty;
      if (line.quantity > remaining) {
        problems.push(
          `cannot dispatch ${line.quantity} of ${orderLine.product.productCode}: ` +
            `${orderLine.quantity} ordered, ${orderLine.dispatchedQty} already dispatched, ` +
            `${remaining} remaining`,
        );
      }
    }

    if (problems.length > 0) {
      throw AppError.conflict(`Dispatch rejected: ${problems.join('; ')}`, { problems });
    }

    // Lock the inventory rows. Sorted inside the helper, same as reservation,
    // so a dispatch and a confirmation running at once cannot deadlock.
    await lockInventoryRows(
      tx,
      input.items.map((line) => line.productId),
    );

    for (const line of input.items) {
      // Physical and reserved fall together. The CHECK constraints
      // physical_qty >= 0 and reserved_qty >= 0 are the backstop: if this
      // arithmetic were ever wrong the database would reject the transaction
      // rather than store an impossible stock level.
      await tx.inventory.update({
        where: { productId: line.productId },
        data: {
          physicalQty: { decrement: line.quantity },
          reservedQty: { decrement: line.quantity },
        },
      });

      await tx.salesOrderItem.update({
        where: {
          salesOrderId_productId: { salesOrderId: order.id, productId: line.productId },
        },
        data: { dispatchedQty: { increment: line.quantity } },
      });
    }

    const dispatchNumber = await nextDocumentNumber(tx, 'DSP', dispatchDate);

    const createdDispatch = await tx.dispatch.create({
      data: {
        dispatchNumber,
        dispatchDate,
        vehicleNumber: input.vehicleNumber,
        driverName: input.driverName,
        salesOrderId: order.id,
        createdById,
        items: {
          create: input.items.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
        },
      },
      include: dispatchDetailInclude,
    });

    // The order is DISPATCHED only once every line has fully left. Until then
    // it stays CONFIRMED and can be dispatched again for the remainder.
    const refreshed = await tx.salesOrderItem.findMany({
      where: { salesOrderId: order.id },
      select: { quantity: true, dispatchedQty: true },
    });

    const fullyDispatched = refreshed.every((item) => item.dispatchedQty >= item.quantity);
    if (fullyDispatched) {
      await tx.salesOrder.update({ where: { id: order.id }, data: { status: 'DISPATCHED' } });
    }

    return createdDispatch;
  }, TX_OPTIONS);

  return dispatch;
}

export async function listDispatches(query: ListDispatchesQuery) {
  const search = normaliseSearch(query.search);

  const where: Prisma.DispatchWhereInput = {
    ...(query.salesOrderId ? { salesOrderId: query.salesOrderId } : {}),
    ...(search
      ? {
          OR: [
            { dispatchNumber: { contains: search, mode: 'insensitive' } },
            { salesOrder: { orderNumber: { contains: search, mode: 'insensitive' } } },
            {
              salesOrder: {
                customer: { companyName: { contains: search, mode: 'insensitive' } },
              },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.dispatch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: dispatchDetailInclude,
      ...toSkipTake(query),
    }),
    prisma.dispatch.count({ where }),
  ]);

  return { rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getDispatchById(id: string) {
  const dispatch = await prisma.dispatch.findUnique({
    where: { id },
    include: dispatchDetailInclude,
  });
  if (!dispatch) throw AppError.notFound('Dispatch not found');
  return dispatch;
}
