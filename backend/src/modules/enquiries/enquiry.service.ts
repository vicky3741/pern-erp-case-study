import type { EnquiryStatus, Prisma } from '@prisma/client';
import { prisma, TX_OPTIONS } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import { nextDocumentNumber } from '../../utils/documentNumber';
import type { CreateEnquiryInput, ListEnquiriesQuery } from './enquiry.schema';

/**
 * The enquiry lifecycle, as an explicit map of what may follow what.
 *
 *   NEW    → QUOTED (a quotation was raised) or LOST (customer walked away)
 *   QUOTED → WON (quotation accepted) or LOST (rejected / went elsewhere)
 *   WON, LOST are terminal.
 *
 * Writing it as data rather than as a chain of if-statements means the rule
 * can be read in one glance, and adding a status is a one-line change.
 */
const ALLOWED_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: ['QUOTED', 'LOST'],
  QUOTED: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

/** Shape returned for a single enquiry, used by both create and getById. */
const enquiryDetailInclude = {
  customer: {
    select: {
      id: true,
      companyName: true,
      contactPerson: true,
      mobile: true,
      email: true,
      city: true,
    },
  },
  createdBy: { select: { id: true, name: true, email: true } },
  items: {
    include: {
      product: {
        select: { id: true, productCode: true, name: true, unit: true, basePrice: true },
      },
    },
  },
} satisfies Prisma.EnquiryInclude;

export async function createEnquiry(input: CreateEnquiryInput, createdById: string) {
  // --------------------------------------------------------------------------
  // Validation runs BEFORE the transaction opens, on purpose.
  //
  // These are read-only existence checks. Allocating the enquiry number takes a
  // row lock on the counter that is held until commit, so every other request
  // creating an enquiry this month queues behind this one. Anything done inside
  // the transaction is time that other requests spend waiting, so the
  // transaction is kept to the two writes that genuinely belong together.
  //
  // The window this opens is tiny and harmless: a product could in principle be
  // deactivated between the check and the insert. The foreign key still
  // guarantees the reference is valid, so the worst outcome is an enquiry
  // naming a product that was retired a few milliseconds ago.
  // --------------------------------------------------------------------------
  const customer = await prisma.customer.findUnique({ where: { id: input.customerId } });
  if (!customer) throw AppError.badRequest('Customer not found');
  if (!customer.isActive) throw AppError.badRequest('That customer is no longer active');

  // Validate every product in one query rather than one query per line.
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, productCode: true, isActive: true },
  });

  const found = new Map(products.map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw AppError.badRequest(`Unknown product${missing.length > 1 ? 's' : ''}`, {
      productIds: missing,
    });
  }

  const inactive = products.filter((p) => !p.isActive).map((p) => p.productCode);
  if (inactive.length > 0) {
    throw AppError.badRequest(`These products are no longer active: ${inactive.join(', ')}`);
  }

  // The number and the document are created together. If the insert fails the
  // counter rolls back with it, so a failed request does not burn a number.
  return prisma.$transaction(async (tx) => {
    const enquiryNumber = await nextDocumentNumber(tx, 'ENQ', input.enquiryDate);

    return tx.enquiry.create({
      data: {
        enquiryNumber,
        customerId: input.customerId,
        enquiryDate: input.enquiryDate,
        requiredDate: input.requiredDate,
        notes: input.notes,
        createdById,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            notes: i.notes,
          })),
        },
      },
      include: enquiryDetailInclude,
    });
  }, TX_OPTIONS);
}

export async function listEnquiries(query: ListEnquiriesQuery) {
  const search = normaliseSearch(query.search);

  const where: Prisma.EnquiryWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(search
      ? {
          OR: [
            { enquiryNumber: { contains: search, mode: 'insensitive' } },
            { customer: { companyName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.enquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, companyName: true, city: true } },
        _count: { select: { items: true, quotations: true } },
      },
      ...toSkipTake(query),
    }),
    prisma.enquiry.count({ where }),
  ]);

  return { rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getEnquiryById(id: string) {
  const enquiry = await prisma.enquiry.findUnique({
    where: { id },
    include: {
      ...enquiryDetailInclude,
      quotations: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          quotationNumber: true,
          status: true,
          grandTotal: true,
          validUntil: true,
        },
      },
    },
  });

  if (!enquiry) throw AppError.notFound('Enquiry not found');
  return enquiry;
}

export async function updateEnquiryStatus(id: string, next: EnquiryStatus) {
  const enquiry = await prisma.enquiry.findUnique({ where: { id } });
  if (!enquiry) throw AppError.notFound('Enquiry not found');

  if (enquiry.status === next) {
    throw AppError.conflict(`Enquiry ${enquiry.enquiryNumber} is already ${next}`);
  }

  const allowed = ALLOWED_TRANSITIONS[enquiry.status];
  if (!allowed.includes(next)) {
    throw AppError.conflict(
      allowed.length === 0
        ? `Enquiry ${enquiry.enquiryNumber} is ${enquiry.status}, which is final and cannot be changed.`
        : `Enquiry ${enquiry.enquiryNumber} is ${enquiry.status}; it can only move to ${allowed.join(' or ')}.`,
    );
  }

  return prisma.enquiry.update({
    where: { id },
    data: { status: next },
    include: enquiryDetailInclude,
  });
}
