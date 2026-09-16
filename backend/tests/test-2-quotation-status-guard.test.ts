import { beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { resetDatabase, seedFixtures, type Fixtures } from './helpers/db';
import { acceptQuotation, api, loginAs, makeQuotation } from './helpers/api';

/**
 * Test 2 — A REJECTED or DRAFT quotation cannot create a sales order.
 *
 * Each case asserts two things: the request is refused, and no sales order row
 * appeared. A 409 that still wrote a row would be worse than no check at all.
 */
describe('Test 2: rejected or draft quotation cannot create a sales order', () => {
  let fx: Fixtures;
  let salesToken: string;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixtures();
    salesToken = await loginAs(fx.sales.email);
  });

  it('refuses a DRAFT quotation', async () => {
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);
    expect(quotation.status).toBe('DRAFT');

    const res = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('DRAFT');
    expect(await prisma.salesOrder.count({ where: { quotationId: quotation.id } })).toBe(0);
  });

  it('refuses a SENT quotation the customer has not answered yet', async () => {
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);
    await api.patch(`/api/quotations/${quotation.id}/status`, { status: 'SENT' }, salesToken);

    const res = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('SENT');
    expect(await prisma.salesOrder.count({ where: { quotationId: quotation.id } })).toBe(0);
  });

  it('refuses a REJECTED quotation', async () => {
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);
    await api.patch(`/api/quotations/${quotation.id}/status`, { status: 'SENT' }, salesToken);
    await api.patch(`/api/quotations/${quotation.id}/status`, { status: 'REJECTED' }, salesToken);

    const res = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('REJECTED');
    expect(await prisma.salesOrder.count({ where: { quotationId: quotation.id } })).toBe(0);
  });

  it('accepts an ACCEPTED quotation', async () => {
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);
    await acceptQuotation(salesToken, quotation.id);

    const res = await api.post(`/api/quotations/${quotation.id}/convert`, {}, salesToken);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PENDING');
    expect(await prisma.salesOrder.count({ where: { quotationId: quotation.id } })).toBe(1);
  });

  it('will not let a DRAFT be accepted directly, closing the back door', async () => {
    // Without this, a DRAFT could be flipped straight to ACCEPTED and then
    // converted, which would defeat the guard above.
    const { quotation } = await makeQuotation(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 5, unitPrice: 100 },
    ]);

    const res = await api.patch(
      `/api/quotations/${quotation.id}/status`,
      { status: 'ACCEPTED' },
      salesToken,
    );

    expect(res.status).toBe(409);
    const stored = await prisma.quotation.findUniqueOrThrow({ where: { id: quotation.id } });
    expect(stored.status).toBe('DRAFT');
  });
});
