/**
 * End-to-end smoke test against a RUNNING server.
 *
 *   npm run dev          # in one terminal
 *   npm run test:smoke   # in another
 *
 * This is not the automated test suite — that lives in tests/ and runs with
 * `npm test` against its own database. This script exercises the real API over
 * HTTP against the development database, which is useful while building and
 * before recording a demo.
 *
 * It grows one section at a time as modules are added.
 */
import { PrismaClient } from '@prisma/client';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:4000/api';
const prisma = new PrismaClient();

// ----------------------------- tiny harness ---------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? `  (${detail})` : ''}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`);
  }
}

interface Res {
  status: number;
  body: any;
}

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<Res> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* empty body, e.g. 204 */
  }
  return { status: res.status, body };
}

function status(name: string, res: Res, want: number) {
  check(name, res.status === want, `want ${want}, got ${res.status}${res.status !== want && res.body?.message ? ` — ${res.body.message}` : ''}`);
}

function section(title: string) {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

// --------------------------------- run --------------------------------------

async function main() {
  console.log(`Smoke test against ${BASE}\n`);

  const health = await call('GET', '/health');
  if (health.status !== 200) {
    console.error(`Server is not healthy at ${BASE}. Start it with: npm run dev`);
    process.exit(1);
  }

  // ------------------------------ auth --------------------------------------
  section('Auth and RBAC');

  const adminLogin = await call('POST', '/auth/login', {
    body: { email: 'admin@erp.local', password: 'Admin@123' },
  });
  status('admin logs in', adminLogin, 200);
  const adminToken: string = adminLogin.body?.data?.token;

  const salesLogin = await call('POST', '/auth/login', {
    body: { email: 'sales@erp.local', password: 'Sales@123' },
  });
  status('sales logs in', salesLogin, 200);
  const salesToken: string = salesLogin.body?.data?.token;

  const wrongPassword = await call('POST', '/auth/login', {
    body: { email: 'admin@erp.local', password: 'nope' },
  });
  status('wrong password is rejected', wrongPassword, 401);

  const unknownEmail = await call('POST', '/auth/login', {
    body: { email: 'ghost@erp.local', password: 'Admin@123' },
  });
  status('unknown email is rejected', unknownEmail, 401);
  check(
    'both login failures return the same message',
    wrongPassword.body?.message === unknownEmail.body?.message,
    wrongPassword.body?.message,
  );

  status('no token is rejected', await call('GET', '/auth/me'), 401);
  status(
    'sales cannot reach an admin-only route',
    await call('GET', '/auth/admin-check', { token: salesToken }),
    403,
  );

  // --------------------------- customers ------------------------------------
  section('Customers');

  const list = await call('GET', '/customers?search=ABC', { token: salesToken });
  status('list customers', list, 200);
  const customer = list.body?.data?.[0];
  check('seeded customer is found', Boolean(customer), customer?.companyName);

  const dupMobile = await call('POST', '/customers', {
    token: salesToken,
    body: {
      companyName: 'Duplicate Co',
      contactPerson: 'Someone',
      mobile: customer.mobile,
      email: 'dup@example.com',
      city: 'Pune',
    },
  });
  status('duplicate mobile is rejected', dupMobile, 409);

  status(
    'invalid mobile is rejected',
    await call('POST', '/customers', {
      token: salesToken,
      body: {
        companyName: 'Bad Mobile Co',
        contactPerson: 'Someone',
        mobile: '12345',
        email: 'bad@example.com',
        city: 'Pune',
      },
    }),
    400,
  );

  // --------------------------- enquiries ------------------------------------
  section('Enquiries');

  // Products have no API yet (next section), so read them straight from the DB.
  const products = await prisma.product.findMany({
    orderBy: { productCode: 'asc' },
    take: 3,
    select: { id: true, productCode: true },
  });
  check('three seeded products available', products.length === 3);

  const today = new Date().toISOString().slice(0, 10);
  const nextMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  const createEnquiry = await call('POST', '/enquiries', {
    token: salesToken,
    body: {
      customerId: customer.id,
      enquiryDate: today,
      requiredDate: nextMonth,
      notes: 'Smoke test enquiry',
      items: [
        { productId: products[0]!.id, quantity: 100 },
        { productId: products[1]!.id, quantity: 40 },
        { productId: products[2]!.id, quantity: 200 },
      ],
    },
  });
  status('create enquiry with three lines', createEnquiry, 201);

  const enquiry = createEnquiry.body?.data;
  check(
    'enquiry number follows ENQ-YYYYMM-NNNN',
    /^ENQ-\d{6}-\d{4}$/.test(enquiry?.enquiryNumber ?? ''),
    enquiry?.enquiryNumber,
  );
  check('enquiry starts as NEW', enquiry?.status === 'NEW', enquiry?.status);
  check('three line items stored', enquiry?.items?.length === 3);

  status(
    'enquiry with no items is rejected',
    await call('POST', '/enquiries', {
      token: salesToken,
      body: { customerId: customer.id, enquiryDate: today, requiredDate: nextMonth, items: [] },
    }),
    400,
  );

  status(
    'duplicate product line is rejected',
    await call('POST', '/enquiries', {
      token: salesToken,
      body: {
        customerId: customer.id,
        enquiryDate: today,
        requiredDate: nextMonth,
        items: [
          { productId: products[0]!.id, quantity: 10 },
          { productId: products[0]!.id, quantity: 5 },
        ],
      },
    }),
    400,
  );

  status(
    'required date before enquiry date is rejected',
    await call('POST', '/enquiries', {
      token: salesToken,
      body: {
        customerId: customer.id,
        enquiryDate: nextMonth,
        requiredDate: today,
        items: [{ productId: products[0]!.id, quantity: 10 }],
      },
    }),
    400,
  );

  status(
    'zero quantity is rejected',
    await call('POST', '/enquiries', {
      token: salesToken,
      body: {
        customerId: customer.id,
        enquiryDate: today,
        requiredDate: nextMonth,
        items: [{ productId: products[0]!.id, quantity: 0 }],
      },
    }),
    400,
  );

  status(
    'unknown product is rejected',
    await call('POST', '/enquiries', {
      token: salesToken,
      body: {
        customerId: customer.id,
        enquiryDate: today,
        requiredDate: nextMonth,
        items: [{ productId: 'does-not-exist', quantity: 10 }],
      },
    }),
    400,
  );

  section('Enquiry status transitions');

  status(
    'NEW cannot jump straight to WON',
    await call('PATCH', `/enquiries/${enquiry.id}/status`, {
      token: salesToken,
      body: { status: 'WON' },
    }),
    409,
  );

  const toQuoted = await call('PATCH', `/enquiries/${enquiry.id}/status`, {
    token: salesToken,
    body: { status: 'QUOTED' },
  });
  status('NEW moves to QUOTED', toQuoted, 200);

  const toWon = await call('PATCH', `/enquiries/${enquiry.id}/status`, {
    token: adminToken,
    body: { status: 'WON' },
  });
  status('QUOTED moves to WON', toWon, 200);

  status(
    'WON is terminal',
    await call('PATCH', `/enquiries/${enquiry.id}/status`, {
      token: adminToken,
      body: { status: 'LOST' },
    }),
    409,
  );

  section('Document numbering');

  const second = await call('POST', '/enquiries', {
    token: salesToken,
    body: {
      customerId: customer.id,
      enquiryDate: today,
      requiredDate: nextMonth,
      items: [{ productId: products[0]!.id, quantity: 5 }],
    },
  });
  status('second enquiry created', second, 201);

  const a = Number(enquiry.enquiryNumber.split('-')[2]);
  const b = Number(second.body?.data?.enquiryNumber.split('-')[2]);
  check('numbers increment', b > a, `${enquiry.enquiryNumber} then ${second.body?.data?.enquiryNumber}`);

  // Ten enquiries at once must produce ten distinct numbers.
  const burst = await Promise.all(
    Array.from({ length: 10 }, () =>
      call('POST', '/enquiries', {
        token: salesToken,
        body: {
          customerId: customer.id,
          enquiryDate: today,
          requiredDate: nextMonth,
          items: [{ productId: products[0]!.id, quantity: 1 }],
        },
      }),
    ),
  );
  const numbers = burst.map((r) => r.body?.data?.enquiryNumber).filter(Boolean);
  check('ten concurrent creates all succeeded', numbers.length === 10, `${numbers.length}/10`);
  check(
    'ten concurrent creates produced ten distinct numbers',
    new Set(numbers).size === 10,
    `${new Set(numbers).size} distinct`,
  );

  // ------------------------------ summary -----------------------------------
  console.log(`\n${'='.repeat(60)}`);
  console.log(`passed ${passed}   failed ${failed}`);
  if (failed > 0) {
    console.log('\nfailed checks:');
    failures.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('='.repeat(60));

  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\nsmoke test crashed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
