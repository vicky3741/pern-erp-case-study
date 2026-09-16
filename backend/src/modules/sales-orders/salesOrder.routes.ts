import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { idParamSchema } from '../../utils/query';
import { cancelSalesOrderSchema, listSalesOrdersQuerySchema } from './salesOrder.schema';
import * as controller from './salesOrder.controller';
import { createDispatchSchema } from '../dispatches/dispatch.schema';
import * as dispatchController from '../dispatches/dispatch.controller';

/**
 * Reading is open to both roles — a sales user needs to see where an order got
 * to, and what stock is available against it.
 *
 * Everything that MOVES STOCK is ADMIN only: confirming (which reserves),
 * cancelling (which releases) and dispatching (added with the dispatch module).
 * That is the split the brief describes, and it is enforced here rather than in
 * the UI.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listSalesOrdersQuerySchema }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);

router.post(
  '/:id/confirm',
  authorize('ADMIN'),
  validate({ params: idParamSchema }),
  controller.confirm,
);

router.post(
  '/:id/cancel',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: cancelSalesOrderSchema }),
  controller.cancel,
);

/**
 * Dispatch is the only operation that reduces physical stock, so it is ADMIN
 * only like confirm and cancel. The handler belongs to the dispatch module.
 */
router.post(
  '/:id/dispatch',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: createDispatchSchema }),
  dispatchController.create,
);

export default router;
