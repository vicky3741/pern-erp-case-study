import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Field, Modal } from '@/components/ui';
import { salesOrdersApi, type CreateDispatchInput } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';
import type { SalesOrderDetail } from '@/types/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Every line defaults to its full remaining quantity, since a full dispatch is
 * the common case. Reducing any line below that is how a partial dispatch is
 * recorded — the backend tracks what is left for next time.
 */
export function DispatchFormModal({
  open,
  onClose,
  order,
  onDispatched,
}: {
  open: boolean;
  onClose: () => void;
  order: SalesOrderDetail;
  onDispatched?: () => void;
}) {
  const queryClient = useQueryClient();

  const [dispatchDate, setDispatchDate] = useState(todayIso());
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const dispatchableItems = order.items.filter((item) => item.remainingQty > 0);

  useEffect(() => {
    if (!open) return;
    setDispatchDate(todayIso());
    setVehicleNumber('');
    setDriverName('');
    setQuantities(
      Object.fromEntries(dispatchableItems.map((item) => [item.productId, String(item.remainingQty)])),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order.id]);

  const dispatch = useMutation({
    mutationFn: (vars: { id: string; input: CreateDispatchInput }) =>
      salesOrdersApi.dispatch(vars.id, vars.input),
    onSuccess: () => {
      toast.success('Dispatch recorded');
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      onDispatched?.();
      onClose();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not record the dispatch')),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const items = dispatchableItems
      .map((item) => ({ productId: item.productId, quantity: Number(quantities[item.productId] ?? 0) }))
      .filter((line) => line.quantity > 0);

    if (items.length === 0) {
      toast.error('Enter at least one quantity to dispatch');
      return;
    }

    for (const item of dispatchableItems) {
      const qty = Number(quantities[item.productId] ?? 0);
      if (qty > item.remainingQty) {
        toast.error(`${item.product.productCode}: only ${item.remainingQty} remain undispatched`);
        return;
      }
    }

    dispatch.mutate({
      id: order.id,
      input: { dispatchDate, vehicleNumber, driverName, items },
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Dispatch ${order.orderNumber}`}
      description="Physical stock and the reservation both fall by the quantity dispatched."
      size="lg"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="dispatch-form" className="btn-primary" disabled={dispatch.isPending}>
            {dispatch.isPending ? 'Dispatching…' : 'Confirm dispatch'}
          </button>
        </>
      }
    >
      <form id="dispatch-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="Dispatch date" required>
            <input
              type="date"
              className="input"
              required
              value={dispatchDate}
              onChange={(e) => setDispatchDate(e.target.value)}
            />
          </Field>
          <Field label="Vehicle number" required>
            <input
              type="text"
              className="input"
              required
              placeholder="MH12AB1234"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
            />
          </Field>
          <Field label="Driver name" required>
            <input
              type="text"
              className="input"
              required
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <p className="label">Quantity to dispatch</p>
          <div className="table-wrap rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Ordered</th>
                  <th className="px-3 py-2">Remaining</th>
                  <th className="px-3 py-2">Dispatch now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dispatchableItems.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{item.product.name}</div>
                      <div className="text-xs text-slate-400">{item.product.productCode}</div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{item.quantity}</td>
                    <td className="px-3 py-2 tabular-nums">{item.remainingQty}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={item.remainingQty}
                        step={1}
                        className="input w-24"
                        value={quantities[item.productId] ?? ''}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [item.productId]: e.target.value }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </form>
    </Modal>
  );
}
