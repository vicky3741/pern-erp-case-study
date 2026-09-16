import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok, paginated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as service from './dispatch.service';

/** Mounted at POST /sales-orders/:id/dispatch — the :id is the sales order. */
export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const dispatch = await service.createDispatch(String(req.params.id), req.body, req.user.id);
  return created(
    res,
    dispatch,
    `Dispatch ${dispatch.dispatchNumber} recorded against ${dispatch.salesOrder.orderNumber}`,
  );
});

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listDispatches(req.query as never);
  return paginated(res, rows, meta);
});

export const getById = asyncHandler(async (req, res) => {
  return ok(res, await service.getDispatchById(String(req.params.id)));
});
