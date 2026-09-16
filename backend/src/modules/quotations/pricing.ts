import { Prisma } from '@prisma/client';

/**
 * Quotation arithmetic.
 *
 * A pure function with no database access and no knowledge of Express, so the
 * tests can import it directly and assert on numbers rather than on HTTP
 * responses.
 *
 * ---------------------------------------------------------------------------
 * Why Decimal and not number
 * ---------------------------------------------------------------------------
 * IEEE-754 doubles cannot represent 0.1 exactly. In JavaScript,
 * 0.1 + 0.2 === 0.30000000000000004. Those errors accumulate across lines, and
 * a quotation that is a few paise out from the customer's own calculation is a
 * quotation that gets queried. Decimal is exact base-10 arithmetic.
 *
 * ---------------------------------------------------------------------------
 * Where rounding happens
 * ---------------------------------------------------------------------------
 * Each money component is rounded to 2 decimal places as it is produced, not
 * once at the end. That mirrors how a real invoice is printed: every line shows
 * a rounded figure, and the total is the sum of the figures the customer can
 * see. Rounding only the grand total would produce a document whose lines do
 * not add up to its own total.
 *
 * Because every component is already exact to 2dp, the header totals satisfy
 *
 *     grandTotal === subTotal - totalDiscount + totalGst
 *
 * exactly, with no residual. The test suite asserts this.
 */

const D = Prisma.Decimal;
type Dec = Prisma.Decimal;

/** Anything the API or the database might hand us for a money value. */
export type MoneyLike = Dec | string | number;

/** Rounds to paise, half away from zero — the convention on Indian invoices. */
function money(value: Dec): Dec {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export interface PricingLineInput {
  quantity: number;
  unitPrice: MoneyLike;
  discountPercent?: MoneyLike;
  gstPercent?: MoneyLike;
}

export interface PricedLine {
  quantity: number;
  unitPrice: Dec;
  discountPercent: Dec;
  gstPercent: Dec;
  /** quantity x unitPrice, before any discount or tax. */
  baseAmount: Dec;
  discountAmount: Dec;
  /** baseAmount - discountAmount. The figure GST is charged on. */
  taxableAmount: Dec;
  gstAmount: Dec;
  /** taxableAmount + gstAmount. What this line contributes to the total. */
  lineAmount: Dec;
}

export interface QuotationTotals {
  lines: PricedLine[];
  subTotal: Dec;
  totalDiscount: Dec;
  totalGst: Dec;
  grandTotal: Dec;
}

/**
 * Prices one line.
 *
 *   base     = quantity x unitPrice
 *   discount = base x discountPercent / 100
 *   taxable  = base - discount
 *   gst      = taxable x gstPercent / 100
 *   line     = taxable + gst
 *
 * Note that GST is charged on the discounted amount, not on the list price —
 * the discount is a reduction in the sale value, so the tax follows it down.
 */
export function priceLine(item: PricingLineInput): PricedLine {
  const unitPrice = new D(item.unitPrice);
  const discountPercent = new D(item.discountPercent ?? 0);
  const gstPercent = new D(item.gstPercent ?? 0);

  const baseAmount = money(unitPrice.mul(item.quantity));
  const discountAmount = money(baseAmount.mul(discountPercent).div(100));
  const taxableAmount = baseAmount.minus(discountAmount);
  const gstAmount = money(taxableAmount.mul(gstPercent).div(100));
  const lineAmount = taxableAmount.plus(gstAmount);

  return {
    quantity: item.quantity,
    unitPrice,
    discountPercent,
    gstPercent,
    baseAmount,
    discountAmount,
    taxableAmount,
    gstAmount,
    lineAmount,
  };
}

/**
 * Prices every line and sums the header totals.
 *
 * This is the only place a quotation total is ever produced. Nothing a client
 * sends is consulted — see quotation.service.ts.
 */
export function calculateQuotationTotals(items: PricingLineInput[]): QuotationTotals {
  if (items.length === 0) {
    throw new Error('calculateQuotationTotals requires at least one line');
  }

  const lines = items.map(priceLine);

  const sum = (pick: (line: PricedLine) => Dec): Dec =>
    lines.reduce((acc, line) => acc.plus(pick(line)), new D(0));

  return {
    lines,
    subTotal: sum((l) => l.baseAmount),
    totalDiscount: sum((l) => l.discountAmount),
    totalGst: sum((l) => l.gstAmount),
    grandTotal: sum((l) => l.lineAmount),
  };
}
