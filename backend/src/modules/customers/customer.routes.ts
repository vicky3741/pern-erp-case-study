import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { idParamSchema } from '../../utils/query';
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from './customer.schema';
import * as controller from './customer.controller';

/**
 * Both roles manage customers — a sales user creating an enquiry needs to be
 * able to add the customer it is for.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listCustomersQuerySchema }), controller.list);

router.post(
  '/',
  authorize('ADMIN', 'SALES'),
  validate({ body: createCustomerSchema }),
  controller.create,
);

router.get('/:id', validate({ params: idParamSchema }), controller.getById);

router.patch(
  '/:id',
  authorize('ADMIN', 'SALES'),
  validate({ params: idParamSchema, body: updateCustomerSchema }),
  controller.update,
);

export default router;
