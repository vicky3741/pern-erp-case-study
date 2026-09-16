import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

const dispatchItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z
    .number({ invalid_type_error: 'quantity must be a number' })
    .int('quantity must be a whole number')
    .positive('quantity must be at least 1')
    .max(1_000_000, 'quantity looks unrealistic'),
});

export const createDispatchSchema = z
  .object({
    dispatchDate: z.coerce.date().optional(),
    vehicleNumber: z
      .string()
      .trim()
      .toUpperCase()
      .min(4, 'Vehicle number is required')
      .max(20)
      .regex(/^[A-Z0-9 -]+$/, 'Vehicle number may contain only letters, digits, spaces and hyphens'),
    driverName: z.string().trim().min(2, 'Driver name is required').max(80),
    items: z.array(dispatchItemSchema).min(1, 'A dispatch must contain at least one line'),
  })
  .refine((d) => new Set(d.items.map((i) => i.productId)).size === d.items.length, {
    message: 'The same product appears more than once. Merge the quantities into one line.',
    path: ['items'],
  });

export const listDispatchesQuerySchema = paginationSchema.extend({
  salesOrderId: z.string().optional(),
  /** Matches dispatch number, order number or customer company name. */
  search: z.string().trim().optional(),
});

export type CreateDispatchInput = z.infer<typeof createDispatchSchema>;
export type ListDispatchesQuery = z.infer<typeof listDispatchesQuerySchema>;
