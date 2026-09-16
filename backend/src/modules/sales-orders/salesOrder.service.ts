import type { Prisma } from '@prisma/client';
import { prisma, TX_OPTIONS } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { nextDocumentNumber } from '../../utils/documentNumber';
import { inventoryResponse } from '../inventory/availability';
import {
  assertSufficientStock,
  lockInventoryRows,
  type StockRequirement,
} from '../inventory/reservation';
import type { ListSalesOrdersQuery } from './salesOrder.schema';

const salesOrderDetailInclude = {
  customer: {
    select: { id: true, companyName: true, contactPerson: true, mobile: true, city: true },
  },
  quotation: {
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      grandTotal: true,
      enquiry: { select: { id: true, enquiryNumber: true } },
    },
  },
  createdBy: { select: { id: true, name: true } },
  confirmedBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          productCode: true,
          name: true,
          unit: true,
          inventory: { select: { physicalQty: true, reservedQty: true } },
        },
      },
    },
  },
  dispatches: {
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      dispatchNumber: true,
      dispatchDate: true,
      vehicleNumber: true,
      driverName: true,
    },
  },
} satisfies Prisma.SalesOrderInclude;

type SalesOrderRow = Prisma.SalesOrderGetPayload<{ include: typeof salesOrderDetailInclude }>;

/**
 * Flattens each line so the Sales Order screen can show, in one row:
 * ordered / dispatched / physical / reserved / available.
 */
function shape(order: SalesOrderRow) {
  return {
    ...order,
    items: order.items.map((item) => {
      const { product, ...line } = item;
      const { inventory, ...productRest } = product;
      return {
        ...line,
        remainingQty: line.quantity - line.dispatchedQty,
        product: productRest,
        stock: inventoryResponse(inventory),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Quotation -> Sales Order
// ---------------------------------------------------------------------------

export async function convertQuotation(quotationId: string, createdById: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id: quotationId },
    include: {
      items: true,
      salesOrder: { select: { id: true, orderNumber: true } },
    },
  });

  if (!quotation) throw AppError.notFound('Quotation not found');

  // Guard 1 — only an accepted quotation becomes an order. A DRAFT was never
  // sent to the customer; a REJECTED one they turned down.
  if (quotation.status !== 'ACCEPTED') {
    throw AppError.conflict(
      `Quotation ${quotation.quotationNumber} is ${quotation.status}; only ACCEPTED quotations can be converted to a sales order.`,
    );
  }

  // Guard 2 — a friendly message when an order already exists. This check is
  // NOT what makes duplicate conversion impossible: two simultaneous requests
  // can both pass it. See guard 3.
  if (quotation.salesOrder) {
    throw AppError.conflict(
      `Quotation ${quotation.quotationNumber} has already been converted to sales order ${quotation.salesOrder.orderNumber}.`,
    );
  }

  const orderDate = new Date();

  try {
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = await nextDocumentNumber(tx, 'SO', orderDate);

      return tx.salesOrder.create({
        data: {
          orderNumber,
          orderDate,
          quotationId: quotation.id,
          customerId: quotation.customerId,
          createdById,
          totalAmount: quotation.grandTotal,
          // No inventory is touched here. An order starts PENDING; stock is
          // reserved only when an admin confirms it.
          items: {
            create: quotation.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              lineAmount: item.lineAmount,
              dispatchedQty: 0,
            })),
          },
        },
        include: salesOrderDetailInclude,
      });
    }, TX_OPTIONS);

    return shape(order);
  } catch (err) {
    // Guard 3 — the real one. sales_orders.quotationId is UNIQUE, so if two
    // requests race past guard 2, the database rejects the second INSERT. That
    // constraint, not the check above, is what makes "one quotation cannot
    // generate two sales orders" actually true.
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    ) {
      const existing = await prisma.salesOrder.findUnique({
        where: { quotationId },
        select: { orderNumber: true },
      });
      throw AppError.conflict(
        `Quotation ${quotation.quotationNumber} has already been converted to sales order ${existing?.orderNumber ?? 'an existing order'}.`,
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listSalesOrders(query: ListSalesOrdersQuery) {
  const search = normaliseSearch(query.search);

  const where: Prisma.SalesOrderWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { quotation: { quotationNumber: { contains: search, mode: 'insensitive' } } },
            { customer: { companyName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.salesOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, companyName: true, city: true } },
        quotation: { select: { id: true, quotationNumber: true } },
        _count: { select: { items: true, dispatches: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.salesOrder.count({ where }),
  ]);

  return { rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getSalesOrderById(id: string) {
  const order = await prisma.salesOrder.findUnique({
    where: { id },
    include: salesOrderDetailInclude,
  });
  if (!order) throw AppError.notFound('Sales order not found');
  return shape(order);
}

// ---------------------------------------------------------------------------
// Confirm — this is where inventory is reserved
// ---------------------------------------------------------------------------

/**
 * Confirms a PENDING sales order and reserves stock for every line.
 *
 * Reservation raises reservedQty and leaves physicalQty untouched. The goods
 * are still on the shelf — they are simply no longer available to anyone else.
 * Physical stock falls only at dispatch.
 *
 *   before   physical 100   reserved 30   available 70
 *   reserve 60
 *   after    physical 100   reserved 90   available 10
 *
 * The whole thing is one transaction. If any line is short, nothing is
 * reserved at all.
 */
export async function confirmSalesOrder(id: string, confirmedById: string) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.salesOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: { select: { id: true, productCode: true, name: true, unit: true } },
          },
        },
      },
    });

    if (!existing) throw AppError.notFound('Sales order not found');

    if (existing.status !== 'PENDING') {
      throw AppError.conflict(
        existing.status === 'CONFIRMED'
          ? `Sales order ${existing.orderNumber} is already CONFIRMED and its stock is already reserved.`
          : `Sales order ${existing.orderNumber} is ${existing.status} and cannot be confirmed.`,
      );
    }

    // 1. Take the locks. Any competing confirmation blocks here until this
    //    transaction commits or rolls back.
    const productIds = existing.items.map((item) => item.productId);
    const locked = await lockInventoryRows(tx, productIds);

    // 2. Check every line against the freshly locked figures.
    const requirements: StockRequirement[] = existing.items.map((item) => ({
      productId: item.productId,
      productCode: item.product.productCode,
      productName: item.product.name,
      unit: item.product.unit,
      required: item.quantity,
    }));

    // Throws with every shortfall listed, rolling the transaction back.
    assertSufficientStock(requirements, locked);

    // 3. Reserve. Safe because the rows are locked for the rest of this
    //    transaction; the CHECK constraint reserved_qty <= physical_qty is the
    //    backstop if this code is ever wrong.
    for (const item of existing.items) {
      await tx.inventory.update({
        where: { productId: item.productId },
        data: { reservedQty: { increment: item.quantity } },
      });
    }

    return tx.salesOrder.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
        confirmedById,
      },
      include: salesOrderDetailInclude,
    });
  }, TX_OPTIONS);

  return shape(order);
}

// ---------------------------------------------------------------------------
// Cancel — releases whatever is still reserved
// ---------------------------------------------------------------------------

export async function cancelSalesOrder(id: string, reason: string) {
  const order = await prisma.$transaction(async (tx) => {
    const existing = await tx.salesOrder.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) throw AppError.notFound('Sales order not found');

    if (existing.status === 'CANCELLED') {
      throw AppError.conflict(`Sales order ${existing.orderNumber} is already cancelled.`);
    }

    if (existing.status === 'DISPATCHED') {
      throw AppError.conflict(
        `Sales order ${existing.orderNumber} has been fully dispatched and cannot be cancelled. The goods have left.`,
      );
    }

    // A CONFIRMED order is holding a reservation that must be given back.
    // A PENDING order never reserved anything, so there is nothing to release.
    if (existing.status === 'CONFIRMED') {
      const productIds = existing.items.map((item) => item.productId);
      await lockInventoryRows(tx, productIds);

      for (const item of existing.items) {
        // Only the undispatched part is still reserved. Anything already
        // dispatched has left both physical and reserved stock.
        const stillReserved = item.quantity - item.dispatchedQty;
        if (stillReserved <= 0) continue;

        await tx.inventory.update({
          where: { productId: item.productId },
          data: { reservedQty: { decrement: stillReserved } },
        });
      }
    }

    return tx.salesOrder.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      include: salesOrderDetailInclude,
    });
  }, TX_OPTIONS);

  return shape(order);
}
