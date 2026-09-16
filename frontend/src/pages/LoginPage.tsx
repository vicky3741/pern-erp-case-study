import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Factory, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getApiErrorMessage } from '@/api/client';

/**
 * The two seeded accounts, with one-click fill.
 *
 * These credentials only exist in a freshly seeded database (`npm run seed`)
 * and are documented in the README — showing them here saves fumbling a
 * password on camera while recording the demo.
 */
const DEMO_ACCOUNTS = [
  { label: 'Admin', email: 'admin@erp.local', password: 'Admin@123' },
  { label: 'Sales', email: 'sales@erp.local', password: 'Sales@123' },
] as const;

export function LoginPage() {
  const { user, login, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!authLoading && user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? '/enquiries';
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/enquiries', { replace: true });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not sign in'));
    } finally {
      setSubmitting(false);
    }
  }

  function fillDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Factory size={22} />
          </span>
          <h1 className="text-lg font-semibold text-slate-900">ERP — Sales &amp; Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enquiry → Quotation → Sales Order → Dispatch
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@erp.local"
            />
          </div>

          <div>
            <label htmlFor="password" className="label">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>

        <div className="mt-4 card p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            Demo accounts
          </p>
          <div className="flex gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemo(account)}
                className="btn-secondary flex-1 text-sm"
              >
                Fill as {account.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Requires the database to be seeded (<code>npm run seed</code>).
          </p>
        </div>
      </div>
    </div>
  );
}
