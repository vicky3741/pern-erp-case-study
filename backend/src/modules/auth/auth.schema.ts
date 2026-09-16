import { z } from 'zod';

/**
 * Email is lower-cased and trimmed before it reaches the service, so
 * "  Admin@ERP.local " matches the stored "admin@erp.local".
 *
 * The password is only checked for presence here. Length and complexity rules
 * belong on the endpoint that sets a password, not on the one that verifies it
 * — rejecting a short password at login would tell an attacker that no account
 * could have that password.
 */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
