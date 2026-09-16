import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/components/ui';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { LoginPage } from '@/pages/LoginPage';
import { EnquiriesPage } from '@/pages/EnquiriesPage';
import { QuotationsPage } from '@/pages/QuotationsPage';
import { SalesOrdersPage } from '@/pages/SalesOrdersPage';

/**
 * The four screens the brief asks for. Each list/detail pair shares one page
 * component — /enquiries and /enquiries/:id both render EnquiriesPage, which
 * reads the id (if any) from useParams to decide which view to show.
 */
export function AppRoutes() {
  const { isLoading } = useAuth();

  // Nothing should render until the stored token has been checked against the
  // API — otherwise a logged-in user briefly sees the login screen on reload.
  if (isLoading) return <PageLoader label="Starting up…" />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/enquiries" replace />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/enquiries"
        element={
          <ProtectedRoute>
            <EnquiriesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/enquiries/:id"
        element={
          <ProtectedRoute>
            <EnquiriesPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/quotations"
        element={
          <ProtectedRoute>
            <QuotationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/quotations/:id"
        element={
          <ProtectedRoute>
            <QuotationsPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/sales-orders"
        element={
          <ProtectedRoute>
            <SalesOrdersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-orders/:id"
        element={
          <ProtectedRoute>
            <SalesOrdersPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/enquiries" replace />} />
    </Routes>
  );
}
