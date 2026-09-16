import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { idParamSchema } from '../../utils/query';
import {
  createQuotationSchema,
  listQuotationsQuerySchema,
  updateQuotationStatusSchema,
} from './quotation.schema';
import * as controller from './quotation.controller';
import * as salesOrderController from '../sales-orders/salesOrder.controller';

const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listQuotationsQuerySchema }), controller.list);

router.post(
  '/',
  authorize('ADMIN', 'SALES'),
  validate({ body: createQuotationSchema }),
  controller.create,
);

router.get('/:id', validate({ params: idParamSchema }), controller.getById);

router.patch(
  '/:id/status',
  authorize('ADMIN', 'SALES'),
  validate({ params: idParamSchema, body: updateQuotationStatusSchema }),
  controller.updateStatus,
);

/**
 * Conversion lives on the quotation path because that is where the brief puts
 * it, and because the quotation is what the caller has in hand. The handler
 * itself belongs to the sales order module, which owns everything about orders.
 */
router.post(
  '/:id/convert',
  authorize('ADMIN', 'SALES'),
  validate({ params: idParamSchema }),
  salesOrderController.convert,
);

export default router;
