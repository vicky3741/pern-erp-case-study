import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { signAccessToken } from '../../utils/jwt';
import type { LoginInput } from './auth.schema';

/**
 * Compared against when the email does not exist.
 *
 * Without it, an unknown email would return immediately while a known one
 * would wait for bcrypt — a timing difference an attacker can measure to
 * enumerate valid accounts. Hashing a throwaway value at boot costs one
 * bcrypt round at startup and makes both paths take the same time.
 */
const DUMMY_HASH = bcrypt.hashSync('no-such-account-placeholder', env.BCRYPT_SALT_ROUNDS);

export async function login({ email, password }: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run the comparison, even when there is no user.
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // One message for both failure modes. Saying "no such user" would confirm
  // which addresses are registered.
  if (!user || !passwordMatches) {
    throw AppError.unauthorized('Invalid email or password');
  }

  if (!user.isActive) {
    throw AppError.forbidden('This account has been deactivated. Contact an administrator.');
  }

  return {
    token: signAccessToken(user.id, user.role),
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}
