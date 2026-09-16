import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

export const listSalesOrdersQuerySchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'DISPATCHED', 'CANCELLED']).optional(),
  customerId: z.string().optional(),
  /** Matches order number, quotation number or customer company name. */
  search: z.string().trim().optional(),
});

export const cancelSalesOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Give a short reason for cancelling').max(200),
});

export type ListSalesOrdersQuery = z.infer<typeof listSalesOrdersQuerySchema>;
export type CancelSalesOrderInput = z.infer<typeof cancelSalesOrderSchema>;
