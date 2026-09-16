import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { resetDatabase, seedFixtures, type Fixtures } from './helpers/db';
import { acceptQuotation, api, loginAs, makeQuotation } from './helpers/api';

/**
 * Test 3 — The same quotation cannot generate duplicate sales orders.
 *
 * The service checks for an existing order before inserting, but that check is
 * a race. The guarantee comes from the UNIQUE constraint on
 * sales_orders.quotationId, which the concurrent case below exercises directly.
 */
describe('Test 3: the same quotation cannot generate duplicate sales orders', () => {
  let fx: Fixtures;
  let salesToken: string;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixtures();
    salesToken = await loginAs(fx.sales.email);
  });

  it('refuses a second sequential conversion', async () => {
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);
    await acceptQuotation(salesToken, quotation.id);

    const first = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);
    expect(first.status).toBe(201);

    const second = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);
    expect(second.status).toBe(409);
    expect(second.body.message).toContain(first.body.data.orderNumber);

    expect(await prisma.salesOrder.count({ where: { quotationId: quotation.id } })).toBe(1);
  });

  it('survives two simultaneous conversions of the same quotation', async () => {
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);
    await acceptQuotation(salesToken, quotation.id);

    // Both requests read "no sales order yet" before either has written, so
    // both pass the application check. The unique index is what stops the
    // second INSERT.
    const [a, b] = await Promise.all([
      api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken),
      api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken),
    ]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    expect(await prisma.salesOrder.count({ where: { quotationId: quotation.id } })).toBe(1);
  });

  it('gives each sales order a distinct order number', async () => {
    const orders = [];
    for (let i = 0; i < 3; i += 1) {
      const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
        { productId: fx.productA.id, quantity: 1, unitPrice: 100 },
      ]);
      await acceptQuotation(salesToken, quotation.id);
      const res = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);
      orders.push(res.body.data.orderNumber);
    }

    expect(new Set(orders).size).toBe(3);
    orders.forEach((n) => expect(n).toMatch(/^SO-\d{6}-\d{4}$/));
  });
});
