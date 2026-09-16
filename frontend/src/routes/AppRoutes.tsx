import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/components/ui';

/**
 * Route table.
 *
 * The brief asks for exactly four screens, mounted here as each is built:
 *   /login         authentication
 *   /enquiries     create and view enquiries
 *   /quotations    create quotations, accept / reject
 *   /sales-orders  stock availability, confirm / reserve, dispatch
 */
export function AppRoutes() {
  const { isLoading } = useAuth();

  // Nothing should render until the stored token has been checked against the
  // API — otherwise a logged-in user briefly sees the login screen on reload.
  if (isLoading) return <PageLoader label="Starting up…" />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<ScaffoldNotice />} />
    </Routes>
  );
}

/** Placeholder shown until the real screens are built. */
function ScaffoldNotice() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <h1 className="text-xl font-semibold text-slate-900">ERP scaffold ready</h1>
      <p className="mt-2 text-sm text-slate-500">
        Enquiry → Quotation → Sales Order → Reservation → Dispatch
      </p>
    </div>
  );
}
