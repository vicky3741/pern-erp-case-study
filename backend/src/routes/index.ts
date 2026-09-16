import { Router } from 'express';

/**
 * Central API router.
 *
 * Feature routers are mounted here as each module is built:
 *   /auth          login and profile
 *   /customers     customer master
 *   /enquiries     customer enquiries and their line items
 *   /products      product master
 *   /inventory     physical / reserved / available stock
 *   /quotations    quotations, server-side pricing, status transitions
 *   /sales-orders  conversion, inventory reservation, dispatch
 *   /dispatches    dispatch records
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'ERP Sales & Inventory API',
      version: '1.0.0',
      health: '/api/health',
      workflow: 'Enquiry → Quotation → Sales Order → Inventory Reservation → Dispatch',
      endpoints: {},
    },
  });
});

export default router;
