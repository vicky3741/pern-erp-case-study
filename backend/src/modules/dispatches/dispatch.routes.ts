import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate } from '../../middleware/auth';
import { idParamSchema } from '../../utils/query';
import { listDispatchesQuerySchema } from './dispatch.schema';
import * as controller from './dispatch.controller';

/**
 * Read-only. Creating a dispatch happens at
 * POST /sales-orders/:id/dispatch, because a dispatch only ever exists against
 * an order and that is where the brief puts it.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listDispatchesQuerySchema }), controller.list);
router.get('/:id', validate({ params: idParamSchema }), controller.getById);

export default router;
