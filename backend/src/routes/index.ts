import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes';
import customerRoutes from '../modules/customers/customer.routes';
import enquiryRoutes from '../modules/enquiries/enquiry.routes';
import productRoutes from '../modules/products/product.routes';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import quotationRoutes from '../modules/quotations/quotation.routes';

/**
 * Central API router.
 *
 * Feature routers are mounted here as each module is built:
 *   /auth          login and profile                        (done)
 *   /customers     customer master                           (done)
 *   /enquiries     customer enquiries and their line items   (done)
 *   /products      product master                            (done)
 *   /inventory     physical / reserved / available stock     (done)
 *   /quotations    pricing and status transitions            (done)
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
        customers: {
          'GET /api/customers': 'Paginated list with search and city filter',
          'POST /api/customers': 'Create a customer (ADMIN, SALES)',
          'GET /api/customers/:id': 'Customer detail with recent enquiries',
          'PATCH /api/customers/:id': 'Update a customer (ADMIN, SALES)',
        },
        enquiries: {
          'GET /api/enquiries': 'Paginated list with status, customer and search filters',
          'POST /api/enquiries': 'Create an enquiry with multiple product lines (ADMIN, SALES)',
          'GET /api/enquiries/:id': 'Enquiry detail with items and any quotations raised',
          'PATCH /api/enquiries/:id/status': 'NEW to QUOTED, WON or LOST (ADMIN, SALES)',
        },
        products: {
          'GET /api/products': 'Paginated list, each row with physical/reserved/available stock',
          'GET /api/products/categories': 'Distinct category list for filters',
          'POST /api/products': 'Create a product and its inventory row (ADMIN)',
          'GET /api/products/:id': 'Product detail with stock',
          'PATCH /api/products/:id': 'Update a product (ADMIN)',
          'DELETE /api/products/:id': 'Deactivate a product (ADMIN)',
        },
        inventory: {
          'GET /api/inventory': 'Stock for every product; available = physical - reserved',
          'GET /api/inventory/:productId': 'Stock for one product',
          'PATCH /api/inventory/:productId': 'Adjust physical stock, absolute or delta (ADMIN)',
        },
        quotations: {
          'GET /api/quotations': 'Paginated list with status, enquiry and customer filters',
          'POST /api/quotations':
            'Create against an enquiry. Every amount is calculated by the server (ADMIN, SALES)',
          'GET /api/quotations/:id': 'Quotation detail with priced line items',
          'PATCH /api/quotations/:id/status':
            'DRAFT to SENT, SENT to ACCEPTED or REJECTED (ADMIN, SALES)',
        },
      },
    },
  });
});

router.use('/auth', authRoutes);
router.use('/customers', customerRoutes);
router.use('/enquiries', enquiryRoutes);
router.use('/products', productRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/quotations', quotationRoutes);

export default router;
