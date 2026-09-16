import { beforeAll, describe, expect, it } from 'vitest';
import { resetDatabase, seedFixtures, stockOf, type Fixtures } from './helpers/db';
import { api, loginAs, makeSalesOrder } from './helpers/api';

/**
 * Test 5 — An unauthorized user cannot perform a restricted operation.
 *
 * Every case checks the status AND that nothing changed. A 403 that had already
 * written to the database would be the worst of both worlds.
 *
 * The split: SALES runs the sales desk (customers, enquiries, quotations,
 * conversion). Everything that MOVES STOCK — confirm, cancel, dispatch,
 * inventory adjustment — is ADMIN only.
 */
describe('Test 5: unauthorized user cannot perform a restricted operation', () => {
  let fx: Fixtures;
  let adminToken: string;
  let salesToken: string;
  let pendingOrderId: string;
  let confirmedOrderId: string;

  beforeAll(async () => {
    await resetDatabase();
    fx = await seedFixtures();
    adminToken = await loginAs(fx.admin.email);
    salesToken = await loginAs(fx.sales.email);

    const pending = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 10, unitPrice: 100 },
    ]);
    pendingOrderId = pending.order.id;

    const confirmed = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 10, unitPrice: 100 },
    ]);
    confirmedOrderId = confirmed.order.id;
    await api.post(`/api/sales-orders/${confirmedOrderId}/confirm`, {}, adminToken);
  });

  describe('with no token at all', () => {
    it('refuses to list enquiries', async () => {
      expect((await api.get('/api/enquiries')).status).toBe(401);
    });

    it('refuses to confirm a sales order', async () => {
      const res = await api.post(`/api/sales-orders/${pendingOrderId}/confirm`);
      expect(res.status).toBe(401);
    });

    it('refuses a malformed token', async () => {
      expect((await api.get('/api/auth/me', 'not.a.real.token')).status).toBe(401);
    });
  });

  describe('as a SALES user', () => {
    it('cannot confirm a sales order, and reserves nothing', async () => {
      const before = await stockOf(fx.productA.id);

      const res = await api.post(`/api/sales-orders/${pendingOrderId}/confirm`, {}, salesToken);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('SALES');
      expect(await stockOf(fx.productA.id)).toEqual(before);
    });

    it('cannot cancel a sales order, and releases nothing', async () => {
      const before = await stockOf(fx.productA.id);

      const res = await api.post(
        `/api/sales-orders/${confirmedOrderId}/cancel`,
        { reason: 'should not work' },
        salesToken,
      );

      expect(res.status).toBe(403);
      expect(await stockOf(fx.productA.id)).toEqual(before);
    });

    it('cannot dispatch, and moves no stock', async () => {
      const before = await stockOf(fx.productA.id);

      const res = await api.post(
        `/api/sales-orders/${confirmedOrderId}/dispatch`,
        {
          vehicleNumber: 'MH12AB1234',
          driverName: 'Test Driver',
          items: [{ productId: fx.productA.id, quantity: 10 }],
        },
        salesToken,
      );

      expect(res.status).toBe(403);
      expect(await stockOf(fx.productA.id)).toEqual(before);
    });

    it('cannot adjust inventory', async () => {
      const before = await stockOf(fx.productA.id);

      const res = await api.patch(
        `/api/inventory/${fx.productA.id}`,
        { delta: 500, reason: 'should not work' },
        salesToken,
      );

      expect(res.status).toBe(403);
      expect(await stockOf(fx.productA.id)).toEqual(before);
    });

    it('cannot create a product', async () => {
      const res = await api.post(
        '/api/products',
        {
          productCode: 'NOPE-1',
          name: 'Should not exist',
          category: 'Test',
          unit: 'NOS',
          basePrice: 10,
        },
        salesToken,
      );

      expect(res.status).toBe(403);
      expect((await api.get('/api/products?search=NOPE-1', adminToken)).body.data).toHaveLength(0);
    });

    it('cannot reach the admin-only demonstration route', async () => {
      expect((await api.get('/api/auth/admin-check', salesToken)).status).toBe(403);
    });

    it('CAN still do its own job', async () => {
      // The point is that the restriction is targeted, not a blanket denial.
      expect((await api.get('/api/enquiries', salesToken)).status).toBe(200);
      expect((await api.get('/api/quotations', salesToken)).status).toBe(200);
      expect((await api.get('/api/inventory', salesToken)).status).toBe(200);
      expect((await api.get('/api/sales-orders', salesToken)).status).toBe(200);
    });
  });

  describe('as an ADMIN user', () => {
    it('can do everything a SALES user can, plus the stock operations', async () => {
      expect((await api.get('/api/auth/admin-check', adminToken)).status).toBe(200);
      expect((await api.get('/api/enquiries', adminToken)).status).toBe(200);

      const res = await api.patch(
        `/api/inventory/${fx.productB.id}`,
        { delta: 5, reason: 'goods inward' },
        adminToken,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('a deactivated account', () => {
    it('is rejected immediately, without waiting for its token to expire', async () => {
      // The token is still cryptographically valid. authenticate() re-reads the
      // user on every request, so deactivation takes effect on the next call.
      const { prisma } = await import('../src/config/prisma');
      await prisma.user.update({ where: { id: fx.sales.id }, data: { isActive: false } });

      const res = await api.get('/api/enquiries', salesToken);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('deactivated');

      await prisma.user.update({ where: { id: fx.sales.id }, data: { isActive: true } });
    });
  });
});
