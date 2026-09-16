import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

export const createProductSchema = z.object({
  productCode: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'Product code is required')
    .max(30)
    .regex(/^[A-Z0-9-]+$/, 'Product code may contain only letters, digits and hyphens'),
  name: z.string().trim().min(2, 'Product name is required').max(150),
  category: z.string().trim().min(2, 'Category is required').max(60),
  unit: z.string().trim().toUpperCase().min(1, 'Unit is required').max(10),
  basePrice: z
    .number({ invalid_type_error: 'basePrice must be a number' })
    .nonnegative('basePrice cannot be negative')
    .max(99_999_999, 'basePrice exceeds the column precision'),
  /** Opening stock. The inventory row is created alongside the product. */
  openingQty: z.number().int().nonnegative().max(10_000_000).default(0),
});

export const updateProductSchema = createProductSchema
  .omit({ productCode: true, openingQty: true })
  .partial();

export const listProductsQuerySchema = paginationSchema.extend({
  /** Matches product code or name. */
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  /** Only products with available stock at or below this number. */
  maxAvailable: z.coerce.number().int().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
