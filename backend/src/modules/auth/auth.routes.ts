import { Router } from 'express';
import { validate } from '../../middleware/validate';
import { authenticate, authorize } from '../../middleware/auth';
import { loginRateLimiter } from '../../middleware/rateLimit';
import { loginSchema } from './auth.schema';
import * as controller from './auth.controller';

/**
 * Authorisation is applied here, on the route, not inside the handlers and not
 * in React. `authorize(...)` runs after `authenticate`, so by the time a
 * handler executes the caller's role has already been verified against the
 * database — a stale or tampered token cannot get past it.
 */
const router = Router();

router.post('/login', loginRateLimiter, validate({ body: loginSchema }), controller.login);

router.get('/me', authenticate, controller.me);
router.post('/logout', authenticate, controller.logout);

// Demonstrates server-side RBAC: a valid SALES token is rejected with 403.
router.get('/admin-check', authenticate, authorize('ADMIN'), controller.adminCheck);

export default router;
