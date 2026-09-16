import { beforeEach, describe, expect, it } from 'vitest';
import { resetDatabase, seedFixtures, setStock, stockOf, type Fixtures } from './helpers/db';
import { api, loginAs, makeSalesOrder } from './helpers/api';

/**
 * Test 4 — Cannot reserve more than available inventory.
 *
 * Uses the worked example from the brief: physical 100, reserved 30, so
 * available is 70. An order for 80 must be refused; an order for 60 must
 * succeed and must leave physical stock alone.
 */
describe('Test 4: cannot reserve more than available inventory', () => {
  let fx: Fixtures;
  let adminToken: string;
  let salesToken: string;

  beforeEach(async () => {
    await resetDatabase();
    fx = await seedFixtures();
    adminToken = await loginAs(fx.admin.email);
    salesToken = await loginAs(fx.sales.email);

    // Physical 100, reserved 30 -> available 70. Set directly rather than by
    // confirming another order, so this test is about one thing only.
    await setStock(fx.productA.id, 100, 30);
  });

  it('refuses an order for 80 when only 70 is available', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 80, unitPrice: 100 },
    ]);

    const res = await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Insufficient stock');

    const shortfall = res.body.details.insufficientStock[0];
    expect(shortfall.productCode).toBe('TEST-A');
    expect(shortfall.required).toBe(80);
    expect(shortfall.available).toBe(70);
    expect(shortfall.shortBy).toBe(10);
  });

  it('reserves nothing when the confirmation is refused', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 80, unitPrice: 100 },
    ]);

    await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    // The transaction rolled back; the reservation is exactly as it was.
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 100,
      reservedQty: 30,
      availableQty: 70,
    });
  });

  it('leaves the order PENDING when the confirmation is refused', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 80, unitPrice: 100 },
    ]);

    await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    const after = await api.get(`/api/sales-orders/${order.id}`, adminToken);
    expect(after.body.data.status).toBe('PENDING');
  });

  it('confirms an order for 60 and raises reserved without touching physical', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 60, unitPrice: 100 },
    ]);

    const res = await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CONFIRMED');

    // The brief's example: 100 / 30 / 70 -> reserve 60 -> 100 / 90 / 10.
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 100,
      reservedQty: 90,
      availableQty: 10,
    });
  });

  it('refuses to confirm exactly one unit beyond what is available', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 71, unitPrice: 100 },
    ]);

    const res = await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);
    expect(res.status).toBe(409);
  });

  it('confirms an order for exactly the available quantity', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 70, unitPrice: 100 },
    ]);

    const res = await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    expect(res.status).toBe(200);
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 100,
      reservedQty: 100,
      availableQty: 0,
    });
  });

  it('reports every short line at once and reserves none of them', async () => {
    // TEST-A can cover this; TEST-B cannot. Neither may end up reserved.
    await setStock(fx.productB.id, 40, 0);

    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 50, unitPrice: 100 },
      { productId: fx.productB.id, quantity: 60, unitPrice: 100 },
    ]);

    const res = await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    expect(res.status).toBe(409);
    expect(res.body.details.insufficientStock).toHaveLength(1);
    expect(res.body.details.insufficientStock[0].productCode).toBe('TEST-B');

    // The line that could have been satisfied was not reserved either.
    expect((await stockOf(fx.productA.id)).reservedQty).toBe(30);
    expect((await stockOf(fx.productB.id)).reservedQty).toBe(0);
  });

  it('cannot confirm the same order twice, so stock is not reserved twice', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 20, unitPrice: 100 },
    ]);

    expect((await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken)).status).toBe(
      200,
    );
    expect((await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken)).status).toBe(
      409,
    );

    expect((await stockOf(fx.productA.id)).reservedQty).toBe(50);
  });

  it('releases the reservation when a confirmed order is cancelled', async () => {
    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 40, unitPrice: 100 },
    ]);

    await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);
    expect((await stockOf(fx.productA.id)).reservedQty).toBe(70);

    const res = await api.post(
      `/api/sales-orders/${order.id}/cancel`,
      { reason: 'customer withdrew' },
      adminToken,
    );

    expect(res.status).toBe(200);
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 100,
      reservedQty: 30,
      availableQty: 70,
    });
  });

  it('reduces physical and reserved together on dispatch', async () => {
    await setStock(fx.productA.id, 100, 0);

    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 60, unitPrice: 100 },
    ]);
    await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    // The brief's dispatch example: 100 / 60 / 40 -> dispatch 60 -> 40 / 0 / 40.
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 100,
      reservedQty: 60,
      availableQty: 40,
    });

    const res = await api.post(
      `/api/sales-orders/${order.id}/dispatch`,
      {
        vehicleNumber: 'MH12AB1234',
        driverName: 'Test Driver',
        items: [{ productId: fx.productA.id, quantity: 60 }],
      },
      adminToken,
    );

    expect(res.status).toBe(201);
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 40,
      reservedQty: 0,
      availableQty: 40,
    });
  });

  it('cannot dispatch the same quantity twice', async () => {
    await setStock(fx.productA.id, 100, 0);

    const { order } = await makeSalesOrder(salesToken, fx.customer.id, [
      { productId: fx.productA.id, quantity: 30, unitPrice: 100 },
    ]);
    await api.post(`/api/sales-orders/${order.id}/confirm`, {}, adminToken);

    const body = {
      vehicleNumber: 'MH12AB1234',
      driverName: 'Test Driver',
      items: [{ productId: fx.productA.id, quantity: 30 }],
    };

    expect((await api.post(`/api/sales-orders/${order.id}/dispatch`, body, adminToken)).status).toBe(
      201,
    );

    const second = await api.post(`/api/sales-orders/${order.id}/dispatch`, body, adminToken);
    expect(second.status).toBe(409);

    // Stock moved once, not twice.
    expect(await stockOf(fx.productA.id)).toEqual({
      physicalQty: 70,
      reservedQty: 0,
      availableQty: 70,
    });
  });
});
