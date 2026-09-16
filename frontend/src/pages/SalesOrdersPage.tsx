import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, PackageCheck, ShieldCheck, Truck, XCircle } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  SalesOrderStatusBadge,
  formatCurrency,
  formatDate,
  formatDateTime,
} from '@/components/ui';
import { salesOrdersApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { useAuth } from '@/context/AuthContext';
import { DispatchFormModal } from '@/features/sales-orders/DispatchFormModal';
import { CancelOrderModal } from '@/features/sales-orders/CancelOrderModal';
import { cn } from '@/lib/cn';
import type { SalesOrderStatus } from '@/types/api';

const STATUS_FILTERS: Array<SalesOrderStatus | 'ALL'> = [
  'ALL',
  'PENDING',
  'CONFIRMED',
  'DISPATCHED',
  'CANCELLED',
];

export function SalesOrdersPage() {
  const { id } = useParams();
  if (id) return <SalesOrderDetailView id={id} />;
  return <SalesOrderListView />;
}

// --------------------------------- list --------------------------------------

function SalesOrderListView() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SalesOrderStatus | 'ALL'>('ALL');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-orders', { page, status }],
    queryFn: () =>
      salesOrdersApi.list({ page, limit: 10, status: status === 'ALL' ? undefined : status }),
  });

  return (
    <div>
      <PageHeader
        title="Sales orders"
        subtitle="Confirm to reserve stock, then dispatch what has been reserved."
      />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={
              status === s
                ? 'rounded-full bg-brand-600 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }
          >
            {s === 'ALL' ? 'All' : s}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} />
        ) : data && data.data.length === 0 ? (
          <EmptyState
            title="No sales orders yet"
            description="Convert an accepted quotation to create one."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Order #</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Quotation</th>
                    <th className="px-4 py-2.5">Order date</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.data.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/sales-orders/${row.id}`)}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900">
                        {row.orderNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.customer.companyName}
                        <span className="ml-1 text-slate-400">· {row.customer.city}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                        {row.quotation.quotationNumber}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(row.orderDate)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        {formatCurrency(row.totalAmount)}
                      </td>
                      <td className="px-4 py-2.5">
                        <SalesOrderStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data && (
              <Pagination
                page={data.meta.page}
                totalPages={data.meta.totalPages}
                total={data.meta.total}
                limit={data.meta.limit}
                onChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// -------------------------------- detail --------------------------------------

function SalesOrderDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: order, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['sales-orders', id],
    queryFn: () => salesOrdersApi.getById(id),
  });

  const confirm = useMutation({
    mutationFn: () => salesOrdersApi.confirm(id),
    onSuccess: () => {
      toast.success('Order confirmed; stock reserved');
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not confirm the order'), { duration: 8000 }),
  });

  if (isLoading) return <PageLoader />;
  if (isError || !order) return <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} />;

  const isAdmin = can('ADMIN');
  const canConfirm = isAdmin && order.status === 'PENDING';
  const canCancel = isAdmin && (order.status === 'PENDING' || order.status === 'CONFIRMED');
  const canDispatch = isAdmin && order.status === 'CONFIRMED';

  return (
    <div>
      <button
        onClick={() => navigate('/sales-orders')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} /> Back to sales orders
      </button>

      <PageHeader
        title={order.orderNumber}
        subtitle={`${order.customer.companyName} · from ${order.quotation.quotationNumber}`}
        actions={
          <>
            {canConfirm && (
              <button className="btn-primary" onClick={() => confirm.mutate()} disabled={confirm.isPending}>
                <ShieldCheck size={16} />
                {confirm.isPending ? 'Confirming…' : 'Confirm & reserve stock'}
              </button>
            )}
            {canDispatch && (
              <button className="btn-primary" onClick={() => setDispatchOpen(true)}>
                <Truck size={16} /> Dispatch
              </button>
            )}
            {canCancel && (
              <button className="btn-danger" onClick={() => setCancelOpen(true)}>
                <XCircle size={16} /> Cancel
              </button>
            )}
            {!isAdmin && (order.status === 'PENDING' || order.status === 'CONFIRMED') && (
              <span className="self-center text-xs text-slate-400">
                Confirming, cancelling and dispatching require an admin.
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-3 p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Stock &amp; dispatch</h2>
            <SalesOrderStatusBadge status={order.status} />
          </div>

          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3 text-right">Ordered</th>
                  <th className="py-2 pr-3 text-right">Dispatched</th>
                  <th className="py-2 pr-3 text-right">Physical</th>
                  <th className="py-2 pr-3 text-right">Reserved</th>
                  <th className="py-2 pr-3 text-right">Available</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item) => {
                  // Only meaningful before confirmation. Once CONFIRMED, this
                  // order's stock is already reserved — a low shelf-wide
                  // `available` figure at that point reflects demand from
                  // OTHER orders, not a shortfall in this one, so it must not
                  // be flagged as if this order were short.
                  const short = order.status === 'PENDING' && item.stock.availableQty < item.remainingQty;
                  return (
                    <tr key={item.id} className={cn(short && 'bg-red-50')}>
                      <td className="py-2 pr-3">
                        <div className="font-medium text-slate-900">{item.product.name}</div>
                        <div className="text-xs text-slate-400">{item.product.productCode}</div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {item.quantity} {item.product.unit}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{item.dispatchedQty}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{item.stock.physicalQty}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{item.stock.reservedQty}</td>
                      <td
                        className={cn(
                          'py-2 pr-3 text-right tabular-nums',
                          short && 'font-semibold text-red-600',
                        )}
                      >
                        {item.stock.availableQty}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between border-t border-slate-200 pt-3 text-sm font-semibold text-slate-900">
            <span>Order total</span>
            <span className="tabular-nums">{formatCurrency(order.totalAmount)}</span>
          </div>

          {order.dispatches.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <PackageCheck size={16} /> Dispatch history
              </h3>
              <ul className="space-y-1.5 text-sm">
                {order.dispatches.map((d) => (
                  <li key={d.id} className="flex justify-between text-slate-600">
                    <span>
                      {d.dispatchNumber} — {d.vehicleNumber} ({d.driverName})
                    </span>
                    <span className="text-slate-400">{formatDate(d.dispatchDate)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
            <p className="text-slate-700">{order.customer.companyName}</p>
            <p className="text-slate-500">{order.customer.contactPerson}</p>
            <p className="text-slate-500">{order.customer.mobile}</p>
          </div>

          <div className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Timeline</h2>
            <p className="flex justify-between text-slate-600">
              <span>Order date</span> <span>{formatDate(order.orderDate)}</span>
            </p>
            {order.confirmedAt && (
              <p className="flex justify-between text-slate-600">
                <span>Confirmed</span> <span>{formatDateTime(order.confirmedAt)}</span>
              </p>
            )}
            {order.confirmedBy && (
              <p className="flex justify-between text-slate-600">
                <span>Confirmed by</span> <span>{order.confirmedBy.name}</span>
              </p>
            )}
            {order.cancelledAt && (
              <>
                <p className="flex justify-between text-slate-600">
                  <span>Cancelled</span> <span>{formatDateTime(order.cancelledAt)}</span>
                </p>
                {order.cancelReason && (
                  <p className="text-xs text-slate-500">Reason: {order.cancelReason}</p>
                )}
              </>
            )}
          </div>

          <button
            onClick={() => navigate(`/quotations/${order.quotation.id}`)}
            className="card flex w-full items-center justify-between p-4 text-left text-sm hover:bg-slate-50"
          >
            <span>
              <span className="text-slate-400">Traced from</span>{' '}
              <span className="text-brand-700">{order.quotation.quotationNumber}</span>
            </span>
          </button>
        </div>
      </div>

      <DispatchFormModal
        open={dispatchOpen}
        onClose={() => setDispatchOpen(false)}
        order={order}
        onDispatched={() => setDispatchOpen(false)}
      />
      <CancelOrderModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        orderId={order.id}
        orderNumber={order.orderNumber}
      />
    </div>
  );
}
