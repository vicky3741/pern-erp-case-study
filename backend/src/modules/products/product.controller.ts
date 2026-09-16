import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok, paginated } from '../../utils/response';
import * as service from './product.service';

export const create = asyncHandler(async (req, res) => {
  const product = await service.createProduct(req.body);
  return created(res, product, `Product ${product.productCode} created`);
});

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listProducts(req.query as never);
  return paginated(res, rows, meta);
});

export const categories = asyncHandler(async (_req, res) => {
  return ok(res, await service.listCategories());
});

export const getById = asyncHandler(async (req, res) => {
  return ok(res, await service.getProductById(String(req.params.id)));
});

export const update = asyncHandler(async (req, res) => {
  const product = await service.updateProduct(String(req.params.id), req.body);
  return ok(res, product, 'Product updated');
});

export const deactivate = asyncHandler(async (req, res) => {
  const product = await service.deactivateProduct(String(req.params.id));
  return ok(res, product, `Product ${product.productCode} deactivated`);
});
