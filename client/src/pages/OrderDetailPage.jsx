import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { useOrderEditor } from '../hooks/useOrderEditor.js';
import ShoppingNotepad from '../components/ShoppingNotepad.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import MessagePreviewModal from '../components/MessagePreviewModal.jsx';
import { generateMessage } from '../lib/message.js';
import { groupByCategory } from '../lib/group.js';
import { formatDateTime } from '../lib/format.js';

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const id = Number(orderId);
  const queryClient = useQueryClient();
  const showToast = useToast();
  const navigate = useNavigate();
  const [preview, setPreview] = useState(null); // { title, text, primary? }
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, danger, run }
  const [billRef, setBillRef] = useState('');

  const editor = useOrderEditor(id);

  const invalidate = () => {
    ['orders', 'receivable', 'draft', 'shopping', 'inventory'].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    );
  };

  const sendMutation = useMutation({
    mutationFn: () => api(`/orders/${id}/send`, { method: 'POST' }),
    onSuccess: () => { showToast('Order sent'); invalidate(); },
    onError: (err) => showToast(err.message),
  });
  const receiveMutation = useMutation({
    mutationFn: () => api(`/orders/${id}/receive`, { method: 'POST' }),
    onSuccess: () => {
      // Received quantities were already known before the call — count them
      // from the order itself for the toast.
      const added = pickable.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
      showToast(`Marked received — ${added} item${added === 1 ? '' : 's'} added to Current Inventory`);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      // Back to the To Receive queue — continue verifying remaining deliveries.
      navigate('/to-receive');
    },
    onError: (err) => showToast(err.message),
  });
  const cancelMutation = useMutation({
    mutationFn: () => api(`/orders/${id}/cancel`, { method: 'POST' }),
    onSuccess: () => { showToast('Order cancelled'); invalidate(); },
    onError: (err) => showToast(err.message),
  });
  const purchaseConfirmMutation = useMutation({
    mutationFn: (bill) => api(`/orders/${id}/purchase`, { method: 'POST', body: { billRef: bill } }),
    onSuccess: () => { showToast('Purchase confirmed'); setBillRef(''); invalidate(); },
    onError: (err) => showToast(err.message),
  });

  if (editor.isLoading) return <p className="placeholder">Loading…</p>;
  if (editor.isError) return <p className="placeholder">Failed to load order: {editor.error.message}</p>;

  const order = editor.order;
  const sectionName = order.sectionName ?? 'Inventory';

  // Stage within the lifecycle. Both 'purchase' and 'receive' share the same
  // interactive notepad (strikes + need-quantity stepper) — purchase staff use
  // it while buying, the section re-uses it to cross-verify the delivery.
  const stage = order.status === 'sent' ? (order.purchasedAt ? 'receive' : 'purchase') : order.status;
  const shopping = stage === 'purchase' || stage === 'receive';

  const pickable = order.lines.filter((l) => l.quantity > 0 || l.needOnly);
  const picked = pickable.filter((l) => l.purchasedAt).length;
  const allPicked = pickable.length > 0 && picked === pickable.length;

  const orderText = generateMessage({ sectionName, mode: 'order', lines: order.lines.map(toMsgLine) });
  const receivedText = generateMessage({ sectionName, mode: 'received', lines: order.lines.map(toMsgLine) });

  return (
    <main className="page">
      <div className="order-card" style={{ cursor: 'default' }}>
        <div className="order-card-top">
          <span className="order-card-date">
            {stage === 'purchase' ? 'Shopping List' : stage === 'receive' ? 'To Receive' : 'Order'} #{order.id}
          </span>
          <span className="status-chip status-sent">
            {stage === 'purchase' ? 'shopping' : stage === 'receive' ? 'to receive' : order.status}
          </span>
        </div>
        <div className="order-card-meta">
          {order.sectionName} · created {formatDateTime(order.createdAt)}
          {order.sentAt && ` · sent ${formatDateTime(order.sentAt)}`}
          {order.purchasedAt && ` · bought ${formatDateTime(order.purchasedAt)}`}
          {order.receivedAt && ` · received ${formatDateTime(order.receivedAt)}`}
        </div>
        {stage === 'receive' && (
          <div className="order-card-meta" style={{ fontWeight: 600 }}>
            {order.billRef ? `Bill / receipt: ${order.billRef}` : 'Purchased — no bill reference recorded'}
          </div>
        )}
        {shopping && pickable.length > 0 && (
          <>
            <div className="order-card-meta" style={{ fontWeight: 600, color: allPicked ? '#1E7E45' : undefined }}>
              {allPicked ? 'All picked ✓' : `${picked} of ${pickable.length} picked`}
            </div>
            <div className="pick-bar">
              <div
                className={`pick-bar-fill${allPicked ? ' done' : ''}`}
                style={{ width: `${Math.round((picked / pickable.length) * 100)}%` }}
              />
            </div>
          </>
        )}
      </div>

      {stage !== 'receive' && (
        <ShoppingNotepad
          order={order}
          onTogglePicked={editor.togglePicked}
          onBumpQuantity={(line, delta) => editor.bumpQuantity(line, delta)}
        />
      )}

      {stage === 'receive' && (() => {
        // The comparison: what purchasing bought vs what was on the list.
        // Shortfalls live on the purchased line itself (the Short - N pill);
        // the Not Purchased list is only items that were never bought at all.
        const purchasedLines = order.lines.filter((l) => l.purchasedAt);
        const missingEntries = order.lines
          .filter((l) => !l.purchasedAt)
          .map((l) => ({ line: l, missingQty: l.orderedQuantity ?? 0 }));
        const purchasedGroups = groupByCategory(purchasedLines);
        const missingGroups = groupByCategory(missingEntries.map((e) => ({ ...e.line, _missingQty: e.missingQty })));
        return (
          <>
            <div className="detail-lines">
              <div className="detail-category receive-head ok">
                Purchased — {purchasedLines.length} of {order.lines.length} items
              </div>
              {purchasedGroups.map((g) => (
                <div key={g.name}>
                  <div className="detail-category sub">{g.name}</div>
                  {g.lines.map((line) => {
                    const missing = (line.orderedQuantity ?? line.quantity) - line.quantity;
                    return (
                      <div className="detail-line" key={line.itemId}>
                        <span style={{ textDecoration: line.noStock ? 'line-through' : 'none' }}>
                          {line.itemName}
                          {line.currentCount != null && (
                            <span className="order-card-meta"> (had {line.currentCount})</span>
                          )}
                        </span>
                        <span>
                          Received × {line.quantity}
                          {missing > 0 && (
                            <span className="mini-chip" style={{ marginLeft: 8, background: '#FDEBEA', color: '#B3261E' }}>
                              Short - {missing}
                            </span>
                          )}
                          {missing < 0 && (
                            <span className="mini-chip" style={{ marginLeft: 8, background: '#DCF8E7', color: '#1E7E45' }}>
                              Excess - {-missing}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {purchasedLines.length === 0 && (
                <div className="empty-state">Nothing was marked purchased.</div>
              )}
            </div>

            {missingEntries.length > 0 && (
              <div className="detail-lines">
                <div className="detail-category receive-head warn">
                  Not Purchased — {missingEntries.length} item{missingEntries.length === 1 ? '' : 's'} missing
                </div>
                {missingGroups.map((g) => (
                  <div key={g.name}>
                    <div className="detail-category sub">{g.name}</div>
                    {g.lines.map((line) => (
                      <div className="detail-line" key={line.itemId}>
                        <span style={{ textDecoration: line.noStock ? 'line-through' : 'none' }}>
                          {line.itemName}
                        </span>
                        <span>
                          {line._missingQty > 0 ? `Missing × ${line._missingQty}` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </>
        );
      })()}

      <div className="detail-actions">
        {stage === 'draft' && (
          <>
            <button className="btn btn-primary" onClick={() => setPreview({ title: 'Message Preview', text: orderText, send: true })}>
              Generate Message
            </button>
            <button className="btn btn-danger"
              onClick={() => setConfirm({ title: 'Cancel Order', message: 'Cancel this order? This cannot be undone.', confirmLabel: 'Cancel Order', danger: true, run: () => cancelMutation.mutate() })}>
              Cancel Order
            </button>
          </>
        )}
        {stage === 'purchase' && (
          <>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Bill / Receipt reference (optional)</label>
              <input
                type="text"
                value={billRef}
                placeholder="e.g. BILL-1042"
                onChange={(e) => setBillRef(e.target.value)}
              />
            </div>
            <button className="btn btn-primary"
              onClick={() => setConfirm({
                title: 'Confirm Purchase',
                message: 'Confirm this purchase? The list freezes and the order moves to the section for receiving.',
                confirmLabel: 'Confirm Purchase',
                run: () => purchaseConfirmMutation.mutate(billRef.trim() || null),
              })}>
              Confirm Purchase
            </button>
            <button className="btn btn-secondary" onClick={() => setPreview({ title: 'Share List', text: orderText })}>
              Share List
            </button>
            <button className="btn btn-danger"
              onClick={() => setConfirm({ title: 'Cancel Order', message: 'Cancel this order? This cannot be undone.', confirmLabel: 'Cancel Order', danger: true, run: () => cancelMutation.mutate() })}>
              Cancel Order
            </button>
          </>
        )}
        {stage === 'receive' && (
          <>
            <button className="btn btn-success"
              onClick={() => setConfirm({
                title: 'Mark Received',
                message: 'Mark this order as received? Received quantities will be added to Current Inventory.',
                confirmLabel: 'Mark Received',
                run: () => receiveMutation.mutate(),
              })}>
              Mark Received
            </button>
            <button className="btn btn-secondary" onClick={() => setPreview({ title: 'Received — Message Preview', text: receivedText })}>
              Generate Received Message
            </button>
            <button className="btn btn-danger"
              onClick={() => setConfirm({ title: 'Cancel Order', message: 'Cancel this order? This cannot be undone.', confirmLabel: 'Cancel Order', danger: true, run: () => cancelMutation.mutate() })}>
              Cancel Order
            </button>
          </>
        )}
        {(order.status === 'received' || order.status === 'cancelled') && (
          <button className="btn btn-secondary" onClick={() => setPreview({ title: 'Received — Message Preview', text: receivedText })}>
            Generate Received Message
          </button>
        )}
      </div>

      {preview && (
        <MessagePreviewModal
          title={preview.title}
          text={preview.text}
          onClose={() => setPreview(null)}
          primaryAction={preview.send ? {
            label: 'Send Order',
            onClick: async () => { await sendMutation.mutateAsync(); setPreview(null); },
          } : undefined}
        />
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={() => { setConfirm(null); confirm.run(); }}
          onClose={() => setConfirm(null)}
        />
      )}
    </main>
  );
}

function toMsgLine(line) {
  return {
    itemName: line.itemName,
    categoryName: line.categoryName,
    quantity: line.quantity,
    needOnly: !!line.needOnly,
    noStock: !!line.noStock,
  };
}
