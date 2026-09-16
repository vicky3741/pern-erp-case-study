import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { idParamSchema } from '../../utils/query';
import {
  createEnquirySchema,
  listEnquiriesQuerySchema,
  updateEnquiryStatusSchema,
} from './enquiry.schema';
import * as controller from './enquiry.controller';

/**
 * Creating enquiries is the sales user's job; an admin can do it too since an
 * admin can do anything a sales user can. Both roles may read.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listEnquiriesQuerySchema }), controller.list);

router.post(
  '/',
  authorize('ADMIN', 'SALES'),
  validate({ body: createEnquirySchema }),
  controller.create,
);

router.get('/:id', validate({ params: idParamSchema }), controller.getById);

router.patch(
  '/:id/status',
  authorize('ADMIN', 'SALES'),
  validate({ params: idParamSchema, body: updateEnquiryStatusSchema }),
  controller.updateStatus,
);

export default router;
