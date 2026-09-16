import { asyncHandler } from '../../utils/asyncHandler';
import { ok, paginated } from '../../utils/response';
import * as service from './inventory.service';

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listInventory(req.query as never);
  return paginated(res, rows, meta);
});

export const getForProduct = asyncHandler(async (req, res) => {
  return ok(res, await service.getInventoryForProduct(String(req.params.productId)));
});

export const adjust = asyncHandler(async (req, res) => {
  const inventory = await service.adjustInventory(String(req.params.productId), req.body);
  return ok(
    res,
    inventory,
    `${inventory.productCode}: physical ${inventory.physicalQty}, reserved ${inventory.reservedQty}, available ${inventory.availableQty}`,
  );
});
