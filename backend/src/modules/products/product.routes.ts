import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { idParamSchema } from '../../utils/query';
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from './product.schema';
import * as controller from './product.controller';

/**
 * Both roles read the product master — a sales user needs prices and stock to
 * build a quotation. Only an admin may change it.
 */
const router = Router();

router.use(authenticate);

router.get('/', validate({ query: listProductsQuerySchema }), controller.list);
router.get('/categories', controller.categories);

router.post('/', authorize('ADMIN'), validate({ body: createProductSchema }), controller.create);

// Declared after /categories so that literal path is not swallowed by :id.
router.get('/:id', validate({ params: idParamSchema }), controller.getById);

router.patch(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParamSchema, body: updateProductSchema }),
  controller.update,
);

router.delete(
  '/:id',
  authorize('ADMIN'),
  validate({ params: idParamSchema }),
  controller.deactivate,
);

export default router;
