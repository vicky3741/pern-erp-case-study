import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

/**
 * Mobile is the natural key for a customer in this business and carries a
 * UNIQUE constraint in the database, so the format is pinned down here rather
 * than left to whatever the caller sends.
 */
const mobileSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number');

export const createCustomerSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required').max(120),
  contactPerson: z.string().trim().min(2, 'Contact person is required').max(80),
  mobile: mobileSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  city: z.string().trim().min(2, 'City is required').max(60),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const listCustomersQuerySchema = paginationSchema.extend({
  /** Matches company name, contact person or mobile. */
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
