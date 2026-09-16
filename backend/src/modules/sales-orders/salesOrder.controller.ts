import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok, paginated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as service from './salesOrder.service';

/** Mounted at POST /quotations/:id/convert — the :id is the quotation. */
export const convert = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const order = await service.convertQuotation(String(req.params.id), req.user.id);
  return created(res, order, `Sales order ${order.orderNumber} created`);
});

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listSalesOrders(req.query as never);
  return paginated(res, rows, meta);
});

export const getById = asyncHandler(async (req, res) => {
  return ok(res, await service.getSalesOrderById(String(req.params.id)));
});

export const confirm = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const order = await service.confirmSalesOrder(String(req.params.id), req.user.id);
  return ok(res, order, `Sales order ${order.orderNumber} confirmed and stock reserved`);
});

export const cancel = asyncHandler(async (req, res) => {
  const order = await service.cancelSalesOrder(String(req.params.id), req.body.reason);
  return ok(res, order, `Sales order ${order.orderNumber} cancelled and reserved stock released`);
});
