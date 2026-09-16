import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/prisma';

/**
 * Fixtures shared by the test suite.
 *
 * Every test file truncates and rebuilds, so tests never depend on what another
 * file left behind, and a failing test cannot cascade into unrelated failures.
 */

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

export async function resetDatabase() {
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export const TEST_PASSWORD = 'Test@1234';

export interface Fixtures {
  admin: { id: string; email: string };
  sales: { id: string; email: string };
  customer: { id: string };
  /** Physical 100, reserved 0 — so available starts at 100. */
  productA: { id: string; productCode: string };
  /** Physical 40, reserved 0. */
  productB: { id: string; productCode: string };
}

/**
 * Builds the standard fixture set.
 *
 * bcrypt cost is forced to 4 here. The default of 10 is deliberately slow, and
 * the suite hashes on every file; 4 is meaningless for security but the
 * passwords are throwaway and the rounds are not what is under test.
 */
export async function seedFixtures(): Promise<Fixtures> {
  const hash = await bcrypt.hash(TEST_PASSWORD, 4);

  const admin = await prisma.user.create({
    data: { name: 'Test Admin', email: 'admin@test.local', passwordHash: hash, role: 'ADMIN' },
  });

  const sales = await prisma.user.create({
    data: { name: 'Test Sales', email: 'sales@test.local', passwordHash: hash, role: 'SALES' },
  });

  const customer = await prisma.customer.create({
    data: {
      companyName: 'Test Engineering Pvt. Ltd.',
      contactPerson: 'Test Contact',
      mobile: '9876543210',
      email: 'buyer@test.local',
      city: 'Pune',
      createdById: sales.id,
    },
  });

  const productA = await prisma.product.create({
    data: {
      productCode: 'TEST-A',
      name: 'Test Product A',
      category: 'Test',
      unit: 'NOS',
      basePrice: '250.00',
      inventory: { create: { physicalQty: 100, reservedQty: 0 } },
    },
  });

  const productB = await prisma.product.create({
    data: {
      productCode: 'TEST-B',
      name: 'Test Product B',
      category: 'Test',
      unit: 'NOS',
      basePrice: '12500.00',
      inventory: { create: { physicalQty: 40, reservedQty: 0 } },
    },
  });

  return { admin, sales, customer, productA, productB };
}

/** Reads the three stock numbers for a product. */
export async function stockOf(productId: string) {
  const row = await prisma.inventory.findUniqueOrThrow({ where: { productId } });
  return {
    physicalQty: row.physicalQty,
    reservedQty: row.reservedQty,
    availableQty: row.physicalQty - row.reservedQty,
  };
}

/** Sets a product's stock directly, for tests that need a specific starting point. */
export async function setStock(productId: string, physicalQty: number, reservedQty = 0) {
  await prisma.inventory.update({
    where: { productId },
    data: { physicalQty, reservedQty },
  });
}
