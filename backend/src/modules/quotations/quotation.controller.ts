import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok, paginated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as service from './quotation.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const quotation = await service.createQuotation(req.body, req.user.id);
  return created(
    res,
    quotation,
    `Quotation ${quotation.quotationNumber} created for ${quotation.grandTotal}`,
  );
});

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listQuotations(req.query as never);
  return paginated(res, rows, meta);
});

export const getById = asyncHandler(async (req, res) => {
  return ok(res, await service.getQuotationById(String(req.params.id)));
});

export const updateStatus = asyncHandler(async (req, res) => {
  const quotation = await service.updateQuotationStatus(String(req.params.id), req.body.status);
  return ok(res, quotation, `Quotation ${quotation.quotationNumber} is now ${quotation.status}`);
});
