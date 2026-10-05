import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useSectionFilter } from '../hooks/useSectionFilter.jsx';
import { formatDateTime } from '../lib/format.js';

/** Stage 3: orders the purchase staff has bought and confirmed — the section
 *  cross-verifies the delivery and marks received (on the order page).
 *  Shows every section when the filter is All, otherwise the filtered one. */
export default function ToReceivePage() {
  const navigate = useNavigate();
  const { filter } = useSectionFilter();
  const all = filter === 'all';
  const sid = Number(filter);

  const ordersQuery = useQuery({
    queryKey: ['orders', all ? 'all' : sid, 'sent'],
    queryFn: () => api(all ? '/orders?status=sent' : `/sections/${sid}/orders?status=sent`),
    enabled: all || sid > 0,
  });

  // Awaiting delivery = purchase confirmed, not yet received.
  const toReceive = (ordersQuery.data ?? []).filter((o) => o.purchasedAt);

  return (
    <main className="page">
      <h2 className="page-title">To Receive</h2>

      {ordersQuery.isLoading && <p className="placeholder">Loading…</p>}

      {toReceive.length === 0 && !ordersQuery.isLoading && (
        <div className="empty-state">
          Nothing to receive. Orders land here once purchasing confirms them with a bill.
        </div>
      )}

      {toReceive.map((order) => (
        <button
          key={order.id}
          className="order-card"
          onClick={() => navigate(`/orders/${order.id}`)}
        >
          <div className="order-card-top">
            <span className="order-card-date">
              {all && order.sectionName && (
                <span className="mini-chip" style={{ marginRight: 8 }}>{order.sectionName}</span>
              )}
              Order #{order.id}
            </span>
            <span className="status-chip status-sent">to receive</span>
          </div>
          <div className="order-card-meta">
            {order.lineCount} item{order.lineCount === 1 ? '' : 's'} · sent {formatDateTime(order.sentAt)}
            {order.purchasedAt && ` · bought ${formatDateTime(order.purchasedAt)}`}
          </div>
        </button>
      ))}
    </main>
  );
}
