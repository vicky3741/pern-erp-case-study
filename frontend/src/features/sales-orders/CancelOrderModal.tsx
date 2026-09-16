import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Field, Modal } from '@/components/ui';
import { salesOrdersApi } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';

export function CancelOrderModal({
  open,
  onClose,
  orderId,
  orderNumber,
  onCancelled,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  onCancelled?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const cancel = useMutation({
    mutationFn: () => salesOrdersApi.cancel(orderId, reason),
    onSuccess: () => {
      toast.success(`${orderNumber} cancelled; any reserved stock was released`);
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      setReason('');
      onCancelled?.();
      onClose();
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Could not cancel the order')),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cancel ${orderNumber}?`}
      description="If stock was reserved for this order, it is released back to available immediately."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Keep order
          </button>
          <button
            type="button"
            className="btn-danger"
            disabled={cancel.isPending || reason.trim().length < 3}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? 'Cancelling…' : 'Cancel order'}
          </button>
        </>
      }
    >
      <Field label="Reason" required hint="Shown in the order history">
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer requested cancellation"
        />
      </Field>
    </Modal>
  );
}
