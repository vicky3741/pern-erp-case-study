import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import * as authService from './auth.service';

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, 'Signed in successfully');
});

/** Profile of the caller, resolved from the token by `authenticate`. */
export const me = asyncHandler(async (req, res) => {
  if (!req.user) throw AppError.unauthorized();
  return ok(res, req.user);
});

/**
 * JWTs are stateless — nothing server-side needs to change for a logout, and
 * there is no session to destroy. The endpoint exists so the client has a
 * single obvious thing to call; discarding the token is what actually ends the
 * session.
 */
export const logout = asyncHandler(async (_req, res) => {
  return ok(res, { loggedOut: true }, 'Discard the token on the client to complete sign-out');
});

/**
 * Exists purely to demonstrate that role checks are enforced by the server.
 * A SALES token gets 403 here no matter what the frontend does.
 */
export const adminCheck = asyncHandler(async (req, res) => {
  return ok(res, {
    message: 'You are authenticated as an ADMIN',
    user: req.user,
  });
});
