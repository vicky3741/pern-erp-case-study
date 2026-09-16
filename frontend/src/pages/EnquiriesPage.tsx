import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, FileText, Plus } from 'lucide-react';
import {
  EmptyState,
  EnquiryStatusBadge,
  ErrorState,
  PageHeader,
  PageLoader,
  Pagination,
  QuotationStatusBadge,
  formatDate,
} from '@/components/ui';
import { enquiriesApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import { EnquiryFormModal } from '@/features/enquiries/EnquiryFormModal';
import type { EnquiryStatus } from '@/types/api';

const STATUS_FILTERS: Array<EnquiryStatus | 'ALL'> = ['ALL', 'NEW', 'QUOTED', 'WON', 'LOST'];

export function EnquiriesPage() {
  const { id } = useParams();

  if (id) return <EnquiryDetailView id={id} />;
  return <EnquiryListView />;
}

// --------------------------------- list --------------------------------------

function EnquiryListView() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EnquiryStatus | 'ALL'>('ALL');
  const [formOpen, setFormOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['enquiries', { page, status }],
    queryFn: () => enquiriesApi.list({ page, limit: 10, status: status === 'ALL' ? undefined : status }),
  });

  return (
    <div>
      <PageHeader
        title="Enquiries"
        subtitle="Create and track what customers are asking about."
        actions={
          <button className="btn-primary" onClick={() => setFormOpen(true)}>
            <Plus size={16} /> New enquiry
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
            title="No enquiries yet"
            description="Create the first one to start the workflow."
            action={
              <button className="btn-primary" onClick={() => setFormOpen(true)}>
                <Plus size={16} /> New enquiry
              </button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Enquiry #</th>
                    <th className="px-4 py-2.5">Customer</th>
                    <th className="px-4 py-2.5">Enquiry date</th>
                    <th className="px-4 py-2.5">Required date</th>
                    <th className="px-4 py-2.5">Items</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data?.data.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/enquiries/${row.id}`)}
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-900">
                        {row.enquiryNumber}
                      </td>
                      <td className="px-4 py-2.5">
                        {row.customer.companyName}
                        <span className="ml-1 text-slate-400">· {row.customer.city}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(row.enquiryDate)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">{formatDate(row.requiredDate)}</td>
                      <td className="px-4 py-2.5">{row._count.items}</td>
                      <td className="px-4 py-2.5">
                        <EnquiryStatusBadge status={row.status} />
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

      <EnquiryFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onCreated={(enquiry) => navigate(`/enquiries/${enquiry.id}`)}
      />
    </div>
  );
}

// -------------------------------- detail --------------------------------------

const ENQUIRY_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  NEW: ['QUOTED', 'LOST'],
  QUOTED: ['WON', 'LOST'],
  WON: [],
  LOST: [],
};

function EnquiryDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: enquiry, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['enquiries', id],
    queryFn: () => enquiriesApi.getById(id),
  });

  const updateStatus = useMutation({
    mutationFn: (status: EnquiryStatus) => enquiriesApi.updateStatus(id, status),
    onSuccess: (updated) => {
      toast.success(`Enquiry is now ${updated.status}`);
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not update the status')),
  });

  if (isLoading) return <PageLoader />;
  if (isError || !enquiry) return <ErrorState message={getApiErrorMessage(error)} onRetry={refetch} />;

  const allowed = ENQUIRY_TRANSITIONS[enquiry.status];

  return (
    <div>
      <button
        onClick={() => navigate('/enquiries')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"
      >
        <ArrowLeft size={16} /> Back to enquiries
      </button>

      <PageHeader
        title={enquiry.enquiryNumber}
        subtitle={`${enquiry.customer.companyName} · ${enquiry.customer.city}`}
        actions={
          <>
            {allowed.map((next) => (
              <button
                key={next}
                className={next === 'LOST' ? 'btn-secondary' : 'btn-primary'}
                onClick={() => {
                  if (next === 'LOST' && !window.confirm('Mark this enquiry LOST? This cannot be reversed.')) {
                    return;
                  }
                  updateStatus.mutate(next);
                }}
                disabled={updateStatus.isPending}
              >
                Mark {next}
              </button>
            ))}
            {enquiry.status !== 'LOST' && enquiry.status !== 'WON' && (
              <button
                className="btn-secondary"
                onClick={() =>
                  navigate(`/quotations?fromEnquiry=${enquiry.id}`, { state: { enquiry } })
                }
              >
                <FileText size={16} /> Create quotation
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card space-y-3 p-4 md:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Products</h2>
            <EnquiryStatusBadge status={enquiry.status} />
          </div>
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3">Quantity</th>
                  <th className="py-2 pr-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enquiry.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-900">{item.product.name}</div>
                      <div className="text-xs text-slate-400">{item.product.productCode}</div>
                    </td>
                    <td className="py-2 pr-3">
                      {item.quantity} {item.product.unit}
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{item.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {enquiry.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p>
              <p className="text-sm text-slate-700">{enquiry.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Customer</h2>
            <p className="text-slate-700">{enquiry.customer.companyName}</p>
            <p className="text-slate-500">{enquiry.customer.contactPerson}</p>
            <p className="text-slate-500">{enquiry.customer.mobile}</p>
            <p className="text-slate-500">{enquiry.customer.email}</p>
          </div>

          <div className="card space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Dates</h2>
            <p className="flex justify-between text-slate-600">
              <span>Enquiry</span> <span>{formatDate(enquiry.enquiryDate)}</span>
            </p>
            <p className="flex justify-between text-slate-600">
              <span>Required by</span> <span>{formatDate(enquiry.requiredDate)}</span>
            </p>
          </div>

          {enquiry.quotations.length > 0 && (
            <div className="card space-y-2 p-4 text-sm">
              <h2 className="text-sm font-semibold text-slate-900">Quotations</h2>
              {enquiry.quotations.map((q) => (
                <button
                  key={q.id}
                  onClick={() => navigate(`/quotations/${q.id}`)}
                  className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left hover:bg-slate-50"
                >
                  <span className="text-brand-700">{q.quotationNumber}</span>
                  <QuotationStatusBadge status={q.status} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
