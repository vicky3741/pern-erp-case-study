import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

/**
 * Note what is NOT accepted here: lineAmount, subTotal, totalDiscount,
 * totalGst, grandTotal.
 *
 * Zod objects strip unknown keys by default, and the validate() middleware
 * REPLACES req.body with the parsed result. So if a client posts a grandTotal,
 * it is discarded before any application code can see it — the service could
 * not trust a client total even by accident. The brief is explicit about this:
 * the final amount must be calculated by the backend.
 */
const quotationItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be a whole number')
    .positive('quantity must be at least 1')
    .max(1_000_000, 'quantity looks unrealistic'),
  /** Optional — defaults to the product's base price if omitted. */
  unitPrice: z.number().nonnegative('unitPrice cannot be negative').max(99_999_999).optional(),
  discountPercent: z
    .number()
    .min(0, 'discountPercent cannot be negative')
    .max(100, 'discountPercent cannot exceed 100')
    .default(0),
  gstPercent: z
    .number()
    .min(0, 'gstPercent cannot be negative')
    .max(100, 'gstPercent cannot exceed 100')
    .default(0),
});

export const createQuotationSchema = z
  .object({
    enquiryId: z.string().min(1, 'enquiryId is required'),
    /** Defaults to today when omitted. */
    quotationDate: z.coerce.date().optional(),
    validUntil: z.coerce.date({ invalid_type_error: 'validUntil must be a valid date' }),
    items: z.array(quotationItemSchema).min(1, 'A quotation must contain at least one line'),
  })
  .refine((d) => d.validUntil >= (d.quotationDate ?? new Date(new Date().toDateString())), {
    message: 'validUntil cannot be before the quotation date',
    path: ['validUntil'],
  })
  .refine((d) => new Set(d.items.map((i) => i.productId)).size === d.items.length, {
    message: 'The same product appears more than once. Merge the quantities into one line.',
    path: ['items'],
  });

export const updateQuotationStatusSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']),
});

export const listQuotationsQuerySchema = paginationSchema.extend({
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED']).optional(),
  enquiryId: z.string().optional(),
  customerId: z.string().optional(),
  /** Matches quotation number, enquiry number or customer company name. */
  search: z.string().trim().optional(),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;
export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;
