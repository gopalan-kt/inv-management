import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useToast } from '../components/Toast.jsx';
import { useOrderEditor } from '../hooks/useOrderEditor.js';
import ShoppingNotepad from '../components/ShoppingNotepad.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import { formatDateTime } from '../lib/format.js';

/** Purchase staff home. Two lists: what's waiting to be bought, and what's
 *  already bought-and-confirmed. Each card expands in place into the full
 *  shopping notepad — strike items, adjust quantities, confirm the purchase —
 *  no navigation needed. Changes reflect instantly in To Receive. */
export default function ShoppingPage() {
  const [view, setView] = useState('pending'); // 'pending' | 'purchased'
  const [expandedId, setExpandedId] = useState(null);

  const queueQuery = useQuery({
    queryKey: ['shopping', view],
    queryFn: () => api(`/orders/shopping${view === 'purchased' ? '?purchased=1' : ''}`),
  });

  return (
    <main className="page">
      <h2 className="page-title">Shopping Cart</h2>

      <div className="filter-chips">
        <button
          className={`section-pill${view === 'pending' ? ' active' : ''}`}
          onClick={() => setView('pending')}
        >
          To purchase
        </button>
        <button
          className={`section-pill${view === 'purchased' ? ' active' : ''}`}
          onClick={() => setView('purchased')}
        >
          Confirmed
        </button>
      </div>

      {queueQuery.isLoading && <p className="placeholder">Loading…</p>}
      {queueQuery.isError && <p className="placeholder">Failed to load: {queueQuery.error.message}</p>}

      {queueQuery.data?.length === 0 && (
        <div className="empty-state">
          {view === 'pending'
            ? 'Nothing to buy right now. Orders appear here as soon as a section sends one.'
            : 'No confirmed purchases yet.'}
        </div>
      )}

      {(queueQuery.data ?? []).map((order) => (
        <ShoppingCard
          key={order.id}
          order={order}
          view={view}
          expanded={expandedId === order.id}
          onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
          onCollapsed={() => setExpandedId(null)}
        />
      ))}
    </main>
  );
}

function ShoppingCard({ order, view, expanded, onToggle, onCollapsed }) {
  const done = order.lineCount > 0 && order.pickedCount === order.lineCount;
  const pct = order.lineCount > 0 ? Math.round((order.pickedCount / order.lineCount) * 100) : 0;

  return (
    <div className="order-card shopping-card">
      <button className="card-head" onClick={onToggle} aria-expanded={expanded}
        title={expanded ? 'Collapse' : 'Expand to shop this list'}>
        <div className="order-card-top">
          <span className="order-card-date">
            {order.sectionName}
            <span className="card-list-ref"> - Shopping List #{order.id}</span>
          </span>
          <span className="status-chip status-sent">
            {view === 'pending' ? 'shopping' : 'purchased'}
          </span>
        </div>
        <div className="order-card-meta">
          {view === 'pending'
            ? `sent ${formatDateTime(order.sentAt)} · ${order.pickedCount} of ${order.lineCount} picked`
            : `bought ${formatDateTime(order.purchasedAt)} · ${order.pickedCount} of ${order.lineCount} picked${order.billRef ? ` · bill ${order.billRef}` : ''}`}
        </div>
        {view === 'pending' && (
          <div className="pick-bar">
            <div
              className={`pick-bar-fill${done ? ' done' : ''}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </button>

      {expanded && <ExpandedShopping order={order} isPending={view === 'pending'} onDone={onCollapsed} />}
    </div>
  );
}

/** The expanded card: the same notepad as the order page, plus the bill field
 *  and Confirm Purchase. Everything persists — To Receive sees it instantly. */
function ExpandedShopping({ order, isPending, onDone }) {
  const queryClient = useQueryClient();
  const showToast = useToast();
  const [billRef, setBillRef] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const editor = useOrderEditor(order.id);
  const confirmMutation = useMutation({
    mutationFn: (bill) => api(`/orders/${order.id}/purchase`, { method: 'POST', body: { billRef: bill } }),
    onSuccess: () => {
      showToast('Purchase confirmed');
      setBillRef('');
      queryClient.invalidateQueries({ queryKey: ['shopping'] });
      queryClient.invalidateQueries({ queryKey: ['order', order.id] });
      onDone();
    },
    onError: (err) => showToast(err.message),
  });

  if (editor.isLoading) return <p className="placeholder" style={{ padding: '12px 0' }}>Loading list…</p>;
  if (editor.isError) return <p className="placeholder">Failed to load list: {editor.error.message}</p>;

  const current = editor.order;

  return (
    <div className="expanded-body">
      <ShoppingNotepad
        order={current}
        onTogglePicked={editor.togglePicked}
        onBumpQuantity={(line, delta) => editor.bumpQuantity(line, delta)}
      />

      {isPending && !current.purchasedAt && (
        <div className="detail-actions">
          <div className="form-row" style={{ marginBottom: 0 }}>
            <label>Bill / Receipt reference (optional)</label>
            <input
              type="text"
              value={billRef}
              placeholder="e.g. BILL-1042"
              onChange={(e) => setBillRef(e.target.value)}
            />
          </div>
          <button className="btn btn-primary" onClick={() => setConfirmOpen(true)}>
            Confirm Purchase
          </button>
        </div>
      )}

      {!isPending && (
        <div className="order-card-meta" style={{ fontWeight: 600 }}>
          {current.billRef ? `Bill / receipt: ${current.billRef}` : 'Confirmed — no bill reference recorded'}
        </div>
      )}

      {confirmOpen && (
        <ConfirmModal
          title="Confirm Purchase"
          message="Confirm this purchase? The list freezes for purchasing and the order moves to the section for receiving."
          confirmLabel="Confirm Purchase"
          onConfirm={() => { setConfirmOpen(false); confirmMutation.mutate(billRef.trim() || null); }}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}
