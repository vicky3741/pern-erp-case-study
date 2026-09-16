import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok, paginated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as service from './customer.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const customer = await service.createCustomer(req.body, req.user.id);
  return created(res, customer, 'Customer created');
});

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listCustomers(req.query as never);
  return paginated(res, rows, meta);
});

export const getById = asyncHandler(async (req, res) => {
  const customer = await service.getCustomerById(String(req.params.id));
  return ok(res, customer);
});

export const update = asyncHandler(async (req, res) => {
  const customer = await service.updateCustomer(String(req.params.id), req.body);
  return ok(res, customer, 'Customer updated');
});
