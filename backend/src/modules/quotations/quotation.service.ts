import type { Prisma, QuotationStatus } from '@prisma/client';
import { prisma, TX_OPTIONS } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { nextDocumentNumber } from '../../utils/documentNumber';
import { calculateQuotationTotals } from './pricing';
import type { CreateQuotationInput, ListQuotationsQuery } from './quotation.schema';

/**
 * DRAFT  → SENT                  the quotation goes to the customer
 * SENT   → ACCEPTED | REJECTED   the customer replies
 * ACCEPTED, REJECTED are terminal
 *
 * A DRAFT cannot be accepted directly: accepting means the customer agreed to
 * something, which they cannot have done before it was sent to them.
 */
const ALLOWED_TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  DRAFT: ['SENT'],
  SENT: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: [],
  REJECTED: [],
};

const quotationDetailInclude = {
  customer: {
    select: { id: true, companyName: true, contactPerson: true, mobile: true, city: true },
  },
  enquiry: {
    select: { id: true, enquiryNumber: true, enquiryDate: true, requiredDate: true, status: true },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      product: { select: { id: true, productCode: true, name: true, unit: true, basePrice: true } },
    },
  },
  salesOrder: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.QuotationInclude;

export async function createQuotation(input: CreateQuotationInput, createdById: string) {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id: input.enquiryId },
    select: { id: true, enquiryNumber: true, customerId: true, status: true },
  });
  if (!enquiry) throw AppError.badRequest('Enquiry not found');

  if (enquiry.status === 'WON' || enquiry.status === 'LOST') {
    throw AppError.conflict(
      `Enquiry ${enquiry.enquiryNumber} is ${enquiry.status} and is closed to new quotations.`,
    );
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, productCode: true, basePrice: true, isActive: true },
  });

  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw AppError.badRequest('Unknown product on the quotation', { productIds: missing });
  }

  const inactive = products.filter((p) => !p.isActive).map((p) => p.productCode);
  if (inactive.length > 0) {
    throw AppError.badRequest(`These products are no longer active: ${inactive.join(', ')}`);
  }

  // --------------------------------------------------------------------------
  // Every amount is computed here, from the quantities and percentages that
  // survived validation. Nothing the client sent about money is read — the
  // schema stripped those fields before this function was called.
  //
  // unitPrice is the one price the client may influence, because a quotation is
  // a negotiation. When omitted it falls back to the product's base price.
  // --------------------------------------------------------------------------
  const priced = calculateQuotationTotals(
    input.items.map((item) => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice ?? byId.get(item.productId)!.basePrice,
      discountPercent: item.discountPercent,
      gstPercent: item.gstPercent,
    })),
  );

  const quotationDate = input.quotationDate ?? new Date();

  // customerId comes from the enquiry, never from the request. A quotation
  // addressed to a different customer than the enquiry it answers would break
  // the Customer -> Enquiry -> Quotation -> Sales Order chain the brief asks to
  // keep traceable.
  const customerId = enquiry.customerId;

  return prisma.$transaction(async (tx) => {
    const quotationNumber = await nextDocumentNumber(tx, 'QT', quotationDate);

    const quotation = await tx.quotation.create({
      data: {
        quotationNumber,
        quotationDate,
        validUntil: input.validUntil,
        enquiryId: enquiry.id,
        customerId,
        createdById,
        subTotal: priced.subTotal,
        totalDiscount: priced.totalDiscount,
        totalGst: priced.totalGst,
        grandTotal: priced.grandTotal,
        items: {
          create: priced.lines.map((line, index) => ({
            productId: input.items[index]!.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            gstPercent: line.gstPercent,
            lineAmount: line.lineAmount,
          })),
        },
      },
      include: quotationDetailInclude,
    });

    // Raising a quotation is what moves an enquiry from NEW to QUOTED. Done in
    // the same transaction so the two can never disagree.
    if (enquiry.status === 'NEW') {
      await tx.enquiry.update({ where: { id: enquiry.id }, data: { status: 'QUOTED' } });
    }

    return quotation;
  }, TX_OPTIONS);
}

export async function listQuotations(query: ListQuotationsQuery) {
  const search = normaliseSearch(query.search);

  const where: Prisma.QuotationWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.enquiryId ? { enquiryId: query.enquiryId } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { quotationNumber: { contains: search, mode: 'insensitive' } },
            { enquiry: { enquiryNumber: { contains: search, mode: 'insensitive' } } },
            { customer: { companyName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, companyName: true, city: true } },
        enquiry: { select: { id: true, enquiryNumber: true } },
        salesOrder: { select: { id: true, orderNumber: true, status: true } },
        _count: { select: { items: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.quotation.count({ where }),
  ]);

  return { rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getQuotationById(id: string) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    include: quotationDetailInclude,
  });
  if (!quotation) throw AppError.notFound('Quotation not found');
  return quotation;
}

export async function updateQuotationStatus(id: string, next: QuotationStatus) {
  const quotation = await prisma.quotation.findUnique({
    where: { id },
    select: {
      id: true,
      quotationNumber: true,
      status: true,
      validUntil: true,
      enquiryId: true,
      enquiry: { select: { status: true } },
    },
  });
  if (!quotation) throw AppError.notFound('Quotation not found');

  if (quotation.status === next) {
    throw AppError.conflict(`Quotation ${quotation.quotationNumber} is already ${next}`);
  }

  const allowed = ALLOWED_TRANSITIONS[quotation.status];
  if (!allowed.includes(next)) {
    throw AppError.conflict(
      allowed.length === 0
        ? `Quotation ${quotation.quotationNumber} is ${quotation.status}, which is final and cannot be changed.`
        : `Quotation ${quotation.quotationNumber} is ${quotation.status}; it can only move to ${allowed.join(' or ')}.`,
    );
  }

  if (next === 'ACCEPTED' && quotation.validUntil < new Date()) {
    throw AppError.conflict(
      `Quotation ${quotation.quotationNumber} expired on ${quotation.validUntil.toISOString().slice(0, 10)} and cannot be accepted. Raise a new one.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.quotation.update({
      where: { id },
      data: { status: next },
      include: quotationDetailInclude,
    });

    // Accepting a quotation is what wins the enquiry. Guarded on the current
    // enquiry status so a second quotation being accepted against an
    // already-WON enquiry does not attempt an illegal transition.
    if (next === 'ACCEPTED' && quotation.enquiry.status === 'QUOTED') {
      await tx.enquiry.update({ where: { id: quotation.enquiryId }, data: { status: 'WON' } });
    }

    return updated;
  }, TX_OPTIONS);
}
