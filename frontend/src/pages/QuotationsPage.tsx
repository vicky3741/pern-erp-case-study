import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, ArrowRightCircle, Plus, Send } from 'lucide-react';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  QuotationStatusBadge,
  SalesOrderStatusBadge,
  formatCurrency,
  formatDate,
} from '@/components/ui';
import { quotationsApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { QuotationFormModal } from '@/features/quotations/QuotationFormModal';
import { useAuth } from '@/context/AuthContext';
import type { QuotationStatus } from '@/types/api';

const STATUS_FILTERS: Array<QuotationStatus | 'ALL'> = [
  'ALL',
  'DRAFT',
  'SENT',
  'ACCEPTED',
  'REJECTED',
];

export function QuotationsPage() {
  const { id } = useParams();
  if (id) return <QuotationDetailView id={id} />;
  return <QuotationListView />;
}

// --------------------------------- list --------------------------------------

function QuotationListView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fromEnquiry = searchParams.get('fromEnquiry') ?? undefined;

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<QuotationStatus | 'ALL'>('ALL');
  const [formOpen, setFormOpen] = useState(Boolean(fromEnquiry));

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['quotations', { page, status }],
    queryFn: () => quotationsApi.list({ page, limit: 10, status: status === 'ALL' ? undefined : status }),
  });

  function closeForm() {
    setFormOpen(false);
    if (fromEnquiry) {
      searchParams.delete('fromEnquiry');
      setSearchParams(searchParams, { replace: true });
    }
  }

  return (
    <div>
      <PageHeader
        title="Quotations"
        subtitle="Price against an enquiry, then send it and record the customer's answer."
        actions={
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={16} /> New quotation
          </button>
        }
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
            title="No quotations yet"
            description="Create one against an open enquiry."
            action={
              <button className="btn-primary" onClick={() => setFormOpen(true)}>
                <Plus size={16} /> New quotation
              </button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Quotation #</th>
                    <th className="px-4 py-2.5">Enquiry</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Valid until</th>
                    <th className="px-4 py-2.5 text-right">Grand total</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Sales order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.data.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/quotations/${row.id}`)}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900">
                        {row.quotationNumber}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                        {row.enquiry.enquiryNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.customer.companyName}
                        <span className="ml-1 text-slate-400">· {row.customer.city}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(row.validUntil)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                        {formatCurrency(row.grandTotal)}
                      </td>
                      <td className="px-4 py-2.5">
                        <QuotationStatusBadge status={row.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {row.salesOrder ? (
                          <span className="text-slate-600">{row.salesOrder.orderNumber}</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
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

      <QuotationFormModal
        open={formOpen}
        onClose={closeForm}
        initialEnquiryId={fromEnquiry}
        onCreated={(quotation) => navigate(`/quotations/${quotation.id}`)}
      />
    </div>
  );
}

// -------------------------------- detail --------------------------------------

function QuotationDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const { data: quotation, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['quotations', id],
    queryFn: () => quotationsApi.getById(id),
  });

  const updateStatus = useMutation({
    mutationFn: (status: QuotationStatus) => quotationsApi.updateStatus(id, status),
    onSuccess: (updated) => {
      toast.success(`Quotation is now ${updated.status}`);
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update the status')),
  });

  const convert = useMutation({
    mutationFn: () => quotationsApi.convert(id),
    onSuccess: (order) => {
      toast.success(`Sales order ${order.orderNumber} created`);
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      navigate(`/sales-orders/${order.id}`);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not convert to a sales order')),
  });

  if (isLoading) return <PageLoader />;
  if (isError || !quotation) return <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} />;

  const canAct = can('ADMIN', 'SALES');

  return (
    <div>
      <button
        onClick={() => navigate('/quotations')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} /> Back to quotations
      </button>

      <PageHeader
        title={quotation.quotationNumber}
        subtitle={`${quotation.customer.companyName} · against ${quotation.enquiry.enquiryNumber}`}
        actions={
          <>
            {canAct && quotation.status === 'DRAFT' && (
              <button
                className="btn-secondary"
                onClick={() => updateStatus.mutate('SENT')}
                disabled={updateStatus.isPending}
              >
                <Send size={16} /> Mark sent
              </button>
            )}
            {canAct && quotation.status === 'SENT' && (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => updateStatus.mutate('REJECTED')}
                  disabled={updateStatus.isPending}
                >
                  Reject
                </button>
                <button
                  className="btn-primary"
                  onClick={() => updateStatus.mutate('ACCEPTED')}
                  disabled={updateStatus.isPending}
                >
                  Accept
                </button>
              </>
            )}
            {canAct && quotation.status === 'ACCEPTED' && !quotation.salesOrder && (
              <button className="btn-primary" onClick={() => convert.mutate()} disabled={convert.isPending}>
                <ArrowRightCircle size={16} />
                {convert.isPending ? 'Converting…' : 'Convert to sales order'}
              </button>
            )}
            {quotation.salesOrder && (
              <button
                className="btn-secondary"
                onClick={() => navigate(`/sales-orders/${quotation.salesOrder!.id}`)}
              >
                View sales order {quotation.salesOrder.orderNumber}
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-3 p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Products</h2>
            <QuotationStatusBadge status={quotation.status} />
          </div>
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Qty</th>
                  <th className="py-2 pr-3">Unit price</th>
                  <th className="py-2 pr-3">Disc %</th>
                  <th className="py-2 pr-3">GST %</th>
                  <th className="py-2 pr-3 text-right">Line amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotation.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-900">{item.product.name}</div>
                      <div className="text-xs text-slate-400">{item.product.productCode}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {item.quantity} {item.product.unit}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{formatCurrency(item.unitPrice)}</td>
                    <td className="py-2 pr-3 tabular-nums">{Number(item.discountPercent)}%</td>
                    <td className="py-2 pr-3 tabular-nums">{Number(item.gstPercent)}%</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(item.lineAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto max-w-xs space-y-1 border-t border-slate-200 pt-3 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Sub total</span>
              <span className="tabular-nums">{formatCurrency(quotation.subTotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Discount</span>
              <span className="tabular-nums">− {formatCurrency(quotation.totalDiscount)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>GST</span>
              <span className="tabular-nums">+ {formatCurrency(quotation.totalGst)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900">
              <span>Grand total</span>
              <span className="tabular-nums">{formatCurrency(quotation.grandTotal)}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
            <p className="text-slate-700">{quotation.customer.companyName}</p>
            <p className="text-slate-500">{quotation.customer.contactPerson}</p>
            <p className="text-slate-500">{quotation.customer.mobile}</p>
          </div>

          <div className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Dates</h2>
            <p className="flex justify-between text-slate-600">
              <span>Quotation date</span> <span>{formatDate(quotation.quotationDate)}</span>
            </p>
            <p className="flex justify-between text-slate-600">
              <span>Valid until</span> <span>{formatDate(quotation.validUntil)}</span>
            </p>
          </div>

          {quotation.salesOrder && (
            <div className="card space-y-2 p-4 text-sm">
              <h2 className="text-sm font-semibold text-slate-900">Sales order</h2>
              <button
                onClick={() => navigate(`/sales-orders/${quotation.salesOrder!.id}`)}
                className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
              >
                <span className="text-brand-700">{quotation.salesOrder.orderNumber}</span>
                <SalesOrderStatusBadge status={quotation.salesOrder.status} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
