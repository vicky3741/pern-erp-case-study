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

  // ---------------------- products and inventory ----------------------------
  section('Products and inventory');

  const productList = await call('GET', '/products?limit=100', { token: salesToken });
  status('list products', productList, 200);

  // Asserting an exact count would break as soon as this script creates its own
  // test products, so check that each seeded product is actually there instead.
  const seededCodes = [
    'BRG-6204',
    'VLV-HYD-32',
    'FST-M12-HT',
    'BLT-V-B75',
    'SEA-OR-NBR',
    'MTR-IND-5HP',
  ];
  const returnedCodes = new Set((productList.body?.data ?? []).map((p: any) => p.productCode));
  const absent = seededCodes.filter((code) => !returnedCodes.has(code));
  check('all six seeded products are present', absent.length === 0, absent.length ? `missing ${absent.join(', ')}` : 'all present');

  const first = productList.body?.data?.[0];
  check(
    'available equals physical minus reserved',
    first?.inventory?.availableQty === first?.inventory?.physicalQty - first?.inventory?.reservedQty,
    `${first?.productCode}: ${first?.inventory?.physicalQty} - ${first?.inventory?.reservedQty} = ${first?.inventory?.availableQty}`,
  );

  status(
    'sales cannot create a product',
    await call('POST', '/products', {
      token: salesToken,
      body: { productCode: 'X-1', name: 'Nope', category: 'X', unit: 'NOS', basePrice: 1 },
    }),
    403,
  );

  status('list inventory', await call('GET', '/inventory', { token: salesToken }), 200);

  status(
    'sales cannot adjust inventory',
    await call('PATCH', `/inventory/${first.id}`, {
      token: salesToken,
      body: { delta: 10, reason: 'should be refused' },
    }),
    403,
  );

  const before = first.inventory.physicalQty;
  const addStock = await call('PATCH', `/inventory/${first.id}`, {
    token: adminToken,
    body: { delta: 25, reason: 'smoke test goods inward' },
  });
  status('admin adds stock', addStock, 200);
  check(
    'physical stock increased by the delta',
    addStock.body?.data?.physicalQty === before + 25,
    `${before} -> ${addStock.body?.data?.physicalQty}`,
  );

  const removeStock = await call('PATCH', `/inventory/${first.id}`, {
    token: adminToken,
    body: { delta: -25, reason: 'smoke test reversal' },
  });
  status('admin removes stock', removeStock, 200);
  check('physical stock back to where it started', removeStock.body?.data?.physicalQty === before);

  status(
    'stock cannot be driven negative',
    await call('PATCH', `/inventory/${first.id}`, {
      token: adminToken,
      body: { delta: -9_999_999, reason: 'should be refused' },
    }),
    409,
  );

  status(
    'adjustment needs exactly one of physicalQty or delta',
    await call('PATCH', `/inventory/${first.id}`, {
      token: adminToken,
      body: { physicalQty: 10, delta: 5, reason: 'ambiguous' },
    }),
    400,
  );

  // ----------------------------- quotations ---------------------------------
  section('Quotation pricing');

  const qEnquiry = await call('POST', '/enquiries', {
    token: salesToken,
    body: {
      customerId: customer.id,
      enquiryDate: today,
      requiredDate: nextMonth,
      items: [
        { productId: products[0]!.id, quantity: 100 },
        { productId: products[1]!.id, quantity: 40 },
      ],
    },
  });
  status('enquiry for quotation created', qEnquiry, 201);
  const qEnquiryId = qEnquiry.body?.data?.id;

  const num = (v: unknown) => Number(v);

  // 100 x 250.00, 10% discount, 18% GST -> base 25000, disc 2500,
  //                                        taxable 22500, gst 4050, line 26550
  //  40 x 12500.00, 5% discount, 18% GST -> base 500000, disc 25000,
  //                                        taxable 475000, gst 85500, line 560500
  const quote = await call('POST', '/quotations', {
    token: salesToken,
    body: {
      enquiryId: qEnquiryId,
      quotationDate: today,
      validUntil: nextMonth,
      // Deliberately wrong totals. The schema strips them; the server must
      // ignore them completely and compute its own.
      grandTotal: 1,
      subTotal: 1,
      items: [
        {
          productId: products[0]!.id,
          quantity: 100,
          unitPrice: 250,
          discountPercent: 10,
          gstPercent: 18,
          lineAmount: 1,
        },
        {
          productId: products[1]!.id,
          quantity: 40,
          unitPrice: 12500,
          discountPercent: 5,
          gstPercent: 18,
        },
      ],
    },
  });
  status('create quotation', quote, 201);

  const q = quote.body?.data;
  check('quotation number follows QT-YYYYMM-NNNN', /^QT-\d{6}-\d{4}$/.test(q?.quotationNumber ?? ''), q?.quotationNumber);
  check('quotation starts as DRAFT', q?.status === 'DRAFT', q?.status);

  const line1 = q?.items?.find((i: any) => i.productId === products[0]!.id);
  const line2 = q?.items?.find((i: any) => i.productId === products[1]!.id);
  check('line 1 amount is 26550.00', num(line1?.lineAmount) === 26550, `got ${line1?.lineAmount}`);
  check('line 2 amount is 560500.00', num(line2?.lineAmount) === 560500, `got ${line2?.lineAmount}`);

  check('subTotal is 525000.00', num(q?.subTotal) === 525000, `got ${q?.subTotal}`);
  check('totalDiscount is 27500.00', num(q?.totalDiscount) === 27500, `got ${q?.totalDiscount}`);
  check('totalGst is 89550.00', num(q?.totalGst) === 89550, `got ${q?.totalGst}`);
  check('grandTotal is 587050.00', num(q?.grandTotal) === 587050, `got ${q?.grandTotal}`);

  check(
    'client-sent grandTotal was ignored',
    num(q?.grandTotal) !== 1,
    `client sent 1, server stored ${q?.grandTotal}`,
  );
  check('client-sent lineAmount was ignored', num(line1?.lineAmount) !== 1);

  check(
    'grandTotal equals subTotal - discount + gst',
    num(q?.grandTotal) === num(q?.subTotal) - num(q?.totalDiscount) + num(q?.totalGst),
  );

  check(
    'unit price defaults to the product base price when omitted',
    await (async () => {
      const dbProduct = await prisma.product.findUnique({ where: { id: products[2]!.id } });
      const e = await call('POST', '/enquiries', {
        token: salesToken,
        body: {
          customerId: customer.id,
          enquiryDate: today,
          requiredDate: nextMonth,
          items: [{ productId: products[2]!.id, quantity: 10 }],
        },
      });
      const defaulted = await call('POST', '/quotations', {
        token: salesToken,
        body: {
          enquiryId: e.body?.data?.id,
          quotationDate: today,
          validUntil: nextMonth,
          items: [{ productId: products[2]!.id, quantity: 10 }],
        },
      });
      return num(defaulted.body?.data?.items?.[0]?.unitPrice) === num(dbProduct?.basePrice);
    })(),
  );

  status(
    'discount above 100 percent is rejected',
    await call('POST', '/quotations', {
      token: salesToken,
      body: {
        enquiryId: qEnquiryId,
        quotationDate: today,
        validUntil: nextMonth,
        items: [{ productId: products[0]!.id, quantity: 1, unitPrice: 10, discountPercent: 150 }],
      },
    }),
    400,
  );

  section('Quotation status transitions');

  const enquiryAfterQuote = await call('GET', `/enquiries/${qEnquiryId}`, { token: salesToken });
  check(
    'raising a quotation moved the enquiry to QUOTED',
    enquiryAfterQuote.body?.data?.status === 'QUOTED',
    enquiryAfterQuote.body?.data?.status,
  );

  status(
    'DRAFT cannot be accepted directly',
    await call('PATCH', `/quotations/${q.id}/status`, {
      token: salesToken,
      body: { status: 'ACCEPTED' },
    }),
    409,
  );

  status(
    'DRAFT moves to SENT',
    await call('PATCH', `/quotations/${q.id}/status`, {
      token: salesToken,
      body: { status: 'SENT' },
    }),
    200,
  );

  status(
    'SENT moves to ACCEPTED',
    await call('PATCH', `/quotations/${q.id}/status`, {
      token: salesToken,
      body: { status: 'ACCEPTED' },
    }),
    200,
  );

  const enquiryAfterAccept = await call('GET', `/enquiries/${qEnquiryId}`, { token: salesToken });
  check(
    'accepting the quotation moved the enquiry to WON',
    enquiryAfterAccept.body?.data?.status === 'WON',
    enquiryAfterAccept.body?.data?.status,
  );

  status(
    'ACCEPTED is terminal',
    await call('PATCH', `/quotations/${q.id}/status`, {
      token: salesToken,
      body: { status: 'REJECTED' },
    }),
    409,
  );

  // ------------------- conversion and reservation ---------------------------
  //
  // A dedicated product with a known opening stock, so these checks do not
  // interfere with the seeded data or with each other.
  section('Sales order conversion');

  const stamp = Date.now().toString().slice(-8);
  const testProduct = await call('POST', '/products', {
    token: adminToken,
    body: {
      productCode: `SMOKE-${stamp}`,
      name: 'Smoke test widget',
      category: 'Test',
      unit: 'NOS',
      basePrice: 100,
      openingQty: 100,
    },
  });
  status('admin creates a product with opening stock', testProduct, 201);
  const tp = testProduct.body?.data;
  check('opening stock is 100 available', tp?.inventory?.availableQty === 100, `${tp?.inventory?.availableQty}`);

  /** enquiry -> quotation -> SENT -> ACCEPTED -> sales order. */
  async function buildOrder(productId: string, quantity: number) {
    const e = await call('POST', '/enquiries', {
      token: salesToken,
      body: {
        customerId: customer.id,
        enquiryDate: today,
        requiredDate: nextMonth,
        items: [{ productId, quantity }],
      },
    });
    const qt = await call('POST', '/quotations', {
      token: salesToken,
      body: {
        enquiryId: e.body?.data?.id,
        quotationDate: today,
        validUntil: nextMonth,
        items: [{ productId, quantity, unitPrice: 100, gstPercent: 18 }],
      },
    });
    return { enquiryId: e.body?.data?.id, quotation: qt.body?.data };
  }

  async function accept(quotationId: string) {
    await call('PATCH', `/quotations/${quotationId}/status`, {
      token: salesToken,
      body: { status: 'SENT' },
    });
    return call('PATCH', `/quotations/${quotationId}/status`, {
      token: salesToken,
      body: { status: 'ACCEPTED' },
    });
  }

  // --- a DRAFT quotation cannot become an order ---
  const draft = await buildOrder(tp.id, 10);
  status(
    'DRAFT quotation cannot be converted',
    await call('POST', `/quotations/${draft.quotation.id}/convert`, { token: salesToken }),
    409,
  );

  // --- a REJECTED quotation cannot become an order ---
  const rejected = await buildOrder(tp.id, 10);
  await call('PATCH', `/quotations/${rejected.quotation.id}/status`, {
    token: salesToken,
    body: { status: 'SENT' },
  });
  await call('PATCH', `/quotations/${rejected.quotation.id}/status`, {
    token: salesToken,
    body: { status: 'REJECTED' },
  });
  status(
    'REJECTED quotation cannot be converted',
    await call('POST', `/quotations/${rejected.quotation.id}/convert`, { token: salesToken }),
    409,
  );

  // --- an ACCEPTED quotation converts exactly once ---
  const good = await buildOrder(tp.id, 60);
  await accept(good.quotation.id);

  const converted = await call('POST', `/quotations/${good.quotation.id}/convert`, {
    token: salesToken,
  });
  status('ACCEPTED quotation converts', converted, 201);
  const order = converted.body?.data;
  check('order number follows SO-YYYYMM-NNNN', /^SO-\d{6}-\d{4}$/.test(order?.orderNumber ?? ''), order?.orderNumber);
  check('order starts PENDING', order?.status === 'PENDING', order?.status);
  check('order total matches the quotation', num(order?.totalAmount) === num(good.quotation.grandTotal));

  status(
    'the same quotation cannot convert twice',
    await call('POST', `/quotations/${good.quotation.id}/convert`, { token: salesToken }),
    409,
  );

  const orderCount = await prisma.salesOrder.count({ where: { quotationId: good.quotation.id } });
  check('exactly one sales order exists for that quotation', orderCount === 1, `${orderCount}`);

  check(
    'converting reserved nothing yet',
    (await call('GET', `/inventory/${tp.id}`, { token: salesToken })).body?.data?.reservedQty === 0,
  );

  section('Inventory reservation');

  status(
    'sales cannot confirm a sales order',
    await call('POST', `/sales-orders/${order.id}/confirm`, { token: salesToken }),
    403,
  );

  const confirmed = await call('POST', `/sales-orders/${order.id}/confirm`, { token: adminToken });
  status('admin confirms the order', confirmed, 200);
  check('order is CONFIRMED', confirmed.body?.data?.status === 'CONFIRMED');

  const afterConfirm = (await call('GET', `/inventory/${tp.id}`, { token: adminToken })).body?.data;
  check('reserved rose to 60', afterConfirm?.reservedQty === 60, `reserved ${afterConfirm?.reservedQty}`);
  check(
    'physical stock did NOT change',
    afterConfirm?.physicalQty === 100,
    `physical ${afterConfirm?.physicalQty}`,
  );
  check('available fell to 40', afterConfirm?.availableQty === 40, `available ${afterConfirm?.availableQty}`);

  status(
    'a confirmed order cannot be confirmed again',
    await call('POST', `/sales-orders/${order.id}/confirm`, { token: adminToken }),
    409,
  );

  // --- over-reservation is refused, and changes nothing ---
  const tooBig = await buildOrder(tp.id, 80); // only 40 available
  await accept(tooBig.quotation.id);
  const tooBigOrder = (
    await call('POST', `/quotations/${tooBig.quotation.id}/convert`, { token: salesToken })
  ).body?.data;

  const refused = await call('POST', `/sales-orders/${tooBigOrder.id}/confirm`, {
    token: adminToken,
  });
  status('confirming beyond available stock is refused', refused, 409);
  check(
    'the refusal names the shortfall',
    Array.isArray(refused.body?.details?.insufficientStock) &&
      refused.body.details.insufficientStock[0]?.shortBy === 40,
    refused.body?.message,
  );

  const afterRefusal = (await call('GET', `/inventory/${tp.id}`, { token: adminToken })).body?.data;
  check(
    'the failed confirmation reserved nothing (transaction rolled back)',
    afterRefusal?.reservedQty === 60,
    `reserved still ${afterRefusal?.reservedQty}`,
  );

  // --- cancelling releases the reservation ---
  section('Cancellation releases stock');

  status(
    'sales cannot cancel',
    await call('POST', `/sales-orders/${order.id}/cancel`, {
      token: salesToken,
      body: { reason: 'should be refused' },
    }),
    403,
  );

  const cancelled = await call('POST', `/sales-orders/${order.id}/cancel`, {
    token: adminToken,
    body: { reason: 'smoke test rollback' },
  });
  status('admin cancels the confirmed order', cancelled, 200);

  const afterCancel = (await call('GET', `/inventory/${tp.id}`, { token: adminToken })).body?.data;
  check('reservation released back to 0', afterCancel?.reservedQty === 0, `reserved ${afterCancel?.reservedQty}`);
  check('physical stock still 100', afterCancel?.physicalQty === 100);
  check('available back to 100', afterCancel?.availableQty === 100);

  status(
    'a cancelled order cannot be confirmed',
    await call('POST', `/sales-orders/${order.id}/confirm`, { token: adminToken }),
    409,
  );

  // ------------------------------------------------------------------------
  // The scenario the brief calls out by name.
  // ------------------------------------------------------------------------
  section('Concurrent reservation — the brief\'s scenario');

  const raceProduct = (
    await call('POST', '/products', {
      token: adminToken,
      body: {
        productCode: `RACE-${stamp}`,
        name: 'Concurrency test widget',
        category: 'Test',
        unit: 'NOS',
        basePrice: 100,
        openingQty: 100,
      },
    })
  ).body?.data;

  // Two orders against 100 units: one for 80, one for 50. Both cannot succeed.
  const a80 = await buildOrder(raceProduct.id, 80);
  await accept(a80.quotation.id);
  const orderA = (
    await call('POST', `/quotations/${a80.quotation.id}/convert`, { token: salesToken })
  ).body?.data;

  const b50 = await buildOrder(raceProduct.id, 50);
  await accept(b50.quotation.id);
  const orderB = (
    await call('POST', `/quotations/${b50.quotation.id}/convert`, { token: salesToken })
  ).body?.data;

  const [resA, resB] = await Promise.all([
    call('POST', `/sales-orders/${orderA.id}/confirm`, { token: adminToken }),
    call('POST', `/sales-orders/${orderB.id}/confirm`, { token: adminToken }),
  ]);

  const wins = [resA, resB].filter((r) => r.status === 200).length;
  const losses = [resA, resB].filter((r) => r.status === 409).length;

  check('exactly one reservation succeeded', wins === 1, `80-unit: ${resA.status}, 50-unit: ${resB.status}`);
  check('exactly one was refused', losses === 1);

  const raceFinal = (await call('GET', `/inventory/${raceProduct.id}`, { token: adminToken })).body
    ?.data;
  check(
    'reserved is 80 or 50, never 130',
    raceFinal?.reservedQty === 80 || raceFinal?.reservedQty === 50,
    `reserved ${raceFinal?.reservedQty}, available ${raceFinal?.availableQty}`,
  );
  check('physical stock untouched by reservation', raceFinal?.physicalQty === 100);

  // --- ten at once against 120, each wanting 20 -> exactly six may win ---
  const burstProduct = (
    await call('POST', '/products', {
      token: adminToken,
      body: {
        productCode: `BURST-${stamp}`,
        name: 'Burst test widget',
        category: 'Test',
        unit: 'NOS',
        basePrice: 10,
        openingQty: 120,
      },
    })
  ).body?.data;

  const burstOrders = [];
  for (let i = 0; i < 10; i += 1) {
    const built = await buildOrder(burstProduct.id, 20);
    await accept(built.quotation.id);
    const so = (
      await call('POST', `/quotations/${built.quotation.id}/convert`, { token: salesToken })
    ).body?.data;
    burstOrders.push(so);
  }

  const burstResults = await Promise.all(
    burstOrders.map((so) => call('POST', `/sales-orders/${so.id}/confirm`, { token: adminToken })),
  );
  const burstWins = burstResults.filter((r) => r.status === 200).length;
  const burstFinal = (await call('GET', `/inventory/${burstProduct.id}`, { token: adminToken })).body
    ?.data;

  check('exactly six of ten concurrent reservations succeeded', burstWins === 6, `${burstWins}/10`);
  check(
    'reserved landed exactly on 120, never above',
    burstFinal?.reservedQty === 120,
    `reserved ${burstFinal?.reservedQty} of physical ${burstFinal?.physicalQty}`,
  );
  check('available is exactly 0', burstFinal?.availableQty === 0);

  // -------------------------------- dispatch --------------------------------
  section('Dispatch');

  const dispProduct = (
    await call('POST', '/products', {
      token: adminToken,
      body: {
        productCode: `DISP-${stamp}`,
        name: 'Dispatch test widget',
        category: 'Test',
        unit: 'NOS',
        basePrice: 100,
        openingQty: 100,
      },
    })
  ).body?.data;

  const pendingBuild = await buildOrder(dispProduct.id, 60);
  await accept(pendingBuild.quotation.id);
  const dispOrder = (
    await call('POST', `/quotations/${pendingBuild.quotation.id}/convert`, { token: salesToken })
  ).body?.data;

  const dispatchBody = {
    dispatchDate: today,
    vehicleNumber: 'MH12AB1234',
    driverName: 'Suresh Patil',
    items: [{ productId: dispProduct.id, quantity: 60 }],
  };

  status(
    'a PENDING order cannot be dispatched',
    await call('POST', `/sales-orders/${dispOrder.id}/dispatch`, {
      token: adminToken,
      body: dispatchBody,
    }),
    409,
  );

  await call('POST', `/sales-orders/${dispOrder.id}/confirm`, { token: adminToken });
  const beforeDispatch = (await call('GET', `/inventory/${dispProduct.id}`, { token: adminToken }))
    .body?.data;
  check(
    'before dispatch: physical 100, reserved 60, available 40',
    beforeDispatch?.physicalQty === 100 &&
      beforeDispatch?.reservedQty === 60 &&
      beforeDispatch?.availableQty === 40,
    `${beforeDispatch?.physicalQty}/${beforeDispatch?.reservedQty}/${beforeDispatch?.availableQty}`,
  );

  status(
    'sales cannot dispatch',
    await call('POST', `/sales-orders/${dispOrder.id}/dispatch`, {
      token: salesToken,
      body: dispatchBody,
    }),
    403,
  );

  status(
    'cannot dispatch more than remains on the line',
    await call('POST', `/sales-orders/${dispOrder.id}/dispatch`, {
      token: adminToken,
      body: { ...dispatchBody, items: [{ productId: dispProduct.id, quantity: 61 }] },
    }),
    409,
  );

  const dispatched = await call('POST', `/sales-orders/${dispOrder.id}/dispatch`, {
    token: adminToken,
    body: dispatchBody,
  });
  status('admin dispatches the full order', dispatched, 201);
  check(
    'dispatch number follows DSP-YYYYMM-NNNN',
    /^DSP-\d{6}-\d{4}$/.test(dispatched.body?.data?.dispatchNumber ?? ''),
    dispatched.body?.data?.dispatchNumber,
  );

  const afterDispatch = (await call('GET', `/inventory/${dispProduct.id}`, { token: adminToken }))
    .body?.data;
  check(
    'after dispatch: physical 40, reserved 0, available 40',
    afterDispatch?.physicalQty === 40 &&
      afterDispatch?.reservedQty === 0 &&
      afterDispatch?.availableQty === 40,
    `${afterDispatch?.physicalQty}/${afterDispatch?.reservedQty}/${afterDispatch?.availableQty}`,
  );

  const orderAfterDispatch = (
    await call('GET', `/sales-orders/${dispOrder.id}`, { token: adminToken })
  ).body?.data;
  check('order became DISPATCHED', orderAfterDispatch?.status === 'DISPATCHED', orderAfterDispatch?.status);

  status(
    'the same quantity cannot be dispatched twice',
    await call('POST', `/sales-orders/${dispOrder.id}/dispatch`, {
      token: adminToken,
      body: dispatchBody,
    }),
    409,
  );

  status(
    'a dispatched order cannot be cancelled',
    await call('POST', `/sales-orders/${dispOrder.id}/cancel`, {
      token: adminToken,
      body: { reason: 'too late' },
    }),
    409,
  );

  // --- partial dispatch ---
  section('Partial dispatch');

  const partProduct = (
    await call('POST', '/products', {
      token: adminToken,
      body: {
        productCode: `PART-${stamp}`,
        name: 'Partial dispatch widget',
        category: 'Test',
        unit: 'NOS',
        basePrice: 50,
        openingQty: 200,
      },
    })
  ).body?.data;

  const partBuild = await buildOrder(partProduct.id, 50);
  await accept(partBuild.quotation.id);
  const partOrder = (
    await call('POST', `/quotations/${partBuild.quotation.id}/convert`, { token: salesToken })
  ).body?.data;
  await call('POST', `/sales-orders/${partOrder.id}/confirm`, { token: adminToken });

  status(
    'first partial dispatch of 20',
    await call('POST', `/sales-orders/${partOrder.id}/dispatch`, {
      token: adminToken,
      body: {
        dispatchDate: today,
        vehicleNumber: 'MH14XY5678',
        driverName: 'Ramesh Jadhav',
        items: [{ productId: partProduct.id, quantity: 20 }],
      },
    }),
    201,
  );

  const midPart = (await call('GET', `/sales-orders/${partOrder.id}`, { token: adminToken })).body
    ?.data;
  check('order stays CONFIRMED after a partial dispatch', midPart?.status === 'CONFIRMED', midPart?.status);
  check('line shows 20 dispatched, 30 remaining', midPart?.items?.[0]?.dispatchedQty === 20 && midPart?.items?.[0]?.remainingQty === 30);

  const midStock = (await call('GET', `/inventory/${partProduct.id}`, { token: adminToken })).body
    ?.data;
  check(
    'partial dispatch moved both numbers by 20',
    midStock?.physicalQty === 180 && midStock?.reservedQty === 30,
    `physical ${midStock?.physicalQty}, reserved ${midStock?.reservedQty}`,
  );

  status(
    'cannot dispatch 40 when only 30 remain',
    await call('POST', `/sales-orders/${partOrder.id}/dispatch`, {
      token: adminToken,
      body: {
        dispatchDate: today,
        vehicleNumber: 'MH14XY5678',
        driverName: 'Ramesh Jadhav',
        items: [{ productId: partProduct.id, quantity: 40 }],
      },
    }),
    409,
  );

  status(
    'final dispatch of the remaining 30',
    await call('POST', `/sales-orders/${partOrder.id}/dispatch`, {
      token: adminToken,
      body: {
        dispatchDate: today,
        vehicleNumber: 'MH14XY5678',
        driverName: 'Ramesh Jadhav',
        items: [{ productId: partProduct.id, quantity: 30 }],
      },
    }),
    201,
  );

  const endPart = (await call('GET', `/sales-orders/${partOrder.id}`, { token: adminToken })).body
    ?.data;
  check('order becomes DISPATCHED once every line has left', endPart?.status === 'DISPATCHED', endPart?.status);

  const endStock = (await call('GET', `/inventory/${partProduct.id}`, { token: adminToken })).body
    ?.data;
  check(
    'reservation fully consumed',
    endStock?.physicalQty === 150 && endStock?.reservedQty === 0,
    `physical ${endStock?.physicalQty}, reserved ${endStock?.reservedQty}`,
  );

  // --- a cancelled order must never ship ---
  const cancelledBuild = await buildOrder(partProduct.id, 10);
  await accept(cancelledBuild.quotation.id);
  const cancelledOrder = (
    await call('POST', `/quotations/${cancelledBuild.quotation.id}/convert`, { token: salesToken })
  ).body?.data;
  await call('POST', `/sales-orders/${cancelledOrder.id}/confirm`, { token: adminToken });
  await call('POST', `/sales-orders/${cancelledOrder.id}/cancel`, {
    token: adminToken,
    body: { reason: 'customer withdrew' },
  });

  status(
    'a cancelled order cannot be dispatched',
    await call('POST', `/sales-orders/${cancelledOrder.id}/dispatch`, {
      token: adminToken,
      body: {
        dispatchDate: today,
        vehicleNumber: 'MH14XY5678',
        driverName: 'Ramesh Jadhav',
        items: [{ productId: partProduct.id, quantity: 10 }],
      },
    }),
    409,
  );

  status('list dispatches', await call('GET', '/dispatches', { token: salesToken }), 200);

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
