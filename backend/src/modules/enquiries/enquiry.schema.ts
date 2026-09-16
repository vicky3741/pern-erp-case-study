import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

const enquiryItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be a whole number')
    .positive('quantity must be at least 1')
    .max(1_000_000, 'quantity looks unrealistic'),
  notes: z.string().trim().max(200).optional(),
});

export const createEnquirySchema = z
  .object({
    customerId: z.string().min(1, 'customerId is required'),
    enquiryDate: z.coerce.date({ invalid_type_error: 'enquiryDate must be a valid date' }),
    requiredDate: z.coerce.date({ invalid_type_error: 'requiredDate must be a valid date' }),
    notes: z.string().trim().max(500).optional(),
    items: z
      .array(enquiryItemSchema)
      .min(1, 'An enquiry must contain at least one product'),
  })
  .refine((d) => d.requiredDate >= d.enquiryDate, {
    message: 'Required date cannot be before the enquiry date',
    path: ['requiredDate'],
  })
  // The database has a unique index on (enquiryId, productId). Catching the
  // duplicate here produces a message that tells the user what to do about it,
  // rather than a bare constraint violation.
  .refine((d) => new Set(d.items.map((i) => i.productId)).size === d.items.length, {
    message: 'The same product appears more than once. Merge the quantities into one line.',
    path: ['items'],
  });

export const updateEnquiryStatusSchema = z.object({
  status: z.enum(['NEW', 'QUOTED', 'WON', 'LOST']),
});

export const listEnquiriesQuerySchema = paginationSchema.extend({
  status: z.enum(['NEW', 'QUOTED', 'WON', 'LOST']).optional(),
  customerId: z.string().optional(),
  /** Matches the enquiry number or the customer's company name. */
  search: z.string().trim().optional(),
});

export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>;
export type UpdateEnquiryStatusInput = z.infer<typeof updateEnquiryStatusSchema>;
export type ListEnquiriesQuery = z.infer<typeof listEnquiriesQuerySchema>;
