import { asyncHandler } from '../../utils/asyncHandler';
import { created, ok, paginated } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as service from './enquiry.service';

export const create = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  const enquiry = await service.createEnquiry(req.body, req.user.id);
  return created(res, enquiry, `Enquiry ${enquiry.enquiryNumber} created`);
});

export const list = asyncHandler(async (req, res) => {
  const { rows, meta } = await service.listEnquiries(req.query as never);
  return paginated(res, rows, meta);
});

export const getById = asyncHandler(async (req, res) => {
  const enquiry = await service.getEnquiryById(String(req.params.id));
  return ok(res, enquiry);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const enquiry = await service.updateEnquiryStatus(String(req.params.id), req.body.status);
  return ok(res, enquiry, `Enquiry ${enquiry.enquiryNumber} is now ${enquiry.status}`);
});
