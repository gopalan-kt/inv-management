import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';

/**
 * One order's detail data plus the purchase-staff edits (strike-off and
 * quantity adjustments), with optimistic updates. Shared by the Shopping Cart
 * cards and the order detail page — same list, struck by whoever's working it.
 */
export function useOrderEditor(id, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const showToast = useToast();

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => api(`/orders/${id}`),
    enabled: enabled && id != null,
  });

  const applyLine = (itemId, patch) => {
    queryClient.setQueryData(['order', id], (old) => {
      if (!old) return old;
      return { ...old, lines: old.lines.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)) };
    });
  };

  const purchaseMutation = useMutation({
    mutationFn: ({ itemId, purchased }) =>
      api(`/orders/${id}/lines/${itemId}/purchase`, { method: 'POST', body: { purchased } }),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', id], data);
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
    onError: (err) => {
      showToast(err.message);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
    },
  });

  const quantityMutation = useMutation({
    mutationFn: ({ itemId, quantity }) =>
      api(`/orders/${id}/lines/${itemId}/quantity`, { method: 'POST', body: { quantity } }),
    onSuccess: (data) => queryClient.setQueryData(['order', id], data),
    onError: (err) => {
      showToast(err.message);
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
  });

  const togglePicked = (line) => {
    const picked = !line.purchasedAt;
    applyLine(line.itemId, { purchasedAt: picked ? new Date().toISOString() : null });
    purchaseMutation.mutate({ itemId: line.itemId, purchased: picked });
  };

  const bumpQuantity = (line, delta) => {
    const next = Math.max(0, Math.min(999, (line.quantity ?? 0) + delta));
    if (next === line.quantity) return;
    applyLine(line.itemId, { quantity: next });
    quantityMutation.mutate({ itemId: line.itemId, quantity: next });
  };

  return {
    order: orderQuery.data,
    isLoading: orderQuery.isLoading,
    isError: orderQuery.isError,
    error: orderQuery.error,
    togglePicked,
    bumpQuantity,
  };
}
