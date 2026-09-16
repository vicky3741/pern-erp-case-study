import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';

/**
 * Central API router.
 *
 * Feature routers are mounted here as each module is built:
 *   /auth          login and profile                        (done)
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
      endpoints: {
        auth: {
          'POST /api/auth/login': 'Exchange email and password for a JWT',
          'GET /api/auth/me': 'Profile of the authenticated user',
          'POST /api/auth/logout': 'Client-side token disposal',
          'GET /api/auth/admin-check': 'ADMIN-only route demonstrating server-side RBAC',
        },
      },
    },
  });
});

router.use('/auth', authRoutes);

export default router;
