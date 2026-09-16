import { z } from 'zod';
import { paginationSchema } from '../../utils/query';

export const listInventoryQuerySchema = paginationSchema.extend({
  search: z.string().trim().optional(),
  category: z.string().trim().optional(),
  /** Only rows where available stock is at or below this number. */
  maxAvailable: z.coerce.number().int().optional(),
});

/**
 * An adjustment is either absolute ("set physical stock to 180") or relative
 * ("add 20", "remove 5"). Exactly one must be supplied — accepting both would
 * leave the outcome ambiguous.
 */
export const adjustInventorySchema = z
  .object({
    physicalQty: z.number().int().nonnegative().max(10_000_000).optional(),
    delta: z.number().int().max(10_000_000).min(-10_000_000).optional(),
    reason: z.string().trim().min(3, 'Give a short reason for the adjustment').max(200),
  })
  .refine((d) => (d.physicalQty === undefined) !== (d.delta === undefined), {
    message: 'Provide exactly one of physicalQty (absolute) or delta (relative)',
    path: ['physicalQty'],
  })
  .refine((d) => d.delta === undefined || d.delta !== 0, {
    message: 'delta must not be zero',
    path: ['delta'],
  });

export const productIdParamSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;
