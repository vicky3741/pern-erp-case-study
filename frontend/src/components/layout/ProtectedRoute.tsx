import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/components/ui';
import { AppShell } from './AppShell';
import type { Role } from '@/types/api';

/**
 * Gates a route on authentication, and optionally on role.
 *
 * The role check here is a convenience — it hides a page the user cannot use
 * so they are not staring at 403 toasts. It changes nothing about security:
 * every write the UI can reach is re-checked by the server's own
 * authenticate/authorize middleware, which is what actually enforces access.
 */
export function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <PageLoader label="Checking your session…" />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/enquiries" replace />;
  }

  return <AppShell>{children}</AppShell>;
}
