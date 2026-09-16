import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Field, Modal } from '@/components/ui';
import { customersApi, enquiriesApi, productsApi } from '@/api/endpoints';
import { getApiErrorMessage, getApiFieldErrors } from '@/api/client';
import type { EnquiryDetail } from '@/types/api';

interface LineDraft {
  productId: string;
  quantity: string;
  notes: string;
}

const emptyLine = (): LineDraft => ({ productId: '', quantity: '1', notes: '' });

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function EnquiryFormModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (enquiry: EnquiryDetail) => void;
}) {
  const queryClient = useQueryClient();

  const [customerId, setCustomerId] = useState('');
  const [enquiryDate, setEnquiryDate] = useState(todayIso());
  const [requiredDate, setRequiredDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setCustomerId('');
    setEnquiryDate(todayIso());
    setRequiredDate(todayIso());
    setNotes('');
    setLines([emptyLine()]);
    setFieldErrors({});
  }, [open]);

  // Small, fixed-size lookups — loaded whole rather than with per-keystroke
  // search, which keeps this form simple for the scale a demo actually needs.
  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: () => customersApi.list({ limit: 100 }),
    enabled: open,
  });
  const { data: products } = useQuery({
    queryKey: ['products', 'all'],
    queryFn: () => productsApi.list({ limit: 100 }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: enquiriesApi.create,
    onSuccess: (enquiry) => {
      toast.success(`Enquiry ${enquiry.enquiryNumber} created`);
      queryClient.invalidateQueries({ queryKey: ['enquiries'] });
      onCreated?.(enquiry);
      onClose();
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'Could not create the enquiry'));
      const fields: Record<string, string> = {};
      getApiFieldErrors(err).forEach((f) => (fields[f.field] = f.message));
      setFieldErrors(fields);
    },
  });

  const usedProductIds = new Set(lines.map((l) => l.productId).filter(Boolean));

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        ...(l.notes.trim() ? { notes: l.notes.trim() } : {}),
      }));

    if (items.length === 0) {
      toast.error('Add at least one product');
      return;
    }
    if (items.some((i) => !Number.isInteger(i.quantity) || i.quantity < 1)) {
      toast.error('Every quantity must be a whole number of at least 1');
      return;
    }

    create.mutate({
      customerId,
      enquiryDate,
      requiredDate,
      notes: notes.trim() || undefined,
      items,
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New enquiry"
      description="Record what a customer is asking about, and the products involved."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="enquiry-form" className="btn-primary" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create enquiry'}
          </button>
        </>
      }
    >
      <form id="enquiry-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Customer" required error={fieldErrors.customerId}>
          <select
            className="input"
            required
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {customers?.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName} — {c.city}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Enquiry date" required>
            <input
              type="date"
              className="input"
              required
              value={enquiryDate}
              onChange={(e) => setEnquiryDate(e.target.value)}
            />
          </Field>
          <Field label="Required date" required error={fieldErrors.requiredDate}>
            <input
              type="date"
              className="input"
              required
              min={enquiryDate}
              value={requiredDate}
              onChange={(e) => setRequiredDate(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">
              Products <span className="text-red-500">*</span>
            </span>
            <button type="button" onClick={addLine} className="btn-secondary px-2.5 py-1 text-xs">
              <Plus size={14} /> Add line
            </button>
          </div>

          <div className="space-y-2">
            {lines.map((line, index) => (
              <div key={index} className="flex items-start gap-2">
                <select
                  className="input"
                  required
                  value={line.productId}
                  onChange={(e) => updateLine(index, { productId: e.target.value })}
                >
                  <option value="" disabled>
                    Select a product…
                  </option>
                  {products?.data.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={usedProductIds.has(p.id) && p.id !== line.productId}
                    >
                      {p.productCode} — {p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  step={1}
                  required
                  className="input w-24"
                  placeholder="Qty"
                  value={line.quantity}
                  onChange={(e) => updateLine(index, { quantity: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeLine(index)}
                  disabled={lines.length === 1}
                  className="btn-secondary px-2 py-2 text-red-600 disabled:text-slate-300"
                  aria-label="Remove line"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {fieldErrors.items && <p className="mt-1 text-xs text-red-600">{fieldErrors.items}</p>}
        </div>

        <Field label="Notes" hint="Optional">
          <textarea
            className="input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}
