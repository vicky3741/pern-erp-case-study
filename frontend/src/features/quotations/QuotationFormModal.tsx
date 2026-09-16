import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Field, Modal, formatCurrency } from '@/components/ui';
import { enquiriesApi, quotationsApi } from '@/api/endpoints';
import { getApiErrorMessage, getApiFieldErrors } from '@/api/client';
import type { QuotationDetail } from '@/types/api';

interface LineDraft {
  productId: string;
  productName: string;
  productCode: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  gstPercent: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function inAMonthIso() {
  return new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Mirrors the server's formula for display only — the round-trip amount is
 * always the one the server computes. See pricing.ts on the backend.
 */
function previewLine(line: LineDraft) {
  const qty = Number(line.quantity) || 0;
  const price = Number(line.unitPrice) || 0;
  const disc = Number(line.discountPercent) || 0;
  const gst = Number(line.gstPercent) || 0;

  const base = qty * price;
  const discountAmount = (base * disc) / 100;
  const taxable = base - discountAmount;
  const gstAmount = (taxable * gst) / 100;
  return { base, discountAmount, taxable, gstAmount, lineAmount: taxable + gstAmount };
}

export function QuotationFormModal({
  open,
  onClose,
  initialEnquiryId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  initialEnquiryId?: string;
  onCreated?: (quotation: QuotationDetail) => void;
}) {
  const queryClient = useQueryClient();

  const [enquiryId, setEnquiryId] = useState('');
  const [validUntil, setValidUntil] = useState(inAMonthIso());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setEnquiryId(initialEnquiryId ?? '');
    setValidUntil(inAMonthIso());
    setLines([]);
    setFieldErrors({});
  }, [open, initialEnquiryId]);

  // Only enquiries that can still receive a quotation — the server enforces
  // this too, but there is no point offering a WON/LOST enquiry in the list.
  const { data: openEnquiries } = useQuery({
    queryKey: ['enquiries', 'open-for-quotation'],
    queryFn: () => enquiriesApi.list({ limit: 100 }),
    enabled: open && !initialEnquiryId,
    select: (res) => res.data.filter((e) => e.status === 'NEW' || e.status === 'QUOTED'),
  });

  const { data: selectedEnquiry } = useQuery({
    queryKey: ['enquiries', enquiryId],
    queryFn: () => enquiriesApi.getById(enquiryId),
    enabled: open && Boolean(enquiryId),
  });

  // Pre-fill one line per enquiry item, the first time that enquiry loads.
  useEffect(() => {
    if (!selectedEnquiry) return;
    setLines(
      selectedEnquiry.items.map((item) => ({
        productId: item.productId,
        productName: item.product.name,
        productCode: item.product.productCode,
        unit: item.product.unit,
        quantity: String(item.quantity),
        unitPrice: item.product.basePrice,
        discountPercent: '0',
        gstPercent: '18',
      })),
    );
  }, [selectedEnquiry]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  const totals = useMemo(() => {
    const priced = lines.map(previewLine);
    return {
      subTotal: priced.reduce((s, l) => s + l.base, 0),
      totalDiscount: priced.reduce((s, l) => s + l.discountAmount, 0),
      totalGst: priced.reduce((s, l) => s + l.gstAmount, 0),
      grandTotal: priced.reduce((s, l) => s + l.lineAmount, 0),
    };
  }, [lines]);

  const create = useMutation({
    mutationFn: quotationsApi.create,
    onSuccess: (quotation) => {
      toast.success(`Quotation ${quotation.quotationNumber} created`);
      queryClient.invalidateQueries({ queryKey: ['quotations'] });
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
      onCreated?.(quotation);
      onClose();
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Could not create the quotation'));
      const fields: Record<string, string> = {};
      getApiFieldErrors(err).forEach((f) => (fields[f.field] = f.message));
      setFieldErrors(fields);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) {
      toast.error('Select an enquiry with at least one product');
      return;
    }

    create.mutate({
      enquiryId,
      quotationDate: todayIso(),
      validUntil,
      items: lines.map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discountPercent: Number(l.discountPercent),
        gstPercent: Number(l.gstPercent),
      })),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New quotation"
      description="Priced against an enquiry. Totals are recalculated by the server."
      size="xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="quotation-form"
            className="btn-primary"
            disabled={create.isPending || lines.length === 0}
          >
            {create.isPending ? 'Creating…' : 'Create quotation'}
          </button>
        </>
      }
    >
      <form id="quotation-form" onSubmit={handleSubmit} className="space-y-4">
        {initialEnquiryId ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Quoting against <span className="font-medium">{selectedEnquiry?.enquiryNumber ?? '…'}</span>
            {selectedEnquiry && <span className="text-slate-500"> — {selectedEnquiry.customer.companyName}</span>}
          </div>
        ) : (
          <Field label="Enquiry" required error={fieldErrors.enquiryId}>
            <select
              className="input"
              required
              value={enquiryId}
              onChange={(e) => setEnquiryId(e.target.value)}
            >
              <option value="" disabled>
                Select an open enquiry…
              </option>
              {openEnquiries?.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.enquiryNumber} — {e.customer.companyName} ({e.status})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Valid until" required error={fieldErrors.validUntil}>
          <input
            type="date"
            className="input max-w-xs"
            required
            min={todayIso()}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>

        {lines.length > 0 && (
          <div>
            <p className="label">Products</p>
            <div className="table-wrap rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Unit price</th>
                    <th className="px-3 py-2">Disc %</th>
                    <th className="px-3 py-2">GST %</th>
                    <th className="px-3 py-2 text-right">Line amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((line, index) => {
                    const preview = previewLine(line);
                    return (
                      <tr key={line.productId}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">{line.productName}</div>
                          <div className="text-xs text-slate-400">{line.productCode}</div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="input w-20"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            className="input w-28"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(index, { unitPrice: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className="input w-20"
                            value={line.discountPercent}
                            onChange={(e) => updateLine(index, { discountPercent: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            className="input w-20"
                            value={line.gstPercent}
                            onChange={(e) => updateLine(index, { gstPercent: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatCurrency(preview.lineAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-2 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-slate-500">
                <span>Sub total</span>
                <span className="tabular-nums">{formatCurrency(totals.subTotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Discount</span>
                <span className="tabular-nums">− {formatCurrency(totals.totalDiscount)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>GST</span>
                <span className="tabular-nums">+ {formatCurrency(totals.totalGst)}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
                <span>Grand total</span>
                <span className="tabular-nums">{formatCurrency(totals.grandTotal)}</span>
              </div>
              <p className="pt-1 text-right text-xs text-slate-400">
                Preview only — the server recalculates every figure.
              </p>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
