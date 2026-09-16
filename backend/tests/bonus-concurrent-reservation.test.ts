import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedFixtures, setStock, stockOf, type Fixtures } from './helpers/db';
import { api, loginAs, makeSalesOrder } from './helpers/api';

/**
 * Bonus — simultaneous inventory reservations.
 *
 * This is the case the brief singles out as the "Important Backend Challenge":
 *
 *   Available inventory = 100
 *   User A -> reserve 80
 *   User B -> reserve 50
 *   Both reservations cannot succeed.
 *
 * The orders are prepared first, then the confirmations are fired together with
 * Promise.all so they genuinely overlap inside the database.
 *
 * What makes it work is SELECT ... FOR UPDATE inside the confirm transaction.
 * The second transaction blocks on the row lock at the SELECT, before it has
 * read anything, and resumes only after the first commits — at which point it
 * reads the new reserved figure and correctly fails its own check.
 */
describe('Bonus: simultaneous inventory reservations', () => {
  let fx: Fixtures;
  let adminToken: string;
  let salesToken: string;

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixtures();
    adminToken = await loginAs(fx.admin.email);
    salesToken = await loginAs(fx.sales.email);
  });

  it('lets exactly one of 80 and 50 succeed against 100 available', async () => {
    await setStock(fx.productA.id, 100, 0);

    const a = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 80, unitPrice: 100 },
    ]);
    const b = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 50, unitPrice: 100 },
    ]);

    const [resA, resB] = await Promise.all([
      api.post(`/api/sales-orders/${a.order.id}/confirm`, {}, adminToken),
      api.post(`/api/sales-orders/${b.order.id}/confirm`, {}, adminToken),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    // 80 + 50 = 130 would exceed the 100 in stock. Whichever won, the reserved
    // figure must be exactly its quantity.
    const stock = await stockOf(fx.productA.id);
    expect([80, 50]).toContain(stock.reservedQty);
    expect(stock.reservedQty).not.toBe(130);

    // Reservation never touches physical stock.
    expect(stock.physicalQty).toBe(100);
    expect(stock.availableQty).toBe(100 - stock.reservedQty);
  });

  it(
    'never lets reserved exceed physical across ten concurrent reservations',
    async () => {
      // 120 in stock, ten orders of 20 each. At most six can be satisfied.
      await setStock(fx.productA.id, 120, 0);

      // Building each order is five sequential round trips (enquiry, quotation,
      // two status changes, convert) against a managed database, so preparing
      // ten of them is the slow part; only the final confirm needs to race.
      const orders = [];
      for (let i = 0; i < 10; i += 1) {
        const built = await makeSalesOrder(salesToken, fx.customer.id, [
          { productId: fx.productA.id, quantity: 20, unitPrice: 10 },
        ]);
        orders.push(built.order);
      }

      const results = await Promise.all(
        orders.map((order) => api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken)),
      );

      const succeeded = results.filter((r) => r.status === 200).length;
      const refused = results.filter((r) => r.status === 409).length;

      expect(succeeded).toBe(6);
      expect(refused).toBe(4);

      const stock = await stockOf(fx.productA.id);
      expect(stock.reservedQty).toBe(120);
      expect(stock.availableQty).toBe(0);
      expect(stock.physicalQty).toBe(120);
    },
    180_000,
  );

  it('serialises reservations across two different products without deadlocking', async () => {
    // Two orders touching the same two products. Because lockInventoryRows
    // sorts the ids, both transactions take the locks in the same order, so
    // they queue instead of deadlocking.
    await setStock(fx.productA.id, 100, 0);
    await setStock(fx.productB.id, 100, 0);

    const a = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 60, unitPrice: 10 },
      { productId: fx.productB.id, quantity: 60, unitPrice: 10 },
    ]);
    const b = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productB.id, quantity: 60, unitPrice: 10 },
      { productId: fx.productA.id, quantity: 60, unitPrice: 10 },
    ]);

    const [resA, resB] = await Promise.all([
      api.post(`/api/sales-orders/${a.order.id}/confirm`, {}, adminToken),
      api.post(`/api/sales-orders/${b.order.id}/confirm`, {}, adminToken),
    ]);

    // One wins both lines; the other is refused. Neither is killed by a
    // deadlock, which would surface as a 500.
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);

    expect((await stockOf(fx.productA.id)).reservedQty).toBe(60);
    expect((await stockOf(fx.productB.id)).reservedQty).toBe(60);
  });

  it('keeps document numbers distinct under concurrent creation', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api.post(
          '/api/enquiries',
          {
            customerId: fx.customer.id,
            enquiryDate: new Date().toISOString().slice(0, 10),
            requiredDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
            items: [{ productId: fx.productA.id, quantity: 1 }],
          },
          salesToken,
        ),
      ),
    );

    const numbers = results.map((r) => r.body?.data?.enquiryNumber);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(new Set(numbers).size).toBe(8);
  });
});
