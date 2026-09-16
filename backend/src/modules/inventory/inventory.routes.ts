import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import {
  adjustInventorySchema,
  listInventoryQuerySchema,
  productIdParamSchema,
} from './inventory.schema';
import * as controller from './inventory.controller';

/**
 * Sales users need to see stock to quote sensibly, so reading is open to both
 * roles. Changing physical stock is an admin operation.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listInventoryQuerySchema }), controller.list);

router.get(
  '/:productId',
  validate({ params: productIdParamSchema }),
  controller.getForProduct,
);

router.patch(
  '/:productId',
  authorize('ADMIN'),
  validate({ params: productIdParamSchema, body: adjustInventorySchema }),
  controller.adjust,
);

export default router;
