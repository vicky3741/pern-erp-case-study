import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { buildPaginationMeta } from '../../utils/response';
import { normaliseSearch, toSkipTake } from '../../utils/query';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from './customer.schema';

export async function createCustomer(input: CreateCustomerInput, createdById: string) {
  // The unique index on mobile is the real guard against duplicates — two
  // simultaneous creates cannot both succeed. This lookup exists only to turn
  // the resulting P2002 into a message that names the existing customer.
  const existing = await prisma.customer.findUnique({ where: { mobile: input.mobile } });
  if (existing) {
    throw AppError.conflict(
      `A customer with mobile ${input.mobile} already exists: ${existing.companyName}`,
    );
  }

  return prisma.customer.create({
    data: { ...input, createdById },
  });
}

export async function listCustomers(query: ListCustomersQuery) {
  const search = normaliseSearch(query.search);

  const where: Prisma.CustomerWhereInput = {
    isActive: true,
    ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
    ...(search
      ? {
          OR: [
            { companyName: { contains: search, mode: 'insensitive' } },
            { contactPerson: { contains: search, mode: 'insensitive' } },
            { mobile: { contains: search } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { companyName: 'asc' },
      ...toSkipTake(query),
    }),
    prisma.customer.count({ where }),
  ]);

  return { rows, meta: buildPaginationMeta(query.page, query.limit, total) };
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      _count: { select: { enquiries: true, quotations: true, salesOrders: true } },
      enquiries: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          enquiryNumber: true,
          enquiryDate: true,
          status: true,
          _count: { select: { items: true } },
        },
      },
    },
  });

  if (!customer) throw AppError.notFound('Customer not found');
  return customer;
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw AppError.notFound('Customer not found');

  if (input.mobile && input.mobile !== customer.mobile) {
    const clash = await prisma.customer.findUnique({ where: { mobile: input.mobile } });
    if (clash) {
      throw AppError.conflict(
        `A customer with mobile ${input.mobile} already exists: ${clash.companyName}`,
      );
    }
  }

  return prisma.customer.update({ where: { id }, data: input });
}
