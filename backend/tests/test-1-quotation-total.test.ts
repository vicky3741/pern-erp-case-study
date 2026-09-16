import { beforeAll, describe, expect, it } from 'vitest';
import { calculateQuotationTotals, priceLine } from '../src/modules/quotations/pricing';
import { resetDatabase, seedFixtures, type Fixtures } from './helpers/db';
import { api, dates, loginAs } from './helpers/api';

/**
 * Test 1 — Quotation total is calculated correctly.
 *
 * Two halves: the arithmetic on its own, and the guarantee that the API uses
 * that arithmetic rather than anything the client sent.
 */
describe('Test 1: quotation total is calculated correctly', () => {
  describe('the pricing function', () => {
    it('matches the worked example from the brief', () => {
      // 100 units at 250.00, 10% discount, 18% GST
      const line = priceLine({
        quantity: 100,
        unitPrice: 250,
        discountPercent: 10,
        gstPercent: 18,
      });

      expect(line.baseAmount.toFixed(2)).toBe('25000.00');
      expect(line.discountAmount.toFixed(2)).toBe('2500.00');
      expect(line.taxableAmount.toFixed(2)).toBe('22500.00');
      expect(line.gstAmount.toFixed(2)).toBe('4050.00');
      expect(line.lineAmount.toFixed(2)).toBe('26550.00');
    });

    it('charges GST on the discounted amount, not the list price', () => {
      // Without the discount, 18% of 1000 would be 180. With a 50% discount the
      // taxable value is 500, so GST must be 90.
      const line = priceLine({ quantity: 10, unitPrice: 100, discountPercent: 50, gstPercent: 18 });

      expect(line.baseAmount.toFixed(2)).toBe('1000.00');
      expect(line.taxableAmount.toFixed(2)).toBe('500.00');
      expect(line.gstAmount.toFixed(2)).toBe('90.00');
      expect(line.lineAmount.toFixed(2)).toBe('590.00');
    });

    it('handles zero discount and zero GST', () => {
      const line = priceLine({ quantity: 7, unitPrice: '19.99' });

      expect(line.baseAmount.toFixed(2)).toBe('139.93');
      expect(line.discountAmount.toFixed(2)).toBe('0.00');
      expect(line.gstAmount.toFixed(2)).toBe('0.00');
      expect(line.lineAmount.toFixed(2)).toBe('139.93');
    });

    it('sums several lines into the header totals', () => {
      const totals = calculateQuotationTotals([
        { quantity: 100, unitPrice: 250, discountPercent: 10, gstPercent: 18 },
        { quantity: 40, unitPrice: 12500, discountPercent: 5, gstPercent: 18 },
      ]);

      expect(totals.subTotal.toFixed(2)).toBe('525000.00');
      expect(totals.totalDiscount.toFixed(2)).toBe('27500.00');
      expect(totals.totalGst.toFixed(2)).toBe('89550.00');
      expect(totals.grandTotal.toFixed(2)).toBe('587050.00');
    });

    it('keeps grandTotal exactly equal to subTotal - discount + GST', () => {
      // Prices chosen to produce repeating decimals, which is where floating
      // point would drift. 33.33 x 3 with 7.5% off and 12% GST is not round.
      const totals = calculateQuotationTotals([
        { quantity: 3, unitPrice: '33.33', discountPercent: '7.5', gstPercent: 12 },
        { quantity: 7, unitPrice: '0.10', discountPercent: '3.33', gstPercent: '5.5' },
        { quantity: 11, unitPrice: '999.99', discountPercent: '1.75', gstPercent: 18 },
      ]);

      const expected = totals.subTotal.minus(totals.totalDiscount).plus(totals.totalGst);
      expect(totals.grandTotal.toFixed(2)).toBe(expected.toFixed(2));
    });

    it('is exact where floating point is not', () => {
      // 0.1 + 0.2 !== 0.3 in IEEE-754. Three lines of 0.10 must total 0.30.
      const totals = calculateQuotationTotals([
        { quantity: 1, unitPrice: '0.10' },
        { quantity: 1, unitPrice: '0.10' },
        { quantity: 1, unitPrice: '0.10' },
      ]);

      expect(totals.grandTotal.toFixed(2)).toBe('0.30');
    });
  });

  describe('the API', () => {
    let fx: Fixtures;
    let salesToken: string;

    beforeAll(async () => {
      await resetDatabase();
      fx = await seedFixtures();
      salesToken = await loginAs(fx.sales.email);
    });

    it('stores the amounts it calculated, ignoring totals sent by the client', async () => {
      const enquiry = await api.post(
        '/api/enquiries',
        {
          customerId: fx.customer.id,
          enquiryDate: dates.today(),
          requiredDate: dates.inAMonth(),
          items: [{ productId: fx.productA.id, quantity: 100 }],
        },
        salesToken,
      );
      expect(enquiry.status).toBe(201);

      const res = await api.post(
        '/api/quotations',
        {
          enquiryId: enquiry.body.data.id,
          quotationDate: dates.today(),
          validUntil: dates.inAMonth(),
          // Deliberate lies. The schema does not declare these fields, Zod
          // strips unknown keys, and validate() replaces req.body with the
          // parsed result — so they never reach the service at all.
          subTotal: 1,
          totalDiscount: 0,
          totalGst: 0,
          grandTotal: 1,
          items: [
            {
              productId: fx.productA.id,
              quantity: 100,
              unitPrice: 250,
              discountPercent: 10,
              gstPercent: 18,
              lineAmount: 1,
            },
          ],
        },
        salesToken,
      );

      expect(res.status).toBe(201);
      expect(Number(res.body.data.grandTotal)).toBe(26550);
      expect(Number(res.body.data.subTotal)).toBe(25000);
      expect(Number(res.body.data.totalDiscount)).toBe(2500);
      expect(Number(res.body.data.totalGst)).toBe(4050);
      expect(Number(res.body.data.items[0].lineAmount)).toBe(26550);

      // The client's figures appear nowhere.
      expect(Number(res.body.data.grandTotal)).not.toBe(1);
      expect(Number(res.body.data.items[0].lineAmount)).not.toBe(1);
    });

    it('defaults unit price to the product base price when the client omits it', async () => {
      const enquiry = await api.post(
        '/api/enquiries',
        {
          customerId: fx.customer.id,
          enquiryDate: dates.today(),
          requiredDate: dates.inAMonth(),
          items: [{ productId: fx.productA.id, quantity: 4 }],
        },
        salesToken,
      );

      const res = await api.post(
        '/api/quotations',
        {
          enquiryId: enquiry.body.data.id,
          quotationDate: dates.today(),
          validUntil: dates.inAMonth(),
          items: [{ productId: fx.productA.id, quantity: 4 }],
        },
        salesToken,
      );

      expect(res.status).toBe(201);
      // TEST-A has a base price of 250.00, so 4 x 250 = 1000, no tax.
      expect(Number(res.body.data.items[0].unitPrice)).toBe(250);
      expect(Number(res.body.data.grandTotal)).toBe(1000);
    });

    it('rejects a discount above 100 percent', async () => {
      const enquiry = await api.post(
        '/api/enquiries',
        {
          customerId: fx.customer.id,
          enquiryDate: dates.today(),
          requiredDate: dates.inAMonth(),
          items: [{ productId: fx.productA.id, quantity: 1 }],
        },
        salesToken,
      );

      const res = await api.post(
        '/api/quotations',
        {
          enquiryId: enquiry.body.data.id,
          quotationDate: dates.today(),
          validUntil: dates.inAMonth(),
          items: [{ productId: fx.productA.id, quantity: 1, discountPercent: 150 }],
        },
        salesToken,
      );

      expect(res.status).toBe(400);
    });
  });
});
