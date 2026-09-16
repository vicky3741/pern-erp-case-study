/**
 * Seed data.
 *
 * Idempotent — every write is an upsert keyed on a natural unique column, so
 * running it twice changes nothing and running it against a half-populated
 * database fills in the gaps.
 *
 *   npm run seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS ?? 10);

/**
 * Inventory starts with reservedQty = 0 across the board.
 *
 * A reservation is something a confirmed sales order creates; seeding one
 * without the order that caused it would put the database in a state the
 * application could never have produced.
 */
const PRODUCTS = [
  {
    productCode: 'BRG-6204',
    name: 'Deep Groove Ball Bearing 6204-2RS',
    category: 'Bearings',
    unit: 'NOS',
    basePrice: '285.00',
    physicalQty: 200,
  },
  {
    productCode: 'VLV-HYD-32',
    name: 'Hydraulic Directional Control Valve 4/3 32mm',
    category: 'Hydraulics',
    unit: 'NOS',
    basePrice: '12500.00',
    physicalQty: 40,
  },
  {
    productCode: 'FST-M12-HT',
    name: 'High Tensile Hex Bolt M12 x 50 Grade 8.8',
    category: 'Fasteners',
    unit: 'NOS',
    basePrice: '18.50',
    physicalQty: 5000,
  },
  {
    productCode: 'BLT-V-B75',
    name: 'V-Belt B75 Industrial Grade',
    category: 'Power Transmission',
    unit: 'NOS',
    basePrice: '640.00',
    physicalQty: 150,
  },
  {
    productCode: 'SEA-OR-NBR',
    name: 'Nitrile O-Ring Seal Kit (50 piece)',
    category: 'Seals & Gaskets',
    unit: 'SET',
    basePrice: '1450.00',
    physicalQty: 80,
  },
  {
    productCode: 'MTR-IND-5HP',
    name: '3-Phase Induction Motor 5HP 1440 RPM',
    category: 'Motors',
    unit: 'NOS',
    basePrice: '24800.00',
    physicalQty: 25,
  },
];

const CUSTOMERS = [
  {
    companyName: 'ABC Engineering Pvt. Ltd.',
    contactPerson: 'Rajesh Kulkarni',
    mobile: '9822012345',
    email: 'procurement@abcengineering.in',
    city: 'Pune',
  },
  {
    companyName: 'Sterling Fabricators',
    contactPerson: 'Meera Nair',
    mobile: '9833045678',
    email: 'purchase@sterlingfab.co.in',
    city: 'Mumbai',
  },
  {
    companyName: 'Deccan Heavy Industries',
    contactPerson: 'Imran Shaikh',
    mobile: '9845067890',
    email: 'stores@deccanheavy.com',
    city: 'Hyderabad',
  },
];

async function main() {
  console.log('[seed] starting\n');

  // ----------------------------- users --------------------------------------
  const adminHash = await bcrypt.hash('Admin@123', SALT_ROUNDS);
  const salesHash = await bcrypt.hash('Sales@123', SALT_ROUNDS);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@erp.local' },
    update: { name: 'Anita Deshpande', role: 'ADMIN', passwordHash: adminHash, isActive: true },
    create: {
      name: 'Anita Deshpande',
      email: 'admin@erp.local',
      passwordHash: adminHash,
      role: 'ADMIN',
    },
  });

  const sales = await prisma.user.upsert({
    where: { email: 'sales@erp.local' },
    update: { name: 'Vikram Rao', role: 'SALES', passwordHash: salesHash, isActive: true },
    create: {
      name: 'Vikram Rao',
      email: 'sales@erp.local',
      passwordHash: salesHash,
      role: 'SALES',
    },
  });

  console.log(`[seed] users      admin=${admin.email}  sales=${sales.email}`);

  // ------------------------ products + inventory ----------------------------
  // The inventory row is created with the product so a product can never exist
  // without one — every availability lookup would otherwise need a null check.
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { productCode: p.productCode },
      update: {
        name: p.name,
        category: p.category,
        unit: p.unit,
        basePrice: p.basePrice,
        isActive: true,
      },
      create: {
        productCode: p.productCode,
        name: p.name,
        category: p.category,
        unit: p.unit,
        basePrice: p.basePrice,
        inventory: { create: { physicalQty: p.physicalQty, reservedQty: 0 } },
      },
    });
  }

  console.log(`[seed] products   ${PRODUCTS.length} products with inventory`);

  // ---------------------------- customers -----------------------------------
  for (const c of CUSTOMERS) {
    await prisma.customer.upsert({
      where: { mobile: c.mobile },
      update: {
        companyName: c.companyName,
        contactPerson: c.contactPerson,
        email: c.email,
        city: c.city,
        isActive: true,
      },
      create: { ...c, createdById: sales.id },
    });
  }

  console.log(`[seed] customers  ${CUSTOMERS.length} customers\n`);

  // ------------------------------ summary -----------------------------------
  const rows = await prisma.product.findMany({
    include: { inventory: true },
    orderBy: { productCode: 'asc' },
  });

  console.log('Product        Unit  Base price   Physical  Reserved  Available');
  console.log('-------------------------------------------------------------------');
  for (const r of rows) {
    const physical = r.inventory?.physicalQty ?? 0;
    const reserved = r.inventory?.reservedQty ?? 0;
    console.log(
      `${r.productCode.padEnd(14)} ${r.unit.padEnd(5)} ${r.basePrice.toFixed(2).padStart(10)} ` +
        `${String(physical).padStart(9)} ${String(reserved).padStart(9)} ` +
        `${String(physical - reserved).padStart(10)}`,
    );
  }

  console.log('\nLogin with:');
  console.log('  ADMIN  admin@erp.local / Admin@123');
  console.log('  SALES  sales@erp.local / Sales@123');
  console.log('\n[seed] done');
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
